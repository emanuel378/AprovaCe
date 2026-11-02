'use client';
import { useEffect } from 'react';

/** Caixa de confirmação no meio da tela. Fecha com Cancelar, clique fora ou Esc. */
export function Confirmar({ titulo, texto, destaque, rotuloOk = 'Confirmar', perigo = false, ocupado = false, onOk, onCancelar }: {
  titulo: string; texto: React.ReactNode; destaque?: string; rotuloOk?: string; perigo?: boolean; ocupado?: boolean; onOk: () => void; onCancelar: () => void;
}) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancelar(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onCancelar]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/60 backdrop-blur-sm" onClick={onCancelar}>
      <div className="card w-full max-w-sm p-6 space-y-4 card-in" role="alertdialog" aria-modal="true" aria-labelledby="conf-titulo" onClick={(e) => e.stopPropagation()}>
        <h2 id="conf-titulo" className="font-display text-xl font-bold text-brand">{titulo}</h2>
        <div className="text-sm text-muted">{texto}</div>
        {destaque && <p className={`text-sm rounded-lg border-l-4 px-3 py-2 line-clamp-3 ${perigo ? 'border-red bg-red/10' : 'border-gold bg-gold/10'}`}>{destaque}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <button autoFocus className="btn btn-ghost" onClick={onCancelar} disabled={ocupado}>Cancelar</button>
          <button className={`btn btn-primary ${perigo ? '!bg-red !shadow-none' : ''}`} onClick={onOk} disabled={ocupado}>{ocupado ? 'Aguarde…' : rotuloOk}</button>
        </div>
      </div>
    </div>
  );
}
