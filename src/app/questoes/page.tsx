'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Topo } from '@/components/Topo';
import { T } from '@/lib/textos';
import { autoAtivo, cartaoDeQuestao, criarCartoesDeErros } from '@/lib/flashcards-auto';

type Alt = { letter: string; text: string };
type Questao = {
  id: string; fonte_id: string; numero: number; disciplina_id: string | null; assunto_id: string | null; enunciado: string; texto_apoio: string | null;
  alternativas: Alt[]; gabarito: string | null; status_gabarito: string; comentario: string | null; revisar: string[] | null;
};
type Opcao = { id: string; nome: string };
type Status = 'todas' | 'nao-respondidas' | 'erradas';

export default function Questoes() {
  const router = useRouter();
  const [questoes, setQuestoes] = useState<Record<string, Questao>>({});
  const [ordem, setOrdem] = useState<string[]>([]);
  const [fontes, setFontes] = useState<Opcao[]>([]);
  const [disciplinas, setDisciplinas] = useState<Opcao[]>([]);
  const [favoritas, setFavoritas] = useState<Set<string>>(new Set());
  const [ultima, setUltima] = useState<Record<string, boolean | null>>({}); // última resposta por questão
  const ultimaRef = useRef(ultima);
  ultimaRef.current = ultima;

  const [fonte, setFonte] = useState('');
  const [disc, setDisc] = useState('');
  const [assunto, setAssunto] = useState(''); // vem de /questoes?assunto=ID (tela de assuntos)
  const [userId, setUserId] = useState('');
  const [comCartao, setComCartao] = useState<Set<string>>(new Set()); // questões que já viraram flashcard
  const [statusAssunto, setStatusAssunto] = useState<Record<string, string>>({}); // checklist do edital
  const [marcadaId, setMarcadaId] = useState(''); // questão cujo acerto marcou o checklist
  const [nomesAssunto, setNomesAssunto] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Status>('todas');
  const [ids, setIds] = useState<string[]>([]);
  const [pos, setPos] = useState(0);
  const [escolha, setEscolha] = useState<string | null>(null);
  const [corrigida, setCorrigida] = useState(false);
  const [msg, setMsg] = useState('Carregando…');

  useEffect(() => {
    (async () => {
      const { data: s } = await supabase.auth.getSession();
      if (!s.session) return router.replace('/login');
      setUserId(s.session.user.id);
      setAssunto(new URLSearchParams(window.location.search).get('assunto') ?? '');
      const [q, f, d, fav, r, as, pa, fc] = await Promise.all([
        supabase.from('questoes').select('id,fonte_id,numero,disciplina_id,assunto_id,enunciado,texto_apoio,alternativas,gabarito,status_gabarito,comentario,revisar').order('fonte_id').order('numero'),
        supabase.from('fontes').select('id,nome').order('ano', { ascending: false }),
        supabase.from('disciplinas').select('id,nome').order('ordem'),
        supabase.from('questao_favoritas').select('questao_id'),
        supabase.from('respostas').select('questao_id,correta').order('respondida_em'),
        supabase.from('assuntos').select('id,nome'),
        supabase.from('progresso_assunto').select('assunto_id,status'),
        supabase.from('flashcards').select('questao_id').not('questao_id', 'is', null),
      ]);
      const erro = q.error ?? f.error ?? d.error ?? fav.error ?? r.error ?? as.error ?? pa.error ?? fc.error;
      if (erro) return setMsg(`Erro: ${erro.message}`);
      const lista = q.data as Questao[];
      setQuestoes(Object.fromEntries(lista.map((x) => [x.id, x])));
      setOrdem(lista.map((x) => x.id));
      setFontes(f.data as Opcao[]);
      setDisciplinas(d.data as Opcao[]);
      setComCartao(new Set((fc.data ?? []).map((x) => x.questao_id as string)));
      setStatusAssunto(Object.fromEntries((pa.data ?? []).map((x) => [x.assunto_id, x.status])));
      setNomesAssunto(Object.fromEntries((as.data ?? []).map((x) => [x.id, x.nome])));
      setFavoritas(new Set((fav.data ?? []).map((x) => x.questao_id)));
      setUltima(Object.fromEntries((r.data ?? []).map((x) => [x.questao_id, x.correta])));
      setMsg('');
    })();
  }, [router]);

  // O filtro "não respondidas/erradas" usa um retrato das respostas: a questão não some da lista ao responder.
  useEffect(() => {
    setIds(ordem.filter((id) => {
      const q = questoes[id];
      if (fonte && q.fonte_id !== fonte) return false;
      if (disc && q.disciplina_id !== disc) return false;
      if (assunto && q.assunto_id !== assunto) return false;
      if (status === 'nao-respondidas') return !(id in ultimaRef.current);
      if (status === 'erradas') return ultimaRef.current[id] === false;
      return true;
    }));
    setPos(0);
    setEscolha(null);
    setCorrigida(false);
  }, [ordem, questoes, fonte, disc, assunto, status]);

  const q = questoes[ids[pos]];

  function ir(delta: number) {
    setPos((p) => Math.min(Math.max(p + delta, 0), ids.length - 1));
    setEscolha(null);
    setCorrigida(false);
  }

  async function corrigir() {
    if (!q || !escolha) return;
    setCorrigida(true);
    if (!q.gabarito) return; // anulada/sem gabarito: nada a gravar
    const correta = escolha === q.gabarito;
    const { error } = await supabase.from('respostas').insert({ questao_id: q.id, alternativa: escolha, correta });
    if (error) return setMsg(`Erro ao salvar resposta: ${error.message}`);
    setUltima((u) => ({ ...u, [q.id]: correta }));
    await marcarChecklist(q, { ...ultimaRef.current, [q.id]: correta });
    if (!correta && autoAtivo() && !comCartao.has(q.id)) {
      const r = await criarCartoesDeErros(supabase, userId, [q]);
      if (r.erro) setMsg(`Erro ao criar o flashcard: ${r.erro}`);
      else setComCartao((s) => new Set([...s, q.id]));
    }
  }

  // Checklist automático: qualquer resposta inicia o assunto ("estudando"); acertar TODAS as questões dele conclui.
  // Nunca desmarca nada nem mexe em assunto já concluído ou em revisão.
  async function marcarChecklist(q: Questao, mapa: Record<string, boolean | null>) {
    const aid = q.assunto_id;
    if (!aid) return;
    const atual = statusAssunto[aid];
    if (atual === 'concluido' || atual === 'revisando') return;
    const dominou = ordem.filter((id) => questoes[id].assunto_id === aid).every((id) => mapa[id] === true);
    const novo = dominou ? 'concluido' : !atual || atual === 'nao-iniciado' ? 'estudando' : null;
    if (!novo) return;
    const { error } = await supabase.from('progresso_assunto')
      .upsert({ user_id: userId, assunto_id: aid, status: novo, ultimo_estudo: new Date().toLocaleDateString('sv-SE') }, { onConflict: 'user_id,assunto_id' });
    if (error) return setMsg(`Erro ao atualizar o checklist: ${error.message}`);
    setStatusAssunto((m) => ({ ...m, [aid]: novo }));
    if (novo === 'concluido') setMarcadaId(q.id);
  }

  async function criarFlashcard() {
    if (!q) return;
    const { error } = await supabase.from('flashcards').insert({ user_id: userId, ...cartaoDeQuestao(q) });
    if (error) return setMsg(`Erro ao criar o flashcard: ${error.message}`);
    setComCartao((s) => new Set(s).add(q.id));
  }

  async function favoritar() {
    if (!q) return;
    const jaE = favoritas.has(q.id);
    const { error } = jaE
      ? await supabase.from('questao_favoritas').delete().eq('questao_id', q.id)
      : await supabase.from('questao_favoritas').insert({ questao_id: q.id });
    if (error) return setMsg(`Erro: ${error.message}`);
    setFavoritas((s) => { const n = new Set(s); if (jaE) n.delete(q.id); else n.add(q.id); return n; });
  }

  const progresso = ids.length ? ((pos + 1) / ids.length) * 100 : 0;
  return (
    <>
      <Topo />
      <main className="max-w-3xl mx-auto p-4 space-y-4">
        <h1 className="text-2xl font-bold text-brand">{T.questoes}</h1>
        <div className="card p-3 flex flex-wrap gap-2">
          <select className="field !w-auto flex-1 min-w-40" aria-label="Fonte" value={fonte} onChange={(e) => setFonte(e.target.value)}>
            <option value="">Todas as provas</option>
            {fontes.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
          </select>
          <select className="field !w-auto flex-1 min-w-40" aria-label="Disciplina" value={disc} onChange={(e) => setDisc(e.target.value)}>
            <option value="">Todas as disciplinas</option>
            {disciplinas.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
          </select>
          <select className="field !w-auto flex-1 min-w-40" aria-label="Situação" value={status} onChange={(e) => setStatus(e.target.value as Status)}>
            <option value="todas">Todas</option>
            <option value="nao-respondidas">Não respondidas</option>
            <option value="erradas">Erradas</option>
          </select>
        </div>

        {assunto && (
          <p className="chip chip-gold !text-sm">
            Assunto: {nomesAssunto[assunto] ?? assunto}
            <button onClick={() => setAssunto('')} aria-label="Limpar filtro de assunto" className="btn-limpar ml-2">✕ Limpar</button>
          </p>
        )}
        {msg && <p role="alert" className="text-sm text-red">{msg}</p>}
        {!msg && !q && <p className="card p-6 text-center text-muted">Nenhuma questão com esses filtros.</p>}

        {q && (
          <article className="card p-5 sm:p-7 space-y-5">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="chip">{q.fonte_id} · nº {q.numero}</span>
                <button onClick={favoritar} aria-pressed={favoritas.has(q.id)} className={`btn btn-ghost !py-1 !px-3 !text-sm ${favoritas.has(q.id) ? '!text-gold !border-gold' : ''}`}>
                  {favoritas.has(q.id) ? '★ Favorita' : '☆ Favoritar'}
                </button>
              </div>
              <div className="barra" role="progressbar" aria-valuemin={1} aria-valuemax={ids.length} aria-valuenow={pos + 1}><i style={{ width: `${progresso}%` }} /></div>
              <p className="text-xs text-muted">Questão {pos + 1} de {ids.length}</p>
            </div>

            {q.status_gabarito === 'terceiros-nao-oficial' && <p className="chip chip-gold">Gabarito não oficial (simulado de terceiros)</p>}
            {q.status_gabarito === 'anulada' && <p className="chip chip-gold">Questão anulada: não entra na correção</p>}
            {q.revisar?.includes('gabarito-duvidoso') && <p className="chip chip-gold !text-sm">Gabarito discutível: esta questão pode ter mais de uma alternativa defensável.</p>}
            {q.texto_apoio && <p className="text-sm whitespace-pre-line rounded-xl p-4 border-l-4 border-gold bg-gold/10 leading-relaxed">{q.texto_apoio}</p>}
            <p className="whitespace-pre-line font-medium leading-relaxed">{q.enunciado}</p>

            <ul className="space-y-2.5">
              {q.alternativas.map((a) => {
                const estado = corrigida && a.letter === q.gabarito ? 'ok'
                  : corrigida && a.letter === escolha && q.gabarito !== null ? 'bad'
                  : a.letter === escolha ? 'sel' : '';
                return (
                  <li key={a.letter}>
                    <button className="opt" data-estado={estado} disabled={corrigida} onClick={() => setEscolha(a.letter)} aria-pressed={a.letter === escolha}>
                      <span className="letra">{a.letter}</span><span className="pt-0.5">{a.text}</span>
                    </button>
                  </li>
                );
              })}
            </ul>

            {corrigida && q.gabarito && (
              <p role="status" className={`font-semibold ${escolha === q.gabarito ? 'text-ok' : 'text-red'}`}>
                {escolha === q.gabarito ? '✓ Acertou!' : `✗ Errou. Gabarito: ${q.gabarito}`}
              </p>
            )}
            {corrigida && q.assunto_id && (() => {
              const doAssunto = ordem.filter((id) => questoes[id].assunto_id === q.assunto_id);
              const certas = doAssunto.filter((id) => ultima[id] === true).length;
              return <p className="text-sm text-muted">Neste assunto: <strong>{certas}/{doAssunto.length}</strong> questões acertadas</p>;
            })()}
            {corrigida && marcadaId === q.id && q.assunto_id && (
              <p role="status" className="chip chip-gold !text-sm">✓ Checklist: “{nomesAssunto[q.assunto_id] ?? 'assunto'}” marcado como concluído</p>
            )}
            {corrigida && q.gabarito && (
              <button onClick={criarFlashcard} disabled={comCartao.has(q.id)} className="btn btn-ghost !py-1.5 !text-sm">
                {comCartao.has(q.id) ? '✓ Flashcard criado' : '＋ Criar flashcard desta questão'}
              </button>
            )}
            {corrigida && q.comentario && <p className="text-sm whitespace-pre-line text-muted">{q.comentario}</p>}

            <div className="flex flex-wrap gap-2 pt-1">
              <button onClick={() => ir(-1)} disabled={pos === 0} className="btn btn-ghost">← Anterior</button>
              {!corrigida && <button onClick={corrigir} disabled={!escolha} className="btn btn-gold">Corrigir</button>}
              <button onClick={() => ir(1)} disabled={pos === ids.length - 1} className="btn btn-primary ml-auto">Próxima →</button>
            </div>
          </article>
        )}
      </main>
    </>
  );
}
