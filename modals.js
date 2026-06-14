// modals.js
import { escapeHtml, escapeAttr, splitAttachments, normalizeAttachments, compressImageToTargetLimit, getDirectImageUrl, getGPSLocation, paymentDirectionOf, isClientReceipt, isPettyExpense, generateUniqueId } from './utils.js';
import { callApi, getCache, getCurrentProjectId, setCache, ApiError } from './api.js';
import { refreshMasterDashboard, refreshVendorsListView } from './dashboard.js';
import { loadProjectConsoleHub, loadInspectionListings, loadTakeOffListings, loadProgressTimelineFeed, loadWorkOrdersListings, loadPaymentsListings } from './console.js';

let currentModalFiles = [];
let currentAvatarPhoto = "";

const PLACEHOLDER_AVATAR = 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%3E%3Cpath%20fill%3D%22%23666%22%20d%3D%22M12%2012c2.21%200%204-1.79%204-4s-1.79-4-4-4-4%201.79-4%204%201.79%204%204%204zm0%202c-2.67%200-8%201.34-8%204v2h16v-2c0-2.66-5.33-4-8-4z%22%3E%3C%2Fpath%3E%3C%2Fsvg%3E';

// ======================== ATTACHMENT PREVIEW HELPERS ========================

export function populateModalInlineImageGalleryPreviews(containerId) {
  const box = document.getElementById(containerId);
  if (!box) return;
  if (!currentModalFiles.length) { box.innerHTML = ''; box.style.display = 'none'; return; }
  box.style.display = 'flex';
  box.innerHTML = currentModalFiles.map((url, idx) => {
    const src = url.startsWith('data:') ? url : getDirectImageUrl(url);
    const isPdf = url.startsWith('data:application/pdf') || /\.pdf($|\?)/i.test(url);
    const thumb = isPdf
      ? `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#f0f0f0;border-radius:8px;border:1px solid #000;font-size:22px;"><i class="fas fa-file-pdf"></i></div>`
      : `<img src="${escapeAttr(src)}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;border:1px solid #000;">`;
    return `<div style="position:relative; width:60px; height:60px;">${thumb}<div onclick="window.removeAttachmentByIndex(${idx}, '${containerId}')" style="position:absolute; top:-6px; right:-6px; width:24px; height:24px; background:#f00; color:#fff; border-radius:50%; display:flex; align-items:center; justify-content:center; cursor:pointer; font-size:16px; border:2px solid #fff;">&times;</div></div>`;
  }).join('');
}

export function removeAttachmentByIndex(idx, containerId) { currentModalFiles.splice(idx,1); populateModalInlineImageGalleryPreviews(containerId); }

export function processIncomingMultiAttachments(files, previewId) {
  if (!files.length) return;
  Array.from(files).forEach(file => {
    const reader = new FileReader();
    reader.onload = async (ev) => {
      let data = ev.target.result;
      try {
        if (!file.type.includes('pdf')) data = await compressImageToTargetLimit(data, 190000);
        currentModalFiles.push(data);
        populateModalInlineImageGalleryPreviews(previewId);
      } catch (err) {
        console.error('Failed to process attachment', err);
        alert(`Could not process "${file.name}". Please try a different file.`);
      }
    };
    reader.onerror = () => {
      console.error('Failed to read file', file.name, reader.error);
      alert(`Could not read "${file.name}". Please try again.`);
    };
    reader.readAsDataURL(file);
  });
}

// ======================== VENDOR AVATAR HELPERS ========================

export function clearVendorAvatarPhoto() {
  currentAvatarPhoto = "";
  const img = document.getElementById('passport_frame_view');
  if (img) img.src = PLACEHOLDER_AVATAR;
  const btn = document.getElementById('v_pass_remove_btn');
  if (btn) btn.style.display = 'none';
}

export function handleVendorAvatarUpload(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (ev) => {
    try {
      const compressed = await compressImageToTargetLimit(ev.target.result, 190000);
      currentAvatarPhoto = compressed;
      const img = document.getElementById('passport_frame_view');
      if (img) img.src = compressed;
      const btn = document.getElementById('v_pass_remove_btn');
      if (btn) btn.style.display = 'block';
    } catch (err) {
      console.error('Failed to process avatar', err);
      alert('Could not process that image. Please try a different photo.');
    }
  };
  reader.onerror = () => alert('Could not read the selected image.');
  reader.readAsDataURL(file);
}

// ======================== ID GENERATION ========================

export function generateFrontendPreviewId(type) {
  const cache = getCache();
  const yy = new Date().getFullYear().toString().slice(-2);
  const prefix = type === 'project' ? `PRJ/${yy}/` : `WKO/${yy}/`;
  const dataset = type === 'project' ? cache.projects : cache.workorders;
  let max = 0;
  (dataset || []).forEach(item => {
    const id = String(item[type === 'project' ? 'projectId' : 'workOrderId'] || '');
    if (id.startsWith(prefix)) {
      const num = parseInt(id.substring(prefix.length));
      if (!isNaN(num) && num > max) max = num;
    }
  });
  return prefix + String(max+1).padStart(3, '0');
}

// ======================== DATE CONVERSION ========================

function toDateInputValue(dateStr) {
  if (!dateStr) {
    const today = new Date();
    return today.toISOString().slice(0, 10);
  }
  const ddmmyyyy = String(dateStr).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmmyyyy) {
    const [, d, m, y] = ddmmyyyy;
    return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) return dateStr.slice(0, 10);
  const today = new Date();
  return today.toISOString().slice(0, 10);
}

// ======================== MODAL OPEN/CLOSE ========================

export function closeModal() { document.getElementById('modalOverlay').style.display = 'none'; }

async function submitWithGuard(submitBtn, fn) {
  submitBtn.disabled = true;
  submitBtn.innerText = "Saving...";
  try {
    await fn();
  } catch (err) {
    if (err instanceof ApiError) {
      // callApi already alerted the user
    } else {
      console.error(err);
      alert("Something went wrong while saving. Please try again.");
    }
    submitBtn.disabled = false;
    submitBtn.innerText = "Save";
  }
}

export async function openModal(type, editData = null) {
  const body = document.getElementById('modalBody');
  const submit = document.getElementById('modalSubmit');
  const title = document.getElementById('modalTitle');
  const overlay = document.getElementById('modalOverlay');
  const isEdit = !!editData;
  overlay.style.display = 'flex';
  body.innerHTML = '';
  submit.disabled = false;
  submit.innerText = "Save";
  currentModalFiles = [];
  currentAvatarPhoto = "";

  const labelStyle = 'style="display:block; font-weight:800; margin-top:12px; margin-bottom:4px;"';
  const largeInput = 'style="width:100%; padding:12px; font-size:16px;"';

  // ==================== PROJECT ====================
  if (type === 'project') {
    title.innerText = isEdit ? "Edit Project" : "New Project";
    body.innerHTML = `
      <label ${labelStyle}>Project ID</label><input value="${escapeAttr(isEdit ? editData.projectId : generateFrontendPreviewId('project'))}" disabled style="${largeInput} background:#f0f0f0;">
      <label ${labelStyle}>Client Name</label><input id="p_client" value="${escapeAttr(isEdit?editData.clientName:'')}" ${largeInput}>
      <label ${labelStyle}>Site Location</label><input id="p_loc" value="${escapeAttr(isEdit?editData.siteLocation:'')}" ${largeInput}>
      <label ${labelStyle}>Client Phone (11 digits)</label><input id="p_phone" type="tel" maxlength="11" oninput="this.value=this.value.replace(/[^0-9]/g,'')" value="${escapeAttr(isEdit?editData.clientPhone:'')}" ${largeInput}>
      <label ${labelStyle}>Client Email</label><input id="p_email" type="email" value="${escapeAttr(isEdit?editData.clientEmail:'')}" ${largeInput}>
      <label ${labelStyle}>Status</label><select id="p_status" ${largeInput}><option value="Active" ${isEdit&&editData.projectStatus==='Active'?'selected':''}>Active</option><option value="In Planning" ${isEdit&&editData.projectStatus==='In Planning'?'selected':''}>In Planning</option><option value="Complete" ${isEdit&&editData.projectStatus==='Complete'?'selected':''}>Complete</option></select>
      <label ${labelStyle}>Notes</label><textarea id="p_notes" rows="2" ${largeInput}>${escapeHtml(isEdit?editData.notes:'')}</textarea>
    `;
    submit.onclick = () => {
      const phone = document.getElementById('p_phone').value.trim();
      if (phone && !/^\d{11}$/.test(phone)) { alert("Phone must be 11 digits"); return; }
      const payload = {
        projectId: isEdit ? editData.projectId : generateFrontendPreviewId('project'),
        clientName: document.getElementById('p_client').value,
        siteLocation: document.getElementById('p_loc').value,
        clientPhone: phone,
        clientEmail: document.getElementById('p_email').value,
        projectStatus: document.getElementById('p_status').value,
        notes: document.getElementById('p_notes').value,
        lastModified: Date.now()
      };
      submitWithGuard(submit, async () => {
        await callApi(isEdit ? 'updateProject' : 'saveProject', payload);
        closeModal();
        await refreshMasterDashboard();
        if (isEdit) loadProjectConsoleHub(payload.projectId);
      });
    };
  }

  // ==================== INSPECTION ====================
  else if (type === 'inspection') {
    title.innerText = isEdit ? "Edit Inspection" : "New Inspection";
    const projectId = isEdit ? editData.projectId : getCurrentProjectId();
    const inspectionId = isEdit ? editData.inspectionId : generateUniqueId('INS');
    currentModalFiles = isEdit ? splitAttachments(editData.attachments) : [];

    body.innerHTML = `
      <label ${labelStyle}>Inspection Date</label><input id="i_date" type="date" value="${escapeAttr(isEdit ? toDateInputValue(editData.inspectionDate) : toDateInputValue())}" ${largeInput}>
      <label ${labelStyle}>Inspection Type</label>
      <select id="i_type" ${largeInput}>
        ${['Site Visit','Quality Check','Snag List','Pre-Handover','Other'].map(t => `<option value="${escapeAttr(t)}" ${isEdit && editData.inspectionType===t ? 'selected':''}>${escapeHtml(t)}</option>`).join('')}
      </select>
      <label ${labelStyle}>Area Inspected</label><input id="i_area" value="${escapeAttr(isEdit?editData.areaInspected:'')}" ${largeInput} placeholder="e.g. Master Bedroom, Roof, Foundation">
      <label ${labelStyle}>Site Condition</label><textarea id="i_condition" rows="3" ${largeInput} placeholder="Describe what you observed...">${escapeHtml(isEdit?editData.siteCondition:'')}</textarea>
      <label ${labelStyle}>Recommendations</label><textarea id="i_recs" rows="2" ${largeInput}>${escapeHtml(isEdit?editData.recommendations:'')}</textarea>
      <label ${labelStyle}>Photos / Attachments</label>
      <label class="icon-upload-label" for="i_files"><i class="fas fa-camera"></i></label>
      <input type="file" id="i_files" accept="image/*,application/pdf" multiple style="display:none;">
      <div id="i_files_preview" class="modal-preview-grid"></div>
    `;
    populateModalInlineImageGalleryPreviews('i_files_preview');
    document.getElementById('i_files').addEventListener('change', (e) => processIncomingMultiAttachments(e.target.files, 'i_files_preview'));

    submit.onclick = () => {
      if (!projectId) { alert("No project selected."); return; }
      const payload = {
        inspectionId,
        projectId,
        inspectionDate: document.getElementById('i_date').value,
        inspectionType: document.getElementById('i_type').value,
        areaInspected: document.getElementById('i_area').value,
        siteCondition: document.getElementById('i_condition').value,
        recommendations: document.getElementById('i_recs').value,
        attachments: normalizeAttachments(currentModalFiles),
        lastModified: Date.now()
      };
      submitWithGuard(submit, async () => {
        await callApi(isEdit ? 'updateInspection' : 'saveInspection', payload);
        closeModal();
        await loadInspectionListings();
      });
    };
  }

  // ==================== TAKE-OFF ITEM ====================
  else if (type === 'takeoff_item') {
    title.innerText = isEdit ? "Edit Take-Off Item" : "New Take-Off Item";
    const projectId = isEdit ? editData.projectId : getCurrentProjectId();
    const itemId = isEdit ? editData.itemId : generateUniqueId('TKO');
    currentModalFiles = isEdit ? splitAttachments(editData.beforePhotoUrl) : [];

    body.innerHTML = `
      <label ${labelStyle}>Room / Area</label><input id="t_room" value="${escapeAttr(isEdit?editData.roomArea:'')}" ${largeInput} placeholder="e.g. Living Room">
      <label ${labelStyle}>Trade Category</label>
      <select id="t_trade" ${largeInput}>
        ${['Civil/Structural','Electrical','Plumbing','Carpentry','Painting','Tiling','HVAC','Roofing','Other'].map(t => `<option value="${escapeAttr(t)}" ${isEdit && editData.tradeCategory===t ? 'selected':''}>${escapeHtml(t)}</option>`).join('')}
      </select>
      <label ${labelStyle}>Description</label><textarea id="t_desc" rows="2" ${largeInput}>${escapeHtml(isEdit?editData.description:'')}</textarea>
      <div style="display:flex; gap:10px;">
        <div style="flex:1;"><label ${labelStyle}>Quantity</label><input id="t_qty" type="number" step="any" value="${escapeAttr(isEdit?editData.quantity:'')}" ${largeInput}></div>
        <div style="flex:1;"><label ${labelStyle}>Unit</label><input id="t_unit" value="${escapeAttr(isEdit?editData.unit:'')}" ${largeInput} placeholder="e.g. sqm, pcs, m"></div>
      </div>
      <label ${labelStyle}>Scope Notes</label><textarea id="t_notes" rows="2" ${largeInput}>${escapeHtml(isEdit?editData.scopeNotes:'')}</textarea>
      <label ${labelStyle}>Before Photo(s)</label>
      <label class="icon-upload-label" for="t_files"><i class="fas fa-camera"></i></label>
      <input type="file" id="t_files" accept="image/*,application/pdf" multiple style="display:none;">
      <div id="t_files_preview" class="modal-preview-grid"></div>
    `;
    populateModalInlineImageGalleryPreviews('t_files_preview');
    document.getElementById('t_files').addEventListener('change', (e) => processIncomingMultiAttachments(e.target.files, 't_files_preview'));

    if (isEdit) {
      submit.insertAdjacentHTML('beforebegin', `<button id="modalDelete" class="action-btn" style="background:var(--danger); margin-top:10px;">Delete Item</button>`);
      document.getElementById('modalDelete').onclick = () => {
        if (!confirm("Delete this take-off item?")) return;
        submitWithGuard(submit, async () => {
          await callApi('deleteTakeOffItem', { itemId });
          closeModal();
          await loadTakeOffListings();
        });
      };
    }

    submit.onclick = () => {
      if (!projectId) { alert("No project selected."); return; }
      const payload = {
        itemId,
        projectId,
        roomArea: document.getElementById('t_room').value,
        tradeCategory: document.getElementById('t_trade').value,
        description: document.getElementById('t_desc').value,
        quantity: document.getElementById('t_qty').value,
        unit: document.getElementById('t_unit').value,
        beforePhotoUrl: normalizeAttachments(currentModalFiles),
        scopeNotes: document.getElementById('t_notes').value,
        lastModified: Date.now()
      };
      submitWithGuard(submit, async () => {
        await callApi(isEdit ? 'updateTakeOffItem' : 'saveTakeOffItem', payload);
        closeModal();
        await loadTakeOffListings();
      });
    };
  }

  // ==================== PROGRESS ENTRY ====================
  else if (type === 'progress_entry') {
    title.innerText = isEdit ? "Edit Progress Log" : "Log Progress";
    const projectId = isEdit ? editData.projectId : getCurrentProjectId();
    const logId = isEdit ? editData.logId : generateUniqueId('PRG');
    currentModalFiles = isEdit ? splitAttachments(editData.progressPhotoUrl) : [];

    body.innerHTML = `
      <label ${labelStyle}>Trade Category</label>
      <select id="g_trade" ${largeInput}>
        ${['Civil/Structural','Electrical','Plumbing','Carpentry','Painting','Tiling','HVAC','Roofing','Other'].map(t => `<option value="${escapeAttr(t)}" ${isEdit && editData.tradeCategory===t ? 'selected':''}>${escapeHtml(t)}</option>`).join('')}
      </select>
      <label ${labelStyle}>Completion Percentage</label>
      <input id="g_pct" type="number" min="0" max="100" value="${escapeAttr(isEdit?editData.completionPercentage:'0')}" ${largeInput}>
      <label ${labelStyle}>Comment / Narrative</label>
      <textarea id="g_comment" rows="3" ${largeInput} placeholder="Describe progress made...">${escapeHtml(isEdit?editData.commentNarrative:'')}</textarea>
      <label ${labelStyle}>Progress Photo(s)</label>
      <label class="icon-upload-label" for="g_files"><i class="fas fa-camera"></i></label>
      <input type="file" id="g_files" accept="image/*,application/pdf" multiple style="display:none;">
      <div id="g_files_preview" class="modal-preview-grid"></div>
    `;
    populateModalInlineImageGalleryPreviews('g_files_preview');
    document.getElementById('g_files').addEventListener('change', (e) => processIncomingMultiAttachments(e.target.files, 'g_files_preview'));

    submit.onclick = () => {
      if (!projectId) { alert("No project selected."); return; }
      const pct = Number(document.getElementById('g_pct').value);
      if (isNaN(pct) || pct < 0 || pct > 100) { alert("Completion percentage must be between 0 and 100."); return; }
      const payload = {
        logId,
        projectId,
        tradeCategory: document.getElementById('g_trade').value,
        completionPercentage: pct,
        commentNarrative: document.getElementById('g_comment').value,
        progressPhotoUrl: normalizeAttachments(currentModalFiles),
        lastModified: Date.now()
      };
      submitWithGuard(submit, async () => {
        await callApi('saveProgressLog', payload);
        closeModal();
        await loadProgressTimelineFeed();
      });
    };
  }

  // ==================== VENDOR ====================
  else if (type === 'vendor') {
    title.innerText = isEdit ? "Edit Vendor" : "New Vendor";
    const vendorId = isEdit ? editData.vendorId : generateUniqueId('VND');
    currentModalFiles = isEdit ? splitAttachments(editData.attachments) : [];
    currentAvatarPhoto = isEdit && editData.passport ? editData.passport : "";
    const avatarSrc = currentAvatarPhoto
      ? (currentAvatarPhoto.startsWith('data:') ? currentAvatarPhoto : getDirectImageUrl(currentAvatarPhoto))
      : PLACEHOLDER_AVATAR;

    body.innerHTML = `
      <div class="passport-frame-container">
        <img id="passport_frame_view" src="${escapeAttr(avatarSrc)}" style="width:100%; height:100%; object-fit:cover;">
      </div>
      <div style="display:flex; gap:10px; justify-content:center; margin-bottom:10px;">
        <label class="icon-upload-label" for="v_passport_file" style="margin:0;"><i class="fas fa-camera"></i></label>
        <input type="file" id="v_passport_file" accept="image/*" style="display:none;">
        <button type="button" id="v_pass_remove_btn" class="action-btn" style="width:auto; padding:0 16px; background:var(--danger); display:${currentAvatarPhoto ? 'block':'none'};" onclick="window.clearVendorAvatarPhoto()">Remove Photo</button>
      </div>
      <label ${labelStyle}>Company / Vendor Name</label><input id="v_company" value="${escapeAttr(isEdit?editData.company:'')}" ${largeInput}>
      <label ${labelStyle}>Trade</label><input id="v_trade" value="${escapeAttr(isEdit?editData.trade:'')}" ${largeInput} placeholder="e.g. Plumbing, Electrical">
      <label ${labelStyle}>Contact Name</label><input id="v_contact" value="${escapeAttr(isEdit?editData.contactName:'')}" ${largeInput}>
      <label ${labelStyle}>Phone 1 (11 digits)</label><input id="v_phone1" type="tel" maxlength="11" oninput="this.value=this.value.replace(/[^0-9]/g,'')" value="${escapeAttr(isEdit?editData.phone1:'')}" ${largeInput}>
      <label ${labelStyle}>Phone 2 (optional)</label><input id="v_phone2" type="tel" maxlength="11" oninput="this.value=this.value.replace(/[^0-9]/g,'')" value="${escapeAttr(isEdit?editData.phone2:'')}" ${largeInput}>
      <label ${labelStyle}>Email</label><input id="v_email" type="email" value="${escapeAttr(isEdit?editData.email:'')}" ${largeInput}>
      <label ${labelStyle}>Other Attachments (certs, ID, etc.)</label>
      <label class="icon-upload-label" for="v_files"><i class="fas fa-paperclip"></i></label>
      <input type="file" id="v_files" accept="image/*,application/pdf" multiple style="display:none;">
      <div id="v_files_preview" class="modal-preview-grid"></div>
      ${isEdit ? `<label ${labelStyle}>Archived</label><select id="v_archived" ${largeInput}><option value="No" ${editData.archived!=='Yes'?'selected':''}>No</option><option value="Yes" ${editData.archived==='Yes'?'selected':''}>Yes</option></select>` : ''}
    `;
    populateModalInlineImageGalleryPreviews('v_files_preview');
    document.getElementById('v_files').addEventListener('change', (e) => processIncomingMultiAttachments(e.target.files, 'v_files_preview'));
    document.getElementById('v_passport_file').addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) handleVendorAvatarUpload(e.target.files[0]);
    });

    if (isEdit) {
      submit.insertAdjacentHTML('beforebegin', `<button id="modalDelete" class="action-btn" style="background:var(--danger); margin-top:10px;">Delete Vendor</button>`);
      document.getElementById('modalDelete').onclick = () => {
        if (!confirm("Delete this vendor? This cannot be undone.")) return;
        submitWithGuard(submit, async () => {
          await callApi('deleteVendor', { vendorId });
          closeModal();
          await refreshVendorsListView();
        });
      };
    }

    submit.onclick = () => {
      const phone1 = document.getElementById('v_phone1').value.trim();
      const phone2 = document.getElementById('v_phone2').value.trim();
      if (phone1 && !/^\d{11}$/.test(phone1)) { alert("Phone 1 must be 11 digits"); return; }
      if (phone2 && !/^\d{11}$/.test(phone2)) { alert("Phone 2 must be 11 digits"); return; }
      const company = document.getElementById('v_company').value.trim();
      if (!company) { alert("Company / Vendor name is required."); return; }
      const payload = {
        vendorId,
        company,
        trade: document.getElementById('v_trade').value,
        contactName: document.getElementById('v_contact').value,
        phone1, phone2,
        email: document.getElementById('v_email').value,
        passport: currentAvatarPhoto,
        attachments: normalizeAttachments(currentModalFiles),
        lastModified: Date.now()
      };
      if (isEdit) payload.archived = document.getElementById('v_archived').value;
      submitWithGuard(submit, async () => {
        await callApi(isEdit ? 'updateVendor' : 'saveVendor', payload);
        closeModal();
        await refreshVendorsListView();
      });
    };
  }

  // ==================== WORK ORDER ====================
  else if (type === 'workorder') {
    title.innerText = isEdit ? "Edit Work Order" : "New Work Order";
    const projectId = isEdit ? editData.projectId : getCurrentProjectId();
    const workOrderId = isEdit ? editData.workOrderId : null;
    currentModalFiles = isEdit ? splitAttachments(editData.attachments) : [];

    const cache = getCache();
    const vendors = cache.vendors || [];
    const vendorOptions = vendors.map(v => `<option value="${escapeAttr(v.vendorId)}" ${isEdit && editData.vendorId===v.vendorId ? 'selected':''}>${escapeHtml(v.company)} (${escapeHtml(v.trade)})</option>`).join('');

    body.innerHTML = `
      <label ${labelStyle}>Vendor</label>
      <select id="w_vendor" ${largeInput}>
        <option value="">-- Select Vendor --</option>
        ${vendorOptions}
      </select>
      <label ${labelStyle}>Description</label><textarea id="w_desc" rows="2" ${largeInput}>${escapeHtml(isEdit?editData.description:'')}</textarea>
      <label ${labelStyle}>Amount (₦)</label><input id="w_amount" type="number" step="any" value="${escapeAttr(isEdit?editData.amount:'')}" ${largeInput}>
      <label ${labelStyle}>Status</label>
      <select id="w_status" ${largeInput}>
        ${['Pending','In Progress','Completed','Cancelled'].map(s => `<option value="${escapeAttr(s)}" ${isEdit && editData.status===s ? 'selected':''}>${escapeHtml(s)}</option>`).join('')}
      </select>
      <label ${labelStyle}>Attachments</label>
      <label class="icon-upload-label" for="w_files"><i class="fas fa-paperclip"></i></label>
      <input type="file" id="w_files" accept="image/*,application/pdf" multiple style="display:none;">
      <div id="w_files_preview" class="modal-preview-grid"></div>
    `;
    populateModalInlineImageGalleryPreviews('w_files_preview');
    document.getElementById('w_files').addEventListener('change', (e) => processIncomingMultiAttachments(e.target.files, 'w_files_preview'));
    if (!vendors.length) {
      const note = document.createElement('p');
      note.style.fontSize = '12px';
      note.style.color = 'var(--muted)';
      note.innerText = 'No vendors loaded yet — visit the Vendors tab first if the list above is empty.';
      body.insertBefore(note, body.firstChild);
    }

    submit.onclick = () => {
      if (!projectId) { alert("No project selected."); return; }
      const vendorId = document.getElementById('w_vendor').value;
      if (!vendorId) { alert("Please select a vendor."); return; }
      const payload = {
        workOrderId: isEdit ? workOrderId : undefined,
        projectId,
        vendorId,
        description: document.getElementById('w_desc').value,
        amount: document.getElementById('w_amount').value,
        status: document.getElementById('w_status').value,
        attachments: normalizeAttachments(currentModalFiles),
        lastModified: Date.now()
      };
      submitWithGuard(submit, async () => {
        await callApi(isEdit ? 'updateWorkOrder' : 'saveWorkOrder', payload);
        closeModal();
        await loadWorkOrdersListings();
      });
    };
  }

  // ==================== PAYMENT ====================
  else if (type === 'payment') {
    title.innerText = isEdit ? "Edit Payment" : "Log Payment";
    const projectId = isEdit ? editData.projectId : getCurrentProjectId();
    const paymentId = isEdit ? editData.paymentId : null;
    currentModalFiles = isEdit ? splitAttachments(editData.attachments) : [];

    const directions = ['Client Receipt','Outgoing Payment','Small Expense'];
    const currentDirection = isEdit ? paymentDirectionOf(editData) : 'Outgoing Payment';

    body.innerHTML = `
      <label ${labelStyle}>Payment Date</label><input id="pm_date" type="date" value="${escapeAttr(isEdit ? toDateInputValue(editData.paymentDate) : toDateInputValue())}" ${largeInput}>
      <label ${labelStyle}>Direction</label>
      <select id="pm_direction" ${largeInput}>
        ${directions.map(d => `<option value="${escapeAttr(d)}" ${currentDirection===d ? 'selected':''}>${escapeHtml(d)}</option>`).join('')}
      </select>
      <label ${labelStyle}>Payee / Source</label><input id="pm_payee" value="${escapeAttr(isEdit?editData.payee:'')}" ${largeInput} placeholder="e.g. Client, Vendor name">
      <label ${labelStyle}>Expense Category (if applicable)</label><input id="pm_category" value="${escapeAttr(isEdit?editData.expenseCategory:'')}" ${largeInput} placeholder="e.g. Materials, Transport">
      <label ${labelStyle}>Amount (₦)</label><input id="pm_amount" type="number" step="any" value="${escapeAttr(isEdit?editData.amount:'')}" ${largeInput}>
      <label ${labelStyle}>Payment Method</label>
      <select id="pm_method" ${largeInput}>
        ${['Cash','Bank Transfer','Cheque','Card','Mobile Money','Other'].map(m => `<option value="${escapeAttr(m)}" ${isEdit && editData.paymentMethod===m ? 'selected':''}>${escapeHtml(m)}</option>`).join('')}
      </select>
      <label ${labelStyle}>Reference / Receipt No.</label><input id="pm_ref" value="${escapeAttr(isEdit?editData.referenceId:'')}" ${largeInput}>
      <label ${labelStyle}>Status</label>
      <select id="pm_status" ${largeInput}>
        ${['Logged','Cleared','Pending'].map(s => `<option value="${escapeAttr(s)}" ${isEdit && editData.status===s ? 'selected':''}>${escapeHtml(s)}</option>`).join('')}
      </select>
      <label ${labelStyle}>Notes</label><textarea id="pm_notes" rows="2" ${largeInput}>${escapeHtml(isEdit?editData.notes:'')}</textarea>
      <label ${labelStyle}>Receipt / Attachments</label>
      <label class="icon-upload-label" for="pm_files"><i class="fas fa-receipt"></i></label>
      <input type="file" id="pm_files" accept="image/*,application/pdf" multiple style="display:none;">
      <div id="pm_files_preview" class="modal-preview-grid"></div>
    `;
    populateModalInlineImageGalleryPreviews('pm_files_preview');
    document.getElementById('pm_files').addEventListener('change', (e) => processIncomingMultiAttachments(e.target.files, 'pm_files_preview'));

    submit.onclick = () => {
      if (!projectId) { alert("No project selected."); return; }
      const amount = Number(document.getElementById('pm_amount').value);
      if (!amount || amount <= 0) { alert("Please enter a valid amount."); return; }
      const payload = {
        paymentId: isEdit ? paymentId : undefined,
        projectId,
        paymentDate: document.getElementById('pm_date').value,
        paymentDirection: document.getElementById('pm_direction').value,
        payee: document.getElementById('pm_payee').value,
        expenseCategory: document.getElementById('pm_category').value,
        referenceId: document.getElementById('pm_ref').value,
        amount,
        paymentMethod: document.getElementById('pm_method').value,
        status: document.getElementById('pm_status').value,
        notes: document.getElementById('pm_notes').value,
        attachments: normalizeAttachments(currentModalFiles),
        lastModified: Date.now()
      };
      submitWithGuard(submit, async () => {
        await callApi(isEdit ? 'updatePayment' : 'savePayment', payload);
        closeModal();
        await loadPaymentsListings();
      });
    };
  }

  else {
    title.innerText = "Unknown";
    body.innerHTML = `<p>Unsupported modal type: ${escapeHtml(type)}</p>`;
    submit.style.display = 'none';
  }
}

export { removeAttachmentByIndex, clearVendorAvatarPhoto };
