// app.js
import { refreshMasterDashboard, refreshVendorsListView } from './dashboard.js';
import { syncQueuedRequests, updateSyncStatus, triggerManualSync, refreshAllData } from './api.js';
import { initReportsConsoleEngine, handleReportOptionsPopulation, compileFieldReport } from './reports.js';
import { openModal, closeModal, removeAttachmentByIndex, clearVendorAvatarPhoto, openModalWithRecord } from './modals.js';
import { loadProjectConsoleHub, triggerEditProjectProfile, switchConsoleSegment, toggleScopeEdit, saveProjectScope } from './console.js';

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
window.toggleScopeEdit = toggleScopeEdit;
window.saveProjectScope = saveProjectScope;
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

export { showPage };  // export if needed elsewhere
