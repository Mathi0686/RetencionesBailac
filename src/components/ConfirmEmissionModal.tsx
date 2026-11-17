import React, { useState } from 'react';
import { EmailSendStatus, RetentionRecord, SheetSyncStatus } from '../types';
import { formatCurrency, formatDateAR, isValidEmail, normalizeEmail } from '../utils/formatters';

interface ConfirmEmissionModalProps {
  isOpen: boolean;
  mode: 'emit' | 'resend';
  step: 'confirm' | 'processing' | 'result';
  retention: RetentionRecord;
  pdfFilename: string;
  saveToSheet: boolean;
  sendEmail: boolean;
  recipients: string[];
  sheetStatus: SheetSyncStatus;
  sheetError: string;
  sheetRow?: number | null;
  emailStatus: EmailSendStatus;
  emailError: string;
  sentTo: string[];
  remainingQuota?: number | null;
  onCancel: () => void;
  onConfirmEmit: () => void;
  onRetryEmailOnly: (updatedRecipients: string[]) => void;
  onRetrySheetOnly: () => void;
  onDownloadPdfAgain: () => void;
}

export const ConfirmEmissionModal: React.FC<ConfirmEmissionModalProps> = ({
  isOpen,
  mode,
  step,
  retention,
  pdfFilename,
  saveToSheet,
  sendEmail,
  recipients,
  sheetStatus,
  sheetError,
  sheetRow,
  emailStatus,
  emailError,
  sentTo,
  remainingQuota,
  onCancel,
  onConfirmEmit,
  onRetryEmailOnly,
  onRetrySheetOnly,
  onDownloadPdfAgain
}) => {
  const [retryRecipients, setRetryRecipients] = useState<string[]>(recipients);
  const [quickEmail, setQuickEmail] = useState('');
  const [quickError, setQuickError] = useState('');

  // Sincronizar lista cuando cambia el modal o los destinatarios externos
  React.useEffect(() => {
    setRetryRecipients(recipients);
    setQuickEmail('');
    setQuickError('');
  }, [recipients, isOpen, retention.retentionNumber]);

  if (!isOpen) return null;

  const isWorking = step === 'processing';
  const showRecipientEditor =
    (mode === 'resend' && step === 'confirm') ||
    (step === 'result' && emailStatus === 'error');

  const activeRecipients = showRecipientEditor ? retryRecipients : recipients;

  const handleAddQuickEmail = () => {
    const cleaned = normalizeEmail(quickEmail);
    if (!cleaned) {
      setQuickError('Ingresá un correo.');
      return;
    }
    if (!isValidEmail(cleaned)) {
      setQuickError('Formato de correo inválido.');
      return;
    }
    if (retryRecipients.includes(cleaned)) {
      setQuickError('Ese correo ya está en la lista.');
      return;
    }
    setRetryRecipients((prev) => [...prev, cleaned]);
    setQuickEmail('');
    setQuickError('');
  };

  const handleRemoveQuickEmail = (target: string) => {
    setRetryRecipients((prev) => prev.filter((e) => e !== target));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden border border-slate-200 max-h-[92vh] flex flex-col">
        {/* Encabezado */}
        <div className="bg-slate-900 px-6 py-4 text-white border-b-4 border-bailac flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-bailac flex items-center justify-center text-white shadow-md">
              <i className={`fa-solid ${mode === 'resend' ? 'fa-paper-plane' : 'fa-file-circle-check'}`}></i>
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">
                {mode === 'resend'
                  ? 'Enviar Comprobante por Correo'
                  : step === 'confirm'
                  ? 'Confirmar Emisión y Envío'
                  : step === 'processing'
                  ? 'Procesando Comprobante...'
                  : 'Resultado de la Operación'}
              </h3>
              <p className="text-[11px] text-slate-300 font-mono">
                {retention.retentionNumber} · {retention.razonSocial}
              </p>
            </div>
          </div>

          {!isWorking && (
            <button
              type="button"
              onClick={onCancel}
              className="text-slate-400 hover:text-white transition-colors"
              title="Cerrar"
            >
              <i className="fa-solid fa-xmark text-base"></i>
            </button>
          )}
        </div>

        {/* Contenido */}
        <div className="p-6 space-y-4 overflow-y-auto text-xs">
          {/* Tarjeta resumen del comprobante */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <span className="font-mono font-bold text-slate-900 text-sm">
                {retention.retentionNumber}
              </span>
              <span className="text-slate-500 font-medium">
                Emisión: {formatDateAR(retention.date || retention.fecha)}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-slate-600">
              <div>
                <span className="text-slate-400 font-semibold">Proveedor: </span>
                <span className="font-bold text-slate-800">{retention.razonSocial}</span>
              </div>
              <div className="font-mono">
                <span className="text-slate-400 font-sans font-semibold">CUIT: </span>
                <span>{retention.cuit}</span>
              </div>
              <div className="font-mono">
                <span className="text-slate-400 font-sans font-semibold">Factura: </span>
                <span>{retention.nroFactura || 'N/A'}</span>
              </div>
              <div>
                <span className="text-slate-400 font-semibold">Total Retenido: </span>
                <span className="font-mono font-black text-bailac text-sm">
                  {formatCurrency(retention.total)}
                </span>
              </div>
            </div>
            <div className="text-[11px] text-slate-500 pt-1 border-t border-slate-200/70 flex items-center gap-1.5">
              <i className="fa-solid fa-file-pdf text-rose-500"></i>
              <span className="font-mono truncate" title={pdfFilename}>
                Adjunto: {pdfFilename}
              </span>
            </div>
          </div>

          {/* PASO 1: CONFIRMACIÓN PREVIA */}
          {step === 'confirm' && (
            <div className="space-y-3">
              {mode === 'emit' && (
                <div className="space-y-2">
                  <h4 className="font-bold text-slate-700 uppercase tracking-wider text-[11px]">
                    Acciones a ejecutar
                  </h4>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200">
                      <i className="fa-solid fa-download text-bailac"></i>
                      <span>Generar y descargar PDF en tu dispositivo</span>
                    </div>
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200">
                      <i
                        className={`fa-solid fa-table ${
                          saveToSheet ? 'text-emerald-600' : 'text-slate-400'
                        }`}
                      ></i>
                      <span>
                        {saveToSheet
                          ? 'Registrar comprobante en Google Sheets'
                          : 'Registro en Google Sheets desactivado'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Resumen de destinatarios */}
              <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 flex items-center gap-1.5">
                    <i className="fa-solid fa-envelope text-bailac"></i>
                    <span>
                      {mode === 'resend'
                        ? 'Destinatarios para este reenvío'
                        : 'Se enviará el PDF por correo a:'}
                    </span>
                  </span>
                  <span className="font-mono text-[11px] font-bold text-slate-600">
                    {sendEmail ? `${activeRecipients.length} correo(s)` : 'No enviar'}
                  </span>
                </div>

                {!sendEmail || activeRecipients.length === 0 ? (
                  <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 flex items-center gap-2">
                    <i className="fa-solid fa-triangle-exclamation text-amber-600"></i>
                    <span>
                      {mode === 'resend'
                        ? 'Agrega al menos un correo destinatario para enviar.'
                        : 'No se enviará ningún correo electrónico (no hay destinatarios seleccionados).'}
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {activeRecipients.map((email) => (
                      <span
                        key={email}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-orange-50 border border-orange-200 text-slate-800 font-mono text-[11px]"
                      >
                        <i className="fa-solid fa-check text-emerald-600 text-[10px]"></i>
                        <span>{email}</span>
                        {showRecipientEditor && (
                          <button
                            type="button"
                            onClick={() => handleRemoveQuickEmail(email)}
                            className="text-slate-400 hover:text-rose-600 ml-0.5"
                            title="Quitar"
                          >
                            <i className="fa-solid fa-xmark"></i>
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                )}

                {showRecipientEditor && (
                  <div className="pt-2 border-t border-slate-100 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <input
                        type="email"
                        value={quickEmail}
                        onChange={(e) => {
                          setQuickEmail(e.target.value);
                          if (quickError) setQuickError('');
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddQuickEmail();
                          }
                        }}
                        placeholder="Agregar otro correo..."
                        className="flex-1 px-2.5 py-1.5 border border-slate-300 rounded-lg font-mono text-xs focus:border-bailac focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleAddQuickEmail}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-semibold"
                      >
                        Agregar
                      </button>
                    </div>
                    {quickError && <p className="text-rose-600 font-semibold">{quickError}</p>}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* PASO 2 & 3: ESTADO EN VIVO Y REINTENTOS */}
          {(step === 'processing' || step === 'result') && (
            <div className="space-y-3">
              {/* Estado PDF */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900">
                <div className="flex items-center gap-2">
                  <i className="fa-solid fa-circle-check text-emerald-600 text-sm"></i>
                  <span className="font-bold">Comprobante PDF</span>
                </div>
                <span className="font-semibold">Generado y descargado</span>
              </div>

              {/* Estado Sheets (solo en emisión) */}
              {mode === 'emit' && (
                <div
                  className={`p-3 rounded-xl border ${
                    sheetStatus === 'synced'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : sheetStatus === 'error'
                      ? 'bg-rose-50 border-rose-200 text-rose-900'
                      : sheetStatus === 'pending'
                      ? 'bg-sky-50 border-sky-200 text-sky-900'
                      : 'bg-slate-50 border-slate-200 text-slate-600'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <i
                        className={`fa-solid text-sm ${
                          sheetStatus === 'synced'
                            ? 'fa-circle-check text-emerald-600'
                            : sheetStatus === 'error'
                            ? 'fa-circle-exclamation text-rose-600'
                            : sheetStatus === 'pending'
                            ? 'fa-circle-notch fa-spin text-sky-600'
                            : 'fa-minus-circle text-slate-400'
                        }`}
                      ></i>
                      <span className="font-bold">Registro en Google Sheets</span>
                    </div>
                    <span className="font-semibold">
                      {sheetStatus === 'synced'
                        ? `Registrado${sheetRow ? ` (Fila #${sheetRow})` : ''}`
                        : sheetStatus === 'error'
                        ? 'Error al registrar'
                        : sheetStatus === 'pending'
                        ? 'Guardando...'
                        : 'Omitido'}
                    </span>
                  </div>
                  {sheetStatus === 'error' && sheetError && (
                    <p className="mt-1.5 text-[11px] text-rose-700">{sheetError}</p>
                  )}
                </div>
              )}

              {/* Estado Email */}
              <div
                className={`p-3 rounded-xl border ${
                  emailStatus === 'sent'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : emailStatus === 'error'
                    ? 'bg-rose-50 border-rose-200 text-rose-900'
                    : emailStatus === 'pending'
                    ? 'bg-sky-50 border-sky-200 text-sky-900'
                    : 'bg-slate-50 border-slate-200 text-slate-600'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <i
                      className={`fa-solid text-sm ${
                        emailStatus === 'sent'
                          ? 'fa-circle-check text-emerald-600'
                          : emailStatus === 'error'
                          ? 'fa-circle-exclamation text-rose-600'
                          : emailStatus === 'pending'
                          ? 'fa-circle-notch fa-spin text-sky-600'
                          : 'fa-minus-circle text-slate-400'
                      }`}
                    ></i>
                    <span className="font-bold">Envío por Correo Electrónico</span>
                  </div>
                  <span className="font-semibold">
                    {emailStatus === 'sent'
                      ? `Enviado (${sentTo.length})`
                      : emailStatus === 'error'
                      ? 'Error en el envío'
                      : emailStatus === 'pending'
                      ? 'Enviando correo con adjunto...'
                      : 'Sin envío'}
                  </span>
                </div>

                {emailStatus === 'sent' && sentTo.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-emerald-200/70 space-y-1">
                    <div className="text-[11px] font-semibold">Enviado a:</div>
                    <div className="flex flex-wrap gap-1">
                      {sentTo.map((e) => (
                        <span
                          key={e}
                          className="font-mono text-[10px] bg-white px-2 py-0.5 rounded border border-emerald-200 text-emerald-800"
                        >
                          {e}
                        </span>
                      ))}
                    </div>
                    {typeof remainingQuota === 'number' && (
                      <div className="text-[10px] text-emerald-700 pt-0.5">
                        Cuota diaria disponible en Apps Script: {remainingQuota} envío(s) restantes hoy.
                      </div>
                    )}
                  </div>
                )}

                {emailStatus === 'error' && (
                  <div className="mt-2 space-y-2.5">
                    <p className="text-[11px] text-rose-800 font-medium">{emailError}</p>

                    {sheetStatus === 'synced' && (
                      <div className="p-2 rounded-lg bg-white/80 border border-rose-200 text-[11px] text-slate-700 flex items-center gap-1.5">
                        <i className="fa-solid fa-shield-halved text-emerald-600"></i>
                        <span>
                          La planilla de Google Sheets ya quedó registrada. Al reintentar el correo{' '}
                          <strong>no se duplicará la fila ni se regenerará el comprobante</strong>.
                        </span>
                      </div>
                    )}

                    {/* Editor rápido para corregir destinatarios antes de reintentar */}
                    <div className="p-2.5 rounded-lg bg-white border border-rose-200 space-y-2">
                      <div className="text-[11px] font-bold text-slate-700">
                        Destinatarios para el reintento:
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {retryRecipients.map((e) => (
                          <span
                            key={e}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 border border-slate-200 font-mono text-[10px]"
                          >
                            <span>{e}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveQuickEmail(e)}
                              className="text-slate-400 hover:text-rose-600"
                            >
                              <i className="fa-solid fa-xmark"></i>
                            </button>
                          </span>
                        ))}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="email"
                          value={quickEmail}
                          onChange={(e) => {
                            setQuickEmail(e.target.value);
                            if (quickError) setQuickError('');
                          }}
                          placeholder="Agregar o corregir correo..."
                          className="flex-1 px-2 py-1 border border-slate-300 rounded text-[11px] font-mono focus:outline-none focus:border-bailac"
                        />
                        <button
                          type="button"
                          onClick={handleAddQuickEmail}
                          className="px-2.5 py-1 bg-slate-800 text-white rounded text-[11px] font-semibold"
                        >
                          Agregar
                        </button>
                      </div>
                      {quickError && <p className="text-[11px] text-rose-600">{quickError}</p>}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Botones de pie */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
          {step === 'confirm' && (
            <>
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 rounded-xl font-semibold text-xs transition-colors"
              >
                {mode === 'resend' ? 'Cancelar' : 'Volver a editar'}
              </button>
              <button
                type="button"
                disabled={mode === 'resend' && activeRecipients.length === 0}
                onClick={() =>
                  mode === 'resend' ? onRetryEmailOnly(activeRecipients) : onConfirmEmit()
                }
                className="px-5 py-2.5 bg-bailac hover:bg-bailac-600 text-white rounded-xl font-bold text-xs shadow-md shadow-orange-500/20 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <i className={`fa-solid ${mode === 'resend' ? 'fa-paper-plane' : 'fa-check'}`}></i>
                <span>
                  {mode === 'resend'
                    ? 'Enviar PDF por Correo Ahora'
                    : sendEmail && activeRecipients.length > 0
                    ? 'Confirmar, Emitir y Enviar'
                    : 'Confirmar y Emitir Comprobante'}
                </span>
              </button>
            </>
          )}

          {step === 'processing' && (
            <div className="w-full flex items-center justify-center gap-2 text-xs text-slate-600 font-semibold py-1">
              <i className="fa-solid fa-circle-notch fa-spin text-bailac"></i>
              <span>Por favor espera, procesando solicitud sin cerrar esta ventana...</span>
            </div>
          )}

          {step === 'result' && (
            <>
              <button
                type="button"
                onClick={onDownloadPdfAgain}
                className="px-3.5 py-2 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 rounded-xl font-semibold text-xs flex items-center gap-1.5"
              >
                <i className="fa-solid fa-download text-bailac"></i>
                <span>Descargar PDF</span>
              </button>

              <div className="flex items-center gap-2 ml-auto">
                {sheetStatus === 'error' && (
                  <button
                    type="button"
                    onClick={onRetrySheetOnly}
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold text-xs shadow-sm flex items-center gap-1.5"
                  >
                    <i className="fa-solid fa-rotate"></i>
                    <span>Reintentar Planilla</span>
                  </button>
                )}

                {emailStatus === 'error' && (
                  <button
                    type="button"
                    disabled={retryRecipients.length === 0}
                    onClick={() => onRetryEmailOnly(retryRecipients)}
                    className="px-4 py-2 bg-bailac hover:bg-bailac-600 text-white rounded-xl font-bold text-xs shadow-md flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <i className="fa-solid fa-paper-plane"></i>
                    <span>Reintentar Solo Mail</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={onCancel}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-bold text-xs"
                >
                  Cerrar
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
