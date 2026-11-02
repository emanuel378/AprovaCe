// Merge parsed exams into data/questions/bank.json with source metadata.
import fs from 'node:fs';
const FONTES = [
  { id: 'pmce-2025', file: '_t25', ano: 2025, banca: 'CEV/UECE', nome: 'PMCE 2025 – Soldado (Gabarito 1)', pdf: 'pmce2025g1.pdf', gabaritoPdf: 'Gabarito2025.pdf', oficial: true },
  { id: 'pmce-2021', file: '_t21', ano: 2021, banca: 'FGV', nome: 'PMCE 2021 – Soldado (Tipo 1 Branca, gabarito Masculino T1)', pdf: 'fgv-2021-pm-ce-soldado-da-policia-militar-prova.pdf', gabaritoPdf: 'Gabarito2021MASCULINO.pdf', oficial: true },
  { id: 'simulado-2024-09-08', file: '_tsim', ano: 2024, banca: 'Simulado (terceiros)', nome: 'Simulado PMCE 08/09/2024', pdf: 'simulado-pmce-08092024 (1).pdf', gabaritoPdf: null, oficial: false },
];
const questoes = [];
for (const f of FONTES) {
  for (const q of JSON.parse(fs.readFileSync(`data/questions/${f.file}.json`, 'utf8')))
    questoes.push({ id: `${f.id}-q${String(q.numero).padStart(3, '0')}`, fonteId: f.id, ano: f.ano, banca: f.banca, ...q, assunto: null, comentario: null, comentarioStatus: null });
}
fs.writeFileSync('data/questions/bank.json', JSON.stringify({ fontes: FONTES, questoes }, null, 1));
const st = {}; questoes.forEach((q) => (st[q.fonteId + ' ' + q.statusGabarito] = (st[q.fonteId + ' ' + q.statusGabarito] || 0) + 1));
console.log(questoes.length, 'questões', st);
console.log('anuladas 2025:', questoes.filter((q) => q.statusGabarito === 'anulada').map((q) => q.numero).join(','));
