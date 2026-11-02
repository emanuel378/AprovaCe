import type { Metadata, Viewport } from 'next';
import { Inter, Sora } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const sora = Sora({ subsets: ['latin'], variable: '--font-sora' });

export const metadata: Metadata = { title: 'Aprove CE', description: 'Plataforma de estudos para o concurso de Soldado PMCE' };
export const viewport: Viewport = { themeColor: '#07101C' }; // cor da barra do navegador no celular

// Aplica o tema claro (se o aluno escolheu) antes da página aparecer, para não piscar.
const temaInicial = "try{if(localStorage.getItem('tema')==='claro')document.documentElement.dataset.tema='claro'}catch(e){}";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${sora.variable}`} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: temaInicial }} /></head>
      <body>{children}</body>
    </html>
  );
}
