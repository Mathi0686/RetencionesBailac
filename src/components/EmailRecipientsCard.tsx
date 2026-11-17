import React, { useState } from 'react';
import { DEFAULT_EMAIL_RECIPIENTS } from '../constants';
import { isValidEmail, normalizeEmail } from '../utils/formatters';

interface EmailRecipientsCardProps {
  sendEmailEnabled: boolean;
  onToggleSendEmail: (enabled: boolean) => void;
  selectedDefaults: string[];
  onToggleDefaultEmail: (email: string) => void;
  extraEmails: string[];
  onAddExtraEmail: (email: string, saveForFuture: boolean) => void;
  onRemoveExtraEmail: (email: string) => void;
  savedEmails: string[];
  selectedSavedEmails: string[];
  onToggleSavedEmail: (email: string) => void;
  onDeleteSavedEmail: (email: string) => void;
  totalSelectedCount: number;
  compact?: boolean;
}

export const EmailRecipientsCard: React.FC<EmailRecipientsCardProps> = ({
  sendEmailEnabled,
  onToggleSendEmail,
  selectedDefaults,
  onToggleDefaultEmail,
  extraEmails,
  onAddExtraEmail,
  onRemoveExtraEmail,
  savedEmails,
  selectedSavedEmails,
  onToggleSavedEmail,
  onDeleteSavedEmail,
  totalSelectedCount,
  compact = false
}) => {
  const [newEmailInput, setNewEmailInput] = useState('');
  const [saveForFuture, setSaveForFuture] = useState(false);
  const [inputError, setInputError] = useState('');

  const handleAdd = () => {
    const cleaned = normalizeEmail(newEmailInput);
    if (!cleaned) {
      setInputError('Ingresá una dirección de correo electrónico.');
      return;
    }
    if (!isValidEmail(cleaned)) {
      setInputError('El formato del correo no es válido (ej: nombre@empresa.com).');
      return;
    }

    const defaultSet = new Set(DEFAULT_EMAIL_RECIPIENTS.map(normalizeEmail));
    if (defaultSet.has(cleaned)) {
      setInputError('Este correo ya forma parte de los destinatarios fijos por defecto.');
      return;
    }

    const alreadyInExtra = extraEmails.some((e) => normalizeEmail(e) === cleaned);
    const alreadyInSaved = savedEmails.some((e) => normalizeEmail(e) === cleaned);

    if (alreadyInExtra) {
      setInputError('Este correo ya fue agregado al envío actual.');
      return;
    }

    if (alreadyInSaved && !saveForFuture) {
      // Si ya está guardado pero no tildado, simplemente lo tildamos
      if (!selectedSavedEmails.includes(cleaned)) {
        onToggleSavedEmail(cleaned);
      }
      setNewEmailInput('');
      setInputError('');
      return;
    }

    if (alreadyInSaved && saveForFuture) {
      setInputError('Este correo ya está guardado en la lista de frecuentes.');
      return;
    }

    onAddExtraEmail(cleaned, saveForFuture);
    setNewEmailInput('');
    setSaveForFuture(false);
    setInputError('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
      {/* Encabezado y toggle */}
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={sendEmailEnabled}
            onChange={(e) => onToggleSendEmail(e.target.checked)}
            className="w-4 h-4 text-orange-500 border-slate-300 rounded focus:ring-orange-500"
          />
          <i className="fa-solid fa-envelope text-bailac text-sm"></i>
          <span className="text-xs font-bold text-slate-800">
            Enviar Comprobante PDF por Correo Electrónico
          </span>
        </label>

        <span
          className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
            sendEmailEnabled && totalSelectedCount > 0
              ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
              : 'text-slate-500 bg-white border-slate-200'
          }`}
        >
          {sendEmailEnabled
            ? `${totalSelectedCount} destinatario${totalSelectedCount === 1 ? '' : 's'}`
            : 'Desactivado'}
        </span>
      </div>

      {sendEmailEnabled && (
        <div className="space-y-3 pt-1">
          {/* 1. Destinatarios por defecto (fijos) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Destinatarios por defecto (fijos)
              </span>
              <span className="text-[10px] text-slate-400">
                Puedes destildar solo para un envío puntual
              </span>
            </div>

            <div className={`grid grid-cols-1 ${compact ? '' : 'sm:grid-cols-2'} gap-2`}>
              {DEFAULT_EMAIL_RECIPIENTS.map((email) => {
                const isChecked = selectedDefaults.includes(email);
                return (
                  <label
                    key={email}
                    className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-xs cursor-pointer transition-all select-none ${
                      isChecked
                        ? 'bg-white border-orange-300 text-slate-800 shadow-xs'
                        : 'bg-slate-100/70 border-slate-200 text-slate-400'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => onToggleDefaultEmail(email)}
                        className="w-3.5 h-3.5 text-orange-500 border-slate-300 rounded focus:ring-orange-500 shrink-0"
                      />
                      <span className="font-mono text-[11px] truncate" title={email}>
                        {email}
                      </span>
                    </div>
                    <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200 shrink-0">
                      Fijo
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* 2. Correos guardados en localStorage */}
          {savedEmails.length > 0 && (
            <div className="pt-1 border-t border-slate-200/80">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Correos guardados en este navegador ({savedEmails.length})
                </span>
                <span className="text-[10px] text-slate-400">Tildar para incluir</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {savedEmails.map((email) => {
                  const isChecked = selectedSavedEmails.includes(email);
                  return (
                    <div
                      key={email}
                      className={`inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-lg border text-[11px] transition-all ${
                        isChecked
                          ? 'bg-white border-orange-300 text-slate-800 shadow-xs'
                          : 'bg-slate-100 border-slate-200 text-slate-500'
                      }`}
                    >
                      <label className="flex items-center gap-1.5 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => onToggleSavedEmail(email)}
                          className="w-3.5 h-3.5 text-orange-500 border-slate-300 rounded focus:ring-orange-500"
                        />
                        <span className="font-mono">{email}</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => onDeleteSavedEmail(email)}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                        title={`Eliminar ${email} de correos guardados`}
                      >
                        <i className="fa-solid fa-trash-can text-[10px]"></i>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 3. Agregar destinatario adicional */}
          <div className="pt-1 border-t border-slate-200/80 space-y-2">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Agregar destinatario adicional (ej: proveedor)
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <i className="fa-solid fa-at text-xs"></i>
                </span>
                <input
                  type="email"
                  value={newEmailInput}
                  onChange={(e) => {
                    setNewEmailInput(e.target.value);
                    if (inputError) setInputError('');
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="administracion@proveedor.com.ar"
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-bailac font-mono"
                />
              </div>
              <button
                type="button"
                onClick={handleAdd}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold transition-colors shrink-0 flex items-center gap-1"
              >
                <i className="fa-solid fa-plus text-[10px]"></i>
                <span>Agregar</span>
              </button>
            </div>

            <label className="inline-flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={saveForFuture}
                onChange={(e) => setSaveForFuture(e.target.checked)}
                className="w-3.5 h-3.5 text-orange-500 border-slate-300 rounded focus:ring-orange-500"
              />
              <span className="text-[11px] text-slate-600">
                Guardar este correo para futuros envíos
              </span>
            </label>

            {inputError && (
              <p className="text-[11px] font-semibold text-rose-600 flex items-center gap-1.5">
                <i className="fa-solid fa-circle-exclamation"></i>
                <span>{inputError}</span>
              </p>
            )}

            {/* Chips de correos adicionales puntuales */}
            {extraEmails.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {extraEmails.map((email) => (
                  <span
                    key={email}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-orange-50 border border-orange-200 text-slate-800 text-[11px] font-mono"
                  >
                    <span>{email}</span>
                    <button
                      type="button"
                      onClick={() => onRemoveExtraEmail(email)}
                      className="text-orange-500 hover:text-rose-600 transition-colors"
                      title={`Quitar ${email}`}
                    >
                      <i className="fa-solid fa-xmark text-xs"></i>
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {totalSelectedCount === 0 && (
            <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-800 flex items-center gap-2">
              <i className="fa-solid fa-triangle-exclamation text-amber-600"></i>
              <span>
                No hay destinatarios seleccionados. Se generará el PDF y se guardará en planilla sin enviar correo.
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
