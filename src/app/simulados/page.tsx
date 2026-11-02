'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { sortear } from '@/lib/simulado';
import { Topo } from '@/components/Topo';
import { T } from '@/lib/textos';

type Disc = { id: string; nome: string; questoes_prova: number };
type Fonte = { id: string; nome: string; oficial: boolean };
type QLeve = { id: string; fonte_id: string; disciplina_id: string | null; gabarito: string | null };
type Resultado = { acertos: number; erros: number; branco: number; total: number; nota: number };
type Anterior = { id: string; titulo: string | null; estado: 'andamento' | 'finalizado'; iniciado_em: string; config: { resultado?: Resultado } };

const MIN_POR_QUESTAO = 3;
const dataBr = (iso: string) => new Date(iso).toLocaleDateString('pt-BR');

export default function Simulados() {
  const router = useRouter();
  const [userId, setUserId] = useState('');
  const [discs, setDiscs] = useState<Disc[]>([]);
  const [fontes, setFontes] = useState<Fonte[]>([]);
  const [questoes, setQuestoes] = useState<QLeve[]>([]);
  const [respondidas, setRespondidas] = useState<Set<string>>(new Set());
  const [anteriores, setAnteriores] = useState<Anterior[]>([]);
  const [msg, setMsg] = useState('Carregando…');
  const [criando, setCriando] = useState(false);

  const [n, setN] = useState(20);
  const [discSel, setDiscSel] = useState<Set<string>>(new Set());
  const [fonteSel, setFonteSel] = useState<Set<string>>(new Set());
  const [inedidas, setInedidas] = useState(false);
  const [minutos, setMinutos] = useState<number | null>(null); // null = padrão (3 min por questão); 0 = sem limite

  useEffect(() => {
    (async () => {
      const { data: s } = await supabase.auth.getSession();
      if (!s.session) return router.replace('/login');
      setUserId(s.session.user.id);
      const [d, f, q, r, a] = await Promise.all([
        supabase.from('disciplinas').select('id,nome,questoes_prova').order('ordem'),
        supabase.from('fontes').select('id,nome,oficial').order('ano', { ascending: false }),
        supabase.from('questoes').select('id,fonte_id,disciplina_id,gabarito'),
        supabase.from('respostas').select('questao_id'),
        supabase.from('simulados').select('id,titulo,estado,iniciado_em,config').order('iniciado_em', { ascending: false }),
      ]);
      const erro = d.error ?? f.error ?? q.error ?? r.error ?? a.error;
      if (erro) return setMsg(`Erro: ${erro.message}`);
      setDiscs(d.data ?? []);
      setFontes(f.data ?? []);
      setQuestoes(q.data ?? []);
      setRespondidas(new Set((r.data ?? []).map((x) => x.questao_id)));
      setAnteriores((a.data ?? []) as Anterior[]);
      setDiscSel(new Set((d.data ?? []).map((x) => x.id)));
      setFonteSel(new Set((f.data ?? []).filter((x) => x.oficial).map((x) => x.id)));
      setMsg('');
    })();
  }, [router]);

  // Só entram questões com gabarito (anuladas ficam de fora, pois não dá para corrigir).
  const pool = useMemo(() => questoes.filter((q) => q.gabarito && fonteSel.has(q.fonte_id) && q.disciplina_id && discSel.has(q.disciplina_id) && (!inedidas || !respondidas.has(q.id))),
    [questoes, fonteSel, discSel, inedidas, respondidas]);
  const total = Math.min(Math.max(n, 1), pool.length);
  const tempo = minutos ?? total * MIN_POR_QUESTAO;

  const alternar = (set: Set<string>, setar: (s: Set<string>) => void, id: string) => {
    const novo = new Set(set);
    if (novo.has(id)) novo.delete(id); else novo.add(id);
    setar(novo);
  };

  async function iniciar() {
    if (!pool.length) return;
    setCriando(true);
    const pesos = Object.fromEntries(discs.map((d) => [d.id, d.questoes_prova]));
    const ids = sortear(pool, total, pesos);
    const { data, error } = await supabase.from('simulados').insert({
      user_id: userId,
      titulo: `Simulado de ${new Date().toLocaleDateString('pt-BR')} · ${ids.length} questões`,
      config: { n: ids.length, fontes: [...fonteSel], disciplinas: [...discSel], inedidas },
      questao_ids: ids,
      tempo_max_seg: tempo > 0 ? tempo * 60 : null,
    }).select('id').single();
    if (error) { setCriando(false); return setMsg(`Erro ao criar o simulado: ${error.message}`); }
    router.push(`/simulados/${data.id}`);
  }

  return (
    <>
      <Topo />
      <main className="max-w-3xl mx-auto p-4 space-y-4">
        <section className="card p-5 sm:p-6 space-y-5">
          <div>
            <h1 className="text-2xl font-bold text-brand">{T.simulado}</h1>
            <p className="text-sm text-muted">As questões são sorteadas respeitando o peso de cada disciplina na prova oficial.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm space-y-1">Número de questões
              <input type="number" className="field" min={1} max={Math.max(pool.length, 1)} value={n} onChange={(e) => setN(Number(e.target.value) || 1)} />
            </label>
            <label className="text-sm space-y-1">Tempo (minutos, 0 = sem limite)
              <input type="number" className="field" min={0} value={tempo} onChange={(e) => setMinutos(Math.max(0, Number(e.target.value) || 0))} />
            </label>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">Provas</legend>
            <div className="flex flex-wrap gap-2">
              {fontes.map((f) => (
                <button key={f.id} type="button" aria-pressed={fonteSel.has(f.id)} onClick={() => alternar(fonteSel, setFonteSel, f.id)}
                  className={`btn btn-ghost !py-1.5 !text-sm ${fonteSel.has(f.id) ? '!border-blue !text-brand' : 'opacity-60'}`}>
                  {fonteSel.has(f.id) ? '✓ ' : ''}{f.nome}{!f.oficial && ' (não oficial)'}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">Disciplinas</legend>
            <div className="flex flex-wrap gap-2">
              {discs.map((d) => (
                <button key={d.id} type="button" aria-pressed={discSel.has(d.id)} onClick={() => alternar(discSel, setDiscSel, d.id)}
                  className={`btn btn-ghost !py-1.5 !text-sm ${discSel.has(d.id) ? '!border-blue !text-brand' : 'opacity-60'}`}>
                  {discSel.has(d.id) ? '✓ ' : ''}{d.nome}
                </button>
              ))}
            </div>
          </fieldset>

          <label className="flex items-center gap-3 text-sm cursor-pointer">
            <input type="checkbox" className="check" checked={inedidas} onChange={(e) => setInedidas(e.target.checked)} />
            Só questões que ainda não respondi
          </label>

          {msg && <p role="alert" className={msg.startsWith('Erro') ? 'text-sm text-red' : 'text-muted'}>{msg}</p>}
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={iniciar} disabled={!pool.length || criando} className="btn btn-gold">{criando ? 'Criando…' : 'Iniciar simulado →'}</button>
            <span className="text-sm text-muted">{pool.length} questões disponíveis{pool.length > 0 && n > pool.length ? ` · será usado o máximo (${pool.length})` : ''}</span>
          </div>
        </section>

        {anteriores.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-lg font-bold text-brand">Seus simulados</h2>
            {anteriores.map((a) => (
              <Link key={a.id} href={`/simulados/${a.id}`} className="card p-4 flex items-center gap-3 hover:border-blue">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{a.titulo ?? 'Simulado'}</p>
                  <p className="text-xs text-muted">{dataBr(a.iniciado_em)}</p>
                </div>
                {a.estado === 'finalizado' && a.config.resultado
                  ? <span className="chip chip-ok">Nota {a.config.resultado.nota.toFixed(1)} · {a.config.resultado.acertos}/{a.config.resultado.total}</span>
                  : <span className="chip chip-gold">Em andamento</span>}
              </Link>
            ))}
          </section>
        )}
      </main>
    </>
  );
}
