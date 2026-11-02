'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { exibicao, fmtRelogio, type Cron } from '@/lib/cronometro';
import { Marca, NomeMarca } from './Marca';

const LINKS = [
  { href: '/', nome: 'Início' }, { href: '/assuntos', nome: 'Assuntos' }, { href: '/questoes', nome: 'Questões' },
  { href: '/simulados', nome: 'Simulados' }, { href: '/flashcards', nome: 'Flashcards' },
  { href: '/cronograma', nome: 'Cronograma' }, { href: '/cronometro', nome: 'Cronômetro' }, { href: '/metas', nome: 'Metas' },
];

export function Topo() {
  const path = usePathname();
  const router = useRouter();
  const [montado, setMontado] = useState(false); // destaque do menu só depois de montar: evita diferença entre o HTML do servidor e o do navegador
  const [aberto, setAberto] = useState(false); // menu lateral (celular e telas estreitas)
  const [ativo, setAtivo] = useState<Cron | null>(null); // cronômetro em andamento, para mostrar em qualquer tela
  const [agora, setAgora] = useState(() => Date.now());
  const fechar = useRef<HTMLButtonElement>(null);
  useEffect(() => setMontado(true), []);
  useEffect(() => setAberto(false), [path]);

  useEffect(() => {
    (async () => {
      const { data: s } = await supabase.auth.getSession();
      if (!s.session) return;
      const { data } = await supabase.from('cronometro_sessoes').select('modo,estado,segundos_efetivos,ultimo_retomar,config').neq('estado', 'finalizado').limit(1).maybeSingle();
      setAtivo((data as Cron | null) ?? null); // sem a coluna "config" (migração 0002) a consulta falha e o selo simplesmente não aparece
    })();
  }, [path]);

  useEffect(() => {
    if (ativo?.estado !== 'rodando') return;
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [ativo?.estado]);

  useEffect(() => { // menu aberto: Esc fecha, a página de trás não rola e o foco vai para o botão de fechar
    if (!aberto) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false); };
    window.addEventListener('keydown', esc);
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    fechar.current?.focus();
    return () => { window.removeEventListener('keydown', esc); document.body.style.overflow = antes; };
  }, [aberto]);

  async function sair() {
    await supabase.auth.signOut();
    router.replace('/login');
  }

  const selo = ativo && path !== '/cronometro'
    ? <>{fmtRelogio(exibicao(ativo, agora).segundos)}{ativo.estado === 'pausado' && ' (pausado)'}</>
    : null;

  return (
    <>
      <header className="topo">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 h-14 flex items-center gap-2 sm:gap-3">
          <button className="lg:hidden btn btn-ghost !p-2 !rounded-xl" aria-label="Abrir menu" aria-expanded={aberto} onClick={() => setAberto(true)}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
          </button>
          <Link href="/" className="flex items-center gap-2 text-lg">
            <Marca size={30} /> <NomeMarca />
          </Link>
          <nav className="nav hidden lg:flex gap-1 flex-1 ml-2" aria-label="Principal">
            {LINKS.map((l) => <Link key={l.href} href={l.href} aria-current={montado && path === l.href ? 'page' : undefined} className="whitespace-nowrap">{l.nome}</Link>)}
          </nav>
          {selo && <Link href="/cronometro" className="chip chip-gold ml-auto lg:ml-0" title="Cronômetro em andamento">{selo}</Link>}
          <button onClick={sair} className={`hidden lg:inline-flex btn btn-ghost !py-1.5 !px-3 !text-sm ${selo ? '' : 'ml-auto'}`}>Sair</button>
        </div>
      </header>

      {aberto && (
        <div className="fixed inset-0 z-[60] lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm backdrop-in" onClick={() => setAberto(false)} />
          <aside className="drawer-in absolute left-0 top-0 bottom-0 w-72 max-w-[85vw] bg-card border-r border-line shadow-2xl flex flex-col">
            <div className="flex items-center gap-2 p-4 border-b border-line">
              <Marca size={34} /> <span className="text-xl"><NomeMarca /></span>
              <button ref={fechar} className="btn btn-ghost !p-2 !rounded-xl ml-auto" aria-label="Fechar menu" onClick={() => setAberto(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>
            <nav className="nav-lado flex-1 overflow-y-auto p-3 space-y-1" aria-label="Principal">
              {LINKS.map((l) => (
                <Link key={l.href} href={l.href} aria-current={montado && path === l.href ? 'page' : undefined} onClick={() => setAberto(false)}>
                  {l.nome}
                </Link>
              ))}
            </nav>
            <div className="p-3 border-t border-line space-y-2">
              {ativo && path !== '/cronometro' && <Link href="/cronometro" className="chip chip-gold !flex !justify-center !py-2 !text-sm">{selo} · em andamento</Link>}
              <button onClick={sair} className="btn btn-ghost w-full">Sair</button>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
