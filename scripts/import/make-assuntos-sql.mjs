// Gera supabase/seed/03_assuntos.sql a partir do Edital Verticalizado PMCE 2025 (128 itens; ordem = do PDF).
// Uso: node scripts/import/make-assuntos-sql.mjs
import fs from 'node:fs';

const EDITAL = {
  'lingua-portuguesa': [
    'Leitura, compreensão e interpretação de textos', 'Estruturação de textos e parágrafos',
    'Pronomes e expressões referenciais; nexos e operadores sequenciais', 'Significação contextual de palavras e expressões',
    'Equivalência e transformação de estruturas', 'Sintaxe: coordenação e subordinação', 'Tempos e modos verbais', 'Pontuação',
    'Estrutura e formação de palavras', 'Funções das classes de palavras', 'Flexão nominal e verbal',
    'Pronomes: emprego, tratamento e colocação', 'Concordância nominal e verbal', 'Regência nominal e verbal', 'Ortografia oficial', 'Acentuação gráfica'],
  'raciocinio-logico': [
    'Relações lógicas entre pessoas, lugares, objetos e eventos', 'Dedução de informações e avaliação de condições', 'Raciocínio verbal',
    'Raciocínio matemático', 'Raciocínio sequencial', 'Orientação espacial e temporal', 'Formação de conceitos e discriminação de elementos',
    'Operações com conjuntos', 'Problemas aritméticos', 'Problemas geométricos', 'Problemas matriciais'],
  'atualidades-historia-do-ceara': [
    'Meio ambiente e sociedade: problemas e políticas públicas', 'Organizações não governamentais; aspectos locais e globais',
    'Descobertas e inovações científicas e impactos sociais', 'Política internacional e brasileira contemporânea',
    'Cultura brasileira e internacional (artes, música, literatura, mídia etc.)', 'Economia internacional e panorama da economia brasileira',
    'Ceará colonial: ocupação, disputas entre nativos e portugueses', 'Sesmarias e economia pecuária', 'Ceará imperial: Confederação do Equador',
    'Economia do algodão e escravidão negra no Ceará', 'República Velha: oligarquias, coronelismo e clientelismo',
    'Movimentos sociais religiosos e banditismo', '1930–1964: Estado Novo e redemocratização', 'Indústria da seca, DNOCS e SUDENE',
    'Governos militares: novo coronelismo e modernização conservadora', 'Nova República: governos das mudanças'],
  'administracao-publica-etica': [
    'Organizações formais modernas: estruturas, natureza e finalidades', 'Critérios de departamentalização',
    'Processo organizacional: planejamento, direção e comunicação', 'Controle e avaliação organizacional',
    'Centralização, descentralização, concentração e desconcentração', 'Administração direta e indireta da União', 'Agências executivas e reguladoras',
    'Gestão de processos', 'Gestão de contratos', 'Planejamento estratégico', 'Princípios da Administração Pública',
    'Inovações constitucionais de 1988 na administração', 'Serviços públicos, delegação a terceiros, convênios e consórcios',
    'Relações humanas no trabalho', 'Ética e cidadania', 'Lei de Improbidade Administrativa (Lei nº 8.429/1992) e alterações'],
  'direito-constitucional': [
    'Direitos e deveres individuais e coletivos', 'Direitos sociais', 'Direitos políticos', 'Organização político-administrativa do Estado',
    'União, estados, Distrito Federal, municípios e territórios', 'Poder Legislativo: Congresso, Câmara e Senado',
    'Parlamentares federais, estaduais e municipais', 'Poder Executivo: Presidente e Ministros de Estado', 'Poder Judiciário e Conselho Nacional de Justiça',
    'Ministério Público, advocacia e Defensorias Públicas', 'Forças Armadas', 'Segurança Pública'],
  'direitos-humanos': [
    'Conceito e fundamentação dos Direitos Humanos', 'Responsabilidade do Estado e Direitos Humanos na Constituição de 1988',
    'Política Nacional de Direitos Humanos', 'Violências de gênero e violência doméstica', 'Lei Maria da Penha (Lei nº 11.340/2006)',
    'Racismo e racismo institucional', 'Estatuto da Igualdade Racial', 'Estatuto da Pessoa com Deficiência',
    'Direitos de moradores de favelas e vítimas de violência de Estado', 'Diversidade sexual e direitos das pessoas LGBTQIA+',
    'Homofobia, discriminação e crime de racismo', 'Tortura e direito de não ser torturado', 'Garantias judiciais e direitos pré-processuais',
    'População em situação de rua', 'Conceitos e princípios das políticas públicas', 'Recolhimento compulsório'],
  'direito-penal-militar-processo-penal-militar': [
    'Aplicação e especificidades da lei penal militar', 'Crime', 'Imputabilidade penal', 'Concurso de agentes', 'Aplicação das penas',
    'Suspensão condicional da pena e livramento condicional', 'Penas acessórias e efeitos da condenação', 'Medidas de segurança', 'Ação penal',
    'Extinção da punibilidade', 'Crimes militares em tempo de paz', 'Crimes propriamente e impropriamente militares', 'Crimes contra a pessoa',
    'Crimes contra o patrimônio', 'Crimes contra a administração militar', 'Crimes em tempo de guerra'],
  'direito-penal-e-processual-penal': [
    'Aplicação da lei processual no tempo, espaço e em relação às pessoas', 'Disposições preliminares do Código de Processo Penal', 'Inquérito policial',
    'Ação penal', 'Prisão e liberdade provisória', 'Prisão temporária – Lei nº 7.960/1989',
    'Processo e julgamento dos crimes de responsabilidade de funcionários públicos', 'Habeas corpus e seu processo',
    'Disposições constitucionais aplicáveis ao processo penal'],
  'criminologia': [
    'Crime como fato social', 'Instituições ligadas ao crime: polícias, Judiciário, MP e sistema penitenciário', 'Extensão da criminalidade no Brasil e no mundo',
    'Crime de massa: narcotráfico, terrorismo e crime organizado', 'Crime isolado: estudo do homicídio',
    'Tipos criminosos: nato, ocasional, habitual/profissional e passional', 'Tipos criminosos: alienado, menor (delinquência juvenil) e mulher criminosa',
    'Atividades repressivas, preventivas e educacionais para reduzir a criminalidade'],
  'seguranca-publica': [
    'Direitos Humanos, desarmamento e combate aos preconceitos', 'Redes sociais e comunitárias: criação e fortalecimento',
    'Instituições de segurança pública e sistema prisional', 'Enfrentamento do crime organizado e da corrupção policial', 'Garantia do acesso à Justiça',
    'Valorização dos espaços públicos', 'Participação da sociedade civil', 'PRONASCI – Programa Nacional de Segurança Pública com Cidadania'],
};

const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
const rows = Object.entries(EDITAL).flatMap(([disc, nomes]) =>
  nomes.map((nome, i) => `(${q(`${disc}-${String(i + 1).padStart(2, '0')}`)},${q(disc)},${q(nome)},'edital',${i + 1})`));

fs.mkdirSync('supabase/seed', { recursive: true });
fs.writeFileSync('supabase/seed/03_assuntos.sql',
  `insert into assuntos (id,disciplina_id,nome,origem,ordem) values\n${rows.join(',\n')}\non conflict (id) do nothing;\n`);
console.log(rows.length + ' assuntos');
