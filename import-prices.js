// Nạp file Excel công bố giá thuốc từ ĐĨA thẳng vào Supabase — không cần tải qua trình duyệt.
// Cách chạy:  node --max-old-space-size=3500 import-prices.js <thau|kekhai> <file1.xlsx> [file2.xlsx ...]
require('dotenv').config({ path: '.env', override: true });
const fs = require('fs');
const X = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

const PRICE_TABLES = { thau: 'drug_tender_prices', kekhai: 'drug_declared_prices' };

function parsePriceWorkbook(buf) {
  const wb = X.read(buf, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error('File không có sheet dữ liệu nào.');
  const raw = X.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: false });
  const headerIdx = raw.findIndex((r) => r.some((c) => /tên\s*thuốc/i.test(String(c || ''))));
  if (headerIdx < 0) throw new Error('Không tìm thấy dòng tiêu đề có cột "Tên thuốc".');
  const header = raw[headerIdx].map((c) => String(c || '').replace(/\s+/g, ' ').trim());
  const col = (...kw) => header.findIndex((h) => { const l = h.toLowerCase(); return kw.some((k) => l.includes(k)); });
  const idx = {
    tenThuoc: col('tên thuốc'), hoatChat: col('hoạt chất', 'thành phần'),
    hamLuong: col('nđ/hl', 'nồng độ', 'hàm lượng'), soDangKy: col('sđk', 'gpnk', 'số đăng ký'),
    duongDung: col('đường dùng'), dangBaoChe: col('dạng bào chế'),
    nhaSanXuat: col('sở sản xuất', 'nhà sản xuất', 'cơ sở sx'), nuocSanXuat: col('nước sản xuất'),
    quyCach: col('quy cách'), donViTinh: col('đvt', 'đơn vị tính'),
    soLuong: col('số lượng'), donGia: col('đơn giá', 'giá kê khai', 'giá bán'), thanhTien: col('thành tiền'),
  };
  if (idx.tenThuoc < 0 || idx.donGia < 0) throw new Error('Thiếu cột bắt buộc. Cột đọc được: ' + header.filter(Boolean).join(' | '));
  const get = (r, i) => (i >= 0 && r[i] != null ? r[i] : '');
  const toNum = (v) => { if (typeof v === 'number') return v; const n = Number(String(v).replace(/[^\d.-]/g, '')); return Number.isFinite(n) ? n : null; };
  const rows = [];
  for (let i = headerIdx + 1; i < raw.length; i++) {
    const r = raw[i];
    const ten = String(get(r, idx.tenThuoc) || '').trim();
    if (!ten || /^tt$/i.test(ten)) continue;
    rows.push({
      ten_thuoc: ten, hoat_chat: String(get(r, idx.hoatChat) || '').trim(),
      ham_luong: String(get(r, idx.hamLuong) || '').trim(), so_dang_ky: String(get(r, idx.soDangKy) || '').trim(),
      duong_dung: String(get(r, idx.duongDung) || '').trim(), dang_bao_che: String(get(r, idx.dangBaoChe) || '').trim(),
      nha_san_xuat: String(get(r, idx.nhaSanXuat) || '').trim(), nuoc_san_xuat: String(get(r, idx.nuocSanXuat) || '').trim(),
      quy_cach: String(get(r, idx.quyCach) || '').trim(), don_vi_tinh: String(get(r, idx.donViTinh) || '').trim(),
      so_luong: toNum(get(r, idx.soLuong)), don_gia: toNum(get(r, idx.donGia)), thanh_tien: toNum(get(r, idx.thanhTien)),
    });
  }
  return rows;
}

(async () => {
  const type = process.argv[2];
  const files = process.argv.slice(3);
  const table = PRICE_TABLES[type];
  if (!table || !files.length) { console.error('Dùng: node import-prices.js <thau|kekhai> <file.xlsx> ...'); process.exit(1); }

  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } });

  let grand = 0;
  for (const f of files) {
    if (!fs.existsSync(f)) { console.error('KHÔNG THẤY FILE:', f); continue; }
    console.log(`\n=== ${f} ===`);
    const t0 = Date.now();
    const rows = parsePriceWorkbook(fs.readFileSync(f));
    console.log(`  Đọc được ${rows.length.toLocaleString('vi-VN')} dòng (${((Date.now() - t0) / 1000).toFixed(1)}s). Đang ghi vào Supabase...`);
    const CHUNK = 1000;
    let done = 0;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK).map((r) => Object.assign({}, r, { nguon_file: f.replace(/\.xlsx?$/i, '') }));
      const { error } = await db.from(table).insert(chunk);
      if (error) { console.error(`  LỖI ở dòng ${i}: ${error.message}`); process.exit(1); }
      done += chunk.length;
      if (done % 10000 === 0 || done === rows.length) {
        process.stdout.write(`\r  Đã ghi ${done.toLocaleString('vi-VN')}/${rows.length.toLocaleString('vi-VN')} dòng`);
      }
    }
    grand += done;
    console.log(`\n  Xong ${f} — ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  const { count } = await db.from(table).select('*', { count: 'exact', head: true });
  console.log(`\n===== ĐÃ NẠP ${grand.toLocaleString('vi-VN')} dòng | bảng ${table} hiện có ${Number(count || 0).toLocaleString('vi-VN')} dòng =====`);
})();
