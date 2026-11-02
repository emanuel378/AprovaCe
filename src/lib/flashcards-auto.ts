import type { SupabaseClient } from '@supabase/supabase-js';
import type { Questao } from './tipos';

const CHAVE = 'flashcards-auto';

// Preferência guardada no navegador. Desligada por padrão (um simulado grande geraria dezenas de cartões de uma vez).
export function autoAtivo(): boolean {
  try { return localStorage.getItem(CHAVE) === '1'; } catch { return false; }
}
export function definirAuto(v: boolean) {
  try { localStorage.setItem(CHAVE, v ? '1' : '0'); } catch { /* sem armazenamento: usa o padrão */ }
}

export function cartaoDeQuestao(q: Questao) {
  const certa = q.alternativas.find((a) => a.letter === q.gabarito);
  return {
    frente: q.enunciado.length > 700 ? `${q.enunciado.slice(0, 700)}…` : q.enunciado,
    verso: `Gabarito: ${q.gabarito ? `${q.gabarito}) ${certa?.text ?? ''}` : 'sem gabarito'}${q.comentario ? `\n\n${q.comentario}` : ''}`,
    disciplina_id: q.disciplina_id,
    assunto_id: q.assunto_id,
    questao_id: q.id,
  };
}

/** Cria um flashcard para cada questão errada que ainda não tem um. Devolve os ids das questões que ganharam cartão. */
export async function criarCartoesDeErros(supabase: SupabaseClient, userId: string, erradas: Questao[]): Promise<{ criadas: string[]; erro?: string }> {
  if (!erradas.length) return { criadas: [] };
  const { data, error } = await supabase.from('flashcards').select('questao_id').in('questao_id', erradas.map((q) => q.id));
  if (error) return { criadas: [], erro: error.message };
  const ja = new Set((data ?? []).map((x) => x.questao_id as string));
  const novas = erradas.filter((q) => !ja.has(q.id));
  if (!novas.length) return { criadas: [] };
  const { error: e2 } = await supabase.from('flashcards').insert(novas.map((q) => ({ user_id: userId, ...cartaoDeQuestao(q) })));
  return e2 ? { criadas: [], erro: e2.message } : { criadas: novas.map((q) => q.id) };
}
