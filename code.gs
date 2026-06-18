         const SECRET_TOKEN = "FieldScan2025!SecureToken"; // Must match frontend
const SHEET_SCHEMAS = {
  Projects: ["projectId","clientName","siteLocation","clientPhone","clientEmail","projectStatus","scope","contractSubtotal","notes","lastModified"],
  Inspections: ["inspectionId","projectId","inspectionDate","inspectionType","areaInspected","siteCondition","recommendations","attachments","lastModified"],
  TakeOffItems: ["itemId","projectId","roomArea","tradeCategory","description","quantity","unit","beforePhotoUrl","scopeNotes","lastModified"],
  ProgressLogs: ["logId","projectId","tradeCategory","completionPercentage","commentNarrative","progressPhotoUrl","dateRecorded","lastModified"],
  Snags: ["snagId","projectId","notes","photoUrl","assigned","dateLogged","dateCompleted","status","lastModified"],
  Vendors: ["vendorId","company","trade","contactName","phone1","phone2","email","passport","attachments","archived","lastModified"],
  WorkOrders: ["workOrderId","projectId","vendorId","description","amount","status","attachments","dateCreated","lastModified"],
  Payments: ["paymentId","projectId","paymentDate","paymentDirection","payee","expenseCategory","referenceId","amount","paymentMethod","status","notes","attachments","lastModified"],
  settings: ["vatPercent","whtPercent","lastModified"]
};

function doPost(e) {
  let result = { success: false, status: "error" };
  try {
    const req = JSON.parse(e.postData.contents);
    if (req.data?.token !== SECRET_TOKEN && req.token !== SECRET_TOKEN) throw new Error("Unauthorized");
    const action = req.action;
    const data = req.data || {};
    if (action === "getProjects") result = getTableData("Projects");
    else if (action === "getInspections") result = getTableData("Inspections");
    else if (action === "getTakeOffItems") result = getTableData("TakeOffItems");
    else if (action === "getProgressLogs") result = getTableData("ProgressLogs");
    else if (action === "getVendors") result = getTableData("Vendors");
    else if (action === "getWorkOrders") result = getTableData("WorkOrders");
    else if (action === "getPayments") result = getTableData("Payments");
    else if (action === "getSnags") result = getTableData("Snags");
    else if (action === "getStats") result = { success: true, activeVendors: getActiveVendorsCount() };
    else if (action === "saveProject") result = saveProject(data);
    else if (action === "updateProject") result = updateProject(data);
    else if (action === "updateProjectScope") result = updateProjectScope(data);
    else if (action === "updateProjectContractSubtotal") result = updateProjectContractSubtotal(data);
    else if (action === "saveInspection") result = saveInspection(data);
    else if (action === "updateInspection") result = updateInspection(data);
    else if (action === "saveTakeOffItem") result = saveTakeOffItem(data);
    else if (action === "updateTakeOffItem") result = updateTakeOffItem(data);
    else if (action === "deleteTakeOffItem") result = deleteRow("TakeOffItems", data.itemId, 0);
    else if (action === "saveProgressLog") result = saveProgressLog(data);
    else if (action === "saveSnag") result = saveSnag(data);
    else if (action === "updateSnag") result = updateSnag(data);
    else if (action === "deleteSnag") result = deleteRow("Snags", data.snagId, 0);
    else if (action === "saveVendor") result = saveVendor(data);
    else if (action === "updateVendor") result = updateVendor(data);
    else if (action === "deleteVendor") result = deleteRow("Vendors", data.vendorId, 0);
    else if (action === "saveWorkOrder") result = saveWorkOrder(data);
    else if (action === "updateWorkOrder") result = updateWorkOrder(data);
    else if (action === "savePayment") result = savePayment(data);
    else if (action === "updatePayment") result = updatePayment(data);
    else throw new Error("Unknown action");
  } catch(err) {
    result = { success: false, error: err.toString() };
  }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  const id = e.parameter.id;
  const token = e.parameter.token;
  if (token !== SECRET_TOKEN) return ContentService.createTextOutput("Unauthorized");
  try {
    const file = DriveApp.getFileById(id);
    const blob = file.getBlob();
    return ContentService.createTextOutput(blob.getDataAsString()).setMimeType(blob.getContentType());
  } catch(err) { return ContentService.createTextOutput("Not found"); }
}

// Helper: sanitize cell to prevent injection
function sanitize(v) { if (typeof v !== 'string') return v; return v.replace(/^[=+\-@]/,'').replace(/=/g,'').slice(0,5000); }
function validatePhone(p) { if (!p) return ""; const clean = p.replace(/\D/g,''); if (clean.length !== 11) throw new Error("Phone must be 11 digits"); return clean; }

function getTableData(sheetName) {
  const sheet = ensureSheet(sheetName);
  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(h=>normalizeHeader(h));
  const schema = SHEET_SCHEMAS[sheetName];
  const tz = Session.getScriptTimeZone();
  return data.slice(1).map(row => {
    const obj = {};
    schema.forEach((key) => {
      let val = row[headers.indexOf(normalizeHeader(key))];
      if (val instanceof Date) {
        // Sheets auto-converted a date-like string on write; reformat back to YYYY/MM/DD for date fields,
        // or keep the raw millisecond timestamp for lastModified.
        val = (normalizeHeader(key) === normalizeHeader("lastModified"))
          ? val.getTime()
          : Utilities.formatDate(val, tz, "yyyy/MM/dd");
      }
      obj[key] = val || "";
    });
    return obj;
  });
}

function saveProject(data) {
  const id = data.projectId || getNextSequentialId("Projects", "PRJ/" + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yy") + "/", 3);
  appendObjectRow("Projects", {
    projectId: id,
    clientName: sanitize(data.clientName),
    siteLocation: sanitize(data.siteLocation),
    clientPhone: "'"+validatePhone(data.clientPhone),
    clientEmail: sanitize(data.clientEmail),
    projectStatus: sanitize(data.projectStatus),
    // Keep legacy "scope" column for dashboard/backwards compatibility.
    // New/Edit project modal now sends contractSubtotal; scope may be omitted.
    scope: sanitize(data.scope),
    contractSubtotal: Number(data.contractSubtotal) || 0,
    notes: sanitize(data.notes),
    lastModified: Date.now()
  });
  return { success: true, projectId: id };
}
function updateProject(data) {
  return modifyRow("Projects", data.projectId, {
    clientName: sanitize(data.clientName),
    siteLocation: sanitize(data.siteLocation),
    clientPhone: "'"+validatePhone(data.clientPhone),
    clientEmail: sanitize(data.clientEmail),
    projectStatus: sanitize(data.projectStatus),
    scope: sanitize(data.scope),
    contractSubtotal: (data.contractSubtotal !== undefined && data.contractSubtotal !== null) ? (Number(data.contractSubtotal) || 0) : "",
    notes: sanitize(data.notes),
    lastModified: Date.now()
  }, 0);
}
function updateProjectScope(data) { return modifyRow("Projects", data.projectId, { scope: sanitize(data.scope), lastModified: Date.now() }, 0); }

function updateProjectContractSubtotal(data) {
  return modifyRow("Projects", data.projectId, {
    contractSubtotal: Number(data.contractSubtotal) || 0,
    lastModified: Date.now()
  }, 0);
}
function saveInspection(data) {
  appendObjectRow("Inspections", {
    inspectionId: data.inspectionId,
    projectId: data.projectId,
    inspectionDate: data.inspectionDate || currentDate(),
    inspectionType: data.inspectionType,
    areaInspected: sanitize(data.areaInspected),
    siteCondition: sanitize(data.siteCondition),
    recommendations: sanitize(data.recommendations),
    attachments: processAttachments(data.attachments),
    lastModified: Date.now()
  });
  return { success: true };
}
function updateInspection(data) { return modifyRow("Inspections", data.inspectionId, { inspectionDate: data.inspectionDate, inspectionType: data.inspectionType, areaInspected: sanitize(data.areaInspected), siteCondition: sanitize(data.siteCondition), recommendations: sanitize(data.recommendations), attachments: processAttachments(data.attachments), lastModified: Date.now() }, 0); }
function saveTakeOffItem(data) {
  appendObjectRow("TakeOffItems", {
    itemId: data.itemId,
    projectId: data.projectId,
    roomArea: sanitize(data.roomArea),
    tradeCategory: sanitize(data.tradeCategory),
    description: sanitize(data.description),
    quantity: data.quantity,
    unit: data.unit,
    beforePhotoUrl: processAttachments(data.beforePhotoUrl),
    scopeNotes: sanitize(data.scopeNotes),
    lastModified: Date.now()
  });
  return { success: true };
}
function updateTakeOffItem(data) { return modifyRow("TakeOffItems", data.itemId, { roomArea: sanitize(data.roomArea), tradeCategory: sanitize(data.tradeCategory), description: sanitize(data.description), quantity: data.quantity, unit: data.unit, beforePhotoUrl: processAttachments(data.beforePhotoUrl), scopeNotes: sanitize(data.scopeNotes), lastModified: Date.now() }, 0); }
function saveProgressLog(data) {
  appendObjectRow("ProgressLogs", {
    logId: data.logId,
    projectId: data.projectId,
    tradeCategory: sanitize(data.tradeCategory),
    completionPercentage: data.completionPercentage,
    commentNarrative: sanitize(data.commentNarrative),
    progressPhotoUrl: processAttachments(data.progressPhotoUrl),
    dateRecorded: currentDate(),
    lastModified: Date.now()
  });
  return { success: true };
}

function saveSnag(data) {
  const id = data.snagId || ("SNAG-" + Date.now());
  appendObjectRow("Snags", {
    snagId: id,
    projectId: data.projectId,
    notes: sanitize(data.notes),
    photoUrl: "", // intentionally left blank - snag photos are kept local-only on the device, never synced
    assigned: sanitize(data.assigned),
    dateLogged: data.dateLogged || currentDate(),
    dateCompleted: sanitize(data.dateCompleted),
    status: data.status || "Open",
    lastModified: Date.now()
  });
  return { success: true, snagId: id };
}
function updateSnag(data) {
  return modifyRow("Snags", data.snagId, {
    notes: sanitize(data.notes),
    assigned: sanitize(data.assigned),
    dateCompleted: sanitize(data.dateCompleted),
    status: data.status,
    lastModified: Date.now()
  }, 0);
}
function saveVendor(data) {
  appendObjectRow("Vendors", {
    vendorId: data.vendorId,
    company: sanitize(data.company),
    trade: sanitize(data.trade),
    contactName: sanitize(data.contactName),
    phone1: "'"+validatePhone(data.phone1),
    phone2: "'"+validatePhone(data.phone2),
    email: sanitize(data.email),
    passport: processAttachments(data.passport),
    attachments: processAttachments(data.attachments),
    archived: "No",
    lastModified: Date.now()
  });
  return { success: true };
}
function updateVendor(data) { return modifyRow("Vendors", data.vendorId, { company: sanitize(data.company), trade: sanitize(data.trade), contactName: sanitize(data.contactName), phone1: "'"+validatePhone(data.phone1), phone2: "'"+validatePhone(data.phone2), email: sanitize(data.email), passport: processAttachments(data.passport), attachments: processAttachments(data.attachments), lastModified: Date.now() }, 0); }
function saveWorkOrder(data) {
  const id = data.workOrderId || getNextSequentialId("WorkOrders", "WKO/" + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yy") + "/", 3);
  appendObjectRow("WorkOrders", {
    workOrderId: id,
    projectId: data.projectId,
    vendorId: data.vendorId,
    description: sanitize(data.description),
    amount: Number(data.amount) || 0,
    status: data.status,
    attachments: processAttachments(data.attachments),
    dateCreated: currentDate(),
    lastModified: Date.now()
  });
  return { success: true };
}
function updateWorkOrder(data) { return modifyRow("WorkOrders", data.workOrderId, { vendorId: data.vendorId, description: sanitize(data.description), amount: Number(data.amount)||0, status: data.status, attachments: processAttachments(data.attachments), lastModified: Date.now() }, 0); }
function savePayment(data) {
  let id = data.paymentId;
  if (!id || id.startsWith("PAY-")) id = getNextSequentialPaymentId(data.projectId);
  appendObjectRow("Payments", {
    paymentId: id,
    projectId: data.projectId,
    paymentDate: data.paymentDate || currentDate(),
    paymentDirection: data.paymentDirection,
    payee: sanitize(data.payee),
    expenseCategory: sanitize(data.expenseCategory),
    referenceId: sanitize(data.referenceId),
    amount: Number(data.amount) || 0,
    paymentMethod: data.paymentMethod,
    status: data.status,
    notes: sanitize(data.notes),
    attachments: processAttachments(data.attachments),
    lastModified: Date.now()
  });
  return { success: true, paymentId: id };
}
function updatePayment(data) { return modifyRow("Payments", data.paymentId, { paymentDate: data.paymentDate, paymentDirection: data.paymentDirection, payee: sanitize(data.payee), expenseCategory: sanitize(data.expenseCategory), referenceId: sanitize(data.referenceId), amount: Number(data.amount)||0, paymentMethod: data.paymentMethod, status: data.status, notes: sanitize(data.notes), attachments: processAttachments(data.attachments), lastModified: Date.now() }, 0); }

// Extracts the last 3 digits of a project ID, e.g. "PRJ/26/001" -> "001"
function projectNumberSuffix(projectId) {
  const match = String(projectId || "").match(/(\d{1,3})\D*$/);
  if (match) return match[1].padStart(3, '0').slice(-3);
  return "000";
}

function getNextSequentialPaymentId(projectId) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const prefix = projectNumberSuffix(projectId) + "-";
    const sheet = ensureSheet("Payments");
    const data = sheet.getDataRange().getValues();
    let max = 0;
    for (let i=1; i<data.length; i++) {
      const id = String(data[i][0]);
      if (id.startsWith(prefix)) {
        const num = parseInt(id.substring(prefix.length));
        if (!isNaN(num) && num > max) max = num;
      }
    }
    const next = max + 1;
    return prefix + String(next).padStart(2, '0');
  } finally {
    lock.releaseLock();
  }
}

function processAttachments(raw) {
  if (!raw) return "";
  const items = String(raw).split("|||");
  const processed = items.map(item => {
    if (item.startsWith("data:")) {
      const ext = item.includes("application/pdf") ? "pdf" : "jpg";
      const fileName = "img_" + Date.now() + "_" + Math.random().toString(36) + "." + ext;
      return uploadImageToDrive(item, fileName);
    }
    return item;
  }).filter(Boolean);
  return processed.join("|||");
}

function uploadImageToDrive(base64, fileName) {
  try {
    const folderName = "FieldScan_Files";
    let folder = DriveApp.getFoldersByName(folderName).hasNext() ? DriveApp.getFoldersByName(folderName).next() : DriveApp.createFolder(folderName);
    const parts = base64.split(",");
    const blob = Utilities.newBlob(Utilities.base64Decode(parts[1]), parts[0].split(":")[1].split(";")[0], fileName);
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
    return file.getId(); // store ID, not public URL
  } catch(e) { return ""; }
}

function getActiveVendorsCount() {
  const sheet = ensureSheet("Vendors");
  if (sheet.getLastRow() <= 1) return 0;
  const data = sheet.getRange(2, 10, sheet.getLastRow()-1, 1).getValues(); // column "archived"
  return data.filter(r => r[0] !== "Yes").length;
}

// ======================== SHEET HELPERS ========================
function ensureSheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  const schema = SHEET_SCHEMAS[name];
  if (!sheet) { sheet = ss.insertSheet(name); sheet.appendRow(schema); return sheet; }
  let headers = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0].map(normalizeHeader);
  schema.forEach(h => {
    if (!headers.includes(normalizeHeader(h))) {
      sheet.getRange(1, sheet.getLastColumn()+1).setValue(h);
      headers.push(normalizeHeader(h)); // keep headers in sync so we don't re-add the same column twice
    }
  });
  if (!headers.includes(normalizeHeader("lastModified"))) {
    sheet.getRange(1, sheet.getLastColumn()+1).setValue("lastModified");
  }

  // Populate default settings row for the "settings" sheet.
  if (normalizeHeader(name) === normalizeHeader("settings")) {
    // settings sheet is expected to have at least 2 numeric defaults and lastModified.
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      // Write as percentages, per requirements: VAT 7.5%, WHT 5%.
      // Store numeric percent values, not decimals.
      sheet.appendRow([7.5, 5, Date.now()]);
    }
  }

  return sheet;
}
function appendRow(sheetName, row) { ensureSheet(sheetName).appendRow(row); }
function appendObjectRow(sheetName, values) {
  const sheet = ensureSheet(sheetName);
  const headers = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];
  const row = headers.map(header => {
    const key = Object.keys(values).find(k => normalizeHeader(k) === normalizeHeader(header));
    return key ? values[key] : "";
  });
  const newRowNum = sheet.getLastRow() + 1;
  // Force plain-text format on date-shaped columns before writing, so Sheets doesn't
  // auto-convert "2026/06/16" strings into Date objects.
  headers.forEach((header, idx) => {
    if (/date/i.test(header)) sheet.getRange(newRowNum, idx+1).setNumberFormat("@");
  });
  sheet.getRange(newRowNum, 1, 1, row.length).setValues([row]);
}
function modifyRow(sheetName, id, updates, idCol=0) {
  const sheet = ensureSheet(sheetName);
  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(normalizeHeader);
  for (let i=1; i<data.length; i++) {
    if (String(data[i][idCol]).trim() === String(id).trim()) {
      // conflict detection: if incoming lastModified is older, reject
      const existingLastMod = data[i][headers.indexOf(normalizeHeader("lastModified"))];
      if (updates.lastModified && existingLastMod && Number(updates.lastModified) < Number(existingLastMod)) {
        return { success: false, error: "Conflict: server has newer version" };
      }
      for (let [k,v] of Object.entries(updates)) {
        const col = headers.indexOf(normalizeHeader(k));
        if (col !== -1) {
          if (/date/i.test(k)) sheet.getRange(i+1, col+1).setNumberFormat("@");
          sheet.getRange(i+1, col+1).setValue(v);
        }
      }
      return { success: true };
    }
  }
  return { success: false, error: "Not found" };
}
function deleteRow(sheetName, id, idCol=0) {
  const sheet = ensureSheet(sheetName);
  const data = sheet.getDataRange().getValues();
  for (let i=1; i<data.length; i++) {
    if (String(data[i][idCol]).trim() === String(id).trim()) { sheet.deleteRow(i+1); return { success: true }; }
  }
  return { success: false };
}
function getNextSequentialId(sheetName, prefix, pad) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = ensureSheet(sheetName);
    const data = sheet.getDataRange().getValues();
    let max = 0;
    for (let i=1; i<data.length; i++) {
      const cell = String(data[i][0]);
      if (cell.startsWith(prefix)) {
        const num = parseInt(cell.substring(prefix.length));
        if (!isNaN(num) && num > max) max = num;
      }
    }
    return prefix + String(max+1).padStart(pad, '0');
  } finally {
    lock.releaseLock();
  }
}
function normalizeHeader(h) { return String(h).trim().toLowerCase().replace(/[^a-z0-9]/g, ''); }
function currentDate() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy/MM/dd"); }
