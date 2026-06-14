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

export async function callApi(action, data = {}) {
  try {
    const payload = { action, data: { ...data, token: AUTH_TOKEN } };
    const response = await fetch(GAS_URL, { method: "POST", body: JSON.stringify(payload) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = await response.json();
    if (result && (result.status === 'error' || result.success === false)) throw new Error(result.message || result.error);
    if (action.startsWith('get')) writeBackup(action, result);
    return result;
  } catch (err) {
    console.warn("Offline, queuing:", err);
    if (action.startsWith('get')) return readBackup(action, action === 'getStats' ? { activeVendors: '--' } : []);
    await queueOfflineRequest(action, data);
    applyLocalMutation(action, data);
    updateSyncStatus();
    alert("📴 Offline: saved locally. Will sync automatically when online.");
    return { status: "queued" };
  }
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

export async function triggerManualSync() {
  if (!navigator.onLine) { alert("You are offline. Please connect to internet."); return; }
  await syncQueuedRequests();
}

export async function refreshAllData() {
  if (!navigator.onLine) { alert("Offline – cannot refresh from server."); return; }
  await callApi('getProjects', {}); await callApi('getInspections', {}); await callApi('getTakeOffItems', {});
  await callApi('getProgressLogs', {}); await callApi('getVendors', {}); await callApi('getWorkOrders', {}); await callApi('getPayments', {});
  await refreshMasterDashboard();
  if (currentSelectedProjectId) {
    loadInspectionListings(); loadTakeOffListings(); loadProgressTimelineFeed(); loadWorkOrdersListings(); loadPaymentsListings();
  }
  alert("Data refreshed from server.");
}
