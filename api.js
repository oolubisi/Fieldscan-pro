// api.js
import { AUTH_TOKEN, GAS_URL } from './config.js';
import { queueOfflineRequest, getQueuedRequests, deleteQueuedRequest } from './db.js';
import { readBackup, writeBackup, applyLocalMutation, recomputeLocalStats } from './backup.js';
import { refreshMasterDashboard, refreshVendorsListView } from './dashboard.js';
import { loadInspectionListings, loadTakeOffListings, loadProgressTimelineFeed, loadSnagsListings, loadWorkOrdersListings, loadPaymentsListings } from './console.js';

let cache = { projects: [], inspections: [], takeoffs: [], progressLogs: [], snags: [], vendors: [], workorders: [], payments: [] };
let currentSelectedProjectId = null;

export function setCache(newCache) { cache = { ...cache, ...newCache }; }
export function getCache() { return cache; }
export function setCurrentProjectId(id) { currentSelectedProjectId = id; }
export function getCurrentProjectId() { return currentSelectedProjectId; }

export async function callApi(action, data = {}) {
  const isGet = action.startsWith('get');
  let response;
  try {
    const payload = { action, data: { ...data, token: AUTH_TOKEN } };
    response = await fetch(GAS_URL, { method: "POST", body: JSON.stringify(payload) });
  } catch (err) {
    // Network-level failure (offline, DNS, CORS) - GET falls back to cache, writes queue
    console.warn(`callApi [${action}] network error:`, err);
    if (isGet) return readBackup(action, action === 'getStats' ? { activeVendors: '--' } : []);
    await queueOfflineRequest(action, data);
    applyLocalMutation(action, data);
    updateSyncStatus();
    alert("📴 Offline: saved locally. Will sync automatically when online.");
    return { status: "queued" };
  }

  // Non-2xx HTTP (redirect, auth error, etc.) - GET falls back to cache
  if (!response.ok) {
    console.warn(`callApi [${action}] HTTP ${response.status}`);
    if (isGet) return readBackup(action, action === 'getStats' ? { activeVendors: '--' } : []);
    throw new Error(`HTTP ${response.status}`);
  }

  let result;
  try {
    result = await response.json();
  } catch (err) {
    console.warn(`callApi [${action}] JSON parse error:`, err);
    if (isGet) return readBackup(action, action === 'getStats' ? { activeVendors: '--' } : []);
    throw new Error("Invalid response from server");
  }

  // Server logic/validation error - GET falls back to cache, writes surface error
  if (result && (result.status === 'error' || result.success === false)) {
    const message = result.message || result.error || "Server rejected the request";
    console.warn(`callApi [${action}] server error:`, message);
    if (isGet) return readBackup(action, action === 'getStats' ? { activeVendors: '--' } : []);
    alert(`⚠️ Save failed: ${message}`);
    throw new Error(message);
  }

  if (isGet) writeBackup(action, result);
  return result;
}

const DEPENDENCY_ORDER = {
  saveProject: 1, updateProject: 1,
  saveVendor: 2, updateVendor: 2,
  saveWorkOrder: 3, updateWorkOrder: 3,
  saveInspection: 4, updateInspection: 4,
  saveTakeOffItem: 5, updateTakeOffItem: 5, deleteTakeOffItem: 5,
  saveProgressLog: 6,
  saveSnag: 7, updateSnag: 7, deleteSnag: 7,
  savePayment: 8, updatePayment: 8
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
    loadInspectionListings(true); loadTakeOffListings(true); loadProgressTimelineFeed(true); loadSnagsListings(true); loadWorkOrdersListings(true); loadPaymentsListings(true);
  }
  await updateSyncStatus();
}

export async function updateSyncStatus() {
  const badge = document.getElementById('sync-status');
  const pendingBadge = document.getElementById('sync-pending-badge');
  const queue = await getQueuedRequests();
  if (pendingBadge) {
    pendingBadge.textContent = queue.length;
    pendingBadge.style.display = queue.length ? 'inline-block' : 'none';
  }
  if (!badge) return;
  if (!navigator.onLine) { badge.innerHTML = `<i class="fas fa-wifi"></i> Offline${queue.length ? ` • ${queue.length} pending` : ''}`; badge.style.display = 'block'; return; }
  if (queue.length) { badge.innerHTML = `<i class="fas fa-sync-alt fa-spin"></i> ${queue.length} pending`; badge.style.display = 'block'; return; }
  badge.style.display = 'none';
}

function setButtonState(buttonId, html, disabled) {
  const button = document.getElementById(buttonId);
  if (!button) return;
  button.innerHTML = html;
  button.disabled = disabled;
  button.style.opacity = disabled ? '0.65' : '';
  button.style.pointerEvents = disabled ? 'none' : '';
}

function showFinishedButtonState(buttonId, doneHtml, normalHtml) {
  setButtonState(buttonId, doneHtml, false);
  setTimeout(() => {
    setButtonState(buttonId, normalHtml, false);
    updateSyncStatus();
  }, 1200);
}

export async function triggerManualSync() {
  if (!navigator.onLine) { alert("You are offline. Please connect to internet."); return; }
  const normalHtml = `<i class="fas fa-sync-alt"></i> Sync Now <span id="sync-pending-badge" class="sync-count-badge" style="display:none;">0</span>`;
  try {
    setButtonState('sync-now-btn', `<i class="fas fa-sync-alt fa-spin"></i> Syncing...`, true);
    await syncQueuedRequests();
    showFinishedButtonState('sync-now-btn', `<i class="fas fa-check"></i> Synced`, normalHtml);
  } catch (err) {
    setButtonState('sync-now-btn', normalHtml, false);
    throw err;
  } finally {
    await updateSyncStatus();
  }
}

export async function refreshAllData() {
  if (!navigator.onLine) { alert("Offline – cannot refresh from server."); return; }
  const normalHtml = `<i class="fas fa-database"></i> Refresh`;
  try {
    setButtonState('refresh-data-btn', `<i class="fas fa-spinner fa-spin"></i> Refreshing...`, true);
    await callApi('getProjects', {}); await callApi('getInspections', {}); await callApi('getTakeOffItems', {});
    await callApi('getProgressLogs', {}); await callApi('getSnags', {}); await callApi('getVendors', {}); await callApi('getWorkOrders', {}); await callApi('getPayments', {});
    await refreshMasterDashboard();
    if (currentSelectedProjectId) {
      loadInspectionListings(true); loadTakeOffListings(true); loadProgressTimelineFeed(true); loadSnagsListings(true); loadWorkOrdersListings(true); loadPaymentsListings(true);
    }
    showFinishedButtonState('refresh-data-btn', `<i class="fas fa-check"></i> Refreshed`, normalHtml);
  } catch (err) {
    setButtonState('refresh-data-btn', normalHtml, false);
    throw err;
  }
}
