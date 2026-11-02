'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Topo } from '@/components/Topo';
import { T } from '@/lib/textos';

type Resumo = { total: number; respondidas: number; acertos: number };
type Hoje = { id: string; tipo: string; duracao_min: number; inicio: string | null; meta: string | null; concluida: boolean; disciplina: { nome: string } | null };
const TIPOS: Record<string, string> = { teoria: 'Teoria', questoes: 'Questões', revisao: 'Revisão', flashcards: 'Flashcards', simulado: 'Simulado', livre: 'Livre', pausa: 'Pausa' };

export default function Home() {
  const router = useRouter();
  const [r, setR] = useState<Resumo | null>(null);
  const [erro, setErro] = useState('');
  const [hoje, setHoje] = useState<Hoje[] | null>(null);
  const [diasProva, setDiasProva] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return router.replace('/login');
      const dia = new Date().toLocaleDateString('sv-SE');
      supabase.from('metas').select('prova_em').maybeSingle().then(({ data: mt }) => {
        if (mt?.prova_em) { const [y, m, d] = mt.prova_em.split('-').map(Number); const hj = new Date(); setDiasProva(Math.round((new Date(y, m - 1, d).getTime() - new Date(hj.getFullYear(), hj.getMonth(), hj.getDate()).getTime()) / 86_400_000)); }
      });
      supabase.from('sessoes_estudo').select('id,tipo,duracao_min,inicio,meta,concluida,disciplina:disciplinas(nome)').eq('data', dia).neq('tipo', 'pausa').order('inicio', { nullsFirst: false }).order('created_at')
        .then(({ data: h }) => setHoje((h ?? []) as unknown as Hoje[]));
      const [q, resp] = await Promise.all([
        supabase.from('questoes').select('*', { count: 'exact', head: true }),
        supabase.from('respostas').select('questao_id,correta').order('respondida_em'),
      ]);
      if (q.error || resp.error) return setErro((q.error ?? resp.error)!.message);
      const ultima = new Map((resp.data ?? []).map((x) => [x.questao_id, x.correta]));
      setR({ total: q.count ?? 0, respondidas: ultima.size, acertos: [...ultima.values()].filter(Boolean).length });
    })();
  }, [router]);

  const pct = r && r.respondidas ? Math.round((r.acertos / r.respondidas) * 100) : 0;
  const stat = (rotulo: string, valor: string) => (
    <div className="card p-5"><p className="text-sm text-muted">{rotulo}</p><p className="font-display text-3xl font-bold text-brand mt-1">{valor}</p></div>
  );

  return (
    <>
      <Topo />
      <main className="max-w-5xl mx-auto p-4 space-y-6">
        <section className="hero rounded-2xl p-7 sm:p-9">
          <div className="relative z-10 max-w-lg">
            <span className="chip chip-gold">Edital 001/2025 · CEV/UECE</span>
            {diasProva !== null && diasProva >= 0 && <Link href="/metas" className="chip ml-2 !bg-white/15 !text-white">{diasProva === 0 ? 'A prova é hoje' : `Faltam ${diasProva} ${diasProva === 1 ? 'dia' : 'dias'} para a prova`}</Link>}
            <h1 className="text-3xl font-bold mt-3">{T.homeTitulo}</h1>
            <p className="opacity-80 mt-1">{T.homeSub}</p>
            <div className="flex flex-wrap gap-2 mt-5">
              <Link href="/questoes" className="btn btn-gold">Resolver questões →</Link>
              <Link href="/cronograma" className="btn btn-ghost !text-white !border-white/30">Meu cronograma</Link>
              <Link href="/flashcards" className="btn btn-ghost !text-white !border-white/30">Flashcards</Link>
            </div>
          </div>
        </section>

        <section className="card p-5 space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-brand mr-auto">{T.escalaHoje}</h2>
            <Link href="/cronograma" className="text-sm text-blue font-semibold hover:underline">Ver semana →</Link>
          </div>
          {hoje === null ? <p className="text-sm text-muted">Carregando…</p> : hoje.length === 0 ? (
            <p className="text-sm text-muted">{T.hojeVazio} <Link href="/cronograma" className="text-blue underline">Montar cronograma</Link></p>
          ) : (
            <>
              <p className="text-sm text-muted">{hoje.filter((x) => x.concluida).length} de {hoje.length} sessões concluídas</p>
              <ul className="space-y-2">
                {hoje.map((x) => (
                  <li key={x.id} className={`rounded-xl border border-line p-3 flex items-center gap-3 ${x.concluida ? 'opacity-60' : ''}`}>
                    <div className="flex-1 min-w-0">
                      <p className={`font-semibold truncate ${x.concluida ? 'line-through' : ''}`}>{TIPOS[x.tipo] ?? x.tipo}{x.disciplina && ` · ${x.disciplina.nome}`}</p>
                      <p className="text-xs text-muted">{x.inicio ? `${x.inicio.slice(0, 5)} · ` : ''}{x.duracao_min} min{x.meta ? ` · ${x.meta}` : ''}</p>
                    </div>
                    {x.concluida ? <span className="chip chip-ok">Feita</span> : <Link href={`/cronometro?sessao=${x.id}`} className="btn btn-gold !py-1.5 !px-3 !text-sm">Iniciar</Link>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        {erro && <p role="alert" className="text-red">Erro: {erro}</p>}
        <section className="grid gap-4 sm:grid-cols-3">
          {stat('Questões no banco', r ? String(r.total) : '…')}
          {stat('Já respondidas', r ? `${r.respondidas}` : '…')}
          {stat('Aproveitamento', r ? (r.respondidas ? `${pct}%` : '—') : '…')}
        </section>

      </main>
    </>
  );
}
