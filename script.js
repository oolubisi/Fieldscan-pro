    // --- INSERT YOUR GOOGLE APPS SCRIPT WEB APP URL HERE ---
    const GAS_URL = "https://script.google.com/macros/s/AKfycbyMbq7heDDK6lelr4fD3ek24njHQDmo7zaC8ocusLGDyu4u-NxoO7e_Wt-zgaRkgIbJ/exec"; 
    const ATTACHMENT_DELIMITER = "|||";

    function splitAttachments(value) {
      return String(value || '').split(ATTACHMENT_DELIMITER).map(s => s.trim()).filter(Boolean);
    }

    function normalizeAttachments(files) {
      if (!Array.isArray(files) || files.length === 0) return '';
      return files.filter(Boolean).join(ATTACHMENT_DELIMITER).trim() || '';
    }

    function escapeHtml(value) {
      return String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[char]));
    }

    function escapeAttr(value) {
      return escapeHtml(value).replace(/`/g, '&#96;');
    }

    function moneyValue(value) {
      const amount = Number(value || 0);
      return Number.isFinite(amount) ? amount.toLocaleString() : '0';
    }

    function paymentDirectionOf(payment) {
      return payment.paymentDirection || payment.direction || (payment.payee === 'Client' ? 'Client Receipt' : 'Outgoing Payment');
    }

    function isClientReceipt(payment) {
      return paymentDirectionOf(payment) === 'Client Receipt';
    }

    function isPettyExpense(payment) {
      return paymentDirectionOf(payment) === 'Small Expense';
    }
    
    // --- INDEXED DB ENGINE ---
    const DB_NAME = "FieldScanOfflineDB";
    const STORE_NAME = "syncQueue";
    const GET_ACTION_BY_STORE = {
      projects: "getProjects",
      inspections: "getInspections",
      takeoffs: "getTakeOffItems",
      progressLogs: "getProgressLogs",
      vendors: "getVendors",
      workorders: "getWorkOrders",
      payments: "getPayments"
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
      saveVendor: { store: "vendors", idKey: "vendorId", mode: "upsert" },
      updateVendor: { store: "vendors", idKey: "vendorId", mode: "upsert" },
      deleteVendor: { store: "vendors", idKey: "vendorId", mode: "delete" },
      saveWorkOrder: { store: "workorders", idKey: "workOrderId", mode: "upsert" },
      updateWorkOrder: { store: "workorders", idKey: "workOrderId", mode: "upsert" },
      savePayment: { store: "payments", idKey: "paymentId", mode: "upsert" },
      updatePayment: { store: "payments", idKey: "paymentId", mode: "upsert" }
    };

    function openQueueDB() {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = (e) => { e.target.result.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true }); };
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e.target.error);
      });
    }

    async function queueOfflineRequest(action, data) {
      const db = await openQueueDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        store.add({ action, data, timestamp: Date.now() });
        tx.oncomplete = () => { updateSyncStatus(); resolve(); };
        tx.onerror = () => reject(tx.error);
      });
    }

    async function getQueuedRequests() {
      const db = await openQueueDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }

    async function clearQueuedRequests() {
      const db = await openQueueDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        store.clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }

    function backupKey(action) {
      return 'fieldscan_backup_' + action;
    }

    function readBackup(action, fallback = []) {
      const raw = localStorage.getItem(backupKey(action));
      if (!raw) return fallback;
      try { return JSON.parse(raw); } catch (err) { return fallback; }
    }

    function writeBackup(action, value) {
      localStorage.setItem(backupKey(action), JSON.stringify(value));
    }

    function recomputeLocalStats() {
      const vendors = readBackup('getVendors', []);
      writeBackup('getStats', { activeVendors: vendors.filter(v => v.archived !== "Yes").length });
    }

    function applyLocalMutation(action, data) {
      const config = MUTATION_MAP[action];
      if (!config) return;

      const getAction = GET_ACTION_BY_STORE[config.store];
      const current = readBackup(getAction, []);
      const idValue = String(data[config.idKey] || '').trim();
      const next = config.mode === "delete"
        ? current.filter(item => String(item[config.idKey] || item.rowId || '').trim() !== idValue)
        : (() => {
            const index = current.findIndex(item => String(item[config.idKey] || item.rowId || '').trim() === idValue);
            const record = { ...data, offlinePending: true };
            if (index === -1) return [record, ...current];
            const copy = current.slice();
            copy[index] = { ...copy[index], ...record };
            return copy;
          })();

      writeBackup(getAction, next);
      cache[config.store] = next;
      if (config.store === "vendors") recomputeLocalStats();
    }

    async function updateSyncStatus() {
      const badge = document.getElementById('sync-status');
      if (!badge) return;
      try {
        const queue = await getQueuedRequests();
        if (!navigator.onLine) {
          badge.innerHTML = `<i class="fas fa-wifi"></i> Offline Mode${queue.length ? ` • ${queue.length} queued` : ''}`;
          badge.style.display = 'block';
          return;
        }
        if (queue.length) {
          badge.innerHTML = `<i class="fas fa-sync-alt fa-spin"></i> ${queue.length} record${queue.length === 1 ? '' : 's'} waiting to sync`;
          badge.style.display = 'block';
          return;
        }
        badge.style.display = 'none';
      } catch (err) {
        badge.style.display = navigator.onLine ? 'none' : 'block';
      }
    }

    async function deleteQueuedRequest(id) {
      const db = await openQueueDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        store.delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }

    // --- GEO-STAMPING ENGINE ---
    function getGPSLocation() {
      return new Promise((resolve) => {
        if (!navigator.geolocation) return resolve("GPS Not Supported");
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve(`Lat: ${pos.coords.latitude.toFixed(5)}, Lng: ${pos.coords.longitude.toFixed(5)}`),
          (err) => resolve("GPS Unavailable"),
          { timeout: 7000, maximumAge: 60000 }
        );
      });
    }
                      
    async function callApi(action, data = {}) {
      try {
        console.log("SENDING API CALL:", action);
        const response = await fetch(GAS_URL, { method: "POST", body: JSON.stringify({ action: action, data: data }) });
        if (!response.ok) throw new Error(`Server returned ${response.status}`);
        const result = await response.json();
        if (result && (result.status === 'error' || result.success === false)) throw new Error(result.message || result.error || 'Server action failed');
        
        if (action.startsWith('get')) writeBackup(action, result);
        return result;
      } catch (err) {
        console.warn("Network Error / Offline. Queuing request:", err);
        
        if (action.startsWith('get')) {
          return readBackup(action, action === 'getStats' ? {activeVendors: '--'} : []); 
        }

        await queueOfflineRequest(action, data);
        applyLocalMutation(action, data);
        alert("Connection lost. Record & photos saved locally and will auto-sync when signal returns.");
        return { status: "queued" };
      }
    }
    
    // Offline Sync Recovery
    async function syncQueuedRequests() {
      updateSyncStatus();
      try {
        const queue = await getQueuedRequests();
        if (queue.length === 0) return;

        alert("Signal Restored! Pushing saved field data to the server...");
        
        for (const item of queue) {
          const response = await fetch(GAS_URL, { method: "POST", body: JSON.stringify({ action: item.action, data: item.data }) });
          if (!response.ok) throw new Error(`Sync failed for ${item.action}`);
          const result = await response.json();
          if (result && (result.status === 'error' || result.success === false)) throw new Error(result.message || result.error || `Sync failed for ${item.action}`);
          await deleteQueuedRequest(item.id);
          updateSyncStatus();
        }
        
        refreshMasterDashboard();
        if (document.getElementById('view-vendors').classList.contains('active-view')) refreshVendorsListView();
        if (document.getElementById('view-project-console').classList.contains('active-view') && currentSelectedProjectId) {
           loadInspectionListings();
           loadTakeOffListings();
           loadProgressTimelineFeed();
           loadWorkOrdersListings();
           loadPaymentsListings();
        }
        updateSyncStatus();
      } catch (err) { console.error("Sync Error: ", err); document.getElementById('sync-status').style.display = 'block'; }
    }

    window.addEventListener('online', syncQueuedRequests);
    window.addEventListener('offline', updateSyncStatus);

    // PWA Service Worker & Update Listener
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').then(reg => {
          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                if (confirm("New FieldScan version available! Optimization patches have downloaded. Reload now?")) { window.location.reload(); }
              }
            });
          });
        }).catch(err => console.warn("Service worker unavailable:", err));
      });
    }
    
    let cache = { projects: [], inspections: [], takeoffs: [], progressLogs: [], vendors: [], workorders: [], payments: [] };
    let currentSelectedProjectId = null;
    let currentModalFiles = [];
    let currentAvatarPhoto = "";

    window.onload = () => { updateSyncStatus(); refreshMasterDashboard(); if (navigator.onLine) syncQueuedRequests(); };

    // --- REAL TIME DASHBOARDS ---
    function refreshMasterDashboard() {
      callApi('getStats', {}).then(stats => {
        if(stats && stats.status !== "queued") document.getElementById('badge-vendors').innerText = stats.activeVendors || '0';
      });
      callApi('getProjects', {}).then(data => {
        cache.projects = data || [];
        renderProjects();
      });
    }

    function renderProjects() {
      const container = document.getElementById('project-master-list');
      const term = document.getElementById('search-projects').value.toLowerCase();
      
      const filtered = cache.projects.filter(p => !term || String(p.clientName || '').toLowerCase().includes(term) || String(p.projectId || '').toLowerCase().includes(term));

      if(filtered.length === 0) { container.innerHTML = `<p style="color:var(--muted); font-style:italic; text-align:center; padding:20px;">No projects found.</p>`; return; }
      
      container.innerHTML = filtered.map(p => `
        <div class="card" onclick="loadProjectConsoleHub(${escapeAttr(JSON.stringify(p.projectId || ''))})" style="border-left: 5px solid ${p.projectStatus === 'Active' ? 'var(--success)' : (p.projectStatus === 'Declined' ? 'var(--danger)' : 'var(--muted)')}; cursor:pointer;">
          <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:4px;">
            <strong style="font-size:20px; color:#000;">${escapeHtml(p.clientName)}</strong>
            <span style="font-size:12px; font-weight:900; background:#000; color:#fff; padding:3px 8px; border-radius:4px;">${escapeHtml(p.projectId)}</span>
          </div>
          <div style="font-size:15px; font-weight:600; color:var(--primary);"><i class="fas fa-map-marker-alt"></i> ${escapeHtml(p.siteLocation)}</div>
          <div style="font-size:12px; color:var(--muted); font-weight:700; margin-top:8px; border-top:1px dashed #ccc; padding-top:4px;">Status: ${escapeHtml(String(p.projectStatus || '').toUpperCase())}</div>
        </div>
      `).join('');
    }

    function refreshVendorsListView() {
      callApi('getVendors', {}).then(data => {
        cache.vendors = data || [];
        const trades = [...new Set(cache.vendors.map(v => v.trade).filter(Boolean))];
        document.getElementById('filter-vendor-trade').innerHTML = '<option value="">All Trades</option>' + trades.map(t => `<option value="${escapeAttr(t)}">${escapeHtml(t)}</option>`).join('');
        renderVendors();
      });
    }

    function renderVendors() {
      const container = document.getElementById('vendor-master-list');
      const term = document.getElementById('search-vendor').value.toLowerCase();
      const trade = document.getElementById('filter-vendor-trade').value;

      const filtered = cache.vendors.filter(v => 
        (!term || (v.company||'').toLowerCase().includes(term) || (v.contactName||'').toLowerCase().includes(term)) &&
        (!trade || v.trade === trade)
      );

      if (filtered.length === 0) { container.innerHTML = `<p style="color:var(--muted); font-style:italic; text-align:center; padding:20px;">No vendors matched.</p>`; return; }

      container.innerHTML = filtered.map(v => `
        <div class="card" onclick="openVendorModalById(${escapeAttr(JSON.stringify(v.vendorId || v.rowId || ''))})" style="cursor:pointer; display:flex; align-items:center; gap:15px;">
          <img src="${escapeAttr(getDirectImageUrl(v.passport) || 'data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 width=%2240%22 height=%2240%22><path d=%22M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z%22 fill=%22%23ccc%22/></svg>')}" style="width:55px; height:55px; object-fit:cover; border-radius:50%; border:2px solid #000; flex-shrink:0;">
          <div style="flex:1;">
            <strong style="font-size:20px;">${escapeHtml(v.company || 'Unnamed Subcontractor')}</strong><br>
            <span style="font-weight:800; color:var(--success); font-size:14px; text-transform:uppercase;">${escapeHtml(v.trade || '')}</span><br>
            <span style="font-size:13px; font-weight:700; color:var(--muted);"><i class="fas fa-user"></i> Rep: ${escapeHtml(v.contactName || '')}</span><br>
            <span style="font-size:13px; font-weight:700; color:var(--muted);"><i class="fas fa-phone"></i> P1: ${escapeHtml(v.phone1 || v.phone || '')} | P2: ${escapeHtml(v.phone2 || '')}</span>
          </div>
        </div>
      `).join('');
    }

    // --- CONSOLE LOADING ---
    function loadProjectConsoleHub(projectId) {
      currentSelectedProjectId = projectId;
      const p = cache.projects.find(item => item.projectId === projectId);
      if(!p) return;
      document.getElementById('console-title-text').innerText = p.projectId;
      document.getElementById('c-meta-name').innerText = p.clientName;
      document.getElementById('c-meta-loc').innerText = p.siteLocation;
      document.getElementById('c-meta-phone').innerText = p.clientPhone || "None Provided";
      document.getElementById('c-meta-phone').href = p.clientPhone ? "tel:" + p.clientPhone : "#";
      document.getElementById('c-meta-notes').value = p.notes || "No standard parameters stored.";
      switchConsoleSegment('profile');
      showPage('project-console');
    }

    function switchConsoleSegment(segKey) {
      document.querySelectorAll('.console-tab-window').forEach(w => { w.classList.remove('active-view'); w.classList.add('page-view'); });
      document.querySelectorAll('.segment-btn').forEach(b => b.classList.remove('active'));
      document.getElementById('console-seg-' + segKey).classList.remove('page-view');
      document.getElementById('console-seg-' + segKey).classList.add('active-view');
      document.getElementById('seg-btn-' + segKey).classList.add('active');
      if (segKey === 'inspections') loadInspectionListings();
      if (segKey === 'takeoff') loadTakeOffListings();
      if (segKey === 'progress') loadProgressTimelineFeed();
      if (segKey === 'workorders') loadWorkOrdersListings();
      if (segKey === 'payments') loadPaymentsListings();
    }

    function loadInspectionListings() {
      const container = document.getElementById('console-inspections-list');
      container.innerHTML = `<p style="text-align:center; padding:15px; font-size:14px; font-weight:700;"><i class="fas fa-spinner fa-spin"></i> Loading inspections...</p>`;
      callApi('getInspections', {}).then(items => {
        cache.inspections = items || [];
        const projectItems = cache.inspections.filter(i => i.projectId === currentSelectedProjectId);
        if(projectItems.length === 0) { container.innerHTML = `<p style="color:var(--muted); font-style:italic; text-align:center; padding:20px; font-size:14px;">No inspection records yet.</p>`; return; }
        container.innerHTML = projectItems.map(i => {
          const firstAttachment = splitAttachments(i.attachments)[0];
          return `
            <div class="card" onclick="openModal('inspection', cache.inspections.find(t=>t.inspectionId===${escapeAttr(JSON.stringify(i.inspectionId || ''))}))" style="background:#fff; border-color:#000; cursor:pointer;">
              <div style="display:flex; justify-content:space-between; gap:10px; align-items:start; margin-bottom:6px;">
                <div>
                  <span style="font-size:11px; font-weight:800; background:var(--success); color:#fff; padding:2px 6px; border-radius:4px; text-transform:uppercase;">${escapeHtml(i.inspectionType || 'Inspection')}</span>
                  <h4 style="font-size:18px; font-weight:800; margin-top:4px;">${escapeHtml(i.areaInspected || 'General Site')}</h4>
                </div>
                <strong style="font-size:12px; color:var(--muted); text-align:right;">${escapeHtml(i.inspectionDate || '')}</strong>
              </div>
              <p style="font-size:15px; font-weight:600; color:#000;">${escapeHtml(i.siteCondition || '')}</p>
              ${i.recommendations ? `<div style="font-size:13px; color:var(--muted); font-style:italic; margin-top:6px; background:var(--card); padding:6px; border-radius:6px;">Action: ${escapeHtml(i.recommendations)}</div>` : ''}
              ${firstAttachment ? `<img src="${escapeAttr(getDirectImageUrl(firstAttachment))}" style="width:100%; height:140px; object-fit:cover; border-radius:10px; margin-top:10px; border:1px solid #000;">` : ''}
            </div>
          `;
        }).join('');
      });
    }

    function loadTakeOffListings() {
      const container = document.getElementById('console-takeoff-list');
      container.innerHTML = `<p style="text-align:center; padding:15px; font-size:14px; font-weight:700;"><i class="fas fa-spinner fa-spin"></i> Reading items...</p>`;
      callApi('getTakeOffItems', {}).then(items => {
        cache.takeoffs = items || [];
        const projectItems = cache.takeoffs.filter(i => i.projectId === currentSelectedProjectId);
        if(projectItems.length === 0) { container.innerHTML = `<p style="color:var(--muted); font-style:italic; text-align:center; padding:20px; font-size:14px;">Survey framework blank.</p>`; return; }
        container.innerHTML = projectItems.map(i => `
          <div class="card" onclick="openModal('takeoff_item', cache.takeoffs.find(t=>t.itemId===${escapeAttr(JSON.stringify(i.itemId || ''))}))" style="background:#fff; border-color:#000; cursor:pointer;">
            <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:6px;">
              <div>
                <span style="font-size:11px; font-weight:800; background:var(--primary); color:#fff; padding:2px 6px; border-radius:4px; text-transform:uppercase;">${escapeHtml(i.tradeCategory)}</span>
                <h4 style="font-size:18px; font-weight:800; margin-top:4px;">${escapeHtml(i.roomArea)}</h4>
              </div>
              <strong style="font-size:22px; color:var(--success);">${escapeHtml(i.quantity)} <span style="font-size:14px;">${escapeHtml(i.unit)}</span></strong>
            </div>
            <p style="font-size:15px; font-weight:600; color:#000;">${escapeHtml(i.description)}</p>
            ${i.scopeNotes ? `<div style="font-size:13px; color:var(--muted); font-style:italic; margin-top:6px; background:var(--card); padding:6px; border-radius:6px;">Rem: ${escapeHtml(i.scopeNotes)}</div>` : ''}
            ${splitAttachments(i.beforePhotoUrl)[0] ? `<img src="${escapeAttr(getDirectImageUrl(splitAttachments(i.beforePhotoUrl)[0]))}" style="width:100%; height:140px; object-fit:cover; border-radius:10px; margin-top:10px; border:1px solid #000;">` : ''}
          </div>
        `).join('');
      });
    }

    function loadProgressTimelineFeed() {
      const container = document.getElementById('console-progress-feed');
      container.innerHTML = `<p style="text-align:center; font-size:14px; font-weight:700;"><i class="fas fa-spinner fa-spin"></i> Mapping history logs...</p>`;
      callApi('getProgressLogs', {}).then(logs => {
        cache.progressLogs = logs || [];
        const projectLogs = cache.progressLogs.filter(l => l.projectId === currentSelectedProjectId);
        if(projectLogs.length === 0) { container.innerHTML = `<p style="color:var(--muted); font-style:italic; padding-left:10px; font-size:14px;">No updates logged.</p>`; return; }
        container.innerHTML = projectLogs.map(l => `
          <div class="timeline-node">
            <div style="font-size:12px; font-weight:800; color:var(--muted);">${l.dateRecorded}</div>
            <div style="background:var(--card); padding:14px; border-radius:14px; border:1px solid var(--border); margin-top:5px;">
              <div style="display:flex; justify-content:space-between; font-weight:800; font-size:14px; margin-bottom:5px;">
                <span style="color:var(--primary); text-transform:uppercase;">[${escapeHtml(l.tradeCategory)}]</span>
                <span style="color:var(--success);">${escapeHtml(l.completionPercentage)}% Complete</span>
              </div>
              <p style="font-size:15px; font-weight:600; color:#000;">${escapeHtml(l.commentNarrative)}</p>
              ${splitAttachments(l.progressPhotoUrl)[0] ? `<img src="${escapeAttr(getDirectImageUrl(splitAttachments(l.progressPhotoUrl)[0]))}" style="width:100%; height:150px; object-fit:cover; border-radius:10px; margin-top:8px; border:1px solid #000;">` : ''}
            </div>
          </div>
        `).join('');
      });
    }

    function loadWorkOrdersListings() {
      const container = document.getElementById('console-workorders-list');
      container.innerHTML = `<p style="text-align:center; font-size:14px; font-weight:700;"><i class="fas fa-spinner fa-spin"></i> Querying order registry...</p>`;
      callApi('getVendors', {}).then(vendors => {
        cache.vendors = vendors || [];
        callApi('getWorkOrders', {}).then(orders => {
          cache.workorders = orders || [];
          const projectOrders = cache.workorders.filter(w => w.projectId === currentSelectedProjectId);
          if(projectOrders.length === 0) { container.innerHTML = `<p style="color:var(--muted); font-style:italic; text-align:center; padding:20px; font-size:14px;">No work allocations issued.</p>`; return; }
          container.innerHTML = projectOrders.map(w => {
            const subName = cache.vendors.find(v => String(v.vendorId || v.rowId) === String(w.vendorId))?.company || "General Assignee";
            return `
              <div class="card" onclick="openModal('workorder', cache.workorders.find(t=>t.workOrderId===${escapeAttr(JSON.stringify(w.workOrderId || ''))}))" style="background:#fff; border-color:#000; cursor:pointer;">
                <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:4px;">
                  <div>
                    <strong style="font-size:18px;">${escapeHtml(subName)}</strong><br>
                    <small style="color:var(--muted); font-weight:700;">Ref: ${escapeHtml(w.workOrderId)} | Issued: ${escapeHtml(w.dateCreated || '')}</small>
                  </div>
                  <span style="font-size:11px; font-weight:900; background:${w.status === 'Completed' ? 'var(--success)' : '#fd7e14'}; color:#fff; padding:3px 8px; border-radius:4px; text-transform:uppercase;">${escapeHtml(w.status)}</span>
                </div>
                <p style="font-size:15px; font-weight:600; margin-top:6px; color:#000;">${escapeHtml(w.description)}</p>
                <div style="font-size:16px; font-weight:900; margin-top:8px; color:var(--primary);">Tariff Valuation: ₦${moneyValue(w.amount)}</div>
              </div>
            `;
          }).join('');
        });
      });
    }

    function loadPaymentsListings() {
      const container = document.getElementById('console-payments-list');
      container.innerHTML = `<p style="text-align:center; font-size:14px; font-weight:700;"><i class="fas fa-spinner fa-spin"></i> Loading payment records...</p>`;
      callApi('getPayments', {}).then(payments => {
        cache.payments = payments || [];
        const projectPayments = cache.payments.filter(p => p.projectId === currentSelectedProjectId);
        if(projectPayments.length === 0) { container.innerHTML = `<p style="color:var(--muted); font-style:italic; text-align:center; padding:20px; font-size:14px;">No payment records logged.</p>`; return; }
        const totalReceived = projectPayments.filter(isClientReceipt).reduce((sum, p) => sum + Number(p.amount || 0), 0);
        const totalExpenses = projectPayments.filter(p => !isClientReceipt(p)).reduce((sum, p) => sum + Number(p.amount || 0), 0);
        const smallExpenses = projectPayments.filter(isPettyExpense).reduce((sum, p) => sum + Number(p.amount || 0), 0);
        const netBalance = totalReceived - totalExpenses;
        container.innerHTML = `
          <div class="card" style="background:var(--card); border-color:#000;">
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; text-align:center;">
              <div>
                <small style="font-weight:900; text-transform:uppercase; color:var(--muted);">Client Received</small>
                <div style="font-size:14px; font-weight:900; color:var(--success);">₦${moneyValue(totalReceived)}</div>
              </div>
              <div>
                <small style="font-weight:900; text-transform:uppercase; color:var(--muted);">Total Outgoing</small>
                <div style="font-size:14px; font-weight:900; color:var(--danger);">₦${moneyValue(totalExpenses)}</div>
              </div>
              <div>
                <small style="font-weight:900; text-transform:uppercase; color:var(--muted);">Small Expenses</small>
                <div style="font-size:12px; font-weight:900;">₦${moneyValue(smallExpenses)}</div>
              </div>
              <div>
                <small style="font-weight:900; text-transform:uppercase; color:var(--muted);">Net Balance</small>
                <div style="font-size:12px; font-weight:900; color:${netBalance >= 0 ? 'var(--success)' : 'var(--danger)'};">₦${moneyValue(netBalance)}</div>
              </div>
            </div>
          </div>
          ${projectPayments.map(p => {
            const direction = paymentDirectionOf(p);
            const incoming = isClientReceipt(p);
            return `
            <div class="card" onclick="openModal('payment', cache.payments.find(t=>t.paymentId===${escapeAttr(JSON.stringify(p.paymentId || ''))}))" style="background:#fff; border-color:#000; border-left:6px solid ${incoming ? 'var(--success)' : 'var(--danger)'}; cursor:pointer;">
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
          }).join('')}
        `;
      });
    }

    function triggerEditProjectProfile() { openModal('project', cache.projects.find(item => item.projectId === currentSelectedProjectId)); }
    function openVendorModalById(id) { openModal('vendor', cache.vendors.find(v => String(v.vendorId || v.rowId).trim() === String(id).trim())); }

    // --- PHOTO / BASE64 BYPASS UI ENGINE ---
    function populateModalInlineImageGalleryPreviews(renderBoxId) {
      const box = document.getElementById(renderBoxId); if(!box) return;
      if(currentModalFiles.length === 0) { box.innerHTML = ''; box.style.display = 'none'; return; }
      box.style.display = 'flex';
      box.innerHTML = currentModalFiles.map((url, idx) => {
        const isPdf = url.toLowerCase().includes('pdf');
        const imgSource = url.startsWith('data:') ? url : getDirectImageUrl(url);
        let content = isPdf 
          ? `<div style="width:100%; height:100%; border:2px solid var(--text); border-radius:6px; background:#fff; display:flex; align-items:center; justify-content:center;"><i class="fas fa-file-pdf" style="font-size:24px; color:var(--danger);"></i></div>`
          : `<img src="${imgSource}" style="width:100%; height:100%; object-fit:cover; border:2px solid var(--text); border-radius:6px; margin:0;">`;
        return `
          <div style="position: relative; width: 60px; height: 60px; flex-shrink: 0;">
            ${content}
            <div onclick="removeAttachmentByIndex(${idx}, '${renderBoxId}')" style="position: absolute; top: -6px; right: -6px; background: var(--danger); color: white; border: 2px solid white; border-radius: 50%; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 900; cursor: pointer; box-shadow: 0 1px 3px rgba(0,0,0,0.3); z-index: 10;">&times;</div>
          </div>
        `;
      }).join('');
    }

    function removeAttachmentByIndex(index, renderBoxId) { currentModalFiles.splice(index, 1); populateModalInlineImageGalleryPreviews(renderBoxId); }
    function clearVendorAvatarPhoto() { currentAvatarPhoto = ""; document.getElementById('passport_frame_view').src = 'data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 width=%2250%22 height=%2250%22><path d=%22M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z%22 fill=%22%236c757d%22/></svg>'; document.getElementById('v_pass_remove_btn').style.display = 'none'; }

    function processIncomingMultiAttachments(filesList, previewTargetId) {
      if(!filesList || filesList.length === 0) return;
      Array.from(filesList).forEach(file => {
        const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
        if (isPdf && file.size > 500 * 1024) { alert(`Limit Error: "${file.name}" exceeds 500KB constraint.`); return; }
        
        const reader = new FileReader();
        reader.onload = async (evt) => {
          let payload = evt.target.result;
          if (!isPdf) payload = await compressImageToTargetLimit(evt.target.result, 190000);
          
          currentModalFiles.push(payload); 
          populateModalInlineImageGalleryPreviews(previewTargetId);
        };
        reader.readAsDataURL(file);
      });
    }

    function generateFrontendPreviewId(type) {
      const yy = new Date().getFullYear().toString().slice(-2);
      const prefix = type === 'project' ? `PRJ/${yy}/` : `WKO/${yy}/`;
      const dataset = type === 'project' ? cache.projects : cache.workorders;
      const idKey = type === 'project' ? 'projectId' : 'workOrderId';
      let maxNum = 0;
      (dataset || []).forEach(item => {
        const currentId = String(item[idKey] || '').trim();
        if (currentId.indexOf(prefix) === 0) {
          const numPart = parseInt(currentId.substring(prefix.length), 10);
          if (!isNaN(numPart) && numPart > maxNum) { maxNum = numPart; }
        }
      });
      return prefix + String(maxNum + 1).padStart(3, '0');
    }

    function openModal(type, editData = null) {
      const body = document.getElementById('modalBody'); const submit = document.getElementById('modalSubmit');
      const title = document.getElementById('modalTitle'); const overlay = document.getElementById('modalOverlay');
      const isEdit = !!editData; overlay.style.display = 'flex'; body.innerHTML = ''; submit.disabled = false; submit.innerText = "Save";
      
      const largeInput = 'style="font-size: 20px; padding: 12px; margin-bottom: 5px;"';
      const labelStyle = 'style="font-size: 16px; color: var(--text); font-weight:800; display: block; margin-top: 10px; margin-bottom: 4px;"';
      currentModalFiles = []; currentAvatarPhoto = "";
    
      if (type === 'project') {
        const uniqueId = isEdit ? editData.projectId : generateFrontendPreviewId('project');
        title.innerText = isEdit ? "Modify Project" : "New Project";
        body.innerHTML = `
          <label ${labelStyle}>Project ID</label><input value="${uniqueId}" disabled style="font-size: 20px; padding: 12px; margin-bottom: 5px; background: var(--card-light); font-weight: 800; color: #000;">
          <label ${labelStyle}>Client Name</label><input id="p_client" value="${escapeAttr(isEdit?editData.clientName:'')}" ${largeInput}>
          <label ${labelStyle}>Site Location</label><input id="p_loc" value="${escapeAttr(isEdit?editData.siteLocation:'')}" ${largeInput}>
          <label ${labelStyle}>Client Phone</label><input id="p_phone" type="tel" maxlength="11" oninput="this.value=this.value.replace(/[^0-9]/g,'')" placeholder="Blank or 11 Digits" value="${escapeAttr(isEdit?editData.clientPhone:'')}" ${largeInput}>
          <label ${labelStyle}>Client Email</label><input id="p_email" type="email" value="${escapeAttr(isEdit?editData.clientEmail:'')}" ${largeInput}>
          <label ${labelStyle}>Project Status</label>
          <select id="p_status" ${largeInput}>
            <option value="Active" ${isEdit&&editData.projectStatus==='Active'?'selected':''}>Active</option>
            <option value="In Planning" ${isEdit&&editData.projectStatus==='In Planning'?'selected':''}>In Planning</option>
            <option value="Handed Over" ${isEdit&&editData.projectStatus==='Handed Over'?'selected':''}>Handed Over</option>
            <option value="Declined" ${isEdit&&editData.projectStatus==='Declined'?'selected':''}>Declined</option>
          </select>
          <label ${labelStyle}>Project Notes</label><textarea id="p_notes" rows="2" ${largeInput}>${escapeHtml(isEdit?editData.notes:'')}</textarea>
        `;
        submit.onclick = () => {
          const phoneInput = document.getElementById('p_phone').value.trim();
          if (phoneInput !== "" && !/^[0-9]{11}$/.test(phoneInput)) { alert("Phone must be exactly 11 numeric digits."); return; }
          submit.disabled = true; submit.innerText = "Saving...";
          const payload = { projectId: uniqueId, clientName: document.getElementById('p_client').value, siteLocation: document.getElementById('p_loc').value, clientPhone: String(phoneInput), clientEmail: document.getElementById('p_email').value, projectStatus: document.getElementById('p_status').value, notes: document.getElementById('p_notes').value };
          callApi(isEdit?'updateProject':'saveProject', payload).then(() => { closeModal(); refreshMasterDashboard(); if(isEdit) loadProjectConsoleHub(uniqueId); });
        };
      }
      else if (type === 'inspection') {
        const uniqueId = isEdit ? editData.inspectionId : "INS-" + Math.random().toString(36).substr(2, 5).toUpperCase();
        title.innerText = isEdit ? "Modify Inspection" : "Initial Inspection";
        if (isEdit && editData.attachments) currentModalFiles = splitAttachments(editData.attachments);

        body.innerHTML = `
          <label ${labelStyle}>Inspection Type</label>
          <select id="i_type" ${largeInput}>
            <option value="Initial Visit" ${isEdit && editData.inspectionType === 'Initial Visit' ? 'selected' : ''}>Initial Visit</option>
            <option value="Site Condition" ${isEdit && editData.inspectionType === 'Site Condition' ? 'selected' : ''}>Site Condition</option>
            <option value="Defect Check" ${isEdit && editData.inspectionType === 'Defect Check' ? 'selected' : ''}>Defect Check</option>
            <option value="Client Requirement" ${isEdit && editData.inspectionType === 'Client Requirement' ? 'selected' : ''}>Client Requirement</option>
          </select>
          <label ${labelStyle}>Area Inspected</label><input id="i_area" placeholder="e.g. Kitchen, Roof, External Wall" value="${escapeAttr(isEdit ? (editData.areaInspected || '') : '')}" ${largeInput}>
          <label ${labelStyle}>Current Site Condition</label><textarea id="i_condition" rows="3" placeholder="Observed condition, defects, access issues..." ${largeInput}>${escapeHtml(isEdit ? (editData.siteCondition || '') : '')}</textarea>
          <label ${labelStyle}>Recommendation / Required Action</label><textarea id="i_recommendations" rows="3" placeholder="Recommended work, risk, next action..." ${largeInput}>${escapeHtml(isEdit ? (editData.recommendations || '') : '')}</textarea>
          <label ${labelStyle}>Form Attachments</label>
          <div id="inspectionAttachmentsPreviews" class="modal-preview-grid" style="display:none;"></div>
          <label class="icon-upload-label"><i class="fas fa-paperclip"></i><input type="file" id="i_photo" accept="image/*,application/pdf" style="display:none" multiple></label>
        `;
        if(currentModalFiles.length > 0) populateModalInlineImageGalleryPreviews('inspectionAttachmentsPreviews');
        document.getElementById('i_photo').onchange = (e) => { processIncomingMultiAttachments(e.target.files, 'inspectionAttachmentsPreviews'); };

        submit.onclick = async () => {
          submit.disabled = true; submit.innerText = "Acquiring GPS...";
          const gps = await getGPSLocation();
          submit.innerText = "Saving...";
          const condition = document.getElementById('i_condition').value + (gps !== "GPS Unavailable" ? `\n\n[Verified @ ${gps}]` : "");
          const payload = { inspectionId: uniqueId, projectId: currentSelectedProjectId, inspectionDate: new Date().toLocaleDateString(), inspectionType: document.getElementById('i_type').value, areaInspected: document.getElementById('i_area').value, siteCondition: condition, recommendations: document.getElementById('i_recommendations').value, attachments: currentModalFiles.join(ATTACHMENT_DELIMITER) };
          callApi(isEdit ? 'updateInspection' : 'saveInspection', payload).then(() => { closeModal(); loadInspectionListings(); });
        };
      }
      else if (type === 'takeoff_item') {
        const uniqueId = isEdit ? editData.itemId : "JOB-" + Math.random().toString(36).substr(2, 5).toUpperCase();
        title.innerText = isEdit ? "Modify Take-Off" : "Log Measure";
        if (isEdit && editData.beforePhotoUrl) currentModalFiles = splitAttachments(editData.beforePhotoUrl);
        
        body.innerHTML = `
          <label ${labelStyle}>Room Area</label><input id="t_area" placeholder="e.g. Kitchen" value="${escapeAttr(isEdit ? (editData.roomArea || '') : '')}" ${largeInput}>
          <label ${labelStyle}>Trade Category</label><input id="t_cat" placeholder="e.g. Tiling" value="${escapeAttr(isEdit ? (editData.tradeCategory || '') : '')}" ${largeInput}>
          <label ${labelStyle}>Scope Description</label><input id="t_desc" placeholder="e.g. Wall tiles" value="${escapeAttr(isEdit ? (editData.description || '') : '')}" ${largeInput}>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
            <div><label ${labelStyle}>Quantity Value</label><input id="t_qty" type="number" step="0.01" value="${escapeAttr(isEdit ? (editData.quantity || '') : '')}" ${largeInput}></div>
            <div>
              <label ${labelStyle}>Unit Label</label>
              <select id="t_unit" ${largeInput}>
                <option value="sqm" ${isEdit && editData.unit === 'sqm' ? 'selected' : ''}>sqm</option>
                <option value="cu.m" ${isEdit && editData.unit === 'cu.m' ? 'selected' : ''}>cu.m</option>
                <option value="m" ${isEdit && editData.unit === 'm' ? 'selected' : ''}>m</option>
                <option value="pcs" ${isEdit && editData.unit === 'pcs' ? 'selected' : ''}>pcs</option>
              </select>
            </div>
          </div>
          <label ${labelStyle}>Inspector Remarks</label><textarea id="t_notes" rows="2" ${largeInput}>${escapeHtml(isEdit ? (editData.scopeNotes || '') : '')}</textarea>
          
          <label ${labelStyle}>Form Attachments</label>
          <div id="takeoffAttachmentsPreviews" class="modal-preview-grid" style="display:none;"></div>
          <label class="icon-upload-label"><i class="fas fa-paperclip"></i><input type="file" id="t_photo" accept="image/*,application/pdf" style="display:none" multiple></label>
          
          ${isEdit ? `<button class="action-btn" id="t_delete_btn" style="background:var(--danger); margin-top:20px; font-size:16px; padding:12px;"><i class="fas fa-trash-alt"></i> Delete Record</button>` : ''}
        `;
        if(currentModalFiles.length > 0) populateModalInlineImageGalleryPreviews('takeoffAttachmentsPreviews');
        document.getElementById('t_photo').onchange = (e) => { processIncomingMultiAttachments(e.target.files, 'takeoffAttachmentsPreviews'); };
        
        if(isEdit) { document.getElementById('t_delete_btn').onclick = () => { if(confirm("Confirm deletion?")) { document.getElementById('t_delete_btn').disabled = true; submit.disabled = true; callApi('deleteTakeOffItem', { itemId: uniqueId }).then(() => { closeModal(); loadTakeOffListings(); }); } }; }
        
        submit.onclick = async () => {
          submit.disabled = true; submit.innerText = "Acquiring GPS...";
          const gps = await getGPSLocation();
          submit.innerText = "Saving...";
          
          const finalNotes = document.getElementById('t_notes').value + (gps !== "GPS Unavailable" ? `\n\n[📍 Verified @ ${gps}]` : "");
          const payload = { itemId: uniqueId, projectId: currentSelectedProjectId, roomArea: document.getElementById('t_area').value, tradeCategory: document.getElementById('t_cat').value, description: document.getElementById('t_desc').value, quantity: document.getElementById('t_qty').value, unit: document.getElementById('t_unit').value, beforePhotoUrl: currentModalFiles.join(ATTACHMENT_DELIMITER), scopeNotes: finalNotes };
          callApi(isEdit ? 'updateTakeOffItem' : 'saveTakeOffItem', payload).then(() => { closeModal(); loadTakeOffListings(); });
        };
      }
      else if (type === 'progress_entry') {
        const uniqueId = "LOG-" + Math.random().toString(36).substr(2, 5).toUpperCase();
        title.innerText = "Log Progress";
        body.innerHTML = `
          <label ${labelStyle}>Trade Sector</label><input id="l_cat" placeholder="e.g. Painting" ${largeInput}>
          <label ${labelStyle}>Completion Progress</label><select id="l_pct" ${largeInput}><option value="10">10%</option><option value="35">35%</option><option value="75">75%</option><option value="100">100%</option></select>
          <label ${labelStyle}>Status Comments</label><textarea id="l_comm" rows="3" placeholder="Field narrative summary logs..." ${largeInput}></textarea>
          
          <label ${labelStyle}>Form Attachments</label>
          <div id="progressAttachmentsPreviews" class="modal-preview-grid" style="display:none;"></div>
          <label class="icon-upload-label"><i class="fas fa-paperclip"></i><input type="file" id="l_photo" accept="image/*,application/pdf" style="display:none" multiple></label>
        `;
        document.getElementById('l_photo').onchange = (e) => { processIncomingMultiAttachments(e.target.files, 'progressAttachmentsPreviews'); };
        
        submit.onclick = async () => {
          submit.disabled = true; submit.innerText = "Acquiring GPS...";
          const gps = await getGPSLocation();
          submit.innerText = "Saving...";

          const finalNarrative = document.getElementById('l_comm').value + (gps !== "GPS Unavailable" ? `\n\n[📍 Logged @ ${gps}]` : "");
          const payload = { logId: uniqueId, projectId: currentSelectedProjectId, tradeCategory: document.getElementById('l_cat').value, completionPercentage: document.getElementById('l_pct').value, commentNarrative: finalNarrative, progressPhotoUrl: currentModalFiles.join(ATTACHMENT_DELIMITER) };
          callApi('saveProgressLog', payload).then(() => { closeModal(); loadProgressTimelineFeed(); });
        };
      }
      else if (type === 'vendor') {
        const uniqueId = isEdit ? (editData.vendorId || editData.rowId) : "VND-" + Math.random().toString(36).substr(2, 5).toUpperCase();
        title.innerText = isEdit ? "Modify Vendor" : "Add Vendor";
        currentAvatarPhoto = isEdit ? editData.passport : "";
        if (isEdit && editData.attachments) currentModalFiles = splitAttachments(editData.attachments);

        body.innerHTML = `
          <div class="passport-frame-container" style="position:relative;">
            <img id="passport_frame_view" src="${currentAvatarPhoto ? (currentAvatarPhoto.startsWith('data:')?currentAvatarPhoto:getDirectImageUrl(currentAvatarPhoto)) : 'data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 width=%2250%22 height=%2250%22><path d=%22M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z%22 fill=%22%236c757d%22/></svg>'}" style="width:100%; height:100%; object-fit:cover;">
            <label style="position:absolute; bottom:2px; right:2px; background:var(--primary); color:#fff; width:30px; height:30px; border-radius:50%; display:flex; align-items:center; justify-content:center; border:2px solid #fff; cursor:pointer;">
              <i class="fas fa-camera" style="font-size:12px;"></i>
              <input type="file" id="v_pass_uploader" accept="image/*" capture="environment" style="display:none">
            </label>
            <div id="v_pass_remove_btn" onclick="clearVendorAvatarPhoto()" style="position:absolute; top:2px; right:2px; background:var(--danger); color:white; border:2px solid white; border-radius:50%; width:24px; height:24px; display:${currentAvatarPhoto?'flex':'none'}; align-items:center; justify-content:center; font-size:12px; font-weight:900; cursor:pointer; box-shadow:0 1px 3px rgba(0,0,0,0.2); z-index:15;">&times;</div>
          </div>
          <label ${labelStyle}>Company Name</label><input id="v_comp" value="${isEdit ? (editData.company || '') : ''}" ${largeInput}>
          <label ${labelStyle}>Trade Category</label><input id="v_trade" value="${isEdit ? (editData.trade || '') : ''}" ${largeInput}>
          <label ${labelStyle}>Contact Person</label><input id="v_contact" value="${isEdit ? (editData.contactName || '') : ''}" ${largeInput}>
          <label ${labelStyle}>Phone 1</label><input id="v_phone1" type="tel" maxlength="11" oninput="this.value=this.value.replace(/[^0-9]/g,'')" placeholder="Blank or 11 Digits" value="${isEdit ? (editData.phone1 || editData.phone || '') : ''}" ${largeInput}>
          <label ${labelStyle}>Phone 2</label><input id="v_phone2" type="tel" maxlength="11" oninput="this.value=this.value.replace(/[^0-9]/g,'')" placeholder="Blank or 11 Digits" value="${isEdit ? (editData.phone2 || '') : ''}" ${largeInput}>
          <label ${labelStyle}>Email Address</label><input id="v_email" type="email" value="${isEdit ? (editData.email || '') : ''}" ${largeInput}>
          <label ${labelStyle}>Form Attachments</label>
          <div id="vendorAttachmentsPreviews" class="modal-preview-grid" style="display:none;"></div>
          <label class="icon-upload-label"><i class="fas fa-paperclip"></i><input type="file" id="vendor_multi_uploader" accept="image/*,application/pdf" multiple style="display:none"></label>
          ${isEdit ? `<button class="action-btn" id="v_delete_btn" style="background:var(--danger); margin-top:20px; font-size:16px; padding:12px;"><i class="fas fa-trash-alt"></i> Delete Vendor</button>` : ''}
        `;

        if(currentModalFiles.length > 0) populateModalInlineImageGalleryPreviews('vendorAttachmentsPreviews');
        
        document.getElementById('v_pass_uploader').onchange = (e) => {
          const file = e.target.files[0]; if(!file) return;
          const r = new FileReader(); r.onload = async (evt) => {
            const comp = await compressImageToTargetLimit(evt.target.result, 190000);
            currentAvatarPhoto = comp; 
            document.getElementById('passport_frame_view').src = comp;
            document.getElementById('v_pass_remove_btn').style.display = 'flex';
          }; r.readAsDataURL(file);
        };
        document.getElementById('vendor_multi_uploader').onchange = (e) => { processIncomingMultiAttachments(e.target.files, 'vendorAttachmentsPreviews'); };

        if(isEdit) { document.getElementById('v_delete_btn').onclick = () => { if(confirm("Confirm deletion?")) { document.getElementById('v_delete_btn').disabled = true; submit.disabled = true; callApi('deleteVendor', { vendorId: uniqueId }).then(() => { closeModal(); refreshVendorsListView(); }); } }; }

        submit.onclick = () => {
          const p1 = document.getElementById('v_phone1').value.trim(); const p2 = document.getElementById('v_phone2').value.trim();
          if (p1 !== "" && !/^[0-9]{11}$/.test(p1)) { alert("Phone 1 must be 11 numeric digits."); return; }
          if (p2 !== "" && !/^[0-9]{11}$/.test(p2)) { alert("Phone 2 must be 11 numeric digits."); return; }
          submit.disabled = true; submit.innerText = "Saving...";
          const payload = { vendorId: uniqueId, company: document.getElementById('v_comp').value, trade: document.getElementById('v_trade').value, contactName: document.getElementById('v_contact').value, phone1: String(p1), phone2: String(p2), email: document.getElementById('v_email').value, passport: String(currentAvatarPhoto), attachments: String(currentModalFiles.join(ATTACHMENT_DELIMITER)), archived: "No" };
          callApi(isEdit ? 'updateVendor' : 'saveVendor', payload).then(() => { closeModal(); refreshVendorsListView(); });
        };
      }
      else if (type === 'workorder') {
        const uniqueId = isEdit ? editData.workOrderId : generateFrontendPreviewId('workorder');
        title.innerText = isEdit ? "Modify Order" : "Generate Order";
        if (isEdit && editData.attachments) currentModalFiles = splitAttachments(editData.attachments);

        body.innerHTML = `
          <label ${labelStyle}>Order ID</label><input value="${uniqueId}" disabled style="font-size: 20px; padding: 12px; margin-bottom: 5px; background: var(--card-light); font-weight: 800; color: #000;">
          <label ${labelStyle}>Select Subcontractor</label><select id="w_vendor" ${largeInput}></select>
          <label ${labelStyle}>Task Scope</label><textarea id="w_desc" rows="3" placeholder="Operational deliverables..." ${largeInput}>${isEdit ? editData.description : ''}</textarea>
          <label ${labelStyle}>Contract Amount</label><input id="w_amount" type="number" value="${isEdit ? editData.amount : ''}" ${largeInput}>
          <label ${labelStyle}>Order Status</label>
          <select id="w_status" ${largeInput}>
            <option value="Pending Clearance" ${isEdit && editData.status === 'Pending Clearance' ? 'selected' : ''}>Pending Clearance</option>
            <option value="Active Field Run" ${isEdit && editData.status === 'Active Field Run' ? 'selected' : ''}>Active Field Run</option>
            <option value="Completed" ${isEdit && editData.status === 'Completed' ? 'selected' : ''}>Completed & Verified</option>
          </select>
          <label ${labelStyle}>Form Attachments</label>
          <div id="woAttachmentsPreviews" class="modal-preview-grid" style="display:none;"></div>
          <label class="icon-upload-label"><i class="fas fa-paperclip"></i><input type="file" id="wo_multi_uploader" accept="image/*,application/pdf" multiple style="display:none"></label>
        `;

        const vSel = document.getElementById('w_vendor');
        vSel.innerHTML = (cache.vendors || []).map(v => `<option value="${v.vendorId || v.rowId}" ${isEdit && String(v.vendorId || v.rowId) === String(editData.vendorId) ? 'selected' : ''}>${v.company} [${v.trade}]</option>`).join('') || '<option value="">-- No Subcontractors --</option>';

        if(currentModalFiles.length > 0) populateModalInlineImageGalleryPreviews('woAttachmentsPreviews');
        document.getElementById('wo_multi_uploader').onchange = (e) => { processIncomingMultiAttachments(e.target.files, 'woAttachmentsPreviews'); };

        submit.onclick = () => {
          if(!vSel.value) { alert("Contract handler assigned entity missing."); return; }
          submit.disabled = true; submit.innerText = "Saving...";
          const payload = { workOrderId: uniqueId, projectId: currentSelectedProjectId, vendorId: vSel.value, description: document.getElementById('w_desc').value, amount: document.getElementById('w_amount').value, status: document.getElementById('w_status').value, attachments: currentModalFiles.join(ATTACHMENT_DELIMITER) };
          callApi(isEdit ? 'updateWorkOrder' : 'saveWorkOrder', payload).then(() => { closeModal(); loadWorkOrdersListings(); });
        };
      }
      else if (type === 'payment') {
        const uniqueId = isEdit ? editData.paymentId : "PAY-" + Math.random().toString(36).substr(2, 5).toUpperCase();
        title.innerText = isEdit ? "Modify Payment" : "Log Payment";
        const existingAttachments = String(editData?.attachments || '').trim();
        if (isEdit && existingAttachments) currentModalFiles = splitAttachments(existingAttachments);

        body.innerHTML = `
          <label ${labelStyle}>Payment ID</label><input value="${escapeAttr(uniqueId)}" disabled style="font-size: 20px; padding: 12px; margin-bottom: 5px; background: var(--card-light); font-weight: 800; color: #000;">
          <label ${labelStyle}>Transaction Type</label>
          <select id="pay_direction" ${largeInput}>
            <option value="Client Receipt" ${isEdit && paymentDirectionOf(editData) === 'Client Receipt' ? 'selected' : ''}>Payment Received From Client</option>
            <option value="Outgoing Payment" ${(!isEdit || paymentDirectionOf(editData) === 'Outgoing Payment') ? 'selected' : ''}>Payment To Subcontractor / Staff / Supplier</option>
            <option value="Small Expense" ${isEdit && paymentDirectionOf(editData) === 'Small Expense' ? 'selected' : ''}>Small Expense / Petty Cash</option>
          </select>
          <label ${labelStyle}>Client / Payee / Recipient</label><input id="pay_payee" placeholder="Client, subcontractor, staff, supplier..." value="${escapeAttr(isEdit ? (editData.payee || '') : '')}" ${largeInput}>
          <label ${labelStyle}>Category</label>
          <select id="pay_expense_category" ${largeInput}>
            <option value="" ${!isEdit || !editData.expenseCategory ? 'selected' : ''}>-- Not Applicable --</option>
            <option value="Client Deposit" ${isEdit && editData.expenseCategory === 'Client Deposit' ? 'selected' : ''}>Client Deposit</option>
            <option value="Client Balance" ${isEdit && editData.expenseCategory === 'Client Balance' ? 'selected' : ''}>Client Balance</option>
            <option value="Labour" ${isEdit && editData.expenseCategory === 'Labour' ? 'selected' : ''}>Labour</option>
            <option value="Materials" ${isEdit && editData.expenseCategory === 'Materials' ? 'selected' : ''}>Materials</option>
            <option value="Transportation" ${isEdit && editData.expenseCategory === 'Transportation' ? 'selected' : ''}>Transportation</option>
            <option value="Feeding" ${isEdit && editData.expenseCategory === 'Feeding' ? 'selected' : ''}>Feeding</option>
            <option value="Tools / Equipment" ${isEdit && editData.expenseCategory === 'Tools / Equipment' ? 'selected' : ''}>Tools / Equipment</option>
            <option value="Miscellaneous" ${isEdit && editData.expenseCategory === 'Miscellaneous' ? 'selected' : ''}>Miscellaneous</option>
          </select>
          <label ${labelStyle}>Linked Work Order / Reference</label><input id="pay_ref" placeholder="Optional invoice, receipt, or work order ref" value="${escapeAttr(isEdit ? (editData.referenceId || '') : '')}" ${largeInput}>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
            <div><label ${labelStyle}>Amount</label><input id="pay_amount" type="number" step="0.01" value="${escapeAttr(isEdit ? (editData.amount || '') : '')}" ${largeInput}></div>
            <div>
              <label ${labelStyle}>Method</label>
              <select id="pay_method" ${largeInput}>
                <option value="Cash" ${isEdit && editData.paymentMethod === 'Cash' ? 'selected' : ''}>Cash</option>
                <option value="Transfer" ${(!isEdit || editData.paymentMethod === 'Transfer') ? 'selected' : ''}>Transfer</option>
                <option value="POS/Card" ${isEdit && editData.paymentMethod === 'POS/Card' ? 'selected' : ''}>POS/Card</option>
                <option value="Cheque" ${isEdit && editData.paymentMethod === 'Cheque' ? 'selected' : ''}>Cheque</option>
              </select>
            </div>
          </div>
          <label ${labelStyle}>Payment Status</label>
          <select id="pay_status" ${largeInput}>
            <option value="Pending" ${isEdit && editData.status === 'Pending' ? 'selected' : ''}>Pending</option>
            <option value="Cleared" ${isEdit && editData.status === 'Cleared' ? 'selected' : ''}>Cleared</option>
            <option value="Part Payment" ${isEdit && editData.status === 'Part Payment' ? 'selected' : ''}>Part Payment</option>
            <option value="Reversed" ${isEdit && editData.status === 'Reversed' ? 'selected' : ''}>Reversed</option>
          </select>
          <label ${labelStyle}>Notes</label><textarea id="pay_notes" rows="2" placeholder="Milestone, balance note, approval note..." ${largeInput}>${escapeHtml(isEdit ? (editData.notes || '') : '')}</textarea>
          <label ${labelStyle}>Receipt / Proof Attachments</label>
          <div id="paymentAttachmentsPreviews" class="modal-preview-grid" style="display:none;"></div>
          <label class="icon-upload-label"><i class="fas fa-paperclip"></i><input type="file" id="pay_multi_uploader" accept="image/*,application/pdf" multiple style="display:none"></label>
        `;

        if(currentModalFiles.length > 0) populateModalInlineImageGalleryPreviews('paymentAttachmentsPreviews');
        document.getElementById('pay_multi_uploader').onchange = (e) => { processIncomingMultiAttachments(e.target.files, 'paymentAttachmentsPreviews'); };

        submit.onclick = () => {
          const amount = document.getElementById('pay_amount').value;
          if(!amount || Number(amount) <= 0) { alert("Enter a valid payment amount."); return; }
          submit.disabled = true; submit.innerText = "Saving...";
          const attachmentsValue = normalizeAttachments(currentModalFiles);
          const payload = { paymentId: uniqueId, projectId: currentSelectedProjectId, paymentDate: new Date().toLocaleDateString(), paymentDirection: document.getElementById('pay_direction').value, payee: document.getElementById('pay_payee').value, expenseCategory: document.getElementById('pay_expense_category').value, referenceId: document.getElementById('pay_ref').value, amount, paymentMethod: document.getElementById('pay_method').value, status: document.getElementById('pay_status').value, notes: document.getElementById('pay_notes').value, attachments: attachmentsValue };
          callApi(isEdit ? 'updatePayment' : 'savePayment', payload).then(() => { closeModal(); loadPaymentsListings(); });
        };
      }
    }

    // --- EMERGENCY JSON BLOB EXTRACTOR ---
    async function exportEmergencyOfflineBackup() {
      try {
        const queue = await getQueuedRequests();
        if (queue.length === 0) { alert("Sync pipeline safe. No un-synced data found in the local database."); return; }
        const rawJson = JSON.stringify(queue, null, 2);
        
        const body = document.getElementById('modalBody'); const submit = document.getElementById('modalSubmit'); const title = document.getElementById('modalTitle');
        title.innerText = "Emergency Data Extract";
        body.innerHTML = `
          <p style="font-size:13px; font-weight:700; color:var(--danger); margin-bottom:10px;">Copy the raw text, or download the JSON backup file.</p>
          <textarea readonly style="width:100%; height:250px; font-family:monospace; font-size:11px; padding:10px; border:2px solid #000; border-radius:8px; background:#fff;">${rawJson}</textarea>
          <button class="action-btn" id="blob-download-btn" style="background:var(--success); margin-top:15px; font-size:16px; padding:12px;"><i class="fas fa-download"></i> Save .JSON File</button>
        `;
        document.getElementById('modalOverlay').style.display = 'flex';
        submit.innerText = "Acknowledge"; submit.onclick = () => { closeModal(); };

        document.getElementById('blob-download-btn').onclick = () => {
          const blob = new Blob([rawJson], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a'); a.href = url; a.download = "FieldScan_Recovery_" + new Date().getTime() + ".json";
          document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
        };
      } catch (err) { alert("Database access failure: " + err.message); }
    }

    function compressImageToTargetLimit(base64Str, targetMaxBytes) {
      return new Promise((resolve) => {
        const img = new Image(); img.src = base64Str; img.onload = () => {
          const canvas = document.createElement('canvas'); let w = img.width; let h = img.height;
          if (w > h) { if (w > 1000) { h *= 1000 / w; w = 1000; } } else { if (h > 1000) { w *= 1000 / h; h = 1000; } }
          canvas.width = w; canvas.height = h; const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, w, h);
          let q = 0.8; let res = canvas.toDataURL('image/jpeg', q);
          while (res.length > targetMaxBytes && q > 0.15) { q -= 0.1; res = canvas.toDataURL('image/jpeg', q); }
          resolve(res);
        };
      });
    }

    function getDirectImageUrl(url) { if (!url || !url.includes('drive.google.com')) return url; const id = url.split('/d/')[1]?.split('/')[0] || url.split('id=')[1]?.split('&')[0]; return `https://drive.google.com/thumbnail?id=${id}&sz=w800`; }
    function closeModal() { document.getElementById('modalOverlay').style.display = 'none'; }
    
    function showPage(p) {
      document.querySelectorAll('.page-view').forEach(v => v.classList.remove('active-view'));
      const target = document.getElementById('view-' + p);
      if (target) { target.classList.add('active-view'); window.scrollTo(0,0); }
      if (p === 'dashboard') refreshMasterDashboard();
      if (p === 'vendors') refreshVendorsListView();
      if (p === 'reports') initReportsConsoleEngine();
    }

    function initReportsConsoleEngine() {
      const pipeline = [ callApi('getProjects', {}), callApi('getInspections', {}), callApi('getTakeOffItems', {}), callApi('getProgressLogs', {}), callApi('getWorkOrders', {}), callApi('getVendors', {}), callApi('getPayments', {}) ];
      Promise.all(pipeline).then(([p, i, t, l, w, v, pay]) => {
        cache.projects = p || []; cache.inspections = i || []; cache.takeoffs = t || []; cache.progressLogs = l || []; cache.workorders = w || []; cache.vendors = v || []; cache.payments = pay || [];
        const pSel = document.getElementById('rep-project-sel');
        pSel.innerHTML = '<option value="">-- Choose Project --</option>' + cache.projects.map(item => `<option value="${escapeAttr(item.projectId)}">${escapeHtml(item.clientName)} [Ref: ${escapeHtml(item.projectId)}]</option>`).join('');
        document.getElementById('rep-template-sel').innerHTML = "<option value=''>-- Configure Filters --</option>";
        document.getElementById('report-onscreen-preview-card').style.display = "none";
      });
    }

    function handleReportOptionsPopulation() {
      const pId = document.getElementById('rep-project-sel').value;
      const tSel = document.getElementById('rep-template-sel');
      if(!pId) { tSel.innerHTML = "<option value=''>-- Choose Valid Project Trace Entry Rows --</option>"; return; }
      tSel.innerHTML = `
        <option value="">-- Choose Target Document Matrix Setup --</option>
        <option value="inspection_report">Initial Inspection & Site Condition Report</option>
        <option value="survey_complete">Comprehensive Quantity Take-Off Sheet Manifest</option>
        <option value="progress_timeline">Chronological Construction Progress Audit Timeline</option>
        <option value="scope_completion">Project Scope & Completion Report Portfolio</option>
        <option value="payment_summary">Payments & Cost Tracking Summary</option>
        <option value="master_dossier">The Complete Executive Portfolio (All Records Bundle)</option>
      `;
    }

    function compileFieldReport() {
      const pId = document.getElementById('rep-project-sel').value;
      const layout = document.getElementById('rep-template-sel').value;
      if (!pId || !layout) { alert("Please allocate accurate selection profile configurations."); return; }
      
      const projectItem = cache.projects.find(item => item.projectId === pId);
      const logoUrl = ""; 

      let headerStr = `
        <div style="display: flex; align-items: center; justify-content: space-between; padding-bottom: 12px; border-bottom: 3px solid #000000; margin-bottom: 20px; gap: 15px;">
          <div style="display: flex; align-items: center; gap: 16px;">
            <img src="${logoUrl}" alt="Logo" style="height: 65px; max-width: 160px; object-fit: contain; font-size: 10px;" onerror="this.style.display='none';">
            <div style="text-align: left;">
              <h2 style="font-size: 22px; font-weight: 800; letter-spacing: 0.5px; margin: 0; line-height: 1.2; color: #000000;">FIELDSCAN PRO OPERATIONS COMPLIANCE SYSTEM</h2>
              <p style="font-size: 11px; font-weight: 600; text-transform: uppercase; margin-top: 4px; margin-bottom: 0; color: var(--muted);">Official Scope Verification & Progress Timeline Documentation</p>
            </div>
          </div>
          <div style="text-align: right; font-size: 12px; font-weight: 800; white-space: nowrap; padding-left: 15px;">
            RUN SYNC DATE:<br><span style="font-family: monospace; font-size: 13px;">${new Date().toLocaleDateString()}</span>
          </div>
        </div>
        <div style="background:#f8f9fa; border:1px solid #000; padding:12px; border-radius:10px; font-size:14px; font-weight:700; margin-bottom:20px; display:grid; grid-template-columns:1fr 1fr; gap:10px;">
          <div>CLIENT ENTITY Name: <span style="font-weight:500;">${escapeHtml(projectItem.clientName)}</span><br>JOBSITE COORDINATE: <span style="font-weight:500;">${escapeHtml(projectItem.siteLocation)}</span></div>
          <div style="text-align:right;">PROJECT INDEX TOKEN: <span style="font-family:monospace;">${escapeHtml(projectItem.projectId)}</span><br>TRACK STATE STATUS: <span style="font-weight:800; text-transform:uppercase;">[${escapeHtml(projectItem.projectStatus)}]</span></div>
        </div>
      `;
      
      let contentHtml = "";
      const filteredInspections = cache.inspections.filter(item => item.projectId === pId);
      const filteredTakeoffs = cache.takeoffs.filter(item => item.projectId === pId);
      const filteredProgress = cache.progressLogs.filter(item => item.projectId === pId);
      const filteredOrders = cache.workorders.filter(item => item.projectId === pId);
      const filteredPayments = cache.payments.filter(item => item.projectId === pId);

      if (layout === "inspection_report" || layout === "master_dossier") {
        contentHtml += `
          <h3 style="font-size:16px; margin-bottom:8px; text-transform:uppercase; border-bottom:1px solid #000; padding-bottom:4px;">I. Initial Inspection & Site Condition Register</h3>
          <table class="print-table">
            <thead><tr><th>Date</th><th>Type</th><th>Area</th><th>Condition / Recommendation</th></tr></thead>
            <tbody>
              ${filteredInspections.map(i => `<tr><td>${escapeHtml(i.inspectionDate || '')}</td><td>${escapeHtml(i.inspectionType || '')}</td><td><strong>${escapeHtml(i.areaInspected || '')}</strong></td><td>${escapeHtml(i.siteCondition || '')}${i.recommendations ? `<br><small style="color:#555; font-style:italic;">Action: ${escapeHtml(i.recommendations)}</small>` : ''}</td></tr>`).join('') || '<tr><td colspan="4">No inspection records registered.</td></tr>'}
            </tbody>
          </table>
        `;
      }

      if (layout === "survey_complete" || layout === "master_dossier") {
        contentHtml += `
          <h3 style="font-size:16px; margin-bottom:8px; text-transform:uppercase; border-bottom:1px solid #000; padding-bottom:4px;">${layout === 'master_dossier'?'II':'I'}. Quantity Take-Off & Structural Dimensions Matrix</h3>
          <table class="print-table">
            <thead><tr><th>Structural Area Node</th><th>Specialized Trade</th><th>Scope Task Specification Description</th><th>Measured Dimension</th></tr></thead>
            <tbody>
              ${filteredTakeoffs.map(t => `<tr><td><strong>${escapeHtml(t.roomArea)}</strong></td><td>${escapeHtml(t.tradeCategory)}</td><td>${escapeHtml(t.description)}${t.scopeNotes? `<br><small style="color:#555; font-style:italic;">Note: ${escapeHtml(t.scopeNotes)}</small>`:''}</td><td><strong>${escapeHtml(t.quantity)} ${escapeHtml(t.unit)}</strong></td></tr>`).join('') || '<tr><td colspan="4">No survey items registered inside structural parameters.</td></tr>'}
            </tbody>
          </table>
        `;
      }

      if (layout === "progress_timeline" || layout === "master_dossier") {
        contentHtml += `
          <h3 style="font-size:16px; margin-top:25px; margin-bottom:8px; text-transform:uppercase; border-bottom:1px solid #000; padding-bottom:4px;">${layout === 'master_dossier'?'III':'I'}. Project Field Execution Progress Timeline</h3>
          <div style="position:relative; padding-left:15px; border-left:2px solid #000; margin-top:10px; margin-left:5px;">
            ${filteredProgress.map(l => `
              <div style="margin-bottom:18px; position:relative;">
                <div style="font-size:11px; font-weight:800; color:#555;">${escapeHtml(l.dateRecorded || '')} | TRADE FIELD: <span style="text-transform:uppercase; color:var(--primary);">${escapeHtml(l.tradeCategory)}</span></div>
                <div style="font-size:14px; font-weight:700; color:#000; margin-top:2px;">
                  Metrics Clearance State Level: <span style="color:var(--success); font-weight:800;">${escapeHtml(l.completionPercentage)}% Done</span>
                </div>
                <p style="font-size:13px; font-weight:500; color:#333; margin-top:3px; font-style:italic;">"${escapeHtml(l.commentNarrative)}"</p>
              </div>
            `).join('') || '<p style="font-style:italic; font-size:13px;">No history rows processed yet.</p>'}
          </div>
        `;
      }

      if (layout === "scope_completion") {
        const latestPercentages = {};
        filteredProgress.forEach(l => {
          if (!latestPercentages[l.tradeCategory] || parseInt(l.completionPercentage) > parseInt(latestPercentages[l.tradeCategory])) {
            latestPercentages[l.tradeCategory] = parseInt(l.completionPercentage);
          }
        });
        
        const overallTradeCount = Object.keys(latestPercentages).length;
        const aggregateSum = Object.values(latestPercentages).reduce((a, b) => a + b, 0);
        const calculatedTotalPct = overallTradeCount > 0 ? Math.round(aggregateSum / overallTradeCount) : 0;

        contentHtml += `
          <h3 style="font-size:16px; margin-bottom:12px; text-transform:uppercase; border-bottom:1px solid #000; padding-bottom:4px;">Project Scope Fulfillment & Completion Summary</h3>
          <div style="display:grid; grid-template-columns:1fr 2fr; gap:15px; margin-bottom:20px; align-items:center;">
            <div style="border:3px solid #000; text-align:center; padding:20px; border-radius:12px; background:#f8f9fa;">
              <span style="font-size:36px; font-weight:900; color:var(--success);">${calculatedTotalPct}%</span><br>
              <small style="font-weight:800; font-size:11px; color:var(--muted); text-transform:uppercase;">Overall Progress Score</small>
            </div>
            <div style="font-size:14px; font-weight:600;">
              Total Quantified Scope Branches: <span style="font-weight:800; color:var(--primary);">${filteredTakeoffs.length} Survey Elements</span><br>
              Total Chronological Milestones Logged: <span style="font-weight:800;">${filteredProgress.length} Entries</span><br>
              Contractual Subcontract Work Orders: <span style="font-weight:800;">${filteredOrders.length} Packages</span>
            </div>
          </div>

          <h4 style="font-size:14px; text-transform:uppercase; margin-bottom:6px;">Section 1: Active Trade Milestones Metrics Status Matrix</h4>
          <table class="print-table" style="margin-bottom:25px;">
            <thead><tr><th>Allocated specialized Trade Sector</th><th>Verified Structural Completion Status</th></tr></thead>
            <tbody>
              ${Object.keys(latestPercentages).map(t => `<tr><td><strong>${t.toUpperCase()}</strong></td><td><strong>${latestPercentages[t]}% Complete</strong></td></tr>`).join('') || '<tr><td colspan="2">No milestone percentages have been mapped.</td></tr>'}
            </tbody>
          </table>

          <h4 style="font-size:14px; text-transform:uppercase; margin-bottom:6px;">Section 2: Dispatched Subcontractor Expenditure Commitments</h4>
          <table class="print-table">
            <thead><tr><th>Assigned Corporate Handler</th><th>Operational Deliverable Task Scope</th><th>Budget Valuation</th><th>Tracking Status</th></tr></thead>
            <tbody>
              ${filteredOrders.map(w => {
                const name = cache.vendors.find(v => String(v.vendorId || v.rowId) === String(w.vendorId))?.company || "Assigned Contractor Entity";
                return `<tr><td><strong>${escapeHtml(name)}</strong></td><td>${escapeHtml(w.description)}</td><td>₦${moneyValue(w.amount)}</td><td>[${escapeHtml(String(w.status || '').toUpperCase())}]</td></tr>`;
              }).join('') || '<tr><td colspan="4">No subcontractor liabilities have been mapped.</td></tr>'}
            </tbody>
          </table>
          
          <div class="page-break" style="margin-top:50px; display:grid; grid-template-columns:1fr 1fr; gap:40px; text-align:center; font-size:12px; font-weight:800;">
            <div><div style="border-bottom:1px solid #000; margin-bottom:5px; height:35px;"></div>FIELD INSPECTOR AUTHORIZATION</div>
            <div><div style="border-bottom:1px solid #000; margin-bottom:5px; height:35px;"></div>CLIENT REVIEW / SIGN-OFF CLEARANCE</div>
          </div>
        `;
      }
      if (layout === "payment_summary" || layout === "master_dossier") {
        const totalReceived = filteredPayments.filter(isClientReceipt).reduce((sum, p) => sum + Number(p.amount || 0), 0);
        const totalOutgoing = filteredPayments.filter(p => !isClientReceipt(p)).reduce((sum, p) => sum + Number(p.amount || 0), 0);
        const smallExpenses = filteredPayments.filter(isPettyExpense).reduce((sum, p) => sum + Number(p.amount || 0), 0);
        const totalCommitted = filteredOrders.reduce((sum, w) => sum + Number(w.amount || 0), 0);
        contentHtml += `
          <h3 style="font-size:16px; margin-top:25px; margin-bottom:8px; text-transform:uppercase; border-bottom:1px solid #000; padding-bottom:4px;">${layout === 'master_dossier'?'IV':'I'}. Payments & Cost Tracking Summary</h3>
          <div style="display:grid; grid-template-columns:1fr 1fr 1fr 1fr; gap:10px; margin-bottom:15px;">
            <div style="border:1px solid #000; padding:10px;"><small style="font-weight:800;">Committed</small><br><strong>₦${moneyValue(totalCommitted)}</strong></div>
            <div style="border:1px solid #000; padding:10px;"><small style="font-weight:800;">Client Received</small><br><strong>₦${moneyValue(totalReceived)}</strong></div>
            <div style="border:1px solid #000; padding:10px;"><small style="font-weight:800;">Outgoing</small><br><strong>₦${moneyValue(totalOutgoing)}</strong></div>
            <div style="border:1px solid #000; padding:10px;"><small style="font-weight:800;">Cash Position</small><br><strong>₦${moneyValue(totalReceived - totalOutgoing)}</strong></div>
          </div>
          <p style="font-size:12px; font-weight:700; margin-bottom:8px;">Small expenses / petty cash total: ₦${moneyValue(smallExpenses)}</p>
          <table class="print-table">
            <thead><tr><th>Date</th><th>Type</th><th>Client / Payee</th><th>Category</th><th>Reference</th><th>Amount</th><th>Status</th></tr></thead>
            <tbody>
              ${filteredPayments.map(p => `<tr><td>${escapeHtml(p.paymentDate || '')}</td><td>${escapeHtml(paymentDirectionOf(p))}</td><td><strong>${escapeHtml(p.payee || '')}</strong></td><td>${escapeHtml(p.expenseCategory || '')}</td><td>${escapeHtml(p.referenceId || '')}</td><td>${isClientReceipt(p) ? '+' : '-'}₦${moneyValue(p.amount)}</td><td>${escapeHtml(p.status || '')}</td></tr>`).join('') || '<tr><td colspan="7">No payment records registered.</td></tr>'}
            </tbody>
          </table>
        `;
      }
      const totalCompiledPackage = headerStr + contentHtml;
      document.getElementById('report-preview-viewport').innerHTML = totalCompiledPackage;
      document.getElementById('report-print-container').innerHTML = totalCompiledPackage;
      document.getElementById('report-onscreen-preview-card').style.display = "block";
    }
