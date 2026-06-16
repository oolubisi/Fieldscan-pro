// console.js
import { escapeHtml, escapeAttr, moneyValue, paymentDirectionOf, isClientReceipt, isPettyExpense, getDirectImageUrl } from './utils.js';
import { callApi, getCache, setCache, setCurrentProjectId, getCurrentProjectId } from './api.js';
import { openModal } from './modals.js';
import { showPage } from './app.js';

// ======================== PROJECT CONSOLE LOADER ========================
export async function loadProjectConsoleHub(projectId) {
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
  if (scopeEl) {
    scopeEl.value = proj.scope || "";
    scopeEl.readOnly = true;
    scopeEl.style.background = '#f5f5f5';
  }
  const scopeToggle = document.getElementById('scope-edit-toggle');
  if (scopeToggle) scopeToggle.checked = false;
  const scopeSaveBtn = document.getElementById('scope-save-btn');
  if (scopeSaveBtn) scopeSaveBtn.style.display = 'none';
  showPage('project-console');
  switchConsoleSegment('profile');
}

export function toggleScopeEdit(isEditing) {
  const scopeEl = document.getElementById('c-meta-scope');
  const saveBtn = document.getElementById('scope-save-btn');
  if (!scopeEl) return;
  scopeEl.readOnly = !isEditing;
  scopeEl.style.background = isEditing ? '#fff' : '#f5f5f5';
  if (saveBtn) saveBtn.style.display = isEditing ? 'block' : 'none';
  if (isEditing) scopeEl.focus();
}

export async function saveProjectScope() {
  const btn = document.getElementById('scope-save-btn');
  const scopeEl = document.getElementById('c-meta-scope');
  const toggle = document.getElementById('scope-edit-toggle');
  const projectId = getCurrentProjectId();
  if (!projectId || !scopeEl) return;
  const newScope = scopeEl.value;
  btn.disabled = true; btn.innerText = "Saving...";
  try {
    await callApi('updateProjectScope', { projectId, scope: newScope });
    const cache = getCache();
    const proj = cache.projects.find(p => p.projectId === projectId);
    if (proj) proj.scope = newScope;
    setCache(cache);
    btn.innerText = "Save Scope";
    btn.disabled = false;
    if (toggle) toggle.checked = false;
    toggleScopeEdit(false);
  } catch (e) {
    btn.innerText = "Save Scope";
    btn.disabled = false;
    alert("Failed to save scope: " + (e.message || "Unknown error"));
  }
}

export function triggerEditProjectProfile() {
  const cache = getCache();
  const id = getCurrentProjectId();
  openModal('project', cache.projects.find(p => p.projectId === id));
}

export function switchConsoleSegment(seg) {
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
export async function loadInspectionListings(forceRefresh = false) {
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
export async function loadTakeOffListings(forceRefresh = false) {
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
export async function loadProgressTimelineFeed(forceRefresh = false) {
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
export async function loadSnagsListings(forceRefresh = false) {
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


export async function loadWorkOrdersListings(forceRefresh = false) {
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
export async function loadPaymentsListings(forceRefresh = false) {
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
