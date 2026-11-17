import { AppsScriptPostResult, RetentionRecord, SubjectRecord } from '../types';

function buildPayloadBase(retentionObj: RetentionRecord, fallbackNumber?: string) {
  return {
    retentionNumber: retentionObj.retentionNumber || retentionObj.numeroFormateado || fallbackNumber || '',
    date: retentionObj.date || retentionObj.fecha,
    razonSocial: retentionObj.razonSocial,
    cuit: retentionObj.cuit,
    nroIIBB: retentionObj.nroIIBB,
    domicilio: retentionObj.domicilio,
    taxType:
      retentionObj.taxType ||
      (retentionObj.tipoImpuesto?.includes('Convenio') ? 'CM' : 'IIBB'),
    nroFactura: retentionObj.nroFactura || retentionObj.facturaOrigen || '',
    baseImponible: Number(retentionObj.baseImponible) || 0,
    alicuota: Number(retentionObj.alicuota) || 0,
    total: Number(retentionObj.total) || Number(retentionObj.importeRetenido) || 0,
    observaciones: retentionObj.observaciones || ''
  };
}

async function postToAppsScript(
  googleSheetUrl: string,
  payload: Record<string, unknown>,
  expectEmailSupport: boolean
): Promise<AppsScriptPostResult> {
  if (!googleSheetUrl || !googleSheetUrl.startsWith('http')) {
    return {
      ok: false,
      status: 'error',
      sheetSaved: false,
      emailStatus: 'error',
      errorMessage: 'URL de Google Apps Script no configurada.'
    };
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 45000);

  try {
    // Se utiliza text/plain;charset=utf-8 sin mode:'no-cors' para evitar preflight OPTIONS
    // y poder leer la respuesta JSON real tras el redirect 302 de Apps Script.
    const res = await fetch(googleSheetUrl, {
      method: 'POST',
      redirect: 'follow',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    if (!res.ok) {
      return {
        ok: false,
        status: 'error',
        sheetSaved: false,
        emailStatus: expectEmailSupport ? 'error' : 'skipped',
        errorMessage: `El servidor de Apps Script respondió con código HTTP ${res.status}.`
      };
    }

    const text = await res.text();
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return {
        ok: false,
        status: 'error',
        sheetSaved: false,
        emailStatus: expectEmailSupport ? 'error' : 'skipped',
        errorMessage:
          'Apps Script devolvió una respuesta no válida (posiblemente HTML de autorización o error interno).'
      };
    }

    // Detectar si el Web App todavía ejecuta el Code.gs viejo (sin módulo de correo)
    if (expectEmailSupport && data.emailStatus === undefined) {
      const legacySheetSaved = data.status === 'success';
      return {
        ok: false,
        status: legacySheetSaved ? 'partial' : 'error',
        sheetSaved: legacySheetSaved,
        emailStatus: 'error',
        isLegacyScript: true,
        emailMessage:
          'El Apps Script desplegado aún corresponde a la versión anterior y no incluye el envío de correo. Actualizá Code.gs y publicá la nueva versión.',
        errorMessage:
          'El Apps Script desplegado no devolvió estado de envío de correo.'
      };
    }

    const status = (data.status as AppsScriptPostResult['status']) || 'error';
    const sheetSaved = Boolean(data.sheetSaved);
    const emailStatus = (data.emailStatus as AppsScriptPostResult['emailStatus']) || 'skipped';

    return {
      ok: status === 'success',
      status,
      sheetSaved,
      sheetDuplicateSkipped: Boolean(data.sheetDuplicateSkipped),
      sheetRow: typeof data.sheetRow === 'number' ? data.sheetRow : null,
      emailStatus,
      emailMessage: typeof data.emailMessage === 'string' ? data.emailMessage : '',
      sentTo: Array.isArray(data.sentTo) ? (data.sentTo as string[]) : [],
      invalidEmails: Array.isArray(data.invalidEmails) ? (data.invalidEmails as string[]) : [],
      remainingQuota: typeof data.remainingQuota === 'number' ? data.remainingQuota : null,
      errorMessage: typeof data.message === 'string' ? data.message : undefined
    };
  } catch (err) {
    const isAbort = err instanceof DOMException && err.name === 'AbortError';
    const isNetworkError = err instanceof TypeError;
    const message = isAbort
      ? 'Tiempo de espera agotado al conectar con Google Apps Script (45s).'
      : isNetworkError
      ? 'No se pudo conectar con Google Apps Script (red o CORS). Verificá tu conexión y que el Web App esté implementado con "Quién tiene acceso: Cualquier usuario".'
      : err instanceof Error
      ? `Error al contactar Apps Script: ${err.message}`
      : 'Error desconocido al conectar con Google Apps Script.';

    return {
      ok: false,
      status: 'error',
      sheetSaved: false,
      emailStatus: expectEmailSupport ? 'error' : 'skipped',
      errorMessage: message,
      emailMessage: message
    };
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function getJsonFromAppsScript<T>(url: string, timeoutMs = 20000): Promise<T> {
  if (!url || !url.startsWith('http')) {
    throw new Error('URL de Google Apps Script no configurada.');
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal
    });

    if (!res.ok) {
      throw new Error(`El servidor de Apps Script respondió con código HTTP ${res.status}.`);
    }

    const text = await res.text();
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(
        'Apps Script devolvió HTML en lugar de JSON. Verificá que la implementación tenga acceso "Cualquier usuario" y esté autorizada.'
      );
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('Tiempo de espera agotado al consultar Google Apps Script.');
    }
    if (err instanceof TypeError) {
      throw new Error(
        'No se pudo conectar con Google Apps Script (red o CORS). Verificá que la URL esté implementada con "Quién tiene acceso: Cualquier usuario".'
      );
    }
    throw err instanceof Error ? err : new Error('Error desconocido al consultar Google Apps Script.');
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function emitRetentionToAppsScript(params: {
  googleSheetUrl: string;
  retention: RetentionRecord;
  saveToSheet: boolean;
  sendEmail: boolean;
  recipients: string[];
  pdfBase64: string;
  pdfFilename: string;
  fallbackNumber?: string;
}): Promise<AppsScriptPostResult> {
  const {
    googleSheetUrl,
    retention,
    saveToSheet,
    sendEmail,
    recipients,
    pdfBase64,
    pdfFilename,
    fallbackNumber
  } = params;

  if (!saveToSheet && !sendEmail) {
    return {
      ok: true,
      status: 'success',
      sheetSaved: false,
      emailStatus: 'skipped'
    };
  }

  // Verificar tamaño razonable del PDF antes de enviar (límite seguro 15 MB base64)
  if (sendEmail && pdfBase64.length > 15 * 1024 * 1024) {
    return {
      ok: false,
      status: 'error',
      sheetSaved: false,
      emailStatus: 'error',
      emailMessage: 'El archivo PDF supera el tamaño máximo recomendado para envío por Apps Script.',
      errorMessage: 'El archivo PDF es demasiado pesado para adjuntar.'
    };
  }

  let action: 'emit_and_email' | 'sheet_only' | 'email_only' = 'emit_and_email';
  if (saveToSheet && !sendEmail) action = 'sheet_only';
  if (!saveToSheet && sendEmail) action = 'email_only';

  const payload = {
    ...buildPayloadBase(retention, fallbackNumber),
    action,
    sendEmail,
    recipients: sendEmail ? recipients : [],
    pdfBase64: sendEmail ? pdfBase64 : '',
    pdfFilename: sendEmail ? pdfFilename : ''
  };

  return postToAppsScript(googleSheetUrl, payload, sendEmail);
}

export async function retryEmailOnlyToAppsScript(params: {
  googleSheetUrl: string;
  retention: RetentionRecord;
  recipients: string[];
  pdfBase64: string;
  pdfFilename: string;
  fallbackNumber?: string;
}): Promise<AppsScriptPostResult> {
  const { googleSheetUrl, retention, recipients, pdfBase64, pdfFilename, fallbackNumber } = params;

  const payload = {
    ...buildPayloadBase(retention, fallbackNumber),
    action: 'email_only',
    sendEmail: true,
    recipients,
    pdfBase64,
    pdfFilename
  };

  return postToAppsScript(googleSheetUrl, payload, true);
}

export async function registerSheetOnlyToAppsScript(
  googleSheetUrl: string,
  retention: RetentionRecord,
  fallbackNumber?: string
): Promise<AppsScriptPostResult> {
  const payload = {
    ...buildPayloadBase(retention, fallbackNumber),
    action: 'sheet_only',
    sendEmail: false
  };
  return postToAppsScript(googleSheetUrl, payload, false);
}

export async function syncSubjectsFromSheet(googleSheetUrl: string): Promise<SubjectRecord[]> {
  if (!googleSheetUrl || !googleSheetUrl.startsWith('http')) {
    throw new Error('URL de Google Apps Script no configurada.');
  }
  const sep = googleSheetUrl.includes('?') ? '&' : '?';
  const url = `${googleSheetUrl}${sep}_t=${Date.now()}`;
  const data = await getJsonFromAppsScript<{ subjects?: SubjectRecord[]; error?: string }>(url);
  if (data.error) throw new Error(data.error);
  return Array.isArray(data.subjects) ? data.subjects : [];
}

export async function fetchRowFromSheet(
  googleSheetUrl: string,
  rowNum: number
): Promise<RetentionRecord> {
  if (!googleSheetUrl || !googleSheetUrl.startsWith('http')) {
    throw new Error('URL de Google Apps Script no configurada.');
  }
  const sep = googleSheetUrl.includes('?') ? '&' : '?';
  const url = `${googleSheetUrl}${sep}row=${rowNum}&_t=${Date.now()}`;
  const data = await getJsonFromAppsScript<{
    status?: string;
    retention?: Record<string, unknown>;
    error?: string;
  }>(url);
  if (data.status !== 'success' || !data.retention) {
    throw new Error(data.error || 'Fila sin datos o vacía en la planilla');
  }

  const ret = data.retention;
  const retentionNumber = String(ret.retentionNumber || '');
  const numericId = parseInt(retentionNumber.replace(/[^0-9]/g, ''), 10) || Date.now();
  const isoDate = ret.date
    ? new Date(String(ret.date)).toISOString().split('T')[0]
    : new Date().toISOString().split('T')[0];
  const taxType = ret.taxType === 'IIBB' ? 'IIBB' : 'CM';

  return {
    id: numericId,
    retentionNumber,
    numeroFormateado: retentionNumber,
    date: isoDate,
    fecha: isoDate,
    cuit: String(ret.cuit || ''),
    razonSocial: String(ret.razonSocial || ''),
    nroIIBB: String(ret.nroIIBB || ''),
    domicilio: String(ret.domicilio || ''),
    taxType,
    tipoImpuesto: taxType === 'IIBB' ? 'IIBB Local (San Juan)' : 'Convenio Multilateral (CM)',
    nroFactura: String(ret.nroFactura || ''),
    facturaOrigen: String(ret.nroFactura || ''),
    baseImponible: Number(ret.baseImponible) || 0,
    alicuota: Number(ret.alicuota) || 0,
    total: Number(ret.total) || 0,
    importeRetenido: Number(ret.total) || 0,
    observaciones: String(ret.observaciones || ''),
    syncedWithSheets: true,
    sheetRow: rowNum,
    timestamp: new Date().toISOString()
  };
}

export async function fetchRecentRowsFromSheets(
  googleSheetUrl: string,
  currentNextId: number
): Promise<{
  subjects: SubjectRecord[];
  retentions: RetentionRecord[];
  lastGoodRow: number;
  nextCorrelative: number;
}> {
  const subjects = await syncSubjectsFromSheet(googleSheetUrl);
  const sep = googleSheetUrl.includes('?') ? '&' : '?';

  let low = 100;
  let high = 250;
  let lastGoodRow = 135;

  const checkRow = async (r: number): Promise<boolean> => {
    try {
      const data = await getJsonFromAppsScript<{
        status?: string;
        retention?: { razonSocial?: string };
      }>(`${googleSheetUrl}${sep}row=${r}&_t=${Date.now()}`, 12000);
      return Boolean(data.status === 'success' && data.retention && data.retention.razonSocial);
    } catch {
      return false;
    }
  };

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const ok = await checkRow(mid);
    if (ok) {
      lastGoodRow = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const rowPromises: Promise<{ row: number; retention: RetentionRecord } | null>[] = [];
  for (let r = lastGoodRow; r >= Math.max(2, lastGoodRow - 4); r--) {
    rowPromises.push(
      fetchRowFromSheet(googleSheetUrl, r)
        .then((retention) => ({ row: r, retention }))
        .catch(() => null)
    );
  }

  const results = await Promise.all(rowPromises);
  const retentions: RetentionRecord[] = [];
  let maxFoundId = currentNextId;

  for (const item of results) {
    if (!item) continue;
    const numParsed = parseInt(String(item.retention.retentionNumber).replace(/[^0-9]/g, ''), 10);
    if (!isNaN(numParsed) && numParsed > maxFoundId) {
      maxFoundId = numParsed;
    }
    retentions.push(item.retention);
  }

  return {
    subjects,
    retentions,
    lastGoodRow,
    nextCorrelative: retentions.length > 0 ? maxFoundId + 1 : currentNextId
  };
}
