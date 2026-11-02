'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Topo } from '@/components/Topo';
import { fmtDuracao } from '@/lib/cronometro';
import { T } from '@/lib/textos';

type Metas = { horas_semana: number | null; questoes_dia: number | null; acerto_pct: number | null; assuntos_semana: number | null; prova_em: string | null };
type Numeros = { segundosSemana: number; questoesHoje: number; acertoGeral: number | null; respondidas: number; assuntosSemana: number; assuntosConcluidos: number; assuntosTotal: number };

const dia = (d: Date) => d.toLocaleDateString('sv-SE');
const doIso = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const br = (s: string) => s.split('-').reverse().join('/');
const vazio: Metas = { horas_semana: null, questoes_dia: null, acerto_pct: null, assuntos_semana: null, prova_em: null };

/** Uma meta com barra de progresso: verde quando atingida. */
function Meta({ titulo, texto, atual, alvo }: { titulo: string; texto: string; atual: number; alvo: number }) {
  const pct = alvo > 0 ? Math.min(100, Math.round((atual / alvo) * 100)) : 0;
  const ok = alvo > 0 && atual >= alvo;
  return (
    <div className="card p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-muted">{titulo}</p>
        {ok && <span className="chip chip-ok">Meta batida</span>}
      </div>
      <p className="font-display text-xl font-bold text-brand">{texto}</p>
      <div className="barra" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={titulo}><i style={{ width: `${pct}%`, ...(ok ? { background: 'var(--green)' } : {}) }} /></div>
    </div>
  );
}

export default function MetasPage() {
  const router = useRouter();
  const [userId, setUserId] = useState('');
  const [metas, setMetas] = useState<Metas | null>(null); // null = ainda sem metas
  const [n, setN] = useState<Numeros | null>(null);
  const [editando, setEditando] = useState(false);
  const [f, setF] = useState({ horas: '', questoes: '', acerto: '', assuntos: '', prova: '' });
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState('Carregando…');

  useEffect(() => {
    (async () => {
      const { data: s } = await supabase.auth.getSession();
      if (!s.session) return router.replace('/login');
      setUserId(s.session.user.id);
      const seg = new Date(); seg.setDate(seg.getDate() - ((seg.getDay() + 6) % 7)); seg.setHours(0, 0, 0, 0); // segunda-feira desta semana
      const inicioHoje = new Date(); inicioHoje.setHours(0, 0, 0, 0);
      const [m, cr, rh, ra, pr, ed] = await Promise.all([
        supabase.from('metas').select('horas_semana,questoes_dia,acerto_pct,assuntos_semana,prova_em').maybeSingle(),
        supabase.from('cronometro_sessoes').select('segundos_efetivos').eq('estado', 'finalizado').gte('inicio', seg.toISOString()),
        supabase.from('respostas').select('questao_id', { count: 'exact', head: true }).gte('respondida_em', inicioHoje.toISOString()),
        supabase.from('respostas').select('questao_id,correta').order('respondida_em'),
        supabase.from('progresso_assunto').select('assunto_id,status,ultimo_estudo'),
        supabase.from('assuntos').select('id', { count: 'exact', head: true }).eq('origem', 'edital'),
      ]);
      const erro = m.error ?? cr.error ?? rh.error ?? ra.error ?? pr.error ?? ed.error;
      if (erro) return setMsg(`Erro: ${erro.message}`);
      const ultima = new Map((ra.data ?? []).map((x) => [x.questao_id, x.correta as boolean | null]));
      const validas = [...ultima.values()].filter((v) => v !== null);
      const concluidos = (pr.data ?? []).filter((x) => x.status === 'concluido');
      setMetas((m.data as Metas | null) ?? null);
      setEditando(!m.data);
      if (m.data) setF({ horas: String(m.data.horas_semana ?? ''), questoes: String(m.data.questoes_dia ?? ''), acerto: String(m.data.acerto_pct ?? ''), assuntos: String(m.data.assuntos_semana ?? ''), prova: m.data.prova_em ?? '' });
      setN({
        segundosSemana: (cr.data ?? []).reduce((t, x) => t + x.segundos_efetivos, 0), questoesHoje: rh.count ?? 0,
        acertoGeral: validas.length ? Math.round((validas.filter(Boolean).length / validas.length) * 100) : null, respondidas: validas.length,
        assuntosSemana: concluidos.filter((x) => x.ultimo_estudo && x.ultimo_estudo >= dia(seg)).length, assuntosConcluidos: concluidos.length, assuntosTotal: ed.count ?? 0,
      });
      setMsg('');
    })();
  }, [router]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (salvando) return;
    setSalvando(true);
    const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));
    const novo: Metas = {
      horas_semana: num(f.horas), questoes_dia: num(f.questoes) === null ? null : Math.round(num(f.questoes)!),
      acerto_pct: num(f.acerto) === null ? null : Math.min(100, Math.round(num(f.acerto)!)),
      assuntos_semana: num(f.assuntos) === null ? null : Math.round(num(f.assuntos)!), prova_em: f.prova || null,
    };
    const { error } = await supabase.from('metas').upsert({ user_id: userId, ...novo }, { onConflict: 'user_id' });
    setSalvando(false);
    if (error) return setMsg(`Erro: ${error.message}`);
    setMetas(novo);
    setEditando(false);
    setMsg('');
  }

  const m = metas ?? vazio;
  const hoje = dia(new Date());
  const diasProva = m.prova_em ? Math.round((doIso(m.prova_em).getTime() - doIso(hoje).getTime()) / 86_400_000) : null;
  const restantes = n ? Math.max(n.assuntosTotal - n.assuntosConcluidos, 0) : 0;
  const semanasProva = diasProva !== null && diasProva > 0 ? diasProva / 7 : null;
  const ritmo = semanasProva && restantes ? Math.ceil(restantes / Math.max(semanasProva, 1)) : null; // assuntos por semana para fechar o edital até a prova
  const campo = 'field';
  const haMeta = m.horas_semana || m.questoes_dia || m.acerto_pct || m.assuntos_semana;

  return (
    <>
      <Topo />
      <main className="max-w-3xl mx-auto p-4 space-y-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-brand mr-auto">{T.metas}</h1>
          {metas && !editando && <button className="btn btn-ghost !py-1.5 !text-sm" onClick={() => setEditando(true)}>Editar metas</button>}
        </div>

        {msg && <p role="alert" className={msg.startsWith('Erro') ? 'text-sm text-red' : 'text-muted'}>{msg}</p>}

        {editando && !msg.startsWith('Carregando') && (
          <form onSubmit={salvar} className="card p-5 space-y-4">
            <p className="text-sm text-muted">Defina quanto você quer render. Todos os campos são opcionais; deixe em branco o que não quiser acompanhar.</p>
            <div className="grid gap-3 sm:grid-cols-2 text-sm">
              <label className="space-y-1">Horas de estudo por semana<input type="number" min={0} step={0.5} className={campo} value={f.horas} onChange={(e) => setF({ ...f, horas: e.target.value })} placeholder="Ex.: 20" /></label>
              <label className="space-y-1">Questões por dia<input type="number" min={0} className={campo} value={f.questoes} onChange={(e) => setF({ ...f, questoes: e.target.value })} placeholder="Ex.: 30" /></label>
              <label className="space-y-1">Acerto mínimo (%)<input type="number" min={0} max={100} className={campo} value={f.acerto} onChange={(e) => setF({ ...f, acerto: e.target.value })} placeholder="Ex.: 70" /></label>
              <label className="space-y-1">Assuntos concluídos por semana<input type="number" min={0} className={campo} value={f.assuntos} onChange={(e) => setF({ ...f, assuntos: e.target.value })} placeholder="Ex.: 6" /></label>
              <label className="space-y-1 sm:col-span-2">Data da prova<input type="date" min={hoje} className={campo} value={f.prova} onChange={(e) => setF({ ...f, prova: e.target.value })} /></label>
            </div>
            <div className="flex gap-2">
              <button className="btn btn-gold" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar metas'}</button>
              {metas && <button type="button" className="btn btn-ghost" onClick={() => setEditando(false)}>Cancelar</button>}
            </div>
          </form>
        )}

        {n && metas && !editando && (
          <>
            {diasProva !== null && (
              <section className="hero rounded-2xl p-6">
                <div className="relative z-10">
                  <p className="text-sm opacity-80">Data da prova: {br(m.prova_em!)}</p>
                  {diasProva > 0 ? (
                    <>
                      <p className="font-display text-5xl font-extrabold">{diasProva}<span className="text-xl opacity-70"> {diasProva === 1 ? 'dia' : 'dias'}</span></p>
                      <p className="text-sm opacity-80 mt-1">Faltam {Math.ceil(diasProva / 7)} semanas. Restam {restantes} assuntos do edital{ritmo ? `: o ritmo para fechar tudo até a prova é de cerca de ${ritmo} por semana.` : '.'}</p>
                    </>
                  ) : <p className="font-display text-2xl font-bold">{diasProva === 0 ? 'A prova é hoje. Boa sorte!' : 'A data da prova já passou. Atualize nas metas.'}</p>}
                </div>
              </section>
            )}

            {haMeta ? (
              <section className="grid gap-3 sm:grid-cols-2">
                {m.horas_semana ? <Meta titulo="Horas de estudo na semana" atual={n.segundosSemana / 3600} alvo={m.horas_semana} texto={`${fmtDuracao(n.segundosSemana)} de ${m.horas_semana} h`} /> : null}
                {m.questoes_dia ? <Meta titulo="Questões hoje" atual={n.questoesHoje} alvo={m.questoes_dia} texto={`${n.questoesHoje} de ${m.questoes_dia}`} /> : null}
                {m.acerto_pct ? <Meta titulo="Aproveitamento nas questões" atual={n.acertoGeral ?? 0} alvo={m.acerto_pct} texto={n.acertoGeral === null ? `Sem respostas ainda (meta ${m.acerto_pct}%)` : `${n.acertoGeral}% (meta ${m.acerto_pct}%) em ${n.respondidas} questões`} /> : null}
                {m.assuntos_semana ? <Meta titulo="Assuntos concluídos na semana" atual={n.assuntosSemana} alvo={m.assuntos_semana} texto={`${n.assuntosSemana} de ${m.assuntos_semana}`} /> : null}
              </section>
            ) : <p className="card p-6 text-center text-muted">Você só definiu a data da prova. Volte em "Editar metas" para acompanhar horas, questões e assuntos.</p>}

            <p className="text-xs text-muted">As horas vêm do cronômetro, as questões e o acerto do banco de questões, e os assuntos do checklist do edital. A semana vai de segunda a domingo.</p>
          </>
        )}
      </main>
    </>
  );
}
