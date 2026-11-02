// Repetição espaçada (variação do SM-2 com 4 notas, como no Anki).
export type Nota = 'errei' | 'dificil' | 'bom' | 'facil';
export type Estado = { repeticoes: number; facilidade: number; intervalo_dias: number };

const FACILIDADE_MIN = 1.3;

export function proximo(e: Estado, nota: Nota): Estado {
  const novaFac = (d: number) => Math.max(FACILIDADE_MIN, Math.round((e.facilidade + d) * 100) / 100);
  switch (nota) {
    case 'errei': // lapso: recomeça e volta amanhã
      return { repeticoes: 0, facilidade: novaFac(-0.2), intervalo_dias: 1 };
    case 'dificil':
      return { repeticoes: e.repeticoes + 1, facilidade: novaFac(-0.15), intervalo_dias: e.repeticoes === 0 ? 1 : Math.max(1, Math.round(e.intervalo_dias * 1.2)) };
    case 'bom':
      return { repeticoes: e.repeticoes + 1, facilidade: e.facilidade, intervalo_dias: e.repeticoes === 0 ? 1 : e.repeticoes === 1 ? 6 : Math.round(e.intervalo_dias * e.facilidade) };
    case 'facil':
      return { repeticoes: e.repeticoes + 1, facilidade: novaFac(0.15), intervalo_dias: e.repeticoes === 0 ? 4 : Math.max(e.intervalo_dias + 1, Math.round(e.intervalo_dias * e.facilidade * 1.3)) };
  }
}

/** Data (yyyy-mm-dd, fuso local) daqui a `dias` dias a partir de `base` (ou de hoje). */
export function somarDias(dias: number, base = new Date()): string {
  const d = new Date(base);
  d.setDate(d.getDate() + dias);
  return d.toLocaleDateString('sv-SE');
}

export const rotuloIntervalo = (dias: number) => (dias < 30 ? `${dias} d` : dias < 365 ? `${Math.round(dias / 30)} mês` : `${(dias / 365).toFixed(1)} ano`);
