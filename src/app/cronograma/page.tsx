'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Topo } from '@/components/Topo';
import { T } from '@/lib/textos';
import { Combobox } from '@/components/Combobox';
import { Confirmar } from '@/components/Confirmar';
import { CronogramaIA } from '@/components/CronogramaIA';
import { baixarCronogramaPdf } from '@/lib/pdf-cronograma';
import { montarSemana } from '@/lib/plano';

type Sessao = {
  id: string; disciplina_id: string | null; assunto_id: string | null; tipo: string; data: string; inicio: string | null; duracao_min: number;
  meta: string | null; prioridade: number | null; observacoes: string | null; origem: 'manual' | 'auto'; bloqueada: boolean; concluida: boolean; tempo_real_min: number | null;
};
type Disc = { id: string; nome: string; questoes_prova: number };
type Assunto = { id: string; disciplina_id: string; nome: string; origem: string };
type Prog = { assunto_id: string; status: string; proxima_revisao: string | null };

const COLUNAS = 'id,disciplina_id,assunto_id,tipo,data,inicio,duracao_min,meta,prioridade,observacoes,origem,bloqueada,concluida,tempo_real_min';
const TIPOS = [['teoria', 'Teoria'], ['questoes', 'Questões'], ['revisao', 'Revisão'], ['flashcards', 'Flashcards'], ['simulado', 'Simulado'], ['livre', 'Livre'], ['pausa', 'Pausa']] as const;
const PRIORIDADES = [[1, 'Alta'], [2, 'Média'], [3, 'Baixa']] as const;
const DIAS_CURTO = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

const iso = (d: Date) => d.toLocaleDateString('sv-SE');
const doIso = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const somar = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const segunda = (d: Date) => somar(d, -((d.getDay() + 6) % 7));
const curto = (s: string) => s.split('-').reverse().slice(0, 2).join('/');

export default function Cronograma() {
  const router = useRouter();
  const [userId, setUserId] = useState('');
  const [discs, setDiscs] = useState<Disc[]>([]);
  const [assuntos, setAssuntos] = useState<Assunto[]>([]);
  const [progresso, setProgresso] = useState<Prog[]>([]);
  const [semana, setSemana] = useState(() => segunda(new Date()));
  const [sessoes, setSessoes] = useState<Sessao[]>([]);
  const [msg, setMsg] = useState('Carregando…');
  const [pronto, setPronto] = useState(false);

  const [formAberto, setFormAberto] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [fData, setFData] = useState('');
  const [fInicio, setFInicio] = useState('');
  const [fDur, setFDur] = useState(50);
  const [fTipo, setFTipo] = useState('teoria');
  const [fDisc, setFDisc] = useState('');
  const [fAssunto, setFAssunto] = useState('');
  const [fMeta, setFMeta] = useState('');
  const [fPrior, setFPrior] = useState(2);
  const [fObs, setFObs] = useState('');
  const [fRepetir, setFRepetir] = useState(0);
  const [salvando, setSalvando] = useState(false);

  const [gerAberto, setGerAberto] = useState(false);
  const [gDias, setGDias] = useState<Set<number>>(new Set([0, 1, 2, 3, 4, 5]));
  const [gBlocos, setGBlocos] = useState(3);
  const [gDur, setGDur] = useState(50);
  const [confGerar, setConfGerar] = useState(false);
  const [excluindo, setExcluindo] = useState<Sessao | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [iaAberta, setIaAberta] = useState(false);
  const [pdfMenu, setPdfMenu] = useState(false);
  const [gerandoPdf, setGerandoPdf] = useState(false);

  const datas = useMemo(() => Array.from({ length: 7 }, (_, i) => iso(somar(semana, i))), [semana]);
  const hoje = iso(new Date());

  useEffect(() => {
    (async () => {
      const { data: s } = await supabase.auth.getSession();
      if (!s.session) return router.replace('/login');
      setUserId(s.session.user.id);
      const [d, a, p] = await Promise.all([
        supabase.from('disciplinas').select('id,nome,questoes_prova').order('ordem'),
        supabase.from('assuntos').select('id,disciplina_id,nome,origem').order('ordem'),
        supabase.from('progresso_assunto').select('assunto_id,status,proxima_revisao'),
      ]);
      const erro = d.error ?? a.error ?? p.error;
      if (erro) return setMsg(`Erro: ${erro.message}`);
      setDiscs(d.data ?? []); setAssuntos(a.data ?? []); setProgresso(p.data ?? []);
      setPronto(true);
    })();
  }, [router]);

  const carregarSemana = useCallback(async () => {
    const { data, error } = await supabase.from('sessoes_estudo').select(COLUNAS).gte('data', datas[0]).lte('data', datas[6]).order('data').order('inicio', { nullsFirst: false }).order('created_at');
    if (error) return setMsg(`Erro: ${error.message}`);
    setSessoes((data ?? []) as Sessao[]);
    setMsg('');
  }, [datas]);
  useEffect(() => { if (pronto) void carregarSemana(); }, [pronto, carregarSemana]);

  const nome = (lista: { id: string; nome: string }[], id: string | null) => lista.find((x) => x.id === id)?.nome;
  const planejado = sessoes.filter((s) => s.tipo !== 'pausa');
  const minPlanejado = planejado.reduce((n, s) => n + s.duracao_min, 0);
  const minFeito = planejado.filter((s) => s.concluida).reduce((n, s) => n + (s.tempo_real_min ?? s.duracao_min), 0);
  const pct = minPlanejado ? Math.min(100, Math.round((minFeito / minPlanejado) * 100)) : 0;
  const fmtMin = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${String(m % 60).padStart(2, '0')}min` : ''}` : `${m} min`);

  function abrirForm(data: string, s?: Sessao) {
    setEditId(s?.id ?? null);
    setFData(s?.data ?? data);
    setFInicio(s?.inicio?.slice(0, 5) ?? '');
    setFDur(s?.duracao_min ?? 50);
    setFTipo(s?.tipo ?? 'teoria');
    setFDisc(s?.disciplina_id ?? '');
    setFAssunto(s?.assunto_id ?? '');
    setFMeta(s?.meta ?? '');
    setFPrior(s?.prioridade ?? 2);
    setFObs(s?.observacoes ?? '');
    setFRepetir(0);
    setFormAberto(true);
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (salvando) return;
    setSalvando(true);
    const base = {
      disciplina_id: fDisc || null, assunto_id: fAssunto || null, tipo: fTipo, inicio: fInicio || null, duracao_min: Math.max(1, fDur),
      meta: fMeta.trim() || null, prioridade: fPrior, observacoes: fObs.trim() || null,
    };
    if (editId) {
      const { error } = await supabase.from('sessoes_estudo').update({ ...base, data: fData }).eq('id', editId);
      if (error) { setSalvando(false); return setMsg(`Erro: ${error.message}`); }
    } else {
      const repetir = Math.min(Math.max(fRepetir, 0), 26);
      const linhas = Array.from({ length: repetir + 1 }, (_, i) => ({
        ...base, user_id: userId, data: iso(somar(doIso(fData), 7 * i)), origem: 'manual', recorrencia: repetir ? { tipo: 'semanal', semanas: repetir } : null,
      }));
      const { error } = await supabase.from('sessoes_estudo').insert(linhas);
      if (error) { setSalvando(false); return setMsg(`Erro: ${error.message}`); }
    }
    setSalvando(false);
    setFormAberto(false);
    await carregarSemana();
  }

  async function alternar(s: Sessao, campo: 'concluida' | 'bloqueada') {
    const { error } = await supabase.from('sessoes_estudo').update({ [campo]: !s[campo] }).eq('id', s.id);
    if (error) return setMsg(`Erro: ${error.message}`);
    setSessoes((l) => l.map((x) => (x.id === s.id ? { ...x, [campo]: !s[campo] } : x)));
  }

  async function excluir() {
    if (!excluindo) return;
    setOcupado(true);
    const { error } = await supabase.from('sessoes_estudo').delete().eq('id', excluindo.id);
    setOcupado(false);
    if (error) { setExcluindo(null); return setMsg(`Erro: ${error.message}`); }
    setSessoes((l) => l.filter((x) => x.id !== excluindo.id));
    setExcluindo(null);
  }

  // Sessões automáticas que ainda não foram feitas nem travadas: são as que "Gerar semana" substitui.
  const substituiveis = sessoes.filter((s) => s.origem === 'auto' && !s.bloqueada && !s.concluida);

  async function gerar() {
    setOcupado(true);
    const diasEscolhidos = datas.filter((d, i) => gDias.has(i) && d >= hoje); // não monta dias que já passaram
    const status = new Map(progresso.map((p) => [p.assunto_id, p.status]));
    const pendentes: Record<string, string[]> = {};
    for (const a of assuntos) if (a.origem === 'edital' && status.get(a.id) !== 'concluido') (pendentes[a.disciplina_id] ??= []).push(a.id);
    const discDe = new Map(assuntos.map((a) => [a.id, a.disciplina_id]));
    const revisoes = progresso
      .filter((p) => p.proxima_revisao && datas.includes(p.proxima_revisao) && p.proxima_revisao >= hoje && p.status !== 'nao-iniciado' && discDe.has(p.assunto_id))
      .map((p) => ({ assunto_id: p.assunto_id, disciplina_id: discDe.get(p.assunto_id)!, data: p.proxima_revisao! }));
    const plano = montarSemana({ datas: diasEscolhidos, blocosPorDia: gBlocos, duracaoMin: gDur, discs, pendentes, revisoes });

    if (substituiveis.length) {
      const { error } = await supabase.from('sessoes_estudo').delete().in('id', substituiveis.map((s) => s.id));
      if (error) { setOcupado(false); setConfGerar(false); return setMsg(`Erro: ${error.message}`); }
    }
    if (plano.length) {
      const { error } = await supabase.from('sessoes_estudo').insert(plano.map((p) => ({ ...p, user_id: userId, origem: 'auto' })));
      if (error) { setOcupado(false); setConfGerar(false); return setMsg(`Erro: ${error.message}`); }
    }
    setOcupado(false);
    setConfGerar(false);
    setGerAberto(false);
    await carregarSemana();
    setMsg(plano.length ? '' : 'Nenhum dia disponível para montar (escolha dias de hoje em diante).');
  }

  async function baixarPdf(semanas: 1 | 4) {
    setPdfMenu(false);
    setGerandoPdf(true);
    const fim = iso(somar(semana, 7 * semanas - 1));
    const { data, error } = await supabase.from('sessoes_estudo').select(COLUNAS).gte('data', datas[0]).lte('data', fim).order('data').order('inicio', { nullsFirst: false });
    if (error) { setGerandoPdf(false); return setMsg(`Erro: ${error.message}`); }
    const linhas = ((data ?? []) as Sessao[]).filter((s) => s.tipo !== 'pausa').map((s) => ({
      data: s.data, inicio: s.inicio, tipo: TIPOS.find((t) => t[0] === s.tipo)?.[1] ?? s.tipo, disciplina: nome(discs, s.disciplina_id) ?? 'Sem disciplina',
      assunto: nome(assuntos, s.assunto_id) ?? '', duracao_min: s.duracao_min, meta: s.meta, concluida: s.concluida,
    }));
    try { await baixarCronogramaPdf(`${curto(datas[0])} a ${curto(fim)}`, linhas); setMsg(''); }
    catch { setMsg('Erro: não foi possível gerar o PDF.'); }
    setGerandoPdf(false);
  }

  const rotuloSemana = `${curto(datas[0])} – ${curto(datas[6])}`;
  const naSemanaAtual = datas[0] === iso(segunda(new Date()));
  const assuntoOpcoes = (fDisc ? assuntos.filter((a) => a.disciplina_id === fDisc) : assuntos).map((a) => ({ id: a.id, nome: a.nome, detalhe: fDisc ? undefined : nome(discs, a.disciplina_id) }));

  return (
    <>
      <Topo />
      <main className="max-w-3xl mx-auto p-4 space-y-4">
        <section className="card p-4 sm:p-5 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-brand mr-auto">{T.cronograma}</h1>
            <button className="btn btn-ghost !py-1.5 !px-3" onClick={() => setSemana(somar(semana, -7))} aria-label="Semana anterior">←</button>
            <button className="btn btn-ghost !py-1.5 !px-3 !text-sm" disabled={naSemanaAtual} onClick={() => setSemana(segunda(new Date()))}>Hoje</button>
            <span className="text-sm font-semibold min-w-28 text-center">{rotuloSemana}</span>
            <button className="btn btn-ghost !py-1.5 !px-3" onClick={() => setSemana(somar(semana, 7))} aria-label="Próxima semana">→</button>
          </div>
          <div>
            <div className="flex justify-between text-sm"><span className="text-muted">{fmtMin(minFeito)} de {fmtMin(minPlanejado)} planejados</span><strong className="text-brand">{pct}%</strong></div>
            <div className="barra mt-1" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><i style={{ width: `${pct}%` }} /></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-gold !py-1.5 !text-sm" onClick={() => abrirForm(naSemanaAtual && datas.includes(hoje) ? hoje : datas[0])}>＋ Nova sessão</button>
            <button className="btn btn-gold !py-1.5 !text-sm" onClick={() => setIaAberta(true)}>Montar com IA</button>
            <span className="relative">
              <button className="btn btn-ghost !py-1.5 !text-sm" aria-expanded={pdfMenu} disabled={gerandoPdf} onClick={() => setPdfMenu((v) => !v)}>{gerandoPdf ? 'Gerando…' : 'Baixar PDF'}</button>
              {pdfMenu && (
                <span className="card absolute left-0 top-full mt-1 z-30 p-1 w-56 flex flex-col">
                  <button className="text-left rounded-lg px-3 py-2 text-sm hover:bg-blue/10" onClick={() => void baixarPdf(1)}>Esta semana ({rotuloSemana})</button>
                  <button className="text-left rounded-lg px-3 py-2 text-sm hover:bg-blue/10" onClick={() => void baixarPdf(4)}>4 semanas a partir desta</button>
                </span>
              )}
            </span>
            <button className="btn btn-ghost !py-1.5 !text-sm" aria-expanded={gerAberto} onClick={() => setGerAberto((v) => !v)}>Montar sem IA</button>
          </div>
        </section>

        {gerAberto && (
          <section className="card p-4 sm:p-5 space-y-4">
            <p className="text-sm text-muted">Distribui blocos de estudo entre as disciplinas conforme o peso delas na prova. Cada assunto pendente ganha um bloco de teoria e outro de questões, e as revisões marcadas para esta semana entram junto.</p>
            <div>
              <p className="text-sm font-semibold mb-2">Dias de estudo</p>
              <div className="flex flex-wrap gap-2">
                {DIAS_CURTO.map((n, i) => (
                  <button key={n} type="button" aria-pressed={gDias.has(i)} onClick={() => setGDias((s) => { const x = new Set(s); if (x.has(i)) x.delete(i); else x.add(i); return x; })}
                    className={`btn btn-ghost !py-1.5 !px-3 !text-sm ${gDias.has(i) ? '!border-blue !text-brand bg-blue/10' : 'opacity-60'}`}>{n}</button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <label className="space-y-1">Blocos por dia<input type="number" className="field" min={1} max={10} value={gBlocos} onChange={(e) => setGBlocos(Math.min(10, Math.max(1, Number(e.target.value) || 1)))} /></label>
              <label className="space-y-1">Minutos por bloco<input type="number" className="field" min={10} step={5} value={gDur} onChange={(e) => setGDur(Math.max(10, Number(e.target.value) || 10))} /></label>
            </div>
            <p className="text-xs text-muted">Dias que já passaram não são montados. Sessões feitas, travadas ou criadas por você ficam como estão.</p>
            <button className="btn btn-gold" disabled={!gDias.size || ocupado} onClick={() => (substituiveis.length ? setConfGerar(true) : void gerar())}>Montar semana</button>
          </section>
        )}

        {msg && <p role="alert" className={msg.startsWith('Erro') ? 'text-sm text-red' : 'text-sm text-muted'}>{msg}</p>}

        {pronto && datas.map((d, i) => {
          const doDia = sessoes.filter((s) => s.data === d);
          const ehHoje = d === hoje;
          return (
            <section key={d} className={`card p-4 space-y-3 ${ehHoje ? '!border-gold' : ''}`}>
              <header className="flex items-center gap-2">
                <h2 className="font-display font-bold text-brand">{DIAS_CURTO[i]} <span className="text-muted font-normal">{curto(d)}</span></h2>
                {ehHoje && <span className="chip chip-gold">Hoje</span>}
                <button className="btn btn-ghost !py-1 !px-2 !text-sm ml-auto" onClick={() => abrirForm(d)} aria-label={`Adicionar sessão em ${DIAS_CURTO[i]}`}>＋</button>
              </header>
              {doDia.length === 0 && <p className="text-sm text-muted">{T.diaLivre}</p>}
              <ul className="space-y-2">
                {doDia.map((s) => (
                  <li key={s.id} className={`rounded-xl border border-line p-3 flex flex-wrap items-start gap-3 ${s.concluida ? 'opacity-60' : ''}`}>
                    <input type="checkbox" className="check mt-0.5" checked={s.concluida} onChange={() => void alternar(s, 'concluida')} aria-label="Marcar como concluída" />
                    <div className="flex-1 min-w-48 space-y-1">
                      <p className={`font-semibold ${s.concluida ? 'line-through' : ''}`}>
                        {TIPOS.find((t) => t[0] === s.tipo)?.[1]}{s.disciplina_id && ` · ${nome(discs, s.disciplina_id)}`}
                      </p>
                      {s.assunto_id && <p className="text-sm text-muted">{nome(assuntos, s.assunto_id)}</p>}
                      {s.meta && <p className="text-sm">Meta: {s.meta}</p>}
                      <p className="flex flex-wrap gap-1.5">
                        {s.inicio && <span className="chip">{s.inicio.slice(0, 5)}</span>}
                        <span className="chip">{s.concluida && s.tempo_real_min ? `${s.tempo_real_min} min feitos` : `${s.duracao_min} min`}</span>
                        {s.prioridade === 1 && <span className="chip chip-red">Alta</span>}
                        {s.origem === 'auto' && <span className="chip chip-gold">Automática</span>}
                      </p>
                    </div>
                    <div className="flex gap-1 ml-auto">
                      {!s.concluida && s.tipo !== 'pausa' && <Link href={`/cronometro?sessao=${s.id}`} className="btn btn-ghost !py-1 !px-2 !text-sm" title="Iniciar cronômetro">Iniciar</Link>}
                      {s.origem === 'auto' && <button className="btn btn-ghost !py-1 !px-2 !text-sm" aria-pressed={s.bloqueada} title={s.bloqueada ? 'Travada: não será substituída' : 'Travar'} onClick={() => void alternar(s, 'bloqueada')}>{s.bloqueada ? 'Travada' : 'Travar'}</button>}
                      <button className="btn btn-ghost !py-1 !px-2 !text-sm" onClick={() => abrirForm(s.data, s)}>Editar</button>
                      <button className="btn btn-ghost !py-1 !px-2 !text-sm" onClick={() => setExcluindo(s)}>Excluir</button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </main>

      {formAberto && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm p-4" onClick={() => setFormAberto(false)}>
          <form onSubmit={salvar} onClick={(e) => e.stopPropagation()} className="card w-full max-w-lg mx-auto my-4 p-5 space-y-4 card-in" role="dialog" aria-modal="true" aria-label={editId ? 'Editar sessão' : 'Nova sessão'}>
            <h2 className="font-display text-xl font-bold text-brand">{editId ? 'Editar sessão' : 'Nova sessão'}</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <label className="space-y-1">Data<input type="date" required className="field" value={fData} onChange={(e) => setFData(e.target.value)} /></label>
              <label className="space-y-1">Início (opcional)<input type="time" className="field" value={fInicio} onChange={(e) => setFInicio(e.target.value)} /></label>
              <label className="space-y-1">Duração (min)<input type="number" required min={1} className="field" value={fDur} onChange={(e) => setFDur(Number(e.target.value) || 1)} /></label>
              <label className="space-y-1">Tipo
                <select className="field" value={fTipo} onChange={(e) => setFTipo(e.target.value)}>{TIPOS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select>
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 text-sm">
              <div className="space-y-1"><span>Disciplina</span>
                <Combobox rotulo="Disciplina" vazio="Escolha ou digite" valor={fDisc} opcoes={discs} onChange={(id) => { setFDisc(id); if (assuntos.find((a) => a.id === fAssunto)?.disciplina_id !== id) setFAssunto(''); }} />
              </div>
              <div className="space-y-1"><span>Assunto</span>
                <Combobox rotulo="Assunto" vazio="Escolha ou digite" valor={fAssunto} opcoes={assuntoOpcoes}
                  onChange={(id) => { setFAssunto(id); const a = assuntos.find((x) => x.id === id); if (a && !fDisc) setFDisc(a.disciplina_id); }} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <label className="space-y-1 col-span-2 sm:col-span-1">Meta (opcional)<input className="field" value={fMeta} onChange={(e) => setFMeta(e.target.value)} placeholder="Ex.: resolver 20 questões" /></label>
              <label className="space-y-1 col-span-2 sm:col-span-1">Prioridade
                <select className="field" value={fPrior} onChange={(e) => setFPrior(Number(e.target.value))}>{PRIORIDADES.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select>
              </label>
            </div>
            <label className="text-sm space-y-1 block">Observações<textarea className="field min-h-16" value={fObs} onChange={(e) => setFObs(e.target.value)} /></label>
            {!editId && (
              <label className="text-sm space-y-1 block">Repetir toda semana por mais quantas semanas? <span className="text-muted">(0 = não repetir)</span>
                <input type="number" min={0} max={26} className="field" value={fRepetir} onChange={(e) => setFRepetir(Number(e.target.value) || 0)} />
              </label>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn btn-ghost" onClick={() => setFormAberto(false)}>Cancelar</button>
              <button className="btn btn-gold" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
            </div>
          </form>
        </div>
      )}

      {iaAberta && (
        <CronogramaIA userId={userId} discs={discs} assuntos={assuntos} onFechar={() => setIaAberta(false)}
          onAplicado={async (primeira) => { setIaAberta(false); const alvo = segunda(doIso(primeira)); if (iso(alvo) === datas[0]) await carregarSemana(); else setSemana(alvo); }} />
      )}

      {excluindo && (
        <Confirmar titulo="Excluir esta sessão?" perigo ocupado={ocupado} rotuloOk="Sim, excluir" onOk={() => void excluir()} onCancelar={() => setExcluindo(null)}
          texto="Tem certeza? A sessão será removida do cronograma e não dá para desfazer."
          destaque={`${TIPOS.find((t) => t[0] === excluindo.tipo)?.[1]}${excluindo.disciplina_id ? ` · ${nome(discs, excluindo.disciplina_id)}` : ''} · ${curto(excluindo.data)}`} />
      )}
      {confGerar && (
        <Confirmar titulo="Substituir as sessões automáticas?" ocupado={ocupado} rotuloOk="Sim, montar" onOk={() => void gerar()} onCancelar={() => setConfGerar(false)}
          texto={<>Esta semana tem <strong>{substituiveis.length}</strong> sessão(ões) automática(s) pendente(s). Elas serão apagadas e refeitas. Sessões concluídas, travadas ou criadas por você não são alteradas.</>} />
      )}
    </>
  );
}
