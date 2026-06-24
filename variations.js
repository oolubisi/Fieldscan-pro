// ===== VARIATIONS PATCH =====
// Append this to the end of app.bundle.js

// Inject into GET_ACTION_BY_STORE
(function(){
  const existing = window.GET_ACTION_BY_STORE || {};
  existing.variations = "getVariations";
  window.GET_ACTION_BY_STORE = existing;
})();

// Inject into MUTATION_MAP
(function(){
  const existing = window.MUTATION_MAP || {};
  existing.saveVariation = { store: "variations", idKey: "variationId", mode: "upsert" };
  existing.updateVariation = { store: "variations", idKey: "variationId", mode: "upsert" };
  existing.deleteVariation = { store: "variations", idKey: "variationId", mode: "delete" };
  window.MUTATION_MAP = existing;
})();

// Re-seed cache from backup for variations
(function seedVariationsBackup(){
  try {
    const raw = localStorage.getItem("fb_getVariations");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const cache = getCache();
        cache.variations = parsed;
        setCache(cache);
      }
    }
  } catch (e) {}
})();

// Hook into preloadAllData
(function(){
  const original = window._originalPreloadAllData || (window._originalPreloadAllData = (async function(){}));
  // We rely on the existing preload loop; variations will be fetched on first console load
})();

// Hook switchConsoleSegment
(function(){
  const original = switchConsoleSegment;
  window.switchConsoleSegment = function(seg) {
    document.querySelectorAll(".console-tab-window").forEach((w) => w.classList.remove("active-view"));
    document.querySelectorAll(".segment-btn").forEach((b) => b.classList.remove("active"));
    document.getElementById(`console-seg-${seg}`).classList.add("active-view");
    document.getElementById(`seg-btn-${seg}`).classList.add("active");
    if (seg === "takeoff") loadTakeOff2Listings();
    if (seg === "progress") loadProgressTimelineFeed();
    if (seg === "snags") loadSnagsListings();
    if (seg === "workorders") loadWorkOrdersListings();
    if (seg === "payments") loadPaymentsListings();
    if (seg === "variations") loadVariationsListings();
    if (seg === "pcr") loadPcrView();
  };
})();

function getNextVariationNumber(projectId) {
  const suffix = (String(projectId).match(/(\d{1,3})\D*$/)?.[1] || "0").padStart(3, "0");
  const prefix = "VAR-" + suffix + "-";
  const cache = getCache();
  const variations = cache.variations || [];
  let max = 0;
  variations.forEach((v) => {
    if (String(v.variationId).startsWith(prefix)) {
      const num = parseInt(String(v.variationId).substring(prefix.length));
      if (!isNaN(num) && num > max) max = num;
    }
  });
  return prefix + String(max + 1).padStart(2, "0");
}

async function loadVariationsListings(forceRefresh = false) {
  const container = document.getElementById("console-variations-list");
  let cache = getCache();
  if (forceRefresh || !cache.variationsLoaded) {
    container.innerHTML = `<p style="text-align:center;padding:15px;"><i class="fas fa-spinner fa-spin"></i> Loading variations...</p>`;
    try {
      const items = await callApi("getVariations", { projectId: getCurrentProjectId() });
      cache = getCache();
      cache.variations = items || [];
      cache.variationsLoaded = true;
      setCache(cache);
    } catch (e) {
      console.warn("loadVariationsListings failed:", e);
    }
  }
  const projectId = getCurrentProjectId();
  const projectVariations = (cache.variations || []).filter((v) => v.projectId === projectId);
  if (!projectVariations.length) {
    container.innerHTML = `<p style="text-align:center;padding:20px;">No variations recorded.</p>`;
    return;
  }
  container.innerHTML = projectVariations
    .map((v) => {
      const key = `variation:${v.variationId}`;
      window.modalRecordCache = window.modalRecordCache || {};
      window.modalRecordCache[key] = v;
      const statusColors = {
        Draft: "var(--muted)",
        Submitted: "#fd7e14",
        Approved: "var(--success)",
        Rejected: "var(--danger)",
      };
      return `<div class="card" style="border-left:6px solid ${statusColors[v.status] || "var(--muted)"}; cursor:pointer;" onclick="window.openVariationModal(window.modalRecordCache['${key}'])" title="Click to edit">
        <div style="display:flex; justify-content:space-between; align-items:start; gap:10px;">
          <div>
            <strong style="font-size:18px;">${escapeHtml(v.variationNumber || v.variationId)}</strong>
            <div style="font-size:13px; font-weight:700; margin-top:2px;">${escapeHtml(v.title)}</div>
            <div style="font-size:12px; color:var(--muted); margin-top:2px;">${escapeHtml(v.date)} · ${escapeHtml(v.status)}${v.approvedBy ? " · By: " + escapeHtml(v.approvedBy) : ""}</div>
          </div>
          <span style="font-size:16px; font-weight:900;">₦${moneyValue(v.total)}</span>
        </div>
        ${v.notes ? `<div style="margin-top:8px; font-size:13px; color:var(--muted);">${escapeHtml(v.notes)}</div>` : ""}
        <div style="display:flex; gap:8px; margin-top:12px; flex-wrap:wrap;" onclick="event.stopPropagation()">
          <button class="action-btn" style="width:auto; padding:6px 12px; font-size:12px; background:var(--card-light); color:var(--text);" onclick="window.openVariationModal(window.modalRecordCache['${key}'])">
            <i class="fas fa-edit"></i> Edit
          </button>
          <button class="action-btn" style="width:auto; padding:6px 12px; font-size:12px; background:var(--primary);" onclick="window.previewVariationReport('${escapeAttr(v.variationId)}')">
            <i class="fas fa-file-alt"></i> Report
          </button>
        </div>
      </div>`;
    })
    .join("");
}

async function loadTakeOff2Listings(forceRefresh = false) {
  const container = document.getElementById("console-takeoff-list");
  if (!container) return;
  let cache = getCache();
  if (forceRefresh || !cache.takeOffsLoaded) {
    container.innerHTML = `<p style="text-align:center;padding:15px;"><i class="fas fa-spinner fa-spin"></i> Loading take-offs...</p>`;
    try {
      const items = await callApi("getTakeOffs", { projectId: getCurrentProjectId() });
      cache = getCache();
      cache.takeOffs = items || [];
      cache.takeOffsLoaded = true;
      setCache(cache);
    } catch (e) {
      console.warn("loadTakeOff2Listings failed:", e);
    }
  }
  const projectId = getCurrentProjectId();
  const projectTakeOffs = (cache.takeOffs || []).filter((t) => t.projectId === projectId);
  if (!projectTakeOffs.length) {
    container.innerHTML = `<p style="text-align:center;padding:20px;">No take-offs recorded.</p>`;
    return;
  }
  container.innerHTML = `<div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">` + projectTakeOffs
    .map((t) => {
      const key = `takeoff:${t.takeOffId}`;
      window.modalRecordCache = window.modalRecordCache || {};
      window.modalRecordCache[key] = t;
      let lineItems = [];
      try {
        lineItems = JSON.parse(t.lineItems || "[]");
      } catch (e) {}
      return `<div class="card" style="cursor:pointer; text-align:center; display:flex; flex-direction:column; justify-content:center; min-height:80px;" onclick="window.openTakeOff2Modal(window.modalRecordCache['${key}'])" title="Click to edit">
        <strong style="font-size:14px;">${escapeHtml(t.title)}</strong>
        <span style="font-size:11px; color:var(--muted); margin-top:4px;">${lineItems.length} item${lineItems.length !== 1 ? "s" : ""}</span>
      </div>`;
    })
    .join("") + `</div>`;
}

// ===== SIMPLIFIED TAKE-OFF MODAL (for Take-Off tab) =====
function openTakeOff2Modal(editData = null) {
  const body = document.getElementById("modalBody");
  const submit = document.getElementById("modalSubmit");
  const title = document.getElementById("modalTitle");
  const overlay = document.getElementById("modalOverlay");
  const isEdit = !!editData;
  overlay.style.display = "flex";
  body.innerHTML = "";
  submit.style.display = "none"; // Hide default submit; buttons are inside body

  const labelStyle = 'style="display:block; font-weight:800; margin-top:12px; margin-bottom:4px;"';
  const largeInput = 'style="width:100%; padding:12px; font-size:16px;"';

  const projectId = getCurrentProjectId();

  let lineItems = [];
  if (isEdit && editData.lineItems) {
    try {
      const parsed = JSON.parse(editData.lineItems);
      if (Array.isArray(parsed)) lineItems = parsed;
    } catch (e) {
      lineItems = [];
    }
  }

  // Build line items HTML (only Description, Qty, Unit — no Rate, no Amount)
  const lineItemsHtml = lineItems
    .map(
      (item) =>
        `<tr class="to-line-row">
      <td style="padding:4px; border-bottom:1px solid var(--border);"><input class="to-line-desc" value="${escapeAttr(item.description || "")}" placeholder="Description" style="width:100%; padding:8px; font-size:14px; border:1.5px solid var(--border); border-radius:8px;"></td>
      <td style="padding:4px; border-bottom:1px solid var(--border); width:70px;"><input class="to-line-qty" type="number" value="${escapeAttr(item.qty || "")}" min="0" step="0.01" style="width:100%; padding:8px; font-size:14px; border:1.5px solid var(--border); border-radius:8px; text-align:right;"></td>
      <td style="padding:4px; border-bottom:1px solid var(--border); width:80px;"><input class="to-line-unit" value="${escapeAttr(item.unit || "pcs")}" placeholder="Unit" style="width:100%; padding:8px; font-size:14px; border:1.5px solid var(--border); border-radius:8px; text-align:center;"></td>
      <td style="padding:4px; border-bottom:1px solid var(--border); width:30px; text-align:center;"><button onclick="this.closest('tr').remove();" style="background:var(--danger); color:white; border:none; border-radius:6px; cursor:pointer; width:28px; height:28px; font-size:14px;">&times;</button></td>
    </tr>`,
    )
    .join("");

  title.innerText = isEdit ? "Edit Take-Off" : "New Take-Off";

  // Delete + Save on same line
  const actionButtons = isEdit
    ? `<div style="display:flex; gap:10px; margin-top:16px;">
        <button class="action-btn" id="to_delete_btn" style="background:var(--danger); flex:1;"><i class="fas fa-trash"></i> Delete</button>
        <button class="action-btn" id="to_save_btn" style="flex:1;"><i class="fas fa-save"></i> Save</button>
      </div>`
    : `<button class="action-btn" id="to_save_btn" style="margin-top:16px; width:100%;"><i class="fas fa-save"></i> Save</button>`;

  body.innerHTML = `
    <input type="hidden" id="to_id" value="${escapeAttr(isEdit ? editData.variationId : "")}">

    <label ${labelStyle}>Trade</label>
    <input id="to_title" value="${escapeAttr(isEdit ? editData.title : "")}" placeholder="e.g. Tiling / Flooring" ${largeInput}>

    <label ${labelStyle}>Line Items</label>
    <table style="width:100%; font-size:13px; border-collapse:collapse; margin-bottom:10px;">
      <thead>
        <tr style="background:#000; color:#fff;">
          <th style="padding:6px; text-align:left; font-size:10px; text-transform:uppercase;">Description</th>
          <th style="padding:6px; text-align:right; font-size:10px; text-transform:uppercase; width:70px;">Qty</th>
          <th style="padding:6px; text-align:center; font-size:10px; text-transform:uppercase; width:80px;">Unit</th>
          <th style="width:30px;"></th>
        </tr>
      </thead>
      <tbody id="to_line_items_body">${lineItemsHtml}</tbody>
    </table>
    <button class="action-btn" style="width:auto; padding:6px 12px; font-size:12px; background:var(--card-light); color:var(--text);" onclick="window.addTakeOff2LineItem()">
      <i class="fas fa-plus"></i> Add Line Item
    </button>

    <label ${labelStyle}>Notes</label>
    <textarea id="to_notes" rows="3" ${largeInput}>${escapeHtml(isEdit ? editData.notes : "")}</textarea>

    ${actionButtons}
  `;

  // Bind save handler
  document.getElementById("to_save_btn").onclick = buildTakeOff2SaveHandler(isEdit, editData, projectId);

  // Bind delete handler (edit mode only)
  if (isEdit) {
    document.getElementById("to_delete_btn").onclick = () => {
      if (confirm("Delete this take-off?")) {
        callApi("deleteTakeOff", { takeOffId: editData.takeOffId })
          .then(() => {
            closeModal();
            loadTakeOff2Listings(true);
          })
          .catch(() => {});
      }
    };
  }
}

function buildTakeOff2SaveHandler(isEdit, editData, projectId) {
  return function() {
    const title = document.getElementById("to_title").value.trim();
    if (!title) {
      alert("Enter a trade name");
      return;
    }

    const rows = document.querySelectorAll("#to_line_items_body tr");
    const lineItems = [];
    rows.forEach((row) => {
      const desc = row.querySelector(".to-line-desc").value.trim();
      if (desc) {
        lineItems.push({
          description: desc,
          qty: Number(row.querySelector(".to-line-qty").value) || 0,
          unit: row.querySelector(".to-line-unit").value.trim() || "pcs",
        });
      }
    });

    if (!lineItems.length) {
      alert("Add at least one line item");
      return;
    }

    const submit = document.getElementById("to_save_btn");
    submit.disabled = true;
    submit.innerText = "Saving...";

    const payload = {
      projectId: projectId,
      title: title,
      lineItems: lineItems,
      notes: document.getElementById("to_notes").value,
      date: todayFormatted(),
    };
    if (isEdit) {
      payload.takeOffId = editData.takeOffId;
    }

    callApi(isEdit ? "updateTakeOff" : "saveTakeOff", payload)
      .then(() => {
        closeModal();
        loadTakeOff2Listings(true);
      })
      .catch((err) => {
        submit.disabled = false;
        submit.innerText = "Save";
        alert("Save failed: " + (err?.message || "Unknown error"));
      });
  };
}

function addTakeOff2LineItem() {
  const tbody = document.getElementById("to_line_items_body");
  if (!tbody) return;
  const row = document.createElement("tr");
  row.className = "to-line-row";
  row.innerHTML = `<td style="padding:4px; border-bottom:1px solid var(--border);"><input class="to-line-desc" value="" placeholder="Description" style="width:100%; padding:8px; font-size:14px; border:1.5px solid var(--border); border-radius:8px;"></td>
    <td style="padding:4px; border-bottom:1px solid var(--border); width:70px;"><input class="to-line-qty" type="number" value="" min="0" step="0.01" style="width:100%; padding:8px; font-size:14px; border:1.5px solid var(--border); border-radius:8px; text-align:right;"></td>
    <td style="padding:4px; border-bottom:1px solid var(--border); width:80px;"><input class="to-line-unit" value="pcs" placeholder="Unit" style="width:100%; padding:8px; font-size:14px; border:1.5px solid var(--border); border-radius:8px; text-align:center;"></td>
    <td style="padding:4px; border-bottom:1px solid var(--border); width:30px; text-align:center;"><button onclick="this.closest('tr').remove();" style="background:var(--danger); color:white; border:none; border-radius:6px; cursor:pointer; width:28px; height:28px; font-size:14px;">&times;</button></td>`;
  tbody.appendChild(row);
}

function openVariationModal(editData = null) {
  const body = document.getElementById("modalBody");
  const submit = document.getElementById("modalSubmit");
  const title = document.getElementById("modalTitle");
  const overlay = document.getElementById("modalOverlay");
  const isEdit = !!editData;
  overlay.style.display = "flex";
  body.innerHTML = "";
  submit.disabled = false;
  submit.innerText = "Save";
  submit.style.display = "block";
  currentModalFiles = [];

  const labelStyle = 'style="display:block; font-weight:800; margin-top:12px; margin-bottom:4px;"';
  const largeInput = 'style="width:100%; padding:12px; font-size:16px;"';

  const projectId = getCurrentProjectId();
  const nextNumber = isEdit ? editData.variationNumber : getNextVariationNumber(projectId);

  let lineItems = [];
  if (isEdit && editData.lineItems) {
    try {
      const parsed = JSON.parse(editData.lineItems);
      if (Array.isArray(parsed)) lineItems = parsed;
    } catch (e) {
      lineItems = [];
    }
  }

  const lineItemsHtml = lineItems
    .map(
      (item) =>
        `<tr class="var-line-row">
      <td style="padding:4px; border-bottom:1px solid var(--border);"><input class="var-line-desc" value="${escapeAttr(item.description || "")}" placeholder="Description" style="width:100%; padding:8px; font-size:14px; border:1.5px solid var(--border); border-radius:8px;"></td>
      <td style="padding:4px; border-bottom:1px solid var(--border); width:60px;"><input class="var-line-qty" type="number" value="${escapeAttr(item.qty || "")}" min="0" step="0.01" style="width:100%; padding:8px; font-size:14px; border:1.5px solid var(--border); border-radius:8px; text-align:right;" oninput="window.recalcVariationTotals()"></td>
      <td style="padding:4px; border-bottom:1px solid var(--border); width:80px;"><input class="var-line-rate" type="number" value="${escapeAttr(item.rate || "")}" min="0" step="0.01" style="width:100%; padding:8px; font-size:14px; border:1.5px solid var(--border); border-radius:8px; text-align:right;" oninput="window.recalcVariationTotals()"></td>
      <td style="padding:4px; border-bottom:1px solid var(--border); width:90px;"><input class="var-line-amt" type="number" value="${escapeAttr(item.amount || 0)}" disabled style="width:100%; padding:8px; font-size:14px; border:1.5px solid var(--border); border-radius:8px; text-align:right; background:#f5f5f5;"></td>
      <td style="padding:4px; border-bottom:1px solid var(--border); width:30px; text-align:center;"><button onclick="this.closest('tr').remove(); window.recalcVariationTotals();" style="background:var(--danger); color:white; border:none; border-radius:6px; cursor:pointer; width:28px; height:28px; font-size:14px;">×</button></td>
    </tr>`,
    )
    .join("");

  title.innerText = isEdit ? "Edit Variation" : "New Variation";
  body.innerHTML = `
    <label ${labelStyle}>Variation Number</label>
    <input value="${escapeAttr(nextNumber)}" disabled style="${largeInput} background:#f0f0f0;">
    <input type="hidden" id="var_id" value="${escapeAttr(isEdit ? editData.variationId : "")}">

    <label ${labelStyle}>Date</label>
    <input id="var_date" type="text" value="${escapeAttr(isEdit ? editData.date : todayFormatted())}" ${largeInput}>

    <label ${labelStyle}>Title</label>
    <input id="var_title" value="${escapeAttr(isEdit ? editData.title : "")}" placeholder="e.g. Additional Balcony Tiling" ${largeInput}>

    <label ${labelStyle}>Status</label>
    <select id="var_status" ${largeInput}>
      <option value="Draft" ${isEdit && editData.status === "Draft" ? "selected" : ""}>Draft</option>
      <option value="Submitted" ${isEdit && editData.status === "Submitted" ? "selected" : ""}>Submitted</option>
      <option value="Approved" ${isEdit && editData.status === "Approved" ? "selected" : ""}>Approved</option>
      <option value="Rejected" ${isEdit && editData.status === "Rejected" ? "selected" : ""}>Rejected</option>
    </select>

    <label ${labelStyle}>Line Items</label>
    <table style="width:100%; font-size:13px; border-collapse:collapse; margin-bottom:10px;">
      <thead>
        <tr style="background:#000; color:#fff;">
          <th style="padding:6px; text-align:left; font-size:10px; text-transform:uppercase;">Description</th>
          <th style="padding:6px; text-align:right; font-size:10px; text-transform:uppercase; width:60px;">Qty</th>
          <th style="padding:6px; text-align:right; font-size:10px; text-transform:uppercase; width:80px;">Rate (₦)</th>
          <th style="padding:6px; text-align:right; font-size:10px; text-transform:uppercase; width:90px;">Amount (₦)</th>
          <th style="width:30px;"></th>
        </tr>
      </thead>
      <tbody id="var_line_items_body">${lineItemsHtml}</tbody>
    </table>
    <button class="action-btn" style="width:auto; padding:6px 12px; font-size:12px; background:var(--card-light); color:var(--text);" onclick="window.addVariationLineItem()">
      <i class="fas fa-plus"></i> Add Line Item
    </button>

    <div style="margin-top:16px; padding:12px; background:var(--card-light); border-radius:12px; border:1.5px solid var(--border);">
      <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
        <span style="font-weight:700; font-size:13px;">Subtotal</span>
        <span id="var_subtotal_display" style="font-weight:700; font-size:14px;">₦0.00</span>
      </div>
      <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
        <span style="font-weight:700; font-size:13px;">VAT (<span id="var_vat_rate_display">7.5%</span>)</span>
        <span id="var_vat_display" style="font-weight:700; font-size:14px;">₦0.00</span>
      </div>
      <div style="display:flex; justify-content:space-between; padding-top:8px; border-top:2px solid var(--border);">
        <span style="font-weight:900; font-size:15px;">Total</span>
        <span id="var_total_display" style="font-weight:900; font-size:18px; color:var(--primary);">₦0.00</span>
      </div>
    </div>

    <label ${labelStyle}>Notes</label>
    <textarea id="var_notes" rows="2" ${largeInput}>${escapeHtml(isEdit ? editData.notes : "")}</textarea>

    <label ${labelStyle}>Approved By</label>
    <input id="var_approved_by" value="${escapeAttr(isEdit ? editData.approvedBy : "")}" placeholder="Name of approver" ${largeInput}>

    ${isEdit ? `<button class="action-btn" id="var_delete_btn" style="background:var(--danger); margin-top:10px;">Delete Variation</button>` : ""}
  `;

  if (isEdit) {
    document.getElementById("var_delete_btn").onclick = () => {
      if (confirm("Delete this variation?")) {
        callApi("deleteVariation", { variationId: editData.variationId })
          .then(() => {
            closeModal();
            loadVariationsListings(true);
            refreshMasterDashboard();
            loadProjectConsoleHub(projectId);
          })
          .catch(() => {});
      }
    };
  }

  recalcVariationTotals();

  submit.onclick = () => {
    const title = document.getElementById("var_title").value.trim();
    if (!title) {
      alert("Enter a variation title");
      return;
    }

    const rows = document.querySelectorAll("#var_line_items_body tr");
    const lineItems = [];
    rows.forEach((row) => {
      const desc = row.querySelector(".var-line-desc").value.trim();
      if (desc) {
        const qty = Number(row.querySelector(".var-line-qty").value) || 0;
        const rate = Number(row.querySelector(".var-line-rate").value) || 0;
        lineItems.push({
          description: desc,
          qty: qty,
          rate: rate,
          amount: roundMoney(qty * rate),
        });
      }
    });

    if (!lineItems.length) {
      alert("Add at least one line item");
      return;
    }

    const subtotal = lineItems.reduce((s, i) => s + i.amount, 0);
    const vat = calculateTax(subtotal, "VAT");
    const total = roundMoney(subtotal + vat);

    submit.disabled = true;
    submit.innerText = "Saving...";

    const payload = {
      variationId: isEdit ? editData.variationId : getNextVariationNumber(projectId),
      projectId: projectId,
      variationNumber: isEdit ? editData.variationNumber : getNextVariationNumber(projectId),
      date: document.getElementById("var_date").value,
      title: title,
      status: document.getElementById("var_status").value,
      lineItems: lineItems,
      subtotal: subtotal,
      vat: vat,
      total: total,
      notes: document.getElementById("var_notes").value,
      approvedBy: document.getElementById("var_approved_by").value,
    };

    callApi(isEdit ? "updateVariation" : "saveVariation", payload)
      .then(() => {
        closeModal();
        loadVariationsListings(true);
        if (payload.status === "Approved" || (isEdit && editData.status === "Approved")) {
          refreshMasterDashboard();
          loadProjectConsoleHub(projectId);
        }
      })
      .catch(resetSubmitOnError(submit));
  };
}

function addVariationLineItem() {
  const tbody = document.getElementById("var_line_items_body");
  if (!tbody) return;
  const row = document.createElement("tr");
  row.className = "var-line-row";
  row.innerHTML = `<td style="padding:4px; border-bottom:1px solid var(--border);"><input class="var-line-desc" value="" placeholder="Description" style="width:100%; padding:8px; font-size:14px; border:1.5px solid var(--border); border-radius:8px;"></td>
    <td style="padding:4px; border-bottom:1px solid var(--border); width:60px;"><input class="var-line-qty" type="number" value="" min="0" step="0.01" style="width:100%; padding:8px; font-size:14px; border:1.5px solid var(--border); border-radius:8px; text-align:right;" oninput="window.recalcVariationTotals()"></td>
    <td style="padding:4px; border-bottom:1px solid var(--border); width:80px;"><input class="var-line-rate" type="number" value="" min="0" step="0.01" style="width:100%; padding:8px; font-size:14px; border:1.5px solid var(--border); border-radius:8px; text-align:right;" oninput="window.recalcVariationTotals()"></td>
    <td style="padding:4px; border-bottom:1px solid var(--border); width:90px;"><input class="var-line-amt" type="number" value="0" disabled style="width:100%; padding:8px; font-size:14px; border:1.5px solid var(--border); border-radius:8px; text-align:right; background:#f5f5f5;"></td>
    <td style="padding:4px; border-bottom:1px solid var(--border); width:30px; text-align:center;"><button onclick="this.closest('tr').remove(); window.recalcVariationTotals();" style="background:var(--danger); color:white; border:none; border-radius:6px; cursor:pointer; width:28px; height:28px; font-size:14px;">×</button></td>`;
  tbody.appendChild(row);
}

function recalcVariationTotals() {
  const rows = document.querySelectorAll("#var_line_items_body tr");
  let subtotal = 0;
  rows.forEach((row) => {
    const qty = Number(row.querySelector(".var-line-qty").value) || 0;
    const rate = Number(row.querySelector(".var-line-rate").value) || 0;
    const amt = roundMoney(qty * rate);
    row.querySelector(".var-line-amt").value = amt;
    subtotal += amt;
  });
  subtotal = roundMoney(subtotal);
  const vat = calculateTax(subtotal, "VAT");
  const total = roundMoney(subtotal + vat);

  const subEl = document.getElementById("var_subtotal_display");
  const vatEl = document.getElementById("var_vat_display");
  const totalEl = document.getElementById("var_total_display");
  const vatRateEl = document.getElementById("var_vat_rate_display");

  if (subEl) subEl.innerText = "₦" + moneyValue(subtotal);
  if (vatEl) vatEl.innerText = "₦" + moneyValue(vat);
  if (totalEl) totalEl.innerText = "₦" + moneyValue(total);
  if (vatRateEl) vatRateEl.innerText = formatTaxRate(getTaxRate("VAT"));
}

function renderVariationReport(variation, project, settings) {
  if (settings && settings.data) settings = settings.data;

  let lineItems = [];
  try {
    lineItems = JSON.parse(variation.lineItems || "[]");
  } catch (e) {
    lineItems = [];
  }

  const itemRows = lineItems
    .map(
      (item) =>
        `<tr>
      <td style="border-bottom:1px solid #adb5bd; padding:8px; font-size:12px; vertical-align:top;">${escapeHtml(item.description)}</td>
      <td style="border-bottom:1px solid #adb5bd; padding:8px; font-size:12px; text-align:right; vertical-align:top;">${escapeHtml(String(item.qty))}</td>
      <td style="border-bottom:1px solid #adb5bd; padding:8px; font-size:12px; text-align:right; vertical-align:top;">₦${moneyValue(item.rate)}</td>
      <td style="border-bottom:1px solid #adb5bd; padding:8px; font-size:12px; text-align:right; vertical-align:top; font-weight:700;">₦${moneyValue(item.amount)}</td>
    </tr>`,
    )
    .join("");

  const subtotal = Number(variation.subtotal) || 0;
  const vat = Number(variation.vat) || 0;
  const total = Number(variation.total) || 0;

  const signName = settings?.Name_Signed ? escapeHtml(settings.Name_Signed) : "";
  const signImg = settings?.Sign_Signed ? getDirectImageUrl(settings.Sign_Signed) : "";
  const includeClientSig = document.getElementById("var-rep-client-sig")?.checked;

  let clientSigBlock = "";
  if (includeClientSig) {
    clientSigBlock = `<div style="margin-top: 32px; page-break-inside: avoid; text-align: left; flex:1;">
      <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; margin-bottom: 12px; color: #495057;">Client Signatory</div>
      <div style="display: inline-block; text-align: center;">
        <div style="border-bottom: 1.5px solid #000; width: 200px; margin: 0 auto 4px auto;"></div>
        <div style="font-size: 12px; font-weight: 700;">_________________________</div>
      </div>
    </div>`;
  }

  return `<div class="report-page-wrapper">
    <div class="report-content">
      ${generateReportHeader("Variation Order", project, settings)}
      <div style="margin-bottom: 16px; font-size: 12px; line-height: 1.6;">
        <div><strong>Variation No:</strong> ${escapeHtml(variation.variationNumber || variation.variationId)}</div>
        <div><strong>Date:</strong> ${escapeHtml(variation.date)}</div>
        <div><strong>Title:</strong> ${escapeHtml(variation.title)}</div>
        <div><strong>Status:</strong> ${escapeHtml(variation.status)}${variation.approvedBy ? " · Approved by: " + escapeHtml(variation.approvedBy) : ""}</div>
      </div>
      <table class="report-table" style="width:100%; border-collapse: collapse; font-size:12px; margin-bottom: 16px;">
        <thead>
          <tr>
            <th style="background:#000; color:#fff; text-align:left; padding:8px; font-size:10px; text-transform:uppercase;">Description</th>
            <th style="background:#000; color:#fff; text-align:right; padding:8px; font-size:10px; text-transform:uppercase; width:60px;">Qty</th>
            <th style="background:#000; color:#fff; text-align:right; padding:8px; font-size:10px; text-transform:uppercase; width:90px;">Rate (₦)</th>
            <th style="background:#000; color:#fff; text-align:right; padding:8px; font-size:10px; text-transform:uppercase; width:90px;">Amount (₦)</th>
          </tr>
        </thead>
        <tbody>
          ${itemRows || '<tr><td colspan="4" style="padding:20px; text-align:center; color:#495057;">No line items</td></tr>'}
          <tr style="background:#e9ecef; font-weight:900;">
            <td colspan="3" style="border-bottom:1px solid #adb5bd; padding:8px; font-size:12px; text-align:right;"><strong>Subtotal</strong></td>
            <td style="border-bottom:1px solid #adb5bd; padding:8px; font-size:12px; text-align:right;">₦${moneyValue(subtotal)}</td>
          </tr>
          <tr style="background:#e9ecef;">
            <td colspan="3" style="border-bottom:1px solid #adb5bd; padding:8px; font-size:12px; text-align:right;"><strong>VAT (${formatTaxRate(getTaxRate("VAT"))})</strong></td>
            <td style="border-bottom:1px solid #adb5bd; padding:8px; font-size:12px; text-align:right;">₦${moneyValue(vat)}</td>
          </tr>
          <tr style="background:#e9ecef; font-weight:900;">
            <td colspan="3" style="border-bottom:2px solid #000; padding:8px; font-size:12px; text-align:right;"><strong>TOTAL</strong></td>
            <td style="border-bottom:2px solid #000; padding:8px; font-size:12px; text-align:right; font-weight:900;">₦${moneyValue(total)}</td>
          </tr>
        </tbody>
      </table>
      ${variation.notes ? `<div style="margin-bottom: 16px; padding: 12px; background: #f8f9fa; border-radius: 8px; border: 1px solid #adb5bd;"><strong style="font-size: 12px; text-transform: uppercase;">Notes</strong><p style="font-size: 12px; margin-top: 4px; line-height: 1.5;">${escapeHtml(variation.notes)}</p></div>` : ""}
      <div style="display:flex; gap:24px; flex-wrap:wrap;">
        <div style="margin-top: 32px; page-break-inside: avoid; text-align: left; flex:1;">
          <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; margin-bottom: 12px; color: #495057;">Contractor Signatory</div>
          <div style="display: inline-block; text-align: center;">
            ${signImg ? `<div style="margin-bottom: 4px;"><img src="${escapeAttr(signImg)}" style="max-height:50px; max-width:150px; object-fit:contain;" onerror="this.style.display='none'"></div>` : ""}
            <div style="border-bottom: 1.5px solid #000; width: 200px; margin: 0 auto 4px auto;"></div>
            <div style="font-size: 12px; font-weight: 700;">${signName || "_________________________"}</div>
          </div>
        </div>
        ${clientSigBlock}
      </div>
    </div>
    ${generateReportFooter()}
  </div>`;
}

async function previewVariationReport(variationId) {
  const cache = getCache();
  const projectId = getCurrentProjectId();
  const project = cache.projects.find((p) => p.projectId === projectId);
  const variation = (cache.variations || []).find((v) => v.variationId === variationId);
  if (!variation) return;

  if (!cache.settings || !cache.settings.VAT) {
    try {
      const res = await callApi("getSettings", {});
      cache.settings = res || cache.settings || {};
      setCache(cache);
    } catch (e) {}
  }

  const body = document.getElementById("modalBody");
  const submit = document.getElementById("modalSubmit");
  const title = document.getElementById("modalTitle");
  const overlay = document.getElementById("modalOverlay");

  title.innerText = "Variation Report: " + variation.variationNumber;
  overlay.style.display = "flex";

  body.innerHTML = `
    <label style="display:flex; align-items:center; gap:8px; margin-bottom:12px; font-weight:700; cursor:pointer;">
      <input type="checkbox" id="var-rep-client-sig" style="width:auto;" onchange="window.regenerateVariationPreview('${escapeAttr(variationId)}')">
      Include client signature line
    </label>
    <div id="var-report-preview" style="max-height:60vh; overflow-y:auto; border:1px solid var(--border); border-radius:8px;">
      ${renderVariationReport(variation, project, cache.settings || {})}
    </div>
  `;

  submit.style.display = "block";
  submit.innerText = "Save PDF";
  submit.onclick = async () => {
    submit.disabled = true;
    submit.innerText = "Generating...";
    const html = renderVariationReport(variation, project, cache.settings || {});
    const printContainer = document.getElementById("report-print-container");
    if (printContainer) printContainer.innerHTML = html;

    const pdf = await generateReportPDF("portrait");
    if (pdf) {
      pdf.save(`Variation_${variation.variationNumber || variationId}.pdf`);
    }
    submit.disabled = false;
    submit.innerText = "Save PDF";
  };
}

function regenerateVariationPreview(variationId) {
  const cache = getCache();
  const projectId = getCurrentProjectId();
  const project = cache.projects.find((p) => p.projectId === projectId);
  const variation = (cache.variations || []).find((v) => v.variationId === variationId);
  if (!variation) return;
  const preview = document.getElementById("var-report-preview");
  if (preview) preview.innerHTML = renderVariationReport(variation, project, cache.settings || {});
}

async function loadPcrView() {
  const projectId = getCurrentProjectId();
  const cache = getCache();

  if (!cache.variationsLoaded) {
    try {
      const variations = await callApi("getVariations", { projectId });
      cache.variations = variations || [];
      cache.variationsLoaded = true;
      setCache(cache);
    } catch (e) {}
  }

  const projectVariations = (cache.variations || []).filter((v) => v.projectId === projectId && v.status === "Approved");
  const varContainer = document.getElementById("pcr-variations-list");
  if (!varContainer) return;

  if (!projectVariations.length) {
    varContainer.innerHTML = '<p style="color:var(--muted); font-size:13px; font-style:italic;">No approved variations.</p>';
  } else {
    varContainer.innerHTML = projectVariations
      .map((v) => {
        let lineItems = [];
        try {
          lineItems = JSON.parse(v.lineItems || "[]");
        } catch (e) {}
        return `<div style="padding:10px; background:var(--card-light); border-radius:8px; margin-bottom:8px; border:1px solid var(--border);">
          <div style="display:flex; justify-content:space-between; align-items:baseline;">
            <strong style="font-size:14px;">${escapeHtml(v.variationNumber || v.variationId)}</strong>
            <span style="font-size:14px; font-weight:700;">₦${moneyValue(v.total)}</span>
          </div>
          <div style="font-size:12px; color:var(--muted); margin-top:2px;">${escapeHtml(v.title)} · ${escapeHtml(v.date)}</div>
          ${lineItems.length ? `<div style="margin-top:6px; font-size:12px; line-height:1.5;">
            ${lineItems.map((i) => `• ${escapeHtml(i.description)} (${i.qty} × ₦${moneyValue(i.rate)})`).join("<br>")}
          </div>` : ""}
        </div>`;
      })
      .join("");
  }
}

window.openVariationModal = openVariationModal;
window.addVariationLineItem = addVariationLineItem;
window.recalcVariationTotals = recalcVariationTotals;
window.previewVariationReport = previewVariationReport;
window.regenerateVariationPreview = regenerateVariationPreview;
window.loadPcrView = loadPcrView;
window.loadTakeOff2Listings = loadTakeOff2Listings;
window.openTakeOff2Modal = openTakeOff2Modal;
window.addTakeOff2LineItem = addTakeOff2LineItem;

  // Pre-load all data lists in the background so reports and dropdowns work immediately