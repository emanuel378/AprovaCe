-- Conferência dos gabaritos (jan/2026): 2025 e 2021 batem com os PDFs oficiais; as 4 anuladas de 2025 (q009, q037, q057, q090) também.
-- Simulado 2024 (não oficial): a questão 9 tem duas alternativas que podem ser consideradas erradas (subumano e sub-aquático),
-- então o gabarito (B) é discutível. Marcamos para o app avisar o aluno.
update questoes
set revisar = array_append(revisar, 'gabarito-duvidoso')
where id = 'simulado-2024-09-08-q009' and not ('gabarito-duvidoso' = any(revisar));
