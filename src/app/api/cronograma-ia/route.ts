// Gera o cronograma com IA (Groq). A chave GROQ_API_KEY fica só aqui, no servidor: nunca vai para o navegador.
import { createClient } from '@supabase/supabase-js';
import { mesclarPlano, montarEsqueleto, montarPrompt, type ContextoIA, type PedidoIA } from '@/lib/ia-plano';

export const maxDuration = 60;

const MODELO = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const resposta = (corpo: unknown, status = 200) => Response.json(corpo, { status });

type Corpo = { datas?: unknown; minutosPorDia?: unknown; dataProva?: unknown; foco?: unknown; observacoes?: unknown };

export async function POST(req: Request) {
  const chave = process.env.GROQ_API_KEY;
  if (!chave) return resposta({ erro: 'A chave da IA ainda não foi configurada. Coloque GROQ_API_KEY no arquivo .env.local e reinicie o servidor.' }, 503);

  // Só usuário logado pode gastar a cota da IA: confere o token do Supabase enviado pelo navegador.
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return resposta({ erro: 'Entre na sua conta para usar a IA.' }, 401);
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: u, error: eu } = await supabase.auth.getUser(token);
  if (eu || !u.user) return resposta({ erro: 'Sessão expirada. Entre de novo.' }, 401);

  let c: Corpo;
  try { c = await req.json(); } catch { return resposta({ erro: 'Pedido inválido.' }, 400); }
  const datas = Array.isArray(c.datas) ? [...new Set(c.datas.filter((d): d is string => typeof d === 'string' && DATA.test(d)))].sort() : [];
  const minutosPorDia = Math.round(Number(c.minutosPorDia));
  if (!datas.length || datas.length > 21) return resposta({ erro: 'Escolha de 1 a 21 dias de estudo.' }, 400);
  if (!(minutosPorDia >= 30 && minutosPorDia <= 720)) return resposta({ erro: 'O tempo por dia deve ficar entre 30 minutos e 12 horas.' }, 400);
  const dataProva = typeof c.dataProva === 'string' && DATA.test(c.dataProva) ? c.dataProva : null;
  const foco = Array.isArray(c.foco) ? c.foco.filter((x): x is string => typeof x === 'string').slice(0, 10) : [];
  const observacoes = typeof c.observacoes === 'string' ? c.observacoes : '';

  const [d, a, p, q, r, atr] = await Promise.all([
    supabase.from('disciplinas').select('id,nome,questoes_prova').order('ordem'),
    supabase.from('assuntos').select('id,disciplina_id,nome,origem').order('ordem'),
    supabase.from('progresso_assunto').select('assunto_id,status,proxima_revisao'),
    supabase.from('questoes').select('id,disciplina_id,assunto_id'),
    supabase.from('respostas').select('questao_id,correta').order('respondida_em'),
    supabase.from('sessoes_estudo').select('id', { count: 'exact', head: true }).lt('data', datas[0]).eq('concluida', false).neq('tipo', 'pausa'),
  ]);
  const falha = d.error ?? a.error ?? p.error ?? q.error ?? r.error;
  if (falha) return resposta({ erro: `Não consegui ler seus dados: ${falha.message}` }, 500);

  const discs = d.data ?? [];
  const edital = (a.data ?? []).filter((x) => x.origem === 'edital');
  const concluido = new Set((p.data ?? []).filter((x) => x.status === 'concluido').map((x) => x.assunto_id));
  const ultima = new Map((r.data ?? []).map((x) => [x.questao_id, x.correta as boolean | null]));
  const por = (chave: 'assunto_id' | 'disciplina_id') => {
    const m: Record<string, { certas: number; resp: number }> = {};
    for (const x of q.data ?? []) {
      const k = x[chave]; const ok = ultima.get(x.id);
      if (!k || ok === undefined || ok === null) continue;
      (m[k] ??= { certas: 0, resp: 0 }).resp++;
      if (ok) m[k].certas++;
    }
    return m;
  };
  const porAssunto = por('assunto_id'), porDisc = por('disciplina_id');

  const desempenho: PedidoIA['desempenho'] = {};
  const pendentes: PedidoIA['pendentes'] = {};
  for (const x of discs) {
    const doEdital = edital.filter((e) => e.disciplina_id === x.id);
    const dd = porDisc[x.id];
    desempenho[x.id] = { acerto_pct: dd ? Math.round((dd.certas / dd.resp) * 100) : null, concluidos: doEdital.filter((e) => concluido.has(e.id)).length, total: doEdital.length };
    pendentes[x.id] = doEdital.filter((e) => !concluido.has(e.id)).slice(0, 10).map((e) => ({ id: e.id, nome: e.nome, ...(porAssunto[e.id] ? { acerto: `${porAssunto[e.id].certas}/${porAssunto[e.id].resp}` } : {}) }));
  }

  // Revisões marcadas: se cair num dia sem estudo, vai para o próximo dia de estudo.
  const proximoDia = (alvo: string) => datas.find((x) => x >= alvo) ?? null;
  const revisoes: PedidoIA['revisoes'] = [];
  for (const x of p.data ?? []) {
    if (!x.proxima_revisao || x.status === 'nao-iniciado' || x.proxima_revisao > datas[datas.length - 1]) continue;
    const dia = proximoDia(x.proxima_revisao);
    if (dia) revisoes.push({ assunto_id: x.assunto_id, data: dia });
  }

  const ctx: ContextoIA = { datas, minutosPorDia, discs, assuntos: edital };
  const pedido: PedidoIA = { dataProva, foco, observacoes, atrasadas: atr.count ?? 0, desempenho, pendentes, revisoes: revisoes.slice(0, 30) };
  const blocos = montarEsqueleto(ctx, pedido); // o código decide matéria, dia e duração de cada bloco; a IA escolhe assunto, tipo e meta
  const { system, user } = montarPrompt(ctx, pedido, blocos);

  let res: Response;
  try {
    res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST', headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(55_000),
      body: JSON.stringify({ model: MODELO, temperature: 0.3, max_tokens: 4000, ...(MODELO.startsWith('openai/gpt-oss') ? { reasoning_effort: 'low' } : {}), response_format: { type: 'json_object' }, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
    });
  } catch {
    return resposta({ erro: 'A IA demorou demais para responder. Tente de novo.' }, 504);
  }
  if (!res.ok) {
    const detalhe = (await res.json().catch(() => null))?.error?.message as string | undefined;
    if (res.status === 429) return resposta({ erro: 'O limite de uso da IA foi atingido. Espere alguns minutos e tente de novo.' }, 429);
    if (res.status === 401) return resposta({ erro: 'A chave da IA foi recusada. Confira a GROQ_API_KEY.' }, 502);
    return resposta({ erro: `A IA recusou o pedido (${res.status})${detalhe ? `: ${detalhe}` : ''}` }, 502);
  }

  const texto = (await res.json().catch(() => null))?.choices?.[0]?.message?.content as string | undefined;
  let bruto: unknown;
  try { bruto = JSON.parse(texto ?? ''); } catch { return resposta({ erro: 'A IA devolveu uma resposta inválida. Tente de novo.' }, 502); }
  const plano = mesclarPlano(bruto, blocos, ctx, pendentes);
  if (!plano) return resposta({ erro: 'A IA não conseguiu montar um cronograma válido. Tente de novo.' }, 502);
  return resposta({ sessoes: plano.sessoes, resumo: plano.resumo, descartadas: plano.ajustes });
}
