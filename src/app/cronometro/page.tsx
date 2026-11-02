'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Topo } from '@/components/Topo';
import { T } from '@/lib/textos';
import { Combobox } from '@/components/Combobox';
import { estudado, exibicao, fmtDuracao, fmtRelogio, rodandoSeg, type Config, type Modo } from '@/lib/cronometro';

type Cron = {
  id: string; modo: Modo; tipo: string | null; disciplina_id: string | null; assunto_id: string | null; sessao_estudo_id: string | null;
  inicio: string; segundos_efetivos: number; estado: 'rodando' | 'pausado' | 'finalizado'; ultimo_retomar: string | null;
  pausas: { em: string }[]; config: Config;
};
type Disc = { id: string; nome: string };
type Assunto = { id: string; disciplina_id: string; nome: string };
type Sessao = { id: string; disciplina_id: string | null; assunto_id: string | null; tipo: string; duracao_min: number; meta: string | null };
type Feito = { segundos_efetivos: number; inicio: string; disciplina_id: string | null };

const COLUNAS = 'id,modo,tipo,disciplina_id,assunto_id,sessao_estudo_id,inicio,segundos_efetivos,estado,ultimo_retomar,pausas,config';
const TIPOS = [['teoria', 'Teoria'], ['questoes', 'Questões'], ['revisao', 'Revisão'], ['flashcards', 'Flashcards'], ['simulado', 'Simulado'], ['livre', 'Livre']] as const;
const MODOS: { v: Modo; nome: string; desc: string }[] = [
  { v: 'crescente', nome: 'Livre', desc: 'Conta para cima' },
  { v: 'regressivo', nome: 'Meta de tempo', desc: 'Conta para baixo' },
  { v: 'pomodoro', nome: 'Pomodoro', desc: 'Foco e pausa' },
];
const dia = (d: Date) => d.toLocaleDateString('sv-SE');

function beep() { // sinal sonoro curto; se o navegador bloquear o áudio, segue sem som
  try {
    const ctx = new AudioContext();
    [0, 0.3].forEach((atraso) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.2, ctx.currentTime + atraso); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + atraso + 0.25);
      o.start(ctx.currentTime + atraso); o.stop(ctx.currentTime + atraso + 0.25);
    });
  } catch { /* sem áudio */ }
}

export default function Cronometro() {
  const router = useRouter();
  const [userId, setUserId] = useState('');
  const [discs, setDiscs] = useState<Disc[]>([]);
  const [assuntos, setAssuntos] = useState<Assunto[]>([]);
  const [sessoes, setSessoes] = useState<Sessao[]>([]);
  const [feitos, setFeitos] = useState<Feito[]>([]);
  const [ativo, setAtivo] = useState<Cron | null>(null);
  const [agora, setAgora] = useState(() => Date.now());
  const [msg, setMsg] = useState('Carregando…');
  const [ocupado, setOcupado] = useState(false);

  const [modo, setModo] = useState<Modo>('crescente');
  const [alvoMin, setAlvoMin] = useState(50);
  const [focoMin, setFocoMin] = useState(25);
  const [pausaMin, setPausaMin] = useState(5);
  const [disc, setDisc] = useState('');
  const [assunto, setAssunto] = useState('');
  const [tipo, setTipo] = useState('teoria');
  const [sessaoId, setSessaoId] = useState('');

  const [fechando, setFechando] = useState(false);
  const [nota, setNota] = useState('');
  const [marcar, setMarcar] = useState(true);
  const travado = useRef(false);
  const faseAnterior = useRef('');

  const preencher = useCallback((s: Sessao) => {
    setSessaoId(s.id); setDisc(s.disciplina_id ?? ''); setAssunto(s.assunto_id ?? ''); setTipo(s.tipo === 'pausa' ? 'livre' : s.tipo); setAlvoMin(s.duracao_min);
  }, []);

  useEffect(() => {
    (async () => {
      const { data: s } = await supabase.auth.getSession();
      if (!s.session) return router.replace('/login');
      setUserId(s.session.user.id);
      const seg = new Date(); seg.setDate(seg.getDate() - ((seg.getDay() + 6) % 7)); seg.setHours(0, 0, 0, 0); // segunda-feira desta semana
      const [d, a, se, c, f] = await Promise.all([
        supabase.from('disciplinas').select('id,nome').order('ordem'),
        supabase.from('assuntos').select('id,disciplina_id,nome').order('ordem'),
        supabase.from('sessoes_estudo').select('id,disciplina_id,assunto_id,tipo,duracao_min,meta').eq('data', dia(new Date())).eq('concluida', false).neq('tipo', 'pausa').order('inicio', { nullsFirst: false }),
        supabase.from('cronometro_sessoes').select(COLUNAS).neq('estado', 'finalizado').limit(1).maybeSingle(),
        supabase.from('cronometro_sessoes').select('segundos_efetivos,inicio,disciplina_id').eq('estado', 'finalizado').gte('inicio', seg.toISOString()),
      ]);
      const erro = d.error ?? a.error ?? se.error ?? c.error ?? f.error;
      if (erro) return setMsg(erro.message.includes('config') ? 'Erro: falta rodar a migração 0002_cronometro_config.sql no Supabase (SQL Editor).' : `Erro: ${erro.message}`);
      setDiscs(d.data ?? []); setAssuntos(a.data ?? []); setSessoes((se.data ?? []) as Sessao[]); setFeitos((f.data ?? []) as Feito[]);
      setAtivo((c.data as Cron | null) ?? null);
      const pedida = new URLSearchParams(window.location.search).get('sessao'); // vindo do cronograma
      if (pedida) {
        const { data: ps } = await supabase.from('sessoes_estudo').select('id,disciplina_id,assunto_id,tipo,duracao_min,meta').eq('id', pedida).maybeSingle();
        if (ps) { setSessoes((l) => (l.some((x) => x.id === ps.id) ? l : [...l, ps as Sessao])); preencher(ps as Sessao); }
      }
      setMsg('');
    })();
  }, [router, preencher]);

  const rodando = ativo?.estado === 'rodando';
  useEffect(() => {
    if (!rodando) return;
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [rodando]);

  const ex = ativo ? exibicao(ativo, agora) : null;
  useEffect(() => { // aba do navegador mostra o tempo
    if (!ex) return;
    document.title = `${fmtRelogio(ex.segundos)} · Aprove CE`;
    return () => { document.title = 'Aprove CE'; };
  }, [ex?.segundos]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { // pomodoro: avisa quando troca foco/pausa
    if (!ex || ativo?.modo !== 'pomodoro' || !rodando) return;
    const fase = ex.rotulo.startsWith('Foco') ? 'foco' : 'pausa';
    if (faseAnterior.current && faseAnterior.current !== fase) beep();
    faseAnterior.current = fase;
  }, [ex?.rotulo]); // eslint-disable-line react-hooks/exhaustive-deps

  const nome = (lista: { id: string; nome: string }[], id: string | null) => lista.find((x) => x.id === id)?.nome;

  async function iniciar() {
    setOcupado(true);
    const iso = new Date().toISOString();
    const config: Config = modo === 'regressivo' ? { alvo_min: alvoMin } : modo === 'pomodoro' ? { foco_min: focoMin, pausa_min: pausaMin } : {};
    const { data, error } = await supabase.from('cronometro_sessoes').insert({
      user_id: userId, modo, tipo, disciplina_id: disc || null, assunto_id: assunto || null, sessao_estudo_id: sessaoId || null,
      inicio: iso, estado: 'rodando', ultimo_retomar: iso, segundos_efetivos: 0, config,
    }).select(COLUNAS).single();
    setOcupado(false);
    if (error) return setMsg(error.code === '23505' ? 'Erro: você já tem um cronômetro em andamento. Recarregue a página.' : `Erro: ${error.message}`);
    faseAnterior.current = '';
    setMsg('');
    setAtivo(data as Cron);
    setAgora(Date.now());
  }

  async function pausarOuRetomar() {
    if (!ativo) return;
    const iso = new Date().toISOString();
    const patch = rodando
      ? { estado: 'pausado', segundos_efetivos: rodandoSeg(ativo), ultimo_retomar: null, pausas: [...ativo.pausas, { em: iso }] }
      : { estado: 'rodando', ultimo_retomar: iso };
    const { data, error } = await supabase.from('cronometro_sessoes').update(patch).eq('id', ativo.id).select(COLUNAS).single();
    if (error) return setMsg(`Erro: ${error.message}`);
    setAtivo(data as Cron);
    setAgora(Date.now());
  }

  const concluir = useCallback(async (anotacao: string, marcarSessao: boolean) => {
    if (!ativo || travado.current) return;
    travado.current = true;
    setOcupado(true);
    let seg = estudado(ativo);
    if (ativo.modo === 'regressivo') seg = Math.min(seg, (ativo.config.alvo_min ?? 50) * 60); // se a aba ficou fechada, não passa da meta
    const base = { estado: 'finalizado', fim: new Date().toISOString(), segundos_efetivos: seg, ultimo_retomar: null };
    let { error } = await supabase.from('cronometro_sessoes').update(base).eq('id', ativo.id);
    let desvinculado = false;
    if (error?.code === '23505') { // a sessão do cronograma já tem um cronômetro finalizado: salva sem o vínculo
      ({ error } = await supabase.from('cronometro_sessoes').update({ ...base, sessao_estudo_id: null }).eq('id', ativo.id));
      desvinculado = true;
    }
    if (error) { travado.current = false; setOcupado(false); return setMsg(`Erro ao finalizar: ${error.message}`); }
    if (ativo.sessao_estudo_id && marcarSessao && !desvinculado) {
      await supabase.from('sessoes_estudo').update({ concluida: true, tempo_real_min: Math.max(1, Math.round(seg / 60)), obs_pos: anotacao.trim() || null }).eq('id', ativo.sessao_estudo_id);
    }
    setFeitos((f) => [...f, { segundos_efetivos: seg, inicio: ativo.inicio, disciplina_id: ativo.disciplina_id }]);
    setSessoes((l) => l.filter((x) => x.id !== ativo.sessao_estudo_id));
    setAtivo(null); setFechando(false); setNota(''); setOcupado(false); setSessaoId('');
    setMsg(desvinculado ? 'Tempo salvo, mas a sessão do cronograma já tinha outro cronômetro finalizado e não foi marcada.' : '');
    travado.current = false;
  }, [ativo]);

  useEffect(() => { // meta de tempo acabou: toca e finaliza sozinho
    if (ativo?.modo === 'regressivo' && rodando && ex?.fim) { beep(); void concluir('', true); }
  }, [ex?.fim, ativo?.modo, rodando, concluir]);

  async function descartar() {
    if (!ativo) return;
    const { error } = await supabase.from('cronometro_sessoes').delete().eq('id', ativo.id);
    if (error) return setMsg(`Erro: ${error.message}`);
    setAtivo(null); setFechando(false);
  }

  const hojeStr = dia(new Date());
  const totais = useMemo(() => {
    const atual = ativo ? estudado(ativo, agora) : 0;
    const semana = feitos.reduce((s, f) => s + f.segundos_efetivos, 0) + atual;
    const hoje = feitos.filter((f) => dia(new Date(f.inicio)) === hojeStr).reduce((s, f) => s + f.segundos_efetivos, 0) + atual;
    const por: Record<string, number> = {};
    for (const f of feitos) por[f.disciplina_id ?? '_'] = (por[f.disciplina_id ?? '_'] ?? 0) + f.segundos_efetivos;
    if (ativo) por[ativo.disciplina_id ?? '_'] = (por[ativo.disciplina_id ?? '_'] ?? 0) + atual;
    return { semana, hoje, por: Object.entries(por).sort((a, b) => b[1] - a[1]) };
  }, [feitos, ativo, agora, hojeStr]);

  const assuntoOpcoes = (disc ? assuntos.filter((a) => a.disciplina_id === disc) : assuntos).map((a) => ({ id: a.id, nome: a.nome, detalhe: disc ? undefined : nome(discs, a.disciplina_id) }));
  const emPausaPomodoro = ativo?.modo === 'pomodoro' && ex && !ex.rotulo.startsWith('Foco');
  const progresso = ativo && ex ? (ativo.modo === 'regressivo' ? 100 - (ex.segundos / ((ativo.config.alvo_min ?? 50) * 60)) * 100
    : ativo.modo === 'pomodoro' ? 100 - (ex.segundos / (((ex.rotulo.startsWith('Foco') ? ativo.config.foco_min ?? 25 : ativo.config.pausa_min ?? 5)) * 60)) * 100 : null) : null;

  return (
    <>
      <Topo />
      <main className="max-w-2xl mx-auto p-4 space-y-4">
        {msg && <p role="alert" className={msg.startsWith('Erro') ? 'text-sm text-red' : 'text-sm text-muted'}>{msg}</p>}

        {ativo && ex ? (
          <section className="hero rounded-3xl p-6 sm:p-10 text-center space-y-5" aria-live="off">
            <div className="relative z-10 space-y-3">
              <span className="chip chip-gold">{ex.rotulo}{ativo.estado === 'pausado' && ' · pausado'}</span>
              <p className={`font-display font-extrabold tabular-nums leading-none text-6xl sm:text-8xl ${emPausaPomodoro ? 'opacity-70' : ''}`} role="timer">{fmtRelogio(ex.segundos)}</p>
              {progresso !== null && <div className="barra !bg-white/20 max-w-xs mx-auto"><i style={{ width: `${Math.min(Math.max(progresso, 0), 100)}%` }} /></div>}
              <p className="text-sm opacity-80">
                {[TIPOS.find((t) => t[0] === ativo.tipo)?.[1], nome(discs, ativo.disciplina_id), nome(assuntos, ativo.assunto_id)].filter(Boolean).join(' · ') || 'Sem disciplina'}
              </p>
              {emPausaPomodoro && <p className="text-sm">Hora de descansar: levante, beba água.</p>}
              {ativo.modo === 'pomodoro' && <p className="text-xs opacity-70">Estudado até agora: {fmtDuracao(estudado(ativo, agora))}</p>}
            </div>
            <div className="relative z-10 flex flex-wrap justify-center gap-3">
              <button className="btn btn-gold !px-8 !py-3" onClick={() => void pausarOuRetomar()}>{rodando ? 'Pausar' : 'Retomar'}</button>
              <button className="btn btn-ghost !text-white !border-white/30 !py-3" onClick={() => { setMarcar(true); setFechando(true); }}>Finalizar</button>
            </div>
          </section>
        ) : !msg.startsWith('Erro: falta') && (
          <section className="card p-5 sm:p-6 space-y-5">
            <h1 className="text-2xl font-bold text-brand">{T.cronometro}</h1>

            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Modo">
              {MODOS.map((m) => (
                <button key={m.v} role="radio" aria-checked={modo === m.v} onClick={() => setModo(m.v)}
                  className={`btn btn-ghost flex-col !gap-0 !px-2 ${modo === m.v ? '!border-blue !text-brand bg-blue/10' : ''}`}>
                  <span>{m.nome}</span><span className="text-[0.7rem] opacity-70 font-normal">{m.desc}</span>
                </button>
              ))}
            </div>

            {modo === 'regressivo' && (
              <div className="text-sm space-y-2">
                <label className="space-y-1 block">Meta (minutos)
                  <input type="number" className="field" min={1} value={alvoMin} onChange={(e) => setAlvoMin(Math.max(1, Number(e.target.value) || 1))} />
                </label>
                <div className="flex gap-2">{[25, 50, 90].map((n) => <button key={n} type="button" className={`btn btn-ghost !py-1 !px-3 !text-sm ${alvoMin === n ? '!border-blue !text-brand' : ''}`} onClick={() => setAlvoMin(n)}>{n} min</button>)}</div>
              </div>
            )}
            {modo === 'pomodoro' && (
              <div className="grid grid-cols-2 gap-3 text-sm">
                <label className="space-y-1">Foco (min)<input type="number" className="field" min={1} value={focoMin} onChange={(e) => setFocoMin(Math.max(1, Number(e.target.value) || 1))} /></label>
                <label className="space-y-1">Pausa (min)<input type="number" className="field" min={1} value={pausaMin} onChange={(e) => setPausaMin(Math.max(1, Number(e.target.value) || 1))} /></label>
              </div>
            )}

            {sessoes.length > 0 && (
              <label className="text-sm space-y-1 block">Sessão do cronograma de hoje
                <select className="field" value={sessaoId} onChange={(e) => { const s = sessoes.find((x) => x.id === e.target.value); if (s) preencher(s); else setSessaoId(''); }}>
                  <option value="">— estudo avulso —</option>
                  {sessoes.map((s) => <option key={s.id} value={s.id}>{[TIPOS.find((t) => t[0] === s.tipo)?.[1], nome(discs, s.disciplina_id), s.duracao_min + ' min'].filter(Boolean).join(' · ')}</option>)}
                </select>
              </label>
            )}

            <div className="grid gap-3 sm:grid-cols-2 text-sm">
              <div className="space-y-1"><span>Disciplina</span>
                <Combobox rotulo="Disciplina" vazio="Escolha ou digite" valor={disc} opcoes={discs} onChange={(id) => { setDisc(id); if (assuntos.find((a) => a.id === assunto)?.disciplina_id !== id) setAssunto(''); }} />
              </div>
              <div className="space-y-1"><span>Assunto</span>
                <Combobox rotulo="Assunto" vazio="Escolha ou digite" valor={assunto} opcoes={assuntoOpcoes}
                  onChange={(id) => { setAssunto(id); const a = assuntos.find((x) => x.id === id); if (a && !disc) setDisc(a.disciplina_id); }} />
              </div>
            </div>
            <label className="text-sm space-y-1 block">O que vai fazer
              <select className="field" value={tipo} onChange={(e) => setTipo(e.target.value)}>{TIPOS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select>
            </label>

            <button className="btn btn-gold !py-3 w-full" disabled={ocupado} onClick={() => void iniciar()}>Iniciar</button>
          </section>
        )}

        <section className="card p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><p className="text-xs text-muted">Hoje</p><p className="font-display text-2xl font-bold text-brand">{fmtDuracao(totais.hoje)}</p></div>
            <div><p className="text-xs text-muted">Esta semana</p><p className="font-display text-2xl font-bold text-brand">{fmtDuracao(totais.semana)}</p></div>
          </div>
          {totais.por.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold">Por disciplina (semana)</p>
              {totais.por.map(([id, seg]) => (
                <div key={id} className="text-sm">
                  <div className="flex justify-between gap-2"><span className="truncate">{nome(discs, id === '_' ? null : id) ?? 'Sem disciplina'}</span><span className="text-muted whitespace-nowrap">{fmtDuracao(seg)}</span></div>
                  <div className="barra"><i style={{ width: `${(seg / totais.por[0][1]) * 100}%` }} /></div>
                </div>
              ))}
            </div>
          )}
          {!feitos.length && !ativo && <p className="text-sm text-muted">Nada estudado ainda nesta semana. Inicie o cronômetro acima.</p>}
        </section>
      </main>

      {fechando && ativo && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => !ocupado && setFechando(false)}>
          <div className="card w-full max-w-sm p-6 space-y-4 card-in" role="dialog" aria-modal="true" aria-labelledby="fim-titulo" onClick={(e) => e.stopPropagation()}>
            <h2 id="fim-titulo" className="font-display text-xl font-bold text-brand">Finalizar estudo?</h2>
            <p className="text-sm text-muted">Você estudou <strong>{fmtDuracao(estudado(ativo, agora))}</strong>{ativo.modo === 'pomodoro' && ' (sem contar as pausas)'}.</p>
            {ativo.sessao_estudo_id && (
              <>
                <label className="flex items-center gap-3 text-sm cursor-pointer"><input type="checkbox" className="check" checked={marcar} onChange={(e) => setMarcar(e.target.checked)} />Marcar a sessão do cronograma como concluída</label>
                <label className="text-sm space-y-1 block">Anotação (opcional)
                  <textarea className="field min-h-20" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="O que rendeu? O que ficou faltando?" />
                </label>
              </>
            )}
            <div className="flex flex-wrap justify-between gap-2">
              <button className="btn btn-ghost !text-red !border-red" disabled={ocupado} onClick={() => void descartar()}>Descartar</button>
              <span className="flex gap-2">
                <button autoFocus className="btn btn-ghost" disabled={ocupado} onClick={() => setFechando(false)}>Continuar</button>
                <button className="btn btn-gold" disabled={ocupado} onClick={() => void concluir(nota, marcar)}>{ocupado ? 'Salvando…' : 'Finalizar'}</button>
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
