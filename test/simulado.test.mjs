import test from 'node:test';
import assert from 'node:assert/strict';
import { sortear } from '../src/lib/simulado.ts';

const pool = [];
for (const [d, n] of [['a', 20], ['b', 10], ['c', 4]]) for (let i = 0; i < n; i++) pool.push({ id: `${d}${i}`, disciplina_id: d });
const seed = () => { let x = 42; return () => (x = (x * 1664525 + 1013904223) % 4294967296) / 4294967296; };
const conta = (ids) => ids.reduce((m, id) => ({ ...m, [id[0]]: (m[id[0]] ?? 0) + 1 }), {});

test('devolve n ids únicos', () => {
  const ids = sortear(pool, 17, { a: 12, b: 10, c: 6 }, seed());
  assert.equal(ids.length, 17);
  assert.equal(new Set(ids).size, 17);
});
test('distribui proporcional aos pesos', () => {
  const c = conta(sortear(pool, 14, { a: 8, b: 4, c: 2 }, seed()));
  assert.deepEqual(c, { a: 8, b: 4, c: 2 });
});
test('respeita o tamanho do grupo e completa com as demais', () => {
  const c = conta(sortear(pool, 30, { a: 1, b: 1, c: 10 }, seed()));
  assert.equal(c.c, 4);
  assert.equal(Object.values(c).reduce((s, v) => s + v, 0), 30);
});
test('n maior que o pool devolve tudo', () => {
  assert.equal(sortear(pool, 999, {}, seed()).length, pool.length);
});
