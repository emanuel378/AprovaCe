'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Topo } from '@/components/Topo';
import { T } from '@/lib/textos';

type Disciplina = { id: string; nome: string };
type Assunto = { id: string; disciplina_id: string; nome: string; origem: 'edital' | 'pedagogico' };
type Status = 'nao-iniciado' | 'estudando' | 'concluido' | 'revisando';
type Prog = {
  assunto_id: string; status: Status; dificuldade: string | null; ultimo_estudo: string | null; ultima_revisao: string | null;
  proxima_revisao: string | null; anotacoes: string | null; favorito: boolean;
};
type Filtro = 'todos' | Status | 'revisao-vencida' | 'favoritos';

const STATUS: { v: Status; nome: string }[] = [
  { v: 'nao-iniciado', nome: 'Não iniciado' }, { v: 'estudando', nome: 'Estudando' },
  { v: 'concluido', nome: 'Concluído' }, { v: 'revisando', nome: 'Revisando' },
];
const DIFICULDADE = [{ v: 'facil', nome: 'Fácil' }, { v: 'media', nome: 'Média' }, { v: 'dificil', nome: 'Difícil' }];
const hoje = () => new Date().toLocaleDateString('sv-SE'); // yyyy-mm-dd no fuso local

export default function Assuntos() {
  const router = useRouter();
  const [userId, setUserId] = useState('');
  const [disciplinas, setDisciplinas] = useState<Disciplina[]>([]);
  const [assuntos, setAssuntos] = useState<Assunto[]>([]);
  const [prog, setProg] = useState<Record<string, Prog>>({});
  const [nQuestoes, setNQuestoes] = useState<Record<string, number>>({});
  const [questaoAssunto, setQuestaoAssunto] = useState<Record<string, string>>({}); // questão -> assunto
  const [ultima, setUltima] = useState<Record<string, boolean | null>>({}); // última resposta de cada questão
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [aberto, setAberto] = useState<string | null>(null);
  const [msg, setMsg] = useState('Carregando…');

  useEffect(() => {
    (async () => {
      const { data: s } = await supabase.auth.getSession();
      if (!s.session) return router.replace('/login');
      setUserId(s.session.user.id);
      const [d, a, p, q, r] = await Promise.all([
        supabase.from('disciplinas').select('id,nome').order('ordem'),
        supabase.from('assuntos').select('id,disciplina_id,nome,origem').order('ordem'),
        supabase.from('progresso_assunto').select('assunto_id,status,dificuldade,ultimo_estudo,ultima_revisao,proxima_revisao,anotacoes,favorito'),
        supabase.from('questoes').select('id,assunto_id'),
        supabase.from('respostas').select('questao_id,correta,respondida_em').order('respondida_em'),
      ]);
      const erro = d.error ?? a.error ?? p.error ?? q.error ?? r.error;
      if (erro) return setMsg(`Erro: ${erro.message}`);
      setDisciplinas(d.data ?? []);
      setAssuntos((a.data ?? []) as Assunto[]);
      setProg(Object.fromEntries((p.data ?? []).map((x) => [x.assunto_id, x as Prog])));
      const cont: Record<string, number> = {};
      const qa: Record<string, string> = {};
      for (const x of q.data ?? []) if (x.assunto_id) { cont[x.assunto_id] = (cont[x.assunto_id] ?? 0) + 1; qa[x.id] = x.assunto_id; }
      setNQuestoes(cont);
      setQuestaoAssunto(qa);
      const ult: Record<string, boolean | null> = {};
      const ultimaData: Record<string, string> = {}; // data da última resposta em cada assunto
      for (const x of r.data ?? []) {
        ult[x.questao_id] = x.correta;
        if (qa[x.questao_id]) ultimaData[qa[x.questao_id]] = new Date(x.respondida_em).toLocaleDateString('sv-SE');
      }
      setUltima(ult);
      setMsg('');

      // Sincroniza o checklist com as respostas já dadas: começou -> "estudando"; acertou todas -> "concluido".
      // Nunca mexe em assunto concluído ou em revisão, e nunca desmarca.
      const por: Record<string, { n: number; c: number }> = {};
      for (const [qid, ok] of Object.entries(ult)) {
        const aid = qa[qid];
        if (!aid || ok === null) continue;
        por[aid] ??= { n: 0, c: 0 };
        por[aid].n++;
        if (ok) por[aid].c++;
      }
      const atuais: Record<string, Prog> = Object.fromEntries((p.data ?? []).map((x) => [x.assunto_id, x as Prog]));
      const linhas: { user_id: string; assunto_id: string; status: Status; ultimo_estudo: string | null }[] = [];
      for (const [aid, d] of Object.entries(por)) {
        const atual = atuais[aid]?.status ?? 'nao-iniciado';
        if (atual === 'concluido' || atual === 'revisando') continue;
        const novo: Status = d.c === cont[aid] ? 'concluido' : 'estudando';
        if (novo !== atual) linhas.push({ user_id: s.session.user.id, assunto_id: aid, status: novo, ultimo_estudo: atuais[aid]?.ultimo_estudo ?? ultimaData[aid] ?? null });
      }
      if (linhas.length) {
        const { error } = await supabase.from('progresso_assunto').upsert(linhas, { onConflict: 'user_id,assunto_id' });
        if (error) return setMsg(`Erro ao sincronizar o checklist: ${error.message}`);
        setProg((prev) => ({ ...prev, ...Object.fromEntries(linhas.map((l) => [l.assunto_id, { ...(atuais[l.assunto_id] ?? vazio(l.assunto_id)), status: l.status, ultimo_estudo: l.ultimo_estudo }])) }));
      }
    })();
  }, [router]);

  const vazio = (id: string): Prog => ({ assunto_id: id, status: 'nao-iniciado', dificuldade: null, ultimo_estudo: null, ultima_revisao: null, proxima_revisao: null, anotacoes: null, favorito: false });
  const get = (id: string) => prog[id] ?? vazio(id);

  async function salvar(id: string, mudanca: Partial<Prog>) {
    const novo = { ...get(id), ...mudanca };
    const anterior = prog[id];
    setProg((p) => ({ ...p, [id]: novo }));
    const { error } = await supabase.from('progresso_assunto').upsert({ ...novo, user_id: userId }, { onConflict: 'user_id,assunto_id' });
    if (error) {
      setMsg(`Erro ao salvar: ${error.message}`);
      setProg((p) => { const n = { ...p }; if (anterior) n[id] = anterior; else delete n[id]; return n; });
    } else setMsg('');
  }

  const alternarConcluido = (id: string) => get(id).status === 'concluido'
    ? salvar(id, { status: 'nao-iniciado' })
    : salvar(id, { status: 'concluido', ultimo_estudo: hoje() });
  const mudarStatus = (id: string, status: Status) => salvar(id, status === 'concluido' && !get(id).ultimo_estudo ? { status, ultimo_estudo: hoje() } : { status });
  const vencida = (p: Prog) => !!p.proxima_revisao && p.proxima_revisao <= hoje() && p.status !== 'nao-iniciado';

  const visiveis = (a: Assunto) => {
    const p = get(a.id);
    if (filtro === 'todos') return true;
    if (filtro === 'revisao-vencida') return vencida(p);
    if (filtro === 'favoritos') return p.favorito;
    return p.status === filtro;
  };

  // Desempenho: por assunto, quantas questões já foram respondidas e quantas estão certas (pela última resposta).
  const desempenho = useMemo(() => {
    const m: Record<string, { respondidas: number; certas: number; erradas: number; total: number }> = {};
    for (const [aid, total] of Object.entries(nQuestoes)) m[aid] = { respondidas: 0, certas: 0, erradas: 0, total };
    for (const [qid, correta] of Object.entries(ultima)) {
      const aid = questaoAssunto[qid];
      if (!aid || correta === null) continue;
      m[aid].respondidas++;
      if (correta) m[aid].certas++;
      else m[aid].erradas++;
    }
    return m;
  }, [nQuestoes, ultima, questaoAssunto]);
  const dominio = (aid: string) => {
    const d = desempenho[aid];
    if (!d) return null;
    if (d.certas === d.total) return { nome: 'Dominado', cls: 'chip-ok' };
    if (d.respondidas === 0) return null;
    const acc = d.certas / d.respondidas;
    if (acc >= 0.7) return { nome: 'Indo bem', cls: 'chip-ok' };
    if (acc >= 0.4) return { nome: 'Em progresso', cls: 'chip-gold' };
    return { nome: 'Reforçar', cls: 'chip-red' };
  };
  const totalQ = Object.values(desempenho).reduce((n, d) => n + d.total, 0);
  const totalCertas = Object.values(desempenho).reduce((n, d) => n + d.certas, 0);

  const edital = assuntos.filter((a) => a.origem === 'edital');
  const concluidos = edital.filter((a) => get(a.id).status === 'concluido').length;
  const pct = edital.length ? Math.round((concluidos / edital.length) * 100) : 0;
  const nVencidas = useMemo(() => Object.values(prog).filter(vencida).length, [prog]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <Topo />
      <main className="max-w-3xl mx-auto p-4 space-y-4">
        <section className="card p-5 space-y-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-brand">{T.edital}</h1>
              <p className="text-sm text-muted">{concluidos} de {edital.length} assuntos concluídos · {totalCertas}/{totalQ} questões acertadas{nVencidas > 0 && ` · ${nVencidas} revisão(ões) vencida(s)`}</p>
            </div>
            <span className="font-display text-3xl font-bold text-brand">{pct}%</span>
          </div>
          <div className="barra" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><i style={{ width: `${pct}%` }} /></div>
          <select className="field !w-auto" aria-label="Filtro" value={filtro} onChange={(e) => setFiltro(e.target.value as Filtro)}>
            <option value="todos">Todos os assuntos</option>
            {STATUS.map((s) => <option key={s.v} value={s.v}>{s.nome}</option>)}
            <option value="revisao-vencida">Revisão vencida</option>
            <option value="favoritos">Favoritos</option>
          </select>
        </section>

        {msg && <p role="alert" className={msg.startsWith('Erro') ? 'text-sm text-red' : 'text-muted'}>{msg}</p>}

        {disciplinas.map((d) => {
          const todos = assuntos.filter((a) => a.disciplina_id === d.id);
          const doEdital = todos.filter((a) => a.origem === 'edital');
          const feitos = doEdital.filter((a) => get(a.id).status === 'concluido').length;
          const lista = todos.filter(visiveis);
          if (!lista.length) return null;
          return (
            <details key={d.id} className="card group" open={filtro !== 'todos' ? true : undefined}>
              <summary className="cursor-pointer list-none p-4 flex items-center gap-3">
                <span className="font-display font-bold text-brand flex-1">{d.nome}</span>
                <span className="text-sm text-muted">{feitos}/{doEdital.length}</span>
                <div className="barra w-20 hidden sm:block"><i style={{ width: `${doEdital.length ? (feitos / doEdital.length) * 100 : 0}%` }} /></div>
              </summary>
              <ul className="border-t border-line divide-y divide-line">
                {lista.map((a) => {
                  const p = get(a.id);
                  const aberta = aberto === a.id;
                  return (
                    <li key={a.id} className="p-3">
                      <div className="flex items-start gap-3">
                        <input type="checkbox" className="check mt-0.5" checked={p.status === 'concluido'} onChange={() => alternarConcluido(a.id)} aria-label={`Concluir: ${a.nome}`} />
                        <button className="flex-1 text-left" onClick={() => setAberto(aberta ? null : a.id)} aria-expanded={aberta}>
                          <span className={p.status === 'concluido' ? 'line-through opacity-60' : ''}>{a.nome}</span>
                          <span className="flex flex-wrap gap-1.5 mt-1">
                            {a.origem === 'pedagogico' && <span className="chip chip-gold">Extra</span>}
                            {p.status !== 'nao-iniciado' && p.status !== 'concluido' && <span className="chip">{STATUS.find((s) => s.v === p.status)?.nome}</span>}
                            {p.dificuldade && <span className="chip">{DIFICULDADE.find((x) => x.v === p.dificuldade)?.nome}</span>}
                            {(() => { const dm = dominio(a.id); return dm && <span className={`chip ${dm.cls}`}>{dm.nome}</span>; })()}
                            {p.status === 'concluido' && (desempenho[a.id]?.erradas ?? 0) > 0 && <span className="chip chip-red" title="Há questão deste assunto com a última resposta errada">Revisar</span>}
                            {vencida(p) && <span className="chip chip-gold">Revisar hoje</span>}
                            {p.favorito && <span className="chip chip-gold">★</span>}
                            {p.anotacoes && <span className="chip">Anotação</span>}
                          </span>
                        </button>
                        {desempenho[a.id] ? (
                          <Link href={`/questoes?assunto=${a.id}`} className="shrink-0 text-right hover:underline" title="Resolver questões deste assunto">
                            <span className="text-xs font-semibold text-brand">{desempenho[a.id].certas}/{desempenho[a.id].total}</span>
                            <span className="barra w-14 mt-1"><i style={{ width: `${(desempenho[a.id].certas / desempenho[a.id].total) * 100}%` }} /></span>
                          </Link>
                        ) : null}
                      </div>

                      {aberta && (
                        <div className="mt-3 ml-8 grid gap-3 sm:grid-cols-2">
                          <label className="text-sm space-y-1">Situação
                            <select className="field" value={p.status} onChange={(e) => mudarStatus(a.id, e.target.value as Status)}>
                              {STATUS.map((s) => <option key={s.v} value={s.v}>{s.nome}</option>)}
                            </select>
                          </label>
                          <label className="text-sm space-y-1">Dificuldade
                            <select className="field" value={p.dificuldade ?? ''} onChange={(e) => salvar(a.id, { dificuldade: e.target.value || null })}>
                              <option value="">—</option>
                              {DIFICULDADE.map((x) => <option key={x.v} value={x.v}>{x.nome}</option>)}
                            </select>
                          </label>
                          <label className="text-sm space-y-1">Estudado em
                            <input type="date" className="field" value={p.ultimo_estudo ?? ''} onChange={(e) => salvar(a.id, { ultimo_estudo: e.target.value || null })} />
                          </label>
                          <label className="text-sm space-y-1">Próxima revisão
                            <input type="date" className="field" value={p.proxima_revisao ?? ''} onChange={(e) => salvar(a.id, { proxima_revisao: e.target.value || null })} />
                          </label>
                          <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
                            <button className="btn btn-ghost !py-1.5 !text-sm" onClick={() => salvar(a.id, { ultima_revisao: hoje(), status: p.status === 'nao-iniciado' ? 'revisando' : p.status })}>Revisei hoje</button>
                            <button className={`btn btn-ghost !py-1.5 !text-sm ${p.favorito ? '!text-gold !border-gold' : ''}`} aria-pressed={p.favorito} onClick={() => salvar(a.id, { favorito: !p.favorito })}>{p.favorito ? '★ Favorito' : '☆ Favoritar'}</button>
                            {p.ultima_revisao && <span className="text-xs text-muted">Última revisão: {p.ultima_revisao.split('-').reverse().join('/')}</span>}
                          </div>
                          <label className="text-sm space-y-1 sm:col-span-2">Anotações
                            <textarea className="field min-h-24" defaultValue={p.anotacoes ?? ''} placeholder="Resumo, dúvidas, macetes…"
                              onBlur={(e) => { if ((e.target.value || null) !== p.anotacoes) salvar(a.id, { anotacoes: e.target.value || null }); }} />
                          </label>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </details>
          );
        })}
      </main>
    </>
  );
}
