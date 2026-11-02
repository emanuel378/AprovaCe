insert into assuntos (id,disciplina_id,nome,origem,ordem) values
('atualidades-historia-do-ceara-90','atualidades-historia-do-ceara','Conhecimentos locais: Caucaia e Região Metropolitana do Cariri','pedagogico',90),
('direito-penal-e-processual-penal-90','direito-penal-e-processual-penal','Direito Penal – parte geral (lei penal, imputabilidade, culpabilidade, concurso de pessoas)','pedagogico',90),
('direito-penal-e-processual-penal-91','direito-penal-e-processual-penal','Direito Penal – parte especial (crimes em espécie)','pedagogico',91),
('direito-penal-e-processual-penal-92','direito-penal-e-processual-penal','Legislação penal especial (Lei de Drogas e Sisnad)','pedagogico',92),
('criminologia-90','criminologia','Escolas e teorias criminológicas','pedagogico',90),
('criminologia-91','criminologia','Vitimologia e técnicas de investigação criminológica','pedagogico',91),
('seguranca-publica-90','seguranca-publica','Atividade de inteligência','pedagogico',90),
('seguranca-publica-91','seguranca-publica','Hierarquia, disciplina e conhecimentos técnico-policiais','pedagogico',91)
on conflict (id) do nothing;
