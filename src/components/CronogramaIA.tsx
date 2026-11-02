'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { SessaoIA } from '@/lib/ia-plano';

type Disc = { id: string; nome: string; questoes_prova: number };
type Assunto = { id: string; disciplina_id: string; nome: string };
type Plano = { sessoes: SessaoIA[]; resumo: string; descartadas: number };

const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const TIPOS: Record<string, string> = { teoria: 'Teoria', questoes: 'Questões', revisao: 'Revisão', flashcards: 'Flashcards', simulado: 'Simulado' };
const HORAS = [1, 1.5, 2, 3, 4, 5, 6, 8];
const iso = (d: Date) => d.toLocaleDateString('sv-SE');
const somar = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const doIso = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const curto = (s: string) => s.split('-').reverse().slice(0, 2).join('/');

/** Assistente que monta o cronograma com IA: formulário simples, prévia e só então grava. */
export function CronogramaIA({ userId, discs, assuntos, onFechar, onAplicado }: {
  userId: string; discs: Disc[]; assuntos: Assunto[]; onFechar: () => void; onAplicado: (primeiraData: string) => void;
}) {
  const hoje = iso(new Date());
  const [fase, setFase] = useState<'form' | 'carregando' | 'previa'>('form');
  const [semanas, setSemanas] = useState(2);
  const [inicio, setInicio] = useState(hoje);
  const [dias, setDias] = useState<Set<number>>(new Set([0, 1, 2, 3, 4, 5]));
  const [horas, setHoras] = useState(3);
  const [provaEm, setProvaEm] = useState('');
  const [foco, setFoco] = useState<Set<string>>(new Set());
  const [obs, setObs] = useState('');
  const [erro, setErro] = useState('');
  const [plano, setPlano] = useState<Plano | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => { // usa as metas: data da prova e horas por semana (convertidas em horas por dia)
    supabase.from('metas').select('horas_semana,prova_em').maybeSingle().then(({ data }) => {
      if (data?.prova_em && data.prova_em >= hoje) setProvaEm(data.prova_em);
      if (data?.horas_semana) { const porDia = data.horas_semana / 6; setHoras(HORAS.reduce((a, h) => (Math.abs(h - porDia) < Math.abs(a - porDia) ? h : a), HORAS[0])); }
    });
  }, [hoje]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !ocupado) onFechar(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onFechar, ocupado]);

  const datas = Array.from({ length: semanas * 7 }, (_, i) => somar(doIso(inicio), i))
    .filter((d) => dias.has((d.getDay() + 6) % 7) && iso(d) >= hoje).map(iso);
  const alternar = <T,>(set: Set<T>, setar: (s: Set<T>) => void, v: T) => { const n = new Set(set); if (n.has(v)) n.delete(v); else n.add(v); setar(n); };
  const nomeDisc = (id: string | null) => discs.find((d) => d.id === id)?.nome;
  const nomeAssunto = (id: string | null) => assuntos.find((a) => a.id === id)?.nome;

  async function gerar() {
    setErro('');
    setFase('carregando');
    const { data: s } = await supabase.auth.getSession();
    try {
      const res = await fetch('/api/cronograma-ia', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.session?.access_token ?? ''}` },
        body: JSON.stringify({ datas, minutosPorDia: Math.round(horas * 60), dataProva: provaEm || null, foco: [...foco], observacoes: obs }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setErro(json.erro ?? 'Não foi possível gerar o cronograma.'); return setFase('form'); }
      setPlano(json as Plano);
      setFase('previa');
    } catch {
      setErro('Sem conexão com o servidor. Tente de novo.');
      setFase('form');
    }
  }

  async function aplicar() {
    if (!plano) return;
    setOcupado(true);
    // Substitui só o que a IA já tinha criado e ainda não foi feito nem travado; o que você criou fica.
    const { data: antigas, error: e1 } = await supabase.from('sessoes_estudo').select('id').eq('origem', 'auto').eq('bloqueada', false).eq('concluida', false).gte('data', datas[0]).lte('data', datas[datas.length - 1]);
    if (e1) { setOcupado(false); return setErro(`Erro: ${e1.message}`); }
    if (antigas?.length) {
      const { error } = await supabase.from('sessoes_estudo').delete().in('id', antigas.map((x) => x.id));
      if (error) { setOcupado(false); return setErro(`Erro: ${error.message}`); }
    }
    const { error } = await supabase.from('sessoes_estudo').insert(plano.sessoes.map((x) => ({ ...x, user_id: userId, origem: 'auto' })));
    setOcupado(false);
    if (error) return setErro(`Erro: ${error.message}`);
    onAplicado(plano.sessoes[0].data);
  }

  const porDia = plano ? plano.sessoes.reduce<Record<string, SessaoIA[]>>((m, x) => ((m[x.data] ??= []).push(x), m), {}) : {};

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm p-4" onClick={() => !ocupado && fase !== 'carregando' && onFechar()}>
      <div className="card w-full max-w-lg mx-auto my-4 p-5 space-y-4 card-in" role="dialog" aria-modal="true" aria-label="Montar cronograma com IA" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <h2 className="font-display text-xl font-bold text-brand">Cronograma com IA</h2>
          <button className="btn btn-ghost !p-2 !rounded-xl ml-auto" aria-label="Fechar" disabled={ocupado || fase === 'carregando'} onClick={onFechar}>✕</button>
        </div>

        {fase === 'form' && (
          <>
            <p className="text-sm text-muted">Responda rapidinho e a IA monta seus estudos seguindo o edital, o peso de cada matéria e o seu desempenho. Você revê tudo antes de salvar.</p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <label className="space-y-1">Quantas semanas?
                <select className="field" value={semanas} onChange={(e) => setSemanas(Number(e.target.value))}>{[1, 2, 3].map((n) => <option key={n} value={n}>{n} {n === 1 ? 'semana' : 'semanas'}</option>)}</select>
              </label>
              <label className="space-y-1">Começando em<input type="date" className="field" min={hoje} value={inicio} onChange={(e) => setInicio(e.target.value || hoje)} /></label>
              <label className="space-y-1">Horas por dia
                <select className="field" value={horas} onChange={(e) => setHoras(Number(e.target.value))}>{HORAS.map((h) => <option key={h} value={h}>{h} h</option>)}</select>
              </label>
              <label className="space-y-1">Data da prova <span className="text-muted">(opcional)</span><input type="date" className="field" min={hoje} value={provaEm} onChange={(e) => setProvaEm(e.target.value)} /></label>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold">Dias que você estuda</p>
              <div className="flex flex-wrap gap-2">
                {DIAS.map((n, i) => (
                  <button key={n} type="button" aria-pressed={dias.has(i)} onClick={() => alternar(dias, setDias, i)} className={`btn btn-ghost !py-1.5 !px-3 !text-sm ${dias.has(i) ? '!border-blue !text-brand bg-blue/10' : 'opacity-60'}`}>{n}</button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold">Onde você tem mais dificuldade? <span className="font-normal text-muted">(opcional)</span></p>
              <div className="flex flex-wrap gap-2">
                {discs.map((d) => (
                  <button key={d.id} type="button" aria-pressed={foco.has(d.id)} onClick={() => alternar(foco, setFoco, d.id)} className={`btn btn-ghost !py-1 !px-3 !text-xs ${foco.has(d.id) ? '!border-gold !text-gold bg-gold/10' : 'opacity-70'}`}>{d.nome}</button>
                ))}
              </div>
            </div>

            <label className="text-sm space-y-1 block">Algo que a IA deve saber? <span className="text-muted">(opcional)</span>
              <textarea className="field min-h-16" value={obs} maxLength={500} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: trabalho de manhã, só estudo à noite; domingo é dia de revisão." />
            </label>

            {erro && <p role="alert" className="text-sm text-red">{erro}</p>}
            <div className="flex items-center gap-3">
              <button className="btn btn-gold" disabled={!datas.length} onClick={() => void gerar()}>Gerar cronograma</button>
              <span className="text-xs text-muted">{datas.length ? `${datas.length} dias de estudo` : 'Escolha ao menos um dia, de hoje em diante.'}</span>
            </div>
          </>
        )}

        {fase === 'carregando' && (
          <div className="py-10 text-center space-y-3" role="status">
            <span className="inline-block size-9 rounded-full border-4 border-line border-t-gold animate-spin" aria-hidden="true" />
            <p className="font-semibold">A IA está montando seu cronograma…</p>
            <p className="text-sm text-muted">Pode levar até 20 segundos.</p>
          </div>
        )}

        {fase === 'previa' && plano && (
          <>
            {plano.resumo && <p className="text-sm rounded-xl border-l-4 border-gold bg-gold/10 px-3 py-2">{plano.resumo}</p>}
            <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
              {Object.entries(porDia).map(([data, sessoes]) => (
                <div key={data} className="space-y-1.5">
                  <p className="text-sm font-bold text-brand">{DIAS[(doIso(data).getDay() + 6) % 7]} {curto(data)} <span className="font-normal text-muted">· {sessoes.reduce((n, x) => n + x.duracao_min, 0)} min</span></p>
                  {sessoes.map((x, i) => (
                    <div key={i} className="rounded-lg border border-line px-3 py-2 text-sm">
                      <p className="font-semibold">{TIPOS[x.tipo]} · {nomeDisc(x.disciplina_id)} <span className="chip ml-1">{x.duracao_min} min</span></p>
                      {x.assunto_id && <p className="text-muted">{nomeAssunto(x.assunto_id)}</p>}
                      {x.meta && <p>Meta: {x.meta}</p>}
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <p className="text-xs text-muted">{plano.sessoes.length} sessões. Ao aplicar, as sessões automáticas pendentes desse período são substituídas; as que você criou ou travou ficam.{plano.descartadas > 0 && ` Em ${plano.descartadas} blocos a sugestão da IA estava incompleta e foi corrigida automaticamente.`}</p>
            {erro && <p role="alert" className="text-sm text-red">{erro}</p>}
            <div className="flex flex-wrap justify-end gap-2">
              <button className="btn btn-ghost" disabled={ocupado} onClick={() => { setPlano(null); setFase('form'); }}>Voltar</button>
              <button className="btn btn-ghost" disabled={ocupado} onClick={() => void gerar()}>Gerar de novo</button>
              <button className="btn btn-gold" disabled={ocupado} onClick={() => void aplicar()}>{ocupado ? 'Salvando…' : 'Aplicar no cronograma'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
