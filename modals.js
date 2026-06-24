// ===== modals.js =====
let currentModalFiles = [];
let currentAvatarPhoto = "";
let modalRecordCache = {};

function resetSubmitOnError(submit) {
  return (err) => {
    submit.disabled = false;
    submit.innerText = "Save";
  };
}

function openModalWithRecord(type, record) {
  if (record) {
    const idField = {
      project: "projectId",
      takeoff_item: "itemId",
      workorder: "workOrderId",
      payment: "paymentId",
      vendor: "vendorId",
      snag: "snagId",
    }[type];
    const cacheKey = `${type}:${record[idField]}`;
    modalRecordCache[cacheKey] = record;
  }
  return openModal(type, record);
}

function populateModalInlineImageGalleryPreviews(containerId) {
  const box = document.getElementById(containerId);
  if (!box) return;
  if (!currentModalFiles.length) {
    box.innerHTML = "";
    box.style.display = "none";
    return;
  }
  box.style.display = "flex";
  box.innerHTML = currentModalFiles
    .map((url, idx) => {
      const src = url.startsWith("data:") ? url : getDirectImageUrl(url);
      return `<div style="position:relative; width:60px; height:60px;"><img src="${src}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;border:1px solid #000;"><div onclick="window.removeAttachmentByIndex(${idx}, '${containerId}')" style="position:absolute; top:-6px; right:-6px; background:red; color:white; border-radius:50%; width:20px; height:20px; text-align:center; line-height:18px; cursor:pointer;">&times;</div></div>`;
    })
    .join("");
}

function removeAttachmentByIndex(idx, containerId) {
  currentModalFiles.splice(idx, 1);
  populateModalInlineImageGalleryPreviews(containerId);
}

function processIncomingMultiAttachments(files, previewId) {
  if (!files.length) return;
  Array.from(files).forEach((file) => {
    const reader = new FileReader();
    reader.onload = async (ev) => {
      let data = ev.target.result;
      try {
        if (!file.type.includes("pdf")) {
          data = await compressImageToTargetLimit(data, 190000);
        } else {
          data = await compressPdfToTargetLimit(data, 300000);
        }
        currentModalFiles.push(data);
        populateModalInlineImageGalleryPreviews(previewId);
      } catch (err) {
        alert("⚠️ " + (err.message || "Failed to process file."));
      }
    };
    reader.readAsDataURL(file);
  });
}

function clearVendorAvatarPhoto() {
  currentAvatarPhoto = "";
  const img = document.getElementById("passport_frame_view");
  if (img)
    img.src =
      "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%3E%3Cpath%20fill%3D%22%23666%22%20d%3D%22M12%2012c2.21%200%204-1.79%204-4s-1.79-4-4-4-4%201.79-4%204%201.79%204%204%204zm0%202c-2.67%200-8%201.34-8%204v2h16v-2c0-2.66-5.33-4-8-4z%22%2F%3E%3C%2Fsvg%3E";
  const btn = document.getElementById("v_pass_remove");
  if (btn) btn.style.display = "none";
}

function generateFrontendPreviewId(type) {
  const cache = getCache();
  const yy = new Date().getFullYear().toString().slice(-2);
  const prefix = type === "project" ? `PRJ/${yy}/` : `WKO/${yy}/`;
  const dataset = type === "project" ? cache.projects : cache.workorders;
  let max = 0;
  (dataset || []).forEach((item) => {
    const id = String(
      item[type === "project" ? "projectId" : "workOrderId"] || "",
    );
    if (id.startsWith(prefix)) {
      const num = parseInt(id.substring(prefix.length));
      if (!isNaN(num) && num > max) max = num;
    }
  });
  return prefix + String(max + 1).padStart(3, "0");
}

function closeModal() {
  document.getElementById("modalOverlay").style.display = "none";
  // Restore default submit button in case a custom modal replaced it
  const foot = document.getElementById("modalFoot");
  if (foot) {
    foot.innerHTML = '<button id="modalSubmit" class="action-btn">Save</button>';
  }
}

async function openModal(type, editData = null) {
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
  // Restore default foot in case a previous custom modal changed it
  const foot = document.getElementById("modalFoot");
  if (foot && foot.innerHTML.indexOf('id="modalSubmit"') === -1) {
    foot.innerHTML = '<button id="modalSubmit" class="action-btn">Save</button>';
  }
  currentModalFiles = [];
  currentAvatarPhoto = "";
  const labelStyle =
    'style="display:block; font-weight:800; margin-top:12px; margin-bottom:4px;"';
  const largeInput = 'style="width:100%; padding:12px; font-size:16px;"';

  if (type === "project") {
    title.innerText = isEdit ? "Edit Project" : "New Project";
    body.innerHTML = `<label ${labelStyle}>Project ID</label><input value="${escapeAttr(isEdit ? editData.projectId : generateFrontendPreviewId("project"))}" disabled style="${largeInput} background:#f0f0f0;"><label ${labelStyle}>Client Name</label><input id="p_client" value="${escapeAttr(isEdit ? editData.clientName : "")}" ${largeInput}><label ${labelStyle}>Site Location</label><input id="p_loc" value="${escapeAttr(isEdit ? editData.siteLocation : "")}" ${largeInput}><label ${labelStyle}>Client Phone (11 digits)</label><input id="p_phone" type="tel" maxlength="11" oninput="this.value=this.value.replace(/[^0-9]/g,'')" value="${escapeAttr(isEdit ? editData.clientPhone : "")}" ${largeInput}><label ${labelStyle}>Client Email</label><input id="p_email" type="email" value="${escapeAttr(isEdit ? editData.clientEmail : "")}" ${largeInput}><label ${labelStyle}>Status</label><select id="p_status" ${largeInput}><option value="Active" ${isEdit && editData.projectStatus === "Active" ? "selected" : ""}>Active</option><option value="In Planning" ${isEdit && editData.projectStatus === "In Planning" ? "selected" : ""}>In Planning</option><option value="Handed Over" ${isEdit && editData.projectStatus === "Handed Over" ? "selected" : ""}>Handed Over</option><option value="Declined" ${isEdit && editData.projectStatus === "Declined" ? "selected" : ""}>Declined</option></select><label ${labelStyle}>Contract Subtotal</label><input id="p_contract_subtotal" type="number" step="0.01" value="${escapeAttr(isEdit && editData.contractSubtotal != null ? editData.contractSubtotal : 0)}" ${largeInput}><label ${labelStyle}>Notes</label><textarea id="p_notes" rows="2" ${largeInput}>${escapeHtml(isEdit ? editData.notes : "")}</textarea>`;
    submit.onclick = () => {
      const phone = document.getElementById("p_phone").value.trim();
      if (phone && !/^\d{11}$/.test(phone)) {
        alert("Phone must be 11 digits");
        return;
      }
      submit.disabled = true;
      submit.innerText = "Saving...";
      const payload = {
        projectId: isEdit
          ? editData.projectId
          : generateFrontendPreviewId("project"),
        clientName: document.getElementById("p_client").value,
        siteLocation: document.getElementById("p_loc").value,
        clientPhone: phone,
        clientEmail: document.getElementById("p_email").value,
        projectStatus: document.getElementById("p_status").value,
        contractSubtotal: roundMoney(
          Number(document.getElementById("p_contract_subtotal").value) || 0,
        ),
        notes: document.getElementById("p_notes").value,
      };
      callApi(isEdit ? "updateProject" : "saveProject", payload)
        .then(() => {
          closeModal();
          refreshMasterDashboard();
          if (isEdit) loadProjectConsoleHub(payload.projectId);
        })
        .catch(resetSubmitOnError(submit));
    };
  } else if (type === "takeoff_item") {
    title.innerText = isEdit ? "Edit Take-Off" : "New Take-Off";
    if (isEdit && editData.beforePhotoUrl)
      currentModalFiles = splitAttachments(editData.beforePhotoUrl);
    const unitOptions = MASTER_UNITS.map(
      (u) =>
        `<option value="${escapeAttr(u.value)}">${escapeHtml(u.label)}</option>`,
    ).join("");

    let rows = [];
    if (isEdit) {
      const isHeader = String(editData.scopeNotes || "").startsWith(
        "__HEADER__:",
      );
      rows = [
        {
          itemId: editData.itemId,
          description: editData.description || "",
          quantity: editData.quantity || "",
          unit: editData.unit || "",
          notes: isHeader
            ? editData.scopeNotes.substring(11)
            : editData.scopeNotes || "",
          isHeader: isHeader,
        },
      ];
    } else {
      rows = [
        {
          itemId: "",
          description: "",
          quantity: "",
          unit: "",
          notes: "",
          isHeader: false,
        },
      ];
    }

    const rowHtml = rows
      .map((row) =>
        row.isHeader
          ? `<tr class="to-line-row to-header-row" data-item-id="${escapeAttr(row.itemId)}">
        <td colspan="4" style="padding:4px; border-bottom:1px solid var(--border); background:#e9ecef;"><input class="to-line-desc" value="${escapeAttr(row.description)}" placeholder="Header text..." style="width:100%; padding:10px; font-size:15px; font-weight:800; border:1.5px solid var(--border); border-radius:8px; background:#fff;"></td>
        <td style="padding:4px; border-bottom:1px solid var(--border); width:30px; text-align:center; background:#e9ecef;"><button onclick="this.closest('tr').remove();" style="background:var(--danger); color:white; border:none; border-radius:6px; cursor:pointer; width:28px; height:28px; font-size:14px;">×</button></td>
      </tr>`
          : `<tr class="to-line-row" data-item-id="${escapeAttr(row.itemId)}">
        <td style="padding:4px; border-bottom:1px solid var(--border);"><input class="to-line-desc" value="${escapeAttr(row.description)}" placeholder="Description" style="width:100%; padding:8px; font-size:14px; border:1.5px solid var(--border); border-radius:8px;"></td>
        <td style="padding:4px; border-bottom:1px solid var(--border); width:60px;"><input class="to-line-qty" type="number" value="${escapeAttr(row.quantity)}" placeholder="Qty" min="0" step="0.01" style="width:100%; padding:8px; font-size:14px; border:1.5px solid var(--border); border-radius:8px; text-align:right;"></td>
        <td style="padding:4px; border-bottom:1px solid var(--border); width:90px;"><select class="to-line-unit" style="width:100%; padding:8px; font-size:14px; border:1.5px solid var(--border); border-radius:8px;"><option value="" disabled ${!row.unit ? "selected" : ""}>Select unit</option>${unitOptions}</select></td>
        <td style="padding:4px; border-bottom:1px solid var(--border);"><input class="to-line-notes" value="${escapeAttr(row.notes)}" placeholder="Notes" style="width:100%; padding:8px; font-size:14px; border:1.5px solid var(--border); border-radius:8px;"></td>
        <td style="padding:4px; border-bottom:1px solid var(--border); width:30px; text-align:center;"><button onclick="this.closest('tr').remove();" style="background:var(--danger); color:white; border:none; border-radius:6px; cursor:pointer; width:28px; height:28px; font-size:14px;">×</button></td>
      </tr>`,
      )
      .join("");

    body.innerHTML = `
    <label ${labelStyle}>Line Items</label>
    <div style="overflow-x:auto;">
    <table style="width:100%; font-size:13px; border-collapse:collapse; margin-bottom:10px;">
      <thead>
        <tr style="background:#000; color:#fff;">
          <th style="padding:6px; text-align:left; font-size:10px; text-transform:uppercase;">Description</th>
          <th style="padding:6px; text-align:right; font-size:10px; text-transform:uppercase; width:60px;">Qty</th>
          <th style="padding:6px; text-align:left; font-size:10px; text-transform:uppercase; width:90px;">U/M</th>
          <th style="padding:6px; text-align:left; font-size:10px; text-transform:uppercase;">Notes</th>
          <th style="width:30px;"></th>
        </tr>
      </thead>
      <tbody id="to_line_items_body">${rowHtml}</tbody>
    </table>
    </div>
    <div style="display:flex; gap:8px; flex-wrap:wrap;">
      <button class="action-btn" style="width:auto; padding:6px 12px; font-size:12px; background:var(--card-light); color:var(--text);" onclick="window.addTakeOffLineItem()"><i class="fas fa-plus"></i> Add Line Item</button>
      <button class="action-btn" style="width:auto; padding:6px 12px; font-size:12px; background:var(--primary);" onclick="window.addTakeOffHeader()"><i class="fas fa-heading"></i> Add Header</button>
    </div>
    <div id="takeoffAttachmentsPreviews" class="modal-preview-grid" style="display:none; margin-top:12px;"></div>
    <label class="icon-upload-label" style="margin-top:10px;"><i class="fas fa-paperclip"></i><input type="file" id="t_photo" accept="image/*" multiple style="display:none"></label>
    ${isEdit ? `<button class="action-btn" id="t_delete_btn" style="background:var(--danger); margin-top:10px;">Delete Item</button>` : ""}`;

    if (currentModalFiles.length)
      populateModalInlineImageGalleryPreviews("takeoffAttachmentsPreviews");
    document.getElementById("t_photo").onchange = (e) =>
      processIncomingMultiAttachments(
        e.target.files,
        "takeoffAttachmentsPreviews",
      );
    if (isEdit) {
      document.getElementById("t_delete_btn").onclick = () => {
        if (confirm("Delete this item?")) {
          const itemId = document.querySelector("#to_line_items_body tr")
            .dataset.itemId;
          callApi("deleteTakeOffItem", { itemId })
            .then(() => {
              closeModal();
              loadTakeOffListings(true);
            })
            .catch(() => {});
        }
      };
    }
    submit.onclick = async () => {
      submit.disabled = true;
      submit.innerText = "GPS...";
      const gps = await getGPSLocation();
      submit.innerText = "Saving...";
      const photoUrl = normalizeAttachments(currentModalFiles);
      const projectId = getCurrentProjectId();
      const tableRows = document.querySelectorAll("#to_line_items_body tr");
      let savedCount = 0;
      let errorCount = 0;

      for (const row of Array.from(tableRows)) {
        const desc = row.querySelector(".to-line-desc").value.trim();
        if (!desc) continue;
        const isHeader = row.classList.contains("to-header-row");
        const itemId =
          row.dataset.itemId ||
          "TO-" + Date.now() + "-" + Math.random().toString(36).substr(2, 5);

        let payload;
        if (isHeader) {
          payload = {
            itemId: itemId,
            projectId: projectId,
            roomArea: "",
            tradeCategory: "",
            description: desc,
            quantity: 0,
            unit: "",
            beforePhotoUrl: "",
            scopeNotes: "__HEADER__:" + desc,
          };
        } else {
          const unit = row.querySelector(".to-line-unit").value;
          if (!unit) {
            alert("Select a unit for all line items");
            submit.disabled = false;
            submit.innerText = "Save";
            return;
          }
          const finalNotes =
            row.querySelector(".to-line-notes").value +
            (gps !== "GPS Unavailable"
              ? `
📍 ${gps}`
              : "");
          payload = {
            itemId: itemId,
            projectId: projectId,
            roomArea: "",
            tradeCategory: "",
            description: desc,
            quantity: row.querySelector(".to-line-qty").value,
            unit: unit,
            beforePhotoUrl: photoUrl,
            scopeNotes: finalNotes,
          };
        }
        try {
          await callApi(
            row.dataset.itemId ? "updateTakeOffItem" : "saveTakeOffItem",
            payload,
          );
          savedCount++;
        } catch (e) {
          errorCount++;
          console.error("Failed to save take-off item:", e);
        }
      }
      closeModal();
      loadTakeOffListings(true);
      if (errorCount > 0) alert(`${savedCount} saved, ${errorCount} failed.`);
    };
  } else if (type === "takeoff_group") {
    title.innerText = isEdit ? "Edit Take‑Off" : "New Take‑Off";
    currentModalFiles = [];

    let groupName = "";
    let groupItems = [];
    let groupId = "";
    let isLegacy = false;

    if (isEdit) {
      if (editData && editData.items) {
        groupName = editData.name || "";
        groupItems = editData.items || [];
        groupId = editData.groupId || "";
        isLegacy = !!editData.isLegacy;
      }
    } else {
      groupId = "TO-GRP-" + Date.now();
      groupItems = [{ description: "", quantity: "", unit: "", scopeNotes: "" }];
    }

    const unitOptions = MASTER_UNITS.map(
      (u) =>
        `<option value="${escapeAttr(u.value)}" ${groupItems[0]?.unit === u.value ? "selected" : ""}>${escapeHtml(u.label)}</option>`,
    ).join("");

    const itemsHtml = groupItems
      .map(
        (item) =>
          `<tr class="to-group-line" data-item-id="${escapeAttr(item.itemId || "")}">
        <td style="padding:4px; border-bottom:1px solid var(--border);"><input class="to-line-desc" value="${escapeAttr(item.description || "")}" placeholder="Description" style="width:100%; padding:8px; font-size:14px; border:1.5px solid var(--border); border-radius:8px;"></td>
        <td style="padding:4px; border-bottom:1px solid var(--border); width:60px;"><input class="to-line-qty" type="number" value="${escapeAttr(item.quantity != null ? item.quantity : "")}" placeholder="Qty" min="0" step="0.01" style="width:100%; padding:8px; font-size:14px; border:1.5px solid var(--border); border-radius:8px; text-align:right;"></td>
        <td style="padding:4px; border-bottom:1px solid var(--border); width:90px;"><select class="to-line-unit" style="width:100%; padding:8px; font-size:14px; border:1.5px solid var(--border); border-radius:8px;"><option value="" disabled ${!item.unit ? "selected" : ""}>Select unit</option>${unitOptions}</select></td>
        <td style="padding:4px; border-bottom:1px solid var(--border);"><input class="to-line-notes" value="${escapeAttr((item.scopeNotes || "").replace(/^__HEADER__:/, "").replace(/^__GROUP__:[^,]+,/, ""))}" placeholder="Notes" style="width:100%; padding:8px; font-size:14px; border:1.5px solid var(--border); border-radius:8px;"></td>
        <td style="padding:4px; border-bottom:1px solid var(--border); width:30px; text-align:center;"><button onclick="this.closest('tr').remove();" style="background:var(--danger); color:white; border:none; border-radius:6px; cursor:pointer; width:28px; height:28px; font-size:14px;">×</button></td>
      </tr>`,
      )
      .join("");

    body.innerHTML = `
      <label ${labelStyle}>Group / Category Name</label>
      <input id="to_group_name" value="${escapeAttr(groupName)}" placeholder="e.g. Electrical First Fix" ${largeInput}>
      <label ${labelStyle} style="margin-top:16px;">Line Items</label>
      <div style="overflow-x:auto;">
      <table style="width:100%; font-size:13px; border-collapse:collapse; margin-bottom:10px;">
        <thead>
          <tr style="background:#000; color:#fff;">
            <th style="padding:6px; text-align:left; font-size:10px; text-transform:uppercase;">Description</th>
            <th style="padding:6px; text-align:right; font-size:10px; text-transform:uppercase; width:60px;">Qty</th>
            <th style="padding:6px; text-align:left; font-size:10px; text-transform:uppercase; width:90px;">U/M</th>
            <th style="padding:6px; text-align:left; font-size:10px; text-transform:uppercase;">Notes</th>
            <th style="width:30px;"></th>
          </tr>
        </thead>
        <tbody id="to_group_items_body">${itemsHtml}</tbody>
      </table>
      </div>
      <button class="action-btn" style="width:auto; padding:6px 12px; font-size:12px; background:var(--card-light); color:var(--text);" onclick="window.addTakeOffGroupLine()"><i class="fas fa-plus"></i> Add Line Item</button>
      <div id="takeoffAttachmentsPreviews" class="modal-preview-grid" style="display:none; margin-top:12px;"></div>
      <label class="icon-upload-label" style="margin-top:10px;"><i class="fas fa-paperclip"></i><input type="file" id="t_photo" accept="image/*" multiple style="display:none"></label>
      ${isEdit ? `<button class="action-btn" id="t_delete_btn" style="background:var(--danger); margin-top:10px;">Delete Group</button>` : ""}`;

    if (currentModalFiles.length)
      populateModalInlineImageGalleryPreviews("takeoffAttachmentsPreviews");
    document.getElementById("t_photo").onchange = (e) =>
      processIncomingMultiAttachments(e.target.files, "takeoffAttachmentsPreviews");

    if (isEdit) {
      document.getElementById("t_delete_btn").onclick = () => {
        if (confirm("Delete this entire group?")) {
          const toDelete = groupItems.map((i) => i.itemId);
          Promise.all(toDelete.map((id) => callApi("deleteTakeOffItem", { itemId: id }).catch(() => {})))
            .then(() => {
              closeModal();
              loadTakeOffListings(true);
            });
        }
      };
    }

    submit.onclick = async () => {
      const newGroupName = document.getElementById("to_group_name").value.trim();
      if (!newGroupName) {
        alert("Enter a group name");
        return;
      }

      const rows = document.querySelectorAll("#to_group_items_body tr.to-group-line");
      const newItems = [];
      const existingItemIds = new Set();

      for (const row of Array.from(rows)) {
        const desc = row.querySelector(".to-line-desc").value.trim();
        if (!desc) continue;
        const itemId = row.dataset.itemId || "TO-" + Date.now() + "-" + Math.random().toString(36).substr(2, 5);
        const unit = row.querySelector(".to-line-unit").value;
        if (!unit) {
          alert("Select a unit for all line items");
          return;
        }
        newItems.push({
          itemId,
          description: desc,
          quantity: row.querySelector(".to-line-qty").value,
          unit,
          scopeNotes: row.querySelector(".to-line-notes").value,
          existing: !!row.dataset.itemId,
        });
        if (row.dataset.itemId) existingItemIds.add(row.dataset.itemId);
      }

      if (!newItems.length) {
        alert("Add at least one line item");
        return;
      }

      const itemsToDelete = [];
      if (isEdit && editData.items) {
        for (const oldItem of editData.items) {
          if (!existingItemIds.has(oldItem.itemId)) {
            itemsToDelete.push(oldItem.itemId);
          }
        }
      }

      submit.disabled = true;
      submit.innerText = "GPS…";
      const gps = await getGPSLocation();
      submit.innerText = "Saving…";
      const photoUrl = normalizeAttachments(currentModalFiles);
      const projectId = getCurrentProjectId();

      for (const delId of itemsToDelete) {
        try {
          await callApi("deleteTakeOffItem", { itemId: delId });
        } catch (e) {
          console.warn("Failed to delete item", delId, e);
        }
      }

      let saved = 0;
      for (const item of newItems) {
        const payload = {
          itemId: item.itemId,
          projectId,
          roomArea: "__GRP__:" + groupId,
          tradeCategory: newGroupName,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          beforePhotoUrl: photoUrl,
          scopeNotes: item.scopeNotes + (gps !== "GPS Unavailable" ? "\n📍 " + gps : ""),
        };
        try {
          await callApi(item.existing ? "updateTakeOffItem" : "saveTakeOffItem", payload);
          saved++;
        } catch (e) {
          console.error("Failed to save item", e);
        }
      }

      closeModal();
      loadTakeOffListings(true);
      showSyncToast(
        itemsToDelete.length
          ? `${saved} saved, ${itemsToDelete.length} deleted`
          : `✅ ${saved} item${saved !== 1 ? "s" : ""} saved`,
      );
    };

  } else if (type === "progress_entry") {
    const uniqueId = "LOG-" + Date.now();
    title.innerText = "Log Progress";
    body.innerHTML = `<label ${labelStyle}>Trade</label><input id="l_trade" ${largeInput}><label ${labelStyle}>Completion %</label><input id="l_pct" type="number" min="0" max="100" step="1" placeholder="Enter 0-100" oninput="this.value=this.value.replace(/[^0-9]/g,'');if(this.value>100)this.value=100;if(this.value<0)this.value=0;" ${largeInput}><label ${labelStyle}>Comments</label><textarea id="l_comm" rows="3" ${largeInput}></textarea><div id="progressAttachmentsPreviews" class="modal-preview-grid" style="display:none;"></div><label class="icon-upload-label"><i class="fas fa-paperclip"></i><input type="file" id="l_photo" accept="image/*" multiple style="display:none"></label>`;
    document.getElementById("l_photo").onchange = (e) =>
      processIncomingMultiAttachments(
        e.target.files,
        "progressAttachmentsPreviews",
      );
    submit.onclick = async () => {
      const pct = document.getElementById("l_pct").value;
      if (!pct || pct === "" || Number(pct) < 0 || Number(pct) > 100) {
        alert("Enter a completion % between 0 and 100");
        return;
      }
      if (!document.getElementById("l_trade").value.trim()) {
        alert("Enter a trade");
        return;
      }
      submit.disabled = true;
      submit.innerText = "GPS...";
      const gps = await getGPSLocation();
      submit.innerText = "Saving...";
      const payload = {
        logId: uniqueId,
        projectId: getCurrentProjectId(),
        tradeCategory: document.getElementById("l_trade").value,
        completionPercentage: String(Math.round(Number(pct))),
        commentNarrative:
          document.getElementById("l_comm").value +
          (gps !== "GPS Unavailable"
            ? `
📍 ${gps}`
            : ""),
        progressPhotoUrl: normalizeAttachments(currentModalFiles),
      };
      callApi("saveProgressLog", payload)
        .then(() => {
          closeModal();
          loadProgressTimelineFeed(true);
        })
        .catch(resetSubmitOnError(submit));
    };
  } else if (type === "vendor") {
    const uniqueId = isEdit ? editData.vendorId : "VND-" + Date.now();
    title.innerText = isEdit ? "Edit Vendor" : "New Vendor";
    if (isEdit) {
      currentAvatarPhoto = editData.passport;
      if (editData.attachments)
        currentModalFiles = splitAttachments(editData.attachments);
    }
    body.innerHTML = `<div class="passport-frame-container"><img id="passport_frame_view" src="${getDirectImageUrl(currentAvatarPhoto) || "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%3E%3Cpath%20fill%3D%22%23666%22%20d%3D%22M12%2012c2.21%200%204-1.79%204-4s-1.79-4-4-4-4%201.79-4%204%201.79%204%204%204zm0%202c-2.67%200-8%201.34-8%204v2h16v-2c0-2.66-5.33-4-8-4z%22%2F%3E%3C%2Fsvg%3E"}" style="width:100%; height:100%; object-fit:cover;"><label style="position:absolute; bottom:0; right:0; background:#000; color:white; border-radius:50%; width:30px; height:30px; display:flex; align-items:center; justify-content:center; cursor:pointer;"><i class="fas fa-camera"></i><input type="file" id="v_pass" accept="image/*" style="display:none"></label><div id="v_pass_remove" onclick="window.clearVendorAvatarPhoto()" style="position:absolute; top:0; right:0; background:red; color:white; border-radius:50%; width:22px; text-align:center; cursor:pointer;">&times;</div></div><label ${labelStyle}>Company</label><input id="v_comp" value="${escapeAttr(isEdit ? editData.company : "")}" ${largeInput}><label ${labelStyle}>Trade</label><input id="v_trade" value="${escapeAttr(isEdit ? editData.trade : "")}" ${largeInput}><label ${labelStyle}>Contact Person</label><input id="v_contact" value="${escapeAttr(isEdit ? editData.contactName : "")}" ${largeInput}><label ${labelStyle}>Phone 1 (11 digits)</label><input id="v_phone1" type="tel" maxlength="11" oninput="this.value=this.value.replace(/[^0-9]/g,'')" value="${escapeAttr(isEdit ? editData.phone1 : "")}" ${largeInput}><label ${labelStyle}>Phone 2</label><input id="v_phone2" type="tel" maxlength="11" oninput="this.value=this.value.replace(/[^0-9]/g,'')" value="${escapeAttr(isEdit ? editData.phone2 : "")}" ${largeInput}><label ${labelStyle}>Email</label><input id="v_email" type="email" value="${escapeAttr(isEdit ? editData.email : "")}" ${largeInput}><div id="vendorAttachmentsPreviews" class="modal-preview-grid" style="display:none;"></div><label class="icon-upload-label"><i class="fas fa-paperclip"></i><input type="file" id="v_files" accept="image/*,application/pdf" multiple style="display:none"></label>${isEdit ? `<button class="action-btn" id="v_delete_btn" style="background:var(--danger); margin-top:10px;">Delete</button>` : ""}`;
    if (currentModalFiles.length)
      populateModalInlineImageGalleryPreviews("vendorAttachmentsPreviews");
    document.getElementById("v_pass").onchange = (e) => {
      const f = e.target.files[0];
      if (f) {
        const r = new FileReader();
        r.onload = async (ev) => {
          currentAvatarPhoto = await compressImageToTargetLimit(
            ev.target.result,
            190000,
          );
          document.getElementById("passport_frame_view").src =
            currentAvatarPhoto;
          document.getElementById("v_pass_remove").style.display = "block";
        };
        r.readAsDataURL(f);
      }
    };
    document.getElementById("v_files").onchange = (e) =>
      processIncomingMultiAttachments(
        e.target.files,
        "vendorAttachmentsPreviews",
      );
    if (isEdit) {
      document.getElementById("v_delete_btn").onclick = () => {
        if (confirm("Delete vendor?")) {
          callApi("deleteVendor", { vendorId: uniqueId })
            .then(() => {
              closeModal();
              refreshVendorsListView();
            })
            .catch(() => {});
        }
      };
    }
    submit.onclick = () => {
      const p1 = document.getElementById("v_phone1").value.trim();
      const p2 = document.getElementById("v_phone2").value.trim();
      if (p1 && !/^\d{11}$/.test(p1)) {
        alert("Phone 1 must be 11 digits");
        return;
      }
      if (p2 && !/^\d{11}$/.test(p2)) {
        alert("Phone 2 must be 11 digits");
        return;
      }
      submit.disabled = true;
      submit.innerText = "Saving...";
      const payload = {
        vendorId: uniqueId,
        company: document.getElementById("v_comp").value,
        trade: document.getElementById("v_trade").value,
        contactName: document.getElementById("v_contact").value,
        phone1: p1,
        phone2: p2,
        email: document.getElementById("v_email").value,
        passport: currentAvatarPhoto,
        attachments: normalizeAttachments(currentModalFiles),
        archived: "No",
      };
      callApi(isEdit ? "updateVendor" : "saveVendor", payload)
        .then(() => {
          closeModal();
          refreshVendorsListView();
        })
        .catch(resetSubmitOnError(submit));
    };
  } else if (type === "workorder") {
    const uniqueId = isEdit
      ? editData.workOrderId
      : generateFrontendPreviewId("workorder");
    title.innerText = isEdit ? "Edit Work Order" : "New Work Order";
    if (isEdit && editData.attachments)
      currentModalFiles = splitAttachments(editData.attachments);
    let vendors = getCache().vendors || [];
    if (!vendors.length) {
      try {
        const fetched = await callApi("getVendors", {});
        const cache = getCache();
        cache.vendors = fetched || [];
        setCache(cache);
        vendors = cache.vendors;
      } catch (e) {
        console.warn("Could not load vendors for work order modal:", e);
      }
    }

    let lineItems = [];
    let woNotes = "";
    if (isEdit && editData.description) {
      try {
        const parsed = JSON.parse(editData.description);
        if (parsed && Array.isArray(parsed.lineItems)) {
          lineItems = parsed.lineItems;
          woNotes = parsed.notes || "";
        } else {
          lineItems = [
            {
              description: editData.description,
              qty: 1,
              rate: Number(editData.amount) || 0,
              amount: Number(editData.amount) || 0,
            },
          ];
        }
      } catch (e) {
        lineItems = [
          {
            description: editData.description,
            qty: 1,
            rate: Number(editData.amount) || 0,
            amount: Number(editData.amount) || 0,
          },
        ];
      }
    }

    const lineItemsHtml = lineItems
      .map(
        (item) =>
          `<tr class="wo-line-row">
        <td style="padding:4px; border-bottom:1px solid var(--border);"><input class="wo-line-desc" value="${escapeAttr(item.description || "")}" placeholder="Description" style="width:100%; padding:8px; font-size:14px; border:1.5px solid var(--border); border-radius:8px;"></td>
        <td style="padding:4px; border-bottom:1px solid var(--border); width:60px;"><input class="wo-line-qty" type="number" value="${escapeAttr(item.qty || 1)}" min="0" step="0.01" style="width:100%; padding:8px; font-size:14px; border:1.5px solid var(--border); border-radius:8px; text-align:right;" oninput="window.recalcWorkOrderTotal()"></td>
        <td style="padding:4px; border-bottom:1px solid var(--border); width:70px;"><input class="wo-line-um" value="${escapeAttr(item.um || "")}" placeholder="U/M" style="width:100%; padding:8px; font-size:14px; border:1.5px solid var(--border); border-radius:8px; text-align:center;"></td>
        <td style="padding:4px; border-bottom:1px solid var(--border); width:90px;"><input class="wo-line-rate" type="number" value="${escapeAttr(item.rate || "")}" min="0" step="0.01" style="width:100%; padding:8px; font-size:14px; border:1.5px solid var(--border); border-radius:8px; text-align:right;" oninput="window.recalcWorkOrderTotal()"></td>
        <td style="padding:4px; border-bottom:1px solid var(--border); width:90px;"><input class="wo-line-amt" type="number" value="${escapeAttr(item.amount || 0)}" disabled style="width:100%; padding:8px; font-size:14px; border:1.5px solid var(--border); border-radius:8px; text-align:right; background:#f5f5f5;"></td>
        <td style="padding:4px; border-bottom:1px solid var(--border); width:30px; text-align:center;"><button onclick="this.closest('tr').remove(); window.recalcWorkOrderTotal();" style="background:var(--danger); color:white; border:none; border-radius:6px; cursor:pointer; width:28px; height:28px; font-size:14px;">×</button></td>
      </tr>`,
      )
      .join("");

    body.innerHTML = `<label ${labelStyle}>ID</label><input value="${uniqueId}" disabled style="${largeInput} background:#f0f0f0;"><label ${labelStyle}>Vendor</label><select id="wo_vendor" ${largeInput}>${vendors.map((v) => `<option value="${v.vendorId}" ${isEdit && v.vendorId === editData.vendorId ? "selected" : ""}>${escapeHtml(v.company)}</option>`).join("")}</select>
    <label ${labelStyle}>Line Items</label>
    <table style="width:100%; font-size:13px; border-collapse:collapse; margin-bottom:10px;">
      <thead>
        <tr style="background:#000; color:#fff;">
          <th style="padding:6px; text-align:left; font-size:10px; text-transform:uppercase;">Description</th>
          <th style="padding:6px; text-align:right; font-size:10px; text-transform:uppercase; width:60px;">Qty</th>
          <th style="padding:6px; text-align:center; font-size:10px; text-transform:uppercase; width:70px;">U/M</th>
          <th style="padding:6px; text-align:right; font-size:10px; text-transform:uppercase; width:90px;">Rate (₦)</th>
          <th style="padding:6px; text-align:right; font-size:10px; text-transform:uppercase; width:90px;">Amount (₦)</th>
          <th style="width:30px;"></th>
        </tr>
      </thead>
      <tbody id="wo_line_items_body">${lineItemsHtml}</tbody>
    </table>
    <button class="action-btn" style="width:auto; padding:6px 12px; font-size:12px; background:var(--card-light); color:var(--text);" onclick="window.addWorkOrderLineItem()"><i class="fas fa-plus"></i> Add Line Item</button>
    <div style="display:flex; justify-content:space-between; align-items:center; margin-top:12px; margin-bottom:12px; padding:12px; background:var(--card-light); border-radius:12px; border:1.5px solid var(--border);">
      <span style="font-weight:800; font-size:14px;">Total Work Order Value</span>
      <span id="wo_total_display" style="font-weight:900; font-size:18px;">₦${moneyValue(isEdit ? Number(editData.amount) || 0 : 0)}</span>
    </div>
    <input type="hidden" id="wo_amount_hidden" value="${escapeAttr(isEdit ? editData.amount : 0)}">
    <label ${labelStyle}>Notes</label><textarea id="wo_notes" rows="2" ${largeInput}>${escapeHtml(woNotes)}</textarea>
    <label ${labelStyle}>Status</label><select id="wo_status" ${largeInput}><option value="Pending" ${isEdit && editData.status === "Pending" ? "selected" : ""}>Pending</option><option value="Active" ${isEdit && editData.status === "Active" ? "selected" : ""}>Active</option><option value="Completed" ${isEdit && editData.status === "Completed" ? "selected" : ""}>Completed</option></select>
    <div id="woAttachmentsPreviews" class="modal-preview-grid" style="display:none;"></div>
    <label class="icon-upload-label"><i class="fas fa-paperclip"></i><input type="file" id="wo_files" accept="image/*,application/pdf" multiple style="display:none"></label>`;
    if (currentModalFiles.length)
      populateModalInlineImageGalleryPreviews("woAttachmentsPreviews");
    document.getElementById("wo_files").onchange = (e) =>
      processIncomingMultiAttachments(e.target.files, "woAttachmentsPreviews");
    submit.onclick = () => {
      const vendorId = document.getElementById("wo_vendor").value;
      if (!vendorId) {
        alert("Select a vendor");
        return;
      }
      const rows = document.querySelectorAll("#wo_line_items_body tr");
      const lineItems = [];
      rows.forEach((row) => {
        const desc = row.querySelector(".wo-line-desc").value.trim();
        if (desc) {
          const qty = Number(row.querySelector(".wo-line-qty").value) || 0;
          const um = row.querySelector(".wo-line-um").value.trim();
          const rate = Number(row.querySelector(".wo-line-rate").value) || 0;
          lineItems.push({
            description: desc,
            qty: qty,
            um: um,
            rate: rate,
            amount: roundMoney(qty * rate),
          });
        }
      });
      if (!lineItems.length) {
        alert("Add at least one line item");
        return;
      }
      const totalAmount = roundMoney(
        lineItems.reduce((s, i) => s + i.amount, 0),
      );
      const description = JSON.stringify({
        lineItems,
        notes: document.getElementById("wo_notes").value,
      });
      submit.disabled = true;
      submit.innerText = "Saving...";
      const payload = {
        workOrderId: uniqueId,
        projectId: getCurrentProjectId(),
        vendorId: vendorId,
        description: description,
        amount: totalAmount,
        status: document.getElementById("wo_status").value,
        attachments: normalizeAttachments(currentModalFiles),
      };
      callApi(isEdit ? "updateWorkOrder" : "saveWorkOrder", payload)
        .then(() => {
          closeModal();
          loadWorkOrdersListings(true);
        })
        .catch(resetSubmitOnError(submit));
    };
  } else if (type === "snag") {
    const uniqueId = isEdit ? editData.snagId : "SNAG-" + Date.now();
    title.innerText = isEdit ? "Edit Snag" : "New Snag";
    currentModalFiles = [];
    if (isEdit) {
      try {
        const localPhotos = await getSnagPhotosLocally(uniqueId);
        if (localPhotos) currentModalFiles = splitAttachments(localPhotos);
      } catch (e) {
        console.warn("Could not load local snag photos:", e);
      }
    }
    body.innerHTML = `<label ${labelStyle}>Notes</label><textarea id="sn_notes" rows="3" ${largeInput}>${escapeHtml(isEdit ? editData.notes : "")}</textarea><label ${labelStyle}>Assigned To</label><input id="sn_assigned" value="${escapeAttr(isEdit ? editData.assigned : "")}" ${largeInput}><label ${labelStyle}>Date Logged</label><input id="sn_date_logged" type="text" value="${escapeAttr(isEdit ? editData.dateLogged : todayFormatted())}" placeholder="YYYY/MM/DD" disabled style="${largeInput} background:#f0f0f0;"><label ${labelStyle}>Status</label><select id="sn_status" ${largeInput}><option value="Open" ${!isEdit || editData.status === "Open" ? "selected" : ""}>Open</option><option value="Completed" ${isEdit && editData.status === "Completed" ? "selected" : ""}>Completed</option></select><div id="sn_date_completed_wrap" style="display:${isEdit && editData.status === "Completed" ? "block" : "none"};"><label ${labelStyle}>Date Completed</label><input id="sn_date_completed" type="text" value="${escapeAttr(isEdit && editData.dateCompleted ? editData.dateCompleted : todayFormatted())}" placeholder="YYYY/MM/DD" disabled style="${largeInput} background:#f0f0f0;"></div><div id="snagAttachmentsPreviews" class="modal-preview-grid" style="display:none;"></div><label class="icon-upload-label"><i class="fas fa-paperclip"></i><input type="file" id="sn_photo" accept="image/*" multiple style="display:none"></label><p style="font-size:11px; color:var(--muted); margin-top:4px;"><i class="fas fa-lock"></i> Photos stay on this device only and are not uploaded.</p>${isEdit ? `<button class="action-btn" id="sn_delete_btn" style="background:var(--danger); margin-top:10px;">Delete</button>` : ""}`;
    if (currentModalFiles.length)
      populateModalInlineImageGalleryPreviews("snagAttachmentsPreviews");
    document.getElementById("sn_photo").onchange = (e) =>
      processIncomingMultiAttachments(
        e.target.files,
        "snagAttachmentsPreviews",
      );
    document.getElementById("sn_status").onchange = (e) => {
      const wrap = document.getElementById("sn_date_completed_wrap");
      if (e.target.value === "Completed") {
        wrap.style.display = "block";
        const inp = document.getElementById("sn_date_completed");
        if (!inp.value) inp.value = todayFormatted();
      } else {
        wrap.style.display = "none";
      }
    };
    if (isEdit) {
      document.getElementById("sn_delete_btn").onclick = () => {
        if (confirm("Delete this snag?")) {
          callApi("deleteSnag", { snagId: uniqueId })
            .then(async () => {
              try {
                await deleteSnagPhotosLocally(uniqueId);
              } catch (e) {
                console.warn(e);
              }
              closeModal();
              loadSnagsListings(true);
            })
            .catch(() => {});
        }
      };
    }
    submit.onclick = async () => {
      if (!document.getElementById("sn_notes").value.trim()) {
        alert("Enter snag notes");
        return;
      }
      submit.disabled = true;
      submit.innerText = "Saving...";
      const status = document.getElementById("sn_status").value;
      const payload = {
        snagId: uniqueId,
        projectId: getCurrentProjectId(),
        notes: document.getElementById("sn_notes").value,
        assigned: document.getElementById("sn_assigned").value,
        dateLogged: isEdit ? editData.dateLogged : todayFormatted(),
        dateCompleted:
          status === "Completed"
            ? document.getElementById("sn_date_completed").value
            : "",
        status: status,
      };
      try {
        await saveSnagPhotosLocally(
          uniqueId,
          normalizeAttachments(currentModalFiles),
        );
      } catch (e) {
        console.warn("Could not save snag photos locally:", e);
      }
      callApi(isEdit ? "updateSnag" : "saveSnag", payload)
        .then(() => {
          closeModal();
          loadSnagsListings(true);
        })
        .catch(resetSubmitOnError(submit));
    };
  } else if (type === "payment") {
    title.innerText = isEdit ? "Edit Payment" : "New Payment";
    if (isEdit && editData.attachments)
      currentModalFiles = splitAttachments(editData.attachments);
    let vendors = getCache().vendors || [];
    if (!vendors.length) {
      try {
        const fetched = await callApi("getVendors", {});
        const cache = getCache();
        cache.vendors = fetched || [];
        setCache(cache);
        vendors = cache.vendors;
      } catch (e) {
        console.warn("Could not load vendors for payment modal:", e);
      }
    }
    const projects = getCache().projects || [];
    const currentDir = isEdit
      ? paymentDirectionOf(editData)
      : "Outgoing Payment";
    const isAddStage = isEdit && editData._addStage === true;
    const isEditStage = isEdit && !isAddStage && editData.stage;
    const isSmallExpense = currentDir === "Small Expense";
    let groupData = null;
    if ((isEditStage || isAddStage) && editData.paymentGroupId)
      groupData = getPaymentGroupData(
        editData.paymentGroupId,
        editData.paymentId,
      );
    function payeeFieldHtml(direction) {
      const currentPayee = isEdit ? editData.payee : "";
      if (direction === "Outgoing Payment")
        return `<select id="pay_payee" ${largeInput} onchange="window.recalcPaymentBalance()">
<option value="">-- Select Vendor --</option>
${vendors.map((v) => `<option value="${escapeAttr(v.company)}" ${currentPayee === v.company ? "selected" : ""}>${escapeHtml(v.company)}</option>`).join("")}
</select>`;
      else if (direction === "Client Receipt")
        return `<select id="pay_payee" ${largeInput} onchange="window.recalcPaymentBalance()">
<option value="">-- Select Project --</option>
${projects.map((p) => `<option value="${escapeAttr(p.clientName)}" data-project-id="${escapeAttr(p.projectId)}" ${currentPayee === p.clientName ? "selected" : ""}>${escapeHtml(p.clientName)} (${escapeHtml(p.projectId)})</option>`).join("")}
</select>`;
      else
        return `<input id="pay_payee" value="${escapeAttr(currentPayee)}" placeholder="Describe the expense" ${largeInput} onchange="window.recalcPaymentBalance()">`;
    }
    let stageOptions = "";
    if (isSmallExpense)
      stageOptions = `<option value="" selected>Full Payment</option>`;
    else if (isAddStage && groupData) {
      const nextStage = groupData.stages.length + 1;
      stageOptions = `<option value="${nextStage}" selected>Stage ${nextStage}</option>`;
    } else if (isEditStage)
      stageOptions = `<option value="${editData.stage}" selected>Stage ${editData.stage}</option>`;
    else stageOptions = `<option value="1" selected>Stage 1</option>`;
    const totalInvoiceEditable =
      !isEdit || (!isEditStage && !isAddStage) || isSmallExpense;
    const totalInvoiceValue = isEdit
      ? editData.totalInvoice || editData.amount || 0
      : isSmallExpense
        ? ""
        : "";
    body.innerHTML = `<label ${labelStyle}>ID</label><input value="${isEdit ? editData.paymentId || "Auto-generated" : "Auto-generated"}" disabled style="${largeInput} background:#f0f0f0;"><input type="hidden" id="pay_id_hidden" value="${escapeAttr(isEdit ? editData.paymentId : "")}"><input type="hidden" id="pay_group_id" value="${escapeAttr(isEdit && editData.paymentGroupId ? editData.paymentGroupId : "")}"><label ${labelStyle}>Direction</label><select id="pay_dir" ${largeInput} onchange="window.onPaymentDirectionChange()">
<option value="Client Receipt" ${currentDir === "Client Receipt" ? "selected" : ""}>Client Receipt</option>
<option value="Outgoing Payment" ${currentDir === "Outgoing Payment" ? "selected" : ""}>Outgoing Payment</option>
<option value="Small Expense" ${currentDir === "Small Expense" ? "selected" : ""}>Small Expense</option>
</select><label ${labelStyle}>Payee</label><div id="pay_payee_wrap">${payeeFieldHtml(currentDir)}</div><label ${labelStyle}>Category</label><select id="pay_cat" ${largeInput}><option value="">--</option><option value="Labour" ${isEdit && editData.expenseCategory === "Labour" ? "selected" : ""}>Labour</option><option value="Materials" ${isEdit && editData.expenseCategory === "Materials" ? "selected" : ""}>Materials</option><option value="Subcontractor Cost" ${isEdit && editData.expenseCategory === "Subcontractor Cost" ? "selected" : ""}>Subcontractor Cost</option><option value="Transport" ${isEdit && editData.expenseCategory === "Transport" ? "selected" : ""}>Transport</option><option value="Misc" ${isEdit && editData.expenseCategory === "Misc" ? "selected" : ""}>Misc</option></select><label ${labelStyle}>Total Invoice (₦)</label><input id="pay_total_invoice" type="number" step="0.01" value="${escapeAttr(totalInvoiceValue)}" ${totalInvoiceEditable ? largeInput : largeInput + ' style="' + largeInput.split('style="')[1].split('"')[0] + '; background:#f0f0f0;"'} ${totalInvoiceEditable ? "" : "disabled"} oninput="window.recalcPaymentBalance()"><div id="pay_staging_wrap" style="display:${isSmallExpense ? "none" : "block"};"><div style="display:flex; justify-content:space-between; align-items:center; background:var(--card-light); padding:12px; border-radius:12px; margin-top:8px; border:1.5px solid var(--border);"><span style="font-weight:700; font-size:13px;">Payments to Date</span><span id="pay_payments_to_date" style="font-weight:900; font-size:18px; color:var(--muted);">₦0.00</span></div><div style="display:flex; justify-content:space-between; align-items:center; background:var(--card-light); padding:12px; border-radius:12px; margin-top:8px; border:1.5px solid var(--border);"><span style="font-weight:700; font-size:13px;">${currentDir === "Client Receipt" ? "Outstanding Balance" : "Balance"}</span><span id="pay_balance" style="font-weight:900; font-size:18px; color:var(--primary);">₦0.00</span></div><div style="border-top: 2px solid var(--border); margin: 16px 0;"></div><label ${labelStyle}>Stage</label><select id="pay_stage" ${largeInput}>${stageOptions}</select></div><label ${labelStyle}>${isSmallExpense ? "Amount" : "Stage Amount"} (₦)</label><input id="pay_amount" type="number" step="0.01" value="${escapeAttr(isEdit ? editData.amount : "")}" ${largeInput} oninput="window.validateStageAmount()"><p id="pay_amount_hint" style="font-size:12px; color:var(--muted); margin-top:4px; display:none;"></p><label ${labelStyle}>Method</label><select id="pay_method" ${largeInput}><option value="Cash" ${isEdit && editData.paymentMethod === "Cash" ? "selected" : ""}>Cash</option><option value="Transfer" ${!isEdit || editData.paymentMethod === "Transfer" ? "selected" : ""}>Transfer</option><option value="POS" ${isEdit && editData.paymentMethod === "POS" ? "selected" : ""}>POS</option></select><label ${labelStyle}>Notes</label><textarea id="pay_notes" rows="2" ${largeInput}>${escapeHtml(isEdit ? editData.notes : "")}</textarea><div id="paymentAttachmentsPreviews" class="modal-preview-grid" style="display:none;"></div><label class="icon-upload-label"><i class="fas fa-paperclip"></i><input type="file" id="pay_files" accept="image/*,application/pdf" multiple style="display:none"></label>`;
    if (currentModalFiles.length)
      populateModalInlineImageGalleryPreviews("paymentAttachmentsPreviews");
    document.getElementById("pay_files").onchange = (e) =>
      processIncomingMultiAttachments(
        e.target.files,
        "paymentAttachmentsPreviews",
      );
    document.getElementById("pay_dir").onchange = (e) => {
      document.getElementById("pay_payee_wrap").innerHTML = payeeFieldHtml(
        e.target.value,
      );
      window.onPaymentDirectionChange();
    };
    window.recalcPaymentBalance();
    document.getElementById("pay_amount").addEventListener("input", () => {
      if (document.getElementById("pay_dir").value === "Small Expense") {
        const amt = document.getElementById("pay_amount").value;
        document.getElementById("pay_total_invoice").value = amt;
        window.recalcPaymentBalance();
      }
    });
    submit.onclick = () => {
      const direction = document.getElementById("pay_dir").value;
      const isSmall = direction === "Small Expense";
      const totalInvoice = roundMoney(
        Number(document.getElementById("pay_total_invoice").value) || 0,
      );
      if (!isSmall && (!totalInvoice || totalInvoice <= 0)) {
        alert("Enter a valid Total Invoice amount");
        return;
      }
      const payee = document.getElementById("pay_payee").value;
      if (!payee) {
        alert("Select or enter a payee");
        return;
      }
      const stageAmount = roundMoney(
        Number(document.getElementById("pay_amount").value) || 0,
      );
      if (!stageAmount || stageAmount <= 0) {
        alert("Enter a valid payment amount");
        return;
      }
      const stage = isSmall ? "" : document.getElementById("pay_stage").value;
      if (!isSmall && stage) {
        const balanceText = document
          .getElementById("pay_balance")
          .innerText.replace(/[₦,]/g, "");
        const balance = roundMoney(Number(balanceText) || 0);
        if (stageAmount > balance) {
          alert(
            `Stage amount cannot exceed the ${direction === "Client Receipt" ? "Outstanding Balance" : "Balance"} (₦${moneyValue(balance)})`,
          );
          return;
        }
      }
      submit.disabled = true;
      submit.innerText = "Saving...";
      let paymentGroupId = document.getElementById("pay_group_id").value;
      if (!isEdit && !isSmall && !paymentGroupId)
        paymentGroupId = "PAY-GRP-" + Date.now();

      // ✅ FIX: distinguish "Add Stage" (new record) from true edit
      const isRealEdit = isEdit && editData.paymentId;

      const payload = {
        paymentId: isRealEdit ? editData.paymentId : "PAY-" + Date.now(),
        projectId: getCurrentProjectId(),
        paymentDate: todayFormatted(),
        paymentDirection: direction,
        payee: payee,
        expenseCategory: document.getElementById("pay_cat").value,
        referenceId: "",
        amount: stageAmount,
        totalInvoice: isSmall ? stageAmount : totalInvoice,
        paymentMethod: document.getElementById("pay_method").value,
        status: "",
        stage: stage,
        paymentGroupId:
          paymentGroupId || (isRealEdit ? editData.paymentGroupId : ""),
        notes: document.getElementById("pay_notes").value,
        attachments: normalizeAttachments(currentModalFiles),
      };
      callApi(isRealEdit ? "updatePayment" : "savePayment", payload)
        .then(() => {
          closeModal();
          loadPaymentsListings(true);
        })
        .catch(resetSubmitOnError(submit));
    };
  }
}


function addTakeOffGroupLine() {
  const tbody = document.getElementById("to_group_items_body");
  if (!tbody) return;
  const unitOptions = MASTER_UNITS.map(
    (u) => `<option value="${escapeAttr(u.value)}">${escapeHtml(u.label)}</option>`,
  ).join("");
  const row = document.createElement("tr");
  row.className = "to-group-line";
  row.innerHTML = `<td style="padding:4px; border-bottom:1px solid var(--border);"><input class="to-line-desc" value="" placeholder="Description" style="width:100%; padding:8px; font-size:14px; border:1.5px solid var(--border); border-radius:8px;"></td>
  <td style="padding:4px; border-bottom:1px solid var(--border); width:60px;"><input class="to-line-qty" type="number" value="" placeholder="Qty" min="0" step="0.01" style="width:100%; padding:8px; font-size:14px; border:1.5px solid var(--border); border-radius:8px; text-align:right;"></td>
  <td style="padding:4px; border-bottom:1px solid var(--border); width:90px;"><select class="to-line-unit" style="width:100%; padding:8px; font-size:14px; border:1.5px solid var(--border); border-radius:8px;"><option value="" disabled selected>Select unit</option>${unitOptions}</select></td>
  <td style="padding:4px; border-bottom:1px solid var(--border);"><input class="to-line-notes" value="" placeholder="Notes" style="width:100%; padding:8px; font-size:14px; border:1.5px solid var(--border); border-radius:8px;"></td>
  <td style="padding:4px; border-bottom:1px solid var(--border); width:30px; text-align:center;"><button onclick="this.closest('tr').remove();" style="background:var(--danger); color:white; border:none; border-radius:6px; cursor:pointer; width:28px; height:28px; font-size:14px;">×</button></td>`;
  tbody.appendChild(row);
}
window.addTakeOffGroupLine = addTakeOffGroupLine;
