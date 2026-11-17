import { DEFAULT_EMAIL_RECIPIENTS } from '../constants';
import { LastGeneratedCert } from '../types';
import { isValidEmail, normalizeEmail } from './formatters';

export const STORAGE_KEYS = {
  RETENTIONS: 'bailac_retentions',
  NEXT_ID: 'bailac_nextId',
  NUMBER_PREFIX: 'bailac_numberPrefix',
  APPSCRIPT_URL: 'bailac_googleSheetUrl',
  SPREADSHEET_URL: 'bailac_spreadsheetUrl',
  DIGITAL_SIGNATURE: 'bailac_digitalSignature',
  KNOWN_SUBJECTS: 'bailac_knownSubjects',
  SAVED_EMAILS: 'bailac_savedEmails',
  LAST_CERT: 'bailac_lastGeneratedCert',
  AUTH_SESSION: 'bailac_authenticated'
} as const;

export function safeLocalGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeLocalSet(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function safeLocalRemove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignorar si localStorage no está disponible
  }
}

export function safeLocalGetJSON<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function safeLocalSetJSON<T>(key: string, value: T): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function loadSavedEmails(): string[] {
  const rawList = safeLocalGetJSON<unknown>(STORAGE_KEYS.SAVED_EMAILS, []);
  if (!Array.isArray(rawList)) return [];

  const defaultSet = new Set(DEFAULT_EMAIL_RECIPIENTS.map(normalizeEmail));
  const seen = new Set<string>();
  const cleaned: string[] = [];

  for (const item of rawList) {
    if (typeof item !== 'string') continue;
    const normalized = normalizeEmail(item);
    if (!normalized || !isValidEmail(normalized)) continue;
    if (defaultSet.has(normalized) || seen.has(normalized)) continue;
    seen.add(normalized);
    cleaned.push(normalized);
  }
  return cleaned;
}

export function saveEmailsToStorage(emails: string[]): boolean {
  return safeLocalSetJSON(STORAGE_KEYS.SAVED_EMAILS, emails);
}

export function loadLastGeneratedCert(): LastGeneratedCert | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.LAST_CERT);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LastGeneratedCert;
    if (!parsed || !parsed.retention || !parsed.retention.retentionNumber) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveLastGeneratedCert(cert: LastGeneratedCert | null): boolean {
  if (!cert) {
    safeLocalRemove(STORAGE_KEYS.LAST_CERT);
    return true;
  }
  return safeLocalSetJSON(STORAGE_KEYS.LAST_CERT, cert);
}

export function safeSessionGet(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeSessionSet(key: string, value: string): void {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Ignorar errores de sessionStorage
  }
}

export function safeSessionRemove(key: string): void {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Ignorar errores de sessionStorage
  }
}
