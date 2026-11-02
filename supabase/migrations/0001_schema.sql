-- PMCE Estudos: schema. Conteúdo (fontes/questões) legível só por usuários logados; dados do usuário isolados por RLS.

create table disciplinas (id text primary key, nome text not null, questoes_prova int not null, ordem int not null);
create table assuntos (
  id text primary key, disciplina_id text not null references disciplinas, nome text not null,
  origem text not null default 'edital' check (origem in ('edital','pedagogico')), ordem int not null default 0);

create table fontes (
  id text primary key, nome text not null, ano int, banca text, oficial boolean not null default true,
  pdf_path text, gabarito_pdf_path text);
create table questoes (
  id text primary key, fonte_id text not null references fontes, numero int not null, pagina int,
  disciplina_id text references disciplinas, assunto_id text references assuntos,
  enunciado text not null, texto_apoio text, alternativas jsonb not null,  -- [{letter,text}]
  gabarito char(1) check (gabarito in ('A','B','C','D','E')),
  status_gabarito text not null check (status_gabarito in ('oficial-definitivo','terceiros-nao-oficial','anulada','nao-confirmado')),
  revisar text[] not null default '{}', dificuldade text,
  comentario text, comentario_status text check (comentario_status in ('ia-nao-revisado','revisado')),
  unique (fonte_id, numero));
create index on questoes (disciplina_id);
create index on questoes (assunto_id);
create index on questoes (fonte_id);

create table progresso_assunto (
  user_id uuid not null default auth.uid() references auth.users on delete cascade, assunto_id text not null references assuntos,
  status text not null default 'nao-iniciado' check (status in ('nao-iniciado','estudando','concluido','revisando')),
  dificuldade text, ultimo_estudo date, ultima_revisao date, proxima_revisao date, anotacoes text, favorito boolean not null default false,
  primary key (user_id, assunto_id));

create table sessoes_estudo ( -- cronograma
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade,
  disciplina_id text references disciplinas, assunto_id text references assuntos,
  tipo text not null check (tipo in ('teoria','questoes','revisao','flashcards','simulado','livre','pausa')),
  data date not null, inicio time, duracao_min int not null check (duracao_min > 0), meta text, prioridade int default 2, observacoes text,
  recorrencia jsonb, origem text not null default 'manual' check (origem in ('manual','auto')), bloqueada boolean not null default false,
  concluida boolean not null default false, tempo_real_min int, obs_pos text, created_at timestamptz not null default now());
create index on sessoes_estudo (user_id, data);

create table cronometro_sessoes (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade,
  disciplina_id text references disciplinas, assunto_id text references assuntos, sessao_estudo_id uuid references sessoes_estudo on delete set null,
  modo text not null check (modo in ('crescente','regressivo','pomodoro')), tipo text,
  inicio timestamptz not null, fim timestamptz, segundos_efetivos int not null default 0,
  estado text not null default 'rodando' check (estado in ('rodando','pausado','finalizado')),
  ultimo_retomar timestamptz, pausas jsonb not null default '[]');  -- tempo = acumulado + (agora - ultimo_retomar): não depende da aba aberta
create unique index on cronometro_sessoes (user_id) where estado <> 'finalizado'; -- 1 ativo por usuário
create unique index on cronometro_sessoes (sessao_estudo_id) where sessao_estudo_id is not null and estado = 'finalizado'; -- sem tempo duplicado

create table simulados (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade,
  titulo text, config jsonb not null, questao_ids text[] not null, respostas jsonb not null default '{}', marcadas text[] not null default '{}',
  estado text not null default 'andamento' check (estado in ('andamento','finalizado')),
  tempo_max_seg int, segundos_usados int not null default 0, iniciado_em timestamptz not null default now(), finalizado_em timestamptz);

create table respostas (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade,
  questao_id text not null references questoes, simulado_id uuid references simulados on delete set null,
  alternativa char(1) not null, correta boolean, respondida_em timestamptz not null default now()); -- histórico nunca é sobrescrito
create index on respostas (user_id, questao_id);

create table questao_favoritas (
  user_id uuid not null default auth.uid() references auth.users on delete cascade, questao_id text references questoes,
  primary key (user_id, questao_id));

create table flashcards (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade,
  frente text not null, verso text not null, disciplina_id text references disciplinas, assunto_id text references assuntos,
  questao_id text references questoes, tags text[] not null default '{}', obs text, favorito boolean not null default false,
  -- SM-2
  repeticoes int not null default 0, facilidade real not null default 2.5, intervalo_dias int not null default 0,
  vence_em date not null default current_date, ultima_revisao timestamptz, created_at timestamptz not null default now());
create table flashcard_revisoes (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade,
  flashcard_id uuid not null references flashcards on delete cascade, nota text not null check (nota in ('errei','dificil','bom','facil')),
  intervalo_dias int not null, revisado_em timestamptz not null default now());

create table metas (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  horas_semana numeric, questoes_dia int, acerto_pct int, assuntos_semana int, prova_em date);

-- RLS
alter table disciplinas enable row level security;
alter table assuntos enable row level security;
alter table fontes enable row level security;
alter table questoes enable row level security;
create policy leitura_logado on disciplinas for select to authenticated using (true);
create policy leitura_logado on assuntos for select to authenticated using (true);
create policy leitura_logado on fontes for select to authenticated using (true);
create policy leitura_logado on questoes for select to authenticated using (true);

do $$ declare t text; begin
  foreach t in array array['progresso_assunto','sessoes_estudo','cronometro_sessoes','simulados','respostas','questao_favoritas','flashcards','flashcard_revisoes','metas'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy dono on %I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;
