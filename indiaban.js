// Đối chiếu tổ hợp thuốc với danh sách 328 thuốc phối hợp liều cố định (FDC) bị cấm tại Ấn Độ (pharmawiki.in).
// Chỉ coi là "nằm trong danh mục cấm" khi THÀNH PHẦN KHỚP HOÀN TOÀN với một tổ hợp bị cấm:
// mọi hoạt chất người dùng nhập đều có trong tổ hợp VÀ mọi thành phần của tổ hợp đều là hoạt chất đã nhập.
// Chỉ trùng một phần (vd chỉ có paracetamol) → không tính.
const { nhomGoc } = require('./davsdk');

const boDau = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').toLowerCase();

// Tách danh sách đánh số "N Tên + Tên + Tên SỐ-THÔNG-BÁO" từ văn bản trang. Số thứ tự tăng dần 1,2,3...
// và đứng ngay sau số thông báo 3–4 chữ số của dòng trước, nên không nhầm với hàm lượng ("Vitamin B 12").
function phanTichDanhSach(text) {
  // Trang chèn dòng tiêu đề lặp giữa danh sách ("LIST OF FDC'S BANNED ... CIPMMA") → bỏ trước khi tách.
  const t = String(text || '').replace(/LIST OF FDC.{0,150}?CIPMMA/gi, ' ').replace(/Banned drugs list/gi, ' ').replace(/List of Banned FDC drugs/gi, ' ')
    .replace(/\s>\s+(?=\d)/g, ' ');   // bản qua Serper đánh dấu mỗi mục bằng "> "
  // Chữ " 1 Tên…" có thể xuất hiện nhiều lần (vd trong lời dẫn) → thử lần lượt, lấy lần cho ra danh sách đầy đủ nhất
  let tot = [];
  const re1 = /\s1\s+(?=[A-Z][a-z])/g;
  let m1;
  while ((m1 = re1.exec(t)) !== null) {
    const kq = tachTu(t, m1.index + m1[0].length);
    if (kq.length > tot.length) tot = kq;
    if (tot.length >= 300) break;
  }
  return tot;
}

function tachTu(t, batDau1) {
  const moc = [{ k: 1, i: batDau1 }];
  for (let k = 2; k < 1000; k++) {
    const re = new RegExp('\\b\\d{3,4}\\s+(?:[A-Za-z0-9\'’.\\- ]{0,70}?\\s)?' + k + '\\s+(?=[A-Za-z])', 'g');
    re.lastIndex = moc[moc.length - 1].i;
    let m = re.exec(t);
    if (!m) {
      // Một số dòng trang thiếu số thông báo ở cuối → thử lại KHÔNG cần số đó (chỉ khi cách chặt không thấy)
      const lo = new RegExp('\\s' + k + '\\s+(?=[A-Z][a-z])', 'g');
      lo.lastIndex = moc[moc.length - 1].i;
      m = lo.exec(t);
    }
    if (!m) break;
    moc.push({ k, i: m.index + m[0].length, batDau: m.index });
  }
  return moc.map((m, j) => {
    const cuoi = j + 1 < moc.length ? moc[j + 1].batDau : t.length;
    let ten = t.slice(m.i, cuoi)
      .replace(/LIST OF FDC.*?CIPMMA/i, ' ')
      .replace(/\s+\d{3,4}\s*$/, '')
      .replace(/\s+/g, ' ').trim();
    ten = ten.replace(/\s+\d{3,4}\s+[>\s]*(?:LIST OF|Recent news).*$/i, '').trim(); // đuôi trang sau mục cuối
    return { stt: m.k, ten, thanhPhan: ten.split(/\s*\+\s*/).map((x) => x.trim()).filter(Boolean) };
  });
}

// Sai lệch tối đa theo độ dài từ: danh sách gốc có nhiều lỗi chính tả (Dextrometharphan, Guaiphensin, Certirizine...).
// Chuẩn hoá âm để bỏ lỗi chính tả phổ biến: ph≈f, k≈c, y≈i, chữ đôi (zink≈zinc, guaiphenesin≈guaifenesin).
const chuanAm = (w) => w.replace(/ph/g, 'f').replace(/k/g, 'c').replace(/y/g, 'i').replace(/(.)\1+/g, '$1');
function gan(a, b) {
  a = chuanAm(a); b = chuanAm(b);
  if (a === b) return true;
  // Tên này chứa trọn tên kia = hai hoạt chất KHÁC NHAU (omeprazol ⊂ esomeprazol, ofloxacin ⊂ levofloxacin) → không khớp mờ
  if (a.includes(b) || b.includes(a)) return false;
  const max = Math.min(a.length, b.length) >= 9 ? 2 : (Math.min(a.length, b.length) >= 6 ? 1 : 0);
  if (!max || Math.abs(a.length - b.length) > max) return false;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[a.length][b.length] <= max;
}
const bo = (w) => (w.length > 5 ? w.replace(/e$/, '') : w);

function khopThanhPhan(thanhPhan, stem) {
  const t = boDau(thanhPhan);
  if (/\s/.test(stem)) return new RegExp('(^|[^a-z0-9])' + stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(t);
  return t.split(/[^a-z0-9]+/).filter(Boolean).some((w) => gan(bo(w), stem));
}

// nhom: mảng (theo từng hoạt chất người dùng nhập) các cách viết (stem) của hoạt chất đó.
function kiemTra(danhSach, nhom) {
  const khop = [];
  if (!nhom.length) return khop;
  for (const e of danhSach) {
    const cacTP = e.thanhPhan;
    const moiNhomCoTP = nhom.every((g) => cacTP.some((tp) => g.some((v) => khopThanhPhan(tp, v))));
    const moiTPThuocNhom = cacTP.every((tp) => nhom.some((g) => g.some((v) => khopThanhPhan(tp, v))));
    if (moiNhomCoTP && moiTPThuocNhom) khop.push(e);
  }
  return khop;
}

module.exports = { phanTichDanhSach, kiemTra, nhomGoc, khopThanhPhan };
