// dashboard.js
import { escapeHtml, escapeAttr, getDirectImageUrl } from './utils.js';
import { callApi, getCache, setCache } from './api.js';
import { openModal } from './modals.js';
import { loadProjectConsoleHub } from './console.js';

const PLACEHOLDER_AVATAR = 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%3E%3Cpath%20fill%3D%22%23666%22%20d%3D%22M12%2012c2.21%200%204-1.79%204-4s-1.79-4-4-4-4%201.79-4%204%201.79%204%204%204zm0%202c-2.67%200-8%201.34-8%204v2h16v-2c0-2.66-5.33-4-8-4z%22%2F%3E%3C%2Fsvg%3E';

export async function refreshMasterDashboard() {
  const projects = await callApi('getProjects', {});
  const cache = getCache();
  cache.projects = projects || [];
  setCache(cache);
  renderProjects();
}

export function renderProjects() {
  const container = document.getElementById('project-master-list');
  const term = document.getElementById('search-projects').value.toLowerCase();
  const cache = getCache();
  const filtered = cache.projects.filter(p => p.clientName?.toLowerCase().includes(term) || p.projectId?.toLowerCase().includes(term));
  if (!filtered.length) { container.innerHTML = '<p style="text-align:center;padding:20px;">No projects</p>'; return; }
  container.innerHTML = filtered.map(p => `<div class="card" data-project-id="${escapeAttr(p.projectId)}" onclick="window.loadProjectConsoleHub('${escapeAttr(p.projectId)}')" style="border-left:5px solid ${p.projectStatus==='Active'?'var(--success)':'var(--muted)'}; cursor:pointer;"><strong style="font-size:20px;">${escapeHtml(p.clientName)}</strong><br><span>${escapeHtml(p.siteLocation)}</span><div style="margin-top:6px; font-size:12px;">ID: ${escapeHtml(p.projectId)} | ${escapeHtml(p.projectStatus)}</div></div>`).join('');
}

export async function refreshVendorsListView() {
  const vendors = await callApi('getVendors', {});
  const cache = getCache();
  cache.vendors = (vendors || []).filter(v => v.archived !== "Yes");
  cache.allVendors = vendors || []; // includes archived, used by work order vendor picker if needed
  setCache(cache);
  const trades = [...new Set(cache.vendors.map(v=>v.trade).filter(Boolean))];
  const filterSelect = document.getElementById('filter-vendor-trade');
  if (filterSelect) filterSelect.innerHTML = '<option value="">All Trades</option>' + trades.map(t=>`<option value="${escapeAttr(t)}">${escapeHtml(t)}</option>`).join('');
  renderVendors();
}

export function renderVendors() {
  const term = document.getElementById('search-vendor').value.toLowerCase();
  const trade = document.getElementById('filter-vendor-trade').value;
  const cache = getCache();
  const filtered = cache.vendors.filter(v => (!term || v.company?.toLowerCase().includes(term)) && (!trade || v.trade === trade));
  const container = document.getElementById('vendor-master-list');
  if (!filtered.length) { container.innerHTML = '<p style="padding:20px;">No vendors</p>'; return; }
  container.innerHTML = filtered.map(v => `<div class="card" data-vendor-id="${escapeAttr(v.vendorId)}" onclick="window.openVendorById(this.dataset.vendorId)" style="display:flex; gap:12px; align-items:center; cursor:pointer;"><img src="${getDirectImageUrl(v.passport) || PLACEHOLDER_AVATAR}" style="width:50px; height:50px; border-radius:50%; object-fit:cover;"><div><strong>${escapeHtml(v.company)}</strong><br>${escapeHtml(v.trade)}<br>${escapeHtml(v.phone1)}</div></div>`).join('');
}

// Looks up a vendor by ID from the cache and opens its edit modal.
// Used instead of inlining JSON.stringify(v) into onclick attributes, which
// breaks if any field contains a quote, apostrophe, or other HTML-sensitive
// character.
export function openVendorById(vendorId) {
  const cache = getCache();
  const vendor = (cache.vendors || []).find(v => v.vendorId === vendorId) || (cache.allVendors || []).find(v => v.vendorId === vendorId);
  if (vendor) openModal('vendor', vendor);
}
