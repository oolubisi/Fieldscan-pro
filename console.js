// console.js
import { escapeHtml, escapeAttr, moneyValue, paymentDirectionOf, isClientReceipt, isPettyExpense, getDirectImageUrl } from './utils.js';
import { callApi, getCache, setCache, setCurrentProjectId, getCurrentProjectId } from './api.js';
import { openModal } from './modals.js';
import { showPage } from './app.js';

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
  openModal('project', cache.projects.find(p=>p.projectId===id));
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

export async function loadInspectionListings() {
  const container = document.getElementById('console-inspections-list');
  container.innerHTML = `<p style="text-align:center;padding:15px;"><i class="fas fa-spinner fa-spin"></i> Loading...</p>`;
  const items = await callApi('getInspections', {});
  const cache = getCache();
  cache.inspections = items || [];
  setCache(cache);
  const projectId = getCurrentProjectId();
  const projectItems = cache.inspections.filter(i => i.projectId === projectId);
  if (!projectItems.length) { container.innerHTML = `<p style="color:var(--muted); text-align:center; padding:20px;">No inspections yet.</p>`; return; }
  container.innerHTML = projectItems.map(i => `<div class="card" onclick="window.openModal('inspection', ${JSON.stringify(i).replace(/"/g, '&quot;')})" style="cursor:pointer;"><strong>${escapeHtml(i.inspectionType)}</strong> - ${escapeHtml(i.areaInspected)}<br><small>${escapeHtml(i.inspectionDate)}</small><p>${escapeHtml(i.siteCondition)}</p></div>`).join('');
}

export async function loadTakeOffListings() { /* similar, omitted for brevity */ }
export async function loadProgressTimelineFeed() { /* similar */ }
export async function loadWorkOrdersListings() { /* similar */ }
export async function loadPaymentsListings() { /* similar – use the fixed version we just created */ }
