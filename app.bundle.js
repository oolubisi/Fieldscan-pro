// app.bundle.js
// Generated from the FieldScan Pro source files

// ===== config.js =====
const GAS_URL =
  "https://script.google.com/macros/s/AKfycbwQ5HeJP9_msrGeaHRpqn9cgXYwwV48oLS2uBb-F8S90rwprmtoSONpM1UxSECWw41v/exec";
const AUTH_TOKEN = "FieldScan2025!SecureToken";
const ATTACHMENT_DELIMITER = "|||";

let selectedTakeOffIds = new Set();
let selectedTemplateIds = new Set();

// ===== utils.js =====
function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>]/g, function (m) {
    if (m === "&") return "&amp;";
    if (m === "<") return "&lt;";
    if (m === ">") return "&gt;";
    return m;
  });
}
function escapeAttr(str) {
  return escapeHtml(str)
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/`/g, "&#96;");
}

function roundMoney(val) {
  return Math.round((Number(val) || 0) * 100) / 100;
}

function moneyValue(val) {
  const n = roundMoney(val);
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function splitAttachments(val) {
  return String(val || "")
    .split(ATTACHMENT_DELIMITER)
    .map((s) => s.trim())
    .filter(Boolean);
}
function normalizeAttachments(files) {
  return files.filter(Boolean).join(ATTACHMENT_DELIMITER);
}
function idsMatch(a, b) {
  return String(a).trim() === String(b).trim();
}

async function compressImageToTargetLimit(base64, maxBytes = 190000) {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64;
    img.onerror = () => resolve(base64);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      let w = img.width,
        h = img.height;
      if (w > 1000) {
        h *= 1000 / w;
        w = 1000;
      }
      if (h > 1000) {
        w *= 1000 / h;
        h = 1000;
      }
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      let quality = 0.8;
      let result = canvas.toDataURL("image/jpeg", quality);
      while (result.length > maxBytes && quality > 0.2) {
        quality -= 0.1;
        result = canvas.toDataURL("image/jpeg", quality);
      }
      resolve(result);
    };
  });
}

function showPdfCompressing() {
  let overlay = document.getElementById("pdf-compress-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "pdf-compress-overlay";
    overlay.style.cssText =
      "position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;justify-content:center;align-items:center;z-index:6000;";
    overlay.innerHTML = `<div style="background:white;border-radius:20px;padding:24px;text-align:center;max-width:280px;"><div style="font-size:32px;margin-bottom:12px;"><i class="fas fa-cog fa-spin"></i></div><div style="font-weight:800;font-size:16px;">Compressing PDF…</div><div style="font-size:13px;color:#495057;margin-top:6px;">Please wait</div></div>`;
    document.body.appendChild(overlay);
  } else {
    overlay.style.display = "flex";
  }
}

function hidePdfCompressing() {
  const overlay = document.getElementById("pdf-compress-overlay");
  if (overlay) overlay.style.display = "none";
}

async function compressPdfToTargetLimit(base64, maxBytes = 300000) {
  if (typeof PDFLib === "undefined") {
    throw new Error(
      "PDF library not loaded. Please check your connection and retry.",
    );
  }
  const originalSize = (base64.length / 1024).toFixed(0);
  if (base64.length > 10000000) {
    if (
      !confirm(`This PDF is ${originalSize} KB. Compressing large files may take a moment and could freeze the app briefly.

Continue?`)
    ) {
      throw new Error("User cancelled large PDF compression.");
    }
  }
  showPdfCompressing();
  // Yield to UI thread so the overlay renders before heavy work begins
  await new Promise((r) => setTimeout(r, 50));
  try {
    const { PDFDocument } = PDFLib;
    const base64Data = base64.split(",")[1];
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const pdfDoc = await PDFDocument.load(bytes, { updateMetadata: false });
    const compressed = await pdfDoc.save({ useObjectStreams: true });
    // Convert back to base64 in chunks to avoid stack overflow
    const chunks = [];
    const chunkSize = 0x8000;
    for (let i = 0; i < compressed.length; i += chunkSize) {
      chunks.push(
        String.fromCharCode.apply(null, compressed.subarray(i, i + chunkSize)),
      );
    }
    const newBase64 = "data:application/pdf;base64," + btoa(chunks.join(""));
    if (newBase64.length > maxBytes) {
      throw new Error(
        `PDF too large (${(newBase64.length / 1024).toFixed(0)} KB). Max allowed: ${(maxBytes / 1024).toFixed(0)} KB. Try a smaller file or scan at lower resolution.`,
      );
    }
    return newBase64;
  } catch (err) {
    if (err.message && err.message.includes("Max allowed")) throw err;
    throw new Error(
      "PDF compression failed: " + (err.message || "Unknown error"),
    );
  } finally {
    hidePdfCompressing();
  }
}

function getDirectImageUrl(url) {
  if (!url || url.startsWith("data:")) return url;
  const match = url.match(/\/d\/(.+?)\//) || url.match(/id=([^&]+)/);
  if (match && match[1]) {
    return `${GAS_URL}?id=${match[1]}&token=${AUTH_TOKEN}`;
  }
  if (!/[\/\s]/.test(url) && !url.includes("://")) {
    return `${GAS_URL}?id=${url}&token=${AUTH_TOKEN}`;
  }
  return url;
}

function getGPSLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve("GPS Not Supported");
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve(
          `Lat: ${pos.coords.latitude.toFixed(5)}, Lng: ${pos.coords.longitude.toFixed(5)}`,
        ),
      () => resolve("GPS Unavailable"),
      { timeout: 7000, maximumAge: 60000 },
    );
  });
}

function todayFormatted() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd}`;
}

function paymentDirectionOf(p) {
  return (
    p.paymentDirection ||
    p.direction ||
    (p.payee === "Client" ? "Client Receipt" : "Outgoing Payment")
  );
}
function isClientReceipt(p) {
  return paymentDirectionOf(p) === "Client Receipt";
}
function isPettyExpense(p) {
  return paymentDirectionOf(p) === "Small Expense";
}

function getTaxRate(key) {
  const cache = getCache();
  const settings = cache.settings || {};
  const rate = settings[key];
  return typeof rate === "number" && !isNaN(rate) ? rate : 0;
}
function formatTaxRate(rate) {
  return (rate * 100).toFixed(1) + "%";
}
function calculateTax(amount, key) {
  return roundMoney((Number(amount) || 0) * getTaxRate(key));
}

function toggleTakeOffSelection(itemId, checked) {
  if (checked) selectedTakeOffIds.add(itemId);
  else selectedTakeOffIds.delete(itemId);
  loadTakeOffListings();
}

function toggleTemplateSelection(tmplId, checked) {
  if (checked) selectedTemplateIds.add(tmplId);
  else selectedTemplateIds.delete(tmplId);
  loadTemplatesSegment();
}

async function deleteSelectedTakeOffs() {
  if (!selectedTakeOffIds.size) return;
  if (!confirm(`Delete ${selectedTakeOffIds.size} selected take-off items?`))
    return;
  const projectId = getCurrentProjectId();
  const cache = getCache();
  for (const itemId of Array.from(selectedTakeOffIds)) {
    try {
      await callApi("deleteTakeOffItem", { itemId });
      cache.takeoffs = cache.takeoffs.filter((i) => i.itemId !== itemId);
    } catch (e) {
      console.error("Failed to delete", itemId, e);
    }
  }
  selectedTakeOffIds.clear();
  setCache(cache);
  loadTakeOffListings(true);
}

function deleteSelectedTemplates() {
  if (!selectedTemplateIds.size) return;
  if (!confirm(`Delete ${selectedTemplateIds.size} selected custom templates?`))
    return;
  const custom = getCustomTemplates();
  const remaining = custom.filter((t) => !selectedTemplateIds.has(t.id));
  saveCustomTemplates(remaining);
  selectedTemplateIds.clear();
  loadTemplatesSegment();
}

// ===== templates.js =====
const MASTER_ROOM_TYPES = [
  "Living Room",
  "Master Bedroom",
  "Bedroom",
  "Kitchen",
  "Bathroom/Toilet",
  "En-suite",
  "Dining Room",
  "Corridor/Hallway",
  "Staircase",
  "Store/Pantry",
  "Balcony/Terrace",
  "Entrance/Foyer",
  "Garage",
  "External Works",
];

const MASTER_TRADE_CATEGORIES = [
  "Civil/Structural",
  "Masonry/Blockwork",
  "Carpentry/Joinery",
  "Electrical",
  "Plumbing/Mechanical",
  "Tiling/Flooring",
  "Painting/Decorating",
  "Roofing",
  "Aluminum/Glazing",
  "Ironmongery",
  "Landscaping",
  "Security/Access Control",
  "Fire Protection",
  "HVAC/AC",
  "Waterproofing",
];

const MASTER_UNITS = [
  { value: "sqm", label: "sqm — Square Metres" },
  { value: "m", label: "m — Metres" },
  { value: "pcs", label: "pcs — Pieces" },
  { value: "set", label: "set — Set" },
  { value: "lot", label: "lot — Lot" },
  { value: "kg", label: "kg — Kilograms" },
  { value: "bag", label: "bag — Bag" },
  { value: "drum", label: "drum — Drum" },
  { value: "roll", label: "roll — Roll" },
  { value: "m³", label: "m³ — Cubic Metres" },
];

const BUILT_IN_TEMPLATES = [
  {
    id: "tmpl-3bed-standard",
    name: "Standard 3-Bed Flat",
    description:
      "Complete take-off template for a standard 3-bedroom apartment",
    items: [
      {
        roomArea: "Living Room",
        tradeCategory: "Tiling/Flooring",
        description: "Floor tiles",
        unit: "sqm",
        quantity: 0,
      },
      {
        roomArea: "Living Room",
        tradeCategory: "Painting/Decorating",
        description: "Wall painting",
        unit: "sqm",
        quantity: 0,
      },
      {
        roomArea: "Living Room",
        tradeCategory: "Electrical",
        description: "Light fittings",
        unit: "pcs",
        quantity: 0,
      },
      {
        roomArea: "Living Room",
        tradeCategory: "Electrical",
        description: "Power sockets",
        unit: "pcs",
        quantity: 0,
      },
      {
        roomArea: "Master Bedroom",
        tradeCategory: "Tiling/Flooring",
        description: "Floor tiles",
        unit: "sqm",
        quantity: 0,
      },
      {
        roomArea: "Master Bedroom",
        tradeCategory: "Painting/Decorating",
        description: "Wall painting",
        unit: "sqm",
        quantity: 0,
      },
      {
        roomArea: "Master Bedroom",
        tradeCategory: "Electrical",
        description: "Light fittings",
        unit: "pcs",
        quantity: 0,
      },
      {
        roomArea: "Master Bedroom",
        tradeCategory: "Electrical",
        description: "Power sockets",
        unit: "pcs",
        quantity: 0,
      },
      {
        roomArea: "Bedroom",
        tradeCategory: "Tiling/Flooring",
        description: "Floor tiles",
        unit: "sqm",
        quantity: 0,
      },
      {
        roomArea: "Bedroom",
        tradeCategory: "Painting/Decorating",
        description: "Wall painting",
        unit: "sqm",
        quantity: 0,
      },
      {
        roomArea: "Bedroom",
        tradeCategory: "Electrical",
        description: "Light fittings",
        unit: "pcs",
        quantity: 0,
      },
      {
        roomArea: "Bedroom",
        tradeCategory: "Electrical",
        description: "Power sockets",
        unit: "pcs",
        quantity: 0,
      },
      {
        roomArea: "Bedroom",
        tradeCategory: "Tiling/Flooring",
        description: "Floor tiles",
        unit: "sqm",
        quantity: 0,
      },
      {
        roomArea: "Bedroom",
        tradeCategory: "Painting/Decorating",
        description: "Wall painting",
        unit: "sqm",
        quantity: 0,
      },
      {
        roomArea: "Bedroom",
        tradeCategory: "Electrical",
        description: "Light fittings",
        unit: "pcs",
        quantity: 0,
      },
      {
        roomArea: "Bedroom",
        tradeCategory: "Electrical",
        description: "Power sockets",
        unit: "pcs",
        quantity: 0,
      },
      {
        roomArea: "Kitchen",
        tradeCategory: "Tiling/Flooring",
        description: "Floor tiles",
        unit: "sqm",
        quantity: 0,
      },
      {
        roomArea: "Kitchen",
        tradeCategory: "Tiling/Flooring",
        description: "Wall tiles",
        unit: "sqm",
        quantity: 0,
      },
      {
        roomArea: "Kitchen",
        tradeCategory: "Carpentry/Joinery",
        description: "Kitchen cabinets",
        unit: "set",
        quantity: 0,
      },
      {
        roomArea: "Kitchen",
        tradeCategory: "Electrical",
        description: "Power sockets",
        unit: "pcs",
        quantity: 0,
      },
      {
        roomArea: "Kitchen",
        tradeCategory: "Plumbing/Mechanical",
        description: "Sink and fittings",
        unit: "set",
        quantity: 0,
      },
      {
        roomArea: "Bathroom/Toilet",
        tradeCategory: "Tiling/Flooring",
        description: "Floor tiles",
        unit: "sqm",
        quantity: 0,
      },
      {
        roomArea: "Bathroom/Toilet",
        tradeCategory: "Tiling/Flooring",
        description: "Wall tiles",
        unit: "sqm",
        quantity: 0,
      },
      {
        roomArea: "Bathroom/Toilet",
        tradeCategory: "Plumbing/Mechanical",
        description: "WC suite",
        unit: "set",
        quantity: 0,
      },
      {
        roomArea: "Bathroom/Toilet",
        tradeCategory: "Plumbing/Mechanical",
        description: "Shower fittings",
        unit: "set",
        quantity: 0,
      },
      {
        roomArea: "Bathroom/Toilet",
        tradeCategory: "Electrical",
        description: "Light fittings",
        unit: "pcs",
        quantity: 0,
      },
      {
        roomArea: "Corridor/Hallway",
        tradeCategory: "Tiling/Flooring",
        description: "Floor tiles",
        unit: "sqm",
        quantity: 0,
      },
      {
        roomArea: "Corridor/Hallway",
        tradeCategory: "Painting/Decorating",
        description: "Wall painting",
        unit: "sqm",
        quantity: 0,
      },
      {
        roomArea: "Corridor/Hallway",
        tradeCategory: "Electrical",
        description: "Light fittings",
        unit: "pcs",
        quantity: 0,
      },
    ],
  },
  {
    id: "tmpl-bathroom-fitout",
    name: "Bathroom Fit-Out",
    description: "Complete bathroom renovation package",
    items: [
      {
        roomArea: "Bathroom/Toilet",
        tradeCategory: "Plumbing/Mechanical",
        description: "WC pan and cistern",
        unit: "set",
        quantity: 0,
      },
      {
        roomArea: "Bathroom/Toilet",
        tradeCategory: "Plumbing/Mechanical",
        description: "Wash hand basin",
        unit: "set",
        quantity: 0,
      },
      {
        roomArea: "Bathroom/Toilet",
        tradeCategory: "Plumbing/Mechanical",
        description: "Shower mixer and tray",
        unit: "set",
        quantity: 0,
      },
      {
        roomArea: "Bathroom/Toilet",
        tradeCategory: "Plumbing/Mechanical",
        description: "Water heater",
        unit: "pcs",
        quantity: 0,
      },
      {
        roomArea: "Bathroom/Toilet",
        tradeCategory: "Tiling/Flooring",
        description: "Floor tiles",
        unit: "sqm",
        quantity: 0,
      },
      {
        roomArea: "Bathroom/Toilet",
        tradeCategory: "Tiling/Flooring",
        description: "Wall tiles",
        unit: "sqm",
        quantity: 0,
      },
      {
        roomArea: "Bathroom/Toilet",
        tradeCategory: "Electrical",
        description: "Extractor fan",
        unit: "pcs",
        quantity: 0,
      },
      {
        roomArea: "Bathroom/Toilet",
        tradeCategory: "Electrical",
        description: "Mirror light",
        unit: "pcs",
        quantity: 0,
      },
      {
        roomArea: "Bathroom/Toilet",
        tradeCategory: "Aluminum/Glazing",
        description: "Shower cubicle",
        unit: "set",
        quantity: 0,
      },
      {
        roomArea: "Bathroom/Toilet",
        tradeCategory: "Ironmongery",
        description: "Towel rails",
        unit: "pcs",
        quantity: 0,
      },
    ],
  },
  {
    id: "tmpl-kitchen-fitout",
    name: "Kitchen Fit-Out",
    description: "Complete kitchen installation package",
    items: [
      {
        roomArea: "Kitchen",
        tradeCategory: "Carpentry/Joinery",
        description: "Base cabinets",
        unit: "set",
        quantity: 0,
      },
      {
        roomArea: "Kitchen",
        tradeCategory: "Carpentry/Joinery",
        description: "Wall cabinets",
        unit: "set",
        quantity: 0,
      },
      {
        roomArea: "Kitchen",
        tradeCategory: "Carpentry/Joinery",
        description: "Countertop",
        unit: "m",
        quantity: 0,
      },
      {
        roomArea: "Kitchen",
        tradeCategory: "Plumbing/Mechanical",
        description: "Sink and tap",
        unit: "set",
        quantity: 0,
      },
      {
        roomArea: "Kitchen",
        tradeCategory: "Plumbing/Mechanical",
        description: "Gas cooker point",
        unit: "pcs",
        quantity: 0,
      },
      {
        roomArea: "Kitchen",
        tradeCategory: "Electrical",
        description: "Cooker socket",
        unit: "pcs",
        quantity: 0,
      },
      {
        roomArea: "Kitchen",
        tradeCategory: "Tiling/Flooring",
        description: "Floor tiles",
        unit: "sqm",
        quantity: 0,
      },
      {
        roomArea: "Kitchen",
        tradeCategory: "Tiling/Flooring",
        description: "Wall tiles (backsplash)",
        unit: "sqm",
        quantity: 0,
      },
      {
        roomArea: "Kitchen",
        tradeCategory: "Electrical",
        description: "Power sockets",
        unit: "pcs",
        quantity: 0,
      },
    ],
  },
  {
    id: "tmpl-electrical-roughin",
    name: "Electrical Rough-In",
    description: "Electrical first fix for all rooms",
    items: [
      {
        roomArea: "Living Room",
        tradeCategory: "Electrical",
        description: "Conduit run",
        unit: "m",
        quantity: 0,
      },
      {
        roomArea: "Living Room",
        tradeCategory: "Electrical",
        description: "Switch boxes",
        unit: "pcs",
        quantity: 0,
      },
      {
        roomArea: "Living Room",
        tradeCategory: "Electrical",
        description: "Socket boxes",
        unit: "pcs",
        quantity: 0,
      },
      {
        roomArea: "Master Bedroom",
        tradeCategory: "Electrical",
        description: "Conduit run",
        unit: "m",
        quantity: 0,
      },
      {
        roomArea: "Master Bedroom",
        tradeCategory: "Electrical",
        description: "Switch boxes",
        unit: "pcs",
        quantity: 0,
      },
      {
        roomArea: "Master Bedroom",
        tradeCategory: "Electrical",
        description: "Socket boxes",
        unit: "pcs",
        quantity: 0,
      },
      {
        roomArea: "Bedroom",
        tradeCategory: "Electrical",
        description: "Conduit run",
        unit: "m",
        quantity: 0,
      },
      {
        roomArea: "Bedroom",
        tradeCategory: "Electrical",
        description: "Switch boxes",
        unit: "pcs",
        quantity: 0,
      },
      {
        roomArea: "Bedroom",
        tradeCategory: "Electrical",
        description: "Socket boxes",
        unit: "pcs",
        quantity: 0,
      },
      {
        roomArea: "Bedroom",
        tradeCategory: "Electrical",
        description: "Conduit run",
        unit: "m",
        quantity: 0,
      },
      {
        roomArea: "Bedroom",
        tradeCategory: "Electrical",
        description: "Switch boxes",
        unit: "pcs",
        quantity: 0,
      },
      {
        roomArea: "Bedroom",
        tradeCategory: "Electrical",
        description: "Socket boxes",
        unit: "pcs",
        quantity: 0,
      },
      {
        roomArea: "Kitchen",
        tradeCategory: "Electrical",
        description: "Conduit run",
        unit: "m",
        quantity: 0,
      },
      {
        roomArea: "Kitchen",
        tradeCategory: "Electrical",
        description: "Socket boxes",
        unit: "pcs",
        quantity: 0,
      },
      {
        roomArea: "Bathroom/Toilet",
        tradeCategory: "Electrical",
        description: "Conduit run",
        unit: "m",
        quantity: 0,
      },
      {
        roomArea: "Bathroom/Toilet",
        tradeCategory: "Electrical",
        description: "Switch boxes",
        unit: "pcs",
        quantity: 0,
      },
      {
        roomArea: "Corridor/Hallway",
        tradeCategory: "Electrical",
        description: "Conduit run",
        unit: "m",
        quantity: 0,
      },
      {
        roomArea: "Corridor/Hallway",
        tradeCategory: "Electrical",
        description: "Switch boxes",
        unit: "pcs",
        quantity: 0,
      },
    ],
  },
  {
    id: "tmpl-external-works",
    name: "External Works",
    description: "External and landscaping items",
    items: [
      {
        roomArea: "External Works",
        tradeCategory: "Civil/Structural",
        description: "Concrete apron",
        unit: "sqm",
        quantity: 0,
      },
      {
        roomArea: "External Works",
        tradeCategory: "Civil/Structural",
        description: "Drainage channels",
        unit: "m",
        quantity: 0,
      },
      {
        roomArea: "External Works",
        tradeCategory: "Landscaping",
        description: "Topsoil and turf",
        unit: "sqm",
        quantity: 0,
      },
      {
        roomArea: "External Works",
        tradeCategory: "Landscaping",
        description: "Perimeter fence",
        unit: "m",
        quantity: 0,
      },
      {
        roomArea: "External Works",
        tradeCategory: "Electrical",
        description: "External light points",
        unit: "pcs",
        quantity: 0,
      },
      {
        roomArea: "External Works",
        tradeCategory: "Plumbing/Mechanical",
        description: "Water storage tank",
        unit: "pcs",
        quantity: 0,
      },
      {
        roomArea: "External Works",
        tradeCategory: "Security/Access Control",
        description: "Gate motor",
        unit: "pcs",
        quantity: 0,
      },
      {
        roomArea: "Garage",
        tradeCategory: "Civil/Structural",
        description: "Floor concrete",
        unit: "sqm",
        quantity: 0,
      },
      {
        roomArea: "Garage",
        tradeCategory: "Electrical",
        description: "Roller shutter door",
        unit: "pcs",
        quantity: 0,
      },
    ],
  },
];

function getBuiltInTemplates() {
  return JSON.parse(JSON.stringify(BUILT_IN_TEMPLATES));
}
function getCustomTemplates() {
  try {
    const raw = localStorage.getItem("fb_customTemplates");
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}
function saveCustomTemplates(templates) {
  localStorage.setItem("fb_customTemplates", JSON.stringify(templates));
}
function getHiddenBuiltInIds() {
  try {
    const raw = localStorage.getItem("fb_hiddenBuiltInTemplates");
    const hasVisited = localStorage.getItem("fb_templatesVisited");
    if (hasVisited && raw !== null) return new Set(JSON.parse(raw));
    localStorage.setItem("fb_templatesVisited", "true");
    const allIds = new Set(getBuiltInTemplates().map((t) => t.id));
    saveHiddenBuiltInIds(allIds);
    return allIds;
  } catch (e) {
    return new Set();
  }
}
function saveHiddenBuiltInIds(ids) {
  localStorage.setItem(
    "fb_hiddenBuiltInTemplates",
    JSON.stringify(Array.from(ids)),
  );
}
function hideBuiltInTemplate(id) {
  const hidden = getHiddenBuiltInIds();
  hidden.add(id);
  saveHiddenBuiltInIds(hidden);
  loadTemplatesSegment();
}
function hideAllBuiltInTemplates() {
  saveHiddenBuiltInIds(new Set(getBuiltInTemplates().map((t) => t.id)));
  loadTemplatesSegment();
}
function showAllBuiltInTemplates() {
  localStorage.setItem("fb_hiddenBuiltInTemplates", JSON.stringify([]));
  loadTemplatesSegment();
}
function getAllTemplates() {
  return [...getCustomTemplates(), ...getBuiltInTemplates()];
}
function findTemplateById(id) {
  return getAllTemplates().find((t) => t.id === id);
}
function deleteCustomTemplate(id) {
  const filtered = getCustomTemplates().filter((t) => t.id !== id);
  saveCustomTemplates(filtered);
  selectedTemplateIds.delete(id);
}
function generateTemplateId() {
  return "TMPL-CUST-" + Date.now();
}

function exportAllTemplatesJSON() {
  const templates = getCustomTemplates();
  if (!templates.length) {
    alert("No custom templates to export.");
    return;
  }
  const data = {
    exportedAt: new Date().toISOString(),
    app: "FieldScan Pro",
    version: "1.0",
    templates: templates,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `FieldScan_Templates_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportSingleTemplateJSON(templateId) {
  const t = findTemplateById(templateId);
  if (!t) {
    alert("Template not found.");
    return;
  }
  const data = {
    exportedAt: new Date().toISOString(),
    app: "FieldScan Pro",
    version: "1.0",
    templates: [t],
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `FieldScan_Template_${t.name.replace(/[^a-z0-9]/gi, "_")}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function importTemplatesFromJSON(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!data || !Array.isArray(data.templates)) {
          reject(
            new Error("Invalid template file. Missing 'templates' array."),
          );
          return;
        }
        const incoming = data.templates.filter(
          (t) => t && t.id && t.name && Array.isArray(t.items),
        );
        if (!incoming.length) {
          reject(new Error("No valid templates found in file."));
          return;
        }
        const existing = getCustomTemplates();
        const existingIds = new Set(existing.map((t) => t.id));
        let added = 0,
          skipped = 0;
        incoming.forEach((t) => {
          if (existingIds.has(t.id)) {
            skipped++;
          } else {
            // Strip any non-template fields and ensure clean structure
            const clean = {
              id: t.id,
              name: t.name,
              description: t.description || "Imported template",
              items: (t.items || []).map((i) => ({
                roomArea: i.roomArea || "",
                tradeCategory: i.tradeCategory || "",
                description: i.description || "",
                unit: i.unit || "pcs",
                quantity: 0,
              })),
            };
            existing.push(clean);
            added++;
          }
        });
        saveCustomTemplates(existing);
        resolve({ added, skipped, total: incoming.length });
      } catch (e) {
        reject(
          new Error("Failed to parse JSON: " + (e.message || "Unknown error")),
        );
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.readAsText(file);
  });
}

function openImportTemplatesModal() {
  const body = document.getElementById("modalBody");
  const submit = document.getElementById("modalSubmit");
  const title = document.getElementById("modalTitle");
  const overlay = document.getElementById("modalOverlay");
  title.innerText = "Import Templates";
  overlay.style.display = "flex";
  body.innerHTML = `<p style="font-size:14px; color:var(--muted); margin-bottom:12px;">Select a JSON file exported from FieldScan Pro. Templates with duplicate IDs will be skipped.</p><input type="file" id="tmpl_import_file" accept="application/json" style="width:100%; padding:12px; font-size:16px;"><div id="tmpl_import_result" style="margin-top:12px; font-size:13px; font-weight:700; display:none;"></div>`;
  submit.style.display = "block";
  submit.innerText = "Import";
  submit.onclick = async () => {
    const fileInput = document.getElementById("tmpl_import_file");
    if (!fileInput.files || !fileInput.files[0]) {
      alert("Select a JSON file");
      return;
    }
    submit.disabled = true;
    submit.innerText = "Importing...";
    try {
      const result = await importTemplatesFromJSON(fileInput.files[0]);
      const resultDiv = document.getElementById("tmpl_import_result");
      resultDiv.style.display = "block";
      resultDiv.innerHTML = `<span style="color:var(--success);">✓ ${result.added} imported</span>${result.skipped > 0 ? `, <span style="color:#fd7e14;">${result.skipped} skipped (duplicate)</span>` : ""}`;
      loadTemplatesSegment();
      setTimeout(() => {
        closeModal();
      }, 1500);
    } catch (e) {
      alert("⚠️ " + e.message);
      submit.disabled = false;
      submit.innerText = "Import";
    }
  };
}

function loadTemplatesSegment() {
  const container = document.getElementById("console-templates-list");
  if (!container) return;
  const all = getAllTemplates();
  const projectId = getCurrentProjectId();
  const cache = getCache();
  const projectItems = (cache.takeoffs || []).filter(
    (i) => i.projectId === projectId,
  );

  let html = "";
  if (projectItems.length > 0) {
    html += `<div class="card" style="background: var(--card-light); border-style: dashed;"><div style="display:flex; justify-content:space-between; align-items:center; gap:10px;"><div><strong style="font-size:15px;">Save Current Take-Offs as Template</strong><div style="font-size:12px; color:var(--muted); margin-top:2px;">${projectItems.length} items in this project</div></div><button class="action-btn" style="width:auto; padding:8px 16px; font-size:13px;" onclick="openSaveAsTemplateModal()"><i class="fas fa-save"></i> Save</button></div></div>`;
  }

  const customTemplates = getCustomTemplates();
  const builtInTemplates = getBuiltInTemplates();
  const hiddenIds = getHiddenBuiltInIds();
  const visibleBuiltIns = builtInTemplates.filter((t) => !hiddenIds.has(t.id));
  const allBuiltInsHidden = visibleBuiltIns.length === 0;
  const allIds = new Set(all.map((t) => t.id));
  for (const id of selectedTemplateIds) {
    if (!allIds.has(id)) selectedTemplateIds.delete(id);
  }

  if (!customTemplates.length && !visibleBuiltIns.length) {
    html += `<p style="text-align:center; padding:20px; color:var(--muted);">No templates available.</p>`;
    container.innerHTML = html;
    selectedTemplateIds.clear();
    return;
  }

  html += `<div style="margin-top:8px; font-size:13px; font-weight:800; text-transform:uppercase; color:var(--muted);">Custom Templates</div>`;
  html += `<div style="display:flex; gap:6px; flex-wrap:wrap; margin:8px 0;">
    <button class="action-btn" style="width:auto; padding:6px 12px; font-size:12px; background:var(--card-light); color:var(--text);" onclick="window.exportAllTemplatesJSON()"><i class="fas fa-download"></i> Export All</button>
    <button class="action-btn" style="width:auto; padding:6px 12px; font-size:12px; background:var(--primary);" onclick="window.openImportTemplatesModal()"><i class="fas fa-upload"></i> Import</button>
  </div>`;
  if (customTemplates.length > 0 && selectedTemplateIds.size > 0) {
    html += `<div style="display:flex; justify-content:space-between; align-items:center; margin:10px 0;"><span style="font-size:13px; font-weight:700;">${selectedTemplateIds.size} selected</span><button class="action-btn" style="width:auto; padding:8px 16px; font-size:13px; background:var(--danger);" onclick="window.deleteSelectedTemplates()"><i class="fas fa-trash"></i> Delete Selected</button></div>`;
  }
  if (customTemplates.length) {
    html += customTemplates
      .map((t) => {
        const isChecked = selectedTemplateIds.has(t.id);
        return `<div class="card" style="cursor: default;"><div style="display:flex; justify-content:space-between; align-items:start; gap:12px;"><div style="flex:1;"><div style="display:flex; align-items:center; gap:8px;"><input type="checkbox" style="width:auto; cursor:pointer;" ${isChecked ? "checked" : ""} onclick="window.toggleTemplateSelection('${escapeAttr(t.id)}', this.checked)"><strong style="font-size:16px;">${escapeHtml(t.name)}</strong><span style="font-size:10px; background:var(--primary); color:#fff; padding:2px 6px; border-radius:4px; text-transform:uppercase;">Custom</span></div><div style="font-size:12px; color:var(--muted); margin-top:3px;">${escapeHtml(t.description)}</div><div style="font-size:11px; color:var(--muted); margin-top:4px;">${t.items.length} items</div></div><div style="display:flex; gap:6px; flex-shrink:0;"><button class="action-btn" style="width:auto; padding:6px 12px; font-size:12px; background:var(--card-light); color:var(--text);" onclick="previewTemplate('${escapeAttr(t.id)}')"><i class="fas fa-eye"></i></button><button class="action-btn" style="width:auto; padding:6px 12px; font-size:12px; background:#495057;" onclick="openEditTemplateModal('${escapeAttr(t.id)}')"><i class="fas fa-edit"></i></button><button class="action-btn" style="width:auto; padding:6px 12px; font-size:12px; background:var(--card-light); color:var(--text);" onclick="window.exportSingleTemplateJSON('${escapeAttr(t.id)}')"><i class="fas fa-download"></i></button><button class="action-btn" style="width:auto; padding:6px 12px; font-size:12px;" onclick="applyTemplateToProject('${escapeAttr(t.id)}')"><i class="fas fa-check"></i> Apply</button></div></div></div>`;
      })
      .join("");
  } else {
    html += `<p style="text-align:center; padding:12px; color:var(--muted); font-size:13px;">No custom templates.</p>`;
  }

  html += `<div style="margin-top:16px; font-size:13px; font-weight:800; text-transform:uppercase; color:var(--muted);">Built-in Templates</div>`;
  if (allBuiltInsHidden) {
    html += `<p style="text-align:center; padding:12px; color:var(--muted); font-size:13px;">All built-in templates are hidden.<button class="action-btn" style="width:auto; padding:6px 12px; font-size:12px; margin-left:8px;" onclick="window.showAllBuiltInTemplates()"><i class="fas fa-eye"></i> Show All</button></p>`;
  } else {
    html += `<div style="display:flex; justify-content:space-between; align-items:center; margin:8px 0;"><span style="font-size:12px; color:var(--muted);">${visibleBuiltIns.length} of ${builtInTemplates.length} shown</span><button class="action-btn" style="width:auto; padding:6px 12px; font-size:12px; background:var(--danger);" onclick="window.hideAllBuiltInTemplates()"><i class="fas fa-eye-slash"></i> Hide All</button></div>`;
    html += visibleBuiltIns
      .map(
        (t) =>
          `<div class="card" style="cursor: default;"><div style="display:flex; justify-content:space-between; align-items:start; gap:12px;"><div style="flex:1;"><div style="display:flex; align-items:center; gap:8px;"><div style="width:18px; flex-shrink:0;"></div><strong style="font-size:16px;">${escapeHtml(t.name)}</strong></div><div style="font-size:12px; color:var(--muted); margin-top:3px;">${escapeHtml(t.description)}</div><div style="font-size:11px; color:var(--muted); margin-top:4px;">${t.items.length} items</div></div><div style="display:flex; gap:6px; flex-shrink:0;"><button class="action-btn" style="width:auto; padding:6px 12px; font-size:12px; background:var(--card-light); color:var(--text);" onclick="previewTemplate('${escapeAttr(t.id)}')"><i class="fas fa-eye"></i></button><button class="action-btn" style="width:auto; padding:6px 12px; font-size:12px;" onclick="applyTemplateToProject('${escapeAttr(t.id)}')"><i class="fas fa-check"></i> Apply</button></div></div></div>`,
      )
      .join("");
  }
  container.innerHTML = html;
}

function openSaveAsTemplateModal() {
  const body = document.getElementById("modalBody");
  const submit = document.getElementById("modalSubmit");
  const title = document.getElementById("modalTitle");
  const overlay = document.getElementById("modalOverlay");
  title.innerText = "Save as Template";
  overlay.style.display = "flex";
  body.innerHTML = `<label style="display:block; font-weight:800; margin-top:12px; margin-bottom:4px;">Template Name</label><input id="tmpl_name" style="width:100%; padding:12px; font-size:16px;" placeholder="e.g. My Standard Flat"><label style="display:block; font-weight:800; margin-top:12px; margin-bottom:4px;">Description</label><textarea id="tmpl_desc" rows="2" style="width:100%; padding:12px; font-size:16px;" placeholder="Brief description..."></textarea>`;
  submit.style.display = "block";
  submit.innerText = "Save Template";
  submit.onclick = () => {
    const name = document.getElementById("tmpl_name").value.trim();
    const desc = document.getElementById("tmpl_desc").value.trim();
    if (!name) {
      alert("Enter a template name");
      return;
    }
    const cache = getCache();
    const projectId = getCurrentProjectId();
    const items = (cache.takeoffs || []).filter(
      (i) => i.projectId === projectId,
    );
    if (!items.length) {
      alert("No items to save");
      return;
    }
    const stripped = items.map((i) => ({
      roomArea: i.roomArea,
      tradeCategory: i.tradeCategory,
      description: i.description,
      unit: i.unit,
      quantity: 0,
    }));
    const custom = getCustomTemplates();
    custom.push({
      id: generateTemplateId(),
      name,
      description: desc || "Custom template",
      items: stripped,
    });
    saveCustomTemplates(custom);
    closeModal();
    loadTemplatesSegment();
    alert("Template saved");
  };
}

function openEditTemplateModal(id) {
  const t = findTemplateById(id);
  if (!t) return;
  if (BUILT_IN_TEMPLATES.find((b) => b.id === id)) {
    alert("Built-in templates cannot be edited");
    return;
  }
  const body = document.getElementById("modalBody");
  const submit = document.getElementById("modalSubmit");
  const title = document.getElementById("modalTitle");
  const overlay = document.getElementById("modalOverlay");
  title.innerText = "Edit Template";
  overlay.style.display = "flex";
  const roomOptions = MASTER_ROOM_TYPES.map(
    (r) => `<option value="${escapeAttr(r)}">`,
  ).join("");
  const tradeOptions = MASTER_TRADE_CATEGORIES.map(
    (t) => `<option value="${escapeAttr(t)}">`,
  ).join("");
  const itemsHtml = t.items
    .map(
      (item, idx) =>
        `<div class="tmpl-edit-row" style="display:grid; grid-template-columns: 1fr 1fr 1fr 80px 30px; gap:6px; margin-bottom:8px; align-items:center;"><input list="edit-room-types" value="${escapeAttr(item.roomArea)}" placeholder="Room" style="padding:8px; font-size:14px; border:1.5px solid var(--border); border-radius:8px;"><input list="edit-trade-cats" value="${escapeAttr(item.tradeCategory)}" placeholder="Trade" style="padding:8px; font-size:14px; border:1.5px solid var(--border); border-radius:8px;"><input value="${escapeAttr(item.description)}" placeholder="Description" style="padding:8px; font-size:14px; border:1.5px solid var(--border); border-radius:8px;"><input value="${escapeAttr(item.unit)}" placeholder="Unit" style="padding:8px; font-size:14px; border:1.5px solid var(--border); border-radius:8px;"><button onclick="this.parentElement.remove()" style="background:var(--danger); color:white; border:none; border-radius:6px; cursor:pointer; height:32px; font-size:16px;">×</button></div>`,
    )
    .join("");
  body.innerHTML = `<datalist id="edit-room-types">${roomOptions}</datalist><datalist id="edit-trade-cats">${tradeOptions}</datalist><label style="display:block; font-weight:800; margin-top:12px; margin-bottom:4px;">Template Name</label><input id="edit_tmpl_name" value="${escapeAttr(t.name)}" style="width:100%; padding:12px; font-size:16px; border:1.5px solid var(--border); border-radius:12px;"><label style="display:block; font-weight:800; margin-top:12px; margin-bottom:4px;">Description</label><textarea id="edit_tmpl_desc" rows="2" style="width:100%; padding:12px; font-size:16px; border:1.5px solid var(--border); border-radius:12px;">${escapeHtml(t.description)}</textarea><div style="margin-top:16px; margin-bottom:8px; font-weight:800; font-size:13px; text-transform:uppercase;">Items</div><div id="edit_tmpl_items">${itemsHtml}</div><button class="action-btn" style="margin-top:10px; background:var(--card-light); color:var(--text);" onclick="addEditTemplateItemRow()"><i class="fas fa-plus"></i> Add Item</button>`;
  submit.style.display = "block";
  submit.innerText = "Save Changes";
  submit.onclick = () => {
    const name = document.getElementById("edit_tmpl_name").value.trim();
    const desc = document.getElementById("edit_tmpl_desc").value.trim();
    if (!name) {
      alert("Enter a template name");
      return;
    }
    const rows = document.querySelectorAll("#edit_tmpl_items > .tmpl-edit-row");
    const newItems = [];
    rows.forEach((row) => {
      const inputs = row.querySelectorAll("input");
      const description = inputs[2].value.trim();
      if (description)
        newItems.push({
          roomArea: inputs[0].value.trim(),
          tradeCategory: inputs[1].value.trim(),
          description: description,
          unit: inputs[3].value.trim() || "pcs",
          quantity: 0,
        });
    });
    if (!newItems.length) {
      alert("Template must have at least one item with a description");
      return;
    }
    const custom = getCustomTemplates();
    const idx = custom.findIndex((c) => c.id === id);
    if (idx !== -1) {
      custom[idx].name = name;
      custom[idx].description = desc || "Custom template";
      custom[idx].items = newItems;
      saveCustomTemplates(custom);
      closeModal();
      loadTemplatesSegment();
      alert("Template updated");
    }
  };
}

function addEditTemplateItemRow() {
  const container = document.getElementById("edit_tmpl_items");
  if (!container) return;
  const div = document.createElement("div");
  div.className = "tmpl-edit-row";
  div.style.cssText =
    "display:grid; grid-template-columns: 1fr 1fr 1fr 80px 30px; gap:6px; margin-bottom:8px; align-items:center;";
  div.innerHTML = `<input list="edit-room-types" placeholder="Room" style="padding:8px; font-size:14px; border:1.5px solid var(--border); border-radius:8px;"><input list="edit-trade-cats" placeholder="Trade" style="padding:8px; font-size:14px; border:1.5px solid var(--border); border-radius:8px;"><input placeholder="Description" style="padding:8px; font-size:14px; border:1.5px solid var(--border); border-radius:8px;"><input placeholder="Unit" style="padding:8px; font-size:14px; border:1.5px solid var(--border); border-radius:8px;"><button onclick="this.parentElement.remove()" style="background:var(--danger); color:white; border:none; border-radius:6px; cursor:pointer; height:32px; font-size:16px;">×</button>`;
  container.appendChild(div);
}

function previewTemplate(id) {
  const t = findTemplateById(id);
  if (!t) return;
  const body = document.getElementById("modalBody");
  const submit = document.getElementById("modalSubmit");
  const title = document.getElementById("modalTitle");
  const overlay = document.getElementById("modalOverlay");
  title.innerText = "Template Preview: " + t.name;
  overlay.style.display = "flex";
  const rows = t.items
    .map(
      (i) =>
        `<tr><td style="border-bottom:1px solid #adb5bd; padding:8px; font-size:12px;">${escapeHtml(i.roomArea)}</td><td style="border-bottom:1px solid #adb5bd; padding:8px; font-size:12px;">${escapeHtml(i.tradeCategory)}</td><td style="border-bottom:1px solid #adb5bd; padding:8px; font-size:12px;">${escapeHtml(i.description)}</td><td style="border-bottom:1px solid #adb5bd; padding:8px; font-size:12px; text-align:right; font-weight:700;">${escapeHtml(i.quantity)} ${escapeHtml(i.unit)}</td></tr>`,
    )
    .join("");
  body.innerHTML = `<p style="color:var(--muted); font-size:13px; margin-bottom:10px;">${escapeHtml(t.description)} — ${t.items.length} items</p><div style="max-height:50vh; overflow-y:auto;"><table style="width:100%; border-collapse:collapse; font-size:12px;"><thead><tr style="background:#000; color:#fff;"><th style="padding:8px; text-align:left; font-size:10px; text-transform:uppercase;">Room</th><th style="padding:8px; text-align:left; font-size:10px; text-transform:uppercase;">Trade</th><th style="padding:8px; text-align:left; font-size:10px; text-transform:uppercase;">Description</th><th style="padding:8px; text-align:right; font-size:10px; text-transform:uppercase;">Qty</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  submit.style.display = "block";
  submit.innerText = "Close";
  submit.onclick = closeModal;
}

async function applyTemplateToProject(templateId) {
  const t = findTemplateById(templateId);
  if (!t) return;
  if (
    !confirm(`Apply "${t.name}" (${t.items.length} items) to this project?

Quantities will be set to 0 for field measurement.`)
  )
    return;
  const projectId = getCurrentProjectId();
  if (!projectId) {
    alert("No project selected");
    return;
  }
  const btn = document.querySelector(
    `button[onclick="applyTemplateToProject('${escapeAttr(templateId)}')"]`,
  );
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i>`;
  }
  try {
    for (const item of t.items) {
      const payload = {
        itemId:
          "TO-" + Date.now() + "-" + Math.random().toString(36).substr(2, 5),
        projectId: projectId,
        roomArea: item.roomArea,
        tradeCategory: item.tradeCategory,
        description: item.description,
        quantity: 0,
        unit: item.unit,
        beforePhotoUrl: "",
        scopeNotes: "From template: " + t.name,
      };
      await callApi("saveTakeOffItem", payload);
    }
    loadTakeOffListings(true);
    alert(`Template applied: ${t.items.length} items added.`);
  } catch (e) {
    alert("Error applying template: " + (e.message || "Unknown error"));
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i class="fas fa-check"></i> Apply`;
    }
  }
}

// ===== db.js =====
const DB_NAME = "FieldScanOfflineDB";
const STORE_NAME = "syncQueue";
const SNAG_PHOTO_STORE = "snagPhotos";

let dbPromise = null;

function openQueueDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 3);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME))
        db.createObjectStore(STORE_NAME, {
          keyPath: "id",
          autoIncrement: true,
        });
      if (!db.objectStoreNames.contains(SNAG_PHOTO_STORE))
        db.createObjectStore(SNAG_PHOTO_STORE, { keyPath: "snagId" });
    };
    req.onsuccess = (e) => {
      const db = e.target.result;
      db.onclose = () => {
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = (e) => {
      dbPromise = null;
      reject(e.target.error);
    };
  });
  return dbPromise;
}

async function queueOfflineRequest(action, data) {
  const db = await openQueueDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).add({ action, data, timestamp: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getQueuedRequests() {
  const db = await openQueueDB();
  return new Promise((resolve, reject) => {
    const req = db
      .transaction(STORE_NAME, "readonly")
      .objectStore(STORE_NAME)
      .getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function deleteQueuedRequest(id) {
  const db = await openQueueDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function saveSnagPhotosLocally(snagId, photoDataString) {
  const db = await openQueueDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SNAG_PHOTO_STORE, "readwrite");
    tx.objectStore(SNAG_PHOTO_STORE).put({
      snagId,
      photoData: photoDataString,
      savedAt: Date.now(),
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getSnagPhotosLocally(snagId) {
  const db = await openQueueDB();
  return new Promise((resolve, reject) => {
    const req = db
      .transaction(SNAG_PHOTO_STORE, "readonly")
      .objectStore(SNAG_PHOTO_STORE)
      .get(snagId);
    req.onsuccess = () => resolve(req.result ? req.result.photoData : "");
    req.onerror = () => reject(req.error);
  });
}

async function deleteSnagPhotosLocally(snagId) {
  const db = await openQueueDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SNAG_PHOTO_STORE, "readwrite");
    tx.objectStore(SNAG_PHOTO_STORE).delete(snagId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ===== backup.js =====
const GET_ACTION_BY_STORE = {
  projects: "getProjects",
  takeoffs: "getTakeOffItems",
  progressLogs: "getProgressLogs",
  snags: "getSnags",
  vendors: "getVendors",
  workorders: "getWorkOrders",
  payments: "getPayments",
};

const MUTATION_MAP = {
  saveProject: { store: "projects", idKey: "projectId", mode: "upsert" },
  updateProject: { store: "projects", idKey: "projectId", mode: "upsert" },
  saveTakeOffItem: { store: "takeoffs", idKey: "itemId", mode: "upsert" },
  updateTakeOffItem: { store: "takeoffs", idKey: "itemId", mode: "upsert" },
  deleteTakeOffItem: { store: "takeoffs", idKey: "itemId", mode: "delete" },
  saveProgressLog: { store: "progressLogs", idKey: "logId", mode: "upsert" },
  saveSnag: { store: "snags", idKey: "snagId", mode: "upsert" },
  updateSnag: { store: "snags", idKey: "snagId", mode: "upsert" },
  deleteSnag: { store: "snags", idKey: "snagId", mode: "delete" },
  saveVendor: { store: "vendors", idKey: "vendorId", mode: "upsert" },
  updateVendor: { store: "vendors", idKey: "vendorId", mode: "upsert" },
  deleteVendor: { store: "vendors", idKey: "vendorId", mode: "delete" },
  saveWorkOrder: { store: "workorders", idKey: "workOrderId", mode: "upsert" },
  updateWorkOrder: {
    store: "workorders",
    idKey: "workOrderId",
    mode: "upsert",
  },
  savePayment: { store: "payments", idKey: "paymentId", mode: "upsert" },
  updatePayment: { store: "payments", idKey: "paymentId", mode: "upsert" },
};

function backupKey(action) {
  return `fb_${action}`;
}
function readBackup(action, fallback = []) {
  const raw = localStorage.getItem(backupKey(action));
  return raw ? JSON.parse(raw) : fallback;
}
function writeBackup(action, value) {
  try {
    localStorage.setItem(backupKey(action), JSON.stringify(value));
  } catch (err) {
    console.error("writeBackup failed:", action, err);
    if (err && err.name === "QuotaExceededError")
      alert("⚠️ Local storage is full. Try syncing and clearing attachments.");
  }
}

function recomputeLocalStats() {
  const vendors = readBackup("getVendors", []);
  writeBackup("getStats", {
    activeVendors: vendors.filter((v) => v.archived !== "Yes").length,
  });
}

function applyLocalMutation(action, data) {
  const cfg = MUTATION_MAP[action];
  if (!cfg) return;
  const getAction = GET_ACTION_BY_STORE[cfg.store];
  let current = readBackup(getAction, []);
  const idVal = String(data[cfg.idKey] || "").trim();
  if (cfg.mode === "delete")
    current = current.filter((item) => !idsMatch(item[cfg.idKey], idVal));
  else {
    const idx = current.findIndex((item) => idsMatch(item[cfg.idKey], idVal));
    const record = { ...data, offlinePending: true, lastModified: Date.now() };
    if (idx === -1) current = [record, ...current];
    else current[idx] = { ...current[idx], ...record };
  }
  writeBackup(getAction, current);
  if (cfg.store === "vendors") recomputeLocalStats();
}

// ===== reports.js =====
async function generateReportPDF(orientation) {
  orientation = (orientation || "portrait").toLowerCase();
  const isLandscape = orientation === "landscape" || orientation === "l";
  const jsPdfOrientation = isLandscape ? "landscape" : "portrait";
  const container = document.getElementById("report-print-container");
  if (!container || !container.innerText.trim()) {
    alert("Generate a report first");
    return null;
  }
  if (typeof html2canvas === "undefined" || typeof jspdf === "undefined") {
    alert(
      "PDF libraries not loaded. Add html2canvas and jsPDF CDNs to index.html.",
    );
    return null;
  }

  const originals = {
    display: container.style.display,
    visibility: container.style.visibility,
    position: container.style.position,
    left: container.style.left,
    top: container.style.top,
    width: container.style.width,
    maxWidth: container.style.maxWidth,
    minWidth: container.style.minWidth,
    zIndex: container.style.zIndex,
    background: container.style.background,
    padding: container.style.padding,
  };

  const tables = container.querySelectorAll("table");
  const tableOriginalWidths = [];
  tables.forEach((t, i) => {
    tableOriginalWidths[i] = t.style.width;
    t.style.width = "100%";
    t.style.maxWidth = "none";
  });

  container.style.display = "block";
  container.style.visibility = "visible";
  container.style.position = "fixed";
  container.style.left = "0";
  container.style.top = "0";
  container.style.width = isLandscape ? "297mm" : "210mm";
  container.style.maxWidth = "none";
  container.style.minWidth = isLandscape ? "297mm" : "210mm";
  container.style.zIndex = "-9999";
  container.style.background = "white";
  container.style.padding = "15mm";
  container.getBoundingClientRect();

  try {
    const windowWidthPx = isLandscape ? 1123 : 794;
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      logging: false,
      windowWidth: windowWidthPx,
    });
    const imgData = canvas.toDataURL("image/jpeg", 0.92);
    const pdf = new jspdf.jsPDF(jsPdfOrientation, "mm", "a4");
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    const imgProps = pdf.getImageProperties(imgData);
    const imgWidth = imgProps.width;
    const imgHeight = imgProps.height;
    const ratio = pdfWidth / imgWidth;
    const scaledHeight = imgHeight * ratio;
    let heightLeft = scaledHeight;
    let position = 0;
    pdf.addImage(imgData, "JPEG", 0, position, pdfWidth, scaledHeight);
    heightLeft -= pdfHeight;
    while (heightLeft > 2) {
      position = heightLeft - scaledHeight;
      pdf.addPage();
      pdf.addImage(imgData, "JPEG", 0, position, pdfWidth, scaledHeight);
      heightLeft -= pdfHeight;
    }
    return pdf;
  } catch (err) {
    console.error("PDF generation failed:", err);
    alert("Failed to generate PDF.");
    return null;
  } finally {
    container.style.display = originals.display;
    container.style.visibility = originals.visibility;
    container.style.position = originals.position;
    container.style.left = originals.left;
    container.style.top = originals.top;
    container.style.width = originals.width;
    container.style.maxWidth = originals.maxWidth;
    container.style.minWidth = originals.minWidth;
    container.style.zIndex = originals.zIndex;
    container.style.background = originals.background;
    container.style.padding = originals.padding;
    tables.forEach((t, i) => {
      t.style.width = tableOriginalWidths[i];
      t.style.maxWidth = "";
    });
  }
}

async function saveReportPDF() {
  const orientSel = document.getElementById("rep-orientation-sel");
  const orientation =
    orientSel && orientSel.value ? orientSel.value : "portrait";
  const pdf = await generateReportPDF(orientation);
  if (pdf) pdf.save("FieldScan_Report.pdf");
}

async function sharePDFNative(pdf, filename, fallbackFn) {
  if (!navigator.canShare || !navigator.share) {
    fallbackFn();
    return;
  }
  const blob = pdf.output("blob");
  const file = new File([blob], filename, { type: "application/pdf" });
  if (navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: "FieldScan Pro Report",
        text: "FieldScan Pro Report",
      });
      return;
    } catch (err) {
      if (err.name !== "AbortError") console.error(err);
    }
  }
  fallbackFn();
}

async function shareReport() {
  const orientSel = document.getElementById("rep-orientation-sel");
  const orientation =
    orientSel && orientSel.value ? orientSel.value : "portrait";
  const pdf = await generateReportPDF(orientation);
  if (!pdf) return;
  const isMobile =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent,
    );
  if (isMobile && navigator.canShare && navigator.share) {
    try {
      const blob = pdf.output("blob");
      const file = new File([blob], "FieldScan_Report.pdf", {
        type: "application/pdf",
      });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: "FieldScan Pro Report",
          text: "FieldScan Pro Report",
        });
        return;
      }
    } catch (err) {
      if (err.name !== "AbortError") console.error("Native share failed:", err);
    }
  }
  pdf.save("FieldScan_Report.pdf");
}

async function initReportsConsoleEngine() {
  const cache = getCache();
  if (!cache.projects || !cache.projects.length) {
    try {
      const projects = await callApi("getProjects", {});
      cache.projects = projects || [];
      setCache(cache);
    } catch (e) {
      console.warn("Could not preload projects for reports:", e);
    }
  }
  const typeSel = document.getElementById("rep-type-sel");
  if (typeSel) {
    typeSel.value = "";
    handleReportScopePopulation();
  }
}

function handleReportScopePopulation() {
  const typeSel = document.getElementById("rep-type-sel");
  const scopeSel = document.getElementById("rep-scope-sel");
  const filterWrap = document.getElementById("rep-filter-wrap");
  const subTypeWrap = document.getElementById("rep-subtype-wrap");
  if (!typeSel || !scopeSel) return;
  scopeSel.style.display = "none";
  const scopeLabel = scopeSel.previousElementSibling;
  if (scopeLabel && scopeLabel.tagName === "LABEL")
    scopeLabel.style.display = "none";
  const type = typeSel.value;
  let validScopes = [];
  if (type === "financial_all") validScopes = ["all"];
  else if (
    type === "financial_project" ||
    type === "scope" ||
    type === "snags" ||
    type === "progress" ||
    type === "takeoff"
  )
    validScopes = ["project"];
  else if (type === "workorder_report") validScopes = ["project"];
  else if (type === "financial_client") validScopes = ["client"];
  else if (type === "financial_vendor") validScopes = ["vendor"];
  else validScopes = ["all", "project", "client", "vendor"];
  const allOptions = [
    { value: "all", text: "All Projects" },
    { value: "project", text: "Specific Project" },
    { value: "client", text: "Specific Client" },
    { value: "vendor", text: "Specific Vendor" },
  ];
  scopeSel.innerHTML = allOptions
    .filter((opt) => validScopes.includes(opt.value))
    .map((opt) => `<option value="${opt.value}">${opt.text}</option>`)
    .join("");
  if (validScopes.length === 1) {
    scopeSel.value = validScopes[0];
    scopeSel.disabled = true;
  } else {
    scopeSel.disabled = false;
    scopeSel.value = validScopes[0];
  }
  if (filterWrap)
    filterWrap.style.display =
      type === "financial_all" || !type ? "none" : "block";
  // Hide sub-type selector (removed) and workorder wrap
  if (subTypeWrap) subTypeWrap.style.display = "none";
  const woWrap = document.getElementById("rep-workorder-wrap");
  if (woWrap) woWrap.style.display = "none";
  const orientWrap = document.getElementById("rep-orientation-wrap");
  if (orientWrap)
    orientWrap.style.display = type === "financial_all" ? "block" : "none";
  handleReportFilterPopulation();
  updateFieldSelectorVisibility();
}

async function handleReportFilterPopulation() {
  const scopeSel = document.getElementById("rep-scope-sel");
  const filterWrap = document.getElementById("rep-filter-wrap");
  const filterLabel = document.getElementById("rep-filter-label");
  const filterSel = document.getElementById("rep-filter-sel");
  if (!scopeSel || !filterSel || !filterWrap) return;
  const scope = scopeSel.value;
  filterSel.innerHTML = '<option value="">-- Select --</option>';
  const cache = getCache();
  if (scope === "all") {
    filterWrap.style.display = "none";
    return;
  }
  filterWrap.style.display = "block";
  const typeSel = document.getElementById("rep-type-sel");
  if (typeSel && typeSel.value === "workorder_report") {
    filterSel.onchange = () => populateWorkOrderDropdown();
    populateWorkOrderDropdown();
  } else {
    filterSel.onchange = null;
    const woWrap = document.getElementById("rep-workorder-wrap");
    if (woWrap) woWrap.style.display = "none";
  }
  if (scope === "project") {
    filterLabel.innerText = "Select Project";
    const projects = cache.projects || [];
    filterSel.innerHTML += projects
      .map(
        (p) =>
          `<option value="${escapeAttr(p.projectId)}">${escapeHtml(p.clientName)} (${escapeHtml(p.projectId)})</option>`,
      )
      .join("");
  } else if (scope === "client") {
    filterLabel.innerText = "Select Client";
    const clients = [
      ...new Set(
        (cache.projects || []).map((p) => p.clientName).filter(Boolean),
      ),
    ].sort();
    filterSel.innerHTML += clients
      .map((c) => `<option value="${escapeAttr(c)}">${escapeHtml(c)}</option>`)
      .join("");
  } else if (scope === "vendor") {
    filterLabel.innerText = "Select Vendor";
    if (!cache.vendors || !cache.vendors.length) {
      try {
        const fetched = await callApi("getVendors", {});
        cache.vendors = fetched || [];
        setCache(cache);
      } catch (e) {}
    }
    const vendors = cache.vendors || [];
    filterSel.innerHTML += vendors
      .map(
        (v) =>
          `<option value="${escapeAttr(v.vendorId)}">${escapeHtml(v.company)}${v.trade ? ` (${escapeHtml(v.trade)})` : ""}</option>`,
      )
      .join("");
  }
}

function updateFieldSelectorVisibility() {
  const type = document.getElementById("rep-type-sel").value;
  let wrap = document.getElementById("rep-field-selector-wrap");
  const btn = document.querySelector('button[onclick*="compileFieldReport"]');
  if (type === "financial_all") {
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.id = "rep-field-selector-wrap";
      wrap.style.marginTop = "15px";
      wrap.innerHTML = `<label style="display:block; font-weight:800; margin-bottom:6px;">Fields to Print</label><div style="display:grid; grid-template-columns: 1fr 1fr; gap:6px; font-size:13px;"><label style="display:flex; align-items:center; gap:6px; cursor:default; opacity:0.7;"><input type="checkbox" class="rep-field-chk" value="project" checked disabled style="width:auto;"> Project (always)</label><label style="display:flex; align-items:center; gap:6px; cursor:pointer;"><input type="checkbox" class="rep-field-chk" value="subtotal" checked style="width:auto;"> Subtotal</label><label style="display:flex; align-items:center; gap:6px; cursor:pointer;"><input type="checkbox" class="rep-field-chk" value="vat" checked style="width:auto;"> VAT</label><label style="display:flex; align-items:center; gap:6px; cursor:pointer;"><input type="checkbox" class="rep-field-chk" value="totalContract" checked style="width:auto;"> Total</label><label style="display:flex; align-items:center; gap:6px; cursor:pointer;"><input type="checkbox" class="rep-field-chk" value="wht" checked style="width:auto;"> WHT</label><label style="display:flex; align-items:center; gap:6px; cursor:pointer;"><input type="checkbox" class="rep-field-chk" value="totalReceived" checked style="width:auto;"> Received</label><label style="display:flex; align-items:center; gap:6px; cursor:pointer;"><input type="checkbox" class="rep-field-chk" value="totalOutgoing" checked style="width:auto;"> Outgoing</label><label style="display:flex; align-items:center; gap:6px; cursor:pointer;"><input type="checkbox" class="rep-field-chk" value="smallExpenses" checked style="width:auto;"> Small Exp.</label><label style="display:flex; align-items:center; gap:6px; cursor:pointer;"><input type="checkbox" class="rep-field-chk" value="totalPending" checked style="width:auto;"> Pending</label><label style="display:flex; align-items:center; gap:6px; cursor:pointer;"><input type="checkbox" class="rep-field-chk" value="balanceExpected" checked style="width:auto;"> Balance</label><label style="display:flex; align-items:center; gap:6px; cursor:pointer;"><input type="checkbox" class="rep-field-chk" value="netProfit" checked style="width:auto;"> Net Profit</label></div>`;
      if (btn && btn.parentNode) btn.parentNode.insertBefore(wrap, btn);
    }
    wrap.style.display = "block";
  } else {
    if (wrap) wrap.style.display = "none";
  }
}

function getSelectedFinancialFields() {
  const checkboxes = document.querySelectorAll(".rep-field-chk:checked");
  const fields = Array.from(checkboxes).map((cb) => cb.value);
  if (!fields.includes("project")) fields.unshift("project");
  return fields;
}

function generateReportHeader(title, project, settings) {
  if (settings && settings.data) settings = settings.data;
  const dateStr = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const logoUrl =
    settings && settings.Logo ? getDirectImageUrl(settings.Logo) : "";
  let html = `<div class="report-header" style="border-bottom: 2.5px solid #000; padding-bottom: 2px; margin-bottom: 18px;"><div style="display: flex; justify-content: space-between; align-items: flex-end;">`;
  html += `<div style="flex:1;"><div style="font-size: 11px; color: #495057; font-weight: 600; margin-bottom: 2px;">${escapeHtml(dateStr)}</div><div style="font-size: 16px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #495057; line-height: 1.1;">${escapeHtml(title)}</div></div>`;
  if (logoUrl) {
    html += `<div style="flex-shrink:0; margin-left:16px; text-align:right;"><img src="${escapeAttr(logoUrl)}" style="max-height:120px; max-width:280px; object-fit:contain;" onerror="this.style.display='none'"></div>`;
  }
  html += `</div>`;
  if (project)
    html += `<div style="margin-top: 12px; padding-top: 10px; border-top: 1px solid #adb5bd; font-size: 12px; line-height: 1.6;"><div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2px 20px;"><div><strong style="color:#000;">Client:</strong> ${escapeHtml(project.clientName || "—")}</div><div><strong style="color:#000;">Project ID:</strong> ${escapeHtml(project.projectId || "—")}</div><div><strong style="color:#000;">Location:</strong> ${escapeHtml(project.siteLocation || "—")}</div><div><strong style="color:#000;">Phone:</strong> ${escapeHtml(project.clientPhone || "—")}</div></div></div>`;
  html += `</div>`;
  return html;
}

function computeProjectFinancials(project, payments) {
  const pId = project.projectId;
  const groups = getAllPaymentGroups(pId);
  const subtotal = roundMoney(Number(project.contractSubtotal) || 0);
  const vat = calculateTax(subtotal, "VAT");
  const wht = calculateTax(subtotal, "WHT");
  const totalContract = roundMoney(subtotal + vat);
  const netReceivable = roundMoney(totalContract - wht);
  let totalReceived = 0,
    totalOutgoing = 0,
    smallExpenses = 0,
    totalPending = 0;
  groups.forEach((g) => {
    if (g.direction === "Client Receipt") totalReceived += g.paymentsToDate;
    else if (g.direction === "Small Expense") smallExpenses += g.paymentsToDate;
    else {
      totalOutgoing += g.paymentsToDate;
      totalPending += g.balance;
    }
  });
  totalReceived = roundMoney(totalReceived);
  totalOutgoing = roundMoney(totalOutgoing);
  smallExpenses = roundMoney(smallExpenses);
  totalPending = roundMoney(totalPending);
  const balanceExpected = roundMoney(totalContract - totalReceived);
  const netProfit = roundMoney(
    totalReceived - totalOutgoing - smallExpenses - totalPending,
  );
  return {
    subtotal,
    vat,
    wht,
    totalContract,
    netReceivable,
    totalReceived,
    totalOutgoing,
    smallExpenses,
    totalPending,
    balanceExpected,
    netProfit,
  };
}

function financialRowHTML(label, amount, isBold, color) {
  const style = isBold
    ? "font-weight: 900; border-top: 1.5px solid #000; padding-top: 6px; margin-top: 6px;"
    : "";
  const colorStyle = color ? `color: ${color};` : "";
  return `<div style="display: flex; justify-content: space-between; margin-bottom: 4px; ${style}"><span style="font-weight: ${isBold ? "900" : "600"}; font-size: ${isBold ? "14px" : "13px"};">${escapeHtml(label)}</span><span style="font-weight: ${isBold ? "900" : "700"}; font-size: ${isBold ? "15px" : "13px"}; text-align: right; ${colorStyle}">₦${moneyValue(amount)}</span></div>`;
}

function renderFinancialAll(projects, payments, selectedFields) {
  const allCols = [
    {
      key: "project",
      label: "Project",
      thStyle: "text-align:left;",
      tdStyle: "vertical-align:top;",
    },
    {
      key: "subtotal",
      label: "Subtotal",
      thStyle: "text-align:right;",
      tdStyle: "text-align:right; vertical-align:top;",
    },
    {
      key: "vat",
      label: "VAT",
      thStyle: "text-align:right;",
      tdStyle: "text-align:right; vertical-align:top;",
    },
    {
      key: "totalContract",
      label: "Total",
      thStyle: "text-align:right;",
      tdStyle: "text-align:right; vertical-align:top; font-weight:800;",
    },
    {
      key: "wht",
      label: "WHT",
      thStyle: "text-align:right;",
      tdStyle: "text-align:right; vertical-align:top;",
    },
    {
      key: "totalReceived",
      label: "Received",
      thStyle: "text-align:right;",
      tdStyle:
        "text-align:right; vertical-align:top; color:var(--success); font-weight:700;",
    },
    {
      key: "totalOutgoing",
      label: "Outgoing",
      thStyle: "text-align:right;",
      tdStyle:
        "text-align:right; vertical-align:top; color:var(--danger); font-weight:700;",
    },
    {
      key: "smallExpenses",
      label: "Small Exp.",
      thStyle: "text-align:right;",
      tdStyle: "text-align:right; vertical-align:top;",
    },
    {
      key: "totalPending",
      label: "Pending",
      thStyle: "text-align:right;",
      tdStyle:
        "text-align:right; vertical-align:top; color:#fd7e14; font-weight:700;",
    },
    {
      key: "balanceExpected",
      label: "Balance",
      thStyle: "text-align:right;",
      tdStyle: "text-align:right; vertical-align:top;",
    },
    {
      key: "netProfit",
      label: "Net Profit",
      thStyle: "text-align:right;",
      tdStyle: "text-align:right; vertical-align:top; font-weight:800;",
    },
  ];
  const cols = allCols.filter((c) => selectedFields.includes(c.key));
  const thead = `<tr>${cols.map((c) => `<th style="background:#000; color:#fff; ${c.thStyle} padding:8px; font-weight:700; text-transform:uppercase; font-size:10px;">${c.label}</th>`).join("")}</tr>`;
  let tSub = 0,
    tVat = 0,
    tWht = 0,
    tCon = 0,
    tRec = 0,
    tOut = 0,
    tSml = 0,
    tPen = 0,
    tBal = 0,
    tPro = 0;
  const cellMapFn = (f) => ({
    project: `<td style="border-bottom:1px solid #adb5bd; padding:8px; font-size:12px; ${cols.find((c) => c.key === "project")?.tdStyle || ""}"><strong>${escapeHtml(f.projectId)}</strong><br><span style="font-size:11px; color:#495057;">${escapeHtml(f.clientName)}</span></td>`,
    subtotal: `<td style="border-bottom:1px solid #adb5bd; padding:8px; font-size:12px; text-align:right; vertical-align:top;">₦${moneyValue(f.subtotal)}</td>`,
    vat: `<td style="border-bottom:1px solid #adb5bd; padding:8px; font-size:12px; text-align:right; vertical-align:top;">₦${moneyValue(f.vat)}</td>`,
    totalContract: `<td style="border-bottom:1px solid #adb5bd; padding:8px; font-size:12px; text-align:right; vertical-align:top; font-weight:800;">₦${moneyValue(f.totalContract)}</td>`,
    wht: `<td style="border-bottom:1px solid #adb5bd; padding:8px; font-size:12px; text-align:right; vertical-align:top;">₦${moneyValue(f.wht)}</td>`,
    totalReceived: `<td style="border-bottom:1px solid #adb5bd; padding:8px; font-size:12px; text-align:right; vertical-align:top; color:var(--success); font-weight:700;">₦${moneyValue(f.totalReceived)}</td>`,
    totalOutgoing: `<td style="border-bottom:1px solid #adb5bd; padding:8px; font-size:12px; text-align:right; vertical-align:top; color:var(--danger); font-weight:700;">₦${moneyValue(f.totalOutgoing)}</td>`,
    smallExpenses: `<td style="border-bottom:1px solid #adb5bd; padding:8px; font-size:12px; text-align:right; vertical-align:top;">₦${moneyValue(f.smallExpenses)}</td>`,
    totalPending: `<td style="border-bottom:1px solid #adb5bd; padding:8px; font-size:12px; text-align:right; vertical-align:top; color:#fd7e14; font-weight:700;">₦${moneyValue(f.totalPending)}</td>`,
    balanceExpected: `<td style="border-bottom:1px solid #adb5bd; padding:8px; font-size:12px; text-align:right; vertical-align:top;">₦${moneyValue(f.balanceExpected)}</td>`,
    netProfit: `<td style="border-bottom:1px solid #adb5bd; padding:8px; font-size:12px; text-align:right; vertical-align:top; font-weight:800; color:${f.netProfit >= 0 ? "var(--success)" : "var(--danger)"};">₦${moneyValue(f.netProfit)}</td>`,
  });
  const totalMapFn = () => ({
    project: `<td style="border-bottom:2px solid #000; padding:8px; font-size:12px;"><strong>GRAND TOTAL</strong></td>`,
    subtotal: `<td style="border-bottom:2px solid #000; padding:8px; font-size:12px; text-align:right;">₦${moneyValue(tSub)}</td>`,
    vat: `<td style="border-bottom:2px solid #000; padding:8px; font-size:12px; text-align:right;">₦${moneyValue(tVat)}</td>`,
    totalContract: `<td style="border-bottom:2px solid #000; padding:8px; font-size:12px; text-align:right;">₦${moneyValue(tCon)}</td>`,
    wht: `<td style="border-bottom:2px solid #000; padding:8px; font-size:12px; text-align:right;">₦${moneyValue(tWht)}</td>`,
    totalReceived: `<td style="border-bottom:2px solid #000; padding:8px; font-size:12px; text-align:right; color:var(--success);">₦${moneyValue(tRec)}</td>`,
    totalOutgoing: `<td style="border-bottom:2px solid #000; padding:8px; font-size:12px; text-align:right; color:var(--danger);">₦${moneyValue(tOut)}</td>`,
    smallExpenses: `<td style="border-bottom:2px solid #000; padding:8px; font-size:12px; text-align:right;">₦${moneyValue(tSml)}</td>`,
    totalPending: `<td style="border-bottom:2px solid #000; padding:8px; font-size:12px; text-align:right; color:#fd7e14;">₦${moneyValue(tPen)}</td>`,
    balanceExpected: `<td style="border-bottom:2px solid #000; padding:8px; font-size:12px; text-align:right;">₦${moneyValue(tBal)}</td>`,
    netProfit: `<td style="border-bottom:2px solid #000; padding:8px; font-size:12px; text-align:right; color:${tPro >= 0 ? "var(--success)" : "var(--danger)"};">₦${moneyValue(tPro)}</td>`,
  });
  const rows = projects
    .map((p) => {
      const f = computeProjectFinancials(p, payments);
      tSub = roundMoney(tSub + f.subtotal);
      tVat = roundMoney(tVat + f.vat);
      tWht = roundMoney(tWht + f.wht);
      tCon = roundMoney(tCon + f.totalContract);
      tRec = roundMoney(tRec + f.totalReceived);
      tOut = roundMoney(tOut + f.totalOutgoing);
      tSml = roundMoney(tSml + f.smallExpenses);
      tPen = roundMoney(tPen + f.totalPending);
      tBal = roundMoney(tBal + f.balanceExpected);
      tPro = roundMoney(tPro + f.netProfit);
      const cells = cellMapFn({
        ...f,
        projectId: p.projectId,
        clientName: p.clientName,
      });
      return `<tr>${cols.map((c) => cells[c.key]).join("")}</tr>`;
    })
    .join("");
  const totalCells = totalMapFn();
  const totalRow = `<tr style="background:#e9ecef; font-weight:900;">${cols.map((c) => totalCells[c.key]).join("")}</tr>`;
  const table = `<table class="report-table" style="width:100%; border-collapse: collapse; font-size:12px;"><thead>${thead}</thead><tbody>${rows || `<tr><td colspan="${cols.length}" style="padding:20px; text-align:center; color:#495057;">No projects</td></tr>`}${totalRow}</tbody></table>`;
  return `<div class="report-page-wrapper">
    <div class="report-content">
      ${generateReportHeader("Financial Summary — All Projects", null)}
      ${table}
      ${generateSignatureBlock()}
    </div>
    ${generateReportFooter()}
  </div>`;
}

function renderFinancialProject(project, payments) {
  const f = computeProjectFinancials(project, payments);
  return `${generateReportHeader("Financial Report — Project", project)}<div style="max-width: 420px; margin: 0 auto;">${financialRowHTML("Contract Subtotal", f.subtotal)}${financialRowHTML("VAT (" + formatTaxRate(getTaxRate("VAT")) + ")", f.vat)}${financialRowHTML("Total Contract Value", f.totalContract, true)}${financialRowHTML("WHT (" + formatTaxRate(getTaxRate("WHT")) + ")", f.wht)}${financialRowHTML("Net Receivable (after WHT)", f.netReceivable, true)}<div style="height: 10px;"></div>${financialRowHTML("Client Receipts (Cleared)", f.totalReceived, false, "var(--success)")}${financialRowHTML("Total Outgoing (Cleared)", f.totalOutgoing, false, "var(--danger)")}${financialRowHTML("Small Expenses (Cleared)", f.smallExpenses)}${financialRowHTML("Pending Payments", f.totalPending, false, "#fd7e14")}<div style="height: 10px;"></div>${financialRowHTML("Balance Expected", f.balanceExpected, true)}${financialRowHTML("Net Profit", f.netProfit, true, f.netProfit >= 0 ? "var(--success)" : "var(--danger)")}</div>`;
}

function renderFinancialClient(clientName, projects, payments) {
  const clientProjects = projects.filter((p) => p.clientName === clientName);
  let tSub = 0,
    tVat = 0,
    tWht = 0,
    tCon = 0,
    tRec = 0,
    tOut = 0,
    tSml = 0,
    tPen = 0,
    tBal = 0,
    tPro = 0;
  const rows = clientProjects
    .map((p) => {
      const f = computeProjectFinancials(p, payments);
      tSub += f.subtotal;
      tVat += f.vat;
      tWht += f.wht;
      tCon += f.totalContract;
      tRec += f.totalReceived;
      tOut += f.totalOutgoing;
      tSml += f.smallExpenses;
      tPen += f.totalPending;
      tBal += f.balanceExpected;
      tPro += f.netProfit;
      return `<tr><td style="border-bottom:1px solid #adb5bd; padding:8px; font-size:12px; vertical-align:top;"><strong>${escapeHtml(p.projectId)}</strong><br><span style="font-size:11px; color:#495057;">${escapeHtml(p.siteLocation)}</span></td><td style="border-bottom:1px solid #adb5bd; padding:8px; font-size:12px; text-align:right; vertical-align:top;">₦${moneyValue(f.subtotal)}</td><td style="border-bottom:1px solid #adb5bd; padding:8px; font-size:12px; text-align:right; vertical-align:top;">₦${moneyValue(f.vat)}</td><td style="border-bottom:1px solid #adb5bd; padding:8px; font-size:12px; text-align:right; vertical-align:top; font-weight:800;">₦${moneyValue(f.totalContract)}</td><td style="border-bottom:1px solid #adb5bd; padding:8px; font-size:12px; text-align:right; vertical-align:top;">₦${moneyValue(f.wht)}</td><td style="border-bottom:1px solid #adb5bd; padding:8px; font-size:12px; text-align:right; vertical-align:top; color:var(--success); font-weight:700;">₦${moneyValue(f.totalReceived)}</td><td style="border-bottom:1px solid #adb5bd; padding:8px; font-size:12px; text-align:right; vertical-align:top; color:var(--danger); font-weight:700;">₦${moneyValue(f.totalOutgoing)}</td><td style="border-bottom:1px solid #adb5bd; padding:8px; font-size:12px; text-align:right; vertical-align:top;">₦${moneyValue(f.smallExpenses)}</td><td style="border-bottom:1px solid #adb5bd; padding:8px; font-size:12px; text-align:right; vertical-align:top; color:#fd7e14; font-weight:700;">₦${moneyValue(f.totalPending)}</td><td style="border-bottom:1px solid #adb5bd; padding:8px; font-size:12px; text-align:right; vertical-align:top;">₦${moneyValue(f.balanceExpected)}</td><td style="border-bottom:1px solid #adb5bd; padding:8px; font-size:12px; text-align:right; vertical-align:top; font-weight:800; color:${f.netProfit >= 0 ? "var(--success)" : "var(--danger)"};">₦${moneyValue(f.netProfit)}</td></tr>`;
    })
    .join("");
  tSub = roundMoney(tSub);
  tVat = roundMoney(tVat);
  tWht = roundMoney(tWht);
  tCon = roundMoney(tCon);
  tRec = roundMoney(tRec);
  tOut = roundMoney(tOut);
  tSml = roundMoney(tSml);
  tPen = roundMoney(tPen);
  tBal = roundMoney(tBal);
  tPro = roundMoney(tPro);
  return `${generateReportHeader(`Financial Report — Client: ${clientName}`, null)}<table class="report-table" style="width:100%; border-collapse: collapse; font-size:12px;"><thead><tr><th style="background:#000; color:#fff; text-align:left; padding:8px; font-weight:700; text-transform:uppercase; font-size:10px;">Project</th><th style="background:#000; color:#fff; text-align:right; padding:8px; font-weight:700; text-transform:uppercase; font-size:10px;">Subtotal</th><th style="background:#000; color:#fff; text-align:right; padding:8px; font-weight:700; text-transform:uppercase; font-size:10px;">VAT</th><th style="background:#000; color:#fff; text-align:right; padding:8px; font-weight:700; text-transform:uppercase; font-size:10px;">Total</th><th style="background:#000; color:#fff; text-align:right; padding:8px; font-weight:700; text-transform:uppercase; font-size:10px;">WHT</th><th style="background:#000; color:#fff; text-align:right; padding:8px; font-weight:700; text-transform:uppercase; font-size:10px;">Received</th><th style="background:#000; color:#fff; text-align:right; padding:8px; font-weight:700; text-transform:uppercase; font-size:10px;">Outgoing</th><th style="background:#000; color:#fff; text-align:right; padding:8px; font-weight:700; text-transform:uppercase; font-size:10px;">Small Exp.</th><th style="background:#000; color:#fff; text-align:right; padding:8px; font-weight:700; text-transform:uppercase; font-size:10px;">Pending</th><th style="background:#000; color:#fff; text-align:right; padding:8px; font-weight:700; text-transform:uppercase; font-size:10px;">Balance</th><th style="background:#000; color:#fff; text-align:right; padding:8px; font-weight:700; text-transform:uppercase; font-size:10px;">Net Profit</th></tr></thead><tbody>${rows || '<tr><td colspan="11" style="padding:20px; text-align:center; color:#495057;">No projects</td></tr>'}<tr style="background:#e9ecef; font-weight:900;"><td style="border-bottom:2px solid #000; padding:8px; font-size:12px;"><strong>TOTAL</strong></td><td style="border-bottom:2px solid #000; padding:8px; font-size:12px; text-align:right;">₦${moneyValue(tSub)}</td><td style="border-bottom:2px solid #000; padding:8px; font-size:12px; text-align:right;">₦${moneyValue(tVat)}</td><td style="border-bottom:2px solid #000; padding:8px; font-size:12px; text-align:right;">₦${moneyValue(tCon)}</td><td style="border-bottom:2px solid #000; padding:8px; font-size:12px; text-align:right;">₦${moneyValue(tWht)}</td><td style="border-bottom:2px solid #000; padding:8px; font-size:12px; text-align:right; color:var(--success);">₦${moneyValue(tRec)}</td><td style="border-bottom:2px solid #000; padding:8px; font-size:12px; text-align:right; color:var(--danger);">₦${moneyValue(tOut)}</td><td style="border-bottom:2px solid #000; padding:8px; font-size:12px; text-align:right;">₦${moneyValue(tSml)}</td><td style="border-bottom:2px solid #000; padding:8px; font-size:12px; text-align:right; color:#fd7e14;">₦${moneyValue(tPen)}</td><td style="border-bottom:2px solid #000; padding:8px; font-size:12px; text-align:right;">₦${moneyValue(tBal)}</td><td style="border-bottom:2px solid #000; padding:8px; font-size:12px; text-align:right; color:${tPro >= 0 ? "var(--success)" : "var(--danger)"};">₦${moneyValue(tPro)}</td></tr></tbody></table>`;
}

function renderFinancialVendor(vendor, projects, workorders, payments) {
  const vendorWorkorders = workorders.filter(
    (w) => w.vendorId === vendor.vendorId,
  );
  const vendorPayments = payments.filter(
    (p) => p.payee === vendor.company || p.vendorId === vendor.vendorId,
  );
  const totalWO = vendorWorkorders.reduce(
    (s, w) => roundMoney(s + Number(w.amount || 0)),
    0,
  );
  const totalPaid = vendorPayments
    .filter((p) => p.status === "Cleared" && !isClientReceipt(p))
    .reduce((s, p) => roundMoney(s + Number(p.amount || 0)), 0);
  const totalPending = vendorPayments
    .filter((p) => p.status === "Pending" && !isClientReceipt(p))
    .reduce((s, p) => roundMoney(s + Number(p.amount || 0)), 0);
  const balance = roundMoney(totalWO - totalPaid);
  const woRows = vendorWorkorders
    .map((w) => {
      const proj = projects.find((p) => p.projectId === w.projectId);
      return `<tr><td style="border-bottom:1px solid #adb5bd; padding:8px; font-size:12px;">${escapeHtml(w.workOrderId)}</td><td style="border-bottom:1px solid #adb5bd; padding:8px; font-size:12px;">${escapeHtml(proj ? proj.projectId : w.projectId)}</td><td style="border-bottom:1px solid #adb5bd; padding:8px; font-size:12px;">${escapeHtml(w.description)}</td><td style="border-bottom:1px solid #adb5bd; padding:8px; font-size:12px; text-align:right; font-weight:700;">₦${moneyValue(w.amount)}</td><td style="border-bottom:1px solid #adb5bd; padding:8px; font-size:12px; text-align:center;">${escapeHtml(w.status)}</td></tr>`;
    })
    .join("");
  const payRows = vendorPayments
    .map((p) => {
      const proj = projects.find((pr) => pr.projectId === p.projectId);
      return `<tr><td style="border-bottom:1px solid #adb5bd; padding:8px; font-size:12px;">${escapeHtml(p.paymentDate)}</td><td style="border-bottom:1px solid #adb5bd; padding:8px; font-size:12px;">${escapeHtml(proj ? proj.projectId : p.projectId)}</td><td style="border-bottom:1px solid #adb5bd; padding:8px; font-size:12px;">${escapeHtml(p.expenseCategory || "-")}</td><td style="border-bottom:1px solid #adb5bd; padding:8px; font-size:12px; text-align:right; font-weight:700;">₦${moneyValue(p.amount)}</td><td style="border-bottom:1px solid #adb5bd; padding:8px; font-size:12px; text-align:center;">${escapeHtml(p.status)}</td></tr>`;
    })
    .join("");
  return `${generateReportHeader(`Financial Report — Vendor: ${vendor.company}`, null)}<div style="margin-bottom: 16px; font-size: 12px; line-height: 1.6;"><div><strong>Trade:</strong> ${escapeHtml(vendor.trade || "—")}</div><div><strong>Contact:</strong> ${escapeHtml(vendor.contactName || "—")}</div><div><strong>Phone:</strong> ${escapeHtml(vendor.phone1 || "—")}</div><div><strong>Email:</strong> ${escapeHtml(vendor.email || "—")}</div></div><h3 style="font-size: 14px; font-weight: 900; text-transform: uppercase; margin: 16px 0 8px; border-bottom: 1px solid #000; padding-bottom: 4px;">Work Orders</h3><table class="report-table" style="width:100%; border-collapse: collapse; font-size:12px; margin-bottom: 16px;"><thead><tr><th style="background:#000; color:#fff; text-align:left; padding:8px; font-size:10px; text-transform:uppercase;">WO ID</th><th style="background:#000; color:#fff; text-align:left; padding:8px; font-size:10px; text-transform:uppercase;">Project</th><th style="background:#000; color:#fff; text-align:left; padding:8px; font-size:10px; text-transform:uppercase;">Description</th><th style="background:#000; color:#fff; text-align:right; padding:8px; font-size:10px; text-transform:uppercase;">Amount</th><th style="background:#000; color:#fff; text-align:center; padding:8px; font-size:10px; text-transform:uppercase;">Status</th></tr></thead><tbody>${woRows || '<tr><td colspan="5" style="padding:8px; text-align:center; color:#495057;">No work orders</td></tr>'}<tr style="background:#e9ecef; font-weight:900;"><td colspan="3" style="border-bottom:2px solid #000; padding:8px; font-size:12px;"><strong>TOTAL</strong></td><td style="border-bottom:2px solid #000; padding:8px; font-size:12px; text-align:right;">₦${moneyValue(totalWO)}</td><td style="border-bottom:2px solid #000; padding:8px;"></td></tr></tbody></table><h3 style="font-size: 14px; font-weight: 900; text-transform: uppercase; margin: 16px 0 8px; border-bottom: 1px solid #000; padding-bottom: 4px;">Payments</h3><table class="report-table" style="width:100%; border-collapse: collapse; font-size:12px; margin-bottom: 16px;"><thead><tr><th style="background:#000; color:#fff; text-align:left; padding:8px; font-size:10px; text-transform:uppercase;">Date</th><th style="background:#000; color:#fff; text-align:left; padding:8px; font-size:10px; text-transform:uppercase;">Project</th><th style="background:#000; color:#fff; text-align:left; padding:8px; font-size:10px; text-transform:uppercase;">Category</th><th style="background:#000; color:#fff; text-align:right; padding:8px; font-size:10px; text-transform:uppercase;">Amount</th><th style="background:#000; color:#fff; text-align:center; padding:8px; font-size:10px; text-transform:uppercase;">Status</th></tr></thead><tbody>${payRows || '<tr><td colspan="5" style="padding:8px; text-align:center; color:#495057;">No payments</td></tr>'}<tr style="background:#e9ecef; font-weight:900;"><td colspan="3" style="border-bottom:2px solid #000; padding:8px; font-size:12px;"><strong>TOTAL CLEARED</strong></td><td style="border-bottom:2px solid #000; padding:8px; font-size:12px; text-align:right;">₦${moneyValue(totalPaid)}</td><td style="border-bottom:2px solid #000; padding:8px;"></td></tr></tbody></table><div style="max-width: 350px; margin: 20px 0 0 auto;">${financialRowHTML("Total Work Order Value", totalWO, true)}${financialRowHTML("Total Paid (Cleared)", totalPaid, false, "var(--danger)")}${financialRowHTML("Pending Payments", totalPending, false, "#fd7e14")}${financialRowHTML("Balance / Outstanding", balance, true, balance > 0 ? "var(--danger)" : "var(--success)")}</div>`;
}

function renderScopeReport(project, settings) {
  // Normalize: getSettings returns {data: {...}} or the cache may hold the raw response
  if (settings && settings.data) settings = settings.data;
  const signName =
    settings && settings.Name_Signed ? escapeHtml(settings.Name_Signed) : "";
  const signImg =
    settings && settings.Sign_Signed
      ? getDirectImageUrl(settings.Sign_Signed)
      : "";
  const hasSignature = signName || signImg;

  let signatureBlock = "";
  if (hasSignature) {
    signatureBlock = `<div style="margin-top: 32px; page-break-inside: avoid; text-align: left;">
      <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; margin-bottom: 12px; color: #495057;">Authorized Signatory</div>
      <div style="display: inline-block; text-align: center;">
        ${signImg ? `<div style="margin-bottom: 4px;"><img src="${escapeAttr(signImg)}" style="max-height:50px; max-width:150px; object-fit:contain;" onerror="this.style.display='none'"></div>` : ""}
        <div style="border-bottom: 1.5px solid #000; width: 200px; margin: 0 auto 4px auto;"></div>
        <div style="font-size: 12px; font-weight: 700;">${signName || "_________________________"}</div>
      </div>
    </div>`;
  }

  return `<div class="report-page-wrapper">
    <div class="report-content">
      ${generateReportHeader("Project Scope", project, settings)}
      <div style="font-size: 13px; line-height: 1.6; white-space: pre-wrap; border: 1px solid #adb5bd; padding: 16px; border-radius: 8px; background: #f8f9fa;">${escapeHtml(project.scope || "No scope defined.")}</div>
      ${signatureBlock}
    </div>
    <div class="report-footer">
      <div style="font-weight: 700; margin-bottom: 4px;">Road 1 House 5B, Isheri-Brooks Estate, Isheri-Olofin, Ogun State</div>
      <div>+234 809 260 8103&nbsp;&nbsp;&nbsp;+234 708 260 8103&nbsp;&nbsp;&nbsp;pi.projects20@gmail.com</div>
    </div>
  </div>`;
}

function renderSnagsReport(project, snags) {
  const sorted = [...snags].sort(
    (a, b) => new Date(b.dateLogged) - new Date(a.dateLogged),
  );
  const pages = [];
  for (let i = 0; i < sorted.length; i += 6) pages.push(sorted.slice(i, i + 6));
  if (!pages.length) pages.push([]);
  return pages
    .map((pageSnags, idx) => {
      const header =
        idx === 0
          ? generateReportHeader("Snags Report", project)
          : `<div style="border-bottom: 1px solid #adb5bd; padding-bottom: 8px; margin-bottom: 12px; font-size: 11px; font-weight: 700;">${escapeHtml(project.clientName)} — ${escapeHtml(project.projectId)} — Snags Report (cont.)</div>`;
      const cards = pageSnags
        .map((s) => {
          const isOpen = s.status !== "Completed";
          const statusColor = isOpen ? "var(--danger)" : "var(--success)";
          return `<div class="snag-report-card"><div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;"><span style="font-size:10px; font-weight:900; text-transform:uppercase; color:#495057;">${escapeHtml(s.dateLogged)}</span><span style="font-size:10px; font-weight:900; background:${statusColor}; color:#fff; padding:2px 8px; border-radius:4px; text-transform:uppercase;">${escapeHtml(s.status || "Open")}</span></div><p style="font-size:13px; font-weight:700; margin:0 0 8px; flex:1; line-height:1.4;">${escapeHtml(s.notes)}</p>${s.assigned ? `<div style="font-size:11px; color:#495057; margin-bottom:4px;"><strong>Assigned:</strong> ${escapeHtml(s.assigned)}</div>` : ""}${s.dateCompleted ? `<div style="font-size:11px; color:var(--success);"><strong>Completed:</strong> ${escapeHtml(s.dateCompleted)}</div>` : ""}</div>`;
        })
        .join("");
      const emptySlots = 6 - pageSnags.length;
      const emptyCards = Array(emptySlots)
        .fill(
          `<div class="snag-report-card" style="opacity:0.3;"><div style="height:100%; display:flex; align-items:center; justify-content:center; font-size:12px; color:#adb5bd; font-weight:700;">—</div></div>`,
        )
        .join("");
      return `<div class="snags-report-page">${header}<div class="snags-report-grid">${cards}${emptyCards}</div></div>`;
    })
    .join("");
}

function renderProgressReport(project, logs) {
  const sorted = [...logs].sort(
    (a, b) => new Date(b.dateRecorded) - new Date(a.dateRecorded),
  );
  const rows = sorted
    .map(
      (l) =>
        `<tr><td style="border-bottom:1px solid #adb5bd; padding:8px; font-size:12px; vertical-align:top; white-space:nowrap;">${escapeHtml(l.dateRecorded)}</td><td style="border-bottom:1px solid #adb5bd; padding:8px; font-size:12px; vertical-align:top;"><strong>${escapeHtml(l.tradeCategory)}</strong></td><td style="border-bottom:1px solid #adb5bd; padding:8px; font-size:12px; vertical-align:top;"><div style="background:#e9ecef; border-radius:4px; height:16px; width:100px; overflow:hidden; display:inline-block; vertical-align:middle; margin-right:8px;"><div style="background:var(--primary); height:100%; width:${Math.min(100, Math.max(0, Number(l.completionPercentage) || 0))}%;"></div></div><strong>${escapeHtml(l.completionPercentage)}%</strong></td><td style="border-bottom:1px solid #adb5bd; padding:8px; font-size:12px; vertical-align:top;">${escapeHtml(l.commentNarrative || "—")}</td></tr>`,
    )
    .join("");
  return `${generateReportHeader("Progress Report", project)}<table class="report-table" style="width:100%; border-collapse: collapse; font-size:12px;"><thead><tr><th style="background:#000; color:#fff; text-align:left; padding:8px; font-size:10px; text-transform:uppercase; white-space:nowrap;">Date</th><th style="background:#000; color:#fff; text-align:left; padding:8px; font-size:10px; text-transform:uppercase;">Trade</th><th style="background:#000; color:#fff; text-align:left; padding:8px; font-size:10px; text-transform:uppercase; width:120px;">%</th><th style="background:#000; color:#fff; text-align:left; padding:8px; font-size:10px; text-transform:uppercase;">Comments</th></tr></thead><tbody>${rows || '<tr><td colspan="4" style="padding:20px; text-align:center; color:#495057;">No progress logs recorded.</td></tr>'}</tbody></table>`;
}

function renderTakeoffReport(project, items) {
  const rows = items
    .map((i) => {
      const isHeader = String(i.scopeNotes || "").startsWith("__HEADER__:");
      if (isHeader) {
        return `<tr style="background:#e9ecef;"><td colspan="4" style="border-bottom:1px solid #adb5bd; padding:8px; font-size:12px; font-weight:900; text-transform:uppercase;">${escapeHtml(i.description)}</td></tr>`;
      }
      return `<tr><td style="border-bottom:1px solid #adb5bd; padding:8px; font-size:12px; vertical-align:top;">${escapeHtml(i.description)}</td><td style="border-bottom:1px solid #adb5bd; padding:8px; font-size:12px; text-align:right; vertical-align:top; font-weight:700;">${escapeHtml(i.quantity)}</td><td style="border-bottom:1px solid #adb5bd; padding:8px; font-size:12px; vertical-align:top;">${escapeHtml(i.unit)}</td><td style="border-bottom:1px solid #adb5bd; padding:8px; font-size:12px; vertical-align:top; color:#495057;">${escapeHtml(i.scopeNotes || "—")}</td></tr>`;
    })
    .join("");
  return `${generateReportHeader("Take-Off Report", project)}<table class="report-table" style="width:100%; border-collapse: collapse; font-size:12px;"><thead><tr><th style="background:#000; color:#fff; text-align:left; padding:8px; font-size:10px; text-transform:uppercase;">Description</th><th style="background:#000; color:#fff; text-align:right; padding:8px; font-size:10px; text-transform:uppercase;">Qty</th><th style="background:#000; color:#fff; text-align:left; padding:8px; font-size:10px; text-transform:uppercase;">Unit</th><th style="background:#000; color:#fff; text-align:left; padding:8px; font-size:10px; text-transform:uppercase;">Remarks</th></tr></thead><tbody>${rows || '<tr><td colspan="4" style="padding:20px; text-align:center; color:#495057;">No take-off items recorded.</td></tr>'}</tbody></table>`;
}

function renderWorkOrderReport(project, workorders, vendors, settings) {
  // Build terms & conditions from settings WO1-W10
  const terms = [];
  for (let i = 1; i <= 10; i++) {
    const key = `WO${i}`;
    if (settings && settings[key]) terms.push({ num: i, text: settings[key] });
  }
  const woRows = workorders
    .map((w) => {
      const vendor = vendors.find((v) => v.vendorId === w.vendorId);
      return `<tr>
      <td style="border-bottom:1px solid #adb5bd; padding:8px; font-size:12px; vertical-align:top;"><strong>${escapeHtml(w.workOrderId)}</strong></td>
      <td style="border-bottom:1px solid #adb5bd; padding:8px; font-size:12px; vertical-align:top;">${escapeHtml(vendor ? vendor.company : w.vendorId)}</td>
      <td style="border-bottom:1px solid #adb5bd; padding:8px; font-size:12px; vertical-align:top;">${escapeHtml(vendor ? vendor.trade : "—")}</td>
      <td style="border-bottom:1px solid #adb5bd; padding:8px; font-size:12px; vertical-align:top;">${escapeHtml(formatWorkOrderDescription(w.description))}</td>
      <td style="border-bottom:1px solid #adb5bd; padding:8px; font-size:12px; text-align:right; vertical-align:top; font-weight:700;">₦${moneyValue(w.amount)}</td>
      <td style="border-bottom:1px solid #adb5bd; padding:8px; font-size:12px; text-align:center; vertical-align:top;">${escapeHtml(w.status)}</td>
    </tr>`;
    })
    .join("");
  const totalWO = workorders.reduce(
    (s, w) => roundMoney(s + Number(w.amount || 0)),
    0,
  );
  let termsHtml = "";
  if (terms.length) {
    termsHtml = `<div style="margin-top: 24px; page-break-inside: avoid;">
      <h3 style="font-size: 14px; font-weight: 900; text-transform: uppercase; margin: 16px 0 8px; border-bottom: 1px solid #000; padding-bottom: 4px;">Terms & Conditions</h3>
      <ol style="font-size: 12px; line-height: 1.6; padding-left: 20px;">
        ${terms.map((t) => `<li style="margin-bottom: 6px;">${escapeHtml(t.text)}</li>`).join("")}
      </ol>
    </div>`;
  }
  return `${generateReportHeader("Work Orders Report", project)}
    <table class="report-table" style="width:100%; border-collapse: collapse; font-size:12px; margin-bottom: 16px;">
      <thead>
        <tr>
          <th style="background:#000; color:#fff; text-align:left; padding:8px; font-size:10px; text-transform:uppercase;">WO ID</th>
          <th style="background:#000; color:#fff; text-align:left; padding:8px; font-size:10px; text-transform:uppercase;">Vendor</th>
          <th style="background:#000; color:#fff; text-align:left; padding:8px; font-size:10px; text-transform:uppercase;">Trade</th>
          <th style="background:#000; color:#fff; text-align:left; padding:8px; font-size:10px; text-transform:uppercase;">Description</th>
          <th style="background:#000; color:#fff; text-align:right; padding:8px; font-size:10px; text-transform:uppercase;">Amount</th>
          <th style="background:#000; color:#fff; text-align:center; padding:8px; font-size:10px; text-transform:uppercase;">Status</th>
        </tr>
      </thead>
      <tbody>
        ${woRows || '<tr><td colspan="6" style="padding:20px; text-align:center; color:#495057;">No work orders recorded.</td></tr>'}
        <tr style="background:#e9ecef; font-weight:900;">
          <td colspan="4" style="border-bottom:2px solid #000; padding:8px; font-size:12px;"><strong>TOTAL</strong></td>
          <td style="border-bottom:2px solid #000; padding:8px; font-size:12px; text-align:right;">₦${moneyValue(totalWO)}</td>
          <td style="border-bottom:2px solid #000; padding:8px;"></td>
        </tr>
      </tbody>
    </table>
    ${termsHtml}`;
}

async function compileFieldReport(btn) {
  if (!btn) {
    btn = document.activeElement;
    if (!btn || btn.tagName !== "BUTTON")
      btn = document.querySelector('button[onclick*="compileFieldReport"]');
  }
  if (btn) {
    btn.disabled = true;
    btn.dataset.originalHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';
  }
  try {
    const typeSel = document.getElementById("rep-type-sel");
    const scopeSel = document.getElementById("rep-scope-sel");
    const filterSel = document.getElementById("rep-filter-sel");
    if (!typeSel || !typeSel.value) {
      alert("Select a report type");
      return;
    }
    const type = typeSel.value;
    const scope = scopeSel ? scopeSel.value : "all";
    const filter = filterSel ? filterSel.value : "";
    if (type !== "financial_all" && scope !== "all" && !filter) {
      alert("Please select a " + scope.replace("Specific ", "").toLowerCase());
      return;
    }
    const cache = getCache();
    let html = "";
    const ensure = async (key, action) => {
      if (!cache[key] || !cache[key].length) {
        try {
          cache[key] = (await callApi(action, {})) || [];
          setCache(cache);
        } catch (e) {}
      }
    };
    await ensure("payments", "getPayments");
    await ensure("workorders", "getWorkOrders");
    await ensure("snags", "getSnags");
    await ensure("progressLogs", "getProgressLogs");
    await ensure("takeoffs", "getTakeOffItems");
    if (type === "financial_all") {
      const selectedFields = getSelectedFinancialFields();
      if (!selectedFields.length) {
        alert("Select at least one field to print");
        return;
      }
      html = renderFinancialAll(
        cache.projects || [],
        cache.payments || [],
        selectedFields,
      );
    } else if (type === "financial_project") {
      const project = (cache.projects || []).find(
        (p) => p.projectId === filter,
      );
      if (!project) {
        alert("Project not found");
        return;
      }
      html = renderFinancialProject(project, cache.payments || []);
    } else if (type === "financial_client") {
      html = renderFinancialClient(
        filter,
        cache.projects || [],
        cache.payments || [],
      );
    } else if (type === "financial_vendor") {
      const vendor = (cache.vendors || []).find((v) => v.vendorId === filter);
      if (!vendor) {
        alert("Vendor not found");
        return;
      }
      html = renderFinancialVendor(
        vendor,
        cache.projects || [],
        cache.workorders || [],
        cache.payments || [],
      );
    } else if (type === "scope") {
      const project = (cache.projects || []).find(
        (p) => p.projectId === filter,
      );
      if (!project) {
        alert("Project not found");
        return;
      }
      if (!cache.settings || !cache.settings.VAT) {
        try {
          const res = await callApi("getSettings", {});
          cache.settings = res && res.data ? res.data : cache.settings || {};
          setCache(cache);
        } catch (e) {
          console.warn("Could not load settings for report:", e);
        }
      }
      html = renderScopeReport(project, cache.settings || {});
    } else if (type === "snags") {
      const project = (cache.projects || []).find(
        (p) => p.projectId === filter,
      );
      if (!project) {
        alert("Project not found");
        return;
      }
      const projectSnags = (cache.snags || []).filter(
        (s) => s.projectId === filter,
      );
      html = renderSnagsReport(project, projectSnags);
    } else if (type === "progress") {
      const project = (cache.projects || []).find(
        (p) => p.projectId === filter,
      );
      if (!project) {
        alert("Project not found");
        return;
      }
      const projectLogs = (cache.progressLogs || []).filter(
        (l) => l.projectId === filter,
      );
      html = renderProgressReport(project, projectLogs);
    } else if (type === "takeoff") {
      const project = (cache.projects || []).find(
        (p) => p.projectId === filter,
      );
      if (!project) {
        alert("Project not found");
        return;
      }
      const projectItems = (cache.takeoffs || []).filter(
        (i) => i.projectId === filter,
      );
      html = renderTakeoffReport(project, projectItems);
    } else if (type === "workorder_report") {
      const woId = document.getElementById("rep-workorder-sel").value;
      if (!woId) {
        alert("Select a work order");
        return;
      }
      const workorder = (cache.workorders || []).find(
        (w) => w.workOrderId === woId,
      );
      if (!workorder) {
        alert("Work order not found");
        return;
      }
      const project = (cache.projects || []).find(
        (p) => p.projectId === workorder.projectId,
      );
      await ensure("vendors", "getVendors");
      html = renderWorkOrderDetailReport(
        workorder,
        project,
        cache.vendors || [],
        cache.settings || {},
      );
    }
    const preview = document.getElementById("report-preview-viewport");
    const printContainer = document.getElementById("report-print-container");
    const card = document.getElementById("report-onscreen-preview-card");
    if (preview) preview.innerHTML = html;
    if (printContainer) printContainer.innerHTML = html;
    if (card) card.style.display = "block";
    window.scrollTo(0, document.body.scrollHeight);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML =
        btn.dataset.originalHtml ||
        '<i class="fas fa-file-alt"></i> Generate Report';
    }
  }
}

// ===== accounts.js =====
async function loadAccountsView() {
  const cache = getCache();
  const sel = document.getElementById("accounts-project-sel");
  if (sel) {
    sel.innerHTML =
      '<option value="">-- Select Project --</option>' +
      (cache.projects || [])
        .map(
          (p) =>
            `<option value="${escapeAttr(p.projectId)}">${escapeHtml(p.clientName)} (${escapeHtml(p.projectId)})</option>`,
        )
        .join("");
  }
  updateAccountsSummary();
  if (!cache.payments || !cache.payments.length) {
    callApi("getPayments", {})
      .then((payments) => {
        cache.payments = payments || [];
        setCache(cache);
        updateAccountsSummary();
      })
      .catch(() => {});
  }
}

function updateAccountsSummary() {
  const pId = document.getElementById("accounts-project-sel").value;
  const cache = getCache();
  const proj = cache.projects.find((p) => p.projectId === pId);
  if (!pId || !proj) {
    setAccountsAmounts(0, 0, 0, 0, 0, 0, 0, 0);
    return;
  }
  const groups = getAllPaymentGroups(pId);
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
  const subtotal = roundMoney(Number(proj.contractSubtotal) || 0);
  const vat = calculateTax(subtotal, "VAT");
  const totalContract = roundMoney(subtotal + vat);
  const balanceExpected = roundMoney(totalContract - totalReceived);
  const netProfit = roundMoney(
    totalReceived - totalOutgoing - smallExpenses - totalPending,
  );
  setAccountsAmounts(
    subtotal,
    totalReceived,
    totalOutgoing,
    smallExpenses,
    totalPending,
    balanceExpected,
    netProfit,
    totalOutstanding,
  );
}

function setAccountsAmounts(
  subtotal,
  received,
  outgoing,
  small,
  pending,
  balance,
  profit,
  outstanding = 0,
) {
  const els = {
    "acc-contract-subtotal": subtotal,
    "acc-client-receipts": received,
    "acc-total-outgoing": outgoing,
    "acc-small-expenses": small,
    "acc-pending-payments": pending,
    "acc-balance-expected": balance,
    "acc-net-profit": profit,
    "acc-outstanding-balance": outstanding,
  };
  for (const [id, val] of Object.entries(els)) {
    const el = document.getElementById(id);
    if (el) el.innerText = "₦" + moneyValue(val);
  }
}

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
  } else if (type === "progress_entry") {
    const uniqueId = "LOG-" + Date.now();
    title.innerText = "Log Progress";
    body.innerHTML = `<label ${labelStyle}>Trade</label><input id="l_trade" ${largeInput}><label ${labelStyle}>Completion %</label><select id="l_pct" ${largeInput}><option value="" selected disabled>Select %</option><option>10</option><option>35</option><option>75</option><option>100</option></select><label ${labelStyle}>Comments</label><textarea id="l_comm" rows="3" ${largeInput}></textarea><div id="progressAttachmentsPreviews" class="modal-preview-grid" style="display:none;"></div><label class="icon-upload-label"><i class="fas fa-paperclip"></i><input type="file" id="l_photo" accept="image/*" multiple style="display:none"></label>`;
    document.getElementById("l_photo").onchange = (e) =>
      processIncomingMultiAttachments(
        e.target.files,
        "progressAttachmentsPreviews",
      );
    submit.onclick = async () => {
      if (!document.getElementById("l_pct").value) {
        alert("Select a completion %");
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
        completionPercentage: document.getElementById("l_pct").value,
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
    body.innerHTML = `<label ${labelStyle}>ID</label><input value="${isEdit ? editData.paymentId : "Auto-generated"}" disabled style="${largeInput} background:#f0f0f0;"><input type="hidden" id="pay_id_hidden" value="${escapeAttr(isEdit ? editData.paymentId : "")}"><input type="hidden" id="pay_group_id" value="${escapeAttr(isEdit && editData.paymentGroupId ? editData.paymentGroupId : "")}"><label ${labelStyle}>Direction</label><select id="pay_dir" ${largeInput} onchange="window.onPaymentDirectionChange()">
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
    submit.onclick = () => {
      const totalInvoice = roundMoney(
        Number(document.getElementById("pay_total_invoice").value) || 0,
      );
      if (!totalInvoice || totalInvoice <= 0) {
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
      const direction = document.getElementById("pay_dir").value;
      const isSmall = direction === "Small Expense";
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
      const payload = {
        paymentId: isEdit ? editData.paymentId : "PAY-" + Date.now(),
        projectId: getCurrentProjectId(),
        paymentDate: todayFormatted(),
        paymentDirection: direction,
        payee: payee,
        expenseCategory: document.getElementById("pay_cat").value,
        referenceId: "",
        amount: stageAmount,
        totalInvoice: totalInvoice,
        paymentMethod: document.getElementById("pay_method").value,
        status: "",
        stage: stage,
        paymentGroupId:
          paymentGroupId || (isEdit ? editData.paymentGroupId : ""),
        notes: document.getElementById("pay_notes").value,
        attachments: normalizeAttachments(currentModalFiles),
      };
      callApi(isEdit ? "updatePayment" : "savePayment", payload)
        .then(() => {
          closeModal();
          loadPaymentsListings(true);
        })
        .catch(resetSubmitOnError(submit));
    };
  }
}

// ===== payment-helpers.js =====
function onPaymentDirectionChange() {
  const dir = document.getElementById("pay_dir").value;
  const isSmall = dir === "Small Expense";
  const stagingWrap = document.getElementById("pay_staging_wrap");
  if (stagingWrap) stagingWrap.style.display = isSmall ? "none" : "block";
  const balanceLabel = document.querySelector(
    "#pay_staging_wrap div:nth-child(2) span:first-child",
  );
  if (balanceLabel)
    balanceLabel.innerText =
      dir === "Client Receipt" ? "Outstanding Balance" : "Balance";
  if (isSmall) {
    const totalInput = document.getElementById("pay_total_invoice");
    const amountInput = document.getElementById("pay_amount");
    if (totalInput && amountInput) {
      totalInput.value = amountInput.value || "";
      totalInput.disabled = true;
      totalInput.style.background = "#f0f0f0";
    }
  } else {
    const totalInput = document.getElementById("pay_total_invoice");
    if (totalInput) {
      totalInput.disabled = false;
      totalInput.style.background = "white";
    }
  }
  window.recalcPaymentBalance();
}

function recalcPaymentBalance() {
  const dir = document.getElementById("pay_dir").value;
  const isSmall = dir === "Small Expense";
  const totalInvoice = roundMoney(
    Number(document.getElementById("pay_total_invoice").value) || 0,
  );
  const paymentsToDateEl = document.getElementById("pay_payments_to_date");
  const balanceEl = document.getElementById("pay_balance");
  const stageInput = document.getElementById("pay_stage");
  const amountInput = document.getElementById("pay_amount");
  const groupId = document.getElementById("pay_group_id").value;
  const currentId = document.getElementById("pay_id_hidden").value;
  if (isSmall) {
    if (paymentsToDateEl) paymentsToDateEl.innerText = "₦0.00";
    if (balanceEl) balanceEl.innerText = "₦" + moneyValue(totalInvoice);
    return;
  }
  if (!totalInvoice || totalInvoice <= 0) {
    if (paymentsToDateEl) paymentsToDateEl.innerText = "₦0.00";
    if (balanceEl) balanceEl.innerText = "₦0.00";
    return;
  }
  let paymentsToDate = 0;
  if (groupId) {
    const groupData = getPaymentGroupData(groupId, currentId);
    paymentsToDate = groupData.paymentsToDate;
  }
  const balance = roundMoney(totalInvoice - paymentsToDate);
  if (paymentsToDateEl)
    paymentsToDateEl.innerText = "₦" + moneyValue(paymentsToDate);
  if (balanceEl) {
    balanceEl.innerText = "₦" + moneyValue(balance);
    balanceEl.style.color =
      balance > 0
        ? "var(--primary)"
        : balance < 0
          ? "var(--danger)"
          : "var(--success)";
  }
  if (amountInput && balance >= 0) {
    const currentAmount = roundMoney(Number(amountInput.value) || 0);
    if (currentAmount > balance) {
      amountInput.value = balance;
    }
  }
}

function validateStageAmount() {
  const amountInput = document.getElementById("pay_amount");
  const hint = document.getElementById("pay_amount_hint");
  const balanceEl = document.getElementById("pay_balance");
  if (!amountInput || !balanceEl) return;
  const amount = roundMoney(Number(amountInput.value) || 0);
  const balanceText = balanceEl.innerText.replace(/[₦,]/g, "");
  const balance = roundMoney(Number(balanceText) || 0);
  if (amount > balance && balance >= 0) {
    amountInput.value = balance;
    if (hint) {
      hint.innerText = `Amount capped at balance: ₦${moneyValue(balance)}`;
      hint.style.display = "block";
      hint.style.color = "var(--danger)";
    }
  } else {
    if (hint) hint.style.display = "none";
  }
}

function getPaymentGroupData(groupId, excludePaymentId) {
  const cache = getCache();
  const payments = cache.payments || [];
  const groupPayments = payments.filter(
    (p) => p.paymentGroupId === groupId && p.paymentId !== excludePaymentId,
  );
  const totalInvoice =
    groupPayments.length > 0
      ? Number(groupPayments[0].totalInvoice) ||
        Number(groupPayments[0].amount) ||
        0
      : 0;
  const paymentsToDate = groupPayments.reduce(
    (sum, p) => roundMoney(sum + Number(p.amount || 0)),
    0,
  );
  return {
    totalInvoice,
    paymentsToDate,
    balance: roundMoney(totalInvoice - paymentsToDate),
    stages: groupPayments.sort(
      (a, b) => Number(a.stage || 0) - Number(b.stage || 0),
    ),
    stageCount: groupPayments.length,
  };
}

function getAllPaymentGroups(projectId) {
  const cache = getCache();
  const payments = (cache.payments || []).filter(
    (p) => p.projectId === projectId,
  );
  const groups = {};
  payments.forEach((p) => {
    const gid = p.paymentGroupId || p.paymentId;
    if (!groups[gid]) {
      groups[gid] = {
        paymentGroupId: gid,
        direction: p.paymentDirection,
        payee: p.payee,
        projectId: p.projectId,
        totalInvoice: Number(p.totalInvoice) || Number(p.amount) || 0,
        stages: [],
        notes: p.notes,
        paymentMethod: p.paymentMethod,
        expenseCategory: p.expenseCategory,
      };
    }
    groups[gid].stages.push(p);
  });
  Object.values(groups).forEach((g) => {
    g.stages.sort((a, b) => Number(a.stage || 0) - Number(b.stage || 0));
    g.paymentsToDate = g.stages.reduce(
      (sum, s) => roundMoney(sum + Number(s.amount || 0)),
      0,
    );
    g.balance = roundMoney(g.totalInvoice - g.paymentsToDate);
  });
  return Object.values(groups).sort((a, b) => {
    const aDate = a.stages[0]?.paymentDate || "";
    const bDate = b.stages[0]?.paymentDate || "";
    return bDate.localeCompare(aDate);
  });
}

function openAddStageModal(groupId) {
  const cache = getCache();
  const payments = cache.payments || [];
  const groupPayments = payments.filter((p) => p.paymentGroupId === groupId);
  if (!groupPayments.length) return;
  const firstPayment = groupPayments[0];
  const groupData = getPaymentGroupData(groupId, "");
  const nextStage = groupData.stageCount + 1;
  if (nextStage > 4) {
    alert("Maximum 4 stages reached for this invoice.");
    return;
  }
  openModalWithRecord("payment", {
    ...firstPayment,
    _addStage: true,
    paymentId: null,
    stage: String(nextStage),
    amount: "",
    notes: "",
    attachments: "",
    paymentGroupId: groupId,
    totalInvoice: groupData.totalInvoice,
  });
}

// ===== workorder-helpers.js =====
function addTakeOffLineItem(rowData) {
  const tbody = document.getElementById("to_line_items_body");
  if (!tbody) return;
  const unitOptions = MASTER_UNITS.map(
    (u) =>
      `<option value="${escapeAttr(u.value)}" ${rowData && rowData.unit === u.value ? "selected" : ""}>${escapeHtml(u.label)}</option>`,
  ).join("");
  const row = document.createElement("tr");
  row.className = "to-line-row";
  row.dataset.itemId =
    rowData && rowData.itemId ? escapeAttr(rowData.itemId) : "";
  row.innerHTML = `<td style="padding:4px; border-bottom:1px solid var(--border);"><input class="to-line-desc" value="${escapeAttr(rowData && rowData.description ? rowData.description : "")}" placeholder="Description" style="width:100%; padding:8px; font-size:14px; border:1.5px solid var(--border); border-radius:8px;"></td>
  <td style="padding:4px; border-bottom:1px solid var(--border); width:60px;"><input class="to-line-qty" type="number" value="${escapeAttr(rowData && rowData.quantity ? rowData.quantity : "")}" placeholder="Qty" min="0" step="0.01" style="width:100%; padding:8px; font-size:14px; border:1.5px solid var(--border); border-radius:8px; text-align:right;"></td>
  <td style="padding:4px; border-bottom:1px solid var(--border); width:90px;"><select class="to-line-unit" style="width:100%; padding:8px; font-size:14px; border:1.5px solid var(--border); border-radius:8px;"><option value="" disabled ${!(rowData && rowData.unit) ? "selected" : ""}>Select unit</option>${unitOptions}</select></td>
  <td style="padding:4px; border-bottom:1px solid var(--border);"><input class="to-line-notes" value="${escapeAttr(rowData && rowData.notes ? rowData.notes : "")}" placeholder="Notes" style="width:100%; padding:8px; font-size:14px; border:1.5px solid var(--border); border-radius:8px;"></td>
  <td style="padding:4px; border-bottom:1px solid var(--border); width:30px; text-align:center;"><button onclick="this.closest('tr').remove();" style="background:var(--danger); color:white; border:none; border-radius:6px; cursor:pointer; width:28px; height:28px; font-size:14px;">×</button></td>`;
  tbody.appendChild(row);
}

function addTakeOffHeader() {
  const tbody = document.getElementById("to_line_items_body");
  if (!tbody) return;
  const row = document.createElement("tr");
  row.className = "to-line-row to-header-row";
  row.innerHTML = `<td colspan="4" style="padding:4px; border-bottom:1px solid var(--border); background:#e9ecef;"><input class="to-line-desc" value="" placeholder="Header text..." style="width:100%; padding:10px; font-size:15px; font-weight:800; border:1.5px solid var(--border); border-radius:8px; background:#fff;"></td>
  <td style="padding:4px; border-bottom:1px solid var(--border); width:30px; text-align:center; background:#e9ecef;"><button onclick="this.closest('tr').remove();" style="background:var(--danger); color:white; border:none; border-radius:6px; cursor:pointer; width:28px; height:28px; font-size:14px;">×</button></td>`;
  tbody.appendChild(row);
}

function addWorkOrderLineItem(desc, qty, um, rate) {
  const tbody = document.getElementById("wo_line_items_body");
  if (!tbody) return;
  const row = document.createElement("tr");
  row.className = "wo-line-row";
  row.innerHTML = `<td style="padding:4px; border-bottom:1px solid var(--border);"><input class="wo-line-desc" value="${escapeAttr(desc || "")}" placeholder="Description" style="width:100%; padding:8px; font-size:14px; border:1.5px solid var(--border); border-radius:8px;"></td>
  <td style="padding:4px; border-bottom:1px solid var(--border); width:60px;"><input class="wo-line-qty" type="number" value="${escapeAttr(qty || 1)}" min="0" step="0.01" style="width:100%; padding:8px; font-size:14px; border:1.5px solid var(--border); border-radius:8px; text-align:right;" oninput="window.recalcWorkOrderTotal()"></td>
  <td style="padding:4px; border-bottom:1px solid var(--border); width:70px;"><input class="wo-line-um" value="${escapeAttr(um || "")}" placeholder="U/M" style="width:100%; padding:8px; font-size:14px; border:1.5px solid var(--border); border-radius:8px; text-align:center;"></td>
  <td style="padding:4px; border-bottom:1px solid var(--border); width:90px;"><input class="wo-line-rate" type="number" value="${escapeAttr(rate || "")}" min="0" step="0.01" style="width:100%; padding:8px; font-size:14px; border:1.5px solid var(--border); border-radius:8px; text-align:right;" oninput="window.recalcWorkOrderTotal()"></td>
  <td style="padding:4px; border-bottom:1px solid var(--border); width:90px;"><input class="wo-line-amt" type="number" value="0" disabled style="width:100%; padding:8px; font-size:14px; border:1.5px solid var(--border); border-radius:8px; text-align:right; background:#f5f5f5;"></td>
  <td style="padding:4px; border-bottom:1px solid var(--border); width:30px; text-align:center;"><button onclick="this.closest('tr').remove(); window.recalcWorkOrderTotal();" style="background:var(--danger); color:white; border:none; border-radius:6px; cursor:pointer; width:28px; height:28px; font-size:14px;">×</button></td>`;
  tbody.appendChild(row);
  recalcWorkOrderTotal();
}

function recalcWorkOrderTotal() {
  const rows = document.querySelectorAll("#wo_line_items_body tr");
  let total = 0;
  rows.forEach((row) => {
    const qty = Number(row.querySelector(".wo-line-qty").value) || 0;
    const rate = Number(row.querySelector(".wo-line-rate").value) || 0;
    const amt = roundMoney(qty * rate);
    row.querySelector(".wo-line-amt").value = amt;
    total += amt;
  });
  total = roundMoney(total);
  const totalDisplay = document.getElementById("wo_total_display");
  if (totalDisplay) totalDisplay.innerText = "₦" + moneyValue(total);
  const hiddenAmount = document.getElementById("wo_amount_hidden");
  if (hiddenAmount) hiddenAmount.value = total;
}

function formatWorkOrderDescription(description) {
  if (!description) return "—";
  try {
    const parsed = JSON.parse(description);
    if (parsed.lineItems && Array.isArray(parsed.lineItems)) {
      const count = parsed.lineItems.length;
      const firstItem = parsed.lineItems[0]?.description || "";
      return `${count} item${count !== 1 ? "s" : ""}${firstItem ? ": " + firstItem : ""}`;
    }
  } catch (e) {}
  return description.length > 60
    ? description.substring(0, 60) + "..."
    : description;
}

function populateWorkOrderDropdown() {
  const filterSel = document.getElementById("rep-filter-sel");
  const woWrap = document.getElementById("rep-workorder-wrap");
  const woSel = document.getElementById("rep-workorder-sel");
  if (!filterSel || !woWrap || !woSel) return;
  const projectId = filterSel.value;
  if (!projectId) {
    woWrap.style.display = "none";
    return;
  }
  const cache = getCache();
  const projectWOs = (cache.workorders || []).filter(
    (w) => w.projectId === projectId,
  );
  if (!projectWOs.length) {
    woSel.innerHTML = '<option value="">No work orders</option>';
    woWrap.style.display = "block";
    return;
  }
  woSel.innerHTML =
    '<option value="">-- Select Work Order --</option>' +
    projectWOs
      .map((w) => {
        const vendor = (cache.vendors || []).find(
          (v) => v.vendorId === w.vendorId,
        );
        const vendorName = vendor ? vendor.company : w.vendorId;
        return `<option value="${escapeAttr(w.workOrderId)}">${escapeHtml(vendorName)} — ${escapeHtml(w.workOrderId)} (₦${moneyValue(w.amount)})</option>`;
      })
      .join("");
  woWrap.style.display = "block";
}

function renderWorkOrderDetailReport(workorder, project, vendors, settings) {
  const vendor = vendors.find((v) => v.vendorId === workorder.vendorId);
  const terms = [];
  for (let i = 1; i <= 10; i++) {
    const key = `WO${i}`;
    if (settings && settings[key]) terms.push({ num: i, text: settings[key] });
  }

  let lineItems = [];
  let notes = workorder.description || "";
  try {
    const parsed = JSON.parse(workorder.description);
    if (parsed.lineItems && Array.isArray(parsed.lineItems)) {
      lineItems = parsed.lineItems;
      notes = parsed.notes || "";
    }
  } catch (e) {}

  if (!lineItems.length) {
    lineItems = [
      {
        description: workorder.description || "—",
        qty: 1,
        rate: Number(workorder.amount) || 0,
        amount: Number(workorder.amount) || 0,
      },
    ];
  }

  const itemRows = lineItems
    .map(
      (item) =>
        `<tr>
      <td style="border-bottom:1px solid #adb5bd; padding:8px; font-size:12px; vertical-align:top;">${escapeHtml(item.description)}</td>
      <td style="border-bottom:1px solid #adb5bd; padding:8px; font-size:12px; text-align:right; vertical-align:top;">${escapeHtml(String(item.qty))}</td>
      <td style="border-bottom:1px solid #adb5bd; padding:8px; font-size:12px; text-align:center; vertical-align:top;">${escapeHtml(item.um || "—")}</td>
      <td style="border-bottom:1px solid #adb5bd; padding:8px; font-size:12px; text-align:right; vertical-align:top;">₦${moneyValue(item.rate)}</td>
      <td style="border-bottom:1px solid #adb5bd; padding:8px; font-size:12px; text-align:right; vertical-align:top; font-weight:700;">₦${moneyValue(item.amount)}</td>
    </tr>`,
    )
    .join("");

  const totalWO = Number(workorder.amount) || 0;

  let termsHtml = "";
  if (terms.length) {
    termsHtml = `<div style="margin-top: 24px; page-break-inside: avoid;">
      <h3 style="font-size: 14px; font-weight: 900; text-transform: uppercase; margin: 16px 0 8px; border-bottom: 1px solid #000; padding-bottom: 4px;">Terms & Conditions</h3>
      <ol style="font-size: 12px; line-height: 1.6; padding-left: 20px;">
        ${terms.map((t) => `<li style="margin-bottom: 6px;">${escapeHtml(t.text)}</li>`).join("")}
      </ol>
    </div>`;
  }

  let notesHtml = "";
  if (notes) {
    notesHtml = `<div style="margin-top: 16px; padding: 12px; background: #f8f9fa; border-radius: 8px; border: 1px solid #adb5bd;">
      <strong style="font-size: 12px; text-transform: uppercase;">Notes</strong>
      <p style="font-size: 12px; margin-top: 4px; line-height: 1.5;">${escapeHtml(notes)}</p>
    </div>`;
  }

  return `${generateReportHeader("Work Order", project)}
    <div style="margin-bottom: 16px; font-size: 12px; line-height: 1.6;">
      <div><strong>Work Order ID:</strong> ${escapeHtml(workorder.workOrderId)}</div>
      <div><strong>Vendor:</strong> ${escapeHtml(vendor ? vendor.company : workorder.vendorId)}${vendor && vendor.trade ? ` (${escapeHtml(vendor.trade)})` : ""}</div>
      <div><strong>Contact:</strong> ${escapeHtml(vendor ? vendor.contactName : "—")}</div>
      <div><strong>Phone:</strong> ${escapeHtml(vendor ? vendor.phone1 : "—")}</div>
      <div><strong>Status:</strong> ${escapeHtml(workorder.status)}</div>
    </div>
    <table class="report-table" style="width:100%; border-collapse: collapse; font-size:12px; margin-bottom: 16px;">
      <thead>
        <tr>
          <th style="background:#000; color:#fff; text-align:left; padding:8px; font-size:10px; text-transform:uppercase;">Description</th>
          <th style="background:#000; color:#fff; text-align:right; padding:8px; font-size:10px; text-transform:uppercase; width:60px;">Qty</th>
          <th style="background:#000; color:#fff; text-align:center; padding:8px; font-size:10px; text-transform:uppercase; width:70px;">U/M</th>
          <th style="background:#000; color:#fff; text-align:right; padding:8px; font-size:10px; text-transform:uppercase; width:90px;">Rate (₦)</th>
          <th style="background:#000; color:#fff; text-align:right; padding:8px; font-size:10px; text-transform:uppercase; width:90px;">Amount (₦)</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
        <tr style="background:#e9ecef; font-weight:900;">
          <td colspan="4" style="border-bottom:2px solid #000; padding:8px; font-size:12px;"><strong>TOTAL WORK ORDER VALUE</strong></td>
          <td style="border-bottom:2px solid #000; padding:8px; font-size:12px; text-align:right;">₦${moneyValue(totalWO)}</td>
        </tr>
      </tbody>
    </table>
    ${notesHtml}
    ${termsHtml}`;
}

// ===== dashboard.js =====
async function refreshMasterDashboard() {
  const container = document.getElementById("project-master-list");
  if (container)
    container.innerHTML =
      '<p style="text-align:center;padding:20px;"><i class="fas fa-spinner fa-spin"></i> Loading projects...</p>';
  try {
    const projects = await callApi("getProjects", {});
    const cache = getCache();
    cache.projects = projects || [];
    setCache(cache);
    renderProjects();
  } catch (e) {
    console.error("refreshMasterDashboard error:", e);
    if (container)
      container.innerHTML =
        '<p style="text-align:center;padding:20px;color:red;">Failed to load projects. Check your connection.</p>';
  }
}

function renderProjects() {
  const container = document.getElementById("project-master-list");
  const searchEl = document.getElementById("search-projects");
  if (!container || !searchEl) return;
  const term = searchEl.value.toLowerCase();
  const cache = getCache();
  const filtered = cache.projects.filter(
    (p) =>
      p.clientName?.toLowerCase().includes(term) ||
      p.projectId?.toLowerCase().includes(term),
  );
  if (!filtered.length) {
    container.innerHTML =
      '<p style="text-align:center;padding:20px;">No projects</p>';
    return;
  }
  try {
    container.innerHTML = filtered
      .map(
        (p) =>
          `<div class="card" data-project-id="${escapeAttr(p.projectId)}" onclick="window.loadProjectConsoleHub('${escapeAttr(p.projectId)}')" style="border-left:5px solid ${p.projectStatus === "Active" ? "var(--success)" : "var(--muted)"}; cursor:pointer;"><strong style="font-size:20px;">${escapeHtml(p.clientName)}</strong><br><span>${escapeHtml(p.siteLocation)}</span><div style="margin-top:6px; font-size:12px;">ID: ${escapeHtml(p.projectId)} | ${escapeHtml(p.projectStatus)}</div></div>`,
      )
      .join("");
  } catch (e) {
    console.error("renderProjects error:", e);
    container.innerHTML =
      '<p style="text-align:center;padding:20px;color:red;">Error rendering projects. Check console.</p>';
  }
}

async function refreshVendorsListView() {
  const vendors = await callApi("getVendors", {});
  const cache = getCache();
  cache.vendors = vendors || [];
  setCache(cache);
  const trades = [
    ...new Set(cache.vendors.map((v) => v.trade).filter(Boolean)),
  ];
  const filterSelect = document.getElementById("filter-vendor-trade");
  if (filterSelect)
    filterSelect.innerHTML =
      '<option value="">All Trades</option>' +
      trades
        .map(
          (t) => `<option value="${escapeAttr(t)}">${escapeHtml(t)}</option>`,
        )
        .join("");
  renderVendors();
}

function renderVendors() {
  const term = document.getElementById("search-vendor").value.toLowerCase();
  const trade = document.getElementById("filter-vendor-trade").value;
  const cache = getCache();
  const filtered = cache.vendors.filter(
    (v) =>
      (!term || v.company?.toLowerCase().includes(term)) &&
      (!trade || v.trade === trade),
  );
  const container = document.getElementById("vendor-master-list");
  if (!filtered.length) {
    container.innerHTML = '<p style="padding:20px;">No vendors</p>';
    return;
  }
  container.innerHTML = filtered
    .map((v) => {
      const key = `vendor:${v.vendorId}`;
      window.modalRecordCache = window.modalRecordCache || {};
      window.modalRecordCache[key] = v;
      return `<div class="card" data-modal-type="vendor" data-modal-key="${key}" onclick="window.openModalWithRecord('vendor', window.modalRecordCache['${key}'])" style="display:flex; gap:12px; align-items:center;"><img src="${getDirectImageUrl(v.passport) || "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%3E%3Cpath%20fill%3D%22%23666%22%20d%3D%22M12%2012c2.21%200%204-1.79%204-4s-1.79-4-4-4-4%201.79-4%204%201.79%204%204%204zm0%202c-2.67%200-8%201.34-8%204v2h16v-2c0-2.66-5.33-4-8-4z%22%2F%3E%3C%2Fsvg%3E"}" style="width:50px; height:50px; border-radius:50%; object-fit:cover;"><div><strong>${escapeHtml(v.company)}</strong><br>${escapeHtml(v.trade)}<br>${escapeHtml(v.phone1)}</div></div>`;
    })
    .join("");
}

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
  if (seg === "takeoff") loadTakeOffListings();
  if (seg === "templates") loadTemplatesSegment();
  if (seg === "progress") loadProgressTimelineFeed();
  if (seg === "snags") loadSnagsListings();
  if (seg === "workorders") loadWorkOrdersListings();
  if (seg === "payments") loadPaymentsListings();
}

async function loadTakeOffListings(forceRefresh = false) {
  const container = document.getElementById("console-takeoff-list");
  let cache = getCache();
  if (forceRefresh || !cache.takeoffs.length) {
    container.innerHTML = `<p style="text-align:center;padding:15px;"><i class="fas fa-spinner fa-spin"></i> Loading take‑off items...</p>`;
    const items = await callApi("getTakeOffItems", {});
    cache = getCache();
    cache.takeoffs = items || [];
    setCache(cache);
  }
  const projectId = getCurrentProjectId();
  const projectItems = cache.takeoffs.filter((i) => i.projectId === projectId);
  const validIds = new Set(projectItems.map((i) => i.itemId));
  for (const id of selectedTakeOffIds) {
    if (!validIds.has(id)) selectedTakeOffIds.delete(id);
  }
  if (!projectItems.length) {
    container.innerHTML = `<p style="text-align:center;padding:20px;">No take‑off items yet.</p>`;
    selectedTakeOffIds.clear();
    return;
  }
  let html = "";
  if (selectedTakeOffIds.size > 0)
    html += `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;"><span style="font-size:13px; font-weight:700;">${selectedTakeOffIds.size} selected</span><button class="action-btn" style="width:auto; padding:8px 16px; font-size:13px; background:var(--danger);" onclick="window.deleteSelectedTakeOffs()"><i class="fas fa-trash"></i> Delete Selected</button></div>`;
  html += projectItems
    .map((i) => {
      const key = `takeoff_item:${i.itemId}`;
      window.modalRecordCache = window.modalRecordCache || {};
      window.modalRecordCache[key] = i;
      const isChecked = selectedTakeOffIds.has(i.itemId);
      const isHeader = String(i.scopeNotes || "").startsWith("__HEADER__:");
      if (isHeader) {
        return `<div class="card" style="background:var(--card-light); border-left:4px solid var(--primary); cursor:default; padding:10px 16px; margin-bottom:8px;"><div style="display:flex; align-items:center; gap:10px;"><input type="checkbox" style="width:auto; cursor:pointer;" ${isChecked ? "checked" : ""} onclick="event.stopPropagation(); window.toggleTakeOffSelection('${escapeAttr(i.itemId)}', this.checked)"><strong style="font-size:15px; text-transform:uppercase; letter-spacing:0.5px;">${escapeHtml(i.description)}</strong></div></div>`;
      }
      return `<div class="card" style="cursor:pointer; position:relative;"><div style="display:flex; align-items:start; gap:10px;"><input type="checkbox" style="width:auto; margin-top:2px; cursor:pointer;" ${isChecked ? "checked" : ""} onclick="event.stopPropagation(); window.toggleTakeOffSelection('${escapeAttr(i.itemId)}', this.checked)"><div style="flex:1;" onclick="window.openModalWithRecord('takeoff_item', window.modalRecordCache['${key}'])">${escapeHtml(i.description)}<br><strong>${escapeHtml(i.quantity)} ${escapeHtml(i.unit)}</strong>${i.scopeNotes ? `<div style="font-size:11px; color:var(--muted); margin-top:4px;">${escapeHtml(i.scopeNotes)}</div>` : ""}</div></div></div>`;
    })
    .join("");
  container.innerHTML = html;
}

async function loadProgressTimelineFeed(forceRefresh = false) {
  const container = document.getElementById("console-progress-feed");
  let cache = getCache();
  if (forceRefresh || !cache.progressLogs.length) {
    container.innerHTML = `<p style="text-align:center;padding:15px;"><i class="fas fa-spinner fa-spin"></i> Loading progress logs...</p>`;
    const logs = await callApi("getProgressLogs", {});
    cache = getCache();
    cache.progressLogs = logs || [];
    setCache(cache);
  }
  const projectId = getCurrentProjectId();
  const projectLogs = cache.progressLogs.filter(
    (l) => l.projectId === projectId,
  );
  if (!projectLogs.length) {
    container.innerHTML = `<p style="text-align:center;padding:20px;">No progress logs.</p>`;
    return;
  }
  container.innerHTML = projectLogs
    .map(
      (l) =>
        `<div class="card"><strong>${escapeHtml(l.tradeCategory)}</strong> - ${escapeHtml(l.completionPercentage)}%<br>${escapeHtml(l.commentNarrative)}<br><small>${escapeHtml(l.dateRecorded)}</small></div>`,
    )
    .join("");
}

async function loadSnagsListings(forceRefresh = false) {
  const container = document.getElementById("console-snags-list");
  let cache = getCache();
  if (forceRefresh || !cache.snags.length) {
    container.innerHTML = `<p style="text-align:center;padding:15px;"><i class="fas fa-spinner fa-spin"></i> Loading snags...</p>`;
    const items = await callApi("getSnags", {});
    cache = getCache();
    cache.snags = items || [];
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
  if (forceRefresh || !cache.workorders.length) {
    container.innerHTML = `<p style="text-align:center;padding:15px;"><i class="fas fa-spinner fa-spin"></i> Loading work orders...</p>`;
    const orders = await callApi("getWorkOrders", {});
    cache = getCache();
    cache.workorders = orders || [];
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
  if (forceRefresh || !cache.payments.length) {
    container.innerHTML = `<p style="text-align:center; font-size:14px; font-weight:700;"><i class="fas fa-spinner fa-spin"></i> Loading payment records...</p>`;
    const payments = await callApi("getPayments", {});
    cache = getCache();
    cache.payments = payments || [];
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

// ===== api.js =====
let cache = {
  projects: [],
  takeoffs: [],
  progressLogs: [],
  snags: [],
  vendors: [],
  workorders: [],
  payments: [],
  settings: {},
};
let currentSelectedProjectId = null;

function setCache(newCache) {
  cache = { ...cache, ...newCache };
}
function getCache() {
  return cache;
}
function setCurrentProjectId(id) {
  currentSelectedProjectId = id;
}
function getCurrentProjectId() {
  return currentSelectedProjectId;
}

async function callApi(action, data = {}) {
  const isGet = action.startsWith("get");
  let response;
  try {
    const payload = { action, data: { ...data, token: AUTH_TOKEN } };
    response = await fetch(GAS_URL, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.warn(`callApi [${action}] network error:`, err);
    if (isGet)
      return readBackup(
        action,
        action === "getStats" ? { activeVendors: "--" } : [],
      );
    await queueOfflineRequest(action, data);
    applyLocalMutation(action, data);
    updateSyncStatus();
    alert("📴 Offline: saved locally. Will sync automatically when online.");
    return { status: "queued" };
  }
  if (!response.ok) {
    console.warn(`callApi [${action}] HTTP ${response.status}`);
    if (isGet)
      return readBackup(
        action,
        action === "getStats" ? { activeVendors: "--" } : [],
      );
    throw new Error(`HTTP ${response.status}`);
  }
  let result;
  try {
    result = await response.json();
  } catch (err) {
    console.warn(`callApi [${action}] JSON parse error:`, err);
    if (isGet)
      return readBackup(
        action,
        action === "getStats" ? { activeVendors: "--" } : [],
      );
    throw new Error("Invalid response from server");
  }
  if (result && (result.status === "error" || result.success === false)) {
    const message =
      result.message || result.error || "Server rejected the request";
    console.warn(`callApi [${action}] server error:`, message);
    if (isGet)
      return readBackup(
        action,
        action === "getStats" ? { activeVendors: "--" } : [],
      );
    alert(`⚠️ Save failed: ${message}`);
    throw new Error(message);
  }
  if (isGet) writeBackup(action, result);
  return result;
}

const DEPENDENCY_ORDER = {
  saveProject: 1,
  updateProject: 1,
  saveVendor: 2,
  updateVendor: 2,
  saveWorkOrder: 3,
  updateWorkOrder: 3,
  saveTakeOffItem: 5,
  updateTakeOffItem: 5,
  deleteTakeOffItem: 5,
  saveProgressLog: 6,
  saveSnag: 7,
  updateSnag: 7,
  deleteSnag: 7,
  savePayment: 8,
  updatePayment: 8,
};

async function syncQueuedRequests() {
  await updateSyncStatus();
  let queue = await getQueuedRequests();
  if (!queue.length) return;
  alert("🔄 Syncing offline data...");
  queue.sort(
    (a, b) =>
      (DEPENDENCY_ORDER[a.action] || 99) - (DEPENDENCY_ORDER[b.action] || 99),
  );
  for (let item of queue) {
    let retries = 3,
      delay = 1000,
      success = false;
    while (retries > 0 && !success) {
      try {
        const payload = {
          action: item.action,
          data: { ...item.data, token: AUTH_TOKEN },
        };
        const response = await fetch(GAS_URL, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        if (response.ok) {
          const result = await response.json();
          if (!result.error && result.success !== false) {
            await deleteQueuedRequest(item.id);
            success = true;
            break;
          }
        }
        throw new Error("Sync failed");
      } catch (err) {
        retries--;
        if (retries === 0) {
          console.error("Failed to sync", item.action, item.data);
          alert(`Failed to sync ${item.action}. Will retry later.`);
        } else {
          await new Promise((r) => setTimeout(r, delay));
          delay *= 2;
        }
      }
    }
  }
  await refreshMasterDashboard();
  const vendorsView = document.getElementById("view-vendors");
  if (vendorsView && vendorsView.classList.contains("active-view"))
    refreshVendorsListView();
  if (currentSelectedProjectId) {
    loadTakeOffListings(true);
    loadProgressTimelineFeed(true);
    loadSnagsListings(true);
    loadWorkOrdersListings(true);
    loadPaymentsListings(true);
  }
  await updateSyncStatus();
}

async function updateSyncStatus() {
  const badge = document.getElementById("sync-status");
  const pendingBadge = document.getElementById("sync-pending-badge");
  const queue = await getQueuedRequests();
  if (pendingBadge) {
    pendingBadge.textContent = queue.length;
    pendingBadge.style.display = queue.length ? "inline-block" : "none";
  }
  if (!badge) return;
  if (!navigator.onLine) {
    badge.innerHTML = `<i class="fas fa-wifi"></i> Offline${queue.length ? ` • ${queue.length} pending` : ""}`;
    badge.style.display = "block";
    return;
  }
  if (queue.length) {
    badge.innerHTML = `<i class="fas fa-sync-alt fa-spin"></i> ${queue.length} pending`;
    badge.style.display = "block";
    return;
  }
  badge.style.display = "none";
}

function setButtonState(buttonId, html, disabled) {
  const button = document.getElementById(buttonId);
  if (!button) return;
  button.innerHTML = html;
  button.disabled = disabled;
  button.style.opacity = disabled ? "0.65" : "";
  button.style.pointerEvents = disabled ? "none" : "";
}

function showFinishedButtonState(buttonId, doneHtml, normalHtml) {
  setButtonState(buttonId, doneHtml, false);
  setTimeout(() => {
    setButtonState(buttonId, normalHtml, false);
    updateSyncStatus();
  }, 1200);
}

async function triggerManualSync() {
  if (!navigator.onLine) {
    alert("You are offline. Please connect to internet.");
    return;
  }
  const normalHtml = `<i class="fas fa-sync-alt"></i> Sync Now <span id="sync-pending-badge" class="sync-count-badge" style="display:none;">0</span>`;
  try {
    setButtonState(
      "sync-now-btn",
      `<i class="fas fa-sync-alt fa-spin"></i> Syncing...`,
      true,
    );
    await syncQueuedRequests();
    showFinishedButtonState(
      "sync-now-btn",
      `<i class="fas fa-check"></i> Synced`,
      normalHtml,
    );
  } catch (err) {
    setButtonState("sync-now-btn", normalHtml, false);
    throw err;
  } finally {
    await updateSyncStatus();
  }
}

async function refreshAllData() {
  if (!navigator.onLine) {
    alert("Offline – cannot refresh from server.");
    return;
  }
  const normalHtml = `<i class="fas fa-database"></i> Refresh`;
  try {
    setButtonState(
      "refresh-data-btn",
      `<i class="fas fa-spinner fa-spin"></i> Refreshing...`,
      true,
    );
    await callApi("getProjects", {});
    await callApi("getTakeOffItems", {});
    await callApi("getProgressLogs", {});
    await callApi("getSnags", {});
    await callApi("getVendors", {});
    await callApi("getWorkOrders", {});
    await callApi("getPayments", {});
    const settingsRes = await callApi("getSettings", {});
    if (settingsRes && settingsRes.data) {
      const cache = getCache();
      cache.settings = settingsRes.data;
      setCache(cache);
    }
    await refreshMasterDashboard();
    if (currentSelectedProjectId) {
      loadTakeOffListings(true);
      loadProgressTimelineFeed(true);
      loadSnagsListings(true);
      loadWorkOrdersListings(true);
      loadPaymentsListings(true);
    }
    showFinishedButtonState(
      "refresh-data-btn",
      `<i class="fas fa-check"></i> Refreshed`,
      normalHtml,
    );
  } catch (err) {
    setButtonState("refresh-data-btn", normalHtml, false);
    throw err;
  }
}

// ===== app.js =====
let appStarted = false;
let suppressPageRefresh = false;

function showPage(pageId) {
  document
    .querySelectorAll(".page-view:not(.console-tab-window)")
    .forEach((v) => v.classList.remove("active-view"));
  const target = document.getElementById(`view-${pageId}`);
  if (target) target.classList.add("active-view");
  if (!suppressPageRefresh) {
    if (pageId === "dashboard") refreshMasterDashboard();
    if (pageId === "vendors") refreshVendorsListView();
    if (pageId === "accounts") loadAccountsView();
    if (pageId === "reports") initReportsConsoleEngine();
  }
  window.scrollTo(0, 0);
}

function showPageWithoutRefresh(pageId) {
  suppressPageRefresh = true;
  showPage(pageId);
  suppressPageRefresh = false;
}

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
window.handleReportScopePopulation = handleReportScopePopulation;
window.handleReportFilterPopulation = handleReportFilterPopulation;
window.compileFieldReport = compileFieldReport;
window.loadAccountsView = loadAccountsView;
window.updateAccountsSummary = updateAccountsSummary;
window.saveReportPDF = saveReportPDF;
window.toggleTakeOffSelection = toggleTakeOffSelection;
window.toggleTemplateSelection = toggleTemplateSelection;
window.deleteSelectedTakeOffs = deleteSelectedTakeOffs;
window.deleteSelectedTemplates = deleteSelectedTemplates;
window.hideAllBuiltInTemplates = hideAllBuiltInTemplates;
window.showAllBuiltInTemplates = showAllBuiltInTemplates;
window.shareReport = shareReport;
window.previewTemplate = previewTemplate;
window.applyTemplateToProject = applyTemplateToProject;
window.openSaveAsTemplateModal = openSaveAsTemplateModal;
window.loadTemplatesSegment = loadTemplatesSegment;
window.deleteCustomTemplate = deleteCustomTemplate;
window.openEditTemplateModal = openEditTemplateModal;
window.addEditTemplateItemRow = addEditTemplateItemRow;
window.onPaymentDirectionChange = onPaymentDirectionChange;
window.recalcPaymentBalance = recalcPaymentBalance;
window.validateStageAmount = validateStageAmount;
window.getPaymentGroupData = getPaymentGroupData;
window.getAllPaymentGroups = getAllPaymentGroups;
window.openAddStageModal = openAddStageModal;
window.addWorkOrderLineItem = addWorkOrderLineItem;
window.recalcWorkOrderTotal = recalcWorkOrderTotal;
window.populateWorkOrderDropdown = populateWorkOrderDropdown;
window.addTakeOffLineItem = addTakeOffLineItem;
window.addTakeOffHeader = addTakeOffHeader;
window.exportAllTemplatesJSON = exportAllTemplatesJSON;
window.exportSingleTemplateJSON = exportSingleTemplateJSON;
window.importTemplatesFromJSON = importTemplatesFromJSON;
window.openImportTemplatesModal = openImportTemplatesModal;

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () =>
    navigator.serviceWorker.register("./sw.js").catch((e) => console.warn(e)),
  );
}
window.addEventListener("online", syncQueuedRequests);
window.addEventListener("offline", updateSyncStatus);

let installPromptEvent = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  installPromptEvent = e;
  const btn = document.getElementById("pwa-install-btn");
  if (btn) btn.style.display = "inline-flex";
});
window.addEventListener("appinstalled", () => {
  installPromptEvent = null;
  const btn = document.getElementById("pwa-install-btn");
  if (btn) btn.style.display = "none";
});

function initPwaInstall() {
  const btn = document.getElementById("pwa-install-btn");
  if (!btn) return;
  btn.addEventListener("click", async () => {
    if (!installPromptEvent) {
      showInstallFallback();
      return;
    }
    try {
      await installPromptEvent.prompt();
      const result = await installPromptEvent.userChoice;
      if (result.outcome === "accepted") {
        btn.style.display = "none";
      }
      installPromptEvent = null;
    } catch (err) {
      console.error("Install prompt failed:", err);
      showInstallFallback();
    }
  });
  if (
    window.matchMedia("(display-mode: standalone)").matches ||
    navigator.standalone === true
  ) {
    btn.style.display = "none";
    return;
  }
  setTimeout(() => {
    if (!installPromptEvent && btn.style.display === "none") {
      btn.style.display = "inline-flex";
      btn.innerHTML = '<i class="fas fa-download"></i> Add to Home Screen';
    }
  }, 3000);
}

function showInstallFallback() {
  const isAndroid = /Android/.test(navigator.userAgent);
  const body = document.getElementById("modalBody");
  const submit = document.getElementById("modalSubmit");
  const title = document.getElementById("modalTitle");
  const overlay = document.getElementById("modalOverlay");
  title.innerText = "Add to Home Screen";
  overlay.style.display = "flex";
  if (isAndroid) {
    body.innerHTML = `<p style="font-size:15px; line-height:1.5;">To install on Android:</p><ol style="font-size:15px; line-height:1.6; padding-left:20px;"><li>Tap the <strong>menu</strong> button <i class="fas fa-ellipsis-v" style="color:var(--primary);"></i> in Chrome.</li><li>Tap <strong>Add to Home screen</strong> or <strong>Install app</strong>.</li><li>Tap <strong>Add</strong> or <strong>Install</strong>.</li></ol><p style="font-size:13px; color:var(--muted); margin-top:10px;">Once added, open from your home screen for full-screen experience.</p>`;
  } else {
    body.innerHTML = `<p style="font-size:15px; line-height:1.5;">To install this app:</p><ol style="font-size:15px; line-height:1.6; padding-left:20px;"><li>Open your browser menu.</li><li>Look for <strong>Add to Home Screen</strong> or <strong>Install App</strong>.</li><li>Follow the prompts to add the icon to your home screen.</li></ol>`;
  }
  submit.style.display = "block";
  submit.innerText = "Close";
  submit.onclick = closeModal;
}

window.addEventListener("load", () => {
  if (appStarted) return;
  appStarted = true;
  updateSyncStatus();
  showPageWithoutRefresh("dashboard");
  refreshMasterDashboard();
  initPwaInstall();
  callApi("getSettings", {})
    .then((res) => {
      const cache = getCache();
      cache.settings = res && res.data ? res.data : {};
      setCache(cache);
    })
    .catch(() => {});
  if (navigator.onLine) syncQueuedRequests();
});
