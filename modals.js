// modals.js
import { escapeHtml, escapeAttr, splitAttachments, normalizeAttachments, compressImageToTargetLimit, getDirectImageUrl, getGPSLocation, paymentDirectionOf } from './utils.js';
import { callApi, getCache, getCurrentProjectId, setCache } from './api.js';
import { refreshMasterDashboard, refreshVendorsListView } from './dashboard.js';
import { loadProjectConsoleHub, loadInspectionListings, loadTakeOffListings, loadProgressTimelineFeed, loadWorkOrdersListings, loadPaymentsListings } from './console.js';

let currentModalFiles = [];
let currentAvatarPhoto = "";

// ======================== ATTACHMENT PREVIEW HELPERS ========================
export function populateModalInlineImageGalleryPreviews(containerId) {
  const box = document.getElementById(containerId);
  if (!box) return;
  if (!currentModalFiles.length) { box.innerHTML = ''; box.style.display = 'none'; return; }
  box.style.display = 'flex';
  box.innerHTML = currentModalFiles.map((url, idx) => {
    const src = url.startsWith('data:') ? url : getDirectImageUrl(url);
    return `<div style="position:relative; width:60px; height:60px;"><img src="${src}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;border:1px solid #000;"><div onclick="window.removeAttachmentByIndex(${idx}, '${containerId}')" style="position:absolute; top:-6px; right:-6px; background:red; color:white; border-radius:50%; width:20px; height:20px; text-align:center; line-height:18px; cursor:pointer;">&times;</div></div>`;
  }).join('');
}

export function removeAttachmentByIndex(idx, containerId) { 
  currentModalFiles.splice(idx, 1); 
  populateModalInlineImageGalleryPreviews(containerId); 
}

export function processIncomingMultiAttachments(files, previewId) {
  if (!files.length) return;
  Array.from(files).forEach(file => {
    const reader = new FileReader();
    reader.onload = async (ev) => {
      let data = ev.target.result;
      if (!file.type.includes('pdf')) data = await compressImageToTargetLimit(data, 190000);
      currentModalFiles.push(data);
      populateModalInlineImageGalleryPreviews(previewId);
    };
    reader.readAsDataURL(file);
  });
}

export function clearVendorAvatarPhoto() { 
  currentAvatarPhoto = ""; 
  const img = document.getElementById('passport_frame_view'); 
  if(img) img.src = 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%3E%3Cpath%20fill%3D%22%23666%22%20d%3D%22M12%2012c2.21%200%204-1.79%204-4s-1.79-4-4-4-4%201.79-4%204%201.79%204%204%204zm0%202c-2.67%200-8%201.34-8%204v2h16v-2c0-2.66-5.33-4-8-4z%22%2F%3E%3C%2Fsvg%3E'; 
  const btn = document.getElementById('v_pass_remove_btn'); 
  if(btn) btn.style.display = 'none'; 
}

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

export function closeModal() { 
  document.getElementById('modalOverlay').style.display = 'none'; 
}

// ======================== OPEN MODAL (FULL IMPLEMENTATION) ========================
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

  // ---------- PROJECT ----------
  if (type === 'project') {
    title.innerText = isEdit ? "Edit Project" : "New Project";
    body.innerHTML = `
      <label ${labelStyle}>Project ID</label><input value="${escapeAttr(isEdit ? editData.projectId : generateFrontendPreviewId('project'))}" disabled style="${largeInput} background:#f0f0f0;">
      <label ${labelStyle}>Client Name</label><input id="p_client" value="${escapeAttr(isEdit?editData.clientName:'')}" ${largeInput}>
      <label ${labelStyle}>Site Location</label><input id="p_loc" value="${escapeAttr(isEdit?editData.siteLocation:'')}" ${largeInput}>
      <label ${labelStyle}>Client Phone (11 digits)</label><input id="p_phone" type="tel" maxlength="11" oninput="this.value=this.value.replace(/[^0-9]/g,'')" value="${escapeAttr(isEdit?editData.clientPhone:'')}" ${largeInput}>
      <label ${labelStyle}>Client Email</label><input id="p_email" type="email" value="${escapeAttr(isEdit?editData.clientEmail:'')}" ${largeInput}>
      <label ${labelStyle}>Status</label><select id="p_status" ${largeInput}>
        <option value="Active" ${isEdit&&editData.projectStatus==='Active'?'selected':''}>Active</option>
        <option value="In Planning" ${isEdit&&editData.projectStatus==='In Planning'?'selected':''}>In Planning</option>
        <option value="Handed Over" ${isEdit&&editData.projectStatus==='Handed Over'?'selected':''}>Handed Over</option>
        <option value="Declined" ${isEdit&&editData.projectStatus==='Declined'?'selected':''}>Declined</option>
      </select>
      <label ${labelStyle}>Notes</label><textarea id="p_notes" rows="2" ${largeInput}>${escapeHtml(isEdit?editData.notes:'')}</textarea>
    `;
    submit.onclick = () => {
      const phone = document.getElementById('p_phone').value.trim();
      if (phone && !/^\d{11}$/.test(phone)) { alert("Phone must be 11 digits"); return; }
      submit.disabled = true; submit.innerText = "Saving...";
      const payload = {
        projectId: isEdit ? editData.projectId : generateFrontendPreviewId('project'),
        clientName: document.getElementById('p_client').value,
        siteLocation: document.getElementById('p_loc').value,
        clientPhone: phone,
        clientEmail: document.getElementById('p_email').value,
        projectStatus: document.getElementById('p_status').value,
        notes: document.getElementById('p_notes').value
      };
      callApi(isEdit ? 'updateProject' : 'saveProject', payload).then(() => {
        closeModal();
        refreshMasterDashboard();
        if (isEdit) loadProjectConsoleHub(payload.projectId);
      });
    };
  }
  // ---------- INSPECTION ----------
  else if (type === 'inspection') {
    const uniqueId = isEdit ? editData.inspectionId : "INS-" + Date.now();
    title.innerText = isEdit ? "Edit Inspection" : "New Inspection";
    if (isEdit && editData.attachments) currentModalFiles = splitAttachments(editData.attachments);
    body.innerHTML = `
      <label ${labelStyle}>Type</label>
      <select id="i_type" ${largeInput}>
        <option value="Initial Visit" ${isEdit && editData.inspectionType === 'Initial Visit' ? 'selected' : ''}>Initial Visit</option>
        <option value="Site Condition" ${isEdit && editData.inspectionType === 'Site Condition' ? 'selected' : ''}>Site Condition</option>
        <option value="Defect Check" ${isEdit && editData.inspectionType === 'Defect Check' ? 'selected' : ''}>Defect Check</option>
      </select>
      <label ${labelStyle}>Area Inspected</label><input id="i_area" value="${escapeAttr(isEdit?editData.areaInspected:'')}" ${largeInput}>
      <label ${labelStyle}>Site Condition</label><textarea id="i_condition" rows="3" ${largeInput}>${escapeHtml(isEdit?editData.siteCondition:'')}</textarea>
      <label ${labelStyle}>Recommendations</label><textarea id="i_rec" rows="2" ${largeInput}>${escapeHtml(isEdit?editData.recommendations:'')}</textarea>
      <div id="inspectionAttachmentsPreviews" class="modal-preview-grid" style="display:none;"></div>
      <label class="icon-upload-label"><i class="fas fa-paperclip"></i><input type="file" id="i_photo" accept="image/*,application/pdf" multiple style="display:none"></label>
    `;
    if (currentModalFiles.length) populateModalInlineImageGalleryPreviews('inspectionAttachmentsPreviews');
    document.getElementById('i_photo').onchange = (e) => processIncomingMultiAttachments(e.target.files, 'inspectionAttachmentsPreviews');
    submit.onclick = async () => {
      submit.disabled = true; submit.innerText = "GPS...";
      const gps = await getGPSLocation();
      submit.innerText = "Saving...";
      const condition = document.getElementById('i_condition').value + (gps !== "GPS Unavailable" ? `\n\n📍 ${gps}` : "");
      const payload = {
        inspectionId: uniqueId,
        projectId: getCurrentProjectId(),
        inspectionDate: new Date().toLocaleDateString(),
        inspectionType: document.getElementById('i_type').value,
        areaInspected: document.getElementById('i_area').value,
        siteCondition: condition,
        recommendations: document.getElementById('i_rec').value,
        attachments: normalizeAttachments(currentModalFiles)
      };
      callApi(isEdit ? 'updateInspection' : 'saveInspection', payload).then(() => {
        closeModal();
        loadInspectionListings();
      });
    };
  }
  // ---------- TAKE-OFF ----------
  else if (type === 'takeoff_item') {
    const uniqueId = isEdit ? editData.itemId : "TO-" + Date.now();
    title.innerText = isEdit ? "Edit Take-Off" : "New Take-Off";
    if (isEdit && editData.beforePhotoUrl) currentModalFiles = splitAttachments(editData.beforePhotoUrl);
    body.innerHTML = `
      <label ${labelStyle}>Room/Area</label><input id="t_room" value="${escapeAttr(isEdit?editData.roomArea:'')}" ${largeInput}>
      <label ${labelStyle}>Trade Category</label><input id="t_trade" value="${escapeAttr(isEdit?editData.tradeCategory:'')}" ${largeInput}>
      <label ${labelStyle}>Description</label><input id="t_desc" value="${escapeAttr(isEdit?editData.description:'')}" ${largeInput}>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
        <input id="t_qty" placeholder="Quantity" value="${escapeAttr(isEdit?editData.quantity:'')}" ${largeInput}>
        <select id="t_unit" ${largeInput}>
          <option value="sqm" ${isEdit && editData.unit === 'sqm' ? 'selected' : ''}>sqm</option>
          <option value="m" ${isEdit && editData.unit === 'm' ? 'selected' : ''}>m</option>
          <option value="pcs" ${isEdit && editData.unit === 'pcs' ? 'selected' : ''}>pcs</option>
        </select>
      </div>
      <label ${labelStyle}>Remarks</label><textarea id="t_notes" rows="2" ${largeInput}>${escapeHtml(isEdit?editData.scopeNotes:'')}</textarea>
      <div id="takeoffAttachmentsPreviews" class="modal-preview-grid" style="display:none;"></div>
      <label class="icon-upload-label"><i class="fas fa-paperclip"></i><input type="file" id="t_photo" accept="image/*" multiple style="display:none"></label>
      ${isEdit ? `<button class="action-btn" id="t_delete_btn" style="background:var(--danger); margin-top:10px;">Delete</button>` : ''}
    `;
    if (currentModalFiles.length) populateModalInlineImageGalleryPreviews('takeoffAttachmentsPreviews');
    document.getElementById('t_photo').onchange = (e) => processIncomingMultiAttachments(e.target.files, 'takeoffAttachmentsPreviews');
    if (isEdit) {
      document.getElementById('t_delete_btn').onclick = () => {
        if (confirm("Delete this item?")) {
          callApi('deleteTakeOffItem', { itemId: uniqueId }).then(() => {
            closeModal();
            loadTakeOffListings();
          });
        }
      };
    }
    submit.onclick = async () => {
      submit.disabled = true; submit.innerText = "GPS...";
      const gps = await getGPSLocation();
      submit.innerText = "Saving...";
      const finalNotes = document.getElementById('t_notes').value + (gps !== "GPS Unavailable" ? `\n📍 ${gps}` : "");
      const payload = {
        itemId: uniqueId,
        projectId: getCurrentProjectId(),
        roomArea: document.getElementById('t_room').value,
        tradeCategory: document.getElementById('t_trade').value,
        description: document.getElementById('t_desc').value,
        quantity: document.getElementById('t_qty').value,
        unit: document.getElementById('t_unit').value,
        beforePhotoUrl: normalizeAttachments(currentModalFiles),
        scopeNotes: finalNotes
      };
      callApi(isEdit ? 'updateTakeOffItem' : 'saveTakeOffItem', payload).then(() => {
        closeModal();
        loadTakeOffListings();
      });
    };
  }
  // ---------- PROGRESS ENTRY ----------
  else if (type === 'progress_entry') {
    const uniqueId = "LOG-" + Date.now();
    title.innerText = "Log Progress";
    body.innerHTML = `
      <label ${labelStyle}>Trade</label><input id="l_trade" ${largeInput}>
      <label ${labelStyle}>Completion %</label>
      <select id="l_pct" ${largeInput}>
        <option>10</option><option>35</option><option>75</option><option>100</option>
      </select>
      <label ${labelStyle}>Comments</label><textarea id="l_comm" rows="3" ${largeInput}></textarea>
      <div id="progressAttachmentsPreviews" class="modal-preview-grid" style="display:none;"></div>
      <label class="icon-upload-label"><i class="fas fa-paperclip"></i><input type="file" id="l_photo" accept="image/*" multiple style="display:none"></label>
    `;
    document.getElementById('l_photo').onchange = (e) => processIncomingMultiAttachments(e.target.files, 'progressAttachmentsPreviews');
    submit.onclick = async () => {
      submit.disabled = true; submit.innerText = "GPS...";
      const gps = await getGPSLocation();
      submit.innerText = "Saving...";
      const payload = {
        logId: uniqueId,
        projectId: getCurrentProjectId(),
        tradeCategory: document.getElementById('l_trade').value,
        completionPercentage: document.getElementById('l_pct').value,
        commentNarrative: document.getElementById('l_comm').value + (gps !== "GPS Unavailable" ? `\n📍 ${gps}` : ""),
        progressPhotoUrl: normalizeAttachments(currentModalFiles)
      };
      callApi('saveProgressLog', payload).then(() => {
        closeModal();
        loadProgressTimelineFeed();
      });
    };
  }
  // ---------- VENDOR ----------
  else if (type === 'vendor') {
    const uniqueId = isEdit ? editData.vendorId : "VND-" + Date.now();
    title.innerText = isEdit ? "Edit Vendor" : "New Vendor";
    if (isEdit) { currentAvatarPhoto = editData.passport; if(editData.attachments) currentModalFiles = splitAttachments(editData.attachments); }
    body.innerHTML = `
      <div class="passport-frame-container">
        <img id="passport_frame_view" src="${getDirectImageUrl(currentAvatarPhoto) || 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%3E%3Cpath%20fill%3D%22%23666%22%20d%3D%22M12%2012c2.21%200%204-1.79%204-4s-1.79-4-4-4-4%201.79-4%204%201.79%204%204%204zm0%202c-2.67%200-8%201.34-8%204v2h16v-2c0-2.66-5.33-4-8-4z%22%2F%3E%3C%2Fsvg%3E'}" style="width:100%; height:100%; object-fit:cover;">
        <label style="position:absolute; bottom:0; right:0; background:#000; color:white; border-radius:50%; width:30px; height:30px; display:flex; align-items:center; justify-content:center; cursor:pointer;">
          <i class="fas fa-camera"></i>
          <input type="file" id="v_pass" accept="image/*" style="display:none">
        </label>
        <div id="v_pass_remove" onclick="window.clearVendorAvatarPhoto()" style="position:absolute; top:0; right:0; background:red; color:white; border-radius:50%; width:22px; text-align:center; cursor:pointer;">&times;</div>
      </div>
      <label ${labelStyle}>Company</label><input id="v_comp" value="${escapeAttr(isEdit?editData.company:'')}" ${largeInput}>
      <label ${labelStyle}>Trade</label><input id="v_trade" value="${escapeAttr(isEdit?editData.trade:'')}" ${largeInput}>
      <label ${labelStyle}>Contact Person</label><input id="v_contact" value="${escapeAttr(isEdit?editData.contactName:'')}" ${largeInput}>
      <label ${labelStyle}>Phone 1 (11 digits)</label><input id="v_phone1" type="tel" maxlength="11" oninput="this.value=this.value.replace(/[^0-9]/g,'')" value="${escapeAttr(isEdit?editData.phone1:'')}" ${largeInput}>
      <label ${labelStyle}>Phone 2</label><input id="v_phone2" type="tel" maxlength="11" oninput="this.value=this.value.replace(/[^0-9]/g,'')" value="${escapeAttr(isEdit?editData.phone2:'')}" ${largeInput}>
      <label ${labelStyle}>Email</label><input id="v_email" type="email" value="${escapeAttr(isEdit?editData.email:'')}" ${largeInput}>
      <div id="vendorAttachmentsPreviews" class="modal-preview-grid" style="display:none;"></div>
      <label class="icon-upload-label"><i class="fas fa-paperclip"></i><input type="file" id="v_files" accept="image/*,application/pdf" multiple style="display:none"></label>
      ${isEdit ? `<button class="action-btn" id="v_delete_btn" style="background:var(--danger); margin-top:10px;">Delete</button>` : ''}
    `;
    if (currentModalFiles.length) populateModalInlineImageGalleryPreviews('vendorAttachmentsPreviews');
    document.getElementById('v_pass').onchange = (e) => {
      const f = e.target.files[0];
      if (f) {
        const r = new FileReader();
        r.onload = async (ev) => {
          currentAvatarPhoto = await compressImageToTargetLimit(ev.target.result, 190000);
          document.getElementById('passport_frame_view').src = currentAvatarPhoto;
          document.getElementById('v_pass_remove').style.display = 'block';
        };
        r.readAsDataURL(f);
      }
    };
    document.getElementById('v_files').onchange = (e) => processIncomingMultiAttachments(e.target.files, 'vendorAttachmentsPreviews');
    if (isEdit) {
      document.getElementById('v_delete_btn').onclick = () => {
        if (confirm("Delete vendor?")) {
          callApi('deleteVendor', { vendorId: uniqueId }).then(() => {
            closeModal();
            refreshVendorsListView();
          });
        }
      };
    }
    submit.onclick = () => {
      const p1 = document.getElementById('v_phone1').value.trim();
      const p2 = document.getElementById('v_phone2').value.trim();
      if (p1 && !/^\d{11}$/.test(p1)) { alert("Phone 1 must be 11 digits"); return; }
      if (p2 && !/^\d{11}$/.test(p2)) { alert("Phone 2 must be 11 digits"); return; }
      submit.disabled = true; submit.innerText = "Saving...";
      const payload = {
        vendorId: uniqueId,
        company: document.getElementById('v_comp').value,
        trade: document.getElementById('v_trade').value,
        contactName: document.getElementById('v_contact').value,
        phone1: p1,
        phone2: p2,
        email: document.getElementById('v_email').value,
        passport: currentAvatarPhoto,
        attachments: normalizeAttachments(currentModalFiles),
        archived: "No"
      };
      callApi(isEdit ? 'updateVendor' : 'saveVendor', payload).then(() => {
        closeModal();
        refreshVendorsListView();
      });
    };
  }
  // ---------- WORK ORDER ----------
  else if (type === 'workorder') {
    const uniqueId = isEdit ? editData.workOrderId : generateFrontendPreviewId('workorder');
    title.innerText = isEdit ? "Edit Work Order" : "New Work Order";
    if (isEdit && editData.attachments) currentModalFiles = splitAttachments(editData.attachments);
    const vendors = getCache().vendors || [];
    body.innerHTML = `
      <label ${labelStyle}>ID</label><input value="${uniqueId}" disabled style="${largeInput} background:#f0f0f0;">
      <label ${labelStyle}>Vendor</label>
      <select id="wo_vendor" ${largeInput}>
        ${vendors.map(v => `<option value="${v.vendorId}" ${isEdit && v.vendorId === editData.vendorId ? 'selected' : ''}>${escapeHtml(v.company)}</option>`).join('')}
      </select>
      <label ${labelStyle}>Description</label><textarea id="wo_desc" rows="2" ${largeInput}>${escapeHtml(isEdit?editData.description:'')}</textarea>
      <label ${labelStyle}>Amount (₦)</label><input id="wo_amount" type="number" value="${escapeAttr(isEdit?editData.amount:'')}" ${largeInput}>
      <label ${labelStyle}>Status</label>
      <select id="wo_status" ${largeInput}>
        <option value="Pending" ${isEdit && editData.status === 'Pending' ? 'selected' : ''}>Pending</option>
        <option value="Active" ${isEdit && editData.status === 'Active' ? 'selected' : ''}>Active</option>
        <option value="Completed" ${isEdit && editData.status === 'Completed' ? 'selected' : ''}>Completed</option>
      </select>
      <div id="woAttachmentsPreviews" class="modal-preview-grid" style="display:none;"></div>
      <label class="icon-upload-label"><i class="fas fa-paperclip"></i><input type="file" id="wo_files" accept="image/*,application/pdf" multiple style="display:none"></label>
    `;
    if (currentModalFiles.length) populateModalInlineImageGalleryPreviews('woAttachmentsPreviews');
    document.getElementById('wo_files').onchange = (e) => processIncomingMultiAttachments(e.target.files, 'woAttachmentsPreviews');
    submit.onclick = () => {
      const vendorId = document.getElementById('wo_vendor').value;
      if (!vendorId) { alert("Select a vendor"); return; }
      submit.disabled = true; submit.innerText = "Saving...";
      const payload = {
        workOrderId: uniqueId,
        projectId: getCurrentProjectId(),
        vendorId: vendorId,
        description: document.getElementById('wo_desc').value,
        amount: document.getElementById('wo_amount').value,
        status: document.getElementById('wo_status').value,
        attachments: normalizeAttachments(currentModalFiles)
      };
      callApi(isEdit ? 'updateWorkOrder' : 'saveWorkOrder', payload).then(() => {
        closeModal();
        loadWorkOrdersListings();
      });
    };
  }
  // ---------- PAYMENT ----------
  else if (type === 'payment') {
    title.innerText = isEdit ? "Edit Payment" : "New Payment";
    if (isEdit && editData.attachments) currentModalFiles = splitAttachments(editData.attachments);
    body.innerHTML = `
      <label ${labelStyle}>ID</label><input value="${isEdit ? editData.paymentId : "Auto-generated (PAY-XXXXX)"}" disabled style="${largeInput} background:#f0f0f0;">
      <label ${labelStyle}>Direction</label>
      <select id="pay_dir" ${largeInput}>
        <option value="Client Receipt" ${isEdit && paymentDirectionOf(editData) === 'Client Receipt' ? 'selected' : ''}>Client Receipt</option>
        <option value="Outgoing Payment" ${(!isEdit || paymentDirectionOf(editData) === 'Outgoing Payment') ? 'selected' : ''}>Outgoing Payment</option>
        <option value="Small Expense" ${isEdit && paymentDirectionOf(editData) === 'Small Expense' ? 'selected' : ''}>Small Expense</option>
      </select>
      <label ${labelStyle}>Payee</label><input id="pay_payee" value="${escapeAttr(isEdit?editData.payee:'')}" ${largeInput}>
      <label ${labelStyle}>Category</label>
      <select id="pay_cat" ${largeInput}>
        <option value="">--</option>
        <option value="Labour" ${isEdit && editData.expenseCategory === 'Labour' ? 'selected' : ''}>Labour</option>
        <option value="Materials" ${isEdit && editData.expenseCategory === 'Materials' ? 'selected' : ''}>Materials</option>
        <option value="Transport" ${isEdit && editData.expenseCategory === 'Transport' ? 'selected' : ''}>Transport</option>
        <option value="Misc" ${isEdit && editData.expenseCategory === 'Misc' ? 'selected' : ''}>Misc</option>
      </select>
      <label ${labelStyle}>Amount (₦)</label><input id="pay_amount" type="number" step="0.01" value="${escapeAttr(isEdit?editData.amount:'')}" ${largeInput}>
      <label ${labelStyle}>Method</label>
      <select id="pay_method" ${largeInput}>
        <option value="Cash" ${isEdit && editData.paymentMethod === 'Cash' ? 'selected' : ''}>Cash</option>
        <option value="Transfer" ${(!isEdit || editData.paymentMethod === 'Transfer') ? 'selected' : ''}>Transfer</option>
        <option value="POS" ${isEdit && editData.paymentMethod === 'POS' ? 'selected' : ''}>POS</option>
      </select>
      <label ${labelStyle}>Status</label>
      <select id="pay_status" ${largeInput}>
        <option value="Pending" ${isEdit && editData.status === 'Pending' ? 'selected' : ''}>Pending</option>
        <option value="Cleared" ${isEdit && editData.status === 'Cleared' ? 'selected' : ''}>Cleared</option>
      </select>
      <label ${labelStyle}>Notes</label><textarea id="pay_notes" rows="2" ${largeInput}>${escapeHtml(isEdit?editData.notes:'')}</textarea>
      <div id="paymentAttachmentsPreviews" class="modal-preview-grid" style="display:none;"></div>
      <label class="icon-upload-label"><i class="fas fa-paperclip"></i><input type="file" id="pay_files" accept="image/*,application/pdf" multiple style="display:none"></label>
    `;
    if (currentModalFiles.length) populateModalInlineImageGalleryPreviews('paymentAttachmentsPreviews');
    document.getElementById('pay_files').onchange = (e) => processIncomingMultiAttachments(e.target.files, 'paymentAttachmentsPreviews');
    submit.onclick = () => {
      const amount = document.getElementById('pay_amount').value;
      if (!amount || amount <= 0) { alert("Enter a valid amount"); return; }
      submit.disabled = true; submit.innerText = "Saving...";
      const payload = {
        paymentId: isEdit ? editData.paymentId : null,
        projectId: getCurrentProjectId(),
        paymentDate: new Date().toLocaleDateString(),
        paymentDirection: document.getElementById('pay_dir').value,
        payee: document.getElementById('pay_payee').value,
        expenseCategory: document.getElementById('pay_cat').value,
        referenceId: "",
        amount: amount,
        paymentMethod: document.getElementById('pay_method').value,
        status: document.getElementById('pay_status').value,
        notes: document.getElementById('pay_notes').value,
        attachments: normalizeAttachments(currentModalFiles)
      };
      callApi(isEdit ? 'updatePayment' : 'savePayment', payload).then(() => {
        closeModal();
        loadPaymentsListings();
      });
    };
  }
}

// ======================== EXPORTS ========================
export { removeAttachmentByIndex, clearVendorAvatarPhoto };
