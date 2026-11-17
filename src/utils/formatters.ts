// --- CONVERSOR DE NÚMEROS A LETRAS EN ESPAÑOL ---
export function numeroALetras(monto: number): string {
  if (isNaN(monto) || monto === null) return '';
  const entero = Math.floor(Math.abs(monto));
  const decimales = Math.round((Math.abs(monto) - entero) * 100);

  const Unidades = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
  const Decenas = ['', 'DIEZ', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
  const Dieces = ['DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISEIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'];
  const Veintes = ['VEINTE', 'VEINTIUNO', 'VEINTIDOS', 'VEINTITRES', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISEIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE'];
  const Centenas = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

  function resolverTresCifras(num: number): string {
    if (num === 0) return '';
    if (num === 100) return 'CIEN';
    let out = '';
    const c = Math.floor(num / 100);
    const d = Math.floor((num % 100) / 10);
    const u = num % 10;

    if (c > 0) out += Centenas[c] + ' ';

    const decYUnid = num % 100;
    if (decYUnid >= 10 && decYUnid <= 19) {
      out += Dieces[decYUnid - 10];
    } else if (decYUnid >= 20 && decYUnid <= 29) {
      out += Veintes[decYUnid - 20];
    } else {
      if (d > 0) {
        out += Decenas[d];
        if (u > 0) out += ' Y ' + Unidades[u];
      } else if (u > 0) {
        out += Unidades[u];
      }
    }
    return out.trim();
  }

  function seccion(num: number, divisor: number, strSingular: string, strPlural: string) {
    const cientos = Math.floor(num / divisor);
    const resto = num - cientos * divisor;
    let letras = '';
    if (cientos > 0) {
      if (cientos > 1) {
        letras = resolverTresCifras(cientos) + ' ' + strPlural;
      } else {
        letras = strSingular;
      }
    }
    return { letras, resto };
  }

  if (entero === 0) {
    return `CERO CON ${decimales.toString().padStart(2, '0')}/100`;
  }

  let res = '';
  let temp = entero;

  const millones = seccion(temp, 1000000, 'UN MILLON', 'MILLONES');
  if (millones.letras) res += millones.letras + ' ';
  temp = millones.resto;

  const miles = seccion(temp, 1000, 'UN MIL', 'MIL');
  if (miles.letras) res += miles.letras + ' ';
  temp = miles.resto;

  if (temp > 0) {
    res += resolverTresCifras(temp);
  }

  const strCentavos = decimales.toString().padStart(2, '0');
  return `${res.trim()} CON ${strCentavos}/100`;
}

export const formatCurrency = (val: number | string): string => {
  const num = Number(val) || 0;
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(num);
};

export const formatDateAR = (isoString?: string): string => {
  if (!isoString) return '';
  try {
    if (typeof isoString === 'string' && isoString.includes('T')) {
      const d = new Date(isoString);
      return d.toLocaleDateString('es-AR');
    }
    const parts = String(isoString).split('-');
    if (parts.length === 3) return `${parts[2].slice(0, 2)}/${parts[1]}/${parts[0]}`;
    const d = new Date(isoString);
    return isNaN(d.getTime()) ? String(isoString) : d.toLocaleDateString('es-AR');
  } catch {
    return String(isoString);
  }
};

// --- GENERADOR DE NOMBRE DE ARCHIVO PDF ---
// Formato: RET-002948_Maquinarias_e_Insumos_Andinos_S_A.pdf
export const formatPdfFilename = (numberStr?: string, supplierName?: string): string => {
  const num = (numberStr || 'RET-000000').trim();
  const cleanName = (supplierName || 'Proveedor')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `${num}_${cleanName}.pdf`;
};

// --- VALIDACIÓN Y NORMALIZACIÓN DE EMAILS ---
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const normalizeEmail = (email: string): string => {
  return String(email || '').trim().toLowerCase();
};

export const isValidEmail = (email: string): boolean => {
  return EMAIL_REGEX.test(normalizeEmail(email));
};

// --- COMPRESIÓN SEGURA DE FIRMA DIGITAL ---
// Evita que imágenes muy pesadas inflen el PDF en base64 al enviarlo por Apps Script
export const compressSignatureImage = (dataUrl: string, maxWidth = 480): Promise<string> => {
  return new Promise((resolve) => {
    if (!dataUrl || dataUrl.length < 120_000) {
      resolve(dataUrl);
      return;
    }
    try {
      const img = new Image();
      img.onload = () => {
        try {
          const scale = img.width > maxWidth ? maxWidth / img.width : 1;
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(dataUrl);
            return;
          }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          // Mantener PNG para respetar transparencias en la firma
          const compressed = canvas.toDataURL('image/png');
          resolve(compressed.length < dataUrl.length ? compressed : dataUrl);
        } catch {
          resolve(dataUrl);
        }
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    } catch {
      resolve(dataUrl);
    }
  });
};
