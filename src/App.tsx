import React, { useEffect, useMemo, useRef, useState } from 'react';
import appsScriptCode from '../Code.gs?raw';
import { ConfirmEmissionModal } from './components/ConfirmEmissionModal';
import { EmailRecipientsCard } from './components/EmailRecipientsCard';
import { RecoveryBanner } from './components/RecoveryBanner';
import {
  ACCESS_PASSWORD,
  AGENTE_RETENCION,
  DEFAULT_APPSCRIPT_URL,
  DEFAULT_EMAIL_RECIPIENTS,
  DEFAULT_SPREADSHEET_URL,
  INITIAL_RECENT_RETENTIONS
} from './constants';
import {
  emitRetentionToAppsScript,
  fetchRecentRowsFromSheets,
  fetchRowFromSheet,
  registerSheetOnlyToAppsScript,
  retryEmailOnlyToAppsScript,
  syncSubjectsFromSheet
} from './services/appsScript';
import {
  EmailSendStatus,
  LastGeneratedCert,
  NumberPrefix,
  RetentionRecord,
  SheetSyncStatus,
  SubjectRecord,
  TaxType,
  ToastNotification
} from './types';
import {
  compressSignatureImage,
  formatCurrency,
  formatDateAR,
  normalizeEmail,
  numeroALetras
} from './utils/formatters';
import {
  downloadPdfFromBase64,
  generateBatchPdf,
  generateCertificatePdf
} from './utils/pdfGenerator';
import {
  loadLastGeneratedCert,
  loadSavedEmails,
  safeLocalGet,
  safeLocalGetJSON,
  safeLocalSet,
  safeLocalSetJSON,
  safeSessionGet,
  safeSessionRemove,
  safeSessionSet,
  saveEmailsToStorage,
  saveLastGeneratedCert,
  STORAGE_KEYS
} from './utils/storage';

interface ModalRuntimeState {
  isOpen: boolean;
  mode: 'emit' | 'resend';
  step: 'confirm' | 'processing' | 'result';
  retention: RetentionRecord | null;
  pdfBase64: string;
  pdfFilename: string;
  saveToSheet: boolean;
  sendEmail: boolean;
  recipients: string[];
  sheetStatus: SheetSyncStatus;
  sheetError: string;
  sheetRow: number | null;
  emailStatus: EmailSendStatus;
  emailError: string;
  sentTo: string[];
  remainingQuota: number | null;
}

const INITIAL_MODAL_STATE: ModalRuntimeState = {
  isOpen: false,
  mode: 'emit',
  step: 'confirm',
  retention: null,
  pdfBase64: '',
  pdfFilename: '',
  saveToSheet: true,
  sendEmail: true,
  recipients: [],
  sheetStatus: 'pending',
  sheetError: '',
  sheetRow: null,
  emailStatus: 'pending',
  emailError: '',
  sentTo: [],
  remainingQuota: null
};

export default function App() {
  // Estado de retenciones
  const [retentions, setRetentions] = useState<RetentionRecord[]>(() =>
    safeLocalGetJSON<RetentionRecord[]>(STORAGE_KEYS.RETENTIONS, INITIAL_RECENT_RETENTIONS)
  );

  // Próximo correlativo
  const [nextId, setNextId] = useState<number>(() => {
    const saved = safeLocalGet(STORAGE_KEYS.NEXT_ID);
    const num = saved ? parseInt(saved, 10) : 2949;
    return isNaN(num) || num < 1000 ? 2949 : num;
  });

  // Formato de numeración: 'RET' o '001'
  const [numberPrefix, setNumberPrefix] = useState<NumberPrefix>(() => {
    const saved = safeLocalGet(STORAGE_KEYS.NUMBER_PREFIX);
    return saved === '001' ? '001' : 'RET';
  });

  // URL del Webhook de Google Apps Script
  const [googleSheetUrl, setGoogleSheetUrl] = useState<string>(() => {
    const saved = safeLocalGet(STORAGE_KEYS.APPSCRIPT_URL);
    if (
      !saved ||
      saved.length < 25 ||
      saved.includes('AKfycb...') ||
      saved.includes('AKfycbxSjJVMQ7Yp1mBBZWRY2daVct9ECdiKPsiIUl5NnVOIv148Xggb3Rom1tQlf06tU-T9')
    ) {
      return DEFAULT_APPSCRIPT_URL;
    }
    return saved;
  });

  // URL de la planilla de Google Sheets
  const [spreadsheetUrl, setSpreadsheetUrl] = useState<string>(() => {
    return safeLocalGet(STORAGE_KEYS.SPREADSHEET_URL) || DEFAULT_SPREADSHEET_URL;
  });

  // Firma digital en Base64
  const [digitalSignature, setDigitalSignature] = useState<string>(() => {
    return safeLocalGet(STORAGE_KEYS.DIGITAL_SIGNATURE) || '';
  });

  // Sujetos aprendidos / sincronizados (fallback inicial con proveedores recientes)
  const [knownSubjects, setKnownSubjects] = useState<SubjectRecord[]>(() => {
    const stored = safeLocalGetJSON<SubjectRecord[]>(STORAGE_KEYS.KNOWN_SUBJECTS, []);
    if (stored.length > 0) return stored;
    return INITIAL_RECENT_RETENTIONS.map((r) => ({
      cuit: r.cuit,
      razonSocial: r.razonSocial,
      nroIIBB: r.nroIIBB,
      domicilio: r.domicilio,
      taxType: r.taxType,
      alicuota: r.alicuota
    }));
  });

  // Correos guardados en localStorage
  const [savedEmails, setSavedEmails] = useState<string[]>(() => loadSavedEmails());

  // Último comprobante generado (punto de retorno local)
  const [lastGeneratedCert, setLastGeneratedCert] = useState<LastGeneratedCert | null>(() =>
    loadLastGeneratedCert()
  );

  // Estado de selección de correos para la emisión actual
  const [sendEmailEnabled, setSendEmailEnabled] = useState<boolean>(true);
  const [selectedDefaults, setSelectedDefaults] = useState<string[]>([...DEFAULT_EMAIL_RECIPIENTS]);
  const [selectedSavedEmails, setSelectedSavedEmails] = useState<string[]>([]);
  const [extraEmails, setExtraEmails] = useState<string[]>([]);

  // Formulario de emisión
  const [cuit, setCuit] = useState('');
  const [razonSocial, setRazonSocial] = useState('');
  const [nroIIBB, setNroIIBB] = useState('');
  const [domicilio, setDomicilio] = useState('');
  const [taxType, setTaxType] = useState<TaxType>('CM');
  const [nroFactura, setNroFactura] = useState('');
  const [fechaEmision, setFechaEmision] = useState(() => new Date().toISOString().split('T')[0]);
  const [baseImponible, setBaseImponible] = useState('');
  const [alicuota, setAlicuota] = useState('2.00');
  const [observaciones, setObservaciones] = useState('');
  const [autoSyncSheets, setAutoSyncSheets] = useState(true);

  // UI States
  const [searchTerm, setSearchTerm] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [historyFilter, setHistoryFilter] = useState('');
  const [isUpdatingFromSheets, setIsUpdatingFromSheets] = useState(false);
  const [isSyncingSubjects, setIsSyncingSubjects] = useState(false);
  const [isBatchExporting, setIsBatchExporting] = useState(false);
  const [notification, setNotification] = useState<ToastNotification | null>(null);

  // Seguridad / Login por contraseña
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(
    () => safeSessionGet(STORAGE_KEYS.AUTH_SESSION) === 'true'
  );
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [loginError, setLoginError] = useState('');
  const appContentRef = useRef<HTMLDivElement>(null);

  // Modales existentes
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showCorrelativeModal, setShowCorrelativeModal] = useState(false);
  const [showTxtModal, setShowTxtModal] = useState(false);
  const [showGasCodeModal, setShowGasCodeModal] = useState(false);
  const [showRowSearchModal, setShowRowSearchModal] = useState(false);
  const [tempNextId, setTempNextId] = useState(String(nextId));
  const [searchRowNum, setSearchRowNum] = useState('135');
  const [isSearchingRow, setIsSearchingRow] = useState(false);
  const [foundRowRetention, setFoundRowRetention] = useState<RetentionRecord | null>(null);

  // Modal de confirmación / envío / reintento
  const [emissionModal, setEmissionModal] = useState<ModalRuntimeState>(INITIAL_MODAL_STATE);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Bloquear foco e interacción del fondo cuando no está autenticado
  useEffect(() => {
    const el = appContentRef.current;
    if (!el) return;
    if (!isAuthenticated) {
      el.setAttribute('inert', '');
    } else {
      el.removeAttribute('inert');
    }
  }, [isAuthenticated]);

  // Persistencia segura en localStorage
  useEffect(() => {
    safeLocalSetJSON(STORAGE_KEYS.RETENTIONS, retentions);
  }, [retentions]);

  useEffect(() => {
    safeLocalSet(STORAGE_KEYS.NEXT_ID, nextId.toString());
  }, [nextId]);

  useEffect(() => {
    safeLocalSet(STORAGE_KEYS.NUMBER_PREFIX, numberPrefix);
  }, [numberPrefix]);

  useEffect(() => {
    safeLocalSet(STORAGE_KEYS.APPSCRIPT_URL, googleSheetUrl);
  }, [googleSheetUrl]);

  useEffect(() => {
    safeLocalSet(STORAGE_KEYS.SPREADSHEET_URL, spreadsheetUrl);
  }, [spreadsheetUrl]);

  useEffect(() => {
    safeLocalSet(STORAGE_KEYS.DIGITAL_SIGNATURE, digitalSignature);
  }, [digitalSignature]);

  useEffect(() => {
    safeLocalSetJSON(STORAGE_KEYS.KNOWN_SUBJECTS, knownSubjects);
  }, [knownSubjects]);

  useEffect(() => {
    saveEmailsToStorage(savedEmails);
  }, [savedEmails]);

  useEffect(() => {
    saveLastGeneratedCert(lastGeneratedCert);
  }, [lastGeneratedCert]);

  // Notificaciones Toast
  const showToast = (message: string, type: ToastNotification['type'] = 'success') => {
    setNotification({ message, type });
    window.setTimeout(() => setNotification(null), 4500);
  };

  // Login / Bloqueo
  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (loginPassword === ACCESS_PASSWORD) {
      setIsAuthenticated(true);
      setLoginPassword('');
      setLoginError('');
      safeSessionSet(STORAGE_KEYS.AUTH_SESSION, 'true');
      showToast('Acceso habilitado correctamente');
    } else {
      setLoginError('Contraseña incorrecta. Verifica e intenta nuevamente.');
      setLoginPassword('');
    }
  };

  const handleLockSession = () => {
    setIsAuthenticated(false);
    setLoginPassword('');
    setLoginError('');
    safeSessionRemove(STORAGE_KEYS.AUTH_SESSION);
  };

  // Formatear el número de comprobante actual según prefijo
  const currentFormattedNumber = useMemo(() => {
    if (numberPrefix === 'RET') {
      return `RET-${nextId.toString().padStart(6, '0')}`;
    }
    return `001-${nextId.toString().padStart(8, '0')}`;
  }, [nextId, numberPrefix]);

  // Cálculo en tiempo real de retención
  const totalRetenido = useMemo(() => {
    const base = parseFloat(baseImponible) || 0;
    const ali = parseFloat(alicuota) || 0;
    if (base <= 0 || ali <= 0) return 0;
    return Math.round(base * (ali / 100) * 100) / 100;
  }, [baseImponible, alicuota]);

  // Lista combinada y deduplicada de destinatarios seleccionados para el envío actual
  const combinedSelectedRecipients = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const group of [selectedDefaults, selectedSavedEmails, extraEmails]) {
      for (const email of group) {
        const cleaned = normalizeEmail(email);
        if (cleaned && !seen.has(cleaned)) {
          seen.add(cleaned);
          list.push(cleaned);
        }
      }
    }
    return list;
  }, [selectedDefaults, selectedSavedEmails, extraEmails]);

  // Filtrado para autocompletado de sujetos
  const filteredSubjects = useMemo(() => {
    if (!searchTerm.trim()) return [];
    const term = searchTerm.toLowerCase().replace(/[^a-z0-9]/g, '');
    return knownSubjects
      .filter((s) => {
        const cuitClean = (s.cuit || '').replace(/[^0-9]/g, '');
        const rs = (s.razonSocial || '').toLowerCase();
        return rs.includes(searchTerm.toLowerCase()) || cuitClean.includes(term);
      })
      .slice(0, 8);
  }, [searchTerm, knownSubjects]);

  const handleSelectSubject = (s: SubjectRecord) => {
    setCuit(s.cuit || '');
    setRazonSocial(s.razonSocial || '');
    setNroIIBB(s.nroIIBB || (s.cuit ? s.cuit.replace(/-/g, '') : ''));
    setDomicilio(s.domicilio || '');
    if (s.taxType) {
      setTaxType(s.taxType === 'IIBB' ? 'IIBB' : 'CM');
    }
    if (s.alicuota) setAlicuota(Number(s.alicuota).toFixed(2));
    setSearchTerm('');
    setShowDropdown(false);
  };

  const handleSignatureUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('El archivo debe ser una imagen PNG o JPG', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = async (event) => {
      const rawUrl = String(event.target?.result || '');
      const optimized = await compressSignatureImage(rawUrl);
      setDigitalSignature(optimized);
      showToast('Firma digital cargada correctamente');
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveSignature = () => {
    setDigitalSignature('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    showToast('Firma digital eliminada', 'info');
  };

  // --- GESTIÓN DE DESTINATARIOS DE CORREO ---
  const handleToggleDefaultEmail = (email: string) => {
    setSelectedDefaults((prev) =>
      prev.includes(email) ? prev.filter((item) => item !== email) : [...prev, email]
    );
  };

  const handleToggleSavedEmail = (email: string) => {
    setSelectedSavedEmails((prev) =>
      prev.includes(email) ? prev.filter((item) => item !== email) : [...prev, email]
    );
  };

  const handleAddExtraEmail = (email: string, saveForFuture: boolean) => {
    const normalized = normalizeEmail(email);
    if (saveForFuture) {
      setSavedEmails((prev) => (prev.includes(normalized) ? prev : [...prev, normalized]));
      setSelectedSavedEmails((prev) => (prev.includes(normalized) ? prev : [...prev, normalized]));
      showToast(`Correo ${normalized} guardado para futuros envíos`, 'info');
    } else {
      setExtraEmails((prev) => (prev.includes(normalized) ? prev : [...prev, normalized]));
    }
  };

  const handleRemoveExtraEmail = (email: string) => {
    setExtraEmails((prev) => prev.filter((item) => item !== email));
  };

  const handleDeleteSavedEmail = (email: string) => {
    setSavedEmails((prev) => prev.filter((item) => item !== email));
    setSelectedSavedEmails((prev) => prev.filter((item) => item !== email));
    showToast(`Correo ${email} eliminado de los guardados`, 'info');
  };

  // --- SINCRONIZACIÓN DE SUJETOS ---
  const handleSyncSubjectsFromSheet = async (isSilent = false) => {
    if (!googleSheetUrl) return;
    setIsSyncingSubjects(true);
    try {
      const subjects = await syncSubjectsFromSheet(googleSheetUrl);
      if (subjects.length > 0) {
        setKnownSubjects(subjects);
        if (!isSilent) {
          showToast(
            `¡Sincronizado! Se cargaron ${subjects.length} proveedores reales desde la planilla.`
          );
        }
      }
    } catch (err) {
      if (!isSilent) {
        const msg =
          err instanceof Error
            ? err.message
            : 'Error al sincronizar proveedores desde Google Sheets';
        showToast(msg, 'error');
      }
    } finally {
      setIsSyncingSubjects(false);
    }
  };

  // Carga inicial automática de proveedores al autenticar
  useEffect(() => {
    if (isAuthenticated && googleSheetUrl && googleSheetUrl.startsWith('http')) {
      handleSyncSubjectsFromSheet(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  // --- ACTUALIZAR ÚLTIMAS FILAS Y CORRELATIVO REMOTO ---
  const handleUpdateFromSheets = async () => {
    if (!googleSheetUrl) {
      setShowSettingsModal(true);
      showToast('Configura la URL de Apps Script', 'info');
      return;
    }

    setIsUpdatingFromSheets(true);
    try {
      const { subjects, retentions: fetched, lastGoodRow, nextCorrelative } =
        await fetchRecentRowsFromSheets(googleSheetUrl, nextId);

      if (subjects.length > 0) {
        setKnownSubjects(subjects);
      }

      if (fetched.length > 0) {
        setRetentions((prev) => {
          const existingNums = new Set(prev.map((p) => p.retentionNumber));
          const merged = [
            ...fetched.filter((n) => !existingNums.has(n.retentionNumber)),
            ...prev
          ];
          return merged.slice(0, 50);
        });

        setNextId(nextCorrelative);
        showToast(
          `Sincronización exitosa: Última fila #${lastGoodRow}. Siguiente N°: RET-${nextCorrelative
            .toString()
            .padStart(6, '0')}`
        );
      } else {
        showToast('Sincronización completada sin nuevos comprobantes remotos.', 'info');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      showToast('Error al conectar con la planilla remota: ' + msg, 'error');
    } finally {
      setIsUpdatingFromSheets(false);
    }
  };

  // --- RECUPERAR COMPROBANTE POR FILA ---
  const handleFetchRowFromSheet = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const rowNum = parseInt(searchRowNum, 10);
    if (isNaN(rowNum) || rowNum < 2) {
      showToast('Ingresa un número de fila válido (ej: 135)', 'error');
      return;
    }

    setIsSearchingRow(true);
    setFoundRowRetention(null);

    try {
      const mappedRetention = await fetchRowFromSheet(googleSheetUrl, rowNum);
      setFoundRowRetention(mappedRetention);
      showToast(
        `Comprobante ${mappedRetention.retentionNumber} de fila #${rowNum} recuperado con éxito.`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      showToast('No se pudo leer la fila: ' + msg, 'error');
    } finally {
      setIsSearchingRow(false);
    }
  };

  const handleImportFoundRowToHistory = () => {
    if (!foundRowRetention) return;
    setRetentions((prev) => {
      const exists = prev.some((r) => r.retentionNumber === foundRowRetention.retentionNumber);
      if (exists) {
        return prev.map((r) =>
          r.retentionNumber === foundRowRetention.retentionNumber ? foundRowRetention : r
        );
      }
      return [foundRowRetention, ...prev];
    });
    showToast(`Comprobante ${foundRowRetention.retentionNumber} incorporado al historial local`);
    setShowRowSearchModal(false);
  };

  // Reintentar sincronización individual de planilla en historial
  const handleRetrySyncItem = async (retentionId: number) => {
    const item = retentions.find((r) => r.id === retentionId);
    if (!item) return;

    const res = await registerSheetOnlyToAppsScript(
      googleSheetUrl,
      item,
      currentFormattedNumber
    );

    if (res.sheetSaved) {
      setRetentions((prev) =>
        prev.map((r) =>
          r.id === retentionId
            ? { ...r, syncedWithSheets: true, sheetRow: res.sheetRow ?? r.sheetRow }
            : r
        )
      );
      if (lastGeneratedCert?.retention.retentionNumber === item.retentionNumber) {
        setLastGeneratedCert((prev) =>
          prev
            ? {
                ...prev,
                sheetStatus: 'synced',
                sheetError: '',
                sheetRow: res.sheetRow ?? prev.sheetRow,
                updatedAt: new Date().toISOString()
              }
            : null
        );
      }
      showToast(`Comprobante ${item.retentionNumber} sincronizado a Google Sheets`);
    } else {
      showToast('Fallo al sincronizar: ' + (res.errorMessage || 'Error de conexión'), 'error');
    }
  };

  const handleDeleteRetention = (retentionId: number) => {
    if (window.confirm('¿Estás seguro de eliminar el comprobante del historial local?')) {
      setRetentions((prev) => prev.filter((r) => r.id !== retentionId));
      showToast('Comprobante eliminado del historial local');
    }
  };

  // --- PASO 1 DE EMISIÓN: VALIDAR Y ABRIR RESUMEN PREVIO ---
  const handlePrepareEmitRetention = (e: React.FormEvent) => {
    e.preventDefault();

    if (!cuit.trim() || !razonSocial.trim()) {
      showToast('Ingresa el CUIT y la Razón Social del proveedor', 'error');
      return;
    }

    const base = parseFloat(baseImponible);
    const ali = parseFloat(alicuota);

    if (isNaN(base) || base <= 0) {
      showToast('La Base Imponible debe ser un número mayor a cero', 'error');
      return;
    }

    if (isNaN(ali) || ali <= 0) {
      showToast('La Alícuota debe ser un porcentaje válido mayor a cero', 'error');
      return;
    }

    const formattedNumber = currentFormattedNumber;
    const total = Math.round(base * (ali / 100) * 100) / 100;

    const draftRetention: RetentionRecord = {
      id: nextId,
      retentionNumber: formattedNumber,
      numeroFormateado: formattedNumber,
      date: fechaEmision,
      fecha: fechaEmision,
      cuit: cuit.trim(),
      razonSocial: razonSocial.trim().toUpperCase(),
      nroIIBB: nroIIBB.trim() || cuit.replace(/[^0-9]/g, ''),
      domicilio: domicilio.trim() || 'San Juan',
      taxType,
      tipoImpuesto: taxType === 'IIBB' ? 'IIBB Local (San Juan)' : 'Convenio Multilateral (CM)',
      nroFactura: nroFactura.trim() || 'N/A',
      facturaOrigen: nroFactura.trim() || 'N/A',
      baseImponible: base,
      alicuota: ali,
      total,
      importeRetenido: total,
      observaciones: observaciones.trim(),
      syncedWithSheets: false,
      emailStatus:
        sendEmailEnabled && combinedSelectedRecipients.length > 0 ? 'pending' : 'skipped',
      emailRecipients: sendEmailEnabled ? combinedSelectedRecipients : [],
      timestamp: new Date().toISOString()
    };

    const willSendEmail = sendEmailEnabled && combinedSelectedRecipients.length > 0;

    setEmissionModal({
      isOpen: true,
      mode: 'emit',
      step: 'confirm',
      retention: draftRetention,
      pdfBase64: '',
      pdfFilename: `${formattedNumber}.pdf`,
      saveToSheet: autoSyncSheets && Boolean(googleSheetUrl),
      sendEmail: willSendEmail,
      recipients: combinedSelectedRecipients,
      sheetStatus: autoSyncSheets && Boolean(googleSheetUrl) ? 'pending' : 'skipped',
      sheetError: '',
      sheetRow: null,
      emailStatus: willSendEmail ? 'pending' : 'skipped',
      emailError: '',
      sentTo: [],
      remainingQuota: null
    });
  };

  // --- PASO 2 DE EMISIÓN: GENERAR PDF, GUARDAR RESUMEN LOCAL, REGISTRAR Y ENVIAR ---
  const handleConfirmAndExecuteEmit = async () => {
    if (emissionModal.step === 'processing' || !emissionModal.retention) return;

    const retentionToEmit = emissionModal.retention;
    const { saveToSheet, sendEmail, recipients } = emissionModal;

    let pdfBase64 = '';
    let pdfFilename = '';

    try {
      const generated = generateCertificatePdf(retentionToEmit, digitalSignature, {
        download: true,
        fallbackNumber: currentFormattedNumber
      });
      pdfBase64 = generated.pdfBase64;
      pdfFilename = generated.pdfFilename;
    } catch (pdfErr) {
      const msg = pdfErr instanceof Error ? pdfErr.message : 'Error desconocido';
      showToast('Error al generar el PDF: ' + msg, 'error');
      return;
    }

    // Guardar snapshot inmediato en localStorage ANTES de la red (punto de retorno)
    const initialSnapshot: LastGeneratedCert = {
      retention: retentionToEmit,
      pdfBase64,
      pdfFilename,
      recipients,
      sheetStatus: saveToSheet ? 'pending' : 'skipped',
      sheetError: '',
      sheetRow: null,
      emailStatus: sendEmail ? 'pending' : 'skipped',
      emailError: '',
      sentTo: [],
      updatedAt: new Date().toISOString()
    };
    setLastGeneratedCert(initialSnapshot);

    // Bloquear doble clic pasando a estado processing
    setEmissionModal((prev) => ({
      ...prev,
      step: 'processing',
      pdfBase64,
      pdfFilename,
      sheetStatus: saveToSheet ? 'pending' : 'skipped',
      emailStatus: sendEmail ? 'pending' : 'skipped'
    }));

    // Incrementar correlativo y guardar en historial local inmediatamente para evitar re-emisiones duplicadas
    setRetentions((prev) => [retentionToEmit, ...prev]);
    setNextId((prev) => prev + 1);

    // Guardar proveedor frecuente si es nuevo
    const cleanCuit = retentionToEmit.cuit.replace(/[^0-9]/g, '');
    const existingIdx = knownSubjects.findIndex(
      (s) => (s.cuit || '').replace(/[^0-9]/g, '') === cleanCuit
    );
    if (existingIdx === -1) {
      setKnownSubjects((prev) => [
        {
          cuit: retentionToEmit.cuit,
          razonSocial: retentionToEmit.razonSocial,
          nroIIBB: retentionToEmit.nroIIBB,
          domicilio: retentionToEmit.domicilio,
          taxType: retentionToEmit.taxType,
          alicuota: retentionToEmit.alicuota
        },
        ...prev
      ]);
    }

    // Limpiar campos del comprobante para evitar re-emisión accidental
    setNroFactura('');
    setBaseImponible('');
    setObservaciones('');
    setExtraEmails([]);

    // Ejecutar llamada a Apps Script (Sheets + Email)
    const res = await emitRetentionToAppsScript({
      googleSheetUrl,
      retention: retentionToEmit,
      saveToSheet,
      sendEmail,
      recipients,
      pdfBase64,
      pdfFilename,
      fallbackNumber: retentionToEmit.retentionNumber
    });

    const finalSheetStatus: SheetSyncStatus = !saveToSheet
      ? 'skipped'
      : res.sheetSaved
      ? 'synced'
      : 'error';
    const finalSheetError =
      saveToSheet && !res.sheetSaved ? res.errorMessage || 'No se pudo registrar en Google Sheets.' : '';

    const finalEmailStatus: EmailSendStatus = !sendEmail
      ? 'skipped'
      : res.emailStatus === 'sent'
      ? 'sent'
      : 'error';
    const finalEmailError =
      sendEmail && finalEmailStatus === 'error'
        ? res.emailMessage || res.errorMessage || 'No se pudo enviar el correo.'
        : '';

    const updatedRecord: RetentionRecord = {
      ...retentionToEmit,
      syncedWithSheets: finalSheetStatus === 'synced',
      sheetRow: res.sheetRow ?? null,
      emailStatus: finalEmailStatus,
      emailRecipients: recipients,
      emailError: finalEmailError
    };

    setRetentions((prev) =>
      prev.map((r) => (r.retentionNumber === updatedRecord.retentionNumber ? updatedRecord : r))
    );

    setLastGeneratedCert({
      retention: updatedRecord,
      pdfBase64,
      pdfFilename,
      recipients,
      sheetStatus: finalSheetStatus,
      sheetError: finalSheetError,
      sheetRow: res.sheetRow ?? null,
      emailStatus: finalEmailStatus,
      emailError: finalEmailError,
      sentTo: res.sentTo || [],
      updatedAt: new Date().toISOString()
    });

    setEmissionModal((prev) => ({
      ...prev,
      step: 'result',
      retention: updatedRecord,
      sheetStatus: finalSheetStatus,
      sheetError: finalSheetError,
      sheetRow: res.sheetRow ?? null,
      emailStatus: finalEmailStatus,
      emailError: finalEmailError,
      sentTo: res.sentTo || [],
      remainingQuota: res.remainingQuota ?? null
    }));

    if (finalSheetStatus !== 'error' && finalEmailStatus !== 'error') {
      showToast(
        finalEmailStatus === 'sent'
          ? `Comprobante ${retentionToEmit.retentionNumber} emitido, registrado y enviado por correo.`
          : `Comprobante ${retentionToEmit.retentionNumber} emitido correctamente.`
      );
    } else if (finalEmailStatus === 'error') {
      showToast('Comprobante generado, pero falló el envío por correo. Puedes reintentarlo.', 'error');
    } else {
      showToast('Error al conectar con Google Sheets. Puedes reintentarlo.', 'error');
    }
  };

  // --- REINTENTO EXCLUSIVO DE CORREO (NO REGISTRA EN SHEETS NI REGENERA) ---
  const handleRetryEmailOnly = async (updatedRecipients: string[]) => {
    if (emissionModal.step === 'processing' || !emissionModal.retention) return;
    if (updatedRecipients.length === 0) {
      showToast('Agrega al menos un destinatario válido para enviar.', 'error');
      return;
    }

    const targetRetention = emissionModal.retention;
    let pdfBase64 = emissionModal.pdfBase64;
    let pdfFilename = emissionModal.pdfFilename;

    // Si venimos de un registro histórico viejo sin base64 guardado, lo generamos en memoria sin descargar
    if (!pdfBase64) {
      const built = generateCertificatePdf(targetRetention, digitalSignature, {
        download: false,
        fallbackNumber: targetRetention.retentionNumber
      });
      pdfBase64 = built.pdfBase64;
      pdfFilename = built.pdfFilename;
    }

    setEmissionModal((prev) => ({
      ...prev,
      step: 'processing',
      recipients: updatedRecipients,
      pdfBase64,
      pdfFilename,
      emailStatus: 'pending',
      emailError: ''
    }));

    const res = await retryEmailOnlyToAppsScript({
      googleSheetUrl,
      retention: targetRetention,
      recipients: updatedRecipients,
      pdfBase64,
      pdfFilename,
      fallbackNumber: targetRetention.retentionNumber
    });

    const newEmailStatus: EmailSendStatus = res.emailStatus === 'sent' ? 'sent' : 'error';
    const newEmailError =
      newEmailStatus === 'error'
        ? res.emailMessage || res.errorMessage || 'No se pudo enviar el correo.'
        : '';

    const updatedRecord: RetentionRecord = {
      ...targetRetention,
      emailStatus: newEmailStatus,
      emailRecipients: updatedRecipients,
      emailError: newEmailError
    };

    setRetentions((prev) =>
      prev.map((r) => (r.retentionNumber === updatedRecord.retentionNumber ? updatedRecord : r))
    );

    if (
      !lastGeneratedCert ||
      lastGeneratedCert.retention.retentionNumber === updatedRecord.retentionNumber
    ) {
      setLastGeneratedCert((prev) => ({
        retention: updatedRecord,
        pdfBase64,
        pdfFilename,
        recipients: updatedRecipients,
        sheetStatus: prev?.sheetStatus ?? (updatedRecord.syncedWithSheets ? 'synced' : 'skipped'),
        sheetError: prev?.sheetError ?? '',
        sheetRow: prev?.sheetRow ?? updatedRecord.sheetRow ?? null,
        emailStatus: newEmailStatus,
        emailError: newEmailError,
        sentTo: res.sentTo || [],
        updatedAt: new Date().toISOString()
      }));
    }

    setEmissionModal((prev) => ({
      ...prev,
      step: 'result',
      retention: updatedRecord,
      emailStatus: newEmailStatus,
      emailError: newEmailError,
      sentTo: res.sentTo || [],
      remainingQuota: res.remainingQuota ?? null
    }));

    if (newEmailStatus === 'sent') {
      showToast(
        `Correo enviado correctamente a ${res.sentTo?.length || updatedRecipients.length} destinatario(s).`
      );
    } else {
      showToast('Error al reenviar el correo: ' + newEmailError, 'error');
    }
  };

  // --- REINTENTO EXCLUSIVO DE PLANILLA (PARA RECUPERACIÓN) ---
  const handleRetrySheetFromModal = async () => {
    if (emissionModal.step === 'processing' || !emissionModal.retention) return;
    const targetRetention = emissionModal.retention;

    setEmissionModal((prev) => ({
      ...prev,
      step: 'processing',
      sheetStatus: 'pending',
      sheetError: ''
    }));

    const res = await registerSheetOnlyToAppsScript(
      googleSheetUrl,
      targetRetention,
      targetRetention.retentionNumber
    );

    const newSheetStatus: SheetSyncStatus = res.sheetSaved ? 'synced' : 'error';
    const newSheetError = res.sheetSaved ? '' : res.errorMessage || 'Fallo al registrar en Sheets.';

    const updatedRecord: RetentionRecord = {
      ...targetRetention,
      syncedWithSheets: res.sheetSaved,
      sheetRow: res.sheetRow ?? targetRetention.sheetRow ?? null
    };

    setRetentions((prev) =>
      prev.map((r) => (r.retentionNumber === updatedRecord.retentionNumber ? updatedRecord : r))
    );

    if (lastGeneratedCert?.retention.retentionNumber === updatedRecord.retentionNumber) {
      setLastGeneratedCert((prev) =>
        prev
          ? {
              ...prev,
              retention: updatedRecord,
              sheetStatus: newSheetStatus,
              sheetError: newSheetError,
              sheetRow: res.sheetRow ?? prev.sheetRow,
              updatedAt: new Date().toISOString()
            }
          : null
      );
    }

    setEmissionModal((prev) => ({
      ...prev,
      step: 'result',
      retention: updatedRecord,
      sheetStatus: newSheetStatus,
      sheetError: newSheetError,
      sheetRow: res.sheetRow ?? prev.sheetRow
    }));

    if (res.sheetSaved) {
      showToast(`Comprobante ${updatedRecord.retentionNumber} registrado en Google Sheets.`);
    } else {
      showToast('No se pudo registrar en Google Sheets: ' + newSheetError, 'error');
    }
  };

  // --- ABRIR MODAL DE REENVÍO PARA RECUPERACIÓN O DESDE EL HISTORIAL ---
  const handleOpenResendModal = (
    ret: RetentionRecord,
    storedBase64?: string,
    storedFilename?: string,
    storedRecipients?: string[],
    sheetStatusOverride?: SheetSyncStatus
  ) => {
    const matchingSaved =
      lastGeneratedCert?.retention.retentionNumber === ret.retentionNumber ? lastGeneratedCert : null;

    const base64ToUse = storedBase64 || matchingSaved?.pdfBase64 || '';
    const built = !base64ToUse
      ? generateCertificatePdf(ret, digitalSignature, {
          download: false,
          fallbackNumber: ret.retentionNumber
        })
      : null;

    const finalFilename =
      storedFilename || matchingSaved?.pdfFilename || built?.pdfFilename || `${ret.retentionNumber}.pdf`;
    const finalBase64 = base64ToUse || built?.pdfBase64 || '';
    const initialRecipients =
      storedRecipients && storedRecipients.length > 0
        ? storedRecipients
        : ret.emailRecipients && ret.emailRecipients.length > 0
        ? ret.emailRecipients
        : combinedSelectedRecipients.length > 0
        ? combinedSelectedRecipients
        : [...DEFAULT_EMAIL_RECIPIENTS];

    setEmissionModal({
      isOpen: true,
      mode: 'resend',
      step: 'confirm',
      retention: ret,
      pdfBase64: finalBase64,
      pdfFilename: finalFilename,
      saveToSheet: false,
      sendEmail: true,
      recipients: initialRecipients,
      sheetStatus:
        sheetStatusOverride ||
        matchingSaved?.sheetStatus ||
        (ret.syncedWithSheets ? 'synced' : 'skipped'),
      sheetError: matchingSaved?.sheetError || '',
      sheetRow: ret.sheetRow ?? matchingSaved?.sheetRow ?? null,
      emailStatus: ret.emailStatus || 'pending',
      emailError: ret.emailError || '',
      sentTo: matchingSaved?.sentTo || [],
      remainingQuota: null
    });
  };

  const handleDownloadSinglePDF = (ret: RetentionRecord) => {
    try {
      const matchingSaved =
        lastGeneratedCert?.retention.retentionNumber === ret.retentionNumber ? lastGeneratedCert : null;
      if (matchingSaved?.pdfBase64) {
        downloadPdfFromBase64(matchingSaved.pdfBase64, matchingSaved.pdfFilename);
        showToast(`Descargando comprobante ${ret.retentionNumber}...`);
        return;
      }
      generateCertificatePdf(ret, digitalSignature, {
        download: true,
        fallbackNumber: currentFormattedNumber
      });
      showToast(`Descargando comprobante ${ret.retentionNumber || currentFormattedNumber}...`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      showToast('Error al generar PDF: ' + msg, 'error');
    }
  };

  const handleExportBatchPDF = () => {
    if (retentions.length === 0) {
      showToast('No hay comprobantes emitidos en el historial para exportar', 'info');
      return;
    }

    setIsBatchExporting(true);
    window.setTimeout(() => {
      try {
        generateBatchPdf(retentions, digitalSignature, currentFormattedNumber);
        showToast(`Lote de ${retentions.length} comprobantes generado exitosamente`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error desconocido';
        showToast('Error al exportar lote PDF: ' + msg, 'error');
      } finally {
        setIsBatchExporting(false);
      }
    }, 150);
  };

  // Exportar TXT DGR San Juan
  const handleGenerateTxtDgr = () => {
    if (retentions.length === 0) {
      showToast('No hay retenciones en el historial para generar el archivo TXT', 'info');
      return;
    }

    const lines = retentions.map((r) => {
      const cuitClean = (r.cuit || '').replace(/[^0-9]/g, '').padStart(11, '0').substring(0, 11);
      const fechaStr = formatDateAR(r.date || r.fecha);
      const ptoVta = '0001';
      const numComp = r.id.toString().padStart(8, '0');
      const cuitAgente = AGENTE_RETENCION.cuit.replace(/[^0-9]/g, '').padStart(11, '0');

      const baseCents = Math.round(Number(r.baseImponible) * 100)
        .toString()
        .padStart(12, '0');
      const aliCents = Math.round(Number(r.alicuota) * 100)
        .toString()
        .padStart(5, '0');
      const totVal = r.total || r.importeRetenido || 0;
      const impCents = Math.round(Number(totVal) * 100)
        .toString()
        .padStart(12, '0');

      const razonSocialFixed = (r.razonSocial || '').padEnd(40, ' ').substring(0, 40);
      const tipoRegimen =
        r.taxType === 'CM' || r.tipoImpuesto?.includes('Convenio') ? 'CM ' : 'LOC';

      return `${cuitClean}${fechaStr}${ptoVta}${numComp}${cuitAgente}${baseCents}${aliCents}${impCents}${tipoRegimen}${razonSocialFixed}`;
    });

    const txtContent = lines.join('\r\n');
    const blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    a.href = url;
    a.download = `RETENCIONES_DGR_SAN_JUAN_${dateStr}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setShowTxtModal(false);
    showToast(`Archivo TXT DGR exportado (${lines.length} registros)`);
  };

  const handleSaveCorrelative = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseInt(tempNextId, 10);
    if (isNaN(parsed) || parsed < 1) {
      showToast('Ingresa un número correlativo válido mayor a 0', 'error');
      return;
    }
    setNextId(parsed);
    setShowCorrelativeModal(false);
    showToast(`Próximo correlativo actualizado a: ${parsed}`);
  };

  const filteredRetentions = useMemo(() => {
    if (!historyFilter.trim()) return retentions;
    const q = historyFilter.toLowerCase().trim();
    return retentions.filter(
      (r) =>
        (r.razonSocial && r.razonSocial.toLowerCase().includes(q)) ||
        (r.cuit && r.cuit.includes(q)) ||
        (r.retentionNumber && r.retentionNumber.toLowerCase().includes(q)) ||
        (r.numeroFormateado && r.numeroFormateado.toLowerCase().includes(q)) ||
        (r.nroFactura && r.nroFactura.toLowerCase().includes(q)) ||
        (r.facturaOrigen && r.facturaOrigen.toLowerCase().includes(q))
    );
  }, [retentions, historyFilter]);

  return (
    <React.Fragment>
      <div
        ref={appContentRef}
        aria-hidden={!isAuthenticated}
        className={`flex flex-col min-h-screen transition-all duration-300 ${
          !isAuthenticated ? 'blur-md pointer-events-none select-none overflow-hidden h-screen' : ''
        }`}
      >
        {/* TOAST NOTIFICACIÓN */}
        {notification && (
          <div
            className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3 rounded-xl shadow-2xl transition-all duration-300 text-white font-medium text-sm border ${
              notification.type === 'error'
                ? 'bg-rose-600 border-rose-500'
                : notification.type === 'info'
                ? 'bg-sky-600 border-sky-500'
                : 'bg-emerald-600 border-emerald-500'
            }`}
          >
            <i
              className={`fa-solid ${
                notification.type === 'error'
                  ? 'fa-circle-exclamation'
                  : notification.type === 'info'
                  ? 'fa-circle-info'
                  : 'fa-circle-check'
              } text-lg`}
            ></i>
            <span>{notification.message}</span>
          </div>
        )}

        {/* BARRA SUPERIOR / ENCABEZADO */}
        <header className="bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-30 shadow-md">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-wrap items-center justify-between gap-4">
            {/* Logo e Identidad Bailac */}
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 bg-bailac rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/20 text-white">
                <i className="fa-solid fa-file-invoice-dollar text-2xl"></i>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-black text-xl tracking-tight text-white">BAILAC</span>
                  <span className="text-xs uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-bailac/20 text-orange-400 border border-orange-500/30">
                    San Juan
                  </span>
                  <span className="hidden sm:inline-flex items-center gap-1 text-[10px] bg-emerald-950/70 text-emerald-400 border border-emerald-500/40 px-2 py-0.5 rounded-full font-mono">
                    <i className="fa-solid fa-circle text-[6px] text-emerald-400 animate-pulse"></i>{' '}
                    Apps Script Conectado
                  </span>
                </div>
                <h1 className="text-xs text-slate-300 font-medium">
                  Sistema de Emisión de Retenciones IIBB / CM · CUIT 30-71155040-9
                </h1>
              </div>
            </div>

            {/* Indicador de Próximo Correlativo */}
            <div className="flex items-center gap-2 bg-slate-800/90 border border-slate-700/80 px-3.5 py-1.5 rounded-xl">
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-400 uppercase font-semibold">Próximo N°</span>
                <span className="font-mono text-sm font-bold text-orange-400 tracking-wider">
                  {currentFormattedNumber}
                </span>
              </div>
              <div className="flex items-center gap-1 ml-2 border-l border-slate-700 pl-2">
                <button
                  type="button"
                  title="Editar correlativo manualmente"
                  onClick={() => {
                    setTempNextId(String(nextId));
                    setShowCorrelativeModal(true);
                  }}
                  className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors text-xs"
                >
                  <i className="fa-solid fa-pen-to-square"></i>
                </button>
                <button
                  type="button"
                  title="Actualizar y verificar correlativo desde Sheets"
                  onClick={handleUpdateFromSheets}
                  disabled={isUpdatingFromSheets}
                  className="p-1.5 text-slate-400 hover:text-orange-400 hover:bg-slate-700 rounded-lg transition-colors text-xs"
                >
                  <i
                    className={`fa-solid fa-arrows-rotate ${
                      isUpdatingFromSheets ? 'fa-spin text-orange-400' : ''
                    }`}
                  ></i>
                </button>
              </div>
            </div>

            {/* Botones de Acción Rápida */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => handleSyncSubjectsFromSheet(false)}
                disabled={isSyncingSubjects}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 transition-all hover:border-orange-500/50"
                title="Consulta la planilla y sincroniza la lista de proveedores aprendidos"
              >
                <i
                  className={`fa-solid fa-users ${
                    isSyncingSubjects ? 'fa-spin text-orange-400' : 'text-orange-400'
                  }`}
                ></i>
                <span>Sincronizar Proveedores ({knownSubjects.length})</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setFoundRowRetention(null);
                  setShowRowSearchModal(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 transition-all hover:border-emerald-500/50"
                title="Recupera y reimprime un comprobante por número de fila de Google Sheets (ej: fila 135)"
              >
                <i className="fa-solid fa-magnifying-glass-location text-emerald-400"></i>
                <span>Reimprimir Fila</span>
              </button>

              <button
                type="button"
                onClick={handleExportBatchPDF}
                disabled={isBatchExporting || retentions.length === 0}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:border-slate-600"
                title="Genera un único PDF concatenando todos los comprobantes del historial"
              >
                <i
                  className={`fa-solid fa-layer-group text-orange-400 ${
                    isBatchExporting ? 'fa-spin' : ''
                  }`}
                ></i>
                <span>Lote PDF</span>
              </button>

              <button
                type="button"
                onClick={() => setShowTxtModal(true)}
                disabled={retentions.length === 0}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:border-slate-600"
                title="Exporta el archivo de texto en formato oficial para el aplicativo DGR San Juan"
              >
                <i className="fa-solid fa-file-code text-emerald-400"></i>
                <span>TXT DGR</span>
              </button>

              <a
                href={spreadsheetUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-950/50 hover:bg-emerald-900/70 border border-emerald-600/60 text-emerald-300 transition-all shadow-xs"
                title="Abrir la planilla vinculada en Google Sheets"
              >
                <i className="fa-solid fa-table text-emerald-400"></i>
                <span>Ver Sheets</span>
                <i className="fa-solid fa-arrow-up-right-from-square text-[10px] ml-0.5 opacity-80"></i>
              </a>

              <button
                type="button"
                onClick={() => setShowSettingsModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 transition-all hover:border-orange-500/50"
                title="Configuración de URLs, firma digital y respaldos"
              >
                <i className="fa-solid fa-gear text-slate-400"></i>
                <span>Configuración</span>
              </button>

              <button
                type="button"
                onClick={handleLockSession}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-rose-950/70 border border-slate-700 hover:border-rose-500/50 text-slate-300 hover:text-rose-300 transition-all"
                title="Bloquear acceso y volver a pedir contraseña"
              >
                <i className="fa-solid fa-lock text-slate-400"></i>
                <span className="hidden md:inline">Bloquear</span>
              </button>
            </div>
          </div>
        </header>

        {/* CONTENIDO PRINCIPAL */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full flex-1">
          {/* BANNER DE RECUPERACIÓN (PUNTO DE RETORNO LOCAL) */}
          <RecoveryBanner
            lastCert={lastGeneratedCert}
            onRetryEmail={() => {
              if (!lastGeneratedCert) return;
              handleOpenResendModal(
                lastGeneratedCert.retention,
                lastGeneratedCert.pdfBase64,
                lastGeneratedCert.pdfFilename,
                lastGeneratedCert.recipients,
                lastGeneratedCert.sheetStatus
              );
            }}
            onRetrySheet={() => {
              if (!lastGeneratedCert) return;
              handleRetrySyncItem(lastGeneratedCert.retention.id);
            }}
            onDownloadSavedPdf={() => {
              if (!lastGeneratedCert?.pdfBase64) return;
              downloadPdfFromBase64(lastGeneratedCert.pdfBase64, lastGeneratedCert.pdfFilename);
              showToast(`Descargando ${lastGeneratedCert.pdfFilename}...`);
            }}
            onDismiss={() => setLastGeneratedCert(null)}
          />

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* COLUMNA IZQUIERDA: FORMULARIO DE EMISIÓN */}
            <section className="lg:col-span-7 space-y-6">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 relative">
                <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-5">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-orange-50 border border-orange-200 flex items-center justify-center text-bailac">
                      <i className="fa-solid fa-pen-nib text-sm"></i>
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-slate-800">Emisión de Comprobante</h2>
                      <p className="text-xs text-slate-500">
                        Completa los datos del sujeto retenido y la factura de origen
                      </p>
                    </div>
                  </div>

                  {/* Selector de Prefijo (RET- / 001-) */}
                  <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs">
                    <span className="text-[10px] font-bold text-slate-500 px-1">Formato:</span>
                    <button
                      type="button"
                      onClick={() => setNumberPrefix('RET')}
                      className={`px-2 py-0.5 rounded font-mono font-bold text-xs transition-colors ${
                        numberPrefix === 'RET'
                          ? 'bg-white text-bailac shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      RET-
                    </button>
                    <button
                      type="button"
                      onClick={() => setNumberPrefix('001')}
                      className={`px-2 py-0.5 rounded font-mono font-bold text-xs transition-colors ${
                        numberPrefix === '001'
                          ? 'bg-white text-bailac shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      001-
                    </button>
                  </div>
                </div>

                <form onSubmit={handlePrepareEmitRetention} className="space-y-4">
                  {/* BUSCADOR Y AUTOCOMPLETADO DE PROVEEDORES */}
                  <div className="relative">
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                        Buscar Sujeto Retenido (CUIT o Razón Social)
                      </label>
                      <span className="text-[11px] text-slate-400">
                        {knownSubjects.length} proveedores disponibles
                      </span>
                    </div>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <i className="fa-solid fa-magnifying-glass text-xs"></i>
                      </div>
                      <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => {
                          setSearchTerm(e.target.value);
                          setShowDropdown(true);
                        }}
                        onFocus={() => setShowDropdown(true)}
                        placeholder="Escribe el nombre o CUIT para buscar entre proveedores reales..."
                        className="w-full pl-9 pr-8 py-2 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-bailac transition-all"
                      />
                      {searchTerm && (
                        <button
                          type="button"
                          onClick={() => {
                            setSearchTerm('');
                            setShowDropdown(false);
                          }}
                          className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                        >
                          <i className="fa-solid fa-xmark text-xs"></i>
                        </button>
                      )}
                    </div>

                    {showDropdown && filteredSubjects.length > 0 && (
                      <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden max-h-56 overflow-y-auto">
                        <div className="px-3 py-1.5 bg-slate-50 text-[10px] font-semibold text-slate-500 border-b border-slate-100 flex justify-between">
                          <span>Sujetos encontrados ({filteredSubjects.length})</span>
                          <span>Haz clic para autocompletar</span>
                        </div>
                        {filteredSubjects.map((s, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => handleSelectSubject(s)}
                            className="w-full text-left px-3 py-2.5 hover:bg-orange-50/70 border-b border-slate-100 last:border-0 transition-colors flex items-center justify-between group"
                          >
                            <div>
                              <p className="text-xs font-bold text-slate-800 group-hover:text-bailac">
                                {s.razonSocial}
                              </p>
                              <p className="text-[11px] text-slate-500 font-mono">
                                CUIT: {s.cuit} · IIBB: {s.nroIIBB || 'N/A'}
                              </p>
                            </div>
                            <div className="text-right">
                              <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700 group-hover:bg-orange-100 group-hover:text-orange-800">
                                {s.taxType === 'IIBB' ? 'Local' : 'CM'} ({s.alicuota}%)
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* DATOS DEL SUJETO RETENIDO */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        CUIT del Proveedor <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={cuit}
                        onChange={(e) => setCuit(e.target.value)}
                        placeholder="30-71155040-9"
                        className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-bailac font-mono transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Razón Social / Denominación <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={razonSocial}
                        onChange={(e) => setRazonSocial(e.target.value)}
                        placeholder="Nombre comercial o social"
                        className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-bailac uppercase transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        N° Inscripción IIBB
                      </label>
                      <input
                        type="text"
                        value={nroIIBB}
                        onChange={(e) => setNroIIBB(e.target.value)}
                        placeholder="N° de inscripción o CUIT"
                        className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-bailac font-mono transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Domicilio Fiscal
                      </label>
                      <input
                        type="text"
                        value={domicilio}
                        onChange={(e) => setDomicilio(e.target.value)}
                        placeholder="Ej: Av. Benavidez 950 Este - San Juan"
                        className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-bailac transition-all"
                      />
                    </div>
                  </div>

                  {/* SELECTOR DE RÉGIMEN TRIBUTARIO */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Régimen Tributario Aplicable (data.taxType)
                    </label>
                    <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1.5 rounded-xl border border-slate-200">
                      <button
                        type="button"
                        onClick={() => setTaxType('CM')}
                        className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                          taxType === 'CM'
                            ? 'bg-white text-bailac shadow-sm border border-slate-200'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <i className="fa-solid fa-map-location-dot"></i>
                        <span>Convenio Multilateral (CM)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setTaxType('IIBB')}
                        className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                          taxType === 'IIBB'
                            ? 'bg-white text-bailac shadow-sm border border-slate-200'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <i className="fa-solid fa-building-columns"></i>
                        <span>IIBB Local (San Juan)</span>
                      </button>
                    </div>
                  </div>

                  {/* DATOS DE FACTURA Y FECHA */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        N° Comprobante / Factura Origen (data.nroFactura)
                      </label>
                      <input
                        type="text"
                        value={nroFactura}
                        onChange={(e) => setNroFactura(e.target.value)}
                        placeholder="Ej: FC A 0001-00001234"
                        className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-bailac font-mono uppercase transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Fecha de Emisión (data.date)
                      </label>
                      <input
                        type="date"
                        value={fechaEmision}
                        onChange={(e) => setFechaEmision(e.target.value)}
                        className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-bailac transition-all"
                      />
                    </div>
                  </div>

                  {/* BASE IMPONIBLE Y ALÍCUOTA */}
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-1">
                    <div className="sm:col-span-7">
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Base Imponible ($) (data.baseImponible){' '}
                        <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500 font-bold">
                          $
                        </div>
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          required
                          value={baseImponible}
                          onChange={(e) => setBaseImponible(e.target.value)}
                          placeholder="0.00"
                          className="w-full pl-8 pr-3 py-2 text-sm font-mono font-bold text-slate-800 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-bailac transition-all"
                        />
                      </div>
                    </div>

                    <div className="sm:col-span-5">
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Alícuota (%) (data.alicuota) <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          max="100"
                          required
                          value={alicuota}
                          onChange={(e) => setAlicuota(e.target.value)}
                          placeholder="2.00"
                          className="w-full pr-8 pl-3 py-2 text-sm font-mono font-bold text-slate-800 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-bailac transition-all"
                        />
                        <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-500 font-bold">
                          %
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Presets Rápidos */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] text-slate-400 font-medium">
                      Alícuotas habituales:
                    </span>
                    {[0.5, 0.8, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5].map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setAlicuota(val.toFixed(2))}
                        className={`text-xs px-2.5 py-0.5 rounded-md font-semibold border transition-all ${
                          parseFloat(alicuota) === val
                            ? 'bg-orange-500 text-white border-orange-500'
                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        {val.toFixed(1)}%
                      </button>
                    ))}
                  </div>

                  {/* CÁLCULO EN TIEMPO REAL */}
                  <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl p-4 text-white shadow-md border border-slate-700/80">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs uppercase font-bold tracking-wider text-orange-400">
                        Total Importe Retenido (data.total)
                      </span>
                      <span className="text-[10px] text-slate-300 font-mono bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                        Base × (Alícuota / 100)
                      </span>
                    </div>

                    <div className="flex items-baseline justify-between mt-2">
                      <span className="text-3xl font-black text-white font-mono tracking-tight">
                        {formatCurrency(totalRetenido)}
                      </span>
                      <span className="text-xs text-slate-400">
                        Base: {formatCurrency(parseFloat(baseImponible) || 0)}
                      </span>
                    </div>

                    {totalRetenido > 0 && (
                      <div className="mt-2.5 pt-2.5 border-t border-slate-700/70 text-xs text-slate-300">
                        <span className="font-bold text-orange-300">SON PESOS: </span>
                        <span className="font-medium uppercase">{numeroALetras(totalRetenido)}</span>
                      </div>
                    )}
                  </div>

                  {/* OBSERVACIONES */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Observaciones (data.observaciones)
                    </label>
                    <input
                      type="text"
                      value={observaciones}
                      onChange={(e) => setObservaciones(e.target.value)}
                      placeholder="Ej: es el 50% del neto por el 1%"
                      className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-bailac transition-all"
                    />
                  </div>

                  {/* FIRMA DIGITAL */}
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <i className="fa-solid fa-signature text-bailac text-sm"></i>
                        <span className="text-xs font-bold text-slate-800">
                          Firma Digital del Agente de Retención
                        </span>
                      </div>
                      {digitalSignature && (
                        <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 flex items-center gap-1">
                          <i className="fa-solid fa-check"></i> Activa
                        </span>
                      )}
                    </div>

                    {digitalSignature ? (
                      <div className="flex items-center justify-between gap-4 bg-white p-2.5 rounded-lg border border-slate-200">
                        <div className="flex items-center gap-3">
                          <div className="w-20 h-10 bg-slate-100 rounded border border-slate-200 p-1 flex items-center justify-center overflow-hidden">
                            <img
                              src={digitalSignature}
                              alt="Firma Digital"
                              className="max-h-full object-contain"
                            />
                          </div>
                          <span className="text-xs text-slate-600">
                            Firma guardada (se estampará en el PDF)
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={handleRemoveSignature}
                          className="text-xs text-rose-600 hover:text-rose-700 font-semibold px-2 py-1 rounded hover:bg-rose-50"
                        >
                          <i className="fa-solid fa-trash mr-1"></i> Quitar
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs text-slate-500">
                          Carga una imagen PNG o JPG con el sello y firma del responsable
                        </span>
                        <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 shadow-sm transition-all">
                          <i className="fa-solid fa-upload text-slate-500"></i>
                          <span>Cargar Firma</span>
                          <input
                            type="file"
                            ref={fileInputRef}
                            accept="image/png, image/jpeg"
                            onChange={handleSignatureUpload}
                            className="hidden"
                          />
                        </label>
                      </div>
                    )}
                  </div>

                  {/* NUEVA SECCIÓN: ENVÍO POR CORREO ELECTRÓNICO */}
                  <EmailRecipientsCard
                    sendEmailEnabled={sendEmailEnabled}
                    onToggleSendEmail={setSendEmailEnabled}
                    selectedDefaults={selectedDefaults}
                    onToggleDefaultEmail={handleToggleDefaultEmail}
                    extraEmails={extraEmails}
                    onAddExtraEmail={handleAddExtraEmail}
                    onRemoveExtraEmail={handleRemoveExtraEmail}
                    savedEmails={savedEmails}
                    selectedSavedEmails={selectedSavedEmails}
                    onToggleSavedEmail={handleToggleSavedEmail}
                    onDeleteSavedEmail={handleDeleteSavedEmail}
                    totalSelectedCount={combinedSelectedRecipients.length}
                  />

                  {/* EMISIÓN Y AUTO-SYNC */}
                  <div className="pt-2 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={autoSyncSheets}
                          onChange={(e) => setAutoSyncSheets(e.target.checked)}
                          className="w-4 h-4 text-orange-500 border-slate-300 rounded focus:ring-orange-500"
                        />
                        <span className="text-xs text-slate-600">
                          Sincronizar a Google Sheets automáticamente al emitir
                        </span>
                      </label>

                      <span className="text-[11px] text-emerald-600 font-semibold">
                        <i className="fa-solid fa-check mr-1"></i> Webhook activo
                      </span>
                    </div>

                    <button
                      type="submit"
                      className="w-full py-3.5 px-6 rounded-xl font-bold text-white bg-bailac hover:bg-bailac-600 active:scale-[0.99] shadow-lg shadow-orange-500/25 transition-all flex items-center justify-center gap-2 text-sm cursor-pointer"
                    >
                      <i className="fa-solid fa-file-pdf text-base"></i>
                      <span>
                        {sendEmailEnabled && combinedSelectedRecipients.length > 0
                          ? `Revisar, Emitir y Enviar PDF (${currentFormattedNumber})`
                          : `Emitir y Descargar Comprobante PDF (${currentFormattedNumber})`}
                      </span>
                    </button>
                  </div>
                </form>
              </div>
            </section>

            {/* COLUMNA DERECHA: HISTORIAL RECIENTE */}
            <section className="lg:col-span-5 space-y-4">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold text-slate-800">Comprobantes Emitidos</h2>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                      {retentions.length}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleUpdateFromSheets}
                      disabled={isUpdatingFromSheets}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all border border-slate-200 active:scale-95"
                      title="Consulta la planilla remota para sincronizar sujetos y verificar las últimas 5 filas"
                    >
                      <i
                        className={`fa-solid fa-arrows-rotate text-bailac ${
                          isUpdatingFromSheets ? 'fa-spin' : ''
                        }`}
                      ></i>
                      <span>Actualizar (5)</span>
                    </button>
                  </div>
                </div>

                {/* Filtro */}
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <i className="fa-solid fa-filter text-xs"></i>
                  </div>
                  <input
                    type="text"
                    value={historyFilter}
                    onChange={(e) => setHistoryFilter(e.target.value)}
                    placeholder="Filtrar por proveedor, CUIT o N°..."
                    className="w-full pl-8 pr-8 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-bailac transition-all"
                  />
                  {historyFilter && (
                    <button
                      type="button"
                      onClick={() => setHistoryFilter('')}
                      className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600"
                    >
                      <i className="fa-solid fa-xmark text-xs"></i>
                    </button>
                  )}
                </div>
              </div>

              {/* Tarjetas del Historial */}
              <div className="space-y-3 max-h-[calc(100vh-250px)] overflow-y-auto pr-1">
                {filteredRetentions.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-8 text-center">
                    <div className="w-12 h-12 bg-orange-50 text-bailac rounded-full flex items-center justify-center mx-auto mb-3">
                      <i className="fa-solid fa-folder-open text-xl"></i>
                    </div>
                    <h3 className="text-sm font-bold text-slate-700">Sin comprobantes</h3>
                    <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                      {retentions.length === 0
                        ? 'Aún no has emitido ningún comprobante. Completa el formulario de la izquierda o recupera uno por fila.'
                        : 'No se encontraron comprobantes que coincidan con la búsqueda.'}
                    </p>
                  </div>
                ) : (
                  filteredRetentions.map((ret) => (
                    <div
                      key={ret.id || ret.retentionNumber}
                      className="bg-white rounded-xl border border-slate-200 hover:border-orange-300 shadow-sm p-4 transition-all space-y-3 group"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                            {ret.retentionNumber || ret.numeroFormateado}
                          </span>
                          <span className="text-[11px] text-slate-500">
                            {formatDateAR(ret.date || ret.fecha)}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 flex-wrap">
                          {/* Estado Mail */}
                          {ret.emailStatus === 'sent' && (
                            <span
                              className="inline-flex items-center gap-1 text-[10px] font-semibold text-sky-700 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-full"
                              title={
                                ret.emailRecipients?.length
                                  ? `Enviado a: ${ret.emailRecipients.join(', ')}`
                                  : 'Correo enviado'
                              }
                            >
                              <i className="fa-solid fa-envelope-circle-check"></i>
                              <span>Mail OK</span>
                            </span>
                          )}
                          {ret.emailStatus === 'error' && (
                            <button
                              type="button"
                              onClick={() => handleOpenResendModal(ret)}
                              className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-2 py-0.5 rounded-full transition-colors"
                              title={ret.emailError || 'Error de envío. Clic para reintentar'}
                            >
                              <i className="fa-solid fa-triangle-exclamation"></i>
                              <span>Mail Error</span>
                            </button>
                          )}

                          {/* Estado Sheets */}
                          {ret.syncedWithSheets ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                              <i className="fa-solid fa-cloud-check"></i>
                              <span>Sheets {ret.sheetRow ? `(#${ret.sheetRow})` : ''}</span>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleRetrySyncItem(ret.id)}
                              className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-full transition-colors"
                              title="Haga clic para sincronizar este comprobante con Google Sheets"
                            >
                              <i className="fa-solid fa-cloud-arrow-up"></i>
                              <span>Pendiente (Sincronizar)</span>
                            </button>
                          )}
                        </div>
                      </div>

                      <div>
                        <h4 className="text-xs font-bold text-slate-800 leading-tight">
                          {ret.razonSocial}
                        </h4>
                        <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5 font-mono">
                          <span>CUIT: {ret.cuit}</span>
                          <span>·</span>
                          <span>Factura: {ret.nroFactura || ret.facturaOrigen || 'N/A'}</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                        <div>
                          <div className="text-[10px] text-slate-400">
                            Base: {formatCurrency(ret.baseImponible)} ({ret.alicuota}%)
                          </div>
                          <div className="text-sm font-black text-bailac font-mono">
                            {formatCurrency(ret.total || ret.importeRetenido)}
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleOpenResendModal(ret)}
                            className="p-2 text-slate-500 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition-colors text-xs"
                            title="Enviar o reenviar comprobante por correo"
                          >
                            <i className="fa-solid fa-paper-plane"></i>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDownloadSinglePDF(ret)}
                            className="p-2 text-slate-500 hover:text-bailac hover:bg-orange-50 rounded-lg transition-colors text-xs"
                            title="Descargar comprobante en PDF"
                          >
                            <i className="fa-solid fa-download"></i>
                          </button>

                          {!ret.syncedWithSheets && (
                            <button
                              type="button"
                              onClick={() => handleRetrySyncItem(ret.id)}
                              className="p-2 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors text-xs"
                              title="Reintentar subir a Sheets"
                            >
                              <i className="fa-solid fa-rotate"></i>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleDeleteRetention(ret.id)}
                            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors text-xs"
                            title="Eliminar del historial local"
                          >
                            <i className="fa-solid fa-trash-can"></i>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        </main>

        {/* PIE DE PÁGINA */}
        <footer className="bg-slate-900 border-t border-slate-800 text-slate-400 text-xs py-4 mt-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-200">BAILAC ARGENTINA S.R.L.</span>
              <span>·</span>
              <span>Agente de Retención DGR San Juan</span>
              <span>·</span>
              <span className="font-mono">Av. Benavidez 950 Este</span>
            </div>
            <div className="flex items-center gap-4 text-[11px]">
              <a
                href={spreadsheetUrl}
                target="_blank"
                rel="noreferrer"
                className="hover:text-emerald-400 transition-colors flex items-center gap-1"
              >
                <i className="fa-solid fa-table"></i>
                <span>Planilla Google Sheets</span>
              </a>
              <span>·</span>
              <button
                type="button"
                onClick={() => setShowGasCodeModal(true)}
                className="hover:text-orange-400 transition-colors"
              >
                <i className="fa-solid fa-code mr-1"></i> Ver Código Apps Script
              </button>
              <span>·</span>
              <span>v2.0 · Envío Email + Sheets</span>
            </div>
          </div>
        </footer>

        {/* MODAL DE CONFIRMACIÓN, ESTADO Y REINTENTO */}
        {emissionModal.isOpen && emissionModal.retention && (
          <ConfirmEmissionModal
            isOpen={emissionModal.isOpen}
            mode={emissionModal.mode}
            step={emissionModal.step}
            retention={emissionModal.retention}
            pdfFilename={emissionModal.pdfFilename}
            saveToSheet={emissionModal.saveToSheet}
            sendEmail={emissionModal.sendEmail}
            recipients={emissionModal.recipients}
            sheetStatus={emissionModal.sheetStatus}
            sheetError={emissionModal.sheetError}
            sheetRow={emissionModal.sheetRow}
            emailStatus={emissionModal.emailStatus}
            emailError={emissionModal.emailError}
            sentTo={emissionModal.sentTo}
            remainingQuota={emissionModal.remainingQuota}
            onCancel={() => setEmissionModal(INITIAL_MODAL_STATE)}
            onConfirmEmit={handleConfirmAndExecuteEmit}
            onRetryEmailOnly={handleRetryEmailOnly}
            onRetrySheetOnly={handleRetrySheetFromModal}
            onDownloadPdfAgain={() => {
              if (emissionModal.pdfBase64) {
                downloadPdfFromBase64(emissionModal.pdfBase64, emissionModal.pdfFilename);
                showToast(`Descargando ${emissionModal.pdfFilename}...`);
              } else if (emissionModal.retention) {
                handleDownloadSinglePDF(emissionModal.retention);
              }
            }}
          />
        )}

        {/* MODAL 1: CONFIGURACIÓN GENERAL */}
        {showSettingsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
            <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 border border-slate-200 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <i className="fa-solid fa-gear text-bailac"></i>
                  <h3 className="font-bold text-slate-800">Configuración del Sistema</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSettingsModal(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <i className="fa-solid fa-xmark"></i>
                </button>
              </div>

              <div className="space-y-4 py-4 text-xs">
                {/* Google Sheets Link Directo */}
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                  <label className="block font-bold text-emerald-900 mb-1">
                    <i className="fa-solid fa-table mr-1.5 text-emerald-600"></i>
                    Planilla de Google Sheets Vinculada:
                  </label>
                  <div className="flex items-center gap-2 mt-1.5">
                    <input
                      type="url"
                      value={spreadsheetUrl}
                      onChange={(e) => setSpreadsheetUrl(e.target.value.trim())}
                      className="w-full px-2.5 py-1.5 bg-white border border-emerald-300 rounded-lg text-[11px] font-mono text-slate-700 focus:outline-none"
                    />
                    <a
                      href={spreadsheetUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs flex items-center gap-1 shadow-xs"
                    >
                      <span>Abrir</span>
                      <i className="fa-solid fa-arrow-up-right-from-square text-[10px]"></i>
                    </a>
                  </div>
                </div>

                {/* Webhook Apps Script Exec URL */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block font-bold text-slate-700">
                      URL del Webhook de Google Apps Script (Exec)
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setGoogleSheetUrl(DEFAULT_APPSCRIPT_URL);
                        showToast('URL oficial restablecida');
                      }}
                      className="text-[11px] text-bailac font-semibold hover:underline"
                    >
                      Restablecer URL Oficial
                    </button>
                  </div>
                  <input
                    type="url"
                    value={googleSheetUrl}
                    onChange={(e) => setGoogleSheetUrl(e.target.value.trim())}
                    placeholder="https://script.google.com/macros/s/.../exec"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:border-bailac focus:outline-none font-mono text-xs"
                  />
                  <div className="flex items-center gap-2 mt-2">
                    <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 font-semibold">
                      <i className="fa-solid fa-check"></i> Conexión Verificada
                    </span>
                    <button
                      type="button"
                      onClick={handleUpdateFromSheets}
                      className="text-xs text-slate-600 hover:text-slate-900 underline"
                    >
                      Probar Sincronización Ahora
                    </button>
                  </div>
                </div>

                <hr className="border-slate-100" />

                {/* Firma Digital */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Firma Digital del Agente
                  </label>
                  {digitalSignature ? (
                    <div className="flex items-center justify-between bg-slate-50 p-2 rounded-lg border border-slate-200">
                      <img src={digitalSignature} alt="Firma" className="h-10 object-contain" />
                      <button
                        type="button"
                        onClick={handleRemoveSignature}
                        className="text-rose-600 font-semibold hover:underline"
                      >
                        Eliminar firma
                      </button>
                    </div>
                  ) : (
                    <label className="cursor-pointer block text-center p-3 border-2 border-dashed border-slate-300 rounded-xl hover:border-bailac transition-colors">
                      <span className="text-slate-600">
                        Haz clic aquí para seleccionar imagen de firma (PNG/JPG)
                      </span>
                      <input
                        type="file"
                        accept="image/png, image/jpeg"
                        onChange={handleSignatureUpload}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>

                <hr className="border-slate-100" />

                {/* Respaldo JSON */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Respaldo Local de Datos
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const backup = {
                        retentions,
                        nextId,
                        numberPrefix,
                        googleSheetUrl,
                        spreadsheetUrl,
                        knownSubjects,
                        savedEmails
                      };
                      const blob = new Blob([JSON.stringify(backup, null, 2)], {
                        type: 'application/json'
                      });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `BAILAC_RESPALDO_${new Date().toISOString().slice(0, 10)}.json`;
                      a.click();
                      URL.revokeObjectURL(url);
                      showToast('Respaldo JSON descargado');
                    }}
                    className="w-full px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold transition-colors flex items-center justify-center gap-1.5"
                  >
                    <i className="fa-solid fa-database text-slate-500"></i>
                    <span>Exportar Respaldo Completo (JSON)</span>
                  </button>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowSettingsModal(false);
                    showToast('Configuración guardada en el navegador');
                  }}
                  className="px-4 py-2 bg-bailac hover:bg-bailac-600 text-white rounded-xl font-bold text-xs shadow-md transition-all"
                >
                  Guardar y Cerrar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL 2: REIMPRIMIR / RECUPERAR POR FILA */}
        {showRowSearchModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-slate-200">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <i className="fa-solid fa-magnifying-glass-location text-emerald-600"></i>
                  <h3 className="font-bold text-slate-800 text-sm">
                    Recuperar / Reimprimir por N° de Fila
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowRowSearchModal(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <i className="fa-solid fa-xmark"></i>
                </button>
              </div>

              <form onSubmit={handleFetchRowFromSheet} className="py-4 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Número de Fila en Google Sheets (ej: 135)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="2"
                      required
                      value={searchRowNum}
                      onChange={(e) => setSearchRowNum(e.target.value)}
                      placeholder="Ej: 135"
                      className="w-full px-3 py-2 font-mono font-bold text-sm border border-slate-300 rounded-xl focus:border-bailac focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={isSearchingRow}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-md shrink-0 disabled:opacity-50"
                    >
                      {isSearchingRow ? (
                        <i className="fa-solid fa-circle-notch fa-spin"></i>
                      ) : (
                        <span>Consultar Fila</span>
                      )}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Consulta directamente la fila de la planilla conectada.
                  </p>
                </div>

                {foundRowRetention && (
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                      <span className="font-mono text-xs font-bold text-bailac">
                        {foundRowRetention.retentionNumber}
                      </span>
                      <span className="text-[11px] text-slate-500">
                        {formatDateAR(foundRowRetention.fecha)}
                      </span>
                    </div>
                    <div className="text-xs space-y-1">
                      <p className="font-bold text-slate-800">{foundRowRetention.razonSocial}</p>
                      <p className="font-mono text-slate-500">CUIT: {foundRowRetention.cuit}</p>
                      <p className="text-slate-600">
                        Factura: {foundRowRetention.nroFactura || 'N/A'}
                      </p>
                      <p className="font-bold text-slate-900 mt-1">
                        Total Retenido:{' '}
                        <span className="text-bailac font-mono text-sm">
                          {formatCurrency(foundRowRetention.total)}
                        </span>
                      </p>
                    </div>

                    <div className="flex items-center gap-2 pt-2 border-t border-slate-200 flex-wrap">
                      <button
                        type="button"
                        onClick={() => handleDownloadSinglePDF(foundRowRetention)}
                        className="flex-1 py-2 bg-bailac hover:bg-bailac-600 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs"
                      >
                        <i className="fa-solid fa-download"></i>
                        <span>Descargar PDF</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowRowSearchModal(false);
                          handleOpenResendModal(foundRowRetention);
                        }}
                        className="px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold flex items-center gap-1"
                      >
                        <i className="fa-solid fa-paper-plane"></i>
                        <span>Enviar Mail</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleImportFoundRowToHistory}
                        className="px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-xs font-semibold"
                      >
                        Al Historial
                      </button>
                    </div>
                  </div>
                )}
              </form>

              <div className="pt-2 border-t border-slate-100 flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowRowSearchModal(false)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL 3: EDITAR CORRELATIVO */}
        {showCorrelativeModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
            <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-5 border border-slate-200">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h3 className="font-bold text-slate-800 text-sm">Modificar Próximo Correlativo</h3>
                <button
                  type="button"
                  onClick={() => setShowCorrelativeModal(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <i className="fa-solid fa-xmark"></i>
                </button>
              </div>

              <form onSubmit={handleSaveCorrelative} className="py-4 space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Número Correlativo Siguiente
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-slate-500 bg-slate-100 px-3 py-2 rounded-xl border border-slate-200">
                      {numberPrefix}-
                    </span>
                    <input
                      type="number"
                      min="1"
                      required
                      value={tempNextId}
                      onChange={(e) => setTempNextId(e.target.value)}
                      className="w-full px-3 py-2 font-mono font-bold text-sm border border-slate-300 rounded-xl focus:border-bailac focus:outline-none"
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1.5">
                    Próximo comprobante será:{' '}
                    <strong className="font-mono text-slate-700">
                      {numberPrefix}-
                      {String(tempNextId).padStart(numberPrefix === 'RET' ? 6 : 8, '0')}
                    </strong>
                  </p>
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowCorrelativeModal(false)}
                    className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold text-xs"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-bailac hover:bg-bailac-600 text-white rounded-xl font-bold text-xs shadow-md"
                  >
                    Guardar Correlativo
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL 4: EXPORTAR TXT DGR SAN JUAN */}
        {showTxtModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
            <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 border border-slate-200">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <i className="fa-solid fa-file-code text-emerald-600"></i>
                  <h3 className="font-bold text-slate-800 text-sm">
                    Exportar Archivo TXT para DGR San Juan
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowTxtModal(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <i className="fa-solid fa-xmark"></i>
                </button>
              </div>

              <div className="py-4 space-y-4 text-xs">
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-900 leading-relaxed">
                  <p className="font-bold mb-1">
                    <i className="fa-solid fa-circle-check mr-1 text-emerald-600"></i>
                    Formato oficial de ancho fijo para aplicativo de DGR San Juan:
                  </p>
                  <p>
                    El archivo contendrá los <strong>{retentions.length}</strong> comprobantes
                    actualmente emitidos en el historial, formateados con CUITs limpios a 11 dígitos,
                    fechas en formato DD/MM/AAAA, importes a 12 caracteres y Razón Social a 40
                    caracteres.
                  </p>
                </div>

                <div className="bg-slate-900 text-slate-300 p-3 rounded-xl font-mono text-[10px] space-y-1 overflow-x-auto">
                  <div className="text-slate-500">// Formato de registro:</div>
                  <div className="text-emerald-400">
                    {retentions[0]
                      ? `${(retentions[0].cuit || '').replace(/[^0-9]/g, '').padStart(11, '0')}${formatDateAR(
                          retentions[0].date || retentions[0].fecha
                        )}0001${retentions[0].id.toString().padStart(8, '0')}30711550409${Math.round(
                          retentions[0].baseImponible * 100
                        )
                          .toString()
                          .padStart(12, '0')}${Math.round(retentions[0].alicuota * 100)
                          .toString()
                          .padStart(5, '0')}${Math.round(
                          (retentions[0].total || retentions[0].importeRetenido || 0) * 100
                        )
                          .toString()
                          .padStart(12, '0')}CM ${(retentions[0].razonSocial || '').substring(
                          0,
                          30
                        )}...`
                      : 'No hay comprobantes cargados.'}
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowTxtModal(false)}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold text-xs"
                >
                  Cerrar
                </button>
                <button
                  type="button"
                  onClick={handleGenerateTxtDgr}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-md flex items-center gap-1.5"
                >
                  <i className="fa-solid fa-download"></i>
                  <span>Descargar TXT DGR San Juan</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL 5: CÓDIGO GOOGLE APPS SCRIPT ACTUALIZADO */}
        {showGasCodeModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 border border-slate-200 max-h-[85vh] flex flex-col">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <i className="fa-solid fa-code text-bailac"></i>
                  <h3 className="font-bold text-slate-800 text-sm">
                    Código Google Apps Script v2.0 (Sheets + Envío de Mail)
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowGasCodeModal(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <i className="fa-solid fa-xmark"></i>
                </button>
              </div>

              <div className="py-3 text-xs text-slate-600 space-y-1">
                <p>
                  Copia este código en <strong>Code.gs</strong> dentro de tu proyecto de Google Apps
                  Script y publica una nueva versión en <em>Implementar → Gestionar implementaciones</em>.
                </p>
              </div>

              <div className="relative flex-1 min-h-[260px] bg-slate-900 rounded-xl p-3 overflow-y-auto">
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(appsScriptCode);
                    showToast('Código Code.gs copiado al portapapeles');
                  }}
                  className="sticky top-0 float-right px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded text-[11px] font-semibold border border-slate-700"
                >
                  <i className="fa-solid fa-copy mr-1"></i> Copiar Código
                </button>
                <pre className="text-[11px] font-mono text-emerald-400 leading-relaxed whitespace-pre">
                  {appsScriptCode}
                </pre>
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowGasCodeModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-bold text-xs"
                >
                  Entendido
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* MODAL DE BLOQUEO / LOGIN CON CONTRASEÑA */}
      {!isAuthenticated && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-labelledby="login-modal-title"
        >
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200">
            <div className="bg-slate-900 px-6 py-5 text-white border-b-4 border-bailac flex items-center gap-3.5">
              <div className="w-11 h-11 bg-bailac rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/25 shrink-0">
                <i className="fa-solid fa-shield-halved text-xl text-white"></i>
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-black text-lg tracking-tight text-white">BAILAC</span>
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-bailac/20 text-orange-400 border border-orange-500/30">
                    San Juan
                  </span>
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    v3 · Envío de Correos
                  </span>
                </div>
                <h2 id="login-modal-title" className="text-xs text-slate-300 font-medium mt-0.5">
                  Sistema de Emisión de Retenciones IIBB / CM
                </h2>
              </div>
            </div>

            <form onSubmit={handleLoginSubmit} className="p-6 space-y-4">
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600">
                <i className="fa-solid fa-lock text-bailac mt-0.5"></i>
                <div>
                  <p className="font-semibold text-slate-700">
                    Acceso protegido · Versión 3 con envío automático por correo
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Ingresá la contraseña para habilitar el sistema.
                  </p>
                </div>
              </div>

              <div>
                <label
                  htmlFor="access-password-input"
                  className="block text-xs font-bold text-slate-700 mb-1.5"
                >
                  Contraseña de Acceso
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 pointer-events-none">
                    <i className="fa-solid fa-key text-xs"></i>
                  </span>
                  <input
                    id="access-password-input"
                    type={showLoginPassword ? 'text' : 'password'}
                    autoFocus
                    required
                    value={loginPassword}
                    onChange={(e) => {
                      setLoginPassword(e.target.value);
                      if (loginError) setLoginError('');
                    }}
                    placeholder="Ingresá la contraseña..."
                    className={`w-full pl-9 pr-10 py-2.5 text-sm rounded-xl border focus:outline-none transition-colors ${
                      loginError
                        ? 'border-rose-400 bg-rose-50/40 focus:border-rose-500'
                        : 'border-slate-300 focus:border-bailac'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPassword((prev) => !prev)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600"
                    title={showLoginPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  >
                    <i
                      className={`fa-solid ${showLoginPassword ? 'fa-eye-slash' : 'fa-eye'} text-sm`}
                    ></i>
                  </button>
                </div>
                {loginError && (
                  <p className="mt-2 text-xs font-semibold text-rose-600 flex items-center gap-1.5">
                    <i className="fa-solid fa-circle-exclamation"></i>
                    <span>{loginError}</span>
                  </p>
                )}
              </div>

              <button
                type="submit"
                className="w-full py-2.5 px-4 bg-bailac hover:bg-bailac-600 text-white font-bold text-sm rounded-xl shadow-md shadow-orange-500/20 transition-all flex items-center justify-center gap-2"
              >
                <i className="fa-solid fa-right-to-bracket"></i>
                <span>Ingresar al Sistema</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </React.Fragment>
  );
}
