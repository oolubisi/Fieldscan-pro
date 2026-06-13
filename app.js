// app.js
import { refreshMasterDashboard, refreshVendorsListView } from './dashboard.js';
import { syncQueuedRequests, updateSyncStatus, triggerManualSync, refreshAllData } from './api.js';
import { initReportsConsoleEngine, handleReportOptionsPopulation, compileFieldReport } from './reports.js';
import { openModal, closeModal, removeAttachmentByIndex, clearVendorAvatarPhoto } from './modals.js';
import { loadProjectConsoleHub, triggerEditProjectProfile, switchConsoleSegment } from './console.js';

// Define showPage first
function showPage(pageId) {
  document.querySelectorAll('.page-view').forEach(v => v.classList.remove('active-view'));
  const target = document.getElementById(`view-${pageId}`);
  if (target) target.classList.add('active-view');
  if (pageId === 'dashboard') refreshMasterDashboard();
  if (pageId === 'vendors') refreshVendorsListView();
  if (pageId === 'reports') initReportsConsoleEngine();
  window.scrollTo(0, 0);
}

// Attach ALL global functions to window
window.showPage = showPage;
window.loadProjectConsoleHub = loadProjectConsoleHub;
window.triggerEditProjectProfile = triggerEditProjectProfile;
window.switchConsoleSegment = switchConsoleSegment;
window.openModal = openModal;
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
window.onload = () => {
  updateSyncStatus();
  refreshMasterDashboard();
  if (navigator.onLine) syncQueuedRequests();
  showPage('dashboard');
};

export { showPage };  // export if needed elsewhere
