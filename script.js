// ======================== CONFIGURATION ========================
const GAS_URL = "https://script.google.com/macros/s/AKfycbyMbq7heDDK6lelr4fD3ek24njHQDmo7zaC8ocusLGDyu4u-NxoO7e_Wt-zgaRkgIbJ/exec"; // REPLACE WITH YOUR DEPLOYMENT
const AUTH_TOKEN = "FieldScan2025!SecureToken";
const ATTACHMENT_DELIMITER = "|||";

// ======================== UTILITIES ========================
function escapeHtml(str) { return String(str ?? '').replace(/[&<>]/g, function(m) { if (m === '&') return '&amp;'; if (m === '<') return '&lt;'; if (m === '>') return '&gt;'; return m; }); }
function escapeAttr(str) { return escapeHtml(str).replace(/`/g, '&#96;'); }
function moneyValue(val) { const n = Number(val || 0); return isNaN(n) ? '0' : n.toLocaleString(); }
function splitAttachments(val) { return String(val || '').split(ATTACHMENT_DELIMITER).map(s => s.trim()).filter(Boolean); }
function normalizeAttachments(files) { return files.filter(Boolean).join(ATTACHMENT_DELIMITER); }

// ======================== OFFLINE QUEUE (IndexedDB) ========================
const DB_NAME = "FieldScanOfflineDB";
const STORE_NAME = "syncQueue";

function openQueueDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = (e) => { e.target.result.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true }); };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function queueOfflineRequest(action, data) {
  const db = await openQueueDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).add({ action, data, timestamp: Date.now() });
    tx.oncomplete = () => { updateSyncStatus(); resolve(); };
    tx.onerror = () => reject(tx.error);
  });
}

async function getQueuedRequests() {
  const db = await openQueueDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function deleteQueuedRequest(id) {
  const db = await openQueueDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ======================== LOCAL BACKUP (localStorage) ========================
function backupKey(action) { return `fb_${action}`; }
function readBackup(action, fallback = []) { const raw = localStorage.getItem(backupKey(action)); return raw ? JSON.parse(raw) : fallback; }
function writeBackup(action, value) { localStorage.setItem(backupKey(action), JSON.stringify(value)); }

// ======================== MUTATION MAP & APPLY LOCAL ========================
const MUTATION_MAP = {
  saveProject: { store: "projects", idKey: "projectId", mode: "upsert" },
  updateProject: { store: "projects", idKey: "projectId", mode: "upsert" },
  saveInspection: { store: "inspections", idKey: "inspectionId", mode: "upsert" },
  updateInspection: { store: "inspections", idKey: "inspectionId", mode: "upsert" },
  saveTakeOffItem: { store: "takeoffs", idKey: "itemId", mode: "upsert" },
  updateTakeOffItem: { store: "takeoffs", idKey: "itemId", mode: "upsert" },
  deleteTakeOffItem: { store: "takeoffs", idKey: "itemId", mode: "delete" },
  saveProgressLog: { store: "progressLogs", idKey: "logId", mode: "upsert" },
  saveVendor: { store: "vendors", idKey: "vendorId", mode: "upsert" },
  updateVendor: { store: "vendors", idKey: "vendorId", mode: "upsert" },
  deleteVendor: { store: "vendors", idKey: "vendorId", mode: "delete" },
  saveWorkOrder: { store: "workorders", idKey: "workOrderId", mode: "upsert" },
  updateWorkOrder: { store: "workorders", idKey: "workOrderId", mode: "upsert" },
  savePayment: { store: "payments", idKey: "paymentId", mode: "upsert" },
  updatePayment: { store: "payments", idKey: "paymentId", mode: "upsert" }
};

const GET_ACTION_BY_STORE = {
  projects: "getProjects", inspections: "getInspections", takeoffs: "getTakeOffItems",
  progressLogs: "getProgressLogs", vendors: "getVendors", workorders: "getWorkOrders", payments: "getPayments"
};

function idsMatch(a, b) { return String(a).trim() === String(b).trim(); }

function applyLocalMutation(action, data) {
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
    else { current[idx] = { ...current[idx], ...record }; }
  }
  writeBackup(getAction, current);
  if (cfg.store === "vendors") recomputeLocalStats();
}

function recomputeLocalStats() {
  const vendors = readBackup('getVendors', []);
  writeBackup('getStats', { activeVendors: vendors.filter(v => v.archived !== "Yes").length });
}

// ======================== API CALL WITH TOKEN & OFFLINE QUEUE ========================
async function callApi(action, data = {}) {
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

// ======================== SYNC WITH RETRY & DEPENDENCY ORDER ========================
const DEPENDENCY_ORDER = {
  saveProject: 1, updateProject: 1,
  saveVendor: 2, updateVendor: 2,
  saveWorkOrder: 3, updateWorkOrder: 3,
  saveInspection: 4, updateInspection: 4,
  saveTakeOffItem: 5, updateTakeOffItem: 5, deleteTakeOffItem: 5,
  saveProgressLog: 6,
  savePayment: 7, updatePayment: 7
};

async function syncQueuedRequests() {
  updateSyncStatus();
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
  if (document.getElementById('view-vendors').classList.contains('active-view')) refreshVendorsListView();
  if (document.getElementById('view-project-console').classList.contains('active-view') && currentSelectedProjectId) {
    loadInspectionListings(); loadTakeOffListings(); loadProgressTimelineFeed(); loadWorkOrdersListings(); loadPaymentsListings();
  }
  updateSyncStatus();
}

// ======================== SYNC STATUS UI ========================
async function updateSyncStatus() {
  const badge = document.getElementById('sync-status');
  if (!badge) return;
  const queue = await getQueuedRequests();
  if (!navigator.onLine) { badge.innerHTML = `<i class="fas fa-wifi"></i> Offline`; badge.style.display = 'block'; return; }
  if (queue.length) { badge.innerHTML = `<i class="fas fa-sync-alt fa-spin"></i> ${queue.length} pending`; badge.style.display = 'block'; return; }
  badge.style.display = 'none';
}

async function triggerManualSync() {
  if (!navigator.onLine) { alert("You are offline. Please connect to internet."); return; }
  await syncQueuedRequests();
}

async function refreshAllData() {
  if (!navigator.onLine) { alert("Offline – cannot refresh from server."); return; }
  await callApi('getProjects', {}); await callApi('getInspections', {}); await callApi('getTakeOffItems', {});
  await callApi('getProgressLogs', {}); await callApi('getVendors', {}); await callApi('getWorkOrders', {}); await callApi('getPayments', {});
  await refreshMasterDashboard();
  if (document.getElementById('view-vendors').classList.contains('active-view')) refreshVendorsListView();
  if (currentSelectedProjectId) {
    loadInspectionListings(); loadTakeOffListings(); loadProgressTimelineFeed(); loadWorkOrdersListings(); loadPaymentsListings();
  }
  alert("Data refreshed from server.");
}

// ======================== GPS ========================
function getGPSLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve("GPS Not Supported");
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(`Lat: ${pos.coords.latitude.toFixed(5)}, Lng: ${pos.coords.longitude.toFixed(5)}`),
      () => resolve("GPS Unavailable"),
      { timeout: 7000, maximumAge: 60000 }
    );
  });
}

// ======================== IMAGE PROXY ========================
function getDirectImageUrl(url) {
  if (!url || url.startsWith('data:')) return url;
  const match = url.match(/\/d\/(.+?)\//) || url.match(/id=([^&]+)/);
  if (match && match[1]) {
    return `${GAS_URL}?id=${match[1]}&token=${AUTH_TOKEN}`;
  }
  return url;
}

async function compressImageToTargetLimit(base64, maxBytes=190000) {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let w = img.width, h = img.height;
      if (w > 1000) { h *= 1000 / w; w = 1000; }
      if (h > 1000) { w *= 1000 / h; h = 1000; }
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      let quality = 0.8;
      let result = canvas.toDataURL('image/jpeg', quality);
      while (result.length > maxBytes && quality > 0.2) { quality -= 0.1; result = canvas.toDataURL('image/jpeg', quality); }
      resolve(result);
    };
  });
}

// ======================== MODAL & ATTACHMENTS ========================
let currentModalFiles = [];
let currentAvatarPhoto = "";

function populateModalInlineImageGalleryPreviews(containerId) {
  const box = document.getElementById(containerId);
  if (!box) return;
  if (!currentModalFiles.length) { box.innerHTML = ''; box.style.display = 'none'; return; }
  box.style.display = 'flex';
  box.innerHTML = currentModalFiles.map((url, idx) => {
    const isPdf = url.toLowerCase().includes('pdf');
    const src = url.startsWith('data:') ? url : getDirectImageUrl(url);
    return `<div style="position:relative; width:60px; height:60px;"><img src="${src}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;border:1px solid #000;"><div onclick="removeAttachmentByIndex(${idx}, '${containerId}')" style="position:absolute; top:-6px; right:-6px; background:red; color:white; border-radius:50%; width:20px; height:20px; text-align:center; line-height:18px; cursor:pointer;">&times;</div></div>`;
  }).join('');
}

function removeAttachmentByIndex(idx, containerId) { currentModalFiles.splice(idx,1); populateModalInlineImageGalleryPreviews(containerId); }

function processIncomingMultiAttachments(files, previewId) {
  if (!files.length) return;
  Array.from(files).forEach(file => {
    const reader = new FileReader();
    reader.onload = async (ev) => {
      let data = ev.target.result;
      if (!file.type.includes('pdf')) data = await compressImageToTargetLimit(data, 190000);
      currentModalFiles.push(data);
      populateModalInlineImageGalleryPreviews(previewId);
    };
    reader.readAsDataURL(file);
  });
}

function clearVendorAvatarPhoto() { currentAvatarPhoto = ""; document.getElementById('passport_frame_view').src = 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%3E%3Cpath%20fill%3D%22%23666%22%20d%3D%22M12%2012c2.21%200%204-1.79%204-4s-1.79-4-4-4-4%201.79-4%204%201.79%204%204%204zm0%202c-2.67%200-8%201.34-8%204v2h16v-2c0-2.66-5.33-4-8-4z%22%2F%3E%3C%2Fsvg%3E'; document.getElementById('v_pass_remove_btn').style.display = 'none'; }

// ======================== DASHBOARD & RENDERING ========================
let cache = { projects: [], inspections: [], takeoffs: [], progressLogs: [], vendors: [], workorders: [], payments: [] };
let currentSelectedProjectId = null;

async function refreshMasterDashboard() {
  const stats = await callApi('getStats', {});
  if (stats && stats.activeVendors) document.getElementById('badge-vendors') && (document.getElementById('badge-vendors').innerText = stats.activeVendors);
  const projects = await callApi('getProjects', {});
  cache.projects = projects || [];
  renderProjects();
}

function renderProjects() {
  const container = document.getElementById('project-master-list');
  const term = document.getElementById('search-projects').value.toLowerCase();
  const filtered = cache.projects.filter(p => p.clientName?.toLowerCase().includes(term) || p.projectId?.toLowerCase().includes(term));
  if (!filtered.length) { container.innerHTML = '<p style="text-align:center;padding:20px;">No projects</p>'; return; }
  container.innerHTML = filtered.map(p => `<div class="card" data-project-id="${escapeAttr(p.projectId)}" onclick="loadProjectConsoleHub('${escapeAttr(p.projectId)}')" style="border-left:5px solid ${p.projectStatus==='Active'?'var(--success)':'var(--muted)'}; cursor:pointer;"><strong style="font-size:20px;">${escapeHtml(p.clientName)}</strong><br><span>${escapeHtml(p.siteLocation)}</span><div style="margin-top:6px; font-size:12px;">ID: ${escapeHtml(p.projectId)} | ${escapeHtml(p.projectStatus)}</div></div>`).join('');
}

async function refreshVendorsListView() {
  const vendors = await callApi('getVendors', {});
  cache.vendors = vendors || [];
  const trades = [...new Set(cache.vendors.map(v=>v.trade).filter(Boolean))];
  document.getElementById('filter-vendor-trade').innerHTML = '<option value="">All Trades</option>' + trades.map(t=>`<option value="${escapeAttr(t)}">${escapeHtml(t)}</option>`).join('');
  renderVendors();
}

function renderVendors() {
  const term = document.getElementById('search-vendor').value.toLowerCase();
  const trade = document.getElementById('filter-vendor-trade').value;
  const filtered = cache.vendors.filter(v => (!term || v.company?.toLowerCase().includes(term)) && (!trade || v.trade === trade));
  const container = document.getElementById('vendor-master-list');
  if (!filtered.length) { container.innerHTML = '<p style="padding:20px;">No vendors</p>'; return; }
  container.innerHTML = filtered.map(v => `<div class="card" onclick="openModal('vendor', ${JSON.stringify(v).replace(/"/g, '&quot;')})" style="display:flex; gap:12px; align-items:center;"><img src="${getDirectImageUrl(v.passport) || 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%3E%3Cpath%20fill%3D%22%23666%22%20d%3D%22M12%2012c2.21%200%204-1.79%204-4s-1.79-4-4-4-4%201.79-4%204%201.79%204%204%204zm0%202c-2.67%200-8%201.34-8%204v2h16v-2c0-2.66-5.33-4-8-4z%22%2F%3E%3C%2Fsvg%3E'}" style="width:50px; height:50px; border-radius:50%; object-fit:cover;"><div><strong>${escapeHtml(v.company)}</strong><br>${escapeHtml(v.trade)}<br>${escapeHtml(v.phone1)}</div></div>`).join('');
}

// ======================== PROJECT CONSOLE ========================
async function loadProjectConsoleHub(projectId) {
  currentSelectedProjectId = projectId;
  const proj = cache.projects.find(p => p.projectId === projectId);
  if (!proj) return;
  document.getElementById('console-title-text').innerText = proj.projectId;
  document.getElementById('c-meta-name').innerText = proj.clientName;
  document.getElementById('c-meta-loc').innerText = proj.siteLocation;
  document.getElementById('c-meta-phone').innerHTML = proj.clientPhone || "No phone";
  document.getElementById('c-meta-phone').href = proj.clientPhone ? "tel:"+proj.clientPhone : "#";
  document.getElementById('c-meta-notes').value = proj.notes || "";
  switchConsoleSegment('profile');
  showPage('project-console');
}
function triggerEditProjectProfile() { openModal('project', cache.projects.find(p=>p.projectId===currentSelectedProjectId)); }
function switchConsoleSegment(seg) {
  document.querySelectorAll('.console-tab-window').forEach(w => w.classList.remove('active-view'));
  document.querySelectorAll('.segment-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`console-seg-${seg}`).classList.add('active-view');
  document.getElementById(`seg-btn-${seg}`).classList.add('active');
  if (seg === 'inspections') loadInspectionListings();
  if (seg === 'takeoff') loadTakeOffListings();
  if (seg === 'progress') loadProgressTimelineFeed();
  if (seg === 'workorders') loadWorkOrdersListings();
  if (seg === 'payments') loadPaymentsListings();
}
async function loadInspectionListings() {
  const container = document.getElementById('console-inspections-list');
  container.innerHTML = `<p style="text-align:center;padding:15px;"><i class="fas fa-spinner fa-spin"></i> Loading...</p>`;
  const items = await callApi('getInspections', {});
  cache.inspections = items || [];
  const projectItems = cache.inspections.filter(i => i.projectId === currentSelectedProjectId);
  if (!projectItems.length) { container.innerHTML = `<p style="color:var(--muted); text-align:center; padding:20px;">No inspections yet.</p>`; return; }
  container.innerHTML = projectItems.map(i => `<div class="card" onclick="openModal('inspection', ${JSON.stringify(i).replace(/"/g, '&quot;')})" style="cursor:pointer;"><strong>${escapeHtml(i.inspectionType)}</strong> - ${escapeHtml(i.areaInspected)}<br><small>${escapeHtml(i.inspectionDate)}</small><p>${escapeHtml(i.siteCondition)}</p></div>`).join('');
}
async function loadTakeOffListings() {
  const container = document.getElementById('console-takeoff-list');
  container.innerHTML = `<p style="text-align:center;padding:15px;"><i class="fas fa-spinner fa-spin"></i> Loading...</p>`;
  const items = await callApi('getTakeOffItems', {});
  cache.takeoffs = items || [];
  const projectItems = cache.takeoffs.filter(i => i.projectId === currentSelectedProjectId);
  if (!projectItems.length) { container.innerHTML = `<p style="text-align:center;padding:20px;">No take-off items.</p>`; return; }
  container.innerHTML = projectItems.map(i => `<div class="card" onclick="openModal('takeoff_item', ${JSON.stringify(i).replace(/"/g, '&quot;')})" style="cursor:pointer;"><strong>${escapeHtml(i.roomArea)}</strong> | ${escapeHtml(i.tradeCategory)}<br>${escapeHtml(i.description)}<br><strong>${escapeHtml(i.quantity)} ${escapeHtml(i.unit)}</strong></div>`).join('');
}
async function loadProgressTimelineFeed() {
  const container = document.getElementById('console-progress-feed');
  container.innerHTML = `<p style="text-align:center;padding:15px;"><i class="fas fa-spinner fa-spin"></i> Loading...</p>`;
  const logs = await callApi('getProgressLogs', {});
  cache.progressLogs = logs || [];
  const projectLogs = cache.progressLogs.filter(l => l.projectId === currentSelectedProjectId);
  if (!projectLogs.length) { container.innerHTML = `<p style="text-align:center;padding:20px;">No progress logs.</p>`; return; }
  container.innerHTML = projectLogs.map(l => `<div class="card"><strong>${escapeHtml(l.tradeCategory)}</strong> - ${escapeHtml(l.completionPercentage)}%<br>${escapeHtml(l.commentNarrative)}<br><small>${escapeHtml(l.dateRecorded)}</small></div>`).join('');
}
async function loadWorkOrdersListings() {
  const container = document.getElementById('console-workorders-list');
  container.innerHTML = `<p style="text-align:center;padding:15px;"><i class="fas fa-spinner fa-spin"></i> Loading...</p>`;
  const orders = await callApi('getWorkOrders', {});
  cache.workorders = orders || [];
  const projectOrders = cache.workorders.filter(w => w.projectId === currentSelectedProjectId);
  if (!projectOrders.length) { container.innerHTML = `<p style="text-align:center;padding:20px;">No work orders.</p>`; return; }
  container.innerHTML = projectOrders.map(w => `<div class="card" onclick="openModal('workorder', ${JSON.stringify(w).replace(/"/g, '&quot;')})" style="cursor:pointer;"><strong>${escapeHtml(w.vendorId)}</strong><br>${escapeHtml(w.description)}<br>₦${moneyValue(w.amount)}<br>Status: ${escapeHtml(w.status)}</div>`).join('');
}
async function loadPaymentsListings() {
  const container = document.getElementById('console-payments-list');
  container.innerHTML = `<p style="text-align:center;padding:15px;"><i class="fas fa-spinner fa-spin"></i> Loading...</p>`;
  const payments = await callApi('getPayments', {});
  cache.payments = payments || [];
  const projectPayments = cache.payments.filter(p => p.projectId === currentSelectedProjectId);
  if (!projectPayments.length) { container.innerHTML = `<p style="text-align:center;padding:20px;">No payments.</p>`; return; }
  container.innerHTML = projectPayments.map(p => `<div class="card" onclick="openModal('payment', ${JSON.stringify(p).replace(/"/g, '&quot;')})" style="cursor:pointer;"><strong>${escapeHtml(p.payee)}</strong> (${escapeHtml(p.paymentDirection)})<br>₦${moneyValue(p.amount)}<br>${escapeHtml(p.paymentDate)} | ${escapeHtml(p.status)}</div>`).join('');
}

// ======================== OPEN MODAL (FULL IMPLEMENTATION) ========================
function openModal(type, editData = null) {
  const body = document.getElementById('modalBody');
  const submit = document.getElementById('modalSubmit');
  const title = document.getElementById('modalTitle');
  const overlay = document.getElementById('modalOverlay');
  const isEdit = !!editData;
  overlay.style.display = 'flex';
  body.innerHTML = '';
  submit.disabled = false;
  submit.innerText = "Save";
  currentModalFiles = [];
  currentAvatarPhoto = "";

  const labelStyle = 'style="display:block; font-weight:800; margin-top:12px; margin-bottom:4px;"';
  const largeInput = 'style="width:100%; padding:12px; font-size:16px;"';

  if (type === 'project') {
    title.innerText = isEdit ? "Edit Project" : "New Project";
    body.innerHTML = `
      <label ${labelStyle}>Project ID</label><input value="${escapeAttr(isEdit ? editData.projectId : generateFrontendPreviewId('project'))}" disabled style="${largeInput} background:#f0f0f0;">
      <label ${labelStyle}>Client Name</label><input id="p_client" value="${escapeAttr(isEdit?editData.clientName:'')}" ${largeInput}>
      <label ${labelStyle}>Site Location</label><input id="p_loc" value="${escapeAttr(isEdit?editData.siteLocation:'')}" ${largeInput}>
      <label ${labelStyle}>Client Phone (11 digits)</label><input id="p_phone" type="tel" maxlength="11" oninput="this.value=this.value.replace(/[^0-9]/g,'')" value="${escapeAttr(isEdit?editData.clientPhone:'')}" ${largeInput}>
      <label ${labelStyle}>Client Email</label><input id="p_email" type="email" value="${escapeAttr(isEdit?editData.clientEmail:'')}" ${largeInput}>
      <label ${labelStyle}>Status</label><select id="p_status" ${largeInput}><option value="Active" ${isEdit&&editData.projectStatus==='Active'?'selected':''}>Active</option><option value="In Planning" ${isEdit&&editData.projectStatus==='In Planning'?'selected':''}>In Planning</option><option value="Handed Over" ${isEdit&&editData.projectStatus==='Handed Over'?'selected':''}>Handed Over</option><option value="Declined" ${isEdit&&editData.projectStatus==='Declined'?'selected':''}>Declined</option></select>
      <label ${labelStyle}>Notes</label><textarea id="p_notes" rows="2" ${largeInput}>${escapeHtml(isEdit?editData.notes:'')}</textarea>
    `;
    submit.onclick = () => {
      const phone = document.getElementById('p_phone').value.trim();
      if (phone && !/^\d{11}$/.test(phone)) { alert("Phone must be 11 digits"); return; }
      submit.disabled = true; submit.innerText = "Saving...";
      const payload = { projectId: isEdit ? editData.projectId : generateFrontendPreviewId('project'), clientName: document.getElementById('p_client').value, siteLocation: document.getElementById('p_loc').value, clientPhone: phone, clientEmail: document.getElementById('p_email').value, projectStatus: document.getElementById('p_status').value, notes: document.getElementById('p_notes').value };
      callApi(isEdit ? 'updateProject' : 'saveProject', payload).then(() => { closeModal(); refreshMasterDashboard(); if(isEdit) loadProjectConsoleHub(payload.projectId); });
    };
  } else if (type === 'inspection') {
    title.innerText = isEdit ? "Edit Inspection" : "New Inspection";
    if (isEdit && editData.attachments) currentModalFiles = splitAttachments(editData.attachments);
    body.innerHTML = `
      <label ${labelStyle}>Type</label><select id="i_type" ${largeInput}><option value="Initial Visit">Initial Visit</option><option value="Site Condition">Site Condition</option><option value="Defect Check">Defect Check</option></select>
      <label ${labelStyle}>Area Inspected</label><input id="i_area" value="${escapeAttr(isEdit?editData.areaInspected:'')}" ${largeInput}>
      <label ${labelStyle}>Site Condition</label><textarea id="i_condition" rows="3" ${largeInput}>${escapeHtml(isEdit?editData.siteCondition:'')}</textarea>
      <label ${labelStyle}>Recommendations</label><textarea id="i_rec" rows="2" ${largeInput}>${escapeHtml(isEdit?editData.recommendations:'')}</textarea>
      <div id="inspectionAttachmentsPreviews" class="modal-preview-grid" style="display:none;"></div>
      <label class="icon-upload-label"><i class="fas fa-paperclip"></i><input type="file" id="i_photo" accept="image/*,application/pdf" multiple style="display:none"></label>
    `;
    if (currentModalFiles.length) populateModalInlineImageGalleryPreviews('inspectionAttachmentsPreviews');
    document.getElementById('i_photo').onchange = (e) => processIncomingMultiAttachments(e.target.files, 'inspectionAttachmentsPreviews');
    submit.onclick = async () => {
      submit.disabled = true; submit.innerText = "GPS...";
      const gps = await getGPSLocation();
      submit.innerText = "Saving...";
      const condition = document.getElementById('i_condition').value + (gps !== "GPS Unavailable" ? `\n\n📍 ${gps}` : "");
      const payload = { inspectionId: isEdit ? editData.inspectionId : "INS-"+Date.now(), projectId: currentSelectedProjectId, inspectionDate: new Date().toLocaleDateString(), inspectionType: document.getElementById('i_type').value, areaInspected: document.getElementById('i_area').value, siteCondition: condition, recommendations: document.getElementById('i_rec').value, attachments: normalizeAttachments(currentModalFiles) };
      callApi(isEdit ? 'updateInspection' : 'saveInspection', payload).then(() => { closeModal(); loadInspectionListings(); });
    };
  } else if (type === 'takeoff_item') {
    title.innerText = isEdit ? "Edit Take-Off" : "New Take-Off";
    if (isEdit && editData.beforePhotoUrl) currentModalFiles = splitAttachments(editData.beforePhotoUrl);
    body.innerHTML = `
      <label ${labelStyle}>Room/Area</label><input id="t_room" value="${escapeAttr(isEdit?editData.roomArea:'')}" ${largeInput}>
      <label ${labelStyle}>Trade Category</label><input id="t_trade" value="${escapeAttr(isEdit?editData.tradeCategory:'')}" ${largeInput}>
      <label ${labelStyle}>Description</label><input id="t_desc" value="${escapeAttr(isEdit?editData.description:'')}" ${largeInput}>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;"><input id="t_qty" placeholder="Quantity" value="${escapeAttr(isEdit?editData.quantity:'')}" ${largeInput}><select id="t_unit" ${largeInput}><option value="sqm">sqm</option><option value="m">m</option><option value="pcs">pcs</option></select></div>
      <label ${labelStyle}>Remarks</label><textarea id="t_notes" rows="2" ${largeInput}>${escapeHtml(isEdit?editData.scopeNotes:'')}</textarea>
      <div id="takeoffAttachmentsPreviews" class="modal-preview-grid" style="display:none;"></div>
      <label class="icon-upload-label"><i class="fas fa-paperclip"></i><input type="file" id="t_photo" accept="image/*" multiple style="display:none"></label>
      ${isEdit ? `<button class="action-btn" id="t_delete_btn" style="background:var(--danger); margin-top:10px;">Delete</button>` : ''}
    `;
    if (currentModalFiles.length) populateModalInlineImageGalleryPreviews('takeoffAttachmentsPreviews');
    document.getElementById('t_photo').onchange = (e) => processIncomingMultiAttachments(e.target.files, 'takeoffAttachmentsPreviews');
    if (isEdit) document.getElementById('t_delete_btn').onclick = () => { if(confirm("Delete?")) callApi('deleteTakeOffItem', { itemId: editData.itemId }).then(() => { closeModal(); loadTakeOffListings(); }); };
    submit.onclick = async () => {
      submit.disabled = true; submit.innerText = "GPS...";
      const gps = await getGPSLocation();
      submit.innerText = "Saving...";
      const finalNotes = document.getElementById('t_notes').value + (gps !== "GPS Unavailable" ? `\n📍 ${gps}` : "");
      const payload = { itemId: isEdit ? editData.itemId : "TO-"+Date.now(), projectId: currentSelectedProjectId, roomArea: document.getElementById('t_room').value, tradeCategory: document.getElementById('t_trade').value, description: document.getElementById('t_desc').value, quantity: document.getElementById('t_qty').value, unit: document.getElementById('t_unit').value, beforePhotoUrl: normalizeAttachments(currentModalFiles), scopeNotes: finalNotes };
      callApi(isEdit ? 'updateTakeOffItem' : 'saveTakeOffItem', payload).then(() => { closeModal(); loadTakeOffListings(); });
    };
  } else if (type === 'progress_entry') {
    title.innerText = "Log Progress";
    body.innerHTML = `
      <label ${labelStyle}>Trade</label><input id="l_trade" ${largeInput}>
      <label ${labelStyle}>Completion %</label><select id="l_pct" ${largeInput}><option>10</option><option>35</option><option>75</option><option>100</option></select>
      <label ${labelStyle}>Comments</label><textarea id="l_comm" rows="3" ${largeInput}></textarea>
      <div id="progressAttachmentsPreviews" class="modal-preview-grid" style="display:none;"></div>
      <label class="icon-upload-label"><i class="fas fa-paperclip"></i><input type="file" id="l_photo" accept="image/*" multiple style="display:none"></label>
    `;
    document.getElementById('l_photo').onchange = (e) => processIncomingMultiAttachments(e.target.files, 'progressAttachmentsPreviews');
    submit.onclick = async () => {
      submit.disabled = true; submit.innerText = "GPS...";
      const gps = await getGPSLocation();
      submit.innerText = "Saving...";
      const payload = { logId: "LOG-"+Date.now(), projectId: currentSelectedProjectId, tradeCategory: document.getElementById('l_trade').value, completionPercentage: document.getElementById('l_pct').value, commentNarrative: document.getElementById('l_comm').value + (gps !== "GPS Unavailable" ? `\n📍 ${gps}` : ""), progressPhotoUrl: normalizeAttachments(currentModalFiles) };
      callApi('saveProgressLog', payload).then(() => { closeModal(); loadProgressTimelineFeed(); });
    };
  } else if (type === 'vendor') {
    title.innerText = isEdit ? "Edit Vendor" : "New Vendor";
    if (isEdit) { currentAvatarPhoto = editData.passport; if(editData.attachments) currentModalFiles = splitAttachments(editData.attachments); }
    body.innerHTML = `
      <div class="passport-frame-container"><img id="passport_frame_view" src="${getDirectImageUrl(currentAvatarPhoto) || 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%3E%3Cpath%20fill%3D%22%23666%22%20d%3D%22M12%2012c2.21%200%204-1.79%204-4s-1.79-4-4-4-4%201.79-4%204%201.79%204%204%204zm0%202c-2.67%200-8%201.34-8%204v2h16v-2c0-2.66-5.33-4-8-4z%22%2F%3E%3C%2Fsvg%3E'}" style="width:100%; height:100%; object-fit:cover;"><label style="position:absolute; bottom:0; right:0; background:#000; color:white; border-radius:50%; width:30px; height:30px; display:flex; align-items:center; justify-content:center; cursor:pointer;"><i class="fas fa-camera"></i><input type="file" id="v_pass" accept="image/*" style="display:none"></label><div id="v_pass_remove" onclick="clearVendorAvatarPhoto()" style="position:absolute; top:0; right:0; background:red; color:white; border-radius:50%; width:22px; text-align:center; cursor:pointer;">&times;</div></div>
      <label ${labelStyle}>Company</label><input id="v_comp" value="${escapeAttr(isEdit?editData.company:'')}" ${largeInput}>
      <label ${labelStyle}>Trade</label><input id="v_trade" value="${escapeAttr(isEdit?editData.trade:'')}" ${largeInput}>
      <label ${labelStyle}>Contact Person</label><input id="v_contact" value="${escapeAttr(isEdit?editData.contactName:'')}" ${largeInput}>
      <label ${labelStyle}>Phone 1 (11 digits)</label><input id="v_phone1" type="tel" maxlength="11" oninput="this.value=this.value.replace(/[^0-9]/g,'')" value="${escapeAttr(isEdit?editData.phone1:'')}" ${largeInput}>
      <label ${labelStyle}>Phone 2</label><input id="v_phone2" type="tel" maxlength="11" oninput="this.value=this.value.replace(/[^0-9]/g,'')" value="${escapeAttr(isEdit?editData.phone2:'')}" ${largeInput}>
      <label ${labelStyle}>Email</label><input id="v_email" type="email" value="${escapeAttr(isEdit?editData.email:'')}" ${largeInput}>
      <div id="vendorAttachmentsPreviews" class="modal-preview-grid" style="display:none;"></div>
      <label class="icon-upload-label"><i class="fas fa-paperclip"></i><input type="file" id="v_files" accept="image/*,application/pdf" multiple style="display:none"></label>
      ${isEdit ? `<button class="action-btn" id="v_delete_btn" style="background:var(--danger); margin-top:10px;">Delete</button>` : ''}
    `;
    if (currentModalFiles.length) populateModalInlineImageGalleryPreviews('vendorAttachmentsPreviews');
    document.getElementById('v_pass').onchange = (e) => { const f = e.target.files[0]; if(f){ const r=new FileReader(); r.onload=async(ev)=>{ currentAvatarPhoto = await compressImageToTargetLimit(ev.target.result,190000); document.getElementById('passport_frame_view').src = currentAvatarPhoto; document.getElementById('v_pass_remove').style.display='block'; }; r.readAsDataURL(f); } };
    document.getElementById('v_files').onchange = (e) => processIncomingMultiAttachments(e.target.files, 'vendorAttachmentsPreviews');
    if(isEdit) document.getElementById('v_delete_btn').onclick = () => { if(confirm("Delete vendor?")) callApi('deleteVendor', { vendorId: editData.vendorId }).then(() => { closeModal(); refreshVendorsListView(); }); };
    submit.onclick = () => {
      const p1 = document.getElementById('v_phone1').value.trim(), p2 = document.getElementById('v_phone2').value.trim();
      if(p1 && !/^\d{11}$/.test(p1)) { alert("Phone 1 must be 11 digits"); return; }
      if(p2 && !/^\d{11}$/.test(p2)) { alert("Phone 2 must be 11 digits"); return; }
      submit.disabled = true; submit.innerText = "Saving...";
      const payload = { vendorId: isEdit ? editData.vendorId : "VND-"+Date.now(), company: document.getElementById('v_comp').value, trade: document.getElementById('v_trade').value, contactName: document.getElementById('v_contact').value, phone1: p1, phone2: p2, email: document.getElementById('v_email').value, passport: currentAvatarPhoto, attachments: normalizeAttachments(currentModalFiles), archived: "No" };
      callApi(isEdit ? 'updateVendor' : 'saveVendor', payload).then(() => { closeModal(); refreshVendorsListView(); });
    };
  } else if (type === 'workorder') {
    title.innerText = isEdit ? "Edit Work Order" : "New Work Order";
    if (isEdit && editData.attachments) currentModalFiles = splitAttachments(editData.attachments);
    body.innerHTML = `
      <label ${labelStyle}>ID</label><input value="${isEdit ? editData.workOrderId : generateFrontendPreviewId('workorder')}" disabled ${largeInput}>
      <label ${labelStyle}>Vendor</label><select id="wo_vendor" ${largeInput}>${cache.vendors.map(v=>`<option value="${v.vendorId}" ${isEdit && v.vendorId===editData.vendorId?'selected':''}>${escapeHtml(v.company)}</option>`).join('')}</select>
      <label ${labelStyle}>Description</label><textarea id="wo_desc" rows="2" ${largeInput}>${escapeHtml(isEdit?editData.description:'')}</textarea>
      <label ${labelStyle}>Amount (₦)</label><input id="wo_amount" type="number" value="${escapeAttr(isEdit?editData.amount:'')}" ${largeInput}>
      <label ${labelStyle}>Status</label><select id="wo_status" ${largeInput}><option value="Pending">Pending</option><option value="Active">Active</option><option value="Completed">Completed</option></select>
      <div id="woAttachmentsPreviews" class="modal-preview-grid" style="display:none;"></div>
      <label class="icon-upload-label"><i class="fas fa-paperclip"></i><input type="file" id="wo_files" accept="image/*,application/pdf" multiple style="display:none"></label>
    `;
    if (currentModalFiles.length) populateModalInlineImageGalleryPreviews('woAttachmentsPreviews');
    document.getElementById('wo_files').onchange = (e) => processIncomingMultiAttachments(e.target.files, 'woAttachmentsPreviews');
    submit.onclick = () => {
      if(!document.getElementById('wo_vendor').value) { alert("Select vendor"); return; }
      submit.disabled = true; submit.innerText = "Saving...";
      const payload = { workOrderId: isEdit ? editData.workOrderId : generateFrontendPreviewId('workorder'), projectId: currentSelectedProjectId, vendorId: document.getElementById('wo_vendor').value, description: document.getElementById('wo_desc').value, amount: document.getElementById('wo_amount').value, status: document.getElementById('wo_status').value, attachments: normalizeAttachments(currentModalFiles) };
      callApi(isEdit ? 'updateWorkOrder' : 'saveWorkOrder', payload).then(() => { closeModal(); loadWorkOrdersListings(); });
    };
  } else if (type === 'payment') {
    title.innerText = isEdit ? "Edit Payment" : "New Payment";
    if (isEdit && editData.attachments) currentModalFiles = splitAttachments(editData.attachments);
    body.innerHTML = `
      <label ${labelStyle}>ID</label><input value="${isEdit ? editData.paymentId : "PAY-*****"}" disabled ${largeInput}>
      <label ${labelStyle}>Direction</label><select id="pay_dir" ${largeInput}><option value="Client Receipt">Client Receipt</option><option value="Outgoing Payment">Outgoing Payment</option><option value="Small Expense">Small Expense</option></select>
      <label ${labelStyle}>Payee</label><input id="pay_payee" value="${escapeAttr(isEdit?editData.payee:'')}" ${largeInput}>
      <label ${labelStyle}>Category</label><select id="pay_cat" ${largeInput}><option value="">--</option><option value="Labour">Labour</option><option value="Materials">Materials</option><option value="Transport">Transport</option><option value="Misc">Misc</option></select>
      <label ${labelStyle}>Amount (₦)</label><input id="pay_amount" type="number" step="0.01" value="${escapeAttr(isEdit?editData.amount:'')}" ${largeInput}>
      <label ${labelStyle}>Method</label><select id="pay_method" ${largeInput}><option value="Cash">Cash</option><option value="Transfer">Transfer</option><option value="POS">POS</option></select>
      <label ${labelStyle}>Status</label><select id="pay_status" ${largeInput}><option value="Pending">Pending</option><option value="Cleared">Cleared</option></select>
      <label ${labelStyle}>Notes</label><textarea id="pay_notes" rows="2" ${largeInput}>${escapeHtml(isEdit?editData.notes:'')}</textarea>
      <div id="paymentAttachmentsPreviews" class="modal-preview-grid" style="display:none;"></div>
      <label class="icon-upload-label"><i class="fas fa-paperclip"></i><input type="file" id="pay_files" accept="image/*,application/pdf" multiple style="display:none"></label>
    `;
    if (currentModalFiles.length) populateModalInlineImageGalleryPreviews('paymentAttachmentsPreviews');
    document.getElementById('pay_files').onchange = (e) => processIncomingMultiAttachments(e.target.files, 'paymentAttachmentsPreviews');
    submit.onclick = () => {
      const amount = document.getElementById('pay_amount').value;
      if(!amount || amount<=0) { alert("Enter amount"); return; }
      submit.disabled = true; submit.innerText = "Saving...";
      const payload = { paymentId: isEdit ? editData.paymentId : null, // server will generate PAY-XXXXX
        projectId: currentSelectedProjectId, paymentDate: new Date().toLocaleDateString(),
        paymentDirection: document.getElementById('pay_dir').value, payee: document.getElementById('pay_payee').value,
        expenseCategory: document.getElementById('pay_cat').value, referenceId: "",
        amount: amount, paymentMethod: document.getElementById('pay_method').value,
        status: document.getElementById('pay_status').value, notes: document.getElementById('pay_notes').value,
        attachments: normalizeAttachments(currentModalFiles) };
      callApi(isEdit ? 'updatePayment' : 'savePayment', payload).then(() => { closeModal(); loadPaymentsListings(); });
    };
  }
}

function generateFrontendPreviewId(type) {
  const yy = new Date().getFullYear().toString().slice(-2);
  const prefix = type === 'project' ? `PRJ/${yy}/` : `WKO/${yy}/`;
  const dataset = type === 'project' ? cache.projects : cache.workorders;
  let max = 0;
  (dataset || []).forEach(item => {
    const id = String(item[type === 'project' ? 'projectId' : 'workOrderId'] || '');
    if (id.startsWith(prefix)) {
      const num = parseInt(id.substring(prefix.length));
      if (!isNaN(num) && num > max) max = num;
    }
  });
  return prefix + String(max+1).padStart(3, '0');
}

// ======================== REPORTS (simplified but functional) ========================
async function initReportsConsoleEngine() {
  const projects = await callApi('getProjects', {});
  cache.projects = projects || [];
  const pSel = document.getElementById('rep-project-sel');
  pSel.innerHTML = '<option value="">-- Select Project --</option>' + cache.projects.map(p => `<option value="${escapeAttr(p.projectId)}">${escapeHtml(p.clientName)} (${p.projectId})</option>`).join('');
}
function handleReportOptionsPopulation() {
  const tSel = document.getElementById('rep-template-sel');
  tSel.innerHTML = `<option value="">-- Choose Report --</option>
    <option value="inspection_report">Inspection Report</option>
    <option value="payment_summary">Payment Summary</option>
    <option value="master_dossier">Master Dossier</option>`;
}
async function compileFieldReport() {
  const pId = document.getElementById('rep-project-sel').value;
  const layout = document.getElementById('rep-template-sel').value;
  if (!pId || !layout) { alert("Select project and report type"); return; }
  const proj = cache.projects.find(p=>p.projectId===pId);
  const inspections = (await callApi('getInspections', {})).filter(i=>i.projectId===pId);
  const payments = (await callApi('getPayments', {})).filter(p=>p.projectId===pId);
  let html = `<h2>FieldScan Pro Report</h2><div>Project: ${escapeHtml(proj.clientName)} (${pId})</div>`;
  if (layout === 'inspection_report') {
    html += `<h3>Inspections</h3>${inspections.map(i=>`<div>${i.inspectionDate}: ${i.areaInspected} - ${i.siteCondition}</div>`).join('')}`;
  } else if (layout === 'payment_summary') {
    const totalIn = payments.filter(p=>p.paymentDirection==='Client Receipt').reduce((s,p)=>s+Number(p.amount),0);
    const totalOut = payments.filter(p=>p.paymentDirection!=='Client Receipt').reduce((s,p)=>s+Number(p.amount),0);
    html += `<h3>Payments</h3><div>Received: ₦${moneyValue(totalIn)}</div><div>Paid Out: ₦${moneyValue(totalOut)}</div><div>Balance: ₦${moneyValue(totalIn-totalOut)}</div>`;
  } else {
    html += `<h3>Master Dossier</h3><div>${inspections.length} inspections, ${payments.length} payments</div>`;
  }
  document.getElementById('report-preview-viewport').innerHTML = html;
  document.getElementById('report-print-container').innerHTML = html;
  document.getElementById('report-onscreen-preview-card').style.display = 'block';
}

// ======================== PAGE NAVIGATION ========================
function showPage(pageId) {
  document.querySelectorAll('.page-view').forEach(v => v.classList.remove('active-view'));
  const target = document.getElementById(`view-${pageId}`);
  if (target) target.classList.add('active-view');
  if (pageId === 'dashboard') refreshMasterDashboard();
  if (pageId === 'vendors') refreshVendorsListView();
  if (pageId === 'reports') initReportsConsoleEngine();
  window.scrollTo(0,0);
}
function closeModal() { document.getElementById('modalOverlay').style.display = 'none'; }

// ======================== SERVICE WORKER & INIT ========================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(e=>console.warn(e)));
}
window.addEventListener('online', syncQueuedRequests);
window.addEventListener('offline', updateSyncStatus);
window.onload = () => { updateSyncStatus(); refreshMasterDashboard(); if(navigator.onLine) syncQueuedRequests(); };
