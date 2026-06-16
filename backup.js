// backup.js
import { idsMatch } from './utils.js';

const GET_ACTION_BY_STORE = {
  projects: "getProjects", inspections: "getInspections", takeoffs: "getTakeOffItems",
  progressLogs: "getProgressLogs", snags: "getSnags", vendors: "getVendors", workorders: "getWorkOrders", payments: "getPayments"
};

export const MUTATION_MAP = {
  saveProject: { store: "projects", idKey: "projectId", mode: "upsert" },
  updateProject: { store: "projects", idKey: "projectId", mode: "upsert" },
  saveInspection: { store: "inspections", idKey: "inspectionId", mode: "upsert" },
  updateInspection: { store: "inspections", idKey: "inspectionId", mode: "upsert" },
  saveTakeOffItem: { store: "takeoffs", idKey: "itemId", mode: "upsert" },
  updateTakeOffItem: { store: "takeoffs", idKey: "itemId", mode: "upsert" },
  deleteTakeOffItem: { store: "takeoffs", idKey: "itemId", mode: "delete" },
  saveProgressLog: { store: "progressLogs", idKey: "logId", mode: "upsert" },
  saveSnag: { store: "snags", idKey: "snagId", mode: "upsert" },
  updateSnag: { store: "snags", idKey: "snagId", mode: "upsert" },
  deleteSnag: { store: "snags", idKey: "snagId", mode: "delete" },
  saveVendor: { store: "vendors", idKey: "vendorId", mode: "upsert" },
  updateVendor: { store: "vendors", idKey: "vendorId", mode: "upsert" },
  deleteVendor: { store: "vendors", idKey: "vendorId", mode: "delete" },
  saveWorkOrder: { store: "workorders", idKey: "workOrderId", mode: "upsert" },
  updateWorkOrder: { store: "workorders", idKey: "workOrderId", mode: "upsert" },
  savePayment: { store: "payments", idKey: "paymentId", mode: "upsert" },
  updatePayment: { store: "payments", idKey: "paymentId", mode: "upsert" }
};

function backupKey(action) { return `fb_${action}`; }
export function readBackup(action, fallback = []) { const raw = localStorage.getItem(backupKey(action)); return raw ? JSON.parse(raw) : fallback; }
export function writeBackup(action, value) {
  try {
    localStorage.setItem(backupKey(action), JSON.stringify(value));
  } catch (err) {
    console.error("writeBackup failed (storage may be full):", action, err);
    if (err && err.name === 'QuotaExceededError') {
      alert("⚠️ Local storage is full. Some offline data may not be saved. Try syncing and clearing attachments.");
    }
  }
}

export function recomputeLocalStats() {
  const vendors = readBackup('getVendors', []);
  writeBackup('getStats', { activeVendors: vendors.filter(v => v.archived !== "Yes").length });
}

export function applyLocalMutation(action, data) {
  const cfg = MUTATION_MAP[action];
  if (!cfg) return;
  const getAction = GET_ACTION_BY_STORE[cfg.store];
  let current = readBackup(getAction, []);
  const idVal = String(data[cfg.idKey] || '').trim();
  if (cfg.mode === "delete") {
    current = current.filter(item => !idsMatch(item[cfg.idKey], idVal));
  } else {
    const idx = current.findIndex(item => idsMatch(item[cfg.idKey], idVal));
    const record = { ...data, offlinePending: true, lastModified: Date.now() };
    if (idx === -1) current = [record, ...current];
    else current[idx] = { ...current[idx], ...record };
  }
  writeBackup(getAction, current);
  if (cfg.store === "vendors") recomputeLocalStats();
}
