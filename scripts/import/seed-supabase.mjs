// Carrega disciplinas, fontes e questões no Supabase. Idempotente (upsert).
// Uso: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import/seed-supabase.mjs
// A chave service_role fica só na sua máquina: nunca no front-end nem na Vercel.
import fs from 'node:fs';

const { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } = process.env;
if (!url || !key) throw new Error('defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY');

const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const DISC = [['Língua Portuguesa', 12], ['Raciocínio Lógico', 10], ['Atualidades / História do Ceará', 10], ['Administração Pública / Ética', 8],
  ['Direito Constitucional', 12], ['Direitos Humanos', 10], ['Direito Penal Militar / Processo Penal Militar', 12],
  ['Direito Penal e Processual Penal', 12], ['Criminologia', 8], ['Segurança Pública', 6]];
const discId = Object.fromEntries(DISC.map(([n]) => [n, slug(n)]));
discId['Direito Constitucional / Direitos Humanos'] = null; // FGV 2021 junta as duas: classificar na revisão

async function up(table, rows, conflict) {
  for (let i = 0; i < rows.length; i += 100) {
    const r = await fetch(`${url}/rest/v1/${table}?on_conflict=${conflict}`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify(rows.slice(i, i + 100)),
    });
    if (!r.ok) throw new Error(`${table}: ${r.status} ${await r.text()}`);
  }
  console.log(table, rows.length);
}

const bank = JSON.parse(fs.readFileSync('data/questions/bank.json', 'utf8'));
await up('disciplinas', DISC.map(([nome, q], i) => ({ id: slug(nome), nome, questoes_prova: q, ordem: i + 1 })), 'id');
await up('fontes', bank.fontes.map((f) => ({ id: f.id, nome: f.nome, ano: f.ano, banca: f.banca, oficial: f.oficial, pdf_path: f.pdf, gabarito_pdf_path: f.gabaritoPdf })), 'id');
await up('questoes', bank.questoes.map((q) => ({
  id: q.id, fonte_id: q.fonteId, numero: q.numero, disciplina_id: discId[q.disciplina] ?? null,
  enunciado: q.enunciado, texto_apoio: q.textoApoio, alternativas: q.alternativas,
  gabarito: q.gabarito, status_gabarito: q.statusGabarito, revisar: q.revisar,
})), 'id');
