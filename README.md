<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/img/logo-escuro.png">
    <img src="docs/img/logo-claro.png" alt="Aprove CE" width="420">
  </picture>
</p>

<p align="center">
  Plataforma de estudos para o concurso de <strong>Soldado da Polícia Militar do Ceará (PMCE)</strong>, edital 001/2025.
</p>

> Material de organização de estudos **não oficial**. O projeto não tem vínculo com a PMCE, com a CEV/UECE nem com a FGV.

## O que ele faz

| Módulo | Descrição |
| --- | --- |
| Questões | Banco de questões de provas anteriores, com filtro por prova, disciplina e assunto. Correção na hora, histórico de respostas e favoritas. |
| Edital | Os 128 assuntos do edital verticalizado em um checklist com situação, dificuldade, datas de estudo e revisão, e anotações. O assunto é marcado como estudado sozinho quando você acerta todas as questões dele. |
| Simulados | Sorteio de questões respeitando o peso de cada disciplina na prova oficial, com cronômetro, correção, nota de 0 a 10 e revisão questão por questão. |
| Flashcards | Repetição espaçada (variação do SM-2), modo treino com sorteio por matéria, estudo em tela cheia e criação opcional de cartões a partir dos erros. |
| Cronograma | Semana de estudos com sessões manuais, montagem automática por peso das disciplinas e montagem com IA. Exporta em PDF. |
| Cronômetro | Modos livre, meta de tempo e pomodoro. O tempo não depende da aba aberta e pode ser ligado a uma sessão do cronograma. |
| Metas | Horas por semana, questões por dia, acerto mínimo, assuntos por semana e contagem regressiva até a prova. |

### Cronograma com IA

Você responde poucas perguntas (semanas, horas por dia, data da prova, matérias de maior dificuldade) e vê uma prévia antes de salvar. A divisão do tempo entre as disciplinas é calculada pelo código a partir do peso na prova, do seu foco e do seu desempenho. O modelo, via [Groq](https://groq.com), escolhe o assunto, o tipo e a meta de cada bloco, e tudo que ele devolve é validado antes de entrar no cronograma.

## Tecnologias

- [Next.js 16](https://nextjs.org) (App Router), React 19 e TypeScript
- [Tailwind CSS 4](https://tailwindcss.com)
- [Supabase](https://supabase.com): Postgres, autenticação e Row Level Security
- [Groq](https://groq.com) para o cronograma com IA (`openai/gpt-oss-120b` por padrão)
- [jsPDF](https://github.com/parallax/jsPDF) para exportar o cronograma

## Como rodar

**Requisitos:** Node.js 22 ou superior e um projeto no Supabase. A chave do Groq é opcional e só é necessária para o cronograma com IA.

```bash
git clone https://github.com/emanuel378/AprovaCe.git
cd AprovaCe
npm install
cp .env.example .env.local
```

Preencha o `.env.local`:

| Variável | Para que serve |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto no Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Chave pública (publishable) do Supabase |
| `GROQ_API_KEY` | Chave do Groq. Fica só no servidor; nunca use o prefixo `NEXT_PUBLIC_` nela |
| `GROQ_MODEL` | Opcional: troca o modelo da IA |

### Banco de dados

No **SQL Editor** do Supabase, rode os arquivos nesta ordem:

1. `supabase/migrations/0001_schema.sql`
2. `supabase/migrations/0002_cronometro_config.sql`
3. `supabase/seed/01_base.sql`
4. `supabase/seed/02_pmce-2021.sql` e `supabase/seed/02_pmce-2025.sql`
5. `supabase/seed/03_assuntos.sql`
6. `supabase/seed/04_assuntos_extras.sql`
7. `supabase/seed/05_classificacao.sql`
8. `supabase/seed/06_gabaritos_revisar.sql`

Em **Authentication**, defina se o e-mail precisa ser confirmado. Com a confirmação desligada, quem cria a conta já entra direto.

### Iniciar

```bash
npm run dev
```

Abra http://localhost:3000, crie uma conta e entre.

## Scripts

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção |
| `npm start` | Serve o build de produção |
| `npm test` | Testes da lógica (repetição espaçada, sorteio de questões, cronômetro, planejamento e validação da IA) |

## Estrutura

```
src/
  app/            páginas (questões, assuntos, simulados, flashcards, cronograma, cronômetro, metas)
    api/          rota do servidor para o cronograma com IA
  components/     menu, combobox, confirmação, assistente de IA
  lib/            regras puras e testadas (sm2, simulado, plano, cronometro, ia-plano, pdf)
supabase/
  migrations/     esquema do banco e políticas de segurança (RLS)
  seed/           dados iniciais: disciplinas, assuntos, questões
scripts/import/   importação das provas a partir dos PDFs
test/             testes automatizados
```

## Segurança

- Todas as tabelas têm RLS: o conteúdo (questões e edital) é legível por usuários logados, e os dados pessoais (respostas, progresso, flashcards, cronograma e metas) só pelo próprio dono.
- A chave do Groq nunca vai para o navegador. A rota `/api/cronograma-ia` só atende usuários autenticados.
- A chave `service_role` do Supabase não é usada pelo app e nunca deve ser colocada no front-end nem em variáveis da hospedagem.

## Deploy

O caminho mais simples é a [Vercel](https://vercel.com): importe o repositório, cadastre as variáveis do `.env.local` e publique. Depois, no Supabase, em **Authentication → URL Configuration**, coloque o endereço do site em *Site URL* e em *Redirect URLs*.

## Conteúdo das provas

As questões das provas de 2021 (FGV) e 2025 (CEV/UECE) vêm de provas publicadas pelas bancas, e os gabaritos foram conferidos com os gabaritos oficiais. Os PDFs originais não fazem parte do repositório, e o simulado de terceiros usado no desenvolvimento também não foi incluído. Os direitos das provas pertencem às respectivas bancas.
