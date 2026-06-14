// utils.js
import { ATTACHMENT_DELIMITER, GAS_URL, AUTH_TOKEN } from './config.js';

export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}
export function escapeAttr(str) { return escapeHtml(str).replace(/`/g, '&#96;'); }
export function moneyValue(val) { const n = Number(val || 0); return isNaN(n) ? '0' : n.toLocaleString(); }
export function splitAttachments(val) { return String(val || '').split(ATTACHMENT_DELIMITER).map(s => s.trim()).filter(Boolean); }
export function normalizeAttachments(files) { return files.filter(Boolean).join(ATTACHMENT_DELIMITER); }
export function idsMatch(a, b) { return String(a).trim() === String(b).trim(); }

export async function compressImageToTargetLimit(base64, maxBytes = 190000) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let w = img.width, h = img.height;
      if (w > 1000) { h *= 1000 / w; w = 1000; }
      if (h > 1000) { w *= 1000 / h; h = 1000; }
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      let quality = 0.8;
      let result = canvas.toDataURL('image/jpeg', quality);
      while (result.length > maxBytes && quality > 0.1) {
        quality -= 0.1;
        result = canvas.toDataURL('image/jpeg', quality);
      }
      resolve(result);
    };
    img.onerror = () => reject(new Error('Failed to load image for compression'));
    img.src = base64;
  });
}

// Returns true if the string looks like a Google Drive URL (sharing link, etc.)
// rather than a bare Drive file ID.
function looksLikeUrl(str) {
  return /^https?:\/\//i.test(str) || str.includes('/') || str.includes('=');
}

export function getDirectImageUrl(url) {
  if (!url) return url;
  if (url.startsWith('data:')) return url;

  // Try to extract a file ID from known Google Drive URL formats
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return `${GAS_URL}?id=${match[1]}&token=${AUTH_TOKEN}`;
  }

  // If it's not a URL at all, treat it as a bare Drive file ID
  // (this is what uploadImageToDrive() returns from the backend: file.getId())
  if (!looksLikeUrl(url)) {
    return `${GAS_URL}?id=${encodeURIComponent(url)}&token=${AUTH_TOKEN}`;
  }

  // Fallback: return as-is (e.g. some other external URL)
  return url;
}

export function getGPSLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve("GPS Not Supported");
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(`Lat: ${pos.coords.latitude.toFixed(5)}, Lng: ${pos.coords.longitude.toFixed(5)}`),
      () => resolve("GPS Unavailable"),
      { timeout: 7000, maximumAge: 60000 }
    );
  });
}

export function paymentDirectionOf(p) {
  return p.paymentDirection || p.direction || (p.payee === 'Client' ? 'Client Receipt' : 'Outgoing Payment');
}
export function isClientReceipt(p) { return paymentDirectionOf(p) === 'Client Receipt'; }
export function isPettyExpense(p) { return paymentDirectionOf(p) === 'Small Expense'; }

// Generates a reasonably unique ID for new records created client-side.
// Format: PREFIX-<timestamp36>-<random4>
export function generateUniqueId(prefix) {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `${prefix}-${ts}-${rand}`.toUpperCase();
}
