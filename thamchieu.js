// Mục I.2 "Xuất xứ công thức — sản phẩm SRA": đối chiếu hoạt chất + dạng bào chế với
// "Danh mục thuốc tham chiếu" (theo khoản 9, điều 2, TT 08/2022/TT-BYT; bản 5-7-2024).
// Dữ liệu: data/danh-muc-tham-chieu.json, dựng từ file PDF gốc (đọc theo toạ độ chữ + đường kẻ bảng).
// Chỉ báo những gì CÓ trong danh mục; không suy diễn thêm nước/nguồn nào.
const fs = require('fs');
const path = require('path');
const { nhomGoc, thanhPhanChuaGoc } = require('./davsdk');
const { khopThanhPhan } = require('./indiaban');

const boDau = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').toLowerCase();

let _data = null;
function nap() {
  if (_data) return _data;
  try { _data = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'danh-muc-tham-chieu.json'), 'utf8')); }
  catch (e) { _data = { duocChat: [] }; }
  return _data;
}

// ── Nguồn tham chiếu → nước + cơ quan + có thuộc SRA hay không ─────────────────────────────────────
// SRA theo định nghĩa của WHO (2017): thành viên/quan sát viên ICH (EC/EU, Mỹ, Nhật; Canada, Thụy Sĩ)
// và cơ quan có thoả thuận công nhận lẫn nhau ràng buộc pháp lý với thành viên ICH (Úc, Na Uy, Iceland,
// Liechtenstein). Anh (MHRA) là thành viên ICH. Sửa tại đây nếu danh sách SRA của công ty khác.
const EU = (nuoc, coQuan) => ({ nuoc, coQuan, sra: true });
const NGUON = [
  [/^(ahfs|ashp)$/, { nuoc: 'Hoa Kỳ', coQuan: 'AHFS Drug Information (ASHP)', sra: true }],
  [/^(fda|dailymed|usp|msd)$/, { nuoc: 'Hoa Kỳ', coQuan: 'FDA / DailyMed', sra: true }],
  [/^(emc|mhra|bnf|uk|anh)$/, { nuoc: 'Anh', coQuan: 'eMC / MHRA (SmPC)', sra: true }],
  [/^ireland$/, EU('Ireland', 'HPRA / eMC')],
  [/^(ansm|phap)$/, EU('Pháp', 'ANSM')],
  [/^(nhat|nhat ban|pmda)$/, { nuoc: 'Nhật Bản', coQuan: 'PMDA', sra: true }],
  [/^(tga|uc|australia)$/, { nuoc: 'Úc', coQuan: 'TGA', sra: true }],
  [/^canada$/, { nuoc: 'Canada', coQuan: 'Health Canada', sra: true }],
  [/^(duc)$/, EU('Đức', 'BfArM / nhãn thuốc Đức')],
  [/^(italy|italia|y)$/, EU('Ý', 'AIFA / nhãn thuốc Ý')],
  [/^(be|bi)$/, EU('Bỉ', 'AFMPS / nhãn thuốc Bỉ')],
  [/^(hungari|hung|hungary)$/, EU('Hungary', 'OGYÉI / nhãn thuốc Hungary')],
  [/^(tbn|tay ban nha|spain|t ban nha|t\.? ban nha)$/, EU('Tây Ban Nha', 'AEMPS')],
  [/^ao$/, EU('Áo', 'BASG')],
  [/^(bdn|bo dao nha|bodaonha)$/, EU('Bồ Đào Nha', 'INFARMED')],
  [/^ema$/, EU('Liên minh châu Âu', 'EMA')],
  [/^(ha lan)$/, EU('Hà Lan', 'CBG-MEB')],
  [/^bungari$/, EU('Bulgaria', 'BDA')],
  [/^(hy lap|hylap|greece)$/, EU('Hy Lạp', 'EOF')],
  [/^rumani$/, EU('Romania', 'ANMDMR')],
  [/^(thuy si)$/, { nuoc: 'Thụy Sĩ', coQuan: 'Swissmedic', sra: true }],
  [/^(ba lan|balan)$/, EU('Ba Lan', 'URPL')],
  [/^thuy dien$/, EU('Thụy Điển', 'Läkemedelsverket')],
  [/^croatia$/, EU('Croatia', 'HALMED')],
  [/^czech$/, EU('Séc', 'SÚKL')],
  [/^slovenia$/, EU('Slovenia', 'JAZMP')],
  [/^latvia$/, EU('Latvia', 'ZVA')],
  [/^(cong hoa sip|sip)$/, EU('Síp', 'Bộ Y tế Síp')],
  [/^(mondova|moldova)$/, { nuoc: 'Moldova', coQuan: 'Cơ quan dược Moldova', sra: false }],
];
const TU_NGUON = [
  [/\b(ahfs|ashp)\b/, 0], [/\b(fda|dailymed|usp|msd)\b/, 1], [/\b(emc|mhra|bnf|uk)\b/, 2], [/\bireland\b/, 3],
  [/\b(ansm|asnm|ansn|ansms)\b/, 4], [/\b(nhat|nhat ban|pmda)\b/, 5], [/\b(tga|australia)\b/, 6], [/\bcanada\b/, 7],
  [/\b(duc|sduc)\b/, 8], [/\b(italy|italia)\b/, 9], [/\bbi\b/, 10], [/\b(hungari|hung|hungary)\b/, 11],
  [/\b(tbn|spain|tay ban nha|t ban nha)\b/, 12], [/\bao\b/, 13], [/\b(bdn|bo dao nha|bodaonha)\b/, 14],
  [/\bema\b/, 15], [/\bha lan\b/, 16], [/\bbungari\b/, 17], [/\b(hy lap|hylap|greece)\b/, 18], [/\brumani\b/, 19],
  [/\b(thuy si)\b/, 20], [/\b(ba lan|balan)\b/, 21], [/\bthuy dien\b/, 22], [/\bcroatia\b/, 23], [/\bczech\b/, 24],
  [/\bslovenia\b/, 25], [/\blatvia\b/, 26], [/\b(cong hoa sip)\b/, 27], [/\b(mondova|moldova)\b/, 28],
  [/\buc\b/, 6], [/\bphap\b/, 4], [/\banh\b/, 2],
];
const NGUON_THEO_CHI_SO = NGUON.map((n) => n[1]);

// "AHFS, gốc Amlor" / "Gốc Exforge, eMC" / "Hungari. eMC" → { cacNuoc:[...], goc:[...], ghiChu }
function phanTichNguon(raw) {
  const goc = [];
  let rest = String(raw || '');
  rest = rest.replace(/g[ốo]c\s+([^,;()]+)/gi, (m, b) => { goc.push(b.trim()); return ' '; });
  const cac = new Map();
  const bd = boDau(rest);
  for (const [re, idx] of TU_NGUON) if (re.test(bd)) { const n = NGUON_THEO_CHI_SO[idx]; cac.set(n.nuoc + '|' + n.coQuan, n); }
  const ghiChu = /(\d{1,2}\/\d{1,2}\/\d{4}|ko co|khong co|dung cap|ngung luu hanh|discontinued|chua cap|co ls|co gp)/i.test(bd) ? String(raw).trim() : '';
  return { cacNuoc: [...cac.values()], goc, ghiChu };
}

// ── Phân loại dạng bào chế trong cột 2 của danh mục (viết tắt: VN, VNBF, Hd, Dd, ODT…) ─────────────
function nhanDang(dangRaw) {
  const t = boDau(dangRaw).replace(/^[\s\-]+/, '');
  const sui = /(vien|vn|vien nen)\s+sui|vien\s*nen sui|nen sui|vn sui/.test(t);
  const loaiTru = /(vn|vien nen)\s+sui( bot)?|vien\s+sui( bot)?/g;
  const t2 = t.replace(loaiTru, ' ');
  const nhan = new Set();
  if (sui) nhan.add('Viên sủi');
  if (/(^|[^a-z])(vn|vnbf|vnpt)([^a-z]|$)|vien nen|^vien bao\b/.test(t2) && !/odt|vien nhai|vien phan tan|vien ngam|dat |dat$/.test(t2.split(/[;]/)[0] || t2)) nhan.add('Viên nén');
  if (/vien nang/.test(t) && !/nang mem/.test(t) && !/dat am dao/.test(t)) nhan.add('Viên nang');
  if (/nang mem|capsule,? soft|soft capsule/.test(t) && !/dat am dao/.test(t)) nhan.add('Viên nang mềm');
  if (/tiem/.test(t)) nhan.add('Thuốc tiêm');
  if (/nho mat|nho mat,|mo tra mat|gel tra mat/.test(t)) nhan.add('Thuốc nhỏ mắt');
  const khongUong = /tiem|nho mat|nho mui|nho tai|khi dung|xit|dung ngoai|phun mu|thut|suc mieng|ro mieng|dat |dat$|truc trang|am dao|tra mat/;
  if (/^(dd|dung dich|siro|sirop|elixir|nhu tuong uong|thuoc giot|dd uong)\b/.test(t) || /^(dd|dung dich)\b/.test(t)) {
    if (!khongUong.test(t) || /\buong\b/.test(t)) nhan.add('Dung dịch');
  }
  if (/^(hd|hon dich)\b/.test(t) && !/tiem|xit|khi dung|nho/.test(t)) nhan.add('Hỗn dịch');
  if (/\b(com|hat)\b|thuoc com|com pha|hat\/com|thuoc bot|bot pha (hd|dd)|bot (sui|uong)|bot\/com|pellet|granul/.test(t) && !/vien|tiem|dong kho|nho|dung ngoai/.test(t)) nhan.add('Cốm');
  if (/(^|[^a-z])(kem|mo|thuoc mo|gel|lotion|emulgel)([^a-z]|$)/.test(t) && !/uong|truc trang|ro mieng|nho|tiem/.test(t)) nhan.add('Thuốc mỡ/Kem/Gel');
  return nhan;
}

function loaiDangCanTim(dosageVi) {
  const v = boDau(dosageVi);
  if (/sui/.test(v)) return 'Viên sủi';
  if (/nang mem/.test(v)) return 'Viên nang mềm';
  if (/nang/.test(v)) return 'Viên nang';
  if (/nen/.test(v) || /tablet/.test(v)) return 'Viên nén';
  if (/nho mat/.test(v)) return 'Thuốc nhỏ mắt';
  if (/hon dich|suspension/.test(v)) return 'Hỗn dịch';
  if (/dung dich|solution/.test(v)) return 'Dung dịch';
  if (/tiem|injection/.test(v)) return 'Thuốc tiêm';
  if (/mo|kem|gel|cream|ointment/.test(v)) return 'Thuốc mỡ/Kem/Gel';
  if (/com|granul/.test(v)) return 'Cốm';
  return '';
}

function tongSoHoatChat(tenO, dang, nhomCoDang) {
  const k = String(tenO).split('+').filter((x) => x.trim()).length || 1;
  const nPlus = (String(dang).match(/\+/g) || []).length;
  return k > 1 ? Math.max(k, nPlus + 1) : nPlus + 1;
}

// Danh mục ghi vitamin bằng ký hiệu ("10 mg B6", "vitamin PP") — đối chiếu với tên hoạt chất tương ứng
const KY_HIEU_VITAMIN = [
  [/pyridoxin/, /\bb6\b|vitamin b6/], [/thiamin/, /\bb1\b|vitamin b1/], [/riboflavin/, /\bb2\b|vitamin b2/],
  [/(cyano|hydroxo|methyl)?cobalamin/, /\bb12\b|vitamin b12/], [/nicotinamid|niacinamid|nicotinic/, /\bpp\b|\bb3\b|vitamin pp|vitamin b3/],
  [/pantothen|dexpanthenol|panthenol/, /\bb5\b|vitamin b5/], [/folic|folat/, /\bb9\b|vitamin b9/], [/cholecalciferol/, /\bd3\b|vitamin d3/],
  [/ergocalciferol/, /\bd2\b|vitamin d2/], [/tocopherol/, /vitamin e/], [/retinol/, /vitamin a/],
];
function viTamTheoKyHieu(text, v) {
  const t = boDau(text), tv = boDau(v);
  // hai chiều: tên nhập là ký hiệu (vitamin B6) mà danh mục ghi pyridoxin, hoặc ngược lại
  return KY_HIEU_VITAMIN.some(([reTen, reKy]) => (reTen.test(tv) && reKy.test(t)) || (reKy.test(tv) && (reTen.test(t) || reKy.test(t))));
}

// ds: tên hoạt chất người dùng nhập; bienThe: các cách viết (AI) theo từng chất; dosageVi: dạng bào chế (tiếng Việt chuẩn)
function traCuu(ds, bienThe, dosageVi) {
  const nhom = ds.map((t, i) => nhomGoc(t, bienThe && bienThe[i])).filter((g) => g.length);
  const can = loaiDangCanTim(dosageVi);
  const khop = [], khacDang = [], khongRoDang = [], chuaThem = [];
  const thay = new Set();
  if (!nhom.length) return { khop, khacDang, khongRoDang, chuaThem, tongMuc: nap().duocChat.length, dangTim: can };
  const nhanXet = (text) => (g) => g.some((v) => thanhPhanChuaGoc(text, v) || khopThanhPhan(text, v) || viTamTheoKyHieu(text, v));
  for (const o of nap().duocChat) {
    for (const e of o.dong) {
      const text = o.ten + ' ' + e.dang;
      if (!nhom.every((g) => nhanXet(text)(g))) continue;
      const tong = tongSoHoatChat(o.ten, e.dang);
      if (tong !== nhom.length) {
        // Phối hợp có đủ các chất đã nhập NHƯNG thêm chất khác → công thức khác, chỉ ghi chú (không tính)
        if (nhom.length > 1 && tong > nhom.length && chuaThem.length < 6) chuaThem.push({ duocChat: o.ten, dang: e.dang.replace(/^[\s\-]+/, ''), nguon: e.nguon });
        continue;
      }
      const khoa = boDau(o.ten + '|' + e.dang + '|' + e.nguon);
      if (thay.has(khoa)) continue;
      thay.add(khoa);
      const nhan = nhanDang(e.dang);
      const ps = phanTichNguon(e.nguon);
      const mau = { duocChat: o.ten, dang: e.dang.replace(/^[\s\-]+/, ''), nguon: e.nguon, cacNuoc: ps.cacNuoc, goc: ps.goc, ghiChu: ps.ghiChu, loai: [...nhan] };
      // Dòng chỉ ghi hàm lượng (vd "5 mg + 80 mg valsartan") không nêu dạng bào chế → không khẳng định được
      if (!nhan.size && /^\s*[\d(]/.test(mau.dang)) khongRoDang.push(mau);
      else if (!can || nhan.has(can)) khop.push(mau); else khacDang.push(mau);
    }
  }
  return { khop, khacDang, khongRoDang, chuaThem, tongMuc: nap().duocChat.length, dangTim: can };
}

// Gộp theo nước/cơ quan để hiện tóm tắt "xuất xứ công thức thuộc SRA"
function tomTat(khop) {
  const m = new Map();
  for (const e of khop) {
    for (const n of e.cacNuoc) {
      const k = n.nuoc;
      if (!m.has(k)) m.set(k, { nuoc: n.nuoc, sra: n.sra, coQuan: new Set(), soMuc: 0 });
      const g = m.get(k); g.coQuan.add(n.coQuan); g.soMuc++;
    }
  }
  return [...m.values()].map((g) => ({ nuoc: g.nuoc, sra: g.sra, coQuan: [...g.coQuan], soMuc: g.soMuc })).sort((a, b) => b.soMuc - a.soMuc);
}

module.exports = { traCuu, tomTat, phanTichNguon, nhanDang, loaiDangCanTim, tongSoHoatChat };
