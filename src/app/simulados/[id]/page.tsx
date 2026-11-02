'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Topo } from '@/components/Topo';
import type { Questao } from '@/lib/tipos';
import { autoAtivo, criarCartoesDeErros } from '@/lib/flashcards-auto';

type Resultado = { acertos: number; erros: number; branco: number; total: number; nota: number; porDisciplina: Record<string, { acertos: number; total: number }> };
type Simulado = {
  id: string; titulo: string | null; config: Record<string, unknown> & { resultado?: Resultado }; questao_ids: string[];
  respostas: Record<string, string>; marcadas: string[]; estado: 'andamento' | 'finalizado';
  tempo_max_seg: number | null; segundos_usados: number; iniciado_em: string;
};

const fmt = (seg: number) => {
  const s = Math.max(0, Math.floor(seg));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return `${h > 0 ? `${h}:` : ''}${String(m).padStart(h > 0 ? 2 : 1, '0')}:${String(r).padStart(2, '0')}`;
};

export default function ProvaSimulado() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [sim, setSim] = useState<Simulado | null>(null);
  const [questoes, setQuestoes] = useState<Record<string, Questao>>({});
  const [nomes, setNomes] = useState<Record<string, string>>({});
  const [respostas, setRespostas] = useState<Record<string, string>>({});
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [userId, setUserId] = useState('');
  const [pos, setPos] = useState(0);
  const [agora, setAgora] = useState(() => Date.now());
  const [confirmando, setConfirmando] = useState(false);
  const [finalizando, setFinalizando] = useState(false);
  const [cartoes, setCartoes] = useState(0); // flashcards criados dos erros ao finalizar
  const [msg, setMsg] = useState('Carregando…');
  const travado = useRef(false); // evita finalizar duas vezes (clique + tempo esgotado)

  useEffect(() => {
    (async () => {
      const { data: s } = await supabase.auth.getSession();
      if (!s.session) return router.replace('/login');
      setUserId(s.session.user.id);
      const { data: sm, error } = await supabase.from('simulados')
        .select('id,titulo,config,questao_ids,respostas,marcadas,estado,tempo_max_seg,segundos_usados,iniciado_em').eq('id', id).maybeSingle();
      if (error) return setMsg(`Erro: ${error.message}`);
      if (!sm) return setMsg('Simulado não encontrado.');
      const [q, d] = await Promise.all([
        supabase.from('questoes').select('id,fonte_id,numero,disciplina_id,assunto_id,enunciado,texto_apoio,alternativas,gabarito,status_gabarito,comentario,revisar').in('id', sm.questao_ids),
        supabase.from('disciplinas').select('id,nome'),
      ]);
      if (q.error || d.error) return setMsg(`Erro: ${(q.error ?? d.error)!.message}`);
      setQuestoes(Object.fromEntries((q.data as Questao[]).map((x) => [x.id, x])));
      setNomes(Object.fromEntries((d.data ?? []).map((x) => [x.id, x.nome])));
      setSim(sm as Simulado);
      setRespostas((sm.respostas ?? {}) as Record<string, string>);
      setMarcadas(new Set(sm.marcadas ?? []));
      setMsg('');
    })();
  }, [id, router]);

  const andamento = sim?.estado === 'andamento';
  const decorrido = !sim ? 0 : andamento ? Math.floor((agora - new Date(sim.iniciado_em).getTime()) / 1000) : sim.segundos_usados;
  const restante = sim?.tempo_max_seg ? sim.tempo_max_seg - decorrido : null;

  useEffect(() => {
    if (!andamento) return;
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [andamento]);

  const finalizar = useCallback(async () => {
    if (!sim || travado.current) return;
    travado.current = true;
    setFinalizando(true);
    const ids = sim.questao_ids;
    const porDisciplina: Resultado['porDisciplina'] = {};
    let acertos = 0, erros = 0;
    const linhas: { user_id: string; questao_id: string; simulado_id: string; alternativa: string; correta: boolean }[] = [];
    for (const qid of ids) {
      const q = questoes[qid];
      const d = (porDisciplina[q.disciplina_id ?? '_'] ??= { acertos: 0, total: 0 });
      d.total++;
      const marcada = respostas[qid];
      if (!marcada) continue;
      const certa = marcada === q.gabarito;
      if (certa) { acertos++; d.acertos++; } else erros++;
      linhas.push({ user_id: userId, questao_id: qid, simulado_id: sim.id, alternativa: marcada, correta: certa });
    }
    const total = ids.length;
    const resultado: Resultado = { acertos, erros, branco: total - acertos - erros, total, nota: (acertos / total) * 10, porDisciplina };
    const usados = sim.tempo_max_seg ? Math.min(decorrido, sim.tempo_max_seg) : decorrido;

    if (linhas.length) {
      const { error } = await supabase.from('respostas').insert(linhas);
      if (error) { travado.current = false; setFinalizando(false); return setMsg(`Erro ao salvar as respostas: ${error.message}`); }
    }
    if (autoAtivo()) {
      const erradas = linhas.filter((l) => !l.correta).map((l) => questoes[l.questao_id]);
      const r = await criarCartoesDeErros(supabase, userId, erradas);
      setCartoes(r.criadas.length); // falha aqui não impede a correção: os cartões podem ser criados depois
    }
    const { error } = await supabase.from('simulados').update({
      estado: 'finalizado', finalizado_em: new Date().toISOString(), segundos_usados: usados, config: { ...sim.config, resultado },
    }).eq('id', sim.id);
    if (error) return setMsg(`Erro ao finalizar: ${error.message} (as respostas já foram gravadas; não finalize de novo)`);
    setSim({ ...sim, estado: 'finalizado', segundos_usados: usados, config: { ...sim.config, resultado } });
    setConfirmando(false);
    setFinalizando(false);
    setPos(0);
  }, [sim, questoes, respostas, userId, decorrido]);

  useEffect(() => {
    if (andamento && restante !== null && restante <= 0) void finalizar();
  }, [andamento, restante, finalizar]);

  async function salvarEstado(r: Record<string, string>, m: Set<string>) {
    if (!sim) return;
    const { error } = await supabase.from('simulados').update({ respostas: r, marcadas: [...m] }).eq('id', sim.id);
    if (error) setMsg(`Erro ao salvar: ${error.message}`); else setMsg('');
  }
  function responder(qid: string, letra: string) {
    if (!andamento) return;
    const novo = respostas[qid] === letra ? Object.fromEntries(Object.entries(respostas).filter(([k]) => k !== qid)) : { ...respostas, [qid]: letra };
    setRespostas(novo);
    void salvarEstado(novo, marcadas);
  }
  function marcar(qid: string) {
    const novo = new Set(marcadas);
    if (novo.has(qid)) novo.delete(qid); else novo.add(qid);
    setMarcadas(novo);
    void salvarEstado(respostas, novo);
  }

  if (!sim) return <><Topo /><main className="max-w-3xl mx-auto p-4"><p role="alert" className={msg.startsWith('Erro') ? 'text-red' : 'text-muted'}>{msg}</p></main></>;

  const ids = sim.questao_ids;
  const q = questoes[ids[pos]];
  const res = sim.config.resultado;
  const respondidas = ids.filter((x) => respostas[x]).length;
  const estadoNav = (qid: string) => {
    if (andamento) return respostas[qid] ? 'sel' : '';
    return !respostas[qid] ? '' : respostas[qid] === questoes[qid]?.gabarito ? 'ok' : 'bad';
  };

  return (
    <>
      <Topo />
      <main className="max-w-3xl mx-auto p-4 space-y-4">
        <section className="card p-4 flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-48">
            <h1 className="font-display font-bold text-brand">{sim.titulo ?? 'Simulado'}</h1>
            <p className="text-xs text-muted">{andamento ? `${respondidas} de ${ids.length} respondidas` : 'Simulado finalizado'}</p>
          </div>
          {andamento && (
            <>
              <span className={`chip !text-base ${restante !== null && restante < 300 ? 'chip-red' : ''}`} role="timer" aria-label="Tempo">
                {restante !== null ? fmt(restante) : fmt(decorrido)}
              </span>
              <button className="btn btn-primary" onClick={() => setConfirmando(true)}>Finalizar</button>
            </>
          )}
        </section>

        {confirmando && andamento && (
          <section className="card p-5 space-y-3 border-gold" role="alertdialog" aria-label="Confirmar finalização">
            <p className="font-semibold">Finalizar o simulado?</p>
            <p className="text-sm text-muted">Você respondeu {respondidas} de {ids.length}.{ids.length - respondidas > 0 && ` ${ids.length - respondidas} em branco contam como erro na nota.`} Depois de finalizar não dá para alterar as respostas.</p>
            <div className="flex gap-2">
              <button className="btn btn-gold" disabled={finalizando} onClick={() => void finalizar()}>{finalizando ? 'Corrigindo…' : 'Sim, finalizar'}</button>
              <button className="btn btn-ghost" disabled={finalizando} onClick={() => setConfirmando(false)}>Continuar prova</button>
            </div>
          </section>
        )}

        {res && (
          <section className="hero rounded-2xl p-6 space-y-4">
            <div className="relative z-10 flex flex-wrap items-end gap-x-8 gap-y-3">
              <div>
                <p className="text-sm opacity-80">Sua nota</p>
                <p className="font-display text-5xl font-extrabold">{res.nota.toFixed(1)}<span className="text-xl opacity-70"> / 10</span></p>
              </div>
              <ul className="flex gap-6 text-sm">
                <li><strong className="block text-2xl">{res.acertos}</strong> acertos</li>
                <li><strong className="block text-2xl">{res.erros}</strong> erros</li>
                <li><strong className="block text-2xl">{res.branco}</strong> em branco</li>
                <li><strong className="block text-2xl">{fmt(sim.segundos_usados)}</strong> tempo</li>
              </ul>
            </div>
            {cartoes > 0 && <p className="relative z-10 text-sm"><Link href="/flashcards" className="underline">{cartoes} flashcard{cartoes > 1 ? 's' : ''}</Link> criado{cartoes > 1 ? 's' : ''} dos seus erros.</p>}
            <div className="relative z-10 space-y-2">
              {Object.entries(res.porDisciplina).map(([d, v]) => (
                <div key={d} className="text-sm">
                  <div className="flex justify-between"><span>{nomes[d] ?? d}</span><span>{v.acertos}/{v.total}</span></div>
                  <div className="barra !bg-white/20"><i style={{ width: `${(v.acertos / v.total) * 100}%` }} /></div>
                </div>
              ))}
            </div>
          </section>
        )}

        <nav aria-label="Questões do simulado" className="card p-3 flex flex-wrap gap-1.5">
          {ids.map((qid, i) => {
            const e = estadoNav(qid);
            const cor = e === 'ok' ? 'bg-ok text-white border-ok' : e === 'bad' ? 'bg-red text-white border-red' : e === 'sel' ? 'bg-blue text-white border-blue' : 'border-line';
            return (
              <button key={qid} onClick={() => setPos(i)} aria-label={`Questão ${i + 1}`} aria-current={i === pos}
                className={`relative size-9 rounded-lg border text-sm font-semibold ${cor} ${i === pos ? 'ring-2 ring-gold ring-offset-1 ring-offset-[var(--card)]' : ''}`}>
                {i + 1}
                {marcadas.has(qid) && <span className="absolute -top-1 -right-1 size-2.5 rounded-full bg-gold" aria-label="marcada para revisão" />}
              </button>
            );
          })}
        </nav>

        {msg && <p role="alert" className="text-sm text-red">{msg}</p>}

        {q && (
          <article className="card p-5 sm:p-7 space-y-5">
            <div className="flex items-center justify-between gap-2">
              <span className="chip">Questão {pos + 1} de {ids.length}{q.disciplina_id && ` · ${nomes[q.disciplina_id] ?? ''}`}</span>
              <button onClick={() => marcar(q.id)} aria-pressed={marcadas.has(q.id)} className={`btn btn-ghost !py-1 !px-3 !text-sm ${marcadas.has(q.id) ? '!text-gold !border-gold' : ''}`}>
                {marcadas.has(q.id) ? 'Marcada' : 'Marcar para revisar'}
              </button>
            </div>
            {!andamento && q.revisar?.includes('gabarito-duvidoso') && <p className="chip chip-gold !text-sm">Gabarito discutível: esta questão pode ter mais de uma alternativa defensável.</p>}
            {q.texto_apoio && <p className="text-sm whitespace-pre-line rounded-xl p-4 border-l-4 border-gold bg-gold/10 leading-relaxed">{q.texto_apoio}</p>}
            <p className="whitespace-pre-line font-medium leading-relaxed">{q.enunciado}</p>
            <ul className="space-y-2.5">
              {q.alternativas.map((a) => {
                const estado = !andamento && a.letter === q.gabarito ? 'ok'
                  : !andamento && a.letter === respostas[q.id] ? 'bad'
                  : andamento && a.letter === respostas[q.id] ? 'sel' : '';
                return (
                  <li key={a.letter}>
                    <button className="opt" data-estado={estado} disabled={!andamento} onClick={() => responder(q.id, a.letter)} aria-pressed={a.letter === respostas[q.id]}>
                      <span className="letra">{a.letter}</span><span className="pt-0.5">{a.text}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {!andamento && (
              <p role="status" className={`font-semibold ${respostas[q.id] === q.gabarito ? 'text-ok' : 'text-red'}`}>
                {!respostas[q.id] ? `Em branco. Gabarito: ${q.gabarito}` : respostas[q.id] === q.gabarito ? '✓ Acertou!' : `✗ Errou. Gabarito: ${q.gabarito}`}
              </p>
            )}
            {!andamento && q.comentario && <p className="text-sm whitespace-pre-line text-muted">{q.comentario}</p>}
            <div className="flex flex-wrap gap-2 pt-1">
              <button onClick={() => setPos((p) => Math.max(p - 1, 0))} disabled={pos === 0} className="btn btn-ghost">← Anterior</button>
              <button onClick={() => setPos((p) => Math.min(p + 1, ids.length - 1))} disabled={pos === ids.length - 1} className="btn btn-primary ml-auto">Próxima →</button>
            </div>
          </article>
        )}

        {!andamento && <Link href="/simulados" className="btn btn-gold">Novo simulado</Link>}
      </main>
    </>
  );
}
