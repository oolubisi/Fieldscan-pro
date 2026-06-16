// app.bundle.js
// Generated from the FieldScan Pro source files so the app also works when opened directly.


// ===== config.js =====
// config.js
const GAS_URL = "https://script.google.com/macros/s/AKfycbwQ5HeJP9_msrGeaHRpqn9cgXYwwV48oLS2uBb-F8S90rwprmtoSONpM1UxSECWw41v/exec"; // REPLACE
const AUTH_TOKEN = "FieldScan2025!SecureToken";
const ATTACHMENT_DELIMITER = "|||";

// ===== utils.js =====
// utils.js

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}
function escapeAttr(str) { return escapeHtml(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/`/g, '&#96;'); }
function moneyValue(val) { const n = Number(val || 0); return isNaN(n) ? '0' : n.toLocaleString(); }
function splitAttachments(val) { return String(val || '').split(ATTACHMENT_DELIMITER).map(s => s.trim()).filter(Boolean); }
function normalizeAttachments(files) { return files.filter(Boolean).join(ATTACHMENT_DELIMITER); }
function idsMatch(a, b) { return String(a).trim() === String(b).trim(); }

async function compressImageToTargetLimit(base64, maxBytes = 190000) {
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
      while (result.length > maxBytes && quality > 0.2) {
        quality -= 0.1;
        result = canvas.toDataURL('image/jpeg', quality);
      }
      resolve(result);
    };
  });
}

function getDirectImageUrl(url) {
  if (!url || url.startsWith('data:')) return url;
  const match = url.match(/\/d\/(.+?)\//) || url.match(/id=([^&]+)/);
  if (match && match[1]) {
    return `${GAS_URL}?id=${match[1]}&token=${AUTH_TOKEN}`;
  }
  // Bare Drive file ID (e.g. returned directly by code.gs after upload) - no slashes, no scheme
  if (!/[\/\s]/.test(url) && !url.includes('://')) {
    return `${GAS_URL}?id=${url}&token=${AUTH_TOKEN}`;
  }
  return url;
}

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

function todayFormatted() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}/${mm}/${dd}`;
}

function paymentDirectionOf(p) {
  return p.paymentDirection || p.direction || (p.payee === 'Client' ? 'Client Receipt' : 'Outgoing Payment');
}
function isClientReceipt(p) { return paymentDirectionOf(p) === 'Client Receipt'; }
function isPettyExpense(p) { return paymentDirectionOf(p) === 'Small Expense'; }

// ===== db.js =====
// db.js
const DB_NAME = "FieldScanOfflineDB";
const STORE_NAME = "syncQueue";

let dbPromise = null;

function openQueueDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = (e) => { e.target.result.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true }); };
    req.onsuccess = (e) => {
      const db = e.target.result;
      db.onclose = () => { dbPromise = null; };
      resolve(db);
    };
    req.onerror = (e) => { dbPromise = null; reject(e.target.error); };
  });
  return dbPromise;
}

async function queueOfflineRequest(action, data) {
  const db = await openQueueDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).add({ action, data, timestamp: Date.now() });
    tx.oncomplete = () => resolve();
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

// ===== backup.js =====
// backup.js

const GET_ACTION_BY_STORE = {
  projects: "getProjects", inspections: "getInspections", takeoffs: "getTakeOffItems",
  progressLogs: "getProgressLogs", snags: "getSnags", vendors: "getVendors", workorders: "getWorkOrders", payments: "getPayments"
};

const MUTATION_MAP = {
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
function readBackup(action, fallback = []) { const raw = localStorage.getItem(backupKey(action)); return raw ? JSON.parse(raw) : fallback; }
function writeBackup(action, value) {
  try {
    localStorage.setItem(backupKey(action), JSON.stringify(value));
  } catch (err) {
    console.error("writeBackup failed (storage may be full):", action, err);
    if (err && err.name === 'QuotaExceededError') {
      alert("⚠️ Local storage is full. Some offline data may not be saved. Try syncing and clearing attachments.");
    }
  }
}

function recomputeLocalStats() {
  const vendors = readBackup('getVendors', []);
  writeBackup('getStats', { activeVendors: vendors.filter(v => v.archived !== "Yes").length });
}

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
    else current[idx] = { ...current[idx], ...record };
  }
  writeBackup(getAction, current);
  if (cfg.store === "vendors") recomputeLocalStats();
}

// ===== reports.js =====
// reports.js

async function initReportsConsoleEngine() {
  const projects = await callApi('getProjects', {});
  const cache = getCache();
  cache.projects = projects || [];
  setCache(cache);
  const pSel = document.getElementById('rep-project-sel');
  if (pSel) pSel.innerHTML = '<option value="">-- Select Project --</option>' + cache.projects.map(p => `<option value="${escapeAttr(p.projectId)}">${escapeHtml(p.clientName)} (${p.projectId})</option>`).join('');
}

function handleReportOptionsPopulation() {
  const tSel = document.getElementById('rep-template-sel');
  if (tSel) tSel.innerHTML = `<option value="">-- Choose Report --</option>
    <option value="inspection_report">Inspection Report</option>
    <option value="payment_summary">Payment Summary</option>
    <option value="master_dossier">Master Dossier</option>`;
}

async function compileFieldReport() {
  const pId = document.getElementById('rep-project-sel').value;
  const layout = document.getElementById('rep-template-sel').value;
  if (!pId || !layout) { alert("Select project and report type"); return; }
  const cache = getCache();
  const proj = cache.projects.find(p=>p.projectId===pId);
  if (!proj) { alert("Selected project not found. Try refreshing data."); return; }
  const inspections = (await callApi('getInspections', {})).filter(i=>i.projectId===pId);
  const payments = (await callApi('getPayments', {})).filter(p=>p.projectId===pId);
  const snags = (await callApi('getSnags', {})).filter(s=>s.projectId===pId);
  let html = `<h2>FieldScan Pro Report</h2><div>Project: ${escapeHtml(proj.clientName)} (${pId})</div>`;
  if (layout === 'inspection_report') {
    html += `<h3>Inspections</h3>${inspections.map(i=>`<div>${i.inspectionDate}: ${i.areaInspected} - ${i.siteCondition}</div>`).join('')}`;
  } else if (layout === 'payment_summary') {
    const totalIn = payments.filter(p=>p.paymentDirection==='Client Receipt').reduce((s,p)=>s+Number(p.amount),0);
    const totalOut = payments.filter(p=>p.paymentDirection!=='Client Receipt').reduce((s,p)=>s+Number(p.amount),0);
    html += `<h3>Payments</h3><div>Received: ₦${moneyValue(totalIn)}</div><div>Paid Out: ₦${moneyValue(totalOut)}</div><div>Balance: ₦${moneyValue(totalIn-totalOut)}</div>`;
  } else {
    const openSnags = snags.filter(s=>s.status!=='Completed').length;
    html += `<h3>Master Dossier</h3><div>${inspections.length} inspections, ${payments.length} payments, ${snags.length} snags (${openSnags} open)</div>`;
  }
  const preview = document.getElementById('report-preview-viewport');
  if (preview) preview.innerHTML = html;
  const printContainer = document.getElementById('report-print-container');
  if (printContainer) printContainer.innerHTML = html;
  const card = document.getElementById('report-onscreen-preview-card');
  if (card) card.style.display = 'block';
}

// ===== modals.js =====
// modals.js

let currentModalFiles = [];
let currentAvatarPhoto = "";
let modalRecordCache = {};

function resetSubmitOnError(submit) {
  return (err) => {
    submit.disabled = false;
    submit.innerText = "Save";
  };
}

function openModalWithRecord(type, record) {
  if (record) {
    const idField = {project:'projectId',inspection:'inspectionId',takeoff_item:'itemId',workorder:'workOrderId',payment:'paymentId',vendor:'vendorId',snag:'snagId'}[type];
    const cacheKey = `${type}:${record[idField]}`;
    modalRecordCache[cacheKey] = record;
  }
  return openModal(type, record);
}

// ======================== ATTACHMENT PREVIEW HELPERS ========================
function populateModalInlineImageGalleryPreviews(containerId) {
  const box = document.getElementById(containerId);
  if (!box) return;
  if (!currentModalFiles.length) { box.innerHTML = ''; box.style.display = 'none'; return; }
  box.style.display = 'flex';
  box.innerHTML = currentModalFiles.map((url, idx) => {
    const src = url.startsWith('data:') ? url : getDirectImageUrl(url);
    return `<div style="position:relative; width:60px; height:60px;"><img src="${src}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;border:1px solid #000;"><div onclick="window.removeAttachmentByIndex(${idx}, '${containerId}')" style="position:absolute; top:-6px; right:-6px; background:red; color:white; border-radius:50%; width:20px; height:20px; text-align:center; line-height:18px; cursor:pointer;">&times;</div></div>`;
  }).join('');
}

function removeAttachmentByIndex(idx, containerId) { 
  currentModalFiles.splice(idx, 1); 
  populateModalInlineImageGalleryPreviews(containerId); 
}

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

function clearVendorAvatarPhoto() { 
  currentAvatarPhoto = ""; 
  const img = document.getElementById('passport_frame_view'); 
  if(img) img.src = 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%3E%3Cpath%20fill%3D%22%23666%22%20d%3D%22M12%2012c2.21%200%204-1.79%204-4s-1.79-4-4-4-4%201.79-4%204%201.79%204%204%204zm0%202c-2.67%200-8%201.34-8%204v2h16v-2c0-2.66-5.33-4-8-4z%22%2F%3E%3C%2Fsvg%3E'; 
  const btn = document.getElementById('v_pass_remove_btn'); 
  if(btn) btn.style.display = 'none'; 
}

function generateFrontendPreviewId(type) {
  const cache = getCache();
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

function closeModal() { 
  document.getElementById('modalOverlay').style.display = 'none'; 
}

// ======================== OPEN MODAL (FULL IMPLEMENTATION) ========================
async function openModal(type, editData = null) {
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

  // ---------- PROJECT ----------
  if (type === 'project') {
    title.innerText = isEdit ? "Edit Project" : "New Project";
    body.innerHTML = `
      <label ${labelStyle}>Project ID</label><input value="${escapeAttr(isEdit ? editData.projectId : generateFrontendPreviewId('project'))}" disabled style="${largeInput} background:#f0f0f0;">
      <label ${labelStyle}>Client Name</label><input id="p_client" value="${escapeAttr(isEdit?editData.clientName:'')}" ${largeInput}>
      <label ${labelStyle}>Site Location</label><input id="p_loc" value="${escapeAttr(isEdit?editData.siteLocation:'')}" ${largeInput}>
      <label ${labelStyle}>Client Phone (11 digits)</label><input id="p_phone" type="tel" maxlength="11" oninput="this.value=this.value.replace(/[^0-9]/g,'')" value="${escapeAttr(isEdit?editData.clientPhone:'')}" ${largeInput}>
      <label ${labelStyle}>Client Email</label><input id="p_email" type="email" value="${escapeAttr(isEdit?editData.clientEmail:'')}" ${largeInput}>
      <label ${labelStyle}>Status</label><select id="p_status" ${largeInput}>
        <option value="Active" ${isEdit&&editData.projectStatus==='Active'?'selected':''}>Active</option>
        <option value="In Planning" ${isEdit&&editData.projectStatus==='In Planning'?'selected':''}>In Planning</option>
        <option value="Handed Over" ${isEdit&&editData.projectStatus==='Handed Over'?'selected':''}>Handed Over</option>
        <option value="Declined" ${isEdit&&editData.projectStatus==='Declined'?'selected':''}>Declined</option>
      </select>
      <label ${labelStyle}>Scope</label><textarea id="p_scope" rows="3" ${largeInput}>${escapeHtml(isEdit?editData.scope:'')}</textarea>
      <label ${labelStyle}>Notes</label><textarea id="p_notes" rows="2" ${largeInput}>${escapeHtml(isEdit?editData.notes:'')}</textarea>
    `;
    submit.onclick = () => {
      const phone = document.getElementById('p_phone').value.trim();
      if (phone && !/^\d{11}$/.test(phone)) { alert("Phone must be 11 digits"); return; }
      submit.disabled = true; submit.innerText = "Saving...";
      const payload = {
        projectId: isEdit ? editData.projectId : generateFrontendPreviewId('project'),
        clientName: document.getElementById('p_client').value,
        siteLocation: document.getElementById('p_loc').value,
        clientPhone: phone,
        clientEmail: document.getElementById('p_email').value,
        projectStatus: document.getElementById('p_status').value,
        scope: document.getElementById('p_scope').value,
        notes: document.getElementById('p_notes').value
      };
      callApi(isEdit ? 'updateProject' : 'saveProject', payload).then(() => {
        closeModal();
        refreshMasterDashboard();
        if (isEdit) loadProjectConsoleHub(payload.projectId);
      }).catch(resetSubmitOnError(submit));
    };
  }
  // ---------- INSPECTION ----------
  else if (type === 'inspection') {
    const uniqueId = isEdit ? editData.inspectionId : "INS-" + Date.now();
    title.innerText = isEdit ? "Edit Inspection" : "New Inspection";
    if (isEdit && editData.attachments) currentModalFiles = splitAttachments(editData.attachments);
    body.innerHTML = `
      <label ${labelStyle}>Type</label>
      <select id="i_type" ${largeInput}>
        <option value="Initial Visit" ${isEdit && editData.inspectionType === 'Initial Visit' ? 'selected' : ''}>Initial Visit</option>
        <option value="Site Condition" ${isEdit && editData.inspectionType === 'Site Condition' ? 'selected' : ''}>Site Condition</option>
        <option value="Defect Check" ${isEdit && editData.inspectionType === 'Defect Check' ? 'selected' : ''}>Defect Check</option>
      </select>
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
      const payload = {
        inspectionId: uniqueId,
        projectId: getCurrentProjectId(),
        inspectionDate: todayFormatted(),
        inspectionType: document.getElementById('i_type').value,
        areaInspected: document.getElementById('i_area').value,
        siteCondition: condition,
        recommendations: document.getElementById('i_rec').value,
        attachments: normalizeAttachments(currentModalFiles)
      };
      callApi(isEdit ? 'updateInspection' : 'saveInspection', payload).then(() => {
        closeModal();
        loadInspectionListings();
      }).catch(resetSubmitOnError(submit));
    };
  }
  // ---------- TAKE-OFF ----------
  else if (type === 'takeoff_item') {
    const uniqueId = isEdit ? editData.itemId : "TO-" + Date.now();
    title.innerText = isEdit ? "Edit Take-Off" : "New Take-Off";
    if (isEdit && editData.beforePhotoUrl) currentModalFiles = splitAttachments(editData.beforePhotoUrl);
    body.innerHTML = `
      <label ${labelStyle}>Room/Area</label><input id="t_room" value="${escapeAttr(isEdit?editData.roomArea:'')}" ${largeInput}>
      <label ${labelStyle}>Trade Category</label><input id="t_trade" value="${escapeAttr(isEdit?editData.tradeCategory:'')}" ${largeInput}>
      <label ${labelStyle}>Description</label><input id="t_desc" value="${escapeAttr(isEdit?editData.description:'')}" ${largeInput}>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
        <input id="t_qty" placeholder="Quantity" value="${escapeAttr(isEdit?editData.quantity:'')}" ${largeInput}>
        <select id="t_unit" ${largeInput}>
          <option value="" ${!isEdit ? 'selected' : ''} disabled>Select unit</option>
          <option value="sqm" ${isEdit && editData.unit === 'sqm' ? 'selected' : ''}>sqm</option>
          <option value="m" ${isEdit && editData.unit === 'm' ? 'selected' : ''}>m</option>
          <option value="pcs" ${isEdit && editData.unit === 'pcs' ? 'selected' : ''}>pcs</option>
        </select>
      </div>
      <label ${labelStyle}>Remarks</label><textarea id="t_notes" rows="2" ${largeInput}>${escapeHtml(isEdit?editData.scopeNotes:'')}</textarea>
      <div id="takeoffAttachmentsPreviews" class="modal-preview-grid" style="display:none;"></div>
      <label class="icon-upload-label"><i class="fas fa-paperclip"></i><input type="file" id="t_photo" accept="image/*" multiple style="display:none"></label>
      ${isEdit ? `<button class="action-btn" id="t_delete_btn" style="background:var(--danger); margin-top:10px;">Delete</button>` : ''}
    `;
    if (currentModalFiles.length) populateModalInlineImageGalleryPreviews('takeoffAttachmentsPreviews');
    document.getElementById('t_photo').onchange = (e) => processIncomingMultiAttachments(e.target.files, 'takeoffAttachmentsPreviews');
    if (isEdit) {
      document.getElementById('t_delete_btn').onclick = () => {
        if (confirm("Delete this item?")) {
          callApi('deleteTakeOffItem', { itemId: uniqueId }).then(() => {
            closeModal();
            loadTakeOffListings();
          }).catch(() => {});
        }
      };
    }
    submit.onclick = async () => {
      if (!document.getElementById('t_unit').value) { alert("Select a unit"); return; }
      submit.disabled = true; submit.innerText = "GPS...";
      const gps = await getGPSLocation();
      submit.innerText = "Saving...";
      const finalNotes = document.getElementById('t_notes').value + (gps !== "GPS Unavailable" ? `\n📍 ${gps}` : "");
      const payload = {
        itemId: uniqueId,
        projectId: getCurrentProjectId(),
        roomArea: document.getElementById('t_room').value,
        tradeCategory: document.getElementById('t_trade').value,
        description: document.getElementById('t_desc').value,
        quantity: document.getElementById('t_qty').value,
        unit: document.getElementById('t_unit').value,
        beforePhotoUrl: normalizeAttachments(currentModalFiles),
        scopeNotes: finalNotes
      };
      callApi(isEdit ? 'updateTakeOffItem' : 'saveTakeOffItem', payload).then(() => {
        closeModal();
        loadTakeOffListings();
      }).catch(resetSubmitOnError(submit));
    };
  }
  // ---------- PROGRESS ENTRY ----------
  else if (type === 'progress_entry') {
    const uniqueId = "LOG-" + Date.now();
    title.innerText = "Log Progress";
    body.innerHTML = `
      <label ${labelStyle}>Trade</label><input id="l_trade" ${largeInput}>
      <label ${labelStyle}>Completion %</label>
      <select id="l_pct" ${largeInput}>
        <option value="" selected disabled>Select %</option>
        <option>10</option><option>35</option><option>75</option><option>100</option>
      </select>
      <label ${labelStyle}>Comments</label><textarea id="l_comm" rows="3" ${largeInput}></textarea>
      <div id="progressAttachmentsPreviews" class="modal-preview-grid" style="display:none;"></div>
      <label class="icon-upload-label"><i class="fas fa-paperclip"></i><input type="file" id="l_photo" accept="image/*" multiple style="display:none"></label>
    `;
    document.getElementById('l_photo').onchange = (e) => processIncomingMultiAttachments(e.target.files, 'progressAttachmentsPreviews');
    submit.onclick = async () => {
      if (!document.getElementById('l_pct').value) { alert("Select a completion %"); return; }
      if (!document.getElementById('l_trade').value.trim()) { alert("Enter a trade"); return; }
      submit.disabled = true; submit.innerText = "GPS...";
      const gps = await getGPSLocation();
      submit.innerText = "Saving...";
      const payload = {
        logId: uniqueId,
        projectId: getCurrentProjectId(),
        tradeCategory: document.getElementById('l_trade').value,
        completionPercentage: document.getElementById('l_pct').value,
        commentNarrative: document.getElementById('l_comm').value + (gps !== "GPS Unavailable" ? `\n📍 ${gps}` : ""),
        progressPhotoUrl: normalizeAttachments(currentModalFiles)
      };
      callApi('saveProgressLog', payload).then(() => {
        closeModal();
        loadProgressTimelineFeed();
      }).catch(resetSubmitOnError(submit));
    };
  }
  // ---------- VENDOR ----------
  else if (type === 'vendor') {
    const uniqueId = isEdit ? editData.vendorId : "VND-" + Date.now();
    title.innerText = isEdit ? "Edit Vendor" : "New Vendor";
    if (isEdit) { currentAvatarPhoto = editData.passport; if(editData.attachments) currentModalFiles = splitAttachments(editData.attachments); }
    body.innerHTML = `
      <div class="passport-frame-container">
        <img id="passport_frame_view" src="${getDirectImageUrl(currentAvatarPhoto) || 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%3E%3Cpath%20fill%3D%22%23666%22%20d%3D%22M12%2012c2.21%200%204-1.79%204-4s-1.79-4-4-4-4%201.79-4%204%201.79%204%204%204zm0%202c-2.67%200-8%201.34-8%204v2h16v-2c0-2.66-5.33-4-8-4z%22%2F%3E%3C%2Fsvg%3E'}" style="width:100%; height:100%; object-fit:cover;">
        <label style="position:absolute; bottom:0; right:0; background:#000; color:white; border-radius:50%; width:30px; height:30px; display:flex; align-items:center; justify-content:center; cursor:pointer;">
          <i class="fas fa-camera"></i>
          <input type="file" id="v_pass" accept="image/*" style="display:none">
        </label>
        <div id="v_pass_remove" onclick="window.clearVendorAvatarPhoto()" style="position:absolute; top:0; right:0; background:red; color:white; border-radius:50%; width:22px; text-align:center; cursor:pointer;">&times;</div>
      </div>
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
    document.getElementById('v_pass').onchange = (e) => {
      const f = e.target.files[0];
      if (f) {
        const r = new FileReader();
        r.onload = async (ev) => {
          currentAvatarPhoto = await compressImageToTargetLimit(ev.target.result, 190000);
          document.getElementById('passport_frame_view').src = currentAvatarPhoto;
          document.getElementById('v_pass_remove').style.display = 'block';
        };
        r.readAsDataURL(f);
      }
    };
    document.getElementById('v_files').onchange = (e) => processIncomingMultiAttachments(e.target.files, 'vendorAttachmentsPreviews');
    if (isEdit) {
      document.getElementById('v_delete_btn').onclick = () => {
        if (confirm("Delete vendor?")) {
          callApi('deleteVendor', { vendorId: uniqueId }).then(() => {
            closeModal();
            refreshVendorsListView();
          }).catch(() => {});
        }
      };
    }
    submit.onclick = () => {
      const p1 = document.getElementById('v_phone1').value.trim();
      const p2 = document.getElementById('v_phone2').value.trim();
      if (p1 && !/^\d{11}$/.test(p1)) { alert("Phone 1 must be 11 digits"); return; }
      if (p2 && !/^\d{11}$/.test(p2)) { alert("Phone 2 must be 11 digits"); return; }
      submit.disabled = true; submit.innerText = "Saving...";
      const payload = {
        vendorId: uniqueId,
        company: document.getElementById('v_comp').value,
        trade: document.getElementById('v_trade').value,
        contactName: document.getElementById('v_contact').value,
        phone1: p1,
        phone2: p2,
        email: document.getElementById('v_email').value,
        passport: currentAvatarPhoto,
        attachments: normalizeAttachments(currentModalFiles),
        archived: "No"
      };
      callApi(isEdit ? 'updateVendor' : 'saveVendor', payload).then(() => {
        closeModal();
        refreshVendorsListView();
      }).catch(resetSubmitOnError(submit));
    };
  }
  // ---------- WORK ORDER ----------
  else if (type === 'workorder') {
    const uniqueId = isEdit ? editData.workOrderId : generateFrontendPreviewId('workorder');
    title.innerText = isEdit ? "Edit Work Order" : "New Work Order";
    if (isEdit && editData.attachments) currentModalFiles = splitAttachments(editData.attachments);
    const vendors = getCache().vendors || [];
    body.innerHTML = `
      <label ${labelStyle}>ID</label><input value="${uniqueId}" disabled style="${largeInput} background:#f0f0f0;">
      <label ${labelStyle}>Vendor</label>
      <select id="wo_vendor" ${largeInput}>
        ${vendors.map(v => `<option value="${v.vendorId}" ${isEdit && v.vendorId === editData.vendorId ? 'selected' : ''}>${escapeHtml(v.company)}</option>`).join('')}
      </select>
      <label ${labelStyle}>Description</label><textarea id="wo_desc" rows="2" ${largeInput}>${escapeHtml(isEdit?editData.description:'')}</textarea>
      <label ${labelStyle}>Amount (₦)</label><input id="wo_amount" type="number" value="${escapeAttr(isEdit?editData.amount:'')}" ${largeInput}>
      <label ${labelStyle}>Status</label>
      <select id="wo_status" ${largeInput}>
        <option value="Pending" ${isEdit && editData.status === 'Pending' ? 'selected' : ''}>Pending</option>
        <option value="Active" ${isEdit && editData.status === 'Active' ? 'selected' : ''}>Active</option>
        <option value="Completed" ${isEdit && editData.status === 'Completed' ? 'selected' : ''}>Completed</option>
      </select>
      <div id="woAttachmentsPreviews" class="modal-preview-grid" style="display:none;"></div>
      <label class="icon-upload-label"><i class="fas fa-paperclip"></i><input type="file" id="wo_files" accept="image/*,application/pdf" multiple style="display:none"></label>
    `;
    if (currentModalFiles.length) populateModalInlineImageGalleryPreviews('woAttachmentsPreviews');
    document.getElementById('wo_files').onchange = (e) => processIncomingMultiAttachments(e.target.files, 'woAttachmentsPreviews');
    submit.onclick = () => {
      const vendorId = document.getElementById('wo_vendor').value;
      if (!vendorId) { alert("Select a vendor"); return; }
      submit.disabled = true; submit.innerText = "Saving...";
      const payload = {
        workOrderId: uniqueId,
        projectId: getCurrentProjectId(),
        vendorId: vendorId,
        description: document.getElementById('wo_desc').value,
        amount: document.getElementById('wo_amount').value,
        status: document.getElementById('wo_status').value,
        attachments: normalizeAttachments(currentModalFiles)
      };
      callApi(isEdit ? 'updateWorkOrder' : 'saveWorkOrder', payload).then(() => {
        closeModal();
        loadWorkOrdersListings();
      }).catch(resetSubmitOnError(submit));
    };
  }
  // ---------- SNAG ----------
  else if (type === 'snag') {
    const uniqueId = isEdit ? editData.snagId : "SNAG-" + Date.now();
    title.innerText = isEdit ? "Edit Snag" : "New Snag";
    if (isEdit && editData.photoUrl) currentModalFiles = splitAttachments(editData.photoUrl);
    body.innerHTML = `
      <label ${labelStyle}>Notes</label><textarea id="sn_notes" rows="3" ${largeInput}>${escapeHtml(isEdit?editData.notes:'')}</textarea>
      <label ${labelStyle}>Assigned To</label><input id="sn_assigned" value="${escapeAttr(isEdit?editData.assigned:'')}" ${largeInput}>
      <label ${labelStyle}>Date Logged</label><input id="sn_date_logged" type="text" value="${escapeAttr(isEdit ? editData.dateLogged : todayFormatted())}" placeholder="YYYY/MM/DD" disabled style="${largeInput} background:#f0f0f0;">
      <label ${labelStyle}>Status</label>
      <select id="sn_status" ${largeInput}>
        <option value="Open" ${(!isEdit || editData.status === 'Open') ? 'selected' : ''}>Open</option>
        <option value="Completed" ${isEdit && editData.status === 'Completed' ? 'selected' : ''}>Completed</option>
      </select>
      <div id="sn_date_completed_wrap" style="display:${isEdit && editData.status === 'Completed' ? 'block' : 'none'};">
        <label ${labelStyle}>Date Completed</label><input id="sn_date_completed" type="text" value="${escapeAttr(isEdit && editData.dateCompleted ? editData.dateCompleted : todayFormatted())}" placeholder="YYYY/MM/DD" disabled style="${largeInput} background:#f0f0f0;">
      </div>
      <div id="snagAttachmentsPreviews" class="modal-preview-grid" style="display:none;"></div>
      <label class="icon-upload-label"><i class="fas fa-paperclip"></i><input type="file" id="sn_photo" accept="image/*" multiple style="display:none"></label>
      ${isEdit ? `<button class="action-btn" id="sn_delete_btn" style="background:var(--danger); margin-top:10px;">Delete</button>` : ''}
    `;
    if (currentModalFiles.length) populateModalInlineImageGalleryPreviews('snagAttachmentsPreviews');
    document.getElementById('sn_photo').onchange = (e) => processIncomingMultiAttachments(e.target.files, 'snagAttachmentsPreviews');
    document.getElementById('sn_status').onchange = (e) => {
      const wrap = document.getElementById('sn_date_completed_wrap');
      if (e.target.value === 'Completed') {
        wrap.style.display = 'block';
        const inp = document.getElementById('sn_date_completed');
        if (!inp.value) inp.value = todayFormatted();
      } else {
        wrap.style.display = 'none';
      }
    };
    if (isEdit) {
      document.getElementById('sn_delete_btn').onclick = () => {
        if (confirm("Delete this snag?")) {
          callApi('deleteSnag', { snagId: uniqueId }).then(() => {
            closeModal();
            loadSnagsListings();
          }).catch(() => {});
        }
      };
    }
    submit.onclick = async () => {
      if (!document.getElementById('sn_notes').value.trim()) { alert("Enter snag notes"); return; }
      submit.disabled = true; submit.innerText = "Saving...";
      const status = document.getElementById('sn_status').value;
      const payload = {
        snagId: uniqueId,
        projectId: getCurrentProjectId(),
        notes: document.getElementById('sn_notes').value,
        assigned: document.getElementById('sn_assigned').value,
        dateLogged: isEdit ? editData.dateLogged : todayFormatted(),
        dateCompleted: status === 'Completed' ? document.getElementById('sn_date_completed').value : "",
        status: status,
        photoUrl: normalizeAttachments(currentModalFiles)
      };
      callApi(isEdit ? 'updateSnag' : 'saveSnag', payload).then(() => {
        closeModal();
        loadSnagsListings();
      }).catch(resetSubmitOnError(submit));
    };
  }
  else if (type === 'payment') {
    title.innerText = isEdit ? "Edit Payment" : "New Payment";
    if (isEdit && editData.attachments) currentModalFiles = splitAttachments(editData.attachments);
    const vendors = getCache().vendors || [];
    const projects = getCache().projects || [];
    const currentDir = isEdit ? paymentDirectionOf(editData) : 'Outgoing Payment';

    function payeeFieldHtml(direction) {
      const currentPayee = isEdit ? editData.payee : '';
      if (direction === 'Outgoing Payment') {
        return `<select id="pay_payee" ${largeInput}>
          <option value="">-- Select Subcontractor --</option>
          ${vendors.map(v => `<option value="${escapeAttr(v.company)}" ${currentPayee === v.company ? 'selected' : ''}>${escapeHtml(v.company)}</option>`).join('')}
        </select>`;
      } else if (direction === 'Client Receipt') {
        return `<select id="pay_payee" ${largeInput}>
          <option value="">-- Select Project --</option>
          ${projects.map(p => `<option value="${escapeAttr(p.clientName)}" data-project-id="${escapeAttr(p.projectId)}" ${currentPayee === p.clientName ? 'selected' : ''}>${escapeHtml(p.clientName)} (${escapeHtml(p.projectId)})</option>`).join('')}
        </select>`;
      } else {
        return `<input id="pay_payee" value="${escapeAttr(currentPayee)}" placeholder="Describe the expense" ${largeInput}>`;
      }
    }

    body.innerHTML = `
      <label ${labelStyle}>ID</label><input value="${isEdit ? editData.paymentId : "Auto-generated"}" disabled style="${largeInput} background:#f0f0f0;">
      <label ${labelStyle}>Direction</label>
      <select id="pay_dir" ${largeInput}>
        <option value="Client Receipt" ${currentDir === 'Client Receipt' ? 'selected' : ''}>Client Receipt</option>
        <option value="Outgoing Payment" ${currentDir === 'Outgoing Payment' ? 'selected' : ''}>Outgoing Payment</option>
        <option value="Small Expense" ${currentDir === 'Small Expense' ? 'selected' : ''}>Small Expense</option>
      </select>
      <label ${labelStyle}>Payee</label>
      <div id="pay_payee_wrap">${payeeFieldHtml(currentDir)}</div>
      <label ${labelStyle}>Category</label>
      <select id="pay_cat" ${largeInput}>
        <option value="">--</option>
        <option value="Labour" ${isEdit && editData.expenseCategory === 'Labour' ? 'selected' : ''}>Labour</option>
        <option value="Materials" ${isEdit && editData.expenseCategory === 'Materials' ? 'selected' : ''}>Materials</option>
        <option value="Transport" ${isEdit && editData.expenseCategory === 'Transport' ? 'selected' : ''}>Transport</option>
        <option value="Misc" ${isEdit && editData.expenseCategory === 'Misc' ? 'selected' : ''}>Misc</option>
      </select>
      <label ${labelStyle}>Amount (₦)</label><input id="pay_amount" type="number" step="0.01" value="${escapeAttr(isEdit?editData.amount:'')}" ${largeInput}>
      <label ${labelStyle}>Method</label>
      <select id="pay_method" ${largeInput}>
        <option value="Cash" ${isEdit && editData.paymentMethod === 'Cash' ? 'selected' : ''}>Cash</option>
        <option value="Transfer" ${(!isEdit || editData.paymentMethod === 'Transfer') ? 'selected' : ''}>Transfer</option>
        <option value="POS" ${isEdit && editData.paymentMethod === 'POS' ? 'selected' : ''}>POS</option>
      </select>
      <label ${labelStyle}>Status</label>
      <select id="pay_status" ${largeInput}>
        <option value="Pending" ${isEdit && editData.status === 'Pending' ? 'selected' : ''}>Pending</option>
        <option value="Cleared" ${isEdit && editData.status === 'Cleared' ? 'selected' : ''}>Cleared</option>
      </select>
      <label ${labelStyle}>Notes</label><textarea id="pay_notes" rows="2" ${largeInput}>${escapeHtml(isEdit?editData.notes:'')}</textarea>
      <div id="paymentAttachmentsPreviews" class="modal-preview-grid" style="display:none;"></div>
      <label class="icon-upload-label"><i class="fas fa-paperclip"></i><input type="file" id="pay_files" accept="image/*,application/pdf" multiple style="display:none"></label>
    `;
    if (currentModalFiles.length) populateModalInlineImageGalleryPreviews('paymentAttachmentsPreviews');
    document.getElementById('pay_files').onchange = (e) => processIncomingMultiAttachments(e.target.files, 'paymentAttachmentsPreviews');
    document.getElementById('pay_dir').onchange = (e) => {
      document.getElementById('pay_payee_wrap').innerHTML = payeeFieldHtml(e.target.value);
    };
    submit.onclick = () => {
      const amount = document.getElementById('pay_amount').value;
      if (!amount || amount <= 0) { alert("Enter a valid amount"); return; }
      const payee = document.getElementById('pay_payee').value;
      if (!payee) { alert("Select or enter a payee"); return; }
      submit.disabled = true; submit.innerText = "Saving...";
      const payload = {
        paymentId: isEdit ? editData.paymentId : "PAY-TEMP-" + Date.now(),
        projectId: getCurrentProjectId(),
        paymentDate: todayFormatted(),
        paymentDirection: document.getElementById('pay_dir').value,
        payee: payee,
        expenseCategory: document.getElementById('pay_cat').value,
        referenceId: "",
        amount: amount,
        paymentMethod: document.getElementById('pay_method').value,
        status: document.getElementById('pay_status').value,
        notes: document.getElementById('pay_notes').value,
        attachments: normalizeAttachments(currentModalFiles)
      };
      callApi(isEdit ? 'updatePayment' : 'savePayment', payload).then(() => {
        closeModal();
        loadPaymentsListings();
      }).catch(resetSubmitOnError(submit));
    };
  }
}

// ======================== EXPORTS ========================

// ===== dashboard.js =====
// dashboard.js

async function refreshMasterDashboard() {
  const container = document.getElementById('project-master-list');
  if (container) container.innerHTML = '<p style="text-align:center;padding:20px;"><i class="fas fa-spinner fa-spin"></i> Loading projects...</p>';
  try {
    const projects = await callApi('getProjects', {});
    const cache = getCache();
    cache.projects = projects || [];
    setCache(cache);
    renderProjects();
  } catch(e) {
    console.error("refreshMasterDashboard error:", e);
    if (container) container.innerHTML = '<p style="text-align:center;padding:20px;color:red;">Failed to load projects. Check your connection.</p>';
  }
}

function renderProjects() {
  const container = document.getElementById('project-master-list');
  const searchEl = document.getElementById('search-projects');
  if (!container || !searchEl) return;
  const term = searchEl.value.toLowerCase();
  const cache = getCache();
  const filtered = cache.projects.filter(p => p.clientName?.toLowerCase().includes(term) || p.projectId?.toLowerCase().includes(term));
  if (!filtered.length) { container.innerHTML = '<p style="text-align:center;padding:20px;">No projects</p>'; return; }
  try {
    container.innerHTML = filtered.map(p => `<div class="card" data-project-id="${escapeAttr(p.projectId)}" onclick="window.loadProjectConsoleHub('${escapeAttr(p.projectId)}')" style="border-left:5px solid ${p.projectStatus==='Active'?'var(--success)':'var(--muted)'}; cursor:pointer;"><strong style="font-size:20px;">${escapeHtml(p.clientName)}</strong><br><span>${escapeHtml(p.siteLocation)}</span><div style="margin-top:6px; font-size:12px;">ID: ${escapeHtml(p.projectId)} | ${escapeHtml(p.projectStatus)}</div></div>`).join('');
  } catch(e) {
    console.error("renderProjects error:", e);
    container.innerHTML = '<p style="text-align:center;padding:20px;color:red;">Error rendering projects. Check console.</p>';
  }
}

async function refreshVendorsListView() {
  const vendors = await callApi('getVendors', {});
  const cache = getCache();
  cache.vendors = vendors || [];
  setCache(cache);
  const trades = [...new Set(cache.vendors.map(v=>v.trade).filter(Boolean))];
  const filterSelect = document.getElementById('filter-vendor-trade');
  if (filterSelect) filterSelect.innerHTML = '<option value="">All Trades</option>' + trades.map(t=>`<option value="${escapeAttr(t)}">${escapeHtml(t)}</option>`).join('');
  renderVendors();
}

function renderVendors() {
  const term = document.getElementById('search-vendor').value.toLowerCase();
  const trade = document.getElementById('filter-vendor-trade').value;
  const cache = getCache();
  const filtered = cache.vendors.filter(v => (!term || v.company?.toLowerCase().includes(term)) && (!trade || v.trade === trade));
  const container = document.getElementById('vendor-master-list');
  if (!filtered.length) { container.innerHTML = '<p style="padding:20px;">No vendors</p>'; return; }
  container.innerHTML = filtered.map(v => {
    const key = `vendor:${v.vendorId}`;
    window.modalRecordCache = window.modalRecordCache || {};
    window.modalRecordCache[key] = v;
    return `<div class="card" data-modal-type="vendor" data-modal-key="${key}" onclick="window.openModalWithRecord('vendor', window.modalRecordCache['${key}'])" style="display:flex; gap:12px; align-items:center;"><img src="${getDirectImageUrl(v.passport) || 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%3E%3Cpath%20fill%3D%22%23666%22%20d%3D%22M12%2012c2.21%200%204-1.79%204-4s-1.79-4-4-4-4%201.79-4%204%201.79%204%204%204zm0%202c-2.67%200-8%201.34-8%204v2h16v-2c0-2.66-5.33-4-8-4z%22%2F%3E%3C%2Fsvg%3E'}" style="width:50px; height:50px; border-radius:50%; object-fit:cover;"><div><strong>${escapeHtml(v.company)}</strong><br>${escapeHtml(v.trade)}<br>${escapeHtml(v.phone1)}</div></div>`;
  }).join('');
}

// ===== console.js =====
// console.js

// ======================== PROJECT CONSOLE LOADER ========================
async function loadProjectConsoleHub(projectId) {
  setCurrentProjectId(projectId);
  const cache = getCache();
  const proj = cache.projects.find(p => p.projectId === projectId);
  if (!proj) return;
  document.getElementById('console-title-text').innerText = proj.projectId;
  document.getElementById('c-meta-name').innerText = proj.clientName;
  document.getElementById('c-meta-loc').innerText = proj.siteLocation;
  document.getElementById('c-meta-phone').innerHTML = proj.clientPhone || "No phone";
  document.getElementById('c-meta-phone').href = proj.clientPhone ? "tel:"+proj.clientPhone : "#";
  document.getElementById('c-meta-notes').value = proj.notes || "";
  const scopeEl = document.getElementById('c-meta-scope');
  if (scopeEl) scopeEl.value = proj.scope || "";
  showPage('project-console');
  switchConsoleSegment('profile');
}

function triggerEditProjectProfile() {
  const cache = getCache();
  const id = getCurrentProjectId();
  openModal('project', cache.projects.find(p => p.projectId === id));
}

function switchConsoleSegment(seg) {
  document.querySelectorAll('.console-tab-window').forEach(w => w.classList.remove('active-view'));
  document.querySelectorAll('.segment-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`console-seg-${seg}`).classList.add('active-view');
  document.getElementById(`seg-btn-${seg}`).classList.add('active');
  if (seg === 'inspections') loadInspectionListings();
  if (seg === 'takeoff') loadTakeOffListings();
  if (seg === 'progress') loadProgressTimelineFeed();
  if (seg === 'snags') loadSnagsListings();
  if (seg === 'workorders') loadWorkOrdersListings();
  if (seg === 'payments') loadPaymentsListings();
}

// ======================== INSPECTIONS ========================
async function loadInspectionListings(forceRefresh = false) {
  const container = document.getElementById('console-inspections-list');
  let cache = getCache();
  if (forceRefresh || !cache.inspections.length) {
    container.innerHTML = `<p style="text-align:center;padding:15px;"><i class="fas fa-spinner fa-spin"></i> Loading inspections...</p>`;
    const items = await callApi('getInspections', {});
    cache = getCache();
    cache.inspections = items || [];
    setCache(cache);
  }
  const projectId = getCurrentProjectId();
  const projectItems = cache.inspections.filter(i => i.projectId === projectId);
  if (!projectItems.length) {
    container.innerHTML = `<p style="color:var(--muted); text-align:center; padding:20px;">No inspections recorded.</p>`;
    return;
  }
  container.innerHTML = projectItems.map(i => {
    const key = `inspection:${i.inspectionId}`;
    window.modalRecordCache = window.modalRecordCache || {};
    window.modalRecordCache[key] = i;
    return `
    <div class="card" data-modal-type="inspection" data-modal-key="${key}" onclick="window.openModalWithRecord('inspection', window.modalRecordCache['${key}'])" style="cursor:pointer;">
      <strong>${escapeHtml(i.inspectionType)}</strong> - ${escapeHtml(i.areaInspected)}<br>
      <small>${escapeHtml(i.inspectionDate)}</small>
      <p>${escapeHtml(i.siteCondition)}</p>
    </div>
  `}).join('');
}

// ======================== TAKE‑OFF ========================
async function loadTakeOffListings(forceRefresh = false) {
  const container = document.getElementById('console-takeoff-list');
  let cache = getCache();
  if (forceRefresh || !cache.takeoffs.length) {
    container.innerHTML = `<p style="text-align:center;padding:15px;"><i class="fas fa-spinner fa-spin"></i> Loading take‑off items...</p>`;
    const items = await callApi('getTakeOffItems', {});
    cache = getCache();
    cache.takeoffs = items || [];
    setCache(cache);
  }
  const projectId = getCurrentProjectId();
  const projectItems = cache.takeoffs.filter(i => i.projectId === projectId);
  if (!projectItems.length) {
    container.innerHTML = `<p style="text-align:center;padding:20px;">No take‑off items yet.</p>`;
    return;
  }
  container.innerHTML = projectItems.map(i => {
    const key = `takeoff_item:${i.itemId}`;
    window.modalRecordCache = window.modalRecordCache || {};
    window.modalRecordCache[key] = i;
    return `
    <div class="card" data-modal-type="takeoff_item" data-modal-key="${key}" onclick="window.openModalWithRecord('takeoff_item', window.modalRecordCache['${key}'])" style="cursor:pointer;">
      <strong>${escapeHtml(i.roomArea)}</strong> | ${escapeHtml(i.tradeCategory)}<br>
      ${escapeHtml(i.description)}<br>
      <strong>${escapeHtml(i.quantity)} ${escapeHtml(i.unit)}</strong>
    </div>
  `}).join('');
}

// ======================== PROGRESS LOGS ========================
async function loadProgressTimelineFeed(forceRefresh = false) {
  const container = document.getElementById('console-progress-feed');
  let cache = getCache();
  if (forceRefresh || !cache.progressLogs.length) {
    container.innerHTML = `<p style="text-align:center;padding:15px;"><i class="fas fa-spinner fa-spin"></i> Loading progress logs...</p>`;
    const logs = await callApi('getProgressLogs', {});
    cache = getCache();
    cache.progressLogs = logs || [];
    setCache(cache);
  }
  const projectId = getCurrentProjectId();
  const projectLogs = cache.progressLogs.filter(l => l.projectId === projectId);
  if (!projectLogs.length) {
    container.innerHTML = `<p style="text-align:center;padding:20px;">No progress logs.</p>`;
    return;
  }
  container.innerHTML = projectLogs.map(l => `
    <div class="card">
      <strong>${escapeHtml(l.tradeCategory)}</strong> - ${escapeHtml(l.completionPercentage)}%<br>
      ${escapeHtml(l.commentNarrative)}<br>
      <small>${escapeHtml(l.dateRecorded)}</small>
    </div>
  `).join('');
}

// ======================== SNAGS ========================
async function loadSnagsListings(forceRefresh = false) {
  const container = document.getElementById('console-snags-list');
  let cache = getCache();
  if (forceRefresh || !cache.snags.length) {
    container.innerHTML = `<p style="text-align:center;padding:15px;"><i class="fas fa-spinner fa-spin"></i> Loading snags...</p>`;
    const items = await callApi('getSnags', {});
    cache = getCache();
    cache.snags = items || [];
    setCache(cache);
  }
  const projectId = getCurrentProjectId();
  const projectSnags = cache.snags.filter(s => s.projectId === projectId);
  if (!projectSnags.length) {
    container.innerHTML = `<p style="text-align:center;padding:20px;">No snags recorded.</p>`;
    return;
  }
  container.innerHTML = projectSnags.map(s => {
    const key = `snag:${s.snagId}`;
    window.modalRecordCache = window.modalRecordCache || {};
    window.modalRecordCache[key] = s;
    const isOpen = s.status !== 'Completed';
    return `
    <div class="card" data-modal-type="snag" data-modal-key="${key}" onclick="window.openModalWithRecord('snag', window.modalRecordCache['${key}'])" style="cursor:pointer; border-left:6px solid ${isOpen ? 'var(--danger)' : 'var(--success)'};">
      <div style="display:flex; justify-content:space-between; align-items:start; gap:10px;">
        <p style="margin:0;">${escapeHtml(s.notes)}</p>
        <span style="font-size:11px; font-weight:900; background:${isOpen ? 'var(--danger)' : 'var(--success)'}; color:#fff; padding:3px 8px; border-radius:4px; text-transform:uppercase; flex-shrink:0;">${escapeHtml(s.status || 'Open')}</span>
      </div>
      ${s.assigned ? `<div style="margin-top:6px; font-size:13px;"><strong>Assigned:</strong> ${escapeHtml(s.assigned)}</div>` : ''}
      <div style="margin-top:6px; font-size:12px; color:var(--muted);">Logged: ${escapeHtml(s.dateLogged)}${s.dateCompleted ? ` | Completed: ${escapeHtml(s.dateCompleted)}` : ''}</div>
    </div>
  `}).join('');
}


async function loadWorkOrdersListings(forceRefresh = false) {
  const container = document.getElementById('console-workorders-list');
  let cache = getCache();
  if (forceRefresh || !cache.workorders.length) {
    container.innerHTML = `<p style="text-align:center;padding:15px;"><i class="fas fa-spinner fa-spin"></i> Loading work orders...</p>`;
    const orders = await callApi('getWorkOrders', {});
    cache = getCache();
    cache.workorders = orders || [];
    setCache(cache);
  }
  const projectId = getCurrentProjectId();
  const projectOrders = cache.workorders.filter(w => w.projectId === projectId);
  if (!projectOrders.length) {
    container.innerHTML = `<p style="text-align:center;padding:20px;">No work orders.</p>`;
    return;
  }
  container.innerHTML = projectOrders.map(w => {
    const key = `workorder:${w.workOrderId}`;
    window.modalRecordCache = window.modalRecordCache || {};
    window.modalRecordCache[key] = w;
    return `
    <div class="card" data-modal-type="workorder" data-modal-key="${key}" onclick="window.openModalWithRecord('workorder', window.modalRecordCache['${key}'])" style="cursor:pointer;">
      <strong>${escapeHtml(w.vendorId)}</strong><br>
      ${escapeHtml(w.description)}<br>
      ₦${moneyValue(w.amount)}<br>
      Status: ${escapeHtml(w.status)}
    </div>
  `}).join('');
}

// ======================== PAYMENTS ========================
async function loadPaymentsListings(forceRefresh = false) {
  const container = document.getElementById('console-payments-list');
  let cache = getCache();
  if (forceRefresh || !cache.payments.length) {
    container.innerHTML = `<p style="text-align:center; font-size:14px; font-weight:700;"><i class="fas fa-spinner fa-spin"></i> Loading payment records...</p>`;
    const payments = await callApi('getPayments', {});
    cache = getCache();
    cache.payments = payments || [];
    setCache(cache);
  }

  const projectId = getCurrentProjectId();
  const projectPayments = cache.payments.filter(p => p.projectId === projectId);
  
  if (projectPayments.length === 0) {
    container.innerHTML = `<p style="color:var(--muted); font-style:italic; text-align:center; padding:20px; font-size:14px;">No payment records logged.</p>`;
    return;
  }
  
  const clearedPayments = projectPayments.filter(p => p.status !== 'Pending');
  const pendingPayments = projectPayments.filter(p => p.status === 'Pending' && !isClientReceipt(p));
  const totalReceived = clearedPayments.filter(isClientReceipt).reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const totalExpenses = clearedPayments.filter(p => !isClientReceipt(p)).reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const smallExpenses = clearedPayments.filter(isPettyExpense).reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const totalPending = pendingPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const netBalance = totalReceived - totalExpenses - totalPending;
  
  // Build totals card with safe flex + word‑break
  const totalsHtml = `
    <div class="card" style="background:var(--card); border-color:#000; padding:12px;">
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <!-- Client Received -->
        <div style="display: flex; justify-content: space-between; align-items: baseline; gap: 8px; min-width: 0;">
          <span style="font-weight:800; text-transform:uppercase; font-size:13px; flex-shrink:0;">Client Received</span>
          <span style="font-size:18px; font-weight:900; color:var(--success); text-align:right; word-break:break-word; overflow-wrap:break-word; white-space:normal;">₦${moneyValue(totalReceived)}</span>
        </div>
        <!-- Total Outgoing -->
        <div style="display: flex; justify-content: space-between; align-items: baseline; gap: 8px; min-width: 0;">
          <span style="font-weight:800; text-transform:uppercase; font-size:13px; flex-shrink:0;">Total Outgoing</span>
          <span style="font-size:18px; font-weight:900; color:var(--danger); text-align:right; word-break:break-word; overflow-wrap:break-word; white-space:normal;">₦${moneyValue(totalExpenses)}</span>
        </div>
        <!-- Small Expenses -->
        <div style="display: flex; justify-content: space-between; align-items: baseline; gap: 8px; min-width: 0;">
          <span style="font-weight:800; text-transform:uppercase; font-size:13px; flex-shrink:0;">Small Expenses</span>
          <span style="font-size:16px; font-weight:900; text-align:right; word-break:break-word; overflow-wrap:break-word; white-space:normal;">₦${moneyValue(smallExpenses)}</span>
        </div>
        <!-- Pending Payments -->
        <div style="display: flex; justify-content: space-between; align-items: baseline; gap: 8px; min-width: 0;">
          <span style="font-weight:800; text-transform:uppercase; font-size:13px; flex-shrink:0;">Pending Payments</span>
          <span style="font-size:18px; font-weight:900; color:#fd7e14; text-align:right; word-break:break-word; overflow-wrap:break-word; white-space:normal;">₦${moneyValue(totalPending)}</span>
        </div>
        <!-- Net Balance -->
        <div style="display: flex; justify-content: space-between; align-items: baseline; gap: 8px; min-width: 0; border-top: 1px solid var(--border); padding-top: 8px;">
          <span style="font-weight:800; text-transform:uppercase; font-size:14px; flex-shrink:0;">Net Balance</span>
          <span style="font-size:18px; font-weight:900; color:${netBalance >= 0 ? 'var(--success)' : 'var(--danger)'}; text-align:right; word-break:break-word; overflow-wrap:break-word; white-space:normal;">₦${moneyValue(netBalance)}</span>
        </div>
      </div>
    </div>
  `;
  
  const paymentsHtml = projectPayments.map(p => {
    const direction = paymentDirectionOf(p);
    const incoming = isClientReceipt(p);
    const key = `payment:${p.paymentId}`;
    window.modalRecordCache = window.modalRecordCache || {};
    window.modalRecordCache[key] = p;
    return `
      <div class="card" data-modal-type="payment" data-modal-key="${key}" onclick="window.openModalWithRecord('payment', window.modalRecordCache['${key}'])" style="background:#fff; border-color:#000; border-left:6px solid ${incoming ? 'var(--success)' : 'var(--danger)'}; cursor:pointer;">
        <div style="display:flex; justify-content:space-between; align-items:start; gap:10px;">
          <div>
            <strong style="font-size:18px;">${escapeHtml(p.payee || 'Payment')}</strong><br>
            <small style="color:var(--muted); font-weight:700;">${escapeHtml(p.paymentDate || '')} | ${escapeHtml(p.paymentMethod || '')} | ${escapeHtml(direction)}</small>
          </div>
          <span style="font-size:11px; font-weight:900; background:${p.status === 'Cleared' ? 'var(--success)' : '#fd7e14'}; color:#fff; padding:3px 8px; border-radius:4px; text-transform:uppercase;">${escapeHtml(p.status || 'Logged')}</span>
        </div>
        <div style="font-size:18px; font-weight:900; margin-top:8px; color:${incoming ? 'var(--success)' : 'var(--danger)'};">${incoming ? '+' : '-'}₦${moneyValue(p.amount)}</div>
        ${p.expenseCategory ? `<div style="font-size:12px; font-weight:900; color:var(--muted); text-transform:uppercase; margin-top:4px;">${escapeHtml(p.expenseCategory)}</div>` : ''}
        ${p.notes ? `<p style="font-size:14px; font-weight:600; margin-top:6px; color:#000;">${escapeHtml(p.notes)}</p>` : ''}
      </div>
    `;
  }).join('');
  
  container.innerHTML = totalsHtml + paymentsHtml;
}

// ===== api.js =====
// api.js

let cache = { projects: [], inspections: [], takeoffs: [], progressLogs: [], snags: [], vendors: [], workorders: [], payments: [] };
let currentSelectedProjectId = null;

function setCache(newCache) { cache = { ...cache, ...newCache }; }
function getCache() { return cache; }
function setCurrentProjectId(id) { currentSelectedProjectId = id; }
function getCurrentProjectId() { return currentSelectedProjectId; }

async function callApi(action, data = {}) {
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

async function syncQueuedRequests() {
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

async function updateSyncStatus() {
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

async function triggerManualSync() {
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

async function refreshAllData() {
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

// ===== app.js =====
// app.js

let appStarted = false;
let suppressPageRefresh = false;

// Define showPage first
function showPage(pageId) {
  document
    .querySelectorAll('.page-view:not(.console-tab-window)')
    .forEach(v => v.classList.remove('active-view'));
  const target = document.getElementById(`view-${pageId}`);
  if (target) target.classList.add('active-view');
  if (!suppressPageRefresh) {
    if (pageId === 'dashboard') refreshMasterDashboard();
    if (pageId === 'vendors') refreshVendorsListView();
    if (pageId === 'reports') initReportsConsoleEngine();
  }
  window.scrollTo(0, 0);
}

function showPageWithoutRefresh(pageId) {
  suppressPageRefresh = true;
  showPage(pageId);
  suppressPageRefresh = false;
}

// Attach ALL global functions to window
window.showPage = showPage;
window.loadProjectConsoleHub = loadProjectConsoleHub;
window.triggerEditProjectProfile = triggerEditProjectProfile;
window.switchConsoleSegment = switchConsoleSegment;
window.openModal = openModal;
window.openModalWithRecord = openModalWithRecord;
window.closeModal = closeModal;
window.removeAttachmentByIndex = removeAttachmentByIndex;
window.clearVendorAvatarPhoto = clearVendorAvatarPhoto;
window.triggerManualSync = triggerManualSync;
window.refreshAllData = refreshAllData;
window.handleReportOptionsPopulation = handleReportOptionsPopulation;
window.compileFieldReport = compileFieldReport;

// Service Worker & Events
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(e => console.warn(e)));
}
window.addEventListener('online', syncQueuedRequests);
window.addEventListener('offline', updateSyncStatus);

// Initial load
window.addEventListener('load', () => {
  if (appStarted) return;
  appStarted = true;
  updateSyncStatus();
  showPageWithoutRefresh('dashboard');
  refreshMasterDashboard();
  if (navigator.onLine) syncQueuedRequests();
});

