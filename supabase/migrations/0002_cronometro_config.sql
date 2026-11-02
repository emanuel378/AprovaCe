-- Guarda a configuração do cronômetro (alvo do regressivo, foco/pausa do pomodoro).
alter table cronometro_sessoes add column if not exists config jsonb not null default '{}';
