'use client';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

export type Opcao = { id: string; nome: string; detalhe?: string };
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Lista suspensa que também aceita digitação: ao digitar, filtra as opções (sem diferenciar acentos). */
export function Combobox({ opcoes, valor, onChange, rotulo, vazio = 'Todos' }: {
  opcoes: Opcao[]; valor: string; onChange: (id: string) => void; rotulo: string; vazio?: string;
}) {
  const listaId = useId();
  const selecionada = opcoes.find((o) => o.id === valor);
  const [texto, setTexto] = useState(selecionada?.nome ?? '');
  const [aberto, setAberto] = useState(false);
  const [digitou, setDigitou] = useState(false); // só filtra depois que a pessoa digita; ao abrir mostra tudo
  const [ativo, setAtivo] = useState(-1);
  const fecharTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setTexto(selecionada?.nome ?? ''); setDigitou(false); }, [selecionada?.nome]);

  const filtradas = useMemo(() => {
    const t = norm(texto.trim());
    return digitou && t ? opcoes.filter((o) => norm(`${o.nome} ${o.detalhe ?? ''}`).includes(t)) : opcoes;
  }, [opcoes, texto, digitou]);

  function escolher(id: string) {
    onChange(id);
    setTexto(opcoes.find((o) => o.id === id)?.nome ?? '');
    setDigitou(false);
    setAberto(false);
    setAtivo(-1);
  }

  function teclas(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setAberto(true); setAtivo((i) => Math.min(i + 1, filtradas.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAtivo((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && aberto && ativo >= 0 && filtradas[ativo]) { e.preventDefault(); escolher(filtradas[ativo].id); }
    else if (e.key === 'Escape') { setAberto(false); setTexto(selecionada?.nome ?? ''); setDigitou(false); }
  }

  return (
    <div className="relative">
      <input
        className="field pr-8" role="combobox" aria-label={rotulo} aria-expanded={aberto} aria-controls={listaId} aria-autocomplete="list"
        placeholder={vazio} value={texto} autoComplete="off"
        onFocus={(e) => { if (fecharTimer.current) clearTimeout(fecharTimer.current); setAberto(true); e.target.select(); }}
        onBlur={() => { fecharTimer.current = setTimeout(() => { setAberto(false); setTexto(selecionada?.nome ?? ''); setDigitou(false); }, 120); }}
        onChange={(e) => {
          setTexto(e.target.value); setDigitou(true); setAberto(true); setAtivo(0);
          if (!e.target.value && valor) onChange(''); // apagar o texto limpa a seleção
        }}
        onKeyDown={teclas}
      />
      <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
        className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted transition-transform ${aberto ? 'rotate-180' : ''}`}><path d="m6 9 6 6 6-6" /></svg>
      {aberto && (
        <ul id={listaId} role="listbox" className="card absolute z-30 mt-1 w-full max-h-60 overflow-auto p-1">
          <li role="option" aria-selected={!valor}>
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => escolher('')} className="w-full text-left rounded-lg px-3 py-2 text-sm text-muted hover:bg-blue/10">— {vazio}</button>
          </li>
          {filtradas.map((o, i) => (
            <li key={o.id} role="option" aria-selected={o.id === valor}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => escolher(o.id)}
                className={`w-full text-left rounded-lg px-3 py-2 text-sm hover:bg-blue/10 ${i === ativo ? 'bg-blue/10' : ''} ${o.id === valor ? 'font-semibold text-brand' : ''}`}>
                {o.nome}{o.detalhe && <span className="block text-xs text-muted">{o.detalhe}</span>}
              </button>
            </li>
          ))}
          {!filtradas.length && <li className="px-3 py-2 text-sm text-muted">Nenhuma opção encontrada</li>}
        </ul>
      )}
    </div>
  );
}
