import test from 'node:test';
import assert from 'node:assert/strict';
import { mesclarPlano, montarPrompt, minutosAlvo, montarEsqueleto } from '../src/lib/ia-plano.ts';

const ctx = {
  datas: ['2026-02-02', '2026-02-03', '2026-02-04'], minutosPorDia: 150,
  discs: [{ id: 'port', nome: 'Português', questoes_prova: 12 }, { id: 'rl', nome: 'Raciocínio', questoes_prova: 10 }, { id: 'crim', nome: 'Criminologia', questoes_prova: 8 }],
  assuntos: [{ id: 'port-01', disciplina_id: 'port', nome: 'Leitura' }, { id: 'port-02', disciplina_id: 'port', nome: 'Estrutura' }, { id: 'rl-01', disciplina_id: 'rl', nome: 'Aritmética' }, { id: 'crim-01', disciplina_id: 'crim', nome: 'Crime' }],
};
const pendentes = { port: [{ id: 'port-01', nome: 'Leitura' }, { id: 'port-02', nome: 'Estrutura' }], rl: [{ id: 'rl-01', nome: 'Aritmética' }], crim: [{ id: 'crim-01', nome: 'Crime' }] };
const ped = { foco: [], desempenho: {} };

test('esqueleto: respeita os minutos por dia e inclui todas as matérias', () => {
  const b = montarEsqueleto(ctx, ped);
  const porDia = {};
  for (const x of b) porDia[x.data] = (porDia[x.data] ?? 0) + x.duracao_min;
  assert.deepEqual(Object.values(porDia), [150, 150, 150]);
  assert.equal(new Set(b.map((x) => x.disciplina_id)).size, 3);
  assert.deepEqual(b.map((x) => x.i), b.map((_, i) => i));
});
test('esqueleto: o peso e o foco mudam a divisão', () => {
  const conta = (b) => b.reduce((m, x) => ({ ...m, [x.disciplina_id]: (m[x.disciplina_id] ?? 0) + x.duracao_min }), {});
  const base = conta(montarEsqueleto(ctx, ped));
  const foco = conta(montarEsqueleto(ctx, { foco: ['crim'], desempenho: { crim: { acerto_pct: 20, concluidos: 0, total: 8 } } }));
  assert.equal(base.port >= base.crim, true);
  assert.equal(foco.crim > base.crim, true);
});
test('minutosAlvo soma ~ o total e reforça foco', () => {
  const sem = minutosAlvo(ctx, ped);
  assert.equal(Math.abs(Object.values(sem).reduce((s, v) => s + v, 0) - 450) <= 15, true);
  assert.equal(minutosAlvo(ctx, { foco: ['rl'], desempenho: {} }).rl > sem.rl, true);
});

test('mesclar: usa a resposta da IA e mantém dia, disciplina e duração do esqueleto', () => {
  const b = montarEsqueleto(ctx, ped);
  const bruto = { resumo: ' Foco geral. ', blocos: b.map((x) => ({ i: x.i, assunto_id: pendentes[x.disciplina_id][0].id, tipo: 'questoes', meta: 'Resolver questões' })) };
  const r = mesclarPlano(bruto, b, ctx, pendentes);
  assert.equal(r.sessoes.length, b.length);
  assert.equal(r.ajustes, 0);
  assert.equal(r.resumo, 'Foco geral.');
  assert.equal(r.sessoes.every((s, i) => s.data === b[i].data && s.disciplina_id === b[i].disciplina_id && s.duracao_min === b[i].duracao_min), true);
});
test('mesclar: corrige assunto de outra disciplina, tipo inválido e bloco esquecido', () => {
  const b = montarEsqueleto(ctx, ped);
  const alvo = b[0].disciplina_id;
  const errado = alvo === 'port' ? 'rl-01' : 'port-01';
  const r = mesclarPlano({ blocos: [{ i: 0, assunto_id: errado, tipo: 'descanso', meta: 'x' }] }, b, ctx, pendentes);
  assert.equal(r.sessoes.length, b.length);
  assert.equal(r.ajustes, b.length); // 1 por erro no bloco 0 + 1 por cada bloco esquecido
  assert.equal(['teoria', 'questoes'].includes(r.sessoes[0].tipo), true);
  assert.equal(ctx.assuntos.find((a) => a.id === r.sessoes[0].assunto_id)?.disciplina_id, alvo);
});
test('mesclar: resposta sem blocos ou lixo devolve null', () => {
  const b = montarEsqueleto(ctx, ped);
  for (const lixo of [null, 'texto', 42, { blocos: 'x' }, { blocos: [null, 3] }]) assert.equal(mesclarPlano(lixo, b, ctx, pendentes), null);
});
test('o prompt leva os blocos, os ids e as regras', () => {
  const b = montarEsqueleto(ctx, ped);
  const p = montarPrompt(ctx, { dataProva: null, foco: ['port'], observacoes: 'só à noite', atrasadas: 2, desempenho: { port: { acerto_pct: 40, concluidos: 1, total: 16 } }, pendentes, revisoes: [] }, b);
  assert.match(p.user, /02-02|D1/); // data curta MM-DD
  assert.match(p.user, /D1.01/); // alias curto no lugar do id
  assert.doesNotMatch(p.user, /port-01/);
  assert.match(p.user, /só à noite/);
  assert.match(p.system, /SOMENTE/);
  assert.match(p.system, /exatamente um item para cada bloco/);
});

test('mesclar: aceita o formato curto da IA (alias, chaves a/t/m)', () => {
  const b = montarEsqueleto(ctx, ped);
  const i = b.findIndex((x) => x.disciplina_id === 'port');
  const bruto = { blocos: b.map((x) => ({ i: x.i, a: x.disciplina_id === 'port' ? 'D1.02' : null, t: 'teoria', m: 'Estudar' })) };
  const r = mesclarPlano(bruto, b, ctx, pendentes);
  assert.equal(r.sessoes[i].assunto_id, 'port-02');
  assert.equal(r.sessoes[i].meta, 'Estudar');
});
