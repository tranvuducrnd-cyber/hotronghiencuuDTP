// Tra cứu danh mục thuốc BHYT (Thông tư 20/2022/TT-BYT, Phụ lục I) theo tên hoạt chất.
// Dữ liệu: data/bhyt-tt20-2022.json (trích từ lớp chữ OCR của PDF chính thức, tên không dấu).
// Chỉ khớp theo TÊN; hạng bệnh viện / điều kiện thanh toán không được trích đáng tin → trả về STT + trang để đối chiếu.
const fs = require('fs');
const path = require('path');

let _data = null;
function nap() {
  if (_data) return _data;
  try {
    _data = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'bhyt-tt20-2022.json'), 'utf8'));
  } catch (e) {
    _data = { muc: [] };
  }
  return _data;
}

const boDau = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').toLowerCase();

// Từ chỉ dạng muối/hydrat — bỏ đi để lấy "lõi" hoạt chất (so khớp base/muối được ghi riêng ở dạngMuoi).
const TU_MUOI = new Set(('hydrochloride hydroclorid hydrocloric hcl besylate besilat mesylate mesilat maleate maleat ' +
  'sodium natri potassium kali calcium calci magnesium magnesi sulfate sulfat sulphate phosphate phosphat tartrate tartrat ' +
  'succinate succinat fumarate fumarat citrate citrat acetate acetat hydrobromide hydrobromid bromide bromid nitrate nitrat ' +
  'hydrat hydrate monohydrate dihydrate trihydrate sesquihydrate anhydrous khan dipropionate propionat valerate valerat ' +
  'tosylate tosilat lactate lactat gluconate gluconat oxalate oxalat dimesylate dihydroclorid dihydrochloride').split(/\s+/));

const DOI_TU = { sodium: 'natri', potassium: 'kali', calcium: 'calci', magnesium: 'magnesi', sulphate: 'sulfat', sulfate: 'sulfat', glucose: 'dextrose' };
function laMuoi(t) {
  // Gồm cả dạng OCR lỗi như "hydroclodrid", "hydroc1orid"
  return TU_MUOI.has(t) || TU_MUOI.has(t.replace(/e$/, '')) || /^hydro(c|b)/.test(t);
}
function chuanTu(t) {
  t = DOI_TU[t] || t.replace(/^chlor/, 'clor');
  // INN tiếng Anh → cách viết Việt: bỏ 'e' cuối (amlodipine→amlodipin, ceftriaxone→ceftriaxon)
  return t.length > 5 ? t.replace(/e$/, '') : t;
}

// Một thành phần ("Paracetamol (acetaminophen)", "Lidocain hydroclorid") → { khoa:Set<string>, coMuoi }
function thanhPhan(chuoi) {
  const s = boDau(chuoi);
  const trongNgoac = [...s.matchAll(/\(([^)]*)\)/g)].map(m => m[1]);
  const chinh = s.replace(/\([^)]*\)/g, ' ');
  const dang = [chinh, ...trongNgoac];
  const khoa = new Set();
  let coMuoi = false;
  for (const d of dang) {
    const toks = d.split(/[^a-z0-9\-]+/).filter(Boolean);
    // Từ đầu tiên luôn là hoạt chất (vd 'Natri clorid', 'Calci carbonat') — chỉ bỏ từ muối đứng phía sau.
    const loi = toks.filter((t, i) => i === 0 || !laMuoi(t));
    if (loi.length !== toks.length && loi.length) coMuoi = true;
    const k = (loi.length ? loi : toks).map(chuanTu).join('').trim();
    if (k) khoa.add(k);
  }
  return { khoa, coMuoi };
}

function tachThanhPhan(ten) {
  return String(ten || '').split(/\s*\+\s*/).map(x => x.trim()).filter(Boolean);
}

// Sai lệch ≤1 ký tự với tên dài (OCR: "hydroc1orid"); tên ngắn phải khớp tuyệt đối.
function gan(a, b) {
  if (a === b) return true;
  if (a.length < 9 || b.length < 9 || Math.abs(a.length - b.length) > 1) return false;
  // Levenshtein ≤ 1 (một ký tự thay/thêm/bớt)
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : b.slice(i + 1) === a.slice(i);
}
function khopKhoa(x, y) {
  for (const a of x) for (const b of y) if (gan(a, b)) return true;
  return false;
}

let _chiMuc = null;
function chiMuc() {
  if (_chiMuc) return _chiMuc;
  _chiMuc = nap().muc.map(m => ({ m, tp: tachThanhPhan(m.ten).map(thanhPhan) }));
  return _chiMuc;
}

// tenHoatChat: mảng tên hoạt chất người dùng nhập (1 hoặc nhiều). Trả về mục khớp đủ và mục phối hợp chứa hoạt chất.
function traCuu(tenHoatChat) {
  const nhap = (tenHoatChat || []).map(t => thanhPhan(t));
  const kq = { khopDayDu: [], tongMuc: nap().muc.length, hangBenhVien: nap().hangBenhVien || [] };
  if (!nhap.length || !nhap.every(n => n.khoa.size)) return kq;
  for (const { m, tp } of chiMuc()) {
    const duDu = tp.length === nhap.length &&
      nhap.every(n => tp.some(t => khopKhoa(n.khoa, t.khoa))) &&
      tp.every(t => nhap.some(n => khopKhoa(n.khoa, t.khoa)));
    if (duDu) {
      const muoiNhap = nhap.some(n => n.coMuoi), muoiMuc = tp.some(t => t.coMuoi);
      kq.khopDayDu.push({ stt: m.stt, ten: m.ten, dong: m.dong || [], trang: m.trang, ghiChu: !!m.ghiChu, khacDangMuoi: muoiNhap !== muoiMuc });
    }
  }
  return kq;
}

module.exports = { traCuu, thanhPhan, tachThanhPhan, boDau };
