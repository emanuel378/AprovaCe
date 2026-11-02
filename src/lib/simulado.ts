// Sorteio de questões para o simulado: distribui por disciplina conforme os pesos (nº de questões da prova oficial).
export type Item = { id: string; disciplina_id: string | null };

export function embaralhar<T>(a: T[], rnd: () => number): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

export function sortear(pool: Item[], n: number, pesos: Record<string, number>, rnd: () => number = Math.random): string[] {
  const grupos = new Map<string, string[]>();
  for (const it of pool) {
    const k = it.disciplina_id ?? '_';
    grupos.set(k, [...(grupos.get(k) ?? []), it.id]);
  }
  const total = Math.min(n, pool.length);
  const chaves = [...grupos.keys()];
  const peso = (k: string) => pesos[k] ?? 1;
  const somaPesos = chaves.reduce((s, k) => s + peso(k), 0);
  const ideal: Record<string, number> = {};
  const qtd: Record<string, number> = {};
  for (const k of chaves) {
    ideal[k] = (total * peso(k)) / somaPesos;
    qtd[k] = Math.min(Math.floor(ideal[k]), grupos.get(k)!.length);
  }
  // Sobras: vão para a disciplina mais "devedora" (ideal - já alocado) que ainda tem questões.
  let sobra = total - chaves.reduce((s, k) => s + qtd[k], 0);
  while (sobra-- > 0) {
    const k = chaves.filter((c) => qtd[c] < grupos.get(c)!.length).sort((a, b) => ideal[b] - qtd[b] - (ideal[a] - qtd[a]))[0];
    qtd[k]++;
  }
  return embaralhar(chaves.flatMap((k) => embaralhar(grupos.get(k)!, rnd).slice(0, qtd[k])), rnd);
}
