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
  switchConsoleSegment('profile');
  showPage('project-console');
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
  if (seg === 'workorders') loadWorkOrdersListings();
  if (seg === 'payments') loadPaymentsListings();
}

// ======================== ITEM LOOKUP HELPERS ========================
// Used instead of inlining JSON.stringify(item) into onclick attributes,
// which breaks if any field contains a quote, apostrophe, or other
// HTML-sensitive character.

export function openInspectionById(id) {
  const cache = getCache();
  const item = (cache.inspections || []).find(i => i.inspectionId === id);
  if (item) openModal('inspection', item);
}
export function openTakeOffById(id) {
  const cache = getCache();
  const item = (cache.takeoffs || []).find(i => i.itemId === id);
  if (item) openModal('takeoff_item', item);
}
export function openWorkOrderById(id) {
  const cache = getCache();
  const item = (cache.workorders || []).find(w => w.workOrderId === id);
  if (item) openModal('workorder', item);
}
export function openPaymentById(id) {
  const cache = getCache();
  const item = (cache.payments || []).find(p => p.paymentId === id);
  if (item) openModal('payment', item);
}

// ======================== INSPECTIONS ========================
export async function loadInspectionListings() {
  const container = document.getElementById('console-inspections-list');
  container.innerHTML = `<p style="text-align:center;padding:15px;"><i class="fas fa-spinner fa-spin"></i> Loading inspections...</p>`;
  const items = await callApi('getInspections', {});
  const cache = getCache();
  cache.inspections = items || [];
  setCache(cache);
  const projectId = getCurrentProjectId();
  const projectItems = cache.inspections.filter(i => i.projectId === projectId);
  if (!projectItems.length) {
    container.innerHTML = `<p style="color:var(--muted); text-align:center; padding:20px;">No inspections recorded.</p>`;
    return;
  }
  container.innerHTML = projectItems.map(i => `
    <div class="card" data-id="${escapeAttr(i.inspectionId)}" onclick="window.openInspectionById(this.dataset.id)" style="cursor:pointer;">
      <strong>${escapeHtml(i.inspectionType)}</strong> - ${escapeHtml(i.areaInspected)}<br>
      <small>${escapeHtml(i.inspectionDate)}</small>
      <p>${escapeHtml(i.siteCondition)}</p>
    </div>
  `).join('');
}

// ======================== TAKE‑OFF ========================
export async function loadTakeOffListings() {
  const container = document.getElementById('console-takeoff-list');
  container.innerHTML = `<p style="text-align:center;padding:15px;"><i class="fas fa-spinner fa-spin"></i> Loading take‑off items...</p>`;
  const items = await callApi('getTakeOffItems', {});
  const cache = getCache();
  cache.takeoffs = items || [];
  setCache(cache);
  const projectId = getCurrentProjectId();
  const projectItems = cache.takeoffs.filter(i => i.projectId === projectId);
  if (!projectItems.length) {
    container.innerHTML = `<p style="text-align:center;padding:20px;">No take‑off items yet.</p>`;
    return;
  }
  container.innerHTML = projectItems.map(i => `
    <div class="card" data-id="${escapeAttr(i.itemId)}" onclick="window.openTakeOffById(this.dataset.id)" style="cursor:pointer;">
      <strong>${escapeHtml(i.roomArea)}</strong> | ${escapeHtml(i.tradeCategory)}<br>
      ${escapeHtml(i.description)}<br>
      <strong>${escapeHtml(i.quantity)} ${escapeHtml(i.unit)}</strong>
    </div>
  `).join('');
}

// ======================== PROGRESS LOGS ========================
export async function loadProgressTimelineFeed() {
  const container = document.getElementById('console-progress-feed');
  container.innerHTML = `<p style="text-align:center;padding:15px;"><i class="fas fa-spinner fa-spin"></i> Loading progress logs...</p>`;
  const logs = await callApi('getProgressLogs', {});
  const cache = getCache();
  cache.progressLogs = logs || [];
  setCache(cache);
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

// ======================== WORK ORDERS ========================
export async function loadWorkOrdersListings() {
  const container = document.getElementById('console-workorders-list');
  container.innerHTML = `<p style="text-align:center;padding:15px;"><i class="fas fa-spinner fa-spin"></i> Loading work orders...</p>`;
  const orders = await callApi('getWorkOrders', {});
  const cache = getCache();
  cache.workorders = orders || [];
  setCache(cache);
  const projectId = getCurrentProjectId();
  const projectOrders = cache.workorders.filter(w => w.projectId === projectId);
  if (!projectOrders.length) {
    container.innerHTML = `<p style="text-align:center;padding:20px;">No work orders.</p>`;
    return;
  }
  // Build a vendorId -> company name map for nicer display
  const vendorMap = {};
  (cache.allVendors || cache.vendors || []).forEach(v => { vendorMap[v.vendorId] = v.company; });

  container.innerHTML = projectOrders.map(w => `
    <div class="card" data-id="${escapeAttr(w.workOrderId)}" onclick="window.openWorkOrderById(this.dataset.id)" style="cursor:pointer;">
      <strong>${escapeHtml(vendorMap[w.vendorId] || w.vendorId)}</strong><br>
      ${escapeHtml(w.description)}<br>
      ₦${moneyValue(w.amount)}<br>
      Status: ${escapeHtml(w.status)}
    </div>
  `).join('');
}

// ======================== PAYMENTS (FIXED OVERFLOW) ========================
export async function loadPaymentsListings() {
  const container = document.getElementById('console-payments-list');
  container.innerHTML = `<p style="text-align:center; font-size:14px; font-weight:700;"><i class="fas fa-spinner fa-spin"></i> Loading payment records...</p>`;

  const payments = await callApi('getPayments', {});
  const cache = getCache();
  cache.payments = payments || [];
  setCache(cache);

  const projectId = getCurrentProjectId();
  const projectPayments = cache.payments.filter(p => p.projectId === projectId);

  if (projectPayments.length === 0) {
    container.innerHTML = `<p style="color:var(--muted); font-style:italic; text-align:center; padding:20px; font-size:14px;">No payment records logged.</p>`;
    return;
  }

  const totalReceived = projectPayments.filter(isClientReceipt).reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const totalExpenses = projectPayments.filter(p => !isClientReceipt(p)).reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const smallExpenses = projectPayments.filter(isPettyExpense).reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const netBalance = totalReceived - totalExpenses;

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
        <!-- Net Balance -->
        <div style="display: flex; justify-content: space-between; align-items: baseline; gap: 8px; min-width: 0; border-top: 1px solid var(--border); padding-top: 8px;">
          <span style="font-weight:800; text-transform:uppercase; font-size:14px; flex-shrink:0;">Net Balance</span>
          <span style="font-size:20px; font-weight:900; color:${netBalance >= 0 ? 'var(--success)' : 'var(--danger)'}; text-align:right; word-break:break-word; overflow-wrap:break-word; white-space:normal;">₦${moneyValue(netBalance)}</span>
        </div>
      </div>
    </div>
  `;

  const paymentsHtml = projectPayments.map(p => {
    const direction = paymentDirectionOf(p);
    const incoming = isClientReceipt(p);
    return `
      <div class="card" data-id="${escapeAttr(p.paymentId)}" onclick="window.openPaymentById(this.dataset.id)" style="background:#fff; border-color:#000; border-left:6px solid ${incoming ? 'var(--success)' : 'var(--danger)'}; cursor:pointer;">
        <div style="display:flex; justify-content:space-between; align-items:start; gap:10px;">
          <div>
            <strong style="font-size:18px;">${escapeHtml(p.payee || 'Payment')}</strong><br>
            <small style="color:var(--muted); font-weight:700;">${escapeHtml(p.paymentDate || '')} | ${escapeHtml(p.paymentMethod || '')} | ${escapeHtml(direction)}</small>
          </div>
          <span style="font-size:11px; font-weight:900; background:${p.status === 'Cleared' ? 'var(--success)' : '#fd7e14'}; color:#fff; padding:3px 8px; border-radius:4px; text-transform:uppercase;">${escapeHtml(p.status || 'Logged')}</span>
        </div>
        <div style="font-size:22px; font-weight:900; margin-top:8px; color:${incoming ? 'var(--success)' : 'var(--danger)'};">${incoming ? '+' : '-'}₦${moneyValue(p.amount)}</div>
        ${p.expenseCategory ? `<div style="font-size:12px; font-weight:900; color:var(--muted); text-transform:uppercase; margin-top:4px;">${escapeHtml(p.expenseCategory)}</div>` : ''}
        ${p.notes ? `<p style="font-size:14px; font-weight:600; margin-top:6px; color:#000;">${escapeHtml(p.notes)}</p>` : ''}
      </div>
    `;
  }).join('');

  container.innerHTML = totalsHtml + paymentsHtml;
}
