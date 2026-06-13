// app.js
import { refreshMasterDashboard, refreshVendorsListView } from './dashboard.js';
import { syncQueuedRequests, updateSyncStatus, triggerManualSync, refreshAllData } from './api.js';
import { initReportsConsoleEngine, handleReportOptionsPopulation, compileFieldReport } from './reports.js';
import { openModal, closeModal, removeAttachmentByIndex, clearVendorAvatarPhoto } from './modals.js';
import { loadProjectConsoleHub, triggerEditProjectProfile, switchConsoleSegment } from './console.js';

// ========== ATTACH ALL GLOBAL FUNCTIONS FOR INLINE ONCLICK ==========
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

// ========== PAGE NAVIGATION (FIXED) ==========
export function showPage(pageId) {
  // Remove active-view from ALL page containers
  document.querySelectorAll('.page-view').forEach(view => {
    view.classList.remove('active-view');
  });
  // Add active-view only to the target
  const target = document.getElementById(`view-${pageId}`);
  if (target) target.classList.add('active-view');
  
  // Load data only when needed
  if (pageId === 'dashboard') refreshMasterDashboard();
  if (pageId === 'vendors') refreshVendorsListView();
  if (pageId === 'reports') initReportsConsoleEngine();
  
  window.scrollTo(0, 0);
}

// ========== SERVICE WORKER & EVENT LISTENERS ==========
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(e => console.warn(e));
  });
}
window.addEventListener('online', syncQueuedRequests);
window.addEventListener('offline', updateSyncStatus);

// ========== INITIAL LOAD ==========
window.onload = () => {
  updateSyncStatus();
  refreshMasterDashboard();
  if (navigator.onLine) syncQueuedRequests();
  showPage('dashboard');  // explicitly show dashboard
};
