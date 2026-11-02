// Cronograma com IA. O código monta o esqueleto (qual matéria em cada bloco de cada dia, respeitando peso e tempo);
// a IA escolhe o assunto, o tipo e a meta de cada bloco. Assim a distribuição não depende de a IA obedecer.
// O pedido usa aliases curtos (D1, D1.03…) no lugar dos ids: o plano gratuito da Groq limita os tokens por minuto.
import { montarSemana } from './plano.ts';

export type TipoSessao = 'teoria' | 'questoes' | 'revisao' | 'flashcards' | 'simulado';
export const TIPOS_IA: TipoSessao[] = ['teoria', 'questoes', 'revisao', 'flashcards', 'simulado'];

export type SessaoIA = { data: string; disciplina_id: string | null; assunto_id: string | null; tipo: TipoSessao; duracao_min: number; meta: string | null };
export type Bloco = { i: number; data: string; disciplina_id: string; duracao_min: number };

export type ContextoIA = {
  datas: string[]; // dias em que o aluno estuda (yyyy-mm-dd)
  minutosPorDia: number;
  discs: { id: string; nome: string; questoes_prova: number }[];
  assuntos: { id: string; disciplina_id: string; nome: string }[]; // só assuntos válidos para o plano
};

export type PedidoIA = {
  dataProva: string | null; foco: string[]; observacoes: string; atrasadas: number;
  desempenho: Record<string, { acerto_pct: number | null; concluidos: number; total: number }>;
  pendentes: Record<string, { id: string; nome: string; acerto?: string }[]>;
  revisoes: { assunto_id: string; data: string }[];
};

/** Minutos-alvo de cada disciplina: proporcional ao peso na prova, com reforço para as de foco e as de baixo acerto. */
export function minutosAlvo(ctx: ContextoIA, p: Pick<PedidoIA, 'foco' | 'desempenho'>): Record<string, number> {
  const total = ctx.datas.length * ctx.minutosPorDia;
  const soma = ctx.discs.reduce((n, d) => n + pesoAjustado(d, p), 0) || 1;
  return Object.fromEntries(ctx.discs.map((d) => [d.id, Math.round(((total * pesoAjustado(d, p)) / soma) / 5) * 5]));
}
function pesoAjustado(d: ContextoIA['discs'][number], p: Pick<PedidoIA, 'foco' | 'desempenho'>): number {
  const acerto = p.desempenho[d.id]?.acerto_pct;
  return d.questoes_prova * (p.foco.includes(d.id) ? 1.5 : 1) * (acerto !== null && acerto !== undefined && acerto < 50 ? 1.3 : 1);
}

/** Divide cada dia em blocos de ~50 min e distribui as disciplinas entre eles pelo peso ajustado, intercalando-as. */
export function montarEsqueleto(ctx: ContextoIA, p: Pick<PedidoIA, 'foco' | 'desempenho'>): Bloco[] {
  const porDia = Math.max(1, Math.round(ctx.minutosPorDia / 50));
  const duracao = Math.max(15, Math.min(120, Math.round(ctx.minutosPorDia / porDia / 5) * 5));
  const discs = ctx.discs.map((d) => ({ id: d.id, questoes_prova: pesoAjustado(d, p) }));
  return montarSemana({ datas: ctx.datas, blocosPorDia: porDia, duracaoMin: duracao, discs, pendentes: {}, revisoes: [] })
    .map((s, i) => ({ i, data: s.data, disciplina_id: s.disciplina_id as string, duracao_min: s.duracao_min }));
}

/** Aliases curtos: disciplina "D1"…, assunto "D1.01"… (e o caminho de volta). */
function aliases(ctx: ContextoIA) {
  const d = new Map<string, string>(ctx.discs.map((x, i) => [x.id, `D${i + 1}`]));
  const n: Record<string, number> = {};
  const a = new Map<string, string>(ctx.assuntos.map((x) => { n[x.disciplina_id] = (n[x.disciplina_id] ?? 0) + 1; return [x.id, `${d.get(x.disciplina_id)}.${String(n[x.disciplina_id]).padStart(2, '0')}`]; }));
  return { d, a, assuntoDoAlias: new Map([...a].map(([id, al]) => [al, id])) };
}

export function montarPrompt(ctx: ContextoIA, p: PedidoIA, blocos: Bloco[]): { system: string; user: string } {
  const system = [
    'Você é um planejador de estudos para o concurso de Soldado da Polícia Militar do Ceará (edital 001/2025, banca CEV/UECE).',
    'Já foi definido, para cada bloco, o dia, a disciplina e a duração. Sua tarefa é escolher, para CADA bloco, o assunto, o tipo e uma meta.',
    'Responda SOMENTE com JSON válido, sem texto fora do JSON.',
    'Formato: {"resumo": "2 a 3 frases em português explicando a estratégia", "blocos": [{"i": 0, "a": "D1.01" ou null, "t": "teoria|questoes|revisao|flashcards|simulado", "m": "meta curta"}]}',
    'Entrada: "blocos" são textos "i|MM-DD|disciplina|minutos". "pendentes" lista, por disciplina, [assunto, nome, acertos/respondidas] na ordem do edital.',
    'Regras:',
    '- Devolva exatamente um item para cada bloco recebido, com o mesmo "i". Não altere dia, disciplina nem duração.',
    '- "a" deve ser um assunto de "pendentes" da MESMA disciplina do bloco (ex.: bloco D3 usa assuntos D3.xx). Nunca invente códigos.',
    '- Siga a ordem do edital. Para cada assunto novo, use um bloco de "teoria" e, no próximo bloco dessa disciplina, "questoes" do mesmo assunto.',
    '- Dê prioridade a assuntos com menor acerto e a disciplinas com "foco". Misture "flashcards" para fixação.',
    '- Se houver "revisoes" ([assunto, MM-DD]), use tipo "revisao" com esse assunto em um bloco da mesma disciplina, no dia indicado ou logo depois.',
    '- Se houver "data_prova", aumente a proporção de "questoes" e "revisao" perto dela. Use "simulado" no máximo 1 vez por semana, no último bloco do último dia de estudo.',
    '- Se houver "sessoes_atrasadas" maior que zero, avance mais assuntos pendentes nas primeiras datas.',
    '- "m" tem no máximo 80 caracteres, por exemplo "Resolver 10 questões e revisar os erros".',
  ].join('\n');

  const al = aliases(ctx);
  const mmdd = (s: string) => s.slice(5);
  const user = JSON.stringify({
    data_prova: p.dataProva,
    sessoes_atrasadas: p.atrasadas,
    blocos: blocos.map((b) => `${b.i}|${mmdd(b.data)}|${al.d.get(b.disciplina_id)}|${b.duracao_min}`),
    disciplinas: ctx.discs.map((d) => ({ id: al.d.get(d.id), nome: d.nome, ...p.desempenho[d.id], foco: p.foco.includes(d.id) })),
    pendentes: Object.fromEntries(Object.entries(p.pendentes).map(([disc, l]) => [al.d.get(disc), l.map((x) => [al.a.get(x.id), x.nome, x.acerto ?? ''])])),
    revisoes: p.revisoes.map((r) => [al.a.get(r.assunto_id), mmdd(r.data)]),
    observacoes: p.observacoes.trim().slice(0, 500) || null,
  });
  return { system, user };
}

/**
 * Junta a resposta da IA ao esqueleto. O que a IA errar (assunto de outra disciplina, tipo inválido, bloco esquecido)
 * é trocado por um valor seguro, então o plano sempre sai completo. `ajustes` conta essas trocas.
 */
export function mesclarPlano(bruto: unknown, blocos: Bloco[], ctx: ContextoIA, pendentes: PedidoIA['pendentes']): { sessoes: SessaoIA[]; ajustes: number; resumo: string } | null {
  const obj = (bruto && typeof bruto === 'object' ? bruto : {}) as { resumo?: unknown; blocos?: unknown };
  const itens = new Map<number, Record<string, unknown>>();
  if (Array.isArray(obj.blocos)) for (const x of obj.blocos) if (x && typeof x === 'object' && Number.isInteger((x as { i?: unknown }).i)) itens.set((x as { i: number }).i, x as Record<string, unknown>);
  if (!itens.size) return null;

  const al = aliases(ctx);
  const assuntoDisc = new Map(ctx.assuntos.map((a) => [a.id, a.disciplina_id]));
  const contador: Record<string, number> = {};
  let ajustes = 0;
  const sessoes = blocos.map((b): SessaoIA => {
    const raw = itens.get(b.i);
    const k = contador[b.disciplina_id] = (contador[b.disciplina_id] ?? -1) + 1;
    const lista = pendentes[b.disciplina_id] ?? [];
    const reserva = lista.length ? lista[Math.floor(k / 2) % lista.length].id : null;

    const tipoRaw = String(raw?.t ?? raw?.tipo ?? '') as TipoSessao;
    const tipoOk = TIPOS_IA.includes(tipoRaw);
    const aRaw = raw?.a ?? raw?.assunto_id;
    const aidRaw = typeof aRaw === 'string' ? (al.assuntoDoAlias.get(aRaw) ?? aRaw) : null; // aceita o alias (D1.01) ou o id
    const aidOk = aidRaw !== null && assuntoDisc.get(aidRaw) === b.disciplina_id;
    if (!raw || !tipoOk || (aidRaw !== null && !aidOk)) ajustes++;

    const tipo: TipoSessao = tipoOk ? tipoRaw : reserva && k % 2 === 0 ? 'teoria' : 'questoes';
    const m = raw?.m ?? raw?.meta;
    const meta = typeof m === 'string' && m.trim() ? m.trim().slice(0, 120) : null;
    return { data: b.data, disciplina_id: b.disciplina_id, assunto_id: aidOk ? aidRaw : tipo === 'simulado' || tipo === 'flashcards' ? null : reserva, tipo, duracao_min: b.duracao_min, meta };
  });
  return { sessoes, ajustes, resumo: typeof obj.resumo === 'string' ? obj.resumo.trim().slice(0, 600) : '' };
}
