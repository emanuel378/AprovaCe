// Extract answer keys from pdftotext -layout output. usage: node gabarito.mjs <2025|2021> <txt>  -> csv of letters
import fs from 'node:fs';
const [kind, p] = process.argv.slice(2);
const t = fs.readFileSync(p, 'utf8').replace(/\r/g, '');
const L = t.split('\n');
let start, per, total;
if (kind === '2025') { start = L.findIndex((l) => /GABARITO 1 – DEFINITIVO/.test(l)); per = 25; total = 100; }
else { start = L.findIndex((l) => /Masculino – Tipo 1/.test(l)); per = 20; total = 80; }
const letters = [];
let i = start + 1;
while (letters.length < total && i < L.length) {
  if (/^\s*\d+(\s+\d+)+\s*$/.test(L[i])) {            // number row
    i++; while (!L[i].trim()) i++;                     // 2021 has a blank line between rows
    const row = L[i].replace(/\s+/g, '');              // answer row; spaces carry no info
    if (row.length !== per) throw new Error(`linha ${i + 1}: ${row.length} letras, esperado ${per}: ${row}`);
    letters.push(...row);
  }
  i++;
}
if (letters.length !== total) throw new Error('total ' + letters.length);
console.log(letters.join(','));
