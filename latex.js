// Đổi công thức LaTeX (do AI đôi khi viết) về chữ thường đọc được — trang không có bộ vẽ LaTeX nên
// nếu để nguyên sẽ hiện ký tự lạ như \[ \text{...} \frac{..}{..} \times.
const SUB = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉' };
const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '-': '⁻', '+': '⁺' };
const KY_HIEU = [
  [/\\times/g, '×'], [/\\cdot/g, '·'], [/\\div/g, '÷'], [/\\pm/g, '±'], [/\\mp/g, '∓'],
  [/\\leq?\b/g, '≤'], [/\\geq?\b/g, '≥'], [/\\neq?\b/g, '≠'], [/\\approx/g, '≈'], [/\\sim/g, '~'],
  [/\\rightarrow|\\to\b/g, '→'], [/\\leftarrow/g, '←'], [/\\mu\b/g, 'µ'], [/\\Delta/g, 'Δ'], [/\\delta/g, 'δ'],
  [/\\alpha/g, 'α'], [/\\beta/g, 'β'], [/\\lambda/g, 'λ'], [/\\sigma/g, 'σ'], [/\\Sigma|\\sum/g, 'Σ'],
  [/\\degree|\^\{?\\circ\}?/g, '°'], [/\\infty/g, '∞'], [/\\%/g, '%'], [/\\_/g, '_'], [/\\&/g, '&'],
];

function latexToPlain(input) {
  if (typeof input !== 'string' || !/[\\$]|\^\{|_\{/.test(input)) return input;
  let s = input;
  // khung công thức
  s = s.replace(/\\\[([\s\S]*?)\\\]/g, (m, g) => ' ' + g + ' ').replace(/\\\(([\s\S]*?)\\\)/g, '$1').replace(/\$\$([\s\S]*?)\$\$/g, ' $1 ');
  s = s.replace(/\$([^$\n]*[\\^_][^$\n]*)\$/g, '$1');
  // \left( \right) \big...
  s = s.replace(/\\(left|right|big|Big|bigg|Bigg)\s*([()\[\]|.])/g, (m, a, b) => (b === '.' ? '' : b));
  // \text{..}, \mathrm{..}, \mathbf{..}, \textbf{..}, \operatorname{..} → nội dung
  for (let i = 0; i < 4; i++) s = s.replace(/\\(?:text|mathrm|mathbf|mathit|textbf|textit|operatorname|mbox)\s*\{([^{}]*)\}/g, '$1');
  // chỉ số dưới/trên dạng _{...} ^{...} → _x ^x (làm trước \frac để hết ngoặc lồng)
  s = s.replace(/_\{(\d+)\}/g, (m, a) => [...a].map((c) => SUB[c]).join('')).replace(/\^\{([-+]?\d+)\}/g, (m, a) => [...a].map((c) => SUP[c] || c).join(''));
  s = s.replace(/_\{([^{}]*)\}/g, '_$1').replace(/\^\{([^{}]*)\}/g, '^$1');
  // \frac{a}{b} → (a / b)  (lồng nhau: xử lý từ trong ra ngoài)
  for (let i = 0; i < 6; i++) s = s.replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, (m, a, b) => `(${a.trim()} / ${b.trim()})`);
  s = s.replace(/\\sqrt\s*\{([^{}]*)\}/g, '√($1)');
  for (const [re, r] of KY_HIEU) s = s.replace(re, r);
  // chỉ số dưới/trên
  s = s.replace(/_\{(\d+)\}|_(\d)/g, (m, a, b) => [...(a || b)].map((c) => SUB[c]).join(''));
  s = s.replace(/\^\{([-+]?\d+)\}|\^([-+]?\d)/g, (m, a, b) => [...(a || b)].map((c) => SUP[c] || c).join(''));
  s = s.replace(/_\{([^{}]*)\}/g, '_$1').replace(/\^\{([^{}]*)\}/g, '^$1');
  // lệnh LaTeX còn sót
  s = s.replace(/\\[,;:!]/g, ' ').replace(/\\(quad|qquad|hspace\{[^}]*\}|newline|\\)/g, ' ').replace(/\\[a-zA-Z]+\*?/g, '');
  s = s.replace(/µ\s+g\b/g, 'µg').replace(/µ\s+L\b/g, 'µL').replace(/µ\s+m\b/g, 'µm');
  s = s.replace(/[{}]/g, '').replace(/[ \t]{2,}/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

function sanDeep(v) {
  if (typeof v === 'string') return latexToPlain(v);
  if (Array.isArray(v)) return v.map(sanDeep);
  if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = sanDeep(v[k]); return o; }
  return v;
}

module.exports = { latexToPlain, sanDeep };
