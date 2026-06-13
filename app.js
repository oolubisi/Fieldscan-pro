// app.js
import { refreshMasterDashboard, refreshVendorsListView } from './dashboard.js';
import { syncQueuedRequests, updateSyncStatus, triggerManualSync, refreshAllData, setCache, getCache } from './api.js';
import { initReportsConsoleEngine, handleReportOptionsPopulation, compileFieldReport } from './reports.js';
import { openModal, closeModal } from './modals.js';
import { loadProjectConsoleHub, triggerEditProjectProfile, switchConsoleSegment, loadInspectionListings, loadTakeOffListings, loadProgressTimelineFeed, loadWorkOrdersListings, loadPaymentsListings } from './console.js';

// Expose necessary functions to global scope for inline onclick handlers
window.openModal = openModal;
window.closeModal = closeModal;
window.loadProjectConsoleHub = loadProjectConsoleHub;
window.triggerEditProjectProfile = triggerEditProjectProfile;
window.switchConsoleSegment = switchConsoleSegment;
window.showPage = showPage;
window.triggerManualSync = triggerManualSync;
window.refreshAllData = refreshAllData;
window.handleReportOptionsPopulation = handleReportOptionsPopulation;
window.compileFieldReport = compileFieldReport;
window.removeAttachmentByIndex = (idx, containerId) => {
  import('./modals.js').then(module => module.removeAttachmentByIndex(idx, containerId));
};
window.clearVendorAvatarPhoto = () => {
  import('./modals.js').then(module => module.clearVendorAvatarPhoto());
};

export function showPage(pageId) {
  document.querySelectorAll('.page-view').forEach(v => v.classList.remove('active-view'));
  const target = document.getElementById(`view-${pageId}`);
  if (target) target.classList.add('active-view');
  if (pageId === 'dashboard') refreshMasterDashboard();
  if (pageId === 'vendors') refreshVendorsListView();
  if (pageId === 'reports') initReportsConsoleEngine();
  window.scrollTo(0,0);
}

// Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(e=>console.warn(e)));
}
window.addEventListener('online', syncQueuedRequests);
window.addEventListener('offline', updateSyncStatus);
window.onload = () => {
  updateSyncStatus();
  refreshMasterDashboard();
  if (navigator.onLine) syncQueuedRequests();
};
