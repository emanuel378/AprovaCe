// Liga cada questão a um assunto e gera supabase/seed/04_assuntos_extras.sql e 05_classificacao.sql.
// Assunto 01..NN = item do edital (03_assuntos.sql). 90+ = assunto extra (origem 'pedagogico'): conteúdo que a prova
// cobrou mas o edital não lista. Classificação feita lendo cada enunciado; revisar com `revisar` se discordar.
// Uso: node scripts/import/make-classificacao-sql.mjs
import fs from 'node:fs';

const FONTE = { '25': 'pmce-2025', '21': 'pmce-2021', sim: 'simulado-2024-09-08' };

// disciplina -> fonte -> { número da questão: número do assunto }
const MAPA = {
  'lingua-portuguesa': {
    '25': { 1: 1, 2: 2, 3: 3, 4: 4, 5: 9, 6: 14, 7: 16, 8: 8, 9: 6, 10: 6, 11: 12, 12: 7 },
    '21': { 1: 2, 2: 1, 3: 5, 4: 1, 5: 1, 6: 1, 7: 1, 8: 1, 9: 1, 10: 1 },
    sim: { 1: 1, 2: 2, 3: 4, 4: 15, 5: 10, 6: 10, 7: 11, 8: 16, 9: 15, 10: 11, 11: 9, 12: 9 },
  },
  'raciocinio-logico': {
    '25': { 13: 9, 14: 2, 15: 2, 16: 5, 17: 4, 18: 8, 19: 1, 20: 9, 21: 9, 22: 6 },
    '21': { 11: 9, 12: 9, 13: 11, 14: 2, 15: 9, 16: 9, 17: 9, 18: 8, 19: 10, 20: 10 },
    sim: { 13: 2, 14: 2, 15: 4, 16: 8, 17: 5, 18: 5, 19: 9, 20: 2, 21: 8, 22: 2 },
  },
  'atualidades-historia-do-ceara': {
    '25': { 23: 1, 24: 4, 25: 3, 26: 6, 27: 7, 28: 6, 29: 11, 30: 15, 31: 14, 32: 9 },
    '21': { 21: 4, 22: 1, 23: 4, 24: 6, 25: 4, 26: 7, 27: 9, 28: 14, 29: 15, 30: 10 },
    sim: { 23: 1, 24: 3, 25: 5, 26: 4, 27: 4, 28: 90, 29: 90, 30: 90, 31: 90, 32: 90 },
  },
  'administracao-publica-etica': {
    '25': { 33: 2, 34: 3, 35: 7, 36: 6, 37: 8, 38: 10, 39: 11, 40: 13 },
    '21': { 31: 15, 32: 15, 33: 14, 34: 15, 35: 6, 36: 6, 37: 6, 38: 7, 39: 3, 40: 1 },
    sim: { 33: 11, 34: 4, 35: 11, 36: 13, 37: 14, 38: 11, 39: 11, 40: 1 },
  },
  'direito-constitucional': {
    '25': { 41: 3, 42: 1, 43: 3, 44: 5, 45: 5, 46: 6, 47: 9, 48: 8, 49: 10, 50: 9, 51: 11, 52: 11 },
    '21': { 41: 1, 42: 1, 43: 3, 44: 5, 45: 7, 46: 8, 47: 8, 48: 9, 49: 10 }, // 41-49: no banco vinham como "Dir. Const. / Dir. Humanos"
    sim: { 41: 4, 42: 4, 43: 4, 44: 10, 45: 5, 46: 2, 47: 6, 48: 1, 49: 1, 50: 4, 51: 8, 52: 8 },
  },
  'direitos-humanos': {
    '25': { 53: 2, 54: 12, 55: 5, 56: 3, 57: 4, 58: 5, 59: 11, 60: 6, 61: 8, 62: 10 },
    '21': { 50: 5, 51: 6, 52: 13 },
    sim: { 53: 1, 54: 1, 55: 1, 56: 1, 57: 1, 58: 1, 59: 3, 60: 3, 61: 13, 62: 1 },
  },
  'direito-penal-militar-processo-penal-militar': {
    '25': { 63: 2, 64: 3, 65: 16, 66: 4, 67: 7, 68: 6, 69: 8, 70: 1, 71: 11, 72: 12, 73: 15, 74: 14 },
    '21': { 53: 11, 54: 11, 55: 4, 56: 11, 57: 5, 58: 1, 59: 11, 60: 1, 61: 7, 62: 2 },
    sim: { 63: 11, 64: 11, 65: 11, 66: 7, 67: 11, 68: 15, 69: 15, 70: 15, 71: 12, 72: 10, 73: 11, 74: 11 },
  },
  'direito-penal-e-processual-penal': {
    '25': { 75: 1, 76: 2, 77: 3, 78: 8, 79: 9, 80: 3, 81: 4, 82: 4, 83: 5, 84: 6, 85: 5, 86: 1 },
    '21': { 63: 6, 64: 1, 65: 3, 66: 3, 67: 5, 68: 5 },
    sim: { 75: 91, 76: 91, 77: 91, 78: 91, 79: 90, 80: 91, 81: 90, 82: 92, 83: 90, 84: 90, 85: 92, 86: 91 },
  },
  'criminologia': {
    '25': { 87: 5, 88: 2, 89: 2, 90: 2, 91: 4, 92: 4, 93: 6, 94: 8 },
    '21': { 69: 90, 70: 90, 71: 1, 72: 2, 73: 6, 74: 4 },
    sim: { 87: 91, 88: 90, 89: 90, 90: 91, 91: 90, 92: 91, 93: 6, 94: 90 },
  },
  'seguranca-publica': {
    '25': { 95: 1, 96: 1, 97: 3, 98: 4, 99: 5, 100: 4 },
    '21': { 75: 1, 76: 8, 77: 7, 78: 2, 79: 3, 80: 4 },
    sim: { 95: 90, 96: 90, 97: 90, 98: 91, 99: 7, 100: 91 },
  },
};

const EXTRAS = {
  'atualidades-historia-do-ceara': { 90: 'Conhecimentos locais: Caucaia e Região Metropolitana do Cariri' },
  'direito-penal-e-processual-penal': {
    90: 'Direito Penal – parte geral (lei penal, imputabilidade, culpabilidade, concurso de pessoas)',
    91: 'Direito Penal – parte especial (crimes em espécie)',
    92: 'Legislação penal especial (Lei de Drogas e Sisnad)',
  },
  'criminologia': { 90: 'Escolas e teorias criminológicas', 91: 'Vitimologia e técnicas de investigação criminológica' },
  'seguranca-publica': { 90: 'Atividade de inteligência', 91: 'Hierarquia, disciplina e conhecimentos técnico-policiais' },
};

const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
const assuntoId = (disc, n) => `${disc}-${String(n).padStart(2, '0')}`;

const edital = fs.readFileSync('supabase/seed/03_assuntos.sql', 'utf8');
const existentes = new Set([...edital.matchAll(/\('([^']+)','[^']+','/g)].map((m) => m[1]));
const extraIds = new Set(Object.entries(EXTRAS).flatMap(([d, o]) => Object.keys(o).map((n) => assuntoId(d, n))));

const bank = JSON.parse(fs.readFileSync('data/questions/bank.json', 'utf8'));
const idsBanco = new Set(bank.questoes.map((x) => x.id));
const linhas = [];
const vistos = new Set();
for (const [disc, porFonte] of Object.entries(MAPA)) {
  for (const [f, qs] of Object.entries(porFonte)) {
    for (const [num, n] of Object.entries(qs)) {
      const id = `${FONTE[f]}-q${String(num).padStart(3, '0')}`;
      const aid = assuntoId(disc, n);
      if (!idsBanco.has(id)) throw new Error(`questão inexistente no banco: ${id}`);
      if (vistos.has(id)) throw new Error(`questão classificada duas vezes: ${id}`);
      if (!existentes.has(aid) && !extraIds.has(aid)) throw new Error(`assunto inexistente: ${aid} (${id})`);
      vistos.add(id);
      linhas.push(`(${q(id)},${q(disc)},${q(aid)})`);
    }
  }
}
const faltam = [...idsBanco].filter((i) => !vistos.has(i));
if (faltam.length) throw new Error(`sem classificação: ${faltam.join(', ')}`);

const extras = Object.entries(EXTRAS).flatMap(([d, o]) => Object.entries(o).map(([n, nome]) => `(${q(assuntoId(d, n))},${q(d)},${q(nome)},'pedagogico',${n})`));
fs.writeFileSync('supabase/seed/04_assuntos_extras.sql',
  `insert into assuntos (id,disciplina_id,nome,origem,ordem) values\n${extras.join(',\n')}\non conflict (id) do nothing;\n`);
fs.writeFileSync('supabase/seed/05_classificacao.sql',
  `-- Define disciplina e assunto de cada questão (inclui as 12 de 2021 que estavam sem disciplina).\nupdate questoes q set disciplina_id = v.d, assunto_id = v.a\nfrom (values\n${linhas.join(',\n')}\n) as v(id,d,a) where q.id = v.id;\n`);
console.log(`${linhas.length} questões classificadas; ${extras.length} assuntos extras`);
