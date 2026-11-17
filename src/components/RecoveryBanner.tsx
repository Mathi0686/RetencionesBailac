import React from 'react';
import { LastGeneratedCert } from '../types';
import { formatCurrency, formatDateAR } from '../utils/formatters';

interface RecoveryBannerProps {
  lastCert: LastGeneratedCert | null;
  onRetryEmail: () => void;
  onRetrySheet: () => void;
  onDownloadSavedPdf: () => void;
  onDismiss: () => void;
}

export const RecoveryBanner: React.FC<RecoveryBannerProps> = ({
  lastCert,
  onRetryEmail,
  onRetrySheet,
  onDownloadSavedPdf,
  onDismiss
}) => {
  if (!lastCert) return null;

  const hasSheetIssue = lastCert.sheetStatus === 'error' || lastCert.sheetStatus === 'pending';
  const hasEmailIssue = lastCert.emailStatus === 'error' || lastCert.emailStatus === 'pending';

  // Mostrar aviso destacado cuando haya un envío o registro pendiente/fallido por recuperar
  if (!hasSheetIssue && !hasEmailIssue) {
    return null;
  }

  const { retention } = lastCert;

  return (
    <div className="mb-6 bg-amber-50 border border-amber-300 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-700 shrink-0 mt-0.5">
          <i className="fa-solid fa-clock-rotate-left text-lg"></i>
        </div>
        <div className="space-y-1 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-amber-950 text-sm">
              Comprobante recuperado con envío pendiente:
            </span>
            <span className="font-mono font-bold bg-white px-2 py-0.5 rounded border border-amber-200 text-slate-900">
              {retention.retentionNumber}
            </span>
          </div>
          <p className="text-amber-900">
            <strong>{retention.razonSocial}</strong> · {formatDateAR(retention.date || retention.fecha)} ·{' '}
            <strong className="font-mono">{formatCurrency(retention.total)}</strong>
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                lastCert.sheetStatus === 'synced'
                  ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                  : lastCert.sheetStatus === 'error'
                  ? 'bg-rose-100 text-rose-800 border-rose-200'
                  : 'bg-slate-100 text-slate-700 border-slate-200'
              }`}
            >
              <i
                className={`fa-solid ${
                  lastCert.sheetStatus === 'synced'
                    ? 'fa-check'
                    : lastCert.sheetStatus === 'error'
                    ? 'fa-xmark'
                    : 'fa-minus'
                }`}
              ></i>
              <span>
                Sheets:{' '}
                {lastCert.sheetStatus === 'synced'
                  ? 'Registrado'
                  : lastCert.sheetStatus === 'error'
                  ? 'Error'
                  : 'Omitido'}
              </span>
            </span>

            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                lastCert.emailStatus === 'sent'
                  ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                  : 'bg-rose-100 text-rose-800 border-rose-200'
              }`}
            >
              <i
                className={`fa-solid ${
                  lastCert.emailStatus === 'sent' ? 'fa-check' : 'fa-envelope-circle-check'
                }`}
              ></i>
              <span>
                Correo: {lastCert.emailStatus === 'error' ? 'Falló (listo para reintentar)' : 'Pendiente'}
              </span>
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
        {lastCert.pdfBase64 && (
          <button
            type="button"
            onClick={onDownloadSavedPdf}
            className="px-3 py-2 bg-white hover:bg-slate-100 border border-amber-300 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5"
          >
            <i className="fa-solid fa-download text-bailac"></i>
            <span>PDF</span>
          </button>
        )}

        {hasSheetIssue && (
          <button
            type="button"
            onClick={onRetrySheet}
            className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs"
          >
            <i className="fa-solid fa-table"></i>
            <span>Reintentar Planilla</span>
          </button>
        )}

        {hasEmailIssue && (
          <button
            type="button"
            onClick={onRetryEmail}
            className="px-4 py-2 bg-bailac hover:bg-bailac-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm"
          >
            <i className="fa-solid fa-paper-plane"></i>
            <span>Reenviar Mail sin Regenerar</span>
          </button>
        )}

        <button
          type="button"
          onClick={onDismiss}
          className="p-2 text-amber-700 hover:text-amber-950 hover:bg-amber-100 rounded-lg transition-colors text-xs"
          title="Descartar aviso"
        >
          <i className="fa-solid fa-xmark"></i>
        </button>
      </div>
    </div>
  );
};
