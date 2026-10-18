// Công thức hàng tham chiếu thay thế khi Vidal.ru không có tá dược:
//  1) FDA (openFDA – nhãn thuốc DailyMed, mục "Inactive ingredients")  → SRA Hoa Kỳ
//  2) eMC / SmPC Anh (mục 6.1 "List of excipients") qua Serper         → SRA Anh/EU
//  3) (tuỳ chọn) AI tìm web có nguồn — chỉ khi 1) và 2) đều rỗng, gắn nhãn chưa kiểm chứng
// Chỉ liệt kê tên tá dược có trong tài liệu; KHÔNG tự thêm thành phần, KHÔNG tự bịa hàm lượng.
const { nhomGoc, thanhPhanChuaGoc } = require('./davsdk');
const { khopThanhPhan } = require('./indiaban');

const boDau = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').toLowerCase();
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Dạng bào chế (tiếng Việt chuẩn của app) → từ khoá nhận diện trong tên dạng của FDA/eMC
const DANG_EN = {
  'Viên nén': /\btablet/i, 'Viên sủi': /effervescent/i, 'Viên nang': /\bcapsule/i,
  'Viên nang mềm': /soft|liquid[- ]filled|softgel/i, 'Dung dịch': /solution|syrup|elixir|drops/i,
  'Hỗn dịch': /suspension/i, 'Cốm': /granul|for (oral )?suspension|powder, for/i,
  'Thuốc tiêm': /inject|infusion|for solution/i, 'Thuốc mỡ/Kem/Gel': /cream|ointment|gel|lotion/i,
  'Thuốc nhỏ mắt': /ophthalmic|eye/i,
};
// Loại trừ để không lẫn dạng khác (vd cốm ≠ viên nang chứa pellet; viên nén ≠ viên nén sủi)
const LOAI_TRU = {
  'Cốm': /capsule|tablet/i, 'Viên nén': /effervescent|chewable|orally disintegrating/i, 'Viên nang': /soft|liquid[- ]filled/i,
  'Dung dịch': /for (oral )?suspension|for solution|inject/i, 'Hỗn dịch': /for suspension|inject|ophthalmic/i,
};
const EN_TU_KHOA = {
  'Viên nén': ['tablet'], 'Viên sủi': ['effervescent tablet'], 'Viên nang': ['capsule'], 'Viên nang mềm': ['soft capsule', 'softgel'],
  'Dung dịch': ['oral solution'], 'Hỗn dịch': ['suspension'], 'Cốm': ['granules'], 'Thuốc tiêm': ['injection'],
  'Thuốc mỡ/Kem/Gel': ['cream', 'ointment'], 'Thuốc nhỏ mắt': ['ophthalmic solution'],
};

// "Inactive ingredients: a, b (c, d), e and f." → ["a","b (c, d)","e","f"]
function tachTaDuoc(text) {
  let t = String(text || '').replace(/\s+/g, ' ').trim();
  t = t.replace(/^.*?(inactive ingredients?|excipients?|each (?:tablet|capsule|[a-z ]{0,30}) (?:also )?contains?)\s*[:\-]?\s*/i, '');
  for (let i = 0; i < 3; i++) t = t.replace(/^(inactive ingredients?|excipients?)\s*[:\-]?\s*/i, ''); // nguồn đôi khi lặp tiêu đề 2 lần
  t = t.replace(/\b(?:Questions\?|Call\b|Distributed by|Manufactured by|Package label|Active ingredient)\b.*$/i, '');
  const out = []; let cur = '', d = 0;
  for (const c of t) {
    if (c === '(' || c === '[') d++; else if (c === ')' || c === ']') d = Math.max(0, d - 1);
    if (d === 0 && (c === ',' || c === ';')) { if (cur.trim()) out.push(cur.trim()); cur = ''; } else cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  // phần tử cuối thường "A and B" → tách (trừ "methacrylic acid and ethyl acrylate copolymer")
  if (out.length) {
    const cuoi = out[out.length - 1];
    const m = cuoi.match(/^(.{3,60}?)\s+and\s+(.{3,60})$/i);
    if (m && !/copolymer|\(/.test(cuoi)) { out.pop(); out.push(m[1], m[2]); }
  }
  const res = [];
  for (let x of out) {
    // bỏ lời dẫn dính đầu ("for all strengths of the tablets are colloidal silicon dioxide")
    if (/^(for|of|the|all|each|these|this|in addition)\b/i.test(x)) x = x.replace(/^.{0,100}?\b(?:are|include|includes|contains?|contain|:)\s+/i, '');
    x = x.replace(/^(and|&)\s+/i, '').replace(/[.:]+$/, '').trim();
    if (x.length >= 2 && x.length <= 90 && !/^\d+$/.test(x)) res.push(x);
  }
  return [...new Set(res.map((x) => x))].slice(0, 40);
}

// Tên Mỹ (USAN) khác tên INN hay gặp
const DONG_NGHIA_MY = { paracetamol: 'acetaminophen', acetaminophen: 'paracetamol', guaiphenesin: 'guaifenesin', guaifenesin: 'guaiphenesin', salbutamol: 'albuterol', albuterol: 'salbutamol', adrenalin: 'epinephrine', epinephrine: 'adrenalin', lignocaine: 'lidocaine', lidocaine: 'lignocaine' };
// Từ khoá tìm nhãn FDA cho 1 hoạt chất: từ đầu của tên nhập + các biến thể (+ tên Mỹ), bỏ muối
function tuKhoaFDA(raws) {
  const out = new Set();
  for (const r of raws) {
    const w = boDau(r).split(/[^a-z0-9]+/).filter(Boolean)[0];
    if (w && w.length >= 4) { out.add(w); if (DONG_NGHIA_MY[w]) out.add(DONG_NGHIA_MY[w]); }
  }
  return [...out].slice(0, 5);
}

// rawVariants[i]: các cách viết (đã gồm tên người dùng nhập) của hoạt chất thứ i
async function traOpenFDA(axios, ds, rawVariants, nhom, dangVi) {
  const sp = [];
  const q = ds.map((t, i) => '(' + tuKhoaFDA([t, ...(rawVariants[i] || [])]).map((w) => `openfda.generic_name:${w}`).join('+OR+') + ')').join('+AND+');
  let results = [];
  try {
    for (let skip = 0; skip < 600; skip += 100) {
      const r = await axios.get(`https://api.fda.gov/drug/label.json?search=${q}&limit=100&skip=${skip}`, { timeout: 25000, headers: { 'User-Agent': UA } });
      const rs = (r.data && r.data.results) || [];
      results = results.concat(rs);
      if (rs.length < 100) break;
    }
  } catch (e) { if (!results.length) return { san: [], loi: e.response && e.response.status === 404 ? '' : e.message }; }
  const reDang = DANG_EN[dangVi];
  for (const it of results) {
    const o = it.openfda || {};
    const sub = (o.substance_name && o.substance_name.length ? o.substance_name : o.generic_name) || [];
    const chuoiSub = sub.join(' ; ');
    // phải ĐÚNG tổ hợp: đủ mọi hoạt chất nhập và không có hoạt chất lạ
    const dsSub = [...new Set(String(chuoiSub).split(/[;,]/).map((x) => x.trim()).filter(Boolean))];
    const nhomKhop = nhom.every((g) => dsSub.some((x) => g.some((v) => thanhPhanChuaGoc(x, v) || khopThanhPhan(x, v))));
    if (!nhomKhop || dsSub.length > nhom.length + 1 && ds.length === 1 || (ds.length === 1 && dsSub.length !== 1)) continue;
    if (ds.length > 1 && dsSub.length !== ds.length) continue;
    const spl = (it.spl_product_data_elements || []).join(' ');
    const mo = (it.description || []).join(' ');
    if (reDang && (!reDang.test(spl + ' ' + mo.slice(0, 500)) || (LOAI_TRU[dangVi] && LOAI_TRU[dangVi].test(spl + ' ' + mo.slice(0, 250))))) continue;
    // Thuốc kê đơn thường KHÔNG có mục inactive_ingredient mà ghi tá dược trong mục DESCRIPTION
    let ina = (it.inactive_ingredient || [])[0];
    if (!ina) {
      const mo = (it.description || []).join(' ').replace(/\s+/g, ' ');
      const i = mo.search(/inactive ingredients?|excipients? (?:include|are)|the following inactive/i);
      if (i >= 0) {
        let seg = mo.slice(i, i + 900);
        const cut = seg.search(/\.\s+(?=[A-Z][a-z]+ )/);
        if (cut > 40) seg = seg.slice(0, cut);
        ina = seg;
      }
    }
    if (!ina) continue;
    const ex = tachTaDuoc(ina);
    if (ex.length < 2) continue;
    sp.push({
      productName: (o.brand_name || [])[0] || (o.generic_name || [])[0] || 'Chế phẩm FDA',
      nhaSanXuat: (o.manufacturer_name || [])[0] || '',
      source: 'FDA – nhãn thuốc DailyMed (mục Inactive ingredients)', country: 'Hoa Kỳ', sra: true,
      sourceUrl: it.set_id ? `https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=${it.set_id}` : 'https://dailymed.nlm.nih.gov/',
      excipients: ex.map((n) => ({ name: n, amount: '', role: '' })),
    });
  }
  // bỏ trùng theo bộ tá dược
  const seen = new Set(); const out = [];
  for (const p of sp) { const k = p.excipients.map((e) => boDau(e.name)).sort().join('|'); if (!seen.has(k)) { seen.add(k); out.push(p); } }
  return { san: out.slice(0, 5), loi: '' };
}

async function traEmc(axios, ds, nhom, dangVi, serperKey) {
  if (!serperKey) return { san: [], loi: 'thiếu khoá Serper' };
  const inn = ds.map((t, i) => (nhom[i] && nhom[i][0]) || t).join(' ');
  const tk = (EN_TU_KHOA[dangVi] || [''])[0];
  const lay = async (url) => {
    try { const r = await axios.get(url, { timeout: 25000, headers: { 'User-Agent': UA } }); return String(r.data); } catch (e) { /* thử proxy */ }
    try {
      const r2 = await axios.post('https://scrape.serper.dev', { url }, { headers: { 'X-API-KEY': serperKey, 'Content-Type': 'application/json' }, timeout: 40000 });
      return String((r2.data && r2.data.text) || '');
    } catch (e) { return ''; }
  };
  let links = [];
  try {
    const r = await axios.post('https://google.serper.dev/search', { q: `${inn} ${tk} SmPC "List of excipients" site:medicines.org.uk`, num: 8 },
      { headers: { 'X-API-KEY': serperKey, 'Content-Type': 'application/json' }, timeout: 25000 });
    links = ((r.data && r.data.organic) || []).filter((x) => /medicines\.org\.uk\/emc\/product/i.test(x.link)).slice(0, 4);
  } catch (e) { return { san: [], loi: e.message }; }
  const san = [];
  for (const l of links) {
    const html = await lay(l.link);
    const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
    const m = text.match(/6\.1\s*List of excipients\s*(.{20,1500}?)\s*6\.2\s*Incompatibilit/i);
    if (!m) continue;
    const tieuDe = text.slice(0, 400);
    // tiêu đề trang phải chứa các hoạt chất đã nhập
    if (!nhom.every((g) => g.some((v) => thanhPhanChuaGoc(l.title + ' ' + tieuDe, v) || khopThanhPhan(l.title + ' ' + tieuDe, v)))) continue;
    // dạng bào chế của SmPC (mục 3 Pharmaceutical form) phải khớp dạng đang nghiên cứu
    const m3 = text.match(/3.?s*PHARMACEUTICAL FORMs*(.{5,400}?)s*4.?s*CLINICAL/i);
    const dangText = (m3 && m3[1]) || l.title;
    const reD = DANG_EN[dangVi];
    if (reD && (!reD.test(dangText) || (LOAI_TRU[dangVi] && LOAI_TRU[dangVi].test(dangText)))) continue;
    const ex = tachTaDuoc(m[1]);
    if (ex.length < 2) continue;
    san.push({ productName: String(l.title || 'SmPC (eMC)').replace(/\s*[-|].*$/, '').trim(), nhaSanXuat: '',
      source: 'eMC – SmPC Anh (mục 6.1 List of excipients)', country: 'Anh', sra: true, sourceUrl: l.link,
      excipients: ex.map((n) => ({ name: n, amount: '', role: '' })), ghiChu: 'SmPC có thể gộp nhiều dạng/hàm lượng — đối chiếu trên trang nguồn.' });
  }
  return { san, loi: '' };
}

// Tên dạng bào chế tiếng Anh của một nguồn có đúng dạng đang nghiên cứu không
function khopDangEn(dangVi, text) {
  const re = DANG_EN[dangVi];
  if (!re) return true;
  return re.test(String(text || '')) && !(LOAI_TRU[dangVi] && LOAI_TRU[dangVi].test(String(text || '')));
}

module.exports = { traOpenFDA, traEmc, tachTaDuoc, nhomGoc, tuKhoaFDA, khopDangEn };
