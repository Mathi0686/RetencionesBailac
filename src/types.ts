export type TaxType = 'CM' | 'IIBB';

export type NumberPrefix = 'RET' | '001';

export type SheetSyncStatus = 'pending' | 'synced' | 'skipped' | 'error';

export type EmailSendStatus = 'pending' | 'sent' | 'skipped' | 'error';

export interface RetentionRecord {
  id: number;
  retentionNumber: string;
  numeroFormateado: string;
  date: string;
  fecha: string;
  razonSocial: string;
  cuit: string;
  nroIIBB: string;
  domicilio: string;
  taxType: TaxType;
  tipoImpuesto: string;
  nroFactura: string;
  facturaOrigen: string;
  baseImponible: number;
  alicuota: number;
  total: number;
  importeRetenido: number;
  observaciones: string;
  syncedWithSheets: boolean;
  sheetRow?: number | null;
  emailStatus?: EmailSendStatus;
  emailRecipients?: string[];
  emailError?: string;
  timestamp: string;
}

export interface SubjectRecord {
  razonSocial: string;
  cuit: string;
  nroIIBB: string;
  domicilio: string;
  taxType: TaxType;
  alicuota: number;
}

export interface LastGeneratedCert {
  retention: RetentionRecord;
  pdfBase64: string;
  pdfFilename: string;
  recipients: string[];
  sheetStatus: SheetSyncStatus;
  sheetError: string;
  sheetRow: number | null;
  emailStatus: EmailSendStatus;
  emailError: string;
  sentTo: string[];
  updatedAt: string;
}

export interface ToastNotification {
  message: string;
  type: 'success' | 'error' | 'info';
}

export interface AppsScriptPostResult {
  ok: boolean;
  status: 'success' | 'partial' | 'error';
  sheetSaved: boolean;
  sheetDuplicateSkipped?: boolean;
  sheetRow?: number | null;
  emailStatus: EmailSendStatus;
  emailMessage?: string;
  sentTo?: string[];
  invalidEmails?: string[];
  remainingQuota?: number | null;
  errorMessage?: string;
  isLegacyScript?: boolean;
}
