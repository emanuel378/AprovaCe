'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Topo } from '@/components/Topo';
import { T } from '@/lib/textos';
import { Combobox } from '@/components/Combobox';
import { autoAtivo, definirAuto } from '@/lib/flashcards-auto';
import { embaralhar } from '@/lib/simulado';
import { proximo, rotuloIntervalo, somarDias, type Nota } from '@/lib/sm2';

type Card = {
  id: string; frente: string; verso: string; disciplina_id: string | null; assunto_id: string | null; questao_id: string | null;
  favorito: boolean; repeticoes: number; facilidade: number; intervalo_dias: number; vence_em: string;
};
type Disc = { id: string; nome: string };
type Assunto = { id: string; disciplina_id: string; nome: string };
type ItemFila = { card: Card; repeticao: boolean }; // repeticao = reapresentado na sessão após "errei" (não grava de novo)
type Treino = { fila: Card[]; idx: number; notas: Record<string, Nota> }; // sessão de treino: sorteio de cartões, uma passada
type Aba = 'revisar' | 'treino' | 'cartoes';

const COLUNAS = 'id,frente,verso,disciplina_id,assunto_id,questao_id,favorito,repeticoes,facilidade,intervalo_dias,vence_em';
const NOTAS: { v: Nota; nome: string; cls: string; tecla: string }[] = [
  { v: 'errei', nome: 'Errei', cls: 'btn-ghost !border-red !text-red', tecla: '1' },
  { v: 'dificil', nome: 'Difícil', cls: 'btn-ghost', tecla: '2' },
  { v: 'bom', nome: 'Bom', cls: 'btn-primary', tecla: '3' },
  { v: 'facil', nome: 'Fácil', cls: 'btn-gold', tecla: '4' },
];
const hoje = () => new Date().toLocaleDateString('sv-SE');

/** Cartão em tela cheia, que vira como um cartão de verdade: frente (pergunta) e verso (resposta). Usado na revisão e no treino. */
function CartaoImersivo({ card, disciplina, contador, progresso, virado, onVirar, onNota, onSair, sub }: {
  card: Card; disciplina?: string; contador: string; progresso: number; virado: boolean; onVirar: () => void; onNota: (n: Nota) => void; onSair: () => void; sub: (n: Nota) => string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg" role="dialog" aria-modal="true" aria-label="Estudando flashcards">
      <header className="flex items-center gap-3 p-3 sm:p-4 max-w-md w-full mx-auto">
        <button onClick={onSair} className="btn btn-ghost !py-1.5 !px-3 !text-sm">✕ Sair</button>
        <div className="flex-1 barra" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progresso)}><i style={{ width: `${progresso}%` }} /></div>
        <span className="text-sm text-muted whitespace-nowrap">{contador}</span>
      </header>

      <div className="flex-1 min-h-0 grid place-items-center px-4 pb-2">
        <div key={card.id} className="flip-cena card-in w-full max-w-md h-full max-h-[640px]">
          <div className="flip" data-virado={virado} role="button" tabIndex={0} aria-label={virado ? 'Ver a pergunta' : 'Ver a resposta'} onClick={onVirar}>
            <div className="face face-frente" aria-hidden={virado}>
              <div className="flex items-center justify-between gap-2 text-xs text-muted">
                <span className="chip">{disciplina ?? 'Sem disciplina'}</span>
                <span className="uppercase tracking-wide">Pergunta</span>
              </div>
              <div className="flex-1 min-h-0 overflow-auto grid">
                <p className="m-auto py-4 text-center font-display text-xl sm:text-2xl font-semibold whitespace-pre-line leading-snug">{card.frente}</p>
              </div>
              <p className="text-center text-xs text-muted">Toque para virar ↻</p>
            </div>
            <div className="face face-verso" aria-hidden={!virado}>
              <div className="flex items-center justify-between gap-2 text-xs text-muted">
                <span className="chip">{disciplina ?? 'Sem disciplina'}</span>
                <span className="uppercase tracking-wide">Resposta</span>
              </div>
              <div className="flex-1 min-h-0 overflow-auto grid">
                <p className="m-auto py-4 text-lg sm:text-xl whitespace-pre-line leading-relaxed">{card.verso}</p>
              </div>
              <p className="text-center text-xs text-muted">Toque para ver a pergunta ↻</p>
            </div>
          </div>
        </div>
      </div>

      <footer className="p-3 sm:p-4 max-w-md w-full mx-auto">
        {virado ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {NOTAS.map((n) => (
              <button key={n.v} className={`btn ${n.cls} flex-col !gap-0`} onClick={() => onNota(n.v)}>
                <span>{n.nome}</span>
                <span className="text-[0.7rem] opacity-70 font-normal">{sub(n.v)}</span>
              </button>
            ))}
          </div>
        ) : (
          <button className="btn btn-primary w-full !py-3" onClick={onVirar}>Mostrar resposta</button>
        )}
        <p className="hidden sm:block text-center text-xs text-muted mt-2">Atalhos: espaço vira · 1 a 4 avaliam · Esc sai</p>
      </footer>
    </div>
  );
}

export default function Flashcards() {
  const router = useRouter();
  const [userId, setUserId] = useState('');
  const [cards, setCards] = useState<Card[]>([]);
  const [discs, setDiscs] = useState<Disc[]>([]);
  const [assuntos, setAssuntos] = useState<Assunto[]>([]);
  const [aba, setAba] = useState<Aba>('revisar');
  const [msg, setMsg] = useState('Carregando…');

  const [fila, setFila] = useState<ItemFila[] | null>(null); // null = ainda não montada
  const [virado, setVirado] = useState(false);
  const [feitos, setFeitos] = useState(0);
  const [revisando, setRevisando] = useState(false); // tela cheia da revisão aberta
  const [semCartoes, setSemCartoes] = useState(false); // tentou treinar sem ter cartões

  const [treinoN, setTreinoN] = useState(10);
  const [treinoDisc, setTreinoDisc] = useState('');
  const [treino, setTreino] = useState<Treino | null>(null);

  const [editando, setEditando] = useState<string | null>(null);
  const [formAberto, setFormAberto] = useState(false);
  const [frente, setFrente] = useState('');
  const [verso, setVerso] = useState('');
  const [fDisc, setFDisc] = useState('');
  const [fAssunto, setFAssunto] = useState('');
  const [filtroDisc, setFiltroDisc] = useState('');
  const [busca, setBusca] = useState('');
  const [excluindo, setExcluindo] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false); // evita criar o mesmo cartão duas vezes com cliques repetidos
  const [limite, setLimite] = useState(20); // quantos cartões aparecem na lista ("mostrar mais")
  const [apagando, setApagando] = useState(false); // exclusão em andamento (evita clique duplo)
  const [auto, setAuto] = useState(false); // criar flashcards dos erros automaticamente
  useEffect(() => setAuto(autoAtivo()), []);

  useEffect(() => {
    (async () => {
      const { data: s } = await supabase.auth.getSession();
      if (!s.session) return router.replace('/login');
      setUserId(s.session.user.id);
      const [c, d, a] = await Promise.all([
        supabase.from('flashcards').select(COLUNAS).order('vence_em').order('created_at'),
        supabase.from('disciplinas').select('id,nome').order('ordem'),
        supabase.from('assuntos').select('id,disciplina_id,nome').order('ordem'),
      ]);
      const erro = c.error ?? d.error ?? a.error;
      if (erro) return setMsg(`Erro: ${erro.message}`);
      setCards((c.data ?? []) as Card[]);
      setDiscs(d.data ?? []);
      setAssuntos(a.data ?? []);
      setMsg('');
    })();
  }, [router]);

  const vencidos = useMemo(() => cards.filter((c) => c.vence_em <= hoje()), [cards]);
  // A fila é montada uma vez por sessão (quando os cartões carregam) para não mudar enquanto você revisa.
  useEffect(() => {
    if (fila === null && !msg) setFila(vencidos.map((card) => ({ card, repeticao: false })));
  }, [fila, msg, vencidos]);

  // O filtro de matéria vale para a revisão e para a lista. Sem filtro, a fila é a de sempre.
  const visiveis = fila?.filter((i) => !filtroDisc || i.card.disciplina_id === filtroDisc) ?? [];
  const atual = visiveis[0];
  const contagem = useMemo(() => cards.reduce<Record<string, number>>((m, c) => { const k = c.disciplina_id ?? '_'; m[k] = (m[k] ?? 0) + 1; return m; }, {}), [cards]);
  const proximaData = useMemo(() => cards.filter((c) => c.vence_em > hoje()).map((c) => c.vence_em).sort()[0], [cards]);
  const poolTreino = useMemo(() => cards.filter((c) => !treinoDisc || c.disciplina_id === treinoDisc), [cards, treinoDisc]);
  const treinoAtual = treino && treino.idx < treino.fila.length ? treino.fila[treino.idx] : undefined;

  const avaliar = useCallback(async (nota: Nota) => {
    const item = fila?.find((i) => !filtroDisc || i.card.disciplina_id === filtroDisc);
    if (!fila || !item) return;
    const { card, repeticao } = item;
    const resto = fila.filter((i) => i !== item);
    setVirado(false);
    if (repeticao) { // segunda passada do "errei": só sai da fila (ou volta ao fim se errar de novo)
      setFila(nota === 'errei' ? [...resto, { card, repeticao: true }] : resto);
      return;
    }
    const novo = proximo(card, nota);
    const vence = somarDias(novo.intervalo_dias);
    const { error } = await supabase.from('flashcards').update({ ...novo, vence_em: vence, ultima_revisao: new Date().toISOString() }).eq('id', card.id);
    if (error) return setMsg(`Erro ao salvar a revisão: ${error.message}`);
    await supabase.from('flashcard_revisoes').insert({ user_id: userId, flashcard_id: card.id, nota, intervalo_dias: novo.intervalo_dias });
    setCards((cs) => cs.map((c) => (c.id === card.id ? { ...c, ...novo, vence_em: vence } : c)));
    setFeitos((n) => n + 1);
    setMsg('');
    setFila(nota === 'errei' ? [...resto, { card: { ...card, ...novo, vence_em: vence }, repeticao: true }] : resto);
  }, [fila, userId, filtroDisc]);

  // Treino não mexe na agenda de revisão, exceto quando você erra: o cartão volta a vencer hoje.
  const avaliarTreino = useCallback(async (nota: Nota) => {
    if (!treino || !treinoAtual) return;
    setVirado(false);
    if (nota === 'errei') {
      const novo = { ...proximo(treinoAtual, 'errei'), vence_em: hoje() };
      const { error } = await supabase.from('flashcards').update(novo).eq('id', treinoAtual.id);
      if (error) return setMsg(`Erro ao salvar: ${error.message}`);
      setCards((cs) => cs.map((c) => (c.id === treinoAtual.id ? { ...c, ...novo } : c)));
      setMsg('');
    }
    setTreino({ ...treino, idx: treino.idx + 1, notas: { ...treino.notas, [treinoAtual.id]: nota } });
  }, [treino, treinoAtual]);

  const emSessao = (aba === 'revisar' && revisando && !!atual) || (aba === 'treino' && !!treinoAtual);
  const cartaoAtivo = emSessao ? (aba === 'revisar' ? atual?.card : treinoAtual) : undefined;
  const darNota = aba === 'treino' ? avaliarTreino : avaliar;
  const sairSessao = useCallback(() => {
    if (aba === 'treino') setTreino(null); else setRevisando(false);
    setVirado(false);
  }, [aba]);
  useEffect(() => { // atalhos: espaço vira o cartão; 1-4 avaliam; Esc sai
    function tecla(e: KeyboardEvent) {
      if (!cartaoAtivo || (e.target as HTMLElement).closest('input,textarea,select')) return;
      if (e.key === 'Escape') sairSessao();
      else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setVirado((v) => !v); }
      else if (virado) { const n = NOTAS.find((x) => x.tecla === e.key); if (n) void darNota(n.v); }
    }
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [cartaoAtivo, virado, darNota, sairSessao]);
  useEffect(() => { // em tela cheia a página de trás não rola
    if (!emSessao) return;
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = antes; };
  }, [emSessao]);

  function iniciarTreino(base: Card[] = poolTreino) {
    if (!base.length) { setSemCartoes(true); return; }
    setSemCartoes(false);
    const sorteados = embaralhar(base, Math.random).slice(0, Math.min(Math.max(treinoN, 1), base.length));
    setVirado(false);
    setTreino({ fila: sorteados, idx: 0, notas: {} });
  }

  function novoForm(c?: Card) {
    setEditando(c?.id ?? null);
    setFrente(c?.frente ?? '');
    setVerso(c?.verso ?? '');
    setFDisc(c?.disciplina_id ?? '');
    setFAssunto(c?.assunto_id ?? '');
    setFormAberto(true);
  }
  function salvarCartao(e: React.FormEvent) {
    e.preventDefault();
    if (salvando) return;
    setSalvando(true);
    void salvarCartaoInterno().finally(() => setSalvando(false));
  }
  async function salvarCartaoInterno() {
    const dados = { frente: frente.trim(), verso: verso.trim(), disciplina_id: fDisc || null, assunto_id: fAssunto || null };
    if (!dados.frente || !dados.verso) return;
    if (editando) {
      const { error } = await supabase.from('flashcards').update(dados).eq('id', editando);
      if (error) return setMsg(`Erro: ${error.message}`);
      setCards((cs) => cs.map((c) => (c.id === editando ? { ...c, ...dados } : c)));
    } else {
      const { data, error } = await supabase.from('flashcards').insert({ ...dados, user_id: userId }).select(COLUNAS).single();
      if (error) return setMsg(`Erro: ${error.message}`);
      setCards((cs) => [...cs, data as Card]);
      setFila((f) => (f ? [...f, { card: data as Card, repeticao: false }] : f)); // cartão novo vence hoje: entra na sessão
    }
    setMsg('');
    setFormAberto(false);
    setEditando(null);
  }
  async function excluir(id: string) {
    if (apagando) return;
    setApagando(true);
    const { error } = await supabase.from('flashcards').delete().eq('id', id);
    setApagando(false);
    if (error) { setExcluindo(null); return setMsg(`Erro: ${error.message}`); }
    setCards((cs) => cs.filter((c) => c.id !== id));
    setFila((f) => f && f.filter((i) => i.card.id !== id));
    setTreino((t) => (t ? { ...t, fila: t.fila.filter((c) => c.id !== id) } : t));
    setExcluindo(null);
  }
  async function favoritar(c: Card) {
    const { error } = await supabase.from('flashcards').update({ favorito: !c.favorito }).eq('id', c.id);
    if (!error) setCards((cs) => cs.map((x) => (x.id === c.id ? { ...x, favorito: !c.favorito } : x)));
  }

  useEffect(() => { // Esc fecha a caixa de confirmação
    if (!excluindo) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setExcluindo(null); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [excluindo]);

  const nomeDisc = (id: string | null) => discs.find((d) => d.id === id)?.nome;
  const lista = cards.filter((c) => (!filtroDisc || c.disciplina_id === filtroDisc) && (!busca || (c.frente + ' ' + c.verso).toLowerCase().includes(busca.toLowerCase())));
  const dominados = cards.filter((c) => c.intervalo_dias >= 21).length;
  const restantes = visiveis.length;
  const campo = 'field';
  const abas: { v: Aba; nome: string }[] = [
    { v: 'revisar', nome: `Revisar${restantes ? ` (${restantes})` : ''}` },
    { v: 'treino', nome: 'Treino' },
    { v: 'cartoes', nome: 'Meus cartões' },
  ];
  const resumo = treino && !treinoAtual ? {
    total: treino.fila.length,
    lembrei: Object.values(treino.notas).filter((n) => n !== 'errei').length,
    errados: treino.fila.filter((c) => treino.notas[c.id] === 'errei'),
  } : null;

  return (
    <>
      <Topo />
      <main className="max-w-3xl mx-auto p-4 space-y-4">
        <h1 className="text-2xl font-bold text-brand">{T.flashcards}</h1>
        <section className="grid gap-3 grid-cols-3">
          {[['Para revisar hoje', vencidos.length], ['Total de cartões', cards.length], ['Dominados', dominados]].map(([r, v]) => (
            <div key={r} className="card p-4"><p className="text-xs text-muted">{r}</p><p className="font-display text-2xl font-bold text-brand">{v}</p></div>
          ))}
        </section>

        <label className="card p-3 flex items-start gap-3 text-sm cursor-pointer">
          <input type="checkbox" className="check mt-0.5" checked={auto} onChange={(e) => { setAuto(e.target.checked); definirAuto(e.target.checked); }} />
          <span><strong>Criar flashcards automaticamente dos meus erros</strong><span className="block text-muted">Quando você errar uma questão ou um simulado, o cartão é criado sozinho, com a resposta certa e o comentário.</span></span>
        </label>

        <div className="flex gap-2 overflow-x-auto" role="tablist">
          {abas.map((a) => (
            <button key={a.v} role="tab" aria-selected={aba === a.v} onClick={() => { setAba(a.v); setVirado(false); }} className={`btn btn-ghost shrink-0 ${aba === a.v ? '!border-blue !text-brand' : 'opacity-70'}`}>
              {a.nome}
            </button>
          ))}
        </div>

        {cards.length > 0 && aba !== 'treino' && (
          <div className="flex items-center gap-2">
            <select className="field !w-auto" aria-label="Filtrar por matéria" value={filtroDisc} onChange={(e) => { setFiltroDisc(e.target.value); setVirado(false); setLimite(20); }}>
              <option value="">Todas as matérias</option>
              {discs.filter((d) => contagem[d.id]).map((d) => <option key={d.id} value={d.id}>{d.nome} ({contagem[d.id]})</option>)}
            </select>
            {filtroDisc && <button className="btn-limpar" onClick={() => { setFiltroDisc(''); setLimite(20); }}>✕ Limpar</button>}
          </div>
        )}

        {msg && <p role="alert" className={msg.startsWith('Erro') ? 'text-sm text-red' : 'text-muted'}>{msg}</p>}

        {aba === 'revisar' && !msg && (
          atual ? (
            <section className="card p-8 text-center space-y-4">
              <p className="font-display text-4xl font-extrabold text-brand">{restantes}</p>
              <p className="text-muted">{restantes === 1 ? 'cartão para revisar' : 'cartões para revisar'}{filtroDisc ? ' nesta matéria' : ''}</p>
              <button className="btn btn-gold !px-8 !py-3" onClick={() => { setVirado(false); setRevisando(true); }}>Começar revisão →</button>
              <p className="text-xs text-muted">Ao responder, o cartão some por um tempo e volta aqui quando chegar a hora de revisar de novo.</p>
            </section>
          ) : (
            <section className="card p-8 text-center space-y-3">
              <p className="font-display text-xl font-bold text-brand">{(cards.length ? (filtroDisc ? T.revisaoMateria : T.revisaoEmDia) : T.semCartoes).titulo}<span className="block text-sm font-normal text-muted mt-1">{(cards.length ? (filtroDisc ? T.revisaoMateria : T.revisaoEmDia) : T.semCartoes).texto}</span></p>
              <p className="text-sm text-muted">
                {cards.length
                  ? `${proximaData ? `Os próximos cartões voltam em ${proximaData.split('-').reverse().join('/')}. ` : ''}Eles continuam guardados em "Meus cartões". Quer praticar agora?`
                  : 'Crie o primeiro em "Meus cartões" ou transforme uma questão errada em cartão na tela de questões.'}
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {cards.length > 0 && <button className="btn btn-gold" onClick={() => setAba('treino')}>Fazer um treino</button>}
                <button className="btn btn-ghost" onClick={() => { setAba('cartoes'); novoForm(); }}>Criar cartão</button>
              </div>
            </section>
          )
        )}

        {aba === 'treino' && !msg && (
          resumo ? (
            <section className="hero rounded-2xl p-6 space-y-4">
              <div className="relative z-10">
                <p className="text-sm opacity-80">Treino concluído</p>
                <p className="font-display text-4xl font-extrabold">{resumo.lembrei}<span className="text-xl opacity-70"> de {resumo.total} lembrados</span></p>
                <p className="text-sm opacity-80 mt-1">{resumo.errados.length ? `${resumo.errados.length} para revisar de novo.` : 'Você acertou todos.'}</p>
              </div>
              <div className="relative z-10 flex flex-wrap gap-2">
                <button className="btn btn-gold" onClick={() => iniciarTreino()}>Sortear outro treino</button>
                {resumo.errados.length > 0 && <button className="btn btn-ghost !text-white !border-white/30" onClick={() => iniciarTreino(resumo.errados)}>Rever os que errei ({resumo.errados.length})</button>}
                <button className="btn btn-ghost !text-white !border-white/30" onClick={() => setTreino(null)}>Voltar</button>
              </div>
            </section>
          ) : !treino && (
            <section className="card p-5 sm:p-6 space-y-5">
              <div>
                <h2 className="font-display text-xl font-bold text-brand">Treino de flashcards</h2>
                <p className="text-sm text-muted">Sorteie cartões que você já tem, de qualquer matéria ou de uma só, sem esperar a data de revisão.</p>
              </div>
              {cards.length > 0 && (
                <>
                  <label className="text-sm space-y-1 block">Matéria
                    <select className="field" value={treinoDisc} onChange={(e) => setTreinoDisc(e.target.value)}>
                      <option value="">Todas as matérias ({cards.length})</option>
                      {discs.filter((d) => contagem[d.id]).map((d) => <option key={d.id} value={d.id}>{d.nome} ({contagem[d.id]})</option>)}
                    </select>
                  </label>
                  <div className="text-sm space-y-2">
                    <label className="space-y-1 block">Quantos cartões?
                      <input type="number" className="field" min={1} max={poolTreino.length} value={treinoN} onChange={(e) => setTreinoN(Number(e.target.value) || 1)} />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {[5, 10, 20, 50].filter((n) => n < poolTreino.length).map((n) => (
                        <button key={n} type="button" className={`btn btn-ghost !py-1 !px-3 !text-sm ${treinoN === n ? '!border-blue !text-brand' : ''}`} onClick={() => setTreinoN(n)}>{n}</button>
                      ))}
                      <button type="button" className={`btn btn-ghost !py-1 !px-3 !text-sm ${treinoN >= poolTreino.length ? '!border-blue !text-brand' : ''}`} onClick={() => setTreinoN(poolTreino.length)}>Todos ({poolTreino.length})</button>
                    </div>
                  </div>
                </>
              )}
              <button className="btn btn-gold" onClick={() => iniciarTreino()}>Treinar →</button>
              {semCartoes && (
                <div role="alert" className="rounded-xl border border-gold bg-gold/10 p-4 text-sm space-y-2">
                  <p className="font-semibold">{T.semMunicao}</p>
                  <p className="text-muted">Crie o primeiro para poder treinar.</p>
                  <button className="btn btn-ghost !py-1.5 !text-sm" onClick={() => { setAba('cartoes'); novoForm(); }}>Criar cartão</button>
                </div>
              )}
              {cards.length > 0 && <p className="text-xs text-muted">O treino não muda a data das suas revisões. Só quando você marca "Errei", o cartão volta a vencer hoje.</p>}
            </section>
          )
        )}

        {aba === 'cartoes' && (
          <>
            {formAberto ? (
              <form onSubmit={salvarCartao} className="card p-5 space-y-3">
                <h2 className="font-display font-bold text-brand">{editando ? 'Editar cartão' : 'Novo cartão'}</h2>
                <label className="text-sm space-y-1 block">Frente (pergunta)
                  <textarea className={`${campo} min-h-20`} required value={frente} onChange={(e) => setFrente(e.target.value)} placeholder="Ex.: Qual o prazo do inquérito com indiciado preso?" />
                </label>
                <label className="text-sm space-y-1 block">Verso (resposta)
                  <textarea className={`${campo} min-h-20`} required value={verso} onChange={(e) => setVerso(e.target.value)} placeholder="Ex.: 10 dias, contados da execução da ordem de prisão." />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="text-sm space-y-1">
                    <span>Disciplina</span>
                    <Combobox rotulo="Disciplina" vazio="Escolha ou digite" valor={fDisc} opcoes={discs}
                      onChange={(id) => { setFDisc(id); if (assuntos.find((a) => a.id === fAssunto)?.disciplina_id !== id) setFAssunto(''); }} />
                  </div>
                  <div className="text-sm space-y-1">
                    <span>Assunto</span>
                    <Combobox rotulo="Assunto" vazio="Escolha ou digite" valor={fAssunto}
                      opcoes={(fDisc ? assuntos.filter((a) => a.disciplina_id === fDisc) : assuntos).map((a) => ({ id: a.id, nome: a.nome, detalhe: fDisc ? undefined : nomeDisc(a.disciplina_id) }))}
                      onChange={(id) => { setFAssunto(id); const a = assuntos.find((x) => x.id === id); if (a && !fDisc) setFDisc(a.disciplina_id); }} />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className="btn btn-gold" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
                  <button type="button" className="btn btn-ghost" onClick={() => { setFormAberto(false); setEditando(null); }}>Cancelar</button>
                </div>
              </form>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button className="btn btn-gold" onClick={() => novoForm()}>＋ Novo cartão</button>
                <input className={`${campo} !w-auto flex-1 min-w-40`} placeholder="Buscar…" aria-label="Buscar" value={busca} onChange={(e) => { setBusca(e.target.value); setLimite(20); }} />
              </div>
            )}

            <ul className="space-y-2">
              {lista.slice(0, limite).map((c) => (
                <li key={c.id} className="card p-4 space-y-2">
                  <p className="font-semibold whitespace-pre-line">{c.frente}</p>
                  <p className="text-sm text-muted whitespace-pre-line line-clamp-3">{c.verso}</p>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {c.disciplina_id && <span className="chip">{nomeDisc(c.disciplina_id)}</span>}
                    <span className={`chip ${c.vence_em <= hoje() ? 'chip-gold' : ''}`}>{c.vence_em <= hoje() ? 'Vence hoje' : `Próxima: ${c.vence_em.split('-').reverse().join('/')}`}</span>
                    <span className="ml-auto flex gap-1">
                      <button className="btn btn-ghost !py-1 !px-2 !text-sm" aria-pressed={c.favorito} onClick={() => void favoritar(c)}>{c.favorito ? '★' : '☆'}</button>
                      <button className="btn btn-ghost !py-1 !px-2 !text-sm" onClick={() => novoForm(c)}>Editar</button>
                      <button className="btn btn-ghost !py-1 !px-2 !text-sm" onClick={() => setExcluindo(c.id)}>Excluir</button>
                    </span>
                  </div>
                </li>
              ))}
              {lista.length > limite && <li><button className="btn btn-ghost w-full" onClick={() => setLimite((l) => l + 20)}>Mostrar mais ({lista.length - limite} restantes)</button></li>}
              {!lista.length && !formAberto && <li className="card p-6 text-center text-muted">Nenhum cartão encontrado.</li>}
            </ul>
          </>
        )}
      </main>

      {excluindo && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setExcluindo(null)}>
          <div className="card w-full max-w-sm p-6 space-y-4 card-in" role="alertdialog" aria-modal="true" aria-labelledby="excluir-titulo" aria-describedby="excluir-texto" onClick={(e) => e.stopPropagation()}>
            <h2 id="excluir-titulo" className="font-display text-xl font-bold text-brand">Excluir este cartão?</h2>
            <p id="excluir-texto" className="text-sm text-muted">
              Você tem certeza? O cartão e o histórico de revisões dele serão apagados e <strong>não dá para desfazer</strong>.
            </p>
            <p className="text-sm rounded-lg border-l-4 border-red bg-red/10 px-3 py-2 line-clamp-3">{cards.find((c) => c.id === excluindo)?.frente}</p>
            <div className="flex flex-wrap justify-end gap-2">
              <button autoFocus className="btn btn-ghost" onClick={() => setExcluindo(null)} disabled={apagando}>Cancelar</button>
              <button className="btn btn-primary !bg-red !shadow-none" onClick={() => void excluir(excluindo)} disabled={apagando}>{apagando ? 'Excluindo…' : 'Sim, excluir'}</button>
            </div>
          </div>
        </div>
      )}

      {emSessao && aba === 'revisar' && atual && (
        <CartaoImersivo card={atual.card} disciplina={nomeDisc(atual.card.disciplina_id)} virado={virado} onVirar={() => setVirado((v) => !v)} onNota={(n) => void avaliar(n)} onSair={sairSessao}
          contador={`${restantes} na fila${atual.repeticao ? ' · repetindo' : ''}`} progresso={(feitos / Math.max(feitos + restantes, 1)) * 100}
          sub={(n) => (atual.repeticao ? 'ainda hoje' : `volta em ${rotuloIntervalo(proximo(atual.card, n).intervalo_dias)}`)} />
      )}
      {emSessao && aba === 'treino' && treino && treinoAtual && (
        <CartaoImersivo card={treinoAtual} disciplina={nomeDisc(treinoAtual.disciplina_id)} virado={virado} onVirar={() => setVirado((v) => !v)} onNota={(n) => void avaliarTreino(n)} onSair={sairSessao}
          contador={`${treino.idx + 1} de ${treino.fila.length}`} progresso={(treino.idx / treino.fila.length) * 100}
          sub={(n) => (n === 'errei' ? 'revisar hoje' : 'agenda igual')} />
      )}
    </>
  );
}
