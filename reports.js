// ===== reports.js =====

// Track current report type for layout system
let currentReportType = "";

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
  // Use layout system if available and a report type is set
  if (typeof getLayoutForReport === "function" && currentReportType) {
    try {
      const layout = getLayoutForReport(currentReportType);
      if (layout && typeof generateLayoutHeader === "function") {
        return generateLayoutHeader(title, project, layout);
      }
    } catch (e) {}
  }
  // Fallback: original letterhead-style header
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

function generateSignatureBlock() {
  if (typeof getLayoutForReport === "function" && currentReportType) {
    try {
      const layout = getLayoutForReport(currentReportType);
      if (layout && typeof generateLayoutSignature === "function") {
        return generateLayoutSignature(layout);
      }
    } catch (e) {}
  }
  return `<div style="margin-top: 32px; page-break-inside: avoid;">
    <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; margin-bottom: 12px; color: #495057;">Authorized Signatory</div>
    <div style="display: inline-block; text-align: center;">
      <div style="border-bottom: 1.5px solid #000; width: 200px; margin: 0 auto 4px auto;"></div>
      <div style="font-size: 12px; font-weight: 700;">_________________________</div>
    </div>
  </div>`;
}

function generateReportFooter() {
  if (typeof getLayoutForReport === "function" && currentReportType) {
    try {
      const layout = getLayoutForReport(currentReportType);
      if (layout && typeof generateLayoutFooter === "function") {
        return generateLayoutFooter(layout);
      }
    } catch (e) {}
  }
  return `<div class="report-footer">
    <div style="font-weight: 700; margin-bottom: 4px;">Road 1 House 5B, Isheri-Brooks Estate, Isheri-Olofin, Ogun State</div>
    <div>+234 809 260 8103&nbsp;&nbsp;&nbsp;+234 708 260 8103&nbsp;&nbsp;&nbsp;pi.projects20@gmail.com</div>
  </div>`;
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
        `<tr><td style="border-bottom:1px solid #adb5bd; padding:8px; font-size:12px; vertical-align:top; white-space:nowrap;">${escapeHtml(l.dateRecorded)}</td><td style="border-bottom:1px solid #adb5bd; padding:8px; font-size:12px; vertical-align:top; width:90px;"><strong>${escapeHtml(l.tradeCategory)}</strong></td><td style="border-bottom:1px solid #adb5bd; padding:8px; font-size:12px; vertical-align:top; width:100px;"><div style="background:#e9ecef; border-radius:4px; height:16px; width:100px; overflow:hidden; display:inline-block; vertical-align:middle; margin-right:8px;"><div style="background:#6c757d; height:100%; width:${Math.min(100, Math.max(0, Number(l.completionPercentage) || 0))}%;"></div></div><strong style="color:#6c757d;">${escapeHtml(l.completionPercentage)}%</strong></td><td style="border-bottom:1px solid #adb5bd; padding:8px; font-size:12px; vertical-align:top;">${escapeHtml(l.commentNarrative || "—")}</td></tr>`,
    )
    .join("");
  return `${generateReportHeader("Progress Report", project)}<table class="report-table" style="width:100%; border-collapse: collapse; font-size:12px;"><thead><tr><th style="background:#000; color:#fff; text-align:left; padding:8px; font-size:10px; text-transform:uppercase; white-space:nowrap;">Date</th><th style="background:#000; color:#fff; text-align:left; padding:8px; font-size:10px; text-transform:uppercase; width:90px;">Trade</th><th style="background:#000; color:#fff; text-align:left; padding:8px; font-size:10px; text-transform:uppercase; width:100px;">%</th><th style="background:#000; color:#fff; text-align:left; padding:8px; font-size:10px; text-transform:uppercase;">Comments</th></tr></thead><tbody>${rows || '<tr><td colspan="4" style="padding:20px; text-align:center; color:#495057;">No progress logs recorded.</td></tr>'}</tbody></table>${generateSignatureBlock()}${generateReportFooter()}`;
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
    currentReportType = type; // Set for layout system
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
          cache.settings = res || cache.settings || {};
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