insert into disciplinas (id,nome,questoes_prova,ordem) values
('lingua-portuguesa','Língua Portuguesa',12,1),
('raciocinio-logico','Raciocínio Lógico',10,2),
('atualidades-historia-do-ceara','Atualidades / História do Ceará',10,3),
('administracao-publica-etica','Administração Pública / Ética',8,4),
('direito-constitucional','Direito Constitucional',12,5),
('direitos-humanos','Direitos Humanos',10,6),
('direito-penal-militar-processo-penal-militar','Direito Penal Militar / Processo Penal Militar',12,7),
('direito-penal-e-processual-penal','Direito Penal e Processual Penal',12,8),
('criminologia','Criminologia',8,9),
('seguranca-publica','Segurança Pública',6,10)
on conflict (id) do nothing;

insert into fontes (id,nome,ano,banca,oficial,pdf_path,gabarito_pdf_path) values
('pmce-2025','PMCE 2025 – Soldado (Gabarito 1)',2025,'CEV/UECE',true,'pmce2025g1.pdf','Gabarito2025.pdf'),
('pmce-2021','PMCE 2021 – Soldado (Tipo 1 Branca, gabarito Masculino T1)',2021,'FGV',true,'fgv-2021-pm-ce-soldado-da-policia-militar-prova.pdf','Gabarito2021MASCULINO.pdf'),
('simulado-2024-09-08','Simulado PMCE 08/09/2024',2024,'Simulado (terceiros)',false,'simulado-pmce-08092024 (1).pdf',null)
on conflict (id) do nothing;
