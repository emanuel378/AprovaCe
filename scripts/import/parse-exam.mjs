// Parse exam text (pdftotext, reading order) into question JSON.
// usage: node parse-exam.mjs <2025|2021> <exam.txt> <answers csv or ""> <out.json>
import fs from 'node:fs';

const [kind, txtPath, answersArg, outPath] = process.argv.slice(2);
const raw = fs.readFileSync(txtPath, 'utf8').replace(/\r/g, '');

const NOISE = [
  /^O número do gabarito deste caderno/, /^Página \d+$/, /^GOVERNO DO ESTADO DO CEARÁ –/,
  /^Soldado da PM-CE$/, /^ΠΜΧΕ$/, /^Tipo 1 – Cor BRANCA/, /^Concurso Público PMCE 2021$/, /^FGV Conhecimento$/,
  /^Licenciado para -/,
];
const lines = raw.split('\n').map((l) => l.trim()).filter((l) => l && !NOISE.some((r) => r.test(l)));

const CUM25 = [[12, 'Língua Portuguesa'], [22, 'Raciocínio Lógico'], [32, 'Atualidades / História do Ceará'],
  [40, 'Administração Pública / Ética'], [52, 'Direito Constitucional'], [62, 'Direitos Humanos'],
  [74, 'Direito Penal Militar / Processo Penal Militar'], [86, 'Direito Penal e Processual Penal'],
  [94, 'Criminologia'], [100, 'Segurança Pública']];
const HEAD21 = { 'Língua Portuguesa': 'Língua Portuguesa', 'Raciocínio Lógico': 'Raciocínio Lógico',
  'Atualidades - História do Ceará': 'Atualidades / História do Ceará', 'Administração Pública - Ética': 'Administração Pública / Ética',
  'Direito Constitucional – Direitos Humanos': 'Direito Constitucional / Direitos Humanos',
  'Direito Penal Militar e Processual Militar': 'Direito Penal Militar / Processo Penal Militar',
  'Direito Penal': 'Direito Penal e Processual Penal', 'Criminologia': 'Criminologia', 'Segurança Pública': 'Segurança Pública' };

const HEADSIM = { 'LINGUA PORTUGUESA': 'Língua Portuguesa', 'RACIOCINIO LÓGICO': 'Raciocínio Lógico', 'ATUALIDADES': 'Atualidades / História do Ceará',
  'HISTÓRIA DO CEARÁ': 'Atualidades / História do Ceará', 'ADMINISTRAÇÃO PÚBLICA': 'Administração Pública / Ética', 'DIREITO CONSTITUCIONAL': 'Direito Constitucional',
  'DIREITOS HUMANOS': 'Direitos Humanos', 'DIREITO PENAL MILITAR': 'Direito Penal Militar / Processo Penal Militar', 'DIREITO PENAL': 'Direito Penal e Processual Penal',
  'CRIMINOLOGIA': 'Criminologia', 'SEGURANÇA PÚBLICA': 'Segurança Pública' };
// 1) split into raw question blocks
const blocks = []; // {num, text, preamble}
let cur = null, pre = [];
const start25 = /^(\d{2,3})\.\s(.*)$/, start21 = /^(\d{1,2})$/, startSim = /^(\d{1,3})-(.*)$/;
let disc21 = 'Língua Portuguesa';
let apoio25 = null; // shared reading text printed before Q01 (2025: Texto I, Q01-12)
const queue = [...lines];
for (let l; (l = queue.shift()) !== undefined;) {
  if (kind === 'sim' && cur) { // next question may start mid-line ("... E. paz 50-A vedação")
    const k = l.search(new RegExp('\\s' + (cur.num + 1) + '-(?=\\S)'));
    if (k > 0) { queue.unshift(l.slice(k + 1)); l = l.slice(0, k); }
  }
  if (kind === '2021' && HEAD21[l]) { disc21 = HEAD21[l]; continue; }
  if (kind === 'sim' && HEADSIM[l]) { disc21 = HEADSIM[l]; continue; }
  if (kind === 'sim' && l === 'GABARITO') break;
  const m = kind === '2025' ? l.match(start25) : kind === 'sim' ? l.match(startSim) : l.match(start21);
  if (kind === '2025' && !cur && /^Texto I(\s|$)/.test(l)) apoio25 = [];
  if (apoio25 && !cur && !start25.test(l)) { apoio25.push(l); continue; }
  const seen = (n) => blocks.some((x) => x.num === n);
  const ok = m && (kind === '2025' ? +m[1] <= 100 && !seen(+m[1]) : +m[1] === (cur ? cur.num + 1 : 1));
  if (ok) {
    cur = { num: +m[1], text: kind === '2025' || kind === 'sim' ? m[2] : '', disc21 };
    blocks.push(cur);
  } else if (cur) cur.text += ' ' + l;
}
// 2025 pages are laid out in two columns, so numbers can come out of order; sort and re-join
blocks.sort((a, b) => a.num - b.num);

// 2) split stem / alternatives
const LET = 'ABCDE';
function split(text) {
  const t = text.replace(/\s+/g, ' ').trim();
  const re = kind === 'sim' ? /(?:^|\s)([A-E])\.\s/g : kind === '2025' ? /(?:^|\s)([A-E])\)\s/g : /\(([A-E])\)\s/g;
  const hits = []; let m;
  while ((m = re.exec(t))) hits.push({ l: m[1], i: m.index, end: re.lastIndex });
  // choose last in-order A..E chain
  let best = null;
  for (let a = 0; a < hits.length; a++) {
    if (hits[a].l !== 'A') continue;
    const chain = [hits[a]]; let next = 1;
    for (let k = a + 1; k < hits.length && next < 5; k++) if (hits[k].l === LET[next]) { chain.push(hits[k]); next++; }
    if (chain.length === 5) best = chain; // later A wins -> alternatives, not inline "A)" in stem
  }
  if (!best) return { stem: t, alts: null };
  const alts = best.map((h, k) => ({ letter: h.l, text: t.slice(h.end, k < 4 ? best[k + 1].i : undefined).trim() }));
  return { stem: t.slice(0, best[0].i).trim(), alts };
}

// 3) answers
const ans = answersArg ? answersArg.split(',') : [];
const out = blocks.map((b) => {
  const { stem, alts } = split(b.text);
  const a = ans[b.num - 1];
  const flags = [];
  let enun = stem, alt = alts;
  if (alt) { const e = alt[4]; const h = e.text.match(/\s+([A-ZÁÉÍÓÚÇÃÕ\/ ]{8,})$/); if (h) e.text = e.text.slice(0, h.index).trim(); }
  if (/(figura|tabela|gráfico|imagem|quadro|tirinha|charge|mapa)/i.test(stem)) flags.push('pode-ter-imagem');
  if (!alts) flags.push('sem-alternativas');
  if (alts && alts.some((x) => x.text.length < 1)) flags.push('alternativa-vazia');
  if (!a) flags.push('sem-gabarito');
  const disc = kind === '2025' ? CUM25.find(([n]) => b.num <= n)[1] : b.disc21;
  const oficial = kind === 'sim' ? 'terceiros-nao-oficial' : 'oficial-definitivo';
  return {
    numero: b.num, disciplina: disc, textoApoio: kind === '2025' && b.num <= 12 && apoio25 ? apoio25.join(' ') : null, enunciado: stem, alternativas: alts,
    gabarito: a === 'X' ? null : a ?? null,
    statusGabarito: a === 'X' ? 'anulada' : a ? oficial : 'nao-confirmado',
    revisar: flags,
  };
});
fs.writeFileSync(outPath, JSON.stringify(out, null, 1));
const bad = out.filter((q) => q.revisar.length);
console.log(`${out.length} questões; ${bad.length} p/ revisão`, bad.map((q) => q.numero + ':' + q.revisar).join(' '));
const byD = {}; out.forEach((q) => (byD[q.disciplina] = (byD[q.disciplina] || 0) + 1)); console.log(byD);
