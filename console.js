// ===== console.js =====
async function loadProjectConsoleHub(projectId) {
  setCurrentProjectId(projectId);
  const cache = getCache();
  const proj = cache.projects.find((p) => p.projectId === projectId);
  if (!proj) return;
  document.getElementById("console-title-text").innerText = proj.projectId;
  document.getElementById("c-meta-name").innerText = proj.clientName;
  document.getElementById("c-meta-loc").innerText = proj.siteLocation;
  document.getElementById("c-meta-phone").innerHTML =
    proj.clientPhone || "No phone";
  document.getElementById("c-meta-phone").href = proj.clientPhone
    ? "tel:" + proj.clientPhone
    : "#";
  document.getElementById("c-meta-notes").value = proj.notes || "";
  const subtotal = roundMoney(Number(proj.contractSubtotal) || 0);
  const vat = calculateTax(subtotal, "VAT");
  const wht = calculateTax(subtotal, "WHT");
  const totalContract = roundMoney(subtotal + vat);
  const netReceivable = roundMoney(totalContract - wht);
  const subtotalEl = document.getElementById("c-meta-subtotal");
  if (subtotalEl) subtotalEl.innerText = "₦" + moneyValue(subtotal);
  const vatEl = document.getElementById("c-meta-vat");
  if (vatEl) vatEl.innerText = "₦" + moneyValue(vat);
  const vatRateEl = document.getElementById("c-meta-vat-rate");
  if (vatRateEl) vatRateEl.innerText = formatTaxRate(getTaxRate("VAT"));
  const whtEl = document.getElementById("c-meta-wht");
  if (whtEl) whtEl.innerText = "₦" + moneyValue(wht);
  const whtRateEl = document.getElementById("c-meta-wht-rate");
  if (whtRateEl) whtRateEl.innerText = formatTaxRate(getTaxRate("WHT"));
  const totalEl = document.getElementById("c-meta-total");
  if (totalEl) totalEl.innerText = "₦" + moneyValue(totalContract);
  const netEl = document.getElementById("c-meta-net");
  if (netEl) netEl.innerText = "₦" + moneyValue(netReceivable);
  const scopeEl = document.getElementById("c-meta-scope");
  if (scopeEl) {
    scopeEl.value = proj.scope || "";
    scopeEl.readOnly = true;
    scopeEl.style.background = "#f5f5f5";
  }
  const scopeToggle = document.getElementById("scope-edit-toggle");
  if (scopeToggle) scopeToggle.checked = false;
  const scopeSaveBtn = document.getElementById("scope-save-btn");
  if (scopeSaveBtn) scopeSaveBtn.style.display = "none";
  showPage("project-console");
  switchConsoleSegment("profile");
}

function toggleScopeEdit(isEditing) {
  const scopeEl = document.getElementById("c-meta-scope");
  const saveBtn = document.getElementById("scope-save-btn");
  if (!scopeEl) return;
  scopeEl.readOnly = !isEditing;
  scopeEl.style.background = isEditing ? "#fff" : "#f5f5f5";
  if (saveBtn) saveBtn.style.display = isEditing ? "block" : "none";
  if (isEditing) scopeEl.focus();
}

async function saveProjectScope() {
  const btn = document.getElementById("scope-save-btn");
  const scopeEl = document.getElementById("c-meta-scope");
  const toggle = document.getElementById("scope-edit-toggle");
  const projectId = getCurrentProjectId();
  if (!projectId || !scopeEl) return;
  const newScope = scopeEl.value;
  btn.disabled = true;
  btn.innerText = "Saving...";
  try {
    await callApi("updateProjectScope", { projectId, scope: newScope });
    const cache = getCache();
    const proj = cache.projects.find((p) => p.projectId === projectId);
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

// Dedicated subtotal-only update — calls the backend's updateProjectContractSubtotal action
async function updateProjectContractSubtotal(projectId, contractSubtotal) {
  const payload = {
    projectId,
    contractSubtotal: roundMoney(Number(contractSubtotal) || 0),
  };
  const result = await callApi("updateProjectContractSubtotal", payload);
  if (result && result.success !== false) {
    const cache = getCache();
    const proj = cache.projects.find((p) => p.projectId === projectId);
    if (proj) proj.contractSubtotal = payload.contractSubtotal;
    setCache(cache);
  }
  return result;
}

function triggerEditProjectProfile() {
  const cache = getCache();
  const id = getCurrentProjectId();
  openModal(
    "project",
    cache.projects.find((p) => p.projectId === id),
  );
}

function switchConsoleSegment(seg) {
  document
    .querySelectorAll(".console-tab-window")
    .forEach((w) => w.classList.remove("active-view"));
  document
    .querySelectorAll(".segment-btn")
    .forEach((b) => b.classList.remove("active"));
  document.getElementById(`console-seg-${seg}`).classList.add("active-view");
  document.getElementById(`seg-btn-${seg}`).classList.add("active");
  if (seg === "takeoff") loadTakeOff2Listings();
  if (seg === "progress") loadProgressTimelineFeed();
  if (seg === "snags") loadSnagsListings();
  if (seg === "workorders") loadWorkOrdersListings();
  if (seg === "payments") loadPaymentsListings();
}

async function loadTakeOffListings(forceRefresh = false) {
  const container = document.getElementById("console-takeoff-list");
  let cache = getCache();
  if (forceRefresh || !cache.takeoffsLoaded) {
    container.innerHTML = `<p style="text-align:center;padding:15px;"><i class="fas fa-spinner fa-spin"></i> Loading take‑off items...</p>`;
    const items = await callApi("getTakeOffItems", {});
    cache = getCache();
    cache.takeoffs = items || [];
    cache.takeoffsLoaded = true;
    setCache(cache);
  }
  const projectId = getCurrentProjectId();
  const projectItems = cache.takeoffs.filter((i) => i.projectId === projectId);
  const validIds = new Set(projectItems.map((i) => i.itemId));
  for (const id of selectedTakeOffIds) {
    if (!validIds.has(id)) selectedTakeOffIds.delete(id);
  }
  let html = `<div style="display:flex; gap:8px; margin-bottom:12px; flex-wrap:wrap;">
    <button class="action-btn" style="width:auto; padding:8px 16px; font-size:13px; background:var(--primary);" onclick="window.openTemplatesModal()">
      <i class="fas fa-layer-group"></i> Templates
    </button>
    <button class="action-btn" style="width:auto; padding:8px 16px; font-size:13px;" onclick="window.openTakeOffGroupModal(null)">
      <i class="fas fa-plus"></i> New Take‑Off
    </button>
  </div>`;

  if (!projectItems.length) {
    html += `<p style="text-align:center;padding:20px;">No take‑off items yet.</p>`;
    selectedTakeOffIds.clear();
    container.innerHTML = html;
    return;
  }

  const groups = getTakeOffGroups(projectItems);

  if (selectedTakeOffIds.size > 0) {
    html += `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
      <span style="font-size:13px; font-weight:700;">${selectedTakeOffIds.size} selected</span>
      <button class="action-btn" style="width:auto; padding:8px 16px; font-size:13px; background:var(--danger);" onclick="window.deleteSelectedTakeOffs()">
        <i class="fas fa-trash"></i> Delete Selected
      </button>
    </div>`;
  }

  for (const group of groups) {
    const allChecked = group.items.every((i) => selectedTakeOffIds.has(i.itemId));
    const itemRows = group.items.map((i) => {
      const isChecked = selectedTakeOffIds.has(i.itemId);
      const key = `takeoff_item:${i.itemId}`;
      window.modalRecordCache = window.modalRecordCache || {};
      window.modalRecordCache[key] = i;
      return `<tr style="border-bottom:1px solid var(--border); cursor:pointer;" onclick="window.openTakeOffGroupModal('${escapeAttr(group.groupId)}')">
        <td style="padding:8px 6px; width:28px;" onclick="event.stopPropagation()">
          <input type="checkbox" style="width:auto; cursor:pointer;" ${isChecked ? "checked" : ""} onclick="event.stopPropagation(); window.toggleTakeOffSelection('${escapeAttr(i.itemId)}', this.checked)">
        </td>
        <td style="padding:8px 6px; font-size:13px;">${escapeHtml(i.description)}</td>
        <td style="padding:8px 6px; font-size:12px; color:var(--muted); text-align:right; white-space:nowrap;">
          ${escapeHtml(String(i.quantity))} ${escapeHtml(i.unit)}
        </td>
      </tr>`;
    }).join("");

    html += `<div class="card" style="padding:0; overflow:hidden; margin-bottom:12px; border:1.5px solid var(--border);">
      <div style="background:var(--card-light); padding:12px 14px; display:flex; justify-content:space-between; align-items:center; gap:10px; border-bottom:1.5px solid var(--border); cursor:pointer;" onclick="window.openTakeOffGroupModal('${escapeAttr(group.groupId)}')">
        <div style="display:flex; align-items:center; gap:10px; flex:1; min-width:0;">
          <input type="checkbox" style="width:auto; cursor:pointer; flex-shrink:0;" ${allChecked ? "checked" : ""} title="Select all in this group" onchange="window.toggleGroupSelection('${escapeAttr(group.groupId)}', this.checked)" onclick="event.stopPropagation()">
          <div style="min-width:0;">
            <div style="font-weight:900; font-size:15px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(group.name)}</div>
            <div style="font-size:11px; color:var(--muted); margin-top:1px;">${group.items.length} items</div>
          </div>
        </div>
        <div style="display:flex; gap:6px; flex-shrink:0;">
          <button class="action-btn" style="width:auto; padding:6px 12px; font-size:12px; background:var(--card-light); color:var(--text);" onclick="event.stopPropagation(); window.openTakeOffGroupModal('${escapeAttr(group.groupId)}')" title="Edit group">
            <i class="fas fa-edit"></i>
          </button>
        </div>
      </div>
      <div style="overflow-x:auto;">
        <table style="width:100%; border-collapse:collapse;">
          <thead>
            <tr style="background:#000; color:#fff;">
              <th style="padding:6px; width:28px;"></th>
              <th style="padding:6px 8px; font-size:10px; text-align:left; text-transform:uppercase; font-weight:700;">Description</th>
              <th style="padding:6px 8px; font-size:10px; text-align:right; text-transform:uppercase; font-weight:700; width:80px;">Qty / Unit</th>
            </tr>
          </thead>
          <tbody>${itemRows}</tbody>
        </table>
      </div>
    </div>`;
  }

  container.innerHTML = html;
}

function getTakeOffGroups(projectItems) {
  const groups = [];
  const processed = new Set();

  // 1. New-style groups (roomArea starts with __GRP__:)
  const grpMap = new Map();
  for (const item of projectItems) {
    const ra = String(item.roomArea || "");
    if (ra.startsWith("__GRP__:")) {
      const gid = ra.substring(8);
      if (!grpMap.has(gid)) {
        grpMap.set(gid, {
          groupId: gid,
          name: item.tradeCategory || "Untitled Group",
          items: [],
        });
      }
      grpMap.get(gid).items.push(item);
      processed.add(item.itemId);
    }
  }
  groups.push(...grpMap.values());

  // 2. Legacy template groups (scopeNotes starts with "From template: ")
  const tmplMap = new Map();
  for (const item of projectItems) {
    if (processed.has(item.itemId)) continue;
    const sn = String(item.scopeNotes || "");
    const tmplMatch = sn.match(/^From template: ([^\n]+)/);
    if (tmplMatch) {
      const tmplName = tmplMatch[1].trim();
      const key = "tmpl:" + tmplName;
      if (!tmplMap.has(key)) {
        tmplMap.set(key, {
          groupId: key,
          name: tmplName,
          items: [],
        });
      }
      tmplMap.get(key).items.push(item);
      processed.add(item.itemId);
    }
  }
  groups.push(...tmplMap.values());

  // 3. Legacy headers (__HEADER__:) + following items
  let currentHeaderGroup = null;
  for (const item of projectItems) {
    if (processed.has(item.itemId)) continue;
    const sn = String(item.scopeNotes || "");
    if (sn.startsWith("__HEADER__:")) {
      if (currentHeaderGroup) groups.push(currentHeaderGroup);
      currentHeaderGroup = {
        groupId: "hdr-" + item.itemId,
        name: sn.substring(11),
        items: [item],
      };
      processed.add(item.itemId);
    } else if (currentHeaderGroup) {
      currentHeaderGroup.items.push(item);
      processed.add(item.itemId);
    }
  }
  if (currentHeaderGroup) groups.push(currentHeaderGroup);

  // 4. Singletons
  for (const item of projectItems) {
    if (processed.has(item.itemId)) continue;
    groups.push({
      groupId: item.itemId,
      name: item.tradeCategory || item.description || "Item",
      items: [item],
    });
  }

  return groups;
}

function toggleGroupSelection(groupId, checked) {
  const cache = getCache();
  const projectId = getCurrentProjectId();
  (cache.takeoffs || [])
    .filter((i) => {
      if (i.projectId !== projectId) return false;
      const ra = String(i.roomArea || "");
      if (ra.startsWith("__GRP__:")) {
        return ra.substring(8) === groupId;
      }
      return i.itemId === groupId;
    })
    .forEach((i) => {
      if (checked) selectedTakeOffIds.add(i.itemId);
      else selectedTakeOffIds.delete(i.itemId);
    });
  loadTakeOffListings();
}

async function openTemplatesModal() {
  const body = document.getElementById("modalBody");
  const submit = document.getElementById("modalSubmit");
  const title = document.getElementById("modalTitle");
  const overlay = document.getElementById("modalOverlay");
  title.innerText = "Templates";
  overlay.style.display = "flex";
  submit.style.display = "none";

  // Show loading spinner first
  body.innerHTML = '<div style="text-align:center;padding:20px;"><i class="fas fa-spinner fa-spin"></i> Loading templates...</div>';

  // Load from sheet (localStorage is cache; sheet is source of truth)
  try {
    await loadTemplatesFromSheet();
  } catch (e) {
    console.warn("Failed to load templates from sheet:", e);
  }

  renderTemplatesModalBody(body);
}

function renderTemplatesModalBody(body) {
  const customTemplates = getCustomTemplates();

  let html = '<div style="max-height:60vh; overflow-y:auto;">';

  // Templates from sheet
  html += '<div style="margin-top:8px; font-size:13px; font-weight:800; text-transform:uppercase; color:var(--muted);">Templates</div>';
  html += '<div style="display:flex; gap:6px; flex-wrap:wrap; margin:8px 0;">';
  html += '<button class="action-btn" style="width:auto; padding:6px 12px; font-size:12px; background:var(--card-light); color:var(--text);" onclick="window.refreshTemplatesFromSheet()"><i class="fas fa-sync-alt"></i> Refresh</button>';
  html += '<button class="action-btn" style="width:auto; padding:6px 12px; font-size:12px; background:var(--card-light); color:var(--text);" onclick="window.exportAllTemplatesJSON()"><i class="fas fa-download"></i> Export All</button>';
  html += '<button class="action-btn" style="width:auto; padding:6px 12px; font-size:12px; background:var(--primary);" onclick="window.openImportTemplatesModal()"><i class="fas fa-upload"></i> Import</button>';
  html += '</div>';

  if (customTemplates.length) {
    html += customTemplates.map((t) => {
      return `<div class="card" style="cursor: default; margin-bottom:8px;"><div style="display:flex; justify-content:space-between; align-items:start; gap:12px;"><div style="flex:1;"><div style="display:flex; align-items:center; gap:8px;"><strong style="font-size:16px;">${escapeHtml(t.name)}</strong><span style="font-size:10px; background:var(--primary); color:#fff; padding:2px 6px; border-radius:4px; text-transform:uppercase;">Sheet</span></div><div style="font-size:12px; color:var(--muted); margin-top:3px;">${escapeHtml(t.description)}</div><div style="font-size:11px; color:var(--muted); margin-top:4px;">${t.items.length} items</div></div><div style="display:flex; gap:6px; flex-shrink:0;"><button class="action-btn" style="width:auto; padding:6px 12px; font-size:12px; background:var(--card-light); color:var(--text);" onclick="previewTemplate('${escapeAttr(t.id)}')"><i class="fas fa-eye"></i></button><button class="action-btn" style="width:auto; padding:6px 12px; font-size:12px; background:#495057;" onclick="openEditTemplateModal('${escapeAttr(t.id)}')"><i class="fas fa-edit"></i></button><button class="action-btn" style="width:auto; padding:6px 12px; font-size:12px; background:var(--card-light); color:var(--text);" onclick="window.exportSingleTemplateJSON('${escapeAttr(t.id)}')"><i class="fas fa-download"></i></button><button class="action-btn" style="width:auto; padding:6px 12px; font-size:12px;" onclick="applyTemplateToProject('${escapeAttr(t.id)}')"><i class="fas fa-check"></i> Apply</button></div></div></div>`;
    }).join("");
  } else {
    html += '<p style="text-align:center; padding:12px; color:var(--muted); font-size:13px;">No templates found. Click Refresh to load from sheet, or Import to add templates.</p>';
  }

  html += '</div>';
  body.innerHTML = html;
}

// Refresh templates from sheet and re-render modal
window.refreshTemplatesFromSheet = async function() {
  const body = document.getElementById("modalBody");
  if (body) {
    body.innerHTML = '<div style="text-align:center;padding:20px;"><i class="fas fa-spinner fa-spin"></i> Refreshing...</div>';
  }
  try {
    await loadTemplatesFromSheet();
  } catch (e) {
    console.warn("Refresh failed:", e);
  }
  if (body) renderTemplatesModalBody(body);
};

function openTakeOffGroupModal(groupId) {
  const cache = getCache();
  const projectId = getCurrentProjectId();
  const projectItems = (cache.takeoffs || []).filter((i) => i.projectId === projectId);
  let group = null;

  if (groupId) {
    group = getTakeOffGroups(projectItems).find((g) => g.groupId === groupId);
  }

  if (group && group.items.length === 1 && !String(group.items[0].roomArea || "").startsWith("__GRP__:")) {
    // Legacy singleton — wrap it
    group = {
      groupId: "TO-GRP-" + Date.now(),
      name: group.items[0].tradeCategory || group.items[0].description || "Item",
      items: group.items,
      isLegacy: true,
    };
  }

  openModal("takeoff_group", group);
}

async function loadProgressTimelineFeed(forceRefresh = false) {
  const container = document.getElementById("console-progress-feed");
  const overallEl = document.getElementById("console-progress-overall");
  let cache = getCache();
  if (forceRefresh || !cache.progressLogsLoaded) {
    container.innerHTML = `<p style="text-align:center;padding:15px;"><i class="fas fa-spinner fa-spin"></i> Loading progress logs...</p>`;
    if (overallEl) overallEl.innerHTML = "";
    const logs = await callApi("getProgressLogs", {});
    cache = getCache();
    cache.progressLogs = logs || [];
    cache.progressLogsLoaded = true;
    setCache(cache);
  }
  const projectId = getCurrentProjectId();
  const projectLogs = cache.progressLogs.filter(
    (l) => l.projectId === projectId,
  );
  if (!projectLogs.length) {
    container.innerHTML = `<p style="text-align:center;padding:20px;">No progress logs.</p>`;
    if (overallEl) overallEl.innerHTML = "";
    return;
  }
  // Calculate overall average percentage
  const totalPct = projectLogs.reduce((sum, l) => sum + (Number(l.completionPercentage) || 0), 0);
  const avgPct = Math.round(totalPct / projectLogs.length);
  if (overallEl) {
    const color = avgPct >= 80 ? "var(--success)" : avgPct >= 50 ? "#fd7e14" : "var(--danger)";
    overallEl.innerHTML = `<span style="color:${color};">${avgPct}%</span>`;
  }
  // Render cards in 2-column grid: trade + percentage only
  container.innerHTML = `<div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">` + projectLogs
    .map((l) => {
      const pct = Number(l.completionPercentage) || 0;
      const color = pct >= 80 ? "var(--success)" : pct >= 50 ? "#fd7e14" : "var(--danger)";
      return `<div class="card" style="text-align:center; display:flex; flex-direction:column; justify-content:center; min-height:80px;">
        <strong style="font-size:14px;">${escapeHtml(l.tradeCategory)}</strong>
        <span style="font-size:20px; font-weight:900; color:${color}; margin-top:4px;">${pct}%</span>
      </div>`;
    })
    .join("") + `</div>`;
}

async function loadSnagsListings(forceRefresh = false) {
  const container = document.getElementById("console-snags-list");
  let cache = getCache();
  if (forceRefresh || !cache.snagsLoaded) {
    container.innerHTML = `<p style="text-align:center;padding:15px;"><i class="fas fa-spinner fa-spin"></i> Loading snags...</p>`;
    const items = await callApi("getSnags", {});
    cache = getCache();
    cache.snags = items || [];
    cache.snagsLoaded = true;
    setCache(cache);
  }
  const projectId = getCurrentProjectId();
  const projectSnags = cache.snags.filter((s) => s.projectId === projectId);
  if (!projectSnags.length) {
    container.innerHTML = `<p style="text-align:center;padding:20px;">No snags recorded.</p>`;
    return;
  }
  container.innerHTML = projectSnags
    .map((s) => {
      const key = `snag:${s.snagId}`;
      window.modalRecordCache = window.modalRecordCache || {};
      window.modalRecordCache[key] = s;
      const isOpen = s.status !== "Completed";
      return `<div class="card" data-modal-type="snag" data-modal-key="${key}" onclick="window.openModalWithRecord('snag', window.modalRecordCache['${key}'])" style="cursor:pointer; border-left:6px solid ${isOpen ? "var(--danger)" : "var(--success)"};"><div style="display:flex; justify-content:space-between; align-items:start; gap:10px;"><p style="margin:0;">${escapeHtml(s.notes)}</p><span style="font-size:11px; font-weight:900; background:${isOpen ? "var(--danger)" : "var(--success)"}; color:#fff; padding:3px 8px; border-radius:4px; text-transform:uppercase; flex-shrink:0;">${escapeHtml(s.status || "Open")}</span></div>${s.assigned ? `<div style="margin-top:6px; font-size:13px;"><strong>Assigned:</strong> ${escapeHtml(s.assigned)}</div>` : ""}<div style="margin-top:6px; font-size:12px; color:var(--muted);">Logged: ${escapeHtml(s.dateLogged)}${s.dateCompleted ? ` | Completed: ${escapeHtml(s.dateCompleted)}` : ""}</div></div>`;
    })
    .join("");
}

async function loadWorkOrdersListings(forceRefresh = false) {
  const container = document.getElementById("console-workorders-list");
  let cache = getCache();
  if (forceRefresh || !cache.workordersLoaded) {
    container.innerHTML = `<p style="text-align:center;padding:15px;"><i class="fas fa-spinner fa-spin"></i> Loading work orders...</p>`;
    const orders = await callApi("getWorkOrders", {});
    cache = getCache();
    cache.workorders = orders || [];
    cache.workordersLoaded = true;
    setCache(cache);
  }
  const projectId = getCurrentProjectId();
  const projectOrders = cache.workorders.filter(
    (w) => w.projectId === projectId,
  );
  if (!projectOrders.length) {
    container.innerHTML = `<p style="text-align:center;padding:20px;">No work orders.</p>`;
    return;
  }
  container.innerHTML = projectOrders
    .map((w) => {
      const key = `workorder:${w.workOrderId}`;
      window.modalRecordCache = window.modalRecordCache || {};
      window.modalRecordCache[key] = w;
      const vendor = (cache.vendors || []).find(
        (v) => v.vendorId === w.vendorId,
      );
      return `<div class="card" data-modal-type="workorder" data-modal-key="${key}" onclick="window.openModalWithRecord('workorder', window.modalRecordCache['${key}'])" style="cursor:pointer;"><strong>${escapeHtml(vendor ? vendor.company : w.vendorId)}</strong><br>${escapeHtml(formatWorkOrderDescription(w.description))}<br>₦${moneyValue(w.amount)}<br>Status: ${escapeHtml(w.status)}</div>`;
    })
    .join("");
}

async function loadPaymentsListings(forceRefresh = false) {
  const container = document.getElementById("console-payments-list");
  let cache = getCache();
  if (forceRefresh || !cache.paymentsLoaded) {
    container.innerHTML = `<p style="text-align:center; font-size:14px; font-weight:700;"><i class="fas fa-spinner fa-spin"></i> Loading payment records...</p>`;
    const payments = await callApi("getPayments", {});
    cache = getCache();
    cache.payments = payments || [];
    cache.paymentsLoaded = true;
    setCache(cache);
  }
  const projectId = getCurrentProjectId();
  const groups = getAllPaymentGroups(projectId);
  if (groups.length === 0) {
    container.innerHTML = `<p style="color:var(--muted); font-style:italic; text-align:center; padding:20px; font-size:14px;">No payment records logged.</p>`;
    return;
  }
  let totalReceived = 0,
    totalOutgoing = 0,
    smallExpenses = 0,
    totalPending = 0,
    totalOutstanding = 0;
  groups.forEach((g) => {
    if (g.direction === "Client Receipt") {
      totalReceived += g.paymentsToDate;
      totalOutstanding += g.balance;
    } else if (g.direction === "Small Expense")
      smallExpenses += g.paymentsToDate;
    else {
      totalOutgoing += g.paymentsToDate;
      totalPending += g.balance;
    }
  });
  const netBalance = roundMoney(
    totalReceived - totalOutgoing - smallExpenses - totalPending,
  );
  const totalsHtml = `<div class="card" style="background:var(--card); border-color:#000; padding:12px;"><div style="display: flex; flex-direction: column; gap: 12px;"><div style="display: flex; justify-content: space-between; align-items: baseline; gap: 8px; min-width: 0;"><span style="font-weight:800; text-transform:uppercase; font-size:13px; flex-shrink:0;">Client Received</span><span style="font-size:18px; font-weight:900; color:var(--success); text-align:right; word-break:break-word;">₦${moneyValue(totalReceived)}</span></div><div style="display: flex; justify-content: space-between; align-items: baseline; gap: 8px; min-width: 0;"><span style="font-weight:800; text-transform:uppercase; font-size:13px; flex-shrink:0;">Outstanding Balance</span><span style="font-size:16px; font-weight:900; color:var(--primary); text-align:right; word-break:break-word;">₦${moneyValue(totalOutstanding)}</span></div><div style="display: flex; justify-content: space-between; align-items: baseline; gap: 8px; min-width: 0;"><span style="font-weight:800; text-transform:uppercase; font-size:13px; flex-shrink:0;">Total Outgoing</span><span style="font-size:18px; font-weight:900; color:var(--danger); text-align:right; word-break:break-word;">₦${moneyValue(totalOutgoing)}</span></div><div style="display: flex; justify-content: space-between; align-items: baseline; gap: 8px; min-width: 0;"><span style="font-weight:800; text-transform:uppercase; font-size:13px; flex-shrink:0;">Pending (Outgoing)</span><span style="font-size:16px; font-weight:900; color:#fd7e14; text-align:right; word-break:break-word;">₦${moneyValue(totalPending)}</span></div><div style="display: flex; justify-content: space-between; align-items: baseline; gap: 8px; min-width: 0;"><span style="font-weight:800; text-transform:uppercase; font-size:13px; flex-shrink:0;">Small Expenses</span><span style="font-size:16px; font-weight:900; text-align:right; word-break:break-word;">₦${moneyValue(smallExpenses)}</span></div><div style="display: flex; justify-content: space-between; align-items: baseline; gap: 8px; min-width: 0; border-top: 1px solid var(--border); padding-top: 8px;"><span style="font-weight:800; text-transform:uppercase; font-size:14px; flex-shrink:0;">Net Balance</span><span style="font-size:18px; font-weight:900; color:${netBalance >= 0 ? "var(--success)" : "var(--danger)"}; text-align:right; word-break:break-word;">₦${moneyValue(netBalance)}</span></div></div></div>`;
  const paymentsHtml = groups
    .map((g) => {
      const incoming = g.direction === "Client Receipt";
      const isSmall = g.direction === "Small Expense";
      const isStaged = !isSmall && g.stages.length > 0;
      const hasBalance = g.balance > 0;
      const canAddStage = isStaged && hasBalance && g.stages.length < 4;
      const stageRows = g.stages
        .map((s, idx) => {
          const key = `payment:${s.paymentId}`;
          window.modalRecordCache = window.modalRecordCache || {};
          window.modalRecordCache[key] = s;
          return `<div style="display:flex; justify-content:space-between; align-items:center; padding:6px 0; border-bottom:1px solid var(--card-light); ${idx === g.stages.length - 1 ? "border-bottom:none;" : ""}"><div style="display:flex; align-items:center; gap:8px; cursor:pointer;" onclick="window.openModalWithRecord('payment', window.modalRecordCache['${key}'])"><span style="font-size:11px; font-weight:900; background:var(--primary); color:#fff; padding:2px 8px; border-radius:4px; text-transform:uppercase;">${s.stage ? "Stage " + escapeHtml(s.stage) : "Full"}</span><span style="font-size:13px; color:var(--muted);">${escapeHtml(s.paymentDate)}</span></div><span style="font-size:14px; font-weight:900; color:${incoming ? "var(--success)" : "var(--danger)"}; cursor:pointer;" onclick="window.openModalWithRecord('payment', window.modalRecordCache['${key}'])">${incoming ? "+" : "-"}₦${moneyValue(s.amount)}</span></div>`;
        })
        .join("");
      const balanceLabel = incoming ? "Outstanding Balance" : "Balance";
      const balanceColor =
        g.balance > 0
          ? incoming
            ? "var(--primary)"
            : "#fd7e14"
          : "var(--success)";
      return `<div class="card" style="background:#fff; border-color:#000; border-left:6px solid ${incoming ? "var(--success)" : isSmall ? "var(--muted)" : "var(--danger)"};"><div style="display:flex; justify-content:space-between; align-items:start; gap:10px; margin-bottom:10px;"><div><strong style="font-size:18px;">${escapeHtml(g.payee || "Payment")}</strong><div style="font-size:12px; color:var(--muted); font-weight:700; margin-top:2px;">${escapeHtml(g.direction)}${g.expenseCategory ? " | " + escapeHtml(g.expenseCategory) : ""}</div></div><span style="font-size:11px; font-weight:900; background:${g.balance <= 0 ? "var(--success)" : isSmall ? "var(--muted)" : "#fd7e14"}; color:#fff; padding:3px 8px; border-radius:4px; text-transform:uppercase;">${g.balance <= 0 ? "Complete" : isSmall ? "Logged" : "Active"}</span></div><div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:10px; padding:8px; background:var(--card-light); border-radius:8px;"><span style="font-weight:700; font-size:13px;">Total Invoice</span><span style="font-size:16px; font-weight:900;">₦${moneyValue(g.totalInvoice)}</span></div>${stageRows ? `<div style="margin-bottom:10px;">${stageRows}</div>` : ""}<div style="display:flex; justify-content:space-between; align-items:baseline; margin-top:8px; padding:8px; background:var(--card-light); border-radius:8px; border:1.5px solid ${g.balance > 0 ? balanceColor : "var(--success)"};"><span style="font-weight:700; font-size:13px;">${balanceLabel}</span><span style="font-size:16px; font-weight:900; color:${balanceColor};">₦${moneyValue(g.balance)}</span></div>${canAddStage ? `<button class="action-btn" style="margin-top:10px; width:auto; padding:8px 16px; font-size:13px; background:var(--primary);" onclick="window.openAddStageModal('${escapeAttr(g.paymentGroupId)}')"><i class="fas fa-plus"></i> Add Stage ${g.stages.length + 1}</button>` : ""}${g.notes ? `<p style="font-size:13px; font-weight:600; margin-top:8px; color:#000;">${escapeHtml(g.notes)}</p>` : ""}</div>`;
    })
    .join("");
  container.innerHTML = totalsHtml + paymentsHtml;
}
window.toggleGroupSelection = toggleGroupSelection;
window.getTakeOffGroups = getTakeOffGroups;
window.openTakeOffGroupModal = openTakeOffGroupModal;
window.openTemplatesModal = openTemplatesModal;
