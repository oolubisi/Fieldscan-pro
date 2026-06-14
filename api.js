// api.js
import { AUTH_TOKEN, GAS_URL } from './config.js';
import { queueOfflineRequest, getQueuedRequests, deleteQueuedRequest } from './db.js';
import { readBackup, writeBackup, applyLocalMutation, recomputeLocalStats } from './backup.js';
import { refreshMasterDashboard, refreshVendorsListView } from './dashboard.js';
import { loadInspectionListings, loadTakeOffListings, loadProgressTimelineFeed, loadWorkOrdersListings, loadPaymentsListings } from './console.js';

let cache = { projects: [], inspections: [], takeoffs: [], progressLogs: [], vendors: [], workorders: [], payments: [] };
let currentSelectedProjectId = null;

export function setCache(newCache) { cache = { ...cache, ...newCache }; }
export function getCache() { return cache; }
export function setCurrentProjectId(id) { currentSelectedProjectId = id; }
export function getCurrentProjectId() { return currentSelectedProjectId; }

// Custom error type so callers can distinguish "server rejected this" (validation,
// conflict, auth, etc.) from network/connectivity failures.
export class ApiError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function callApi(action, data = {}) {
  let response;

  // Step 1: attempt the network request. Only a genuine network failure here
  // should trigger offline queuing.
  try {
    response = await fetch(GAS_URL, {
      method: "POST",
      body: JSON.stringify({ action, data: { ...data, token: AUTH_TOKEN } })
    });
  } catch (networkErr) {
    console.warn("Network unavailable, queuing:", networkErr);
    if (action.startsWith('get')) return readBackup(action, action === 'getStats' ? { activeVendors: '--' } : []);
    await queueOfflineRequest(action, data);
    applyLocalMutation(action, data);
    updateSyncStatus();
    alert("📴 Offline: saved locally. Will sync automatically when online.");
    return { status: "queued" };
  }

  // Step 2: we got a response. Treat non-2xx HTTP as a network/server-level
  // failure too (also queue offline for mutations).
  if (!response.ok) {
    console.warn(`HTTP ${response.status} from server, queuing:`, action);
    if (action.startsWith('get')) return readBackup(action, action === 'getStats' ? { activeVendors: '--' } : []);
    await queueOfflineRequest(action, data);
    applyLocalMutation(action, data);
    updateSyncStatus();
    alert("📴 Offline: saved locally. Will sync automatically when online.");
    return { status: "queued" };
  }

  // Step 3: we got a valid HTTP response and parsed JSON. Any application-level
  // error (validation failure, conflict, auth, unknown action) is a REAL error,
  // not an offline condition — surface it to the user instead of silently
  // queuing a request that will just fail again forever.
  let result;
  try {
    result = await response.json();
  } catch (parseErr) {
    throw new ApiError("Server returned an invalid response.");
  }

  if (result && (result.status === 'error' || result.success === false)) {
    const message = result.error || result.message || "The server rejected this request.";
    if (!action.startsWith('get')) {
      alert("⚠️ " + message);
    }
    throw new ApiError(message);
  }

  if (action.startsWith('get')) writeBackup(action, result);
  return result;
}

const DEPENDENCY_ORDER = {
  saveProject: 1, updateProject: 1,
  saveVendor: 2, updateVendor: 2,
  saveWorkOrder: 3, updateWorkOrder: 3,
  saveInspection: 4, updateInspection: 4,
  saveTakeOffItem: 5, updateTakeOffItem: 5, deleteTakeOffItem: 5,
  saveProgressLog: 6,
  savePayment: 7, updatePayment: 7
};

export async function syncQueuedRequests() {
  await updateSyncStatus();
  let queue = await getQueuedRequests();
  if (!queue.length) return;
  alert("🔄 Syncing offline data...");
  queue.sort((a,b) => (DEPENDENCY_ORDER[a.action] || 99) - (DEPENDENCY_ORDER[b.action] || 99));
  for (let item of queue) {
    let retries = 3;
    let delay = 1000;
    let success = false;
    while (retries > 0 && !success) {
      try {
        const payload = { action: item.action, data: { ...item.data, token: AUTH_TOKEN } };
        const response = await fetch(GAS_URL, { method: "POST", body: JSON.stringify(payload) });
        if (response.ok) {
          const result = await response.json();
          if (result && (result.status === 'error' || result.success === false)) {
            // Server rejected this queued item (validation/conflict) — it will
            // never succeed by retrying. Drop it from the queue and warn the user
            // instead of retrying forever.
            console.error(`Queued ${item.action} rejected by server:`, result.error || result.message);
            alert(`⚠️ A queued change (${item.action}) was rejected by the server: ${result.error || result.message || 'unknown error'}. It has been removed from the sync queue.`);
            await deleteQueuedRequest(item.id);
            success = true;
            break;
          }
          if (!result.error && result.success !== false) {
            await deleteQueuedRequest(item.id);
            success = true;
            break;
          }
        }
        throw new Error("Sync failed");
      } catch (err) {
        retries--;
        if (retries === 0) {
          console.error("Failed to sync", item.action, item.data);
          alert(`Failed to sync ${item.action}. Will retry later.`);
        } else {
          await new Promise(r => setTimeout(r, delay));
          delay *= 2;
        }
      }
    }
  }
  await refreshMasterDashboard();
  const vendorsView = document.getElementById('view-vendors');
  if (vendorsView && vendorsView.classList.contains('active-view')) refreshVendorsListView();
  if (currentSelectedProjectId) {
    loadInspectionListings(); loadTakeOffListings(); loadProgressTimelineFeed(); loadWorkOrdersListings(); loadPaymentsListings();
  }
  await updateSyncStatus();
}

export async function updateSyncStatus() {
  const badge = document.getElementById('sync-status');
  if (!badge) return;
  const queue = await getQueuedRequests();
  if (!navigator.onLine) { badge.innerHTML = `<i class="fas fa-wifi"></i> Offline`; badge.style.display = 'block'; return; }
  if (queue.length) { badge.innerHTML = `<i class="fas fa-sync-alt fa-spin"></i> ${queue.length} pending`; badge.style.display = 'block'; return; }
  badge.style.display = 'none';
}

export async function triggerManualSync() {
  if (!navigator.onLine) { alert("You are offline. Please connect to internet."); return; }
  await syncQueuedRequests();
}

export async function refreshAllData() {
  if (!navigator.onLine) { alert("Offline – cannot refresh from server."); return; }
  try {
    await callApi('getProjects', {}); await callApi('getInspections', {}); await callApi('getTakeOffItems', {});
    await callApi('getProgressLogs', {}); await callApi('getVendors', {}); await callApi('getWorkOrders', {}); await callApi('getPayments', {});
    await refreshMasterDashboard();
    if (currentSelectedProjectId) {
      loadInspectionListings(); loadTakeOffListings(); loadProgressTimelineFeed(); loadWorkOrdersListings(); loadPaymentsListings();
    }
    alert("Data refreshed from server.");
  } catch (err) {
    if (!(err instanceof ApiError)) throw err;
    // ApiError already alerted inside callApi for non-get actions; for get
    // actions we alert here.
  }
}
