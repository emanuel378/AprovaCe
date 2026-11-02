// Gera supabase/seed/*.sql a partir de data/questions/bank.json (colar no SQL Editor; sem service_role).
// Uso: node scripts/import/make-seed-sql.mjs
import fs from 'node:fs';

const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const DISC = [['Língua Portuguesa', 12], ['Raciocínio Lógico', 10], ['Atualidades / História do Ceará', 10], ['Administração Pública / Ética', 8],
  ['Direito Constitucional', 12], ['Direitos Humanos', 10], ['Direito Penal Militar / Processo Penal Militar', 12],
  ['Direito Penal e Processual Penal', 12], ['Criminologia', 8], ['Segurança Pública', 6]];
const q = (v) => (v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const bank = JSON.parse(fs.readFileSync('data/questions/bank.json', 'utf8'));

fs.mkdirSync('supabase/seed', { recursive: true });
const head = `insert into disciplinas (id,nome,questoes_prova,ordem) values\n${DISC.map(([n, c], i) => `(${q(slug(n))},${q(n)},${c},${i + 1})`).join(',\n')}\non conflict (id) do nothing;\n\n` +
  `insert into fontes (id,nome,ano,banca,oficial,pdf_path,gabarito_pdf_path) values\n${bank.fontes.map((f) => `(${q(f.id)},${q(f.nome)},${f.ano},${q(f.banca)},${f.oficial},${q(f.pdf)},${q(f.gabaritoPdf)})`).join(',\n')}\non conflict (id) do nothing;\n`;
fs.writeFileSync('supabase/seed/01_base.sql', head);

const discId = Object.fromEntries(DISC.map(([n]) => [n, slug(n)]));
for (const f of bank.fontes) {
  const rows = bank.questoes.filter((x) => x.fonteId === f.id).map((x) =>
    `(${q(x.id)},${q(x.fonteId)},${x.numero},${q(discId[x.disciplina] ?? null)},${q(x.enunciado)},${q(x.textoApoio)},${q(JSON.stringify(x.alternativas))}::jsonb,${q(x.gabarito)},${q(x.statusGabarito)},'{}')`);
  fs.writeFileSync(`supabase/seed/02_${f.id}.sql`,
    `insert into questoes (id,fonte_id,numero,disciplina_id,enunciado,texto_apoio,alternativas,gabarito,status_gabarito,revisar) values\n${rows.join(',\n')}\non conflict (id) do nothing;\n`);
}
console.log(fs.readdirSync('supabase/seed').map((n) => n + ' ' + fs.statSync('supabase/seed/' + n).size).join('\n'));
