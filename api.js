// ===== api.js =====
let cache = {
  projects: [],
  takeoffs: [],
  progressLogs: [],
  snags: [],
  vendors: [],
  workorders: [],
  payments: [],
  settings: {},
};
let currentSelectedProjectId = null;

// Seed in-memory cache from localStorage backups so the app has data
// immediately on page load without waiting for the network.
// Must run here, after `let cache` is declared, to avoid temporal dead zone.
(function seedCacheFromBackup() {
  const seeds = [
    { key: "projects", action: "getProjects", isArray: true },
    { key: "takeoffs", action: "getTakeOffItems", isArray: true },
    { key: "progressLogs", action: "getProgressLogs", isArray: true },
    { key: "snags", action: "getSnags", isArray: true },
    { key: "vendors", action: "getVendors", isArray: true },
    { key: "workorders", action: "getWorkOrders", isArray: true },
    { key: "payments", action: "getPayments", isArray: true },
    { key: "settings", action: "getSettings", isArray: false },
  ];
  seeds.forEach(({ key, action, isArray }) => {
    try {
      const raw = localStorage.getItem(`fb_${action}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (
          isArray ? Array.isArray(parsed) : parsed && typeof parsed === "object"
        ) {
          cache[key] = parsed;
        }
      }
    } catch (e) {
      console.warn("seedCacheFromBackup failed for", key, e);
    }
  });
})();

function setCache(newCache) {
  // Deep-merge settings so individual keys (VAT, WHT, Logo…) are never lost
  // by a partial update. All other top-level keys are replaced as before.
  if (newCache.settings && cache.settings) {
    newCache = {
      ...newCache,
      settings: Object.assign({}, cache.settings, newCache.settings),
    };
  }
  cache = { ...cache, ...newCache };
}
function getCache() {
  return cache;
}
function setCurrentProjectId(id) {
  currentSelectedProjectId = id;
}
function getCurrentProjectId() {
  return currentSelectedProjectId;
}

async function callApi(action, data = {}) {
  const isGet = action.startsWith("get");
  // Strip the auth token from the data payload so it never reaches sheet rows.
  // The token is sent at the top-level of the request envelope instead.
  const { token: _stripped, ...cleanData } = data;
  let response;
  try {
    const payload = { action, token: AUTH_TOKEN, data: cleanData };
    response = await fetch(GAS_URL, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.warn(`callApi [${action}] network error:`, err);
    if (isGet)
      return readBackup(
        action,
        action === "getStats" ? { activeVendors: "--" } : [],
      );
    await queueOfflineRequest(action, cleanData);
    applyLocalMutation(action, cleanData);
    updateSyncStatus();
    showSyncToast("📴 Offline: saved locally. Will sync when back online.");
    return { status: "queued" };
  }
  if (!response.ok) {
    console.warn(`callApi [${action}] HTTP ${response.status}`);
    if (isGet)
      return readBackup(
        action,
        action === "getStats" ? { activeVendors: "--" } : [],
      );
    throw new Error(`HTTP ${response.status}`);
  }
  let result;
  try {
    result = await response.json();
  } catch (err) {
    console.warn(`callApi [${action}] JSON parse error:`, err);
    if (isGet)
      return readBackup(
        action,
        action === "getStats" ? { activeVendors: "--" } : [],
      );
    throw new Error("Invalid response from server");
  }
  if (result && (result.status === "error" || result.success === false)) {
    const message =
      result.message || result.error || "Server rejected the request";
    console.warn(`callApi [${action}] server error:`, message);
    if (isGet)
      return readBackup(
        action,
        action === "getStats" ? { activeVendors: "--" } : [],
      );
    alert(`⚠️ Save failed: ${message}`);
    throw new Error(message);
  }
  const returnValue =
    isGet && result && result.data !== undefined ? result.data : result;
  if (isGet) writeBackup(action, returnValue);
  return returnValue;
}

const DEPENDENCY_ORDER = {
  saveProject: 1,
  updateProject: 1,
  saveVendor: 2,
  updateVendor: 2,
  saveWorkOrder: 3,
  updateWorkOrder: 3,
  saveTakeOffItem: 5,
  updateTakeOffItem: 5,
  deleteTakeOffItem: 5,
  saveProgressLog: 6,
  saveSnag: 7,
  updateSnag: 7,
  deleteSnag: 7,
  savePayment: 8,
  updatePayment: 8,
};

async function syncQueuedRequests() {
  await updateSyncStatus();
  let queue = await getQueuedRequests();
  if (!queue.length) return;
  showSyncToast("🔄 Syncing offline data...", 10000);
  queue.sort(
    (a, b) =>
      (DEPENDENCY_ORDER[a.action] || 99) - (DEPENDENCY_ORDER[b.action] || 99),
  );
  for (let item of queue) {
    let retries = 3,
      delay = 1000,
      success = false;
    while (retries > 0 && !success) {
      try {
        const payload = {
          action: item.action,
          token: AUTH_TOKEN,
          data: item.data,
        };
        const response = await fetch(GAS_URL, {
          method: "POST",
          body: JSON.stringify(payload),
        });
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
          showSyncToast(
            `⚠️ Failed to sync ${item.action}. Will retry later.`,
            4000,
          );
        } else {
          await new Promise((r) => setTimeout(r, delay));
          delay *= 2;
        }
      }
    }
  }
  await refreshMasterDashboard();
  const vendorsView = document.getElementById("view-vendors");
  if (vendorsView && vendorsView.classList.contains("active-view"))
    refreshVendorsListView();
  if (currentSelectedProjectId) {
    loadTakeOffListings(true);
    loadProgressTimelineFeed(true);
    loadSnagsListings(true);
    loadWorkOrdersListings(true);
    loadPaymentsListings(true);
  }
  await updateSyncStatus();
}

async function updateSyncStatus() {
  const badge = document.getElementById("sync-status");
  const pendingBadge = document.getElementById("sync-pending-badge");
  const queue = await getQueuedRequests();
  if (pendingBadge) {
    pendingBadge.textContent = queue.length;
    pendingBadge.style.display = queue.length ? "inline-block" : "none";
  }
  if (!badge) return;
  if (!navigator.onLine) {
    badge.innerHTML = `<i class="fas fa-wifi"></i> Offline${queue.length ? ` • ${queue.length} pending` : ""}`;
    badge.style.display = "block";
    return;
  }
  if (queue.length) {
    badge.innerHTML = `<i class="fas fa-sync-alt fa-spin"></i> ${queue.length} pending`;
    badge.style.display = "block";
    return;
  }
  badge.style.display = "none";
}

function setButtonState(buttonId, html, disabled) {
  const button = document.getElementById(buttonId);
  if (!button) return;
  button.innerHTML = html;
  button.disabled = disabled;
  button.style.opacity = disabled ? "0.65" : "";
  button.style.pointerEvents = disabled ? "none" : "";
}

function showFinishedButtonState(buttonId, doneHtml, normalHtml) {
  setButtonState(buttonId, doneHtml, false);
  setTimeout(() => {
    setButtonState(buttonId, normalHtml, false);
    updateSyncStatus();
  }, 1200);
}

async function triggerManualSync() {
  if (!navigator.onLine) {
    alert("You are offline. Please connect to internet.");
    return;
  }
  const normalHtml = `<i class="fas fa-sync-alt"></i> Sync Now <span id="sync-pending-badge" class="sync-count-badge" style="display:none;">0</span>`;
  try {
    setButtonState(
      "sync-now-btn",
      `<i class="fas fa-sync-alt fa-spin"></i> Syncing...`,
      true,
    );
    await syncQueuedRequests();
    showFinishedButtonState(
      "sync-now-btn",
      `<i class="fas fa-check"></i> Synced`,
      normalHtml,
    );
  } catch (err) {
    setButtonState("sync-now-btn", normalHtml, false);
    throw err;
  } finally {
    await updateSyncStatus();
  }
}

async function refreshAllData() {
  if (!navigator.onLine) {
    alert("Offline – cannot refresh from server.");
    return;
  }
  const normalHtml = `<i class="fas fa-database"></i> Refresh`;
  try {
    setButtonState(
      "refresh-data-btn",
      `<i class="fas fa-spinner fa-spin"></i> Refreshing...`,
      true,
    );
    // Fetch all endpoints and update both localStorage backup AND in-memory cache
    const endpoints = [
      { action: "getProjects", key: "projects", isArray: true },
      { action: "getTakeOffItems", key: "takeoffs", isArray: true },
      { action: "getProgressLogs", key: "progressLogs", isArray: true },
      { action: "getSnags", key: "snags", isArray: true },
      { action: "getVendors", key: "vendors", isArray: true },
      { action: "getWorkOrders", key: "workorders", isArray: true },
      { action: "getPayments", key: "payments", isArray: true },
    ];
    for (const ep of endpoints) {
      const res = await callApi(ep.action, {});
      const c = getCache();
      c[ep.key] = ep.isArray ? res || [] : res || {};
      // Reset loaded flags so console segments re-render with fresh data
      const loadedFlag = ep.key + "Loaded";
      c[loadedFlag] = true;
      setCache(c);
    }
    const settingsRes = await callApi("getSettings", {});
    if (settingsRes && typeof settingsRes === "object") {
      const c = getCache();
      // Deep-merge settings so individual keys are preserved
      c.settings = Object.assign(
        {},
        c.settings,
        settingsRes.data || settingsRes,
      );
      setCache(c);
    }
    await refreshMasterDashboard();
    if (currentSelectedProjectId) {
      loadTakeOffListings(true);
      loadProgressTimelineFeed(true);
      loadSnagsListings(true);
      loadWorkOrdersListings(true);
      loadPaymentsListings(true);
    }
    showFinishedButtonState(
      "refresh-data-btn",
      `<i class="fas fa-check"></i> Refreshed`,
      normalHtml,
    );
  } catch (err) {
    setButtonState("refresh-data-btn", normalHtml, false);
    throw err;
  }
}