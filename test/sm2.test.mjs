import test from 'node:test';
import assert from 'node:assert/strict';
import { proximo, somarDias } from '../src/lib/sm2.ts';

const novo = { repeticoes: 0, facilidade: 2.5, intervalo_dias: 0 };

test('bom: 1 dia, depois 6, depois multiplica pela facilidade', () => {
  const a = proximo(novo, 'bom');
  assert.equal(a.intervalo_dias, 1);
  const b = proximo(a, 'bom');
  assert.equal(b.intervalo_dias, 6);
  assert.equal(proximo(b, 'bom').intervalo_dias, 15);
});
test('errei zera repetições, volta em 1 dia e reduz a facilidade', () => {
  const r = proximo({ repeticoes: 5, facilidade: 2.5, intervalo_dias: 40 }, 'errei');
  assert.deepEqual(r, { repeticoes: 0, facilidade: 2.3, intervalo_dias: 1 });
});
test('facilidade nunca passa de 1.3 para baixo', () => {
  let e = { repeticoes: 1, facilidade: 1.4, intervalo_dias: 3 };
  for (let i = 0; i < 5; i++) e = proximo(e, 'errei');
  assert.equal(e.facilidade, 1.3);
});
test('fácil espaça mais que bom; difícil espaça menos', () => {
  const e = { repeticoes: 3, facilidade: 2.5, intervalo_dias: 10 };
  assert.ok(proximo(e, 'facil').intervalo_dias > proximo(e, 'bom').intervalo_dias);
  assert.ok(proximo(e, 'dificil').intervalo_dias < proximo(e, 'bom').intervalo_dias);
});
test('somarDias avança a data', () => {
  assert.equal(somarDias(3, new Date(2026, 0, 30)), '2026-02-02');
});
