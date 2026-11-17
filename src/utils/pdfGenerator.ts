import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { AGENTE_RETENCION } from '../constants';
import { RetentionRecord } from '../types';
import { formatCurrency, formatDateAR, formatPdfFilename, numeroALetras } from './formatters';

// --- GENERADOR DE CERTIFICADO PDF OFICIAL (MISMO DISEÑO QUE PRODUCCIÓN) ---
export function buildCertificateDoc(
  doc: jsPDF,
  ret: RetentionRecord,
  sigImg: string,
  fallbackNumber?: string
): void {
  const textPrimary: [number, number, number] = [15, 23, 42]; // slate-900
  const textSecondary: [number, number, number] = [100, 116, 139]; // slate-500
  const textMuted: [number, number, number] = [148, 163, 184]; // slate-400
  const orangeAccent: [number, number, number] = [255, 81, 0]; // Bailac Orange #FF5100
  const bgLight: [number, number, number] = [248, 250, 252]; // slate-50
  const borderLight: [number, number, number] = [226, 232, 240]; // slate-200

  const marginX = 16;
  const pageWidth = 210;
  const contentWidth = pageWidth - marginX * 2; // 178mm

  // Barra superior decorativa minimalista
  doc.setFillColor(orangeAccent[0], orangeAccent[1], orangeAccent[2]);
  doc.rect(0, 0, pageWidth, 2.5, 'F');

  // --- 1. ENCABEZADO ---
  let currentY = 16;

  // Izquierda: Datos del Agente de Retención
  doc.setTextColor(textPrimary[0], textPrimary[1], textPrimary[2]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(AGENTE_RETENCION.razonSocial, marginX, currentY);

  currentY += 4.5;
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(orangeAccent[0], orangeAccent[1], orangeAccent[2]);
  doc.text('AGENTE DE RETENCIÓN INGRESOS BRUTOS · DGR SAN JUAN', marginX, currentY);

  currentY += 4.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(textSecondary[0], textSecondary[1], textSecondary[2]);
  doc.text(
    `CUIT: ${AGENTE_RETENCION.cuit}   ·   N° IIBB: ${AGENTE_RETENCION.nroIIBB}   ·   Condición: ${AGENTE_RETENCION.condicionIva}`,
    marginX,
    currentY
  );

  currentY += 3.8;
  doc.text(
    `${AGENTE_RETENCION.domicilio}   ·   Jurisdicción: San Juan (Cód. ${AGENTE_RETENCION.codJurisdiccion})`,
    marginX,
    currentY
  );

  // Derecha: Identificación del Certificado
  const rightColX = marginX + contentWidth;
  const certNumber = ret.retentionNumber || ret.numeroFormateado || fallbackNumber || 'RET-000000';

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(textSecondary[0], textSecondary[1], textSecondary[2]);
  doc.text('CERTIFICADO DE RETENCIÓN', rightColX, 16, { align: 'right' });

  doc.setFontSize(12.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(textPrimary[0], textPrimary[1], textPrimary[2]);
  doc.text(certNumber, rightColX, 22, { align: 'right' });

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(textSecondary[0], textSecondary[1], textSecondary[2]);
  doc.text(`Fecha de Emisión: ${formatDateAR(ret.date || ret.fecha)}`, rightColX, 27, {
    align: 'right'
  });

  // Línea divisoria limpia
  currentY = 34;
  doc.setDrawColor(borderLight[0], borderLight[1], borderLight[2]);
  doc.setLineWidth(0.3);
  doc.line(marginX, currentY, marginX + contentWidth, currentY);

  // --- 2. SECCIÓN: DATOS DEL SUJETO RETENIDO ---
  currentY += 5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(textSecondary[0], textSecondary[1], textSecondary[2]);
  doc.text('1. DATOS DEL SUJETO RETENIDO (PROVEEDOR)', marginX, currentY);

  currentY += 2.5;
  const cardHeight = 22;
  doc.setFillColor(bgLight[0], bgLight[1], bgLight[2]);
  doc.setDrawColor(borderLight[0], borderLight[1], borderLight[2]);
  doc.setLineWidth(0.3);
  doc.roundedRect(marginX, currentY, contentWidth, cardHeight, 1.5, 1.5, 'FD');

  const col2X = marginX + contentWidth * 0.58;
  const cardInnerY = currentY + 4.5;

  // Fila 1: Razón Social y CUIT
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(textSecondary[0], textSecondary[1], textSecondary[2]);
  doc.text('RAZÓN SOCIAL:', marginX + 3.5, cardInnerY);
  doc.text('C.U.I.T.:', col2X, cardInnerY);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(textPrimary[0], textPrimary[1], textPrimary[2]);
  const rsDisplay = (ret.razonSocial || 'NO ESPECIFICADO').substring(0, 48);
  doc.text(rsDisplay, marginX + 26, cardInnerY);
  doc.text(ret.cuit || 'NO ESPECIFICADO', col2X + 16, cardInnerY);

  // Fila 2: Domicilio e IIBB
  const cardRow2Y = cardInnerY + 5.5;
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(textSecondary[0], textSecondary[1], textSecondary[2]);
  doc.text('DOMICILIO:', marginX + 3.5, cardRow2Y);
  doc.text('N° IIBB:', col2X, cardRow2Y);

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(textPrimary[0], textPrimary[1], textPrimary[2]);
  doc.text((ret.domicilio || 'San Juan').substring(0, 52), marginX + 26, cardRow2Y);
  doc.text(ret.nroIIBB || 'Exento / No inf.', col2X + 16, cardRow2Y);

  // Fila 3: Régimen
  const cardRow3Y = cardRow2Y + 5.5;
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(textSecondary[0], textSecondary[1], textSecondary[2]);
  doc.text('RÉGIMEN:', marginX + 3.5, cardRow3Y);

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  const taxDesc =
    ret.taxType === 'CM' || ret.tipoImpuesto?.includes('Convenio')
      ? 'Convenio Multilateral (CM)'
      : 'IIBB Local (San Juan)';
  doc.setTextColor(textPrimary[0], textPrimary[1], textPrimary[2]);
  doc.text(taxDesc, marginX + 26, cardRow3Y);

  // --- 3. SECCIÓN: DETALLE DE LA RETENCIÓN (TABLA) ---
  currentY += cardHeight + 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(textSecondary[0], textSecondary[1], textSecondary[2]);
  doc.text('2. DETALLE DE LA RETENCIÓN PRACTICADA', marginX, currentY);

  currentY += 2.5;
  const tot = Number(ret.total) || Number(ret.importeRetenido) || 0;
  const baseNum = Number(ret.baseImponible) || 0;
  const aliNum = Number(ret.alicuota) || 0;

  const tableBody = [
    [
      ret.nroFactura || ret.facturaOrigen || 'Sin comprobante',
      formatDateAR(ret.date || ret.fecha),
      `Retención Imp. Ingresos Brutos (${taxDesc})`,
      formatCurrency(baseNum),
      `${aliNum.toFixed(2)} %`,
      formatCurrency(tot)
    ]
  ];

  autoTable(doc, {
    startY: currentY,
    margin: { left: marginX, right: marginX },
    theme: 'plain',
    head: [
      [
        'Comprobante Origen',
        'Fecha Compr.',
        'Concepto Gravado',
        'Base Imponible ($)',
        'Alícuota',
        'Importe Retenido ($)'
      ]
    ],
    body: tableBody,
    foot: [
      [
        {
          content: 'TOTAL RETENIDO A DEPOSITAR:',
          colSpan: 3,
          styles: { halign: 'right', fontStyle: 'bold', textColor: [15, 23, 42] }
        },
        {
          content: formatCurrency(baseNum),
          styles: { halign: 'right', fontStyle: 'bold', textColor: [71, 85, 105] }
        },
        { content: '' },
        {
          content: formatCurrency(tot),
          styles: { halign: 'right', fontStyle: 'bold', textColor: [15, 23, 42], fontSize: 9 }
        }
      ]
    ],
    styles: {
      fontSize: 7.5,
      cellPadding: { top: 3.2, bottom: 3.2, left: 2.5, right: 2.5 },
      textColor: [30, 41, 59],
      lineColor: [226, 232, 240],
      lineWidth: { bottom: 0.2 }
    },
    headStyles: {
      fillColor: [241, 245, 249],
      textColor: [51, 65, 85],
      fontStyle: 'bold',
      halign: 'left',
      lineWidth: { bottom: 0.3 },
      lineColor: [203, 213, 225]
    },
    footStyles: {
      fillColor: [248, 250, 252],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      lineWidth: { top: 0.3, bottom: 0.3 },
      lineColor: [203, 213, 225]
    },
    columnStyles: {
      0: { cellWidth: 36 },
      1: { cellWidth: 22, halign: 'center' },
      2: { cellWidth: 50 },
      3: { cellWidth: 26, halign: 'right' },
      4: { cellWidth: 16, halign: 'center' },
      5: { cellWidth: 28, halign: 'right', fontStyle: 'bold' }
    }
  });

  const lastAutoTable = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable;
  currentY = (lastAutoTable?.finalY ?? currentY + 24) + 4;

  // --- 4. SECCIÓN: IMPORTE EN LETRAS ---
  const calloutHeight = 8;
  doc.setFillColor(bgLight[0], bgLight[1], bgLight[2]);
  doc.setDrawColor(borderLight[0], borderLight[1], borderLight[2]);
  doc.setLineWidth(0.3);
  doc.roundedRect(marginX, currentY, contentWidth, calloutHeight, 1, 1, 'FD');

  // Borde lateral naranja
  doc.setFillColor(orangeAccent[0], orangeAccent[1], orangeAccent[2]);
  doc.rect(marginX, currentY, 1.8, calloutHeight, 'F');

  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(textSecondary[0], textSecondary[1], textSecondary[2]);
  doc.text('SON PESOS:', marginX + 4.5, currentY + 5.2);

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(textPrimary[0], textPrimary[1], textPrimary[2]);
  const letrasTxt = numeroALetras(tot);
  doc.text(letrasTxt, marginX + 24, currentY + 5.2);

  // --- 5. OBSERVACIONES (si existen) ---
  currentY += calloutHeight + 4;
  if (ret.observaciones && ret.observaciones.trim()) {
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(textSecondary[0], textSecondary[1], textSecondary[2]);
    doc.text('OBSERVACIONES:', marginX, currentY);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(textPrimary[0], textPrimary[1], textPrimary[2]);
    doc.text(ret.observaciones.substring(0, 150), marginX + 28, currentY);
    currentY += 4.5;
  }

  // --- 6. MARCO LEGAL Y SECCIÓN DE FIRMAS ---
  currentY = Math.max(currentY + 6, 175);

  const colLeftWidth = 96;
  const colRightX = marginX + colLeftWidth + 6;
  const colRightWidth = contentWidth - colLeftWidth - 6;
  const sectionBoxHeight = 52;

  // Columna Izquierda: Marco Legal DGR San Juan
  doc.setDrawColor(borderLight[0], borderLight[1], borderLight[2]);
  doc.setLineWidth(0.3);
  doc.line(marginX, currentY, marginX + colLeftWidth, currentY);

  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(textSecondary[0], textSecondary[1], textSecondary[2]);
  doc.text('CONSTANCIA Y MARCO LEGAL DGR SAN JUAN', marginX, currentY + 4.5);

  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(textSecondary[0], textSecondary[1], textSecondary[2]);
  const legalLines = [
    'El presente certificado se expide en cumplimiento del Régimen General de',
    'Retención del Impuesto sobre los Ingresos Brutos de la Dirección General de',
    'Rentas de la Provincia de San Juan (Código Tributario Ley Provincial N° 151-I,',
    'Resoluciones Generales reglamentarias DGR y normas de Convenio Multilateral).',
    '',
    'El importe retenido reviste el carácter de PAGO A CUENTA del tributo',
    'correspondiente al período fiscal en curso y será depositado e informado',
    'mediante la correspondiente declaración jurada mensual del Agente.'
  ];
  doc.text(legalLines, marginX, currentY + 10);

  // Columna Derecha: Firma y Sello del Agente
  doc.setFillColor(bgLight[0], bgLight[1], bgLight[2]);
  doc.setDrawColor(borderLight[0], borderLight[1], borderLight[2]);
  doc.setLineWidth(0.3);
  doc.roundedRect(colRightX, currentY, colRightWidth, sectionBoxHeight, 1.5, 1.5, 'FD');

  // Estampar firma si existe
  if (sigImg && sigImg.length > 50) {
    try {
      doc.addImage(sigImg, 'PNG', colRightX + 16, currentY + 5, 42, 22);
    } catch {
      // Ignorar si imagen inválida
    }
  }

  const signatureLineY = currentY + 36;
  doc.setDrawColor(textMuted[0], textMuted[1], textMuted[2]);
  doc.setLineWidth(0.3);
  doc.line(colRightX + 12, signatureLineY, colRightX + colRightWidth - 12, signatureLineY);

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(textPrimary[0], textPrimary[1], textPrimary[2]);
  doc.text('BAILAC ARGENTINA S.R.L.', colRightX + colRightWidth / 2, signatureLineY + 4.2, {
    align: 'center'
  });

  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(textSecondary[0], textSecondary[1], textSecondary[2]);
  doc.text('Firma y Sello del Agente de Retención', colRightX + colRightWidth / 2, signatureLineY + 7.8, {
    align: 'center'
  });
  doc.text('C.U.I.T. 30-71155040-9 · Agente N° 30711550409', colRightX + colRightWidth / 2, signatureLineY + 11.2, {
    align: 'center'
  });

  // --- 7. PIE DE PÁGINA ---
  const footerY = 280;
  doc.setDrawColor(borderLight[0], borderLight[1], borderLight[2]);
  doc.setLineWidth(0.2);
  doc.line(marginX, footerY - 3, marginX + contentWidth, footerY - 3);

  doc.setFontSize(6.5);
  doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
  doc.text(
    'ORIGINAL: PARA EL CONTRIBUYENTE RETENIDO   ·   DUPLICADO: ARCHIVO DEL AGENTE DE RETENCIÓN',
    marginX,
    footerY
  );
  doc.text(
    `Emitido el ${new Date().toLocaleDateString('es-AR')} · Sistema de Retenciones IIBB Bailac Argentina`,
    marginX + contentWidth,
    footerY,
    { align: 'right' }
  );
}

/**
 * Crea el PDF del comprobante, devuelve el base64 limpio (para adjuntar por correo)
 * y opcionalmente dispara la descarga local en el navegador.
 */
export function generateCertificatePdf(
  ret: RetentionRecord,
  sigImg: string,
  options?: { download?: boolean; fallbackNumber?: string }
): { pdfBase64: string; pdfFilename: string } {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  buildCertificateDoc(doc, ret, sigImg, options?.fallbackNumber);

  const certNumber = ret.retentionNumber || ret.numeroFormateado || options?.fallbackNumber || 'RET-000000';
  const pdfFilename = formatPdfFilename(certNumber, ret.razonSocial);

  // Extraer base64 puro antes o después de guardar
  const dataUri = doc.output('datauristring');
  const base64Index = dataUri.indexOf('base64,');
  const pdfBase64 = base64Index !== -1 ? dataUri.slice(base64Index + 7) : '';

  if (options?.download) {
    doc.save(pdfFilename);
  }

  return { pdfBase64, pdfFilename };
}

/**
 * Descarga un PDF guardado a partir de su base64 (sin regenerar el comprobante).
 */
export function downloadPdfFromBase64(pdfBase64: string, pdfFilename: string): void {
  const byteChars = atob(pdfBase64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    byteNumbers[i] = byteChars.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = pdfFilename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Genera y descarga un único PDF concatenando múltiples comprobantes.
 */
export function generateBatchPdf(
  retentions: RetentionRecord[],
  sigImg: string,
  fallbackNumber?: string
): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  retentions.forEach((ret, index) => {
    if (index > 0) doc.addPage();
    buildCertificateDoc(doc, ret, sigImg, fallbackNumber);
  });

  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  doc.save(`LOTE_RETENCIONES_BAILAC_SAN_JUAN_${dateStr}_(${retentions.length}_comprobantes).pdf`);
}
