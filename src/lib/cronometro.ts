// Cálculos do cronômetro. O tempo não depende da aba aberta: vem de segundos acumulados + (agora - ultimo_retomar).
export type Modo = 'crescente' | 'regressivo' | 'pomodoro';
export type Config = { alvo_min?: number; foco_min?: number; pausa_min?: number };
export type Cron = {
  modo: Modo; estado: 'rodando' | 'pausado' | 'finalizado'; segundos_efetivos: number; ultimo_retomar: string | null; config: Config;
};

/** Segundos de relógio com o cronômetro rodando (no pomodoro inclui as pausas do ciclo; pausas manuais não contam). */
export function rodandoSeg(c: Pick<Cron, 'estado' | 'segundos_efetivos' | 'ultimo_retomar'>, agora = Date.now()): number {
  const delta = c.estado === 'rodando' && c.ultimo_retomar ? Math.max(0, Math.floor((agora - new Date(c.ultimo_retomar).getTime()) / 1000)) : 0;
  return c.segundos_efetivos + delta;
}

/** Fase do pomodoro a partir dos segundos rodados: foco, pausa, foco, pausa… `focoTotal` é só o tempo de estudo. */
export function pomodoro(raw: number, focoMin: number, pausaMin: number) {
  const foco = focoMin * 60, ciclo = foco + pausaMin * 60;
  const ciclos = Math.floor(raw / ciclo), resto = raw % ciclo;
  const emFoco = resto < foco;
  return { fase: emFoco ? ('foco' as const) : ('pausa' as const), restante: emFoco ? foco - resto : ciclo - resto, ciclo: ciclos + 1, focoTotal: ciclos * foco + Math.min(resto, foco) };
}

/** Tempo realmente estudado (no pomodoro, sem as pausas). */
export function estudado(c: Cron, agora = Date.now()): number {
  const raw = rodandoSeg(c, agora);
  return c.modo === 'pomodoro' ? pomodoro(raw, c.config.foco_min ?? 25, c.config.pausa_min ?? 5).focoTotal : raw;
}

/** O que mostrar no relógio grande. */
export function exibicao(c: Cron, agora = Date.now()): { segundos: number; rotulo: string; fim: boolean } {
  const raw = rodandoSeg(c, agora);
  if (c.modo === 'regressivo') {
    const resta = (c.config.alvo_min ?? 50) * 60 - raw;
    return { segundos: Math.max(resta, 0), rotulo: 'Restante', fim: resta <= 0 };
  }
  if (c.modo === 'pomodoro') {
    const p = pomodoro(raw, c.config.foco_min ?? 25, c.config.pausa_min ?? 5);
    return { segundos: p.restante, rotulo: p.fase === 'foco' ? `Foco · ciclo ${p.ciclo}` : 'Pausa', fim: false };
  }
  return { segundos: raw, rotulo: 'Estudando', fim: false };
}

export function fmtRelogio(seg: number): string {
  const s = Math.max(0, Math.floor(seg));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, '0');
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(r).padStart(2, '0')}`;
}

export function fmtDuracao(seg: number): string {
  const min = Math.round(seg / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h}h ${String(m).padStart(2, '0')}min` : `${h}h`;
}
