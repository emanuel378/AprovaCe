import test from 'node:test';
import assert from 'node:assert/strict';
import { rodandoSeg, pomodoro, estudado, exibicao, fmtRelogio, fmtDuracao } from '../src/lib/cronometro.ts';
import { montarSemana } from '../src/lib/plano.ts';

const t0 = new Date('2026-01-01T10:00:00Z').getTime();
const base = { modo: 'crescente', estado: 'rodando', segundos_efetivos: 100, ultimo_retomar: new Date(t0).toISOString(), config: {} };

test('rodandoSeg soma o acumulado ao tempo desde o último retomar', () => {
  assert.equal(rodandoSeg(base, t0 + 30_000), 130);
});
test('pausado não avança', () => {
  assert.equal(rodandoSeg({ ...base, estado: 'pausado', ultimo_retomar: null }, t0 + 999_000), 100);
});
test('pomodoro alterna foco e pausa e só conta o foco como estudo', () => {
  assert.deepEqual(pomodoro(600, 25, 5), { fase: 'foco', restante: 900, ciclo: 1, focoTotal: 600 });
  const p = pomodoro(25 * 60 + 120, 25, 5);
  assert.equal(p.fase, 'pausa');
  assert.equal(p.restante, 180);
  assert.equal(p.focoTotal, 25 * 60);
  assert.equal(pomodoro(30 * 60 + 60, 25, 5).ciclo, 2);
});
test('estudado no pomodoro descarta a pausa', () => {
  const c = { ...base, modo: 'pomodoro', segundos_efetivos: 27 * 60, ultimo_retomar: null, estado: 'pausado', config: { foco_min: 25, pausa_min: 5 } };
  assert.equal(estudado(c), 25 * 60);
});
test('regressivo termina em zero', () => {
  const c = { ...base, modo: 'regressivo', segundos_efetivos: 3000, config: { alvo_min: 50 } };
  assert.equal(exibicao(c, t0).segundos, 0);
  assert.equal(exibicao(c, t0).fim, true);
  assert.equal(exibicao({ ...c, segundos_efetivos: 600 }, t0).segundos, 2400);
});
test('formatação', () => {
  assert.equal(fmtRelogio(65), '1:05');
  assert.equal(fmtRelogio(3725), '1:02:05');
  assert.equal(fmtDuracao(3900), '1h 05min');
  assert.equal(fmtDuracao(1500), '25 min');
});

const discs = [{ id: 'a', questoes_prova: 12 }, { id: 'b', questoes_prova: 6 }, { id: 'c', questoes_prova: 2 }];
const datas = ['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08'];
const pendentes = { a: ['a1', 'a2'], b: ['b1'], c: [] };

test('montarSemana gera dias × blocos sessões, proporcional ao peso', () => {
  const s = montarSemana({ datas, blocosPorDia: 5, duracaoMin: 50, discs, pendentes, revisoes: [] });
  assert.equal(s.length, 20);
  const por = s.reduce((m, x) => ({ ...m, [x.disciplina_id]: (m[x.disciplina_id] ?? 0) + 1 }), {});
  assert.deepEqual(por, { a: 12, b: 6, c: 2 });
});
test('montarSemana alterna teoria e questões e evita a mesma disciplina em sequência', () => {
  const s = montarSemana({ datas, blocosPorDia: 5, duracaoMin: 50, discs, pendentes, revisoes: [] });
  const a = s.filter((x) => x.disciplina_id === 'a');
  assert.deepEqual(a.slice(0, 4).map((x) => `${x.assunto_id}:${x.tipo}`), ['a1:teoria', 'a1:questoes', 'a2:teoria', 'a2:questoes']);
  assert.equal(s.filter((x) => x.disciplina_id === 'c').every((x) => x.tipo === 'questoes' && x.assunto_id === null), true);
  for (let i = 1; i < s.length; i++) if (s[i].disciplina_id === s[i - 1].disciplina_id) assert.notEqual(s[i].disciplina_id, 'b');
});
test('montarSemana inclui revisões e aceita nenhum dia', () => {
  const r = [{ assunto_id: 'a1', disciplina_id: 'a', data: '2026-01-06' }];
  const s = montarSemana({ datas, blocosPorDia: 1, duracaoMin: 50, discs, pendentes, revisoes: r });
  assert.equal(s.filter((x) => x.tipo === 'revisao').length, 1);
  assert.equal(montarSemana({ datas: [], blocosPorDia: 3, duracaoMin: 50, discs, pendentes, revisoes: [] }).length, 0);
});
