// Escudo da logo Aprove CE (recorte de public/img/logo-aprove-ce.png).
export function Marca({ size = 32 }: { size?: number }) {
  return <img src="/img/icone-aprove-ce.png" width={size} height={size} alt="Aprove CE" style={{ objectFit: 'contain' }} />;
}

// Nome em duas cores, como na logo: APROVE em azul-marinho (ou branco sobre fundo escuro), CE em dourado.
export function NomeMarca({ claro = false }: { claro?: boolean }) {
  return (
    <span className="font-display font-extrabold tracking-tight">
      <span className={claro ? 'text-white' : 'text-brand'}>APROVE</span> <span className="text-gold">CE</span>
    </span>
  );
}
