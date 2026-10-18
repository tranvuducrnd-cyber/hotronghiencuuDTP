// Tra danh sách thuốc đã cấp số đăng ký (SĐK) từ cổng "Công bố thuốc" của Cục Quản lý Dược
// (https://dichvucong.dav.gov.vn/congbothuoc/index) — dùng cho mục I.1 của báo cáo khả thi.
//
// Quy tắc của cổng (đã thử trực tiếp):
//  - Bắt buộc có object SoDangKyThuoc, thiếu thì trả result:null.
//  - Lọc HoatChatChinh + DangBaoChe cùng lúc → lỗi; filterText nhiều từ → 0 kết quả.
//    ⇒ chỉ tra theo MỘT hoạt chất ở phía cổng, các điều kiện còn lại (đủ hoạt chất, dạng bào chế,
//    đơn chất/phối hợp) được lọc ở phía mình.
const axios = require('axios');

const DAV_SDK_API = 'https://dichvucong.dav.gov.vn/api/services/app/soDangKy/GetAllPublicServerPaging';
const PAGE = 300;
const TRAN_BAN_GHI = 4000;
const CACHE_MS = 6 * 3600 * 1000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const boDau = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').toLowerCase();
const gon = (s) => (s == null ? '' : String(s).replace(/\s+/g, ' ').trim());
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// Tên khác của cùng một hoạt chất (chỉ những cặp chắc chắn).
const DONG_NGHIA = { acetaminophen: 'paracetamol', paracetamol: 'acetaminophen', guaifenesin: 'guaiphenesin', guaiphenesin: 'guaifenesin' };

// Tách chuỗi thành phần của cổng thành từng hoạt chất. Phối hợp ngăn bằng ';' hoặc ', ' đứng trước
// chữ cái; KHÔNG tách dấu phẩy thập phân ("9,43mg") và không tách bên trong ngoặc.
function tachThanhPhan(chuoi) {
  const s = String(chuoi || '');
  const out = [];
  let depth = 0, cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth = Math.max(0, depth - 1);
    if (depth === 0 && (c === ';' || (c === ',' && /^\s+[A-Za-zÀ-ỹ]/.test(s.slice(i + 1)))
      || (c === '.' && /[A-Za-zÀ-ỹ]/.test(s[i - 1] || '') && /^\s+[A-Za-zÀ-ỹ]/.test(s.slice(i + 1))))) {
      if (cur.trim()) out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

// Gốc tên để so khớp: từ đầu tiên, bỏ 'e' cuối (codeine ≈ codein, amlodipine ≈ amlodipin).
const TU_CHUNG = new Set(['acid', 'vitamin', 'natri', 'kali', 'calci', 'magnesi', 'sodium', 'potassium', 'calcium', 'magnesium', 'dl', 'l']);
function gocTen(ten) {
  const ws = boDau(ten).split(/[^a-z0-9]+/).filter(Boolean);
  if (!ws.length) return '';
  const bo = (w) => (w.length > 5 ? w.replace(/e$/, '') : w);
  if (TU_CHUNG.has(ws[0]) && ws[1]) return bo(ws[0]) + ' ' + bo(ws[1]);
  return bo(ws[0]);
}
// Mọi cách viết của MỘT hoạt chất: tên người dùng nhập + các biến thể do AI đề xuất + đồng nghĩa chắc chắn.
function nhomGoc(ten, bienThe) {
  const arr = [ten, ...(Array.isArray(bienThe) ? bienThe : [])].map(gocTen).filter(Boolean);
  const them = arr.map((g) => DONG_NGHIA[g]).filter(Boolean);
  return [...new Set([...arr, ...them])].slice(0, 6);
}
function thanhPhanChuaGoc(thanhPhan, goc) {
  if (!goc) return false;
  const t = boDau(thanhPhan);
  const cacGoc = [goc, DONG_NGHIA[goc]].filter(Boolean);
  return cacGoc.some((g) => new RegExp('(^|[^a-z0-9])' + g.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(t));
}

// Khớp dạng bào chế: tuKhoa là chuỗi (chứa) HOẶC { any:[...], not:[...] } (nhóm có nhiều cách gọi như Cốm)
function khopDangBaoChe(dang, tuKhoa) {
  if (!tuKhoa) return true;
  const t = boDau(dang);
  if (typeof tuKhoa === 'string') return t.includes(boDau(tuKhoa));
  return tuKhoa.any.some((k) => t.includes(boDau(k))) && !(tuKhoa.not || []).some((k) => t.includes(boDau(k)));
}

const _cache = new Map();

async function goiCong(body, post) {
  let loi;
  for (let lan = 1; lan <= 3; lan++) {
    try {
      const r = await post(DAV_SDK_API, body);
      const j = r && r.data;
      if (j && j.success && j.result) return j.result;
      throw new Error((j && j.error && j.error.message) || 'Cổng trả về rỗng');
    } catch (e) {
      loi = e;
      if (lan < 3) await delay(1500 * lan);
    }
  }
  throw new Error(`Cổng Công bố thuốc không phản hồi (${(loi.response && loi.response.status) || loi.code || loi.message}).`);
}
const body = (hoatChat, skip, max) => ({ filterText: '', SoDangKyThuoc: { HoatChatChinh: hoatChat }, KichHoat: true, skipCount: skip, maxResultCount: max });
const postMacDinh = (url, b) => axios.post(url, b, { timeout: 90000, headers: { 'Content-Type': 'application/json', 'User-Agent': UA } });

async function taiHet(hoatChat, post) {
  const key = boDau(hoatChat);
  const c = _cache.get(key);
  if (c && Date.now() - c.at < CACHE_MS) return c.items;
  const items = [];
  for (let skip = 0; skip < TRAN_BAN_GHI; skip += PAGE) {
    const r = await goiCong(body(hoatChat, skip, PAGE), post);
    const it = r.items || [];
    items.push(...it);
    if (it.length < PAGE || items.length >= (r.totalCount || 0)) break;
  }
  _cache.set(key, { items, at: Date.now() });
  return items;
}

// dsHoatChat: mảng tên hoạt chất người dùng nhập; tuKhoaDang: từ khoá dạng bào chế tiếng Việt ('' = không lọc).
async function traSoDangKy(dsHoatChat, tuKhoaDang, post = postMacDinh, bienThe = null) {
  const nhom = dsHoatChat.map((t, i) => nhomGoc(t, bienThe && bienThe[i])).filter((g) => g.length);
  if (!nhom.length) return { rows: [], tongHieuLuc: 0, tongHetHan: 0, hanDungThamKhao: '' };

  // Cổng so khớp theo CỤM KÝ TỰ nên phải tra bằng GỐC tên/biến thể ("phenylephrin"), không phải tên đầy đủ có muối.
  // Mỗi hoạt chất có thể có vài cách viết (INN, tiếng Việt, đồng nghĩa) → tra từng cách (tối đa 3) rồi gộp.
  const cachTra = (g) => g.slice(0, 3);
  let nhomTra = nhom[0];
  if (nhom.length > 1) {
    const dem = await Promise.all(nhom.map(async (g) => {
      let n = 0;
      for (const t of cachTra(g)) n += (await goiCong(body(t, 0, 1), post)).totalCount || 0;
      return { g, n };
    }));
    nhomTra = dem.sort((x, y) => x.n - y.n)[0].g;
  }
  const gop = new Map();
  for (const t of cachTra(nhomTra)) {
    for (const it of await taiHet(t, post)) gop.set(it.soDangKy + '|' + it.id, it);
  }
  const tho = [...gop.values()];

  // tuKhoaDang: chuỗi (chứa) HOẶC { any:[từ khoá], not:[từ loại trừ] } cho nhóm dạng có nhiều cách gọi (vd Cốm)
  const khopDang = (dang) => {
    if (!tuKhoaDang) return true;
    const t = boDau(dang);
    if (typeof tuKhoaDang === 'string') return t.includes(boDau(tuKhoaDang));
    return tuKhoaDang.any.some((k) => t.includes(boDau(k))) && !(tuKhoaDang.not || []).some((k) => t.includes(boDau(k)));
  };
  const homNay = Date.now();
  const rows = [];
  for (const it of tho) {
    const co = it.thongTinThuocCoBan || {};
    const tp = tachThanhPhan(co.hoatChatChinh);
    if (!tp.length) continue;
    // Phải chứa ĐỦ mọi hoạt chất đã nhập (mỗi chất khớp với một thành phần, theo BẤT KỲ cách viết nào)
    if (!nhom.every((g) => tp.some((x) => g.some((v) => thanhPhanChuaGoc(x, v))))) continue;
    // Đơn chất: chỉ nhận bản ghi đúng 1 thành phần (loại thuốc phối hợp có chứa chất đó)
    if (nhom.length === 1 && tp.length !== 1) continue;
    if (!khopDang(co.dangBaoChe)) continue;
    const dk = it.thongTinDangKyThuoc || {};
    const het = dk.ngayHetHanSoDangKy ? new Date(dk.ngayHetHanSoDangKy).getTime() : null;
    const conHieuLuc = !it.isHetHan && !(het && het < homNay);
    const sx = it.congTySanXuat || {};
    rows.push({
      tenThuoc: gon(it.tenThuoc),
      hamLuong: tp.map(gon).join('; '),
      quyCach: gon(co.dongGoi),
      nhaSanXuat: gon(sx.tenCongTySanXuat) + (sx.nuocSanXuat ? ` (${gon(sx.nuocSanXuat)})` : ''),
      soDangKy: gon(it.soDangKy),
      tuoiTho: gon(co.tuoiTho),
      dangBaoChe: gon(co.dangBaoChe),
      ngayHetHan: dk.ngayHetHanSoDangKy || null,
      conHieuLuc,
      thanhPhanThua: nhom.length > 1 && tp.length > nhom.length,
    });
  }
  rows.sort((x, y) => x.tenThuoc.localeCompare(y.tenThuoc, 'vi'));

  const hieuLuc = rows.filter((r) => r.conHieuLuc);
  const demTuoi = new Map();
  hieuLuc.forEach((r) => { if (r.tuoiTho) demTuoi.set(r.tuoiTho, (demTuoi.get(r.tuoiTho) || 0) + 1); });
  const hanDung = [...demTuoi.entries()].sort((x, y) => y[1] - x[1])[0];
  return {
    rows,
    tongHieuLuc: new Set(hieuLuc.map((r) => r.soDangKy)).size,
    tongHetHan: new Set(rows.filter((r) => !r.conHieuLuc).map((r) => r.soDangKy)).size,
    hanDungThamKhao: hanDung ? hanDung[0] : '',
    khoaTra: nhomTra.join(' / '),
    tuKhoaDaTra: nhom,
  };
}

module.exports = { khopDangBaoChe, traSoDangKy, nhomGoc, tachThanhPhan, gocTen, thanhPhanChuaGoc, DAV_SDK_API };
