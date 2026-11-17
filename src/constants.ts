import { RetentionRecord } from './types';

// --- CONFIGURACIÓN POR DEFECTO OFICIAL BAILAC ---
export const DEFAULT_APPSCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbxDHsO5EmmNlkd2yCFe6Nlosh1FSLtzgGoIFXB3eqiSZWDk4opoKm4aknassc0RAuJ-/exec';

export const DEFAULT_SPREADSHEET_URL =
  'https://docs.google.com/spreadsheets/d/1nRw7JGYRhUYvjw2gX_OW8cZ9FjVfFeqkCdlEu9rVWvk/edit?gid=0#gid=0';

export const ACCESS_PASSWORD = 'retenciones27bailac';

// --- DESTINATARIOS POR DEFECTO (FIJOS) ---
export const DEFAULT_EMAIL_RECIPIENTS: readonly string[] = [
  'emanuel.mercado@bailac.com.ar',
  'mathias.zamora@bailac.com.ar'
];

// --- DATOS INSTITUCIONALES DEL AGENTE DE RETENCIÓN ---
export const AGENTE_RETENCION = {
  razonSocial: 'BAILAC ARGENTINA S.R.L.',
  cuit: '30-71155040-9',
  nroIIBB: '30711550409',
  domicilio: 'Av. Benavidez 950 Este - San Juan',
  jurisdiccion: 'San Juan (Régimen General DGR Res. Gral. / Convenio Multilateral)',
  condicionIva: 'IVA Responsable Inscripto',
  codJurisdiccion: '918', // San Juan
  puntoVenta: '001'
};

// --- RETENCIONES RECIENTES INICIALES ---
export const INITIAL_RECENT_RETENTIONS: RetentionRecord[] = [
  {
    id: 2948,
    retentionNumber: 'RET-002948',
    numeroFormateado: 'RET-002948',
    date: '2026-10-20',
    fecha: '2026-10-20',
    razonSocial: 'Maquinarias e Insumos Andinos S.A.',
    cuit: '30-70986099-9',
    nroIIBB: '902-455273-5',
    domicilio: 'Acceso Sur - Rawson - San Juan',
    taxType: 'CM',
    tipoImpuesto: 'Convenio Multilateral (CM)',
    nroFactura: '20129',
    facturaOrigen: '20129',
    baseImponible: 2348400,
    alicuota: 1.0,
    total: 23484,
    importeRetenido: 23484,
    observaciones: 'es el 50% del neto por el 1%',
    syncedWithSheets: true,
    sheetRow: 135,
    timestamp: '2026-10-20T13:59:05.000Z'
  },
  {
    id: 2947,
    retentionNumber: 'RET-002947',
    numeroFormateado: 'RET-002947',
    date: '2026-10-18',
    fecha: '2026-10-18',
    razonSocial: 'Manuel Robles',
    cuit: '20-08563260-5',
    nroIIBB: '000-075181-1',
    domicilio: '9 de Julio 1099 (E)',
    taxType: 'IIBB',
    tipoImpuesto: 'IIBB Local (San Juan)',
    nroFactura: '114',
    facturaOrigen: '114',
    baseImponible: 325915.67,
    alicuota: 3.0,
    total: 9777.47,
    importeRetenido: 9777.47,
    observaciones: '',
    syncedWithSheets: true,
    sheetRow: 134,
    timestamp: '2026-10-18T10:00:00.000Z'
  },
  {
    id: 2946,
    retentionNumber: 'RET-002946',
    numeroFormateado: 'RET-002946',
    date: '2026-10-15',
    fecha: '2026-10-15',
    razonSocial: 'BUSTIN SAN JUAN S.A.',
    cuit: '30-71733863-0',
    nroIIBB: '918-3071733860',
    domicilio: 'San Fco del Monte 614 oeste. San Juan',
    taxType: 'CM',
    tipoImpuesto: 'Convenio Multilateral (CM)',
    nroFactura: '1238',
    facturaOrigen: '1238',
    baseImponible: 303025.33,
    alicuota: 3.0,
    total: 9090.76,
    importeRetenido: 9090.76,
    observaciones: '',
    syncedWithSheets: true,
    sheetRow: 133,
    timestamp: '2026-10-15T10:00:00.000Z'
  },
  {
    id: 2945,
    retentionNumber: 'RET-002945',
    numeroFormateado: 'RET-002945',
    date: '2026-10-12',
    fecha: '2026-10-12',
    razonSocial: 'Organización de Servicios Directos Empresarios',
    cuit: '30-54674125-3',
    nroIIBB: '901-470313-0',
    domicilio: 'General Paz 279 (O)',
    taxType: 'IIBB',
    tipoImpuesto: 'IIBB Local (San Juan)',
    nroFactura: '892',
    facturaOrigen: '892',
    baseImponible: 1487361.67,
    alicuota: 3.0,
    total: 44620.85,
    importeRetenido: 44620.85,
    observaciones: '',
    syncedWithSheets: true,
    sheetRow: 132,
    timestamp: '2026-10-12T10:00:00.000Z'
  },
  {
    id: 2944,
    retentionNumber: 'RET-002944',
    numeroFormateado: 'RET-002944',
    date: '2026-10-10',
    fecha: '2026-10-10',
    razonSocial: 'MALVAR MANTENIMIENTO INTEGRAL SRL',
    cuit: '30-71056446-5',
    nroIIBB: '000-102512-6',
    domicilio: 'San Roque, 1. Tudcum, San Juan',
    taxType: 'IIBB',
    tipoImpuesto: 'IIBB Local (San Juan)',
    nroFactura: '551',
    facturaOrigen: '551',
    baseImponible: 6826500,
    alicuota: 2.5,
    total: 170662.5,
    importeRetenido: 170662.5,
    observaciones: '',
    syncedWithSheets: true,
    sheetRow: 131,
    timestamp: '2026-10-10T10:00:00.000Z'
  }
];
