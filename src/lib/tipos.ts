export type Alt = { letter: string; text: string };
export type Questao = {
  id: string; fonte_id: string; numero: number; disciplina_id: string | null; assunto_id: string | null; enunciado: string;
  texto_apoio: string | null; alternativas: Alt[]; gabarito: string | null; status_gabarito: string; comentario: string | null; revisar: string[] | null;
};
