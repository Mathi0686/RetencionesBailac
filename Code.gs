/**
 * ============================================================================
 * GOOGLE APPS SCRIPT - SISTEMA DE RETENCIONES IIBB / CM (BAILAC ARGENTINA)
 * Versión 2.0: Registro en Google Sheets + Envío de Comprobante PDF por Email
 * ============================================================================
 *
 * IMPORTANTE:
 * Al actualizar este código en script.google.com, debes crear una NUEVA versión
 * en "Implementar -> Gestionar implementaciones" y autorizar el nuevo permiso
 * de envío de correos electrónicos (MailApp).
 */

var EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Valida y normaliza una lista de correos electrónicos.
 * Devuelve { valid: string[], invalid: string[] } sin duplicados.
 */
function parseAndValidateRecipients_(rawRecipients) {
  var valid = [];
  var invalid = [];
  var seen = {};

  if (!Array.isArray(rawRecipients)) {
    return { valid: valid, invalid: invalid };
  }

  for (var i = 0; i < rawRecipients.length; i++) {
    var raw = String(rawRecipients[i] || '').trim().toLowerCase();
    if (!raw) continue;
    if (seen[raw]) continue;
    seen[raw] = true;

    if (EMAIL_REGEX.test(raw)) {
      valid.push(raw);
    } else {
      invalid.push(raw);
    }
  }

  return { valid: valid, invalid: invalid };
}

/**
 * Formatea fecha ISO (YYYY-MM-DD) o Date a DD/MM/AAAA para el cuerpo del correo.
 */
function formatDateAR_(dateValue) {
  try {
    if (!dateValue) return '';
    if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dateValue)) {
      var parts = dateValue.slice(0, 10).split('-');
      return parts[2] + '/' + parts[1] + '/' + parts[0];
    }
    var d = new Date(dateValue);
    if (isNaN(d.getTime())) return String(dateValue);
    return Utilities.formatDate(d, Session.getScriptTimeZone() || 'America/Argentina/San_Juan', 'dd/MM/yyyy');
  } catch (e) {
    return String(dateValue || '');
  }
}

/**
 * Formatea un número como moneda ARS ($ 1.234,56).
 */
function formatCurrencyARS_(amount) {
  var num = Number(amount) || 0;
  var fixed = num.toFixed(2);
  var parts = fixed.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return '$ ' + parts[0] + ',' + parts[1];
}

/**
 * Escapa caracteres HTML para evitar inyección en el cuerpo del correo.
 */
function escapeHtml_(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Verifica si el número de retención ya fue registrado recientemente en la Columna A
 * para evitar filas duplicadas en caso de reintentos.
 */
function findExistingRetentionRow_(sheet, retentionNumber) {
  var target = String(retentionNumber || '').trim();
  if (!target) return -1;

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;

  // Revisamos hasta las últimas 100 filas para mantener velocidad óptima
  var startRow = Math.max(2, lastRow - 99);
  var numRows = lastRow - startRow + 1;
  var values = sheet.getRange(startRow, 1, numRows, 1).getValues();

  for (var i = values.length - 1; i >= 0; i--) {
    if (String(values[i][0] || '').trim() === target) {
      return startRow + i;
    }
  }
  return -1;
}

/**
 * Envía el comprobante PDF adjunto usando MailApp.
 */
function sendRetentionEmail_(data, pdfBase64, pdfFilename, validRecipients, invalidRecipients) {
  if (!validRecipients || validRecipients.length === 0) {
    return {
      emailStatus: 'error',
      emailMessage: invalidRecipients.length > 0
        ? 'Ninguno de los correos ingresados tiene un formato válido: ' + invalidRecipients.join(', ')
        : 'No se proporcionaron destinatarios válidos para el envío.',
      sentTo: [],
      invalidEmails: invalidRecipients || [],
      remainingQuota: MailApp.getRemainingDailyQuota()
    };
  }

  if (!pdfBase64 || typeof pdfBase64 !== 'string') {
    return {
      emailStatus: 'error',
      emailMessage: 'No se recibió el archivo PDF en base64 para adjuntar.',
      sentTo: [],
      invalidEmails: invalidRecipients || [],
      remainingQuota: MailApp.getRemainingDailyQuota()
    };
  }

  var quota = MailApp.getRemainingDailyQuota();
  if (quota < validRecipients.length) {
    return {
      emailStatus: 'error',
      emailMessage: 'Cuota diaria de envío de Google Apps Script insuficiente. Restante hoy: ' + quota + ', requeridos: ' + validRecipients.length + '.',
      sentTo: [],
      invalidEmails: invalidRecipients || [],
      remainingQuota: quota
    };
  }

  // Limpiar prefijo data URI si viniera incluido
  var cleanBase64 = pdfBase64.replace(/^data:application\/pdf;[^,]*base64,/i, '').trim();
  var pdfBytes = Utilities.base64Decode(cleanBase64);
  var safeFilename = String(pdfFilename || ('Comprobante_' + (data.retentionNumber || 'RET') + '.pdf'))
    .replace(/[^a-zA-Z0-9._-]/g, '_');

  var pdfBlob = Utilities.newBlob(pdfBytes, 'application/pdf', safeFilename);

  var retNum = String(data.retentionNumber || 'S/N');
  var razonSocial = String(data.razonSocial || 'Proveedor');
  var cuit = String(data.cuit || 'No informado');
  var fecha = formatDateAR_(data.date);
  var nroFactura = String(data.nroFactura || 'N/A');
  var regimen = data.taxType === 'IIBB' ? 'IIBB Local (San Juan)' : 'Convenio Multilateral (CM)';
  var baseFmt = formatCurrencyARS_(data.baseImponible);
  var alicuotaFmt = (Number(data.alicuota) || 0).toFixed(2) + '%';
  var totalFmt = formatCurrencyARS_(data.total);
  var obs = String(data.observaciones || '').trim();

  var subject = 'Certificado de Retención ' + retNum + ' - ' + razonSocial + ' | BAILAC ARGENTINA S.R.L.';

  var plainBody = [
    'BAILAC ARGENTINA S.R.L. - Agente de Retención DGR San Juan',
    'CUIT: 30-71155040-9 | Av. Benavidez 950 Este - San Juan',
    '------------------------------------------------------------',
    '',
    'Se adjunta en formato PDF el Certificado de Retención correspondiente:',
    '',
    '• N° de Certificado: ' + retNum,
    '• Fecha de Emisión: ' + fecha,
    '• Sujeto Retenido: ' + razonSocial,
    '• C.U.I.T.: ' + cuit,
    '• Régimen: ' + regimen,
    '• Comprobante Origen: ' + nroFactura,
    '• Base Imponible: ' + baseFmt,
    '• Alícuota Aplicada: ' + alicuotaFmt,
    '• Total Retenido: ' + totalFmt,
    obs ? ('• Observaciones: ' + obs) : '',
    '',
    'Este correo fue generado automáticamente por el Sistema de Emisión de Retenciones de Bailac Argentina S.R.L.'
  ].filter(Boolean).join('\n');

  var htmlBody = ''
    + '<div style="font-family:Arial,Helvetica,sans-serif;max-width:620px;margin:0 auto;color:#1e293b;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">'
    + '  <div style="background:#0f172a;padding:18px 24px;border-bottom:4px solid #FF5100;color:#ffffff;">'
    + '    <div style="font-size:18px;font-weight:bold;letter-spacing:0.5px;">BAILAC ARGENTINA S.R.L.</div>'
    + '    <div style="font-size:12px;color:#cbd5e1;margin-top:3px;">Agente de Retención Ingresos Brutos · DGR San Juan · CUIT 30-71155040-9</div>'
    + '  </div>'
    + '  <div style="padding:22px 24px;background:#ffffff;">'
    + '    <p style="margin:0 0 14px 0;font-size:14px;color:#334155;">Estimado/a, adjuntamos en este correo el <strong>Certificado de Retención en formato PDF</strong> con el siguiente detalle:</p>'
    + '    <table style="width:100%;border-collapse:collapse;font-size:13px;background:#f8fafc;border:1px solid #e2e8f0;">'
    + '      <tr><td style="padding:8px 12px;color:#64748b;border-bottom:1px solid #e2e8f0;width:42%;"><strong>N° de Certificado</strong></td><td style="padding:8px 12px;font-weight:bold;color:#0f172a;border-bottom:1px solid #e2e8f0;">' + escapeHtml_(retNum) + '</td></tr>'
    + '      <tr><td style="padding:8px 12px;color:#64748b;border-bottom:1px solid #e2e8f0;"><strong>Fecha de Emisión</strong></td><td style="padding:8px 12px;color:#0f172a;border-bottom:1px solid #e2e8f0;">' + escapeHtml_(fecha) + '</td></tr>'
    + '      <tr><td style="padding:8px 12px;color:#64748b;border-bottom:1px solid #e2e8f0;"><strong>Sujeto Retenido</strong></td><td style="padding:8px 12px;font-weight:bold;color:#0f172a;border-bottom:1px solid #e2e8f0;">' + escapeHtml_(razonSocial) + '</td></tr>'
    + '      <tr><td style="padding:8px 12px;color:#64748b;border-bottom:1px solid #e2e8f0;"><strong>C.U.I.T.</strong></td><td style="padding:8px 12px;color:#0f172a;border-bottom:1px solid #e2e8f0;">' + escapeHtml_(cuit) + '</td></tr>'
    + '      <tr><td style="padding:8px 12px;color:#64748b;border-bottom:1px solid #e2e8f0;"><strong>Régimen</strong></td><td style="padding:8px 12px;color:#0f172a;border-bottom:1px solid #e2e8f0;">' + escapeHtml_(regimen) + '</td></tr>'
    + '      <tr><td style="padding:8px 12px;color:#64748b;border-bottom:1px solid #e2e8f0;"><strong>Factura / Origen</strong></td><td style="padding:8px 12px;color:#0f172a;border-bottom:1px solid #e2e8f0;">' + escapeHtml_(nroFactura) + '</td></tr>'
    + '      <tr><td style="padding:8px 12px;color:#64748b;border-bottom:1px solid #e2e8f0;"><strong>Base Imponible</strong></td><td style="padding:8px 12px;color:#0f172a;border-bottom:1px solid #e2e8f0;">' + escapeHtml_(baseFmt) + ' (' + escapeHtml_(alicuotaFmt) + ')</td></tr>'
    + '      <tr style="background:#fff5f0;"><td style="padding:10px 12px;color:#bd3400;"><strong>Total Retenido</strong></td><td style="padding:10px 12px;font-size:15px;font-weight:bold;color:#FF5100;">' + escapeHtml_(totalFmt) + '</td></tr>'
    + '    </table>'
    + (obs ? '<p style="margin:12px 0 0 0;font-size:12px;color:#475569;"><strong>Observaciones:</strong> ' + escapeHtml_(obs) + '</p>' : '')
    + '    <p style="margin:18px 0 0 0;font-size:12px;color:#64748b;">Archivo adjunto: <strong>' + escapeHtml_(safeFilename) + '</strong></p>'
    + '  </div>'
    + '  <div style="background:#f1f5f9;padding:12px 24px;font-size:11px;color:#64748b;text-align:center;">'
    + '    BAILAC ARGENTINA S.R.L. · Av. Benavidez 950 Este - San Juan · Emisión Automática'
    + '  </div>'
    + '</div>';

  MailApp.sendEmail({
    to: validRecipients.join(','),
    subject: subject,
    body: plainBody,
    htmlBody: htmlBody,
    name: 'Bailac Argentina S.R.L. - Retenciones',
    attachments: [pdfBlob]
  });

  return {
    emailStatus: 'sent',
    emailMessage: 'Correo enviado correctamente a ' + validRecipients.length + ' destinatario(s).',
    sentTo: validRecipients,
    invalidEmails: invalidRecipients || [],
    remainingQuota: MailApp.getRemainingDailyQuota()
  };
}

/**
 * Función para GUARDAR datos en Sheets y/o ENVIAR PDF por correo (POST)
 * Soporta:
 * - action: "emit_and_email" (registra en Sheets evitando duplicados + envía mail)
 * - action: "sheet_only" (solo registra en Sheets, compatible con versión anterior)
 * - action: "email_only" (solo envía mail con el PDF adjunto, SIN tocar la planilla)
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error("No se recibieron datos en la solicitud POST.");
    }

    var data = JSON.parse(e.postData.contents);
    var action = data.action || (data.sendEmail ? 'emit_and_email' : 'sheet_only');

    var result = {
      status: 'success',
      action: action,
      sheetSaved: false,
      sheetDuplicateSkipped: false,
      sheetRow: null,
      emailStatus: 'skipped',
      emailMessage: '',
      sentTo: [],
      invalidEmails: [],
      remainingQuota: null
    };

    // 1. REGISTRO EN GOOGLE SHEETS (solo si no es email_only)
    if (action !== 'email_only') {
      var lock = LockService.getScriptLock();
      lock.waitLock(10000);
      try {
        var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
        var existingRow = findExistingRetentionRow_(sheet, data.retentionNumber);

        if (existingRow !== -1) {
          // Idempotencia: ya existe este número de retención, no duplicar fila
          result.sheetSaved = true;
          result.sheetDuplicateSkipped = true;
          result.sheetRow = existingRow;
        } else {
          var fechaFormateada = new Date(data.date);
          if (isNaN(fechaFormateada.getTime())) {
            fechaFormateada = new Date();
          }

          // Agregamos fila con los 12 campos exactos definidos originalmente
          sheet.appendRow([
            data.retentionNumber, // Col A (0)
            fechaFormateada,      // Col B (1)
            data.razonSocial,     // Col C (2)
            data.cuit,            // Col D (3)
            data.nroIIBB,         // Col E (4)
            data.domicilio,       // Col F (5)
            data.taxType,         // Col G (6)
            data.nroFactura,      // Col H (7)
            data.baseImponible,   // Col I (8)
            data.alicuota,        // Col J (9)
            data.total,           // Col K (10)
            data.observaciones    // Col L (11)
          ]);

          result.sheetSaved = true;
          result.sheetRow = sheet.getLastRow();
        }
      } finally {
        lock.releaseLock();
      }
    }

    // 2. ENVÍO DE CORREO CON PDF ADJUNTO (si corresponde)
    var shouldSendEmail = action === 'email_only' || (action === 'emit_and_email' && data.sendEmail !== false);
    if (shouldSendEmail) {
      try {
        var parsedRecipients = parseAndValidateRecipients_(data.recipients);
        var emailRes = sendRetentionEmail_(
          data,
          data.pdfBase64,
          data.pdfFilename,
          parsedRecipients.valid,
          parsedRecipients.invalid
        );

        result.emailStatus = emailRes.emailStatus;
        result.emailMessage = emailRes.emailMessage;
        result.sentTo = emailRes.sentTo;
        result.invalidEmails = emailRes.invalidEmails;
        result.remainingQuota = emailRes.remainingQuota;

        if (emailRes.emailStatus === 'error') {
          result.status = action === 'email_only' ? 'error' : 'partial';
          if (action === 'email_only') {
            result.message = emailRes.emailMessage;
          }
        }
      } catch (mailErr) {
        result.emailStatus = 'error';
        result.emailMessage = 'Error al enviar correo: ' + mailErr.toString();
        result.status = action === 'email_only' ? 'error' : 'partial';
        if (action === 'email_only') {
          result.message = result.emailMessage;
        }
      }
    }

    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Función para LEER datos (GET)
 * Sirve para sincronizar sujetos y para REIMPRIMIR por número de fila
 */
function doGet(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

    // CASO 1: RECUPERAR COMPROBANTE POR FILA
    if (e && e.parameter && e.parameter.row) {
      var rowNum = parseInt(e.parameter.row, 10);
      // Obtenemos los datos de la fila (de la columna A a la L, que son 12 columnas)
      var rowData = sheet.getRange(rowNum, 1, 1, 12).getValues()[0];

      if (!rowData[0]) throw new Error("La fila está vacía");

      var retention = {
        retentionNumber: rowData[0],
        date: rowData[1],
        razonSocial: rowData[2],
        cuit: rowData[3].toString(),
        nroIIBB: rowData[4].toString(),
        domicilio: rowData[5].toString(),
        taxType: rowData[6] || 'CM',
        nroFactura: rowData[7].toString(),
        baseImponible: parseFloat(rowData[8]) || 0,
        alicuota: parseFloat(rowData[9]) || 0,
        total: parseFloat(rowData[10]) || 0,
        observaciones: rowData[11] || '',
        id: Date.now(), // ID temporal para la App
        synced: true
      };

      return ContentService.createTextOutput(JSON.stringify({ "status": "success", "retention": retention }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // CASO 2: SINCRONIZAR SUJETOS (Comportamiento actual)
    var rows = sheet.getDataRange().getValues();
    var subjects = {};

    for (var i = 1; i < rows.length; i++) {
      var razonSocial = rows[i][2]; // Columna C
      var cuit = rows[i][3];        // Columna D
      var nroIIBB = rows[i][4];     // Columna E
      var domicilio = rows[i][5];   // Columna F
      var taxType = rows[i][6];     // Columna G
      var alicuota = rows[i][9];    // Columna J (Alícuota)

      if (razonSocial) {
        subjects[razonSocial] = {
          razonSocial: razonSocial,
          cuit: cuit.toString(),
          nroIIBB: nroIIBB.toString(),
          domicilio: domicilio.toString(),
          taxType: taxType || 'CM',
          alicuota: parseFloat(alicuota) || 0
        };
      }
    }

    var result = Object.keys(subjects).map(function(key) { return subjects[key]; });

    return ContentService.createTextOutput(JSON.stringify({ "subjects": result }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ "error": err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
