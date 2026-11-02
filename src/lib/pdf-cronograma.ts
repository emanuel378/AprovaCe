// Gera o PDF do cronograma no navegador (jsPDF carregado só quando o botão é usado).
export type LinhaPdf = { data: string; inicio: string | null; tipo: string; disciplina: string; assunto: string; duracao_min: number; meta: string | null; concluida: boolean };

const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const NAVY: [number, number, number] = [11, 37, 69];
const AZUL: [number, number, number] = [29, 78, 158];
const DOURADO: [number, number, number] = [226, 169, 59];

const doIso = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const br = (s: string) => s.split('-').reverse().slice(0, 2).join('/');
const segundaDe = (s: string) => { const d = doIso(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toLocaleDateString('sv-SE'); };
const somar = (s: string, n: number) => { const d = doIso(s); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); };
const fmtMin = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, '0') : ''}` : `${m} min`);

export async function baixarCronogramaPdf(periodo: string, linhas: LinhaPdf[]) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const largura = doc.internal.pageSize.getWidth();

  doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(...NAVY);
  doc.text('APROVE', 14, 18);
  const wAprove = doc.getTextWidth('APROVE ');
  doc.setTextColor(...DOURADO); doc.text('CE', 14 + wAprove, 18);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(90, 100, 115);
  doc.text(`Cronograma de estudos  |  ${periodo}`, 14, 25);
  doc.setDrawColor(...DOURADO); doc.setLineWidth(0.8); doc.line(14, 28, largura - 14, 28);

  const totalMin = linhas.reduce((n, l) => n + l.duracao_min, 0);
  doc.setFontSize(9);
  doc.text(`${linhas.length} sessões  |  ${fmtMin(totalMin)} planejados`, largura - 14, 25, { align: 'right' });

  // agrupa por semana (segunda a domingo) e por dia
  const semanas = new Map<string, Map<string, LinhaPdf[]>>();
  for (const l of [...linhas].sort((a, b) => a.data.localeCompare(b.data) || (a.inicio ?? '99').localeCompare(b.inicio ?? '99'))) {
    const sem = semanas.get(segundaDe(l.data)) ?? new Map<string, LinhaPdf[]>();
    sem.set(l.data, [...(sem.get(l.data) ?? []), l]);
    semanas.set(segundaDe(l.data), sem);
  }

  let y = 34;
  for (const [segunda, dias] of semanas) {
    const corpo: (string | { content: string; colSpan: number; styles: object })[][] = [];
    const meta: (boolean | null)[] = []; // por linha da tabela: null = título do dia; boolean = concluída
    for (const [data, sessoes] of dias) {
      const min = sessoes.reduce((n, s) => n + s.duracao_min, 0);
      corpo.push([{ content: `${DIAS[(doIso(data).getDay() + 6) % 7]} ${br(data)}  -  ${fmtMin(min)}`, colSpan: 5, styles: { fillColor: [235, 240, 248], textColor: NAVY, fontStyle: 'bold' } }]);
      meta.push(null);
      for (const s of sessoes) {
        corpo.push(['', s.inicio ? s.inicio.slice(0, 5) : '', [s.disciplina, s.assunto, s.meta ? `> ${s.meta}` : ''].filter(Boolean).join('\n'), s.tipo, fmtMin(s.duracao_min)]);
        meta.push(s.concluida);
      }
    }
    autoTable(doc, {
      startY: y, theme: 'grid', margin: { left: 14, right: 14, bottom: 16 },
      head: [[{ content: `Semana de ${br(segunda)} a ${br(somar(segunda, 6))}`, colSpan: 5, styles: { halign: 'left' } }], ['', 'Hora', 'Matéria / assunto', 'Tipo', 'Tempo']],
      body: corpo,
      headStyles: { fillColor: NAVY, textColor: 255, fontSize: 9 },
      styles: { fontSize: 8.5, cellPadding: 2, lineColor: [215, 222, 232], lineWidth: 0.2, valign: 'middle' },
      columnStyles: { 0: { cellWidth: 9 }, 1: { cellWidth: 14 }, 2: { cellWidth: 'auto' }, 3: { cellWidth: 24 }, 4: { cellWidth: 18, halign: 'right' } },
      didDrawCell: (d) => { // quadradinho para marcar à mão (com um X se a sessão já foi feita)
        if (d.section !== 'body' || d.column.index !== 0 || meta[d.row.index] === null || meta[d.row.index] === undefined) return;
        const x = d.cell.x + (d.cell.width - 4) / 2, yy = d.cell.y + (d.cell.height - 4) / 2;
        doc.setDrawColor(...AZUL); doc.setLineWidth(0.4); doc.rect(x, yy, 4, 4);
        if (meta[d.row.index]) { doc.line(x + 0.8, yy + 2.2, x + 1.8, yy + 3.2); doc.line(x + 1.8, yy + 3.2, x + 3.4, yy + 0.8); }
      },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  }

  if (!linhas.length) { doc.setFontSize(11); doc.setTextColor(90, 100, 115); doc.text('Nenhuma sessão neste período.', 14, 40); }

  const paginas = doc.getNumberOfPages();
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i); doc.setFontSize(8); doc.setTextColor(140, 150, 165);
    doc.text(`Aprove CE  |  Página ${i} de ${paginas}`, largura / 2, doc.internal.pageSize.getHeight() - 8, { align: 'center' });
  }
  doc.save(`cronograma-aprove-ce-${new Date().toLocaleDateString('sv-SE')}.pdf`);
}
