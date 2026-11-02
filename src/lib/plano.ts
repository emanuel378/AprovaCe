// Montagem automática da semana de estudos: distribui blocos entre as disciplinas pelo peso na prova.
export type DiscPeso = { id: string; questoes_prova: number };
export type SessaoPlano = { data: string; disciplina_id: string | null; assunto_id: string | null; tipo: 'teoria' | 'questoes' | 'revisao'; duracao_min: number };
export type Revisao = { assunto_id: string; disciplina_id: string; data: string };

export function montarSemana(p: {
  datas: string[]; blocosPorDia: number; duracaoMin: number; discs: DiscPeso[];
  pendentes: Record<string, string[]>; // assuntos ainda não concluídos de cada disciplina, na ordem do edital
  revisoes: Revisao[];
}): SessaoPlano[] {
  const datas = [...p.datas].sort();
  const total = datas.length * p.blocosPorDia;
  const somaPesos = p.discs.reduce((s, d) => s + d.questoes_prova, 0);
  if (!total || !somaPesos) return [...revisoesComoSessoes(p.revisoes)].sort((a, b) => a.data.localeCompare(b.data));

  // Cota de blocos por disciplina (maior resto).
  const ideal = Object.fromEntries(p.discs.map((d) => [d.id, (total * d.questoes_prova) / somaPesos]));
  const cota: Record<string, number> = Object.fromEntries(p.discs.map((d) => [d.id, Math.floor(ideal[d.id])]));
  let sobra = total - Object.values(cota).reduce((s, v) => s + v, 0);
  for (const d of [...p.discs].sort((a, b) => ideal[b.id] - cota[b.id] - (ideal[a.id] - cota[a.id]))) {
    if (sobra-- <= 0) break;
    cota[d.id]++;
  }

  // Intercala as disciplinas (sempre a que mais tem blocos restantes, evitando repetir a anterior).
  const restante = { ...cota };
  const ordem: string[] = [];
  let anterior = '';
  for (let i = 0; i < total; i++) {
    const candidatas = p.discs.filter((d) => restante[d.id] > 0);
    const escolhida = [...candidatas].sort((a, b) => (restante[b.id] - restante[a.id]) || (a.id === anterior ? 1 : b.id === anterior ? -1 : 0))
      .find((d) => d.id !== anterior) ?? candidatas[0];
    restante[escolhida.id]--;
    ordem.push(escolhida.id);
    anterior = escolhida.id;
  }

  // Cada assunto ganha dois blocos seguidos: teoria e depois questões.
  const contador: Record<string, number> = {};
  const sessoes: SessaoPlano[] = ordem.map((disc, i) => {
    const k = contador[disc] = (contador[disc] ?? -1) + 1;
    const lista = p.pendentes[disc] ?? [];
    return {
      data: datas[Math.floor(i / p.blocosPorDia)], disciplina_id: disc,
      assunto_id: lista.length ? lista[Math.floor(k / 2) % lista.length] : null,
      tipo: lista.length && k % 2 === 0 ? 'teoria' : 'questoes', duracao_min: p.duracaoMin,
    };
  });
  return [...sessoes, ...revisoesComoSessoes(p.revisoes)].sort((a, b) => a.data.localeCompare(b.data));
}

function revisoesComoSessoes(rs: Revisao[]): SessaoPlano[] {
  return rs.map((r) => ({ data: r.data, disciplina_id: r.disciplina_id, assunto_id: r.assunto_id, tipo: 'revisao' as const, duracao_min: 30 }));
}
