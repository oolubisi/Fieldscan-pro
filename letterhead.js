// ===== letterhead.js =====
function loadLetterheadView() {
  const dateInput = document.getElementById("letter-date");
  if (dateInput && !dateInput.value) {
    dateInput.value = new Date().toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }
}

function generateLetterheadHTML() {
  const date = document.getElementById("letter-date").value || "";
  const clientName = document.getElementById("letter-client-name").value || "";
  const clientAddress =
    document.getElementById("letter-client-address").value || "";
  const salutation = document.getElementById("letter-salutation").value || "";
  const title = document.getElementById("letter-title").value || "";
  const body = document.getElementById("letter-body").value || "";
  const signatory = document.getElementById("letter-signatory").value || "";
  const signatoryTitle =
    document.getElementById("letter-signatory-title").value || "";

  const cache = getCache();
  const settings = cache.settings || {};
  // Logo comes from Settings sheet key "Logo"; signature image from "Sign_Signed"; signatory name from "Name_Signed"
  const logoUrl = settings.Logo ? getDirectImageUrl(settings.Logo) : "";
  const signImageUrl = settings.Sign_Signed
    ? getDirectImageUrl(settings.Sign_Signed)
    : "";
  // Use settings signatory name as fallback if form field is empty
  const signatoryName = signatory || settings.Name_Signed || "";

  const bodyParagraphs = body
    .split("\n")
    .filter((p) => p.trim())
    .map(
      (p) =>
        `<p style="margin: 0 0 12px 0; text-align: justify;">${escapeHtml(p)}</p>`,
    )
    .join("");

  const clientAddressLines = clientAddress
    .split("\n")
    .map((line) => `<div>${escapeHtml(line)}</div>`)
    .join("");

  // Signature block: show signature image from settings if available, else a line
  const signatureLineOrImg = signImageUrl
    ? `<img src="${escapeAttr(signImageUrl)}" style="height:48px; max-width:180px; object-fit:contain; display:block; margin-bottom:2px;" onerror="this.style.display='none'">`
    : `<div style="border-bottom: 1.5px solid #000; width: 200px; margin-bottom: 4px;"></div>`;

  return `<div class="letterhead-page" style="
      position: relative;
      min-height: calc(297mm - 40mm);
      background: white;
      font-family: 'Calibri', 'Georgia', serif;
      font-size: 12pt;
      color: #000;
      padding: 20mm 20mm 40mm 20mm;
      box-sizing: border-box;
    ">

    <!-- ── HEADER: Logo top-right, date below logo ── -->
    <div style="display: flex; justify-content: flex-end; align-items: flex-start; margin-bottom: 28px;">
      <div style="text-align: right;">
        ${
          logoUrl
            ? `<img src="${escapeAttr(logoUrl)}" style="height: 90px; max-width: 200px; object-fit: contain; display: block; margin-left: auto;" onerror="this.style.display='none'">`
            : `<div style="height:90px;"></div>`
        }
        <div style="font-size: 11pt; margin-top: 10px; color: #000;">${escapeHtml(date)}</div>
      </div>
    </div>

    <!-- ── CLIENT BLOCK: bold name, normal address ── -->
    <div style="margin-bottom: 20px; font-size: 11pt; line-height: 1.5;">
      <div style="font-weight: 700;">${escapeHtml(clientName)}</div>
      ${clientAddressLines}
    </div>

    <!-- ── SALUTATION ── -->
    <div style="margin-bottom: 16px; font-size: 11pt;">${escapeHtml(salutation)}</div>

    <!-- ── TITLE (bold, left-aligned) ── -->
    ${title ? `<div style="font-weight: 700; font-size: 11pt; margin-bottom: 14px; text-decoration: underline;">${escapeHtml(title)}</div>` : ""}

    <!-- ── BODY ── -->
    <div style="font-size: 11pt; line-height: 1.6; margin-bottom: 32px;">
      ${bodyParagraphs || `<p style="color:#adb5bd; font-style:italic;">No body text entered.</p>`}
    </div>

    <!-- ── SIGNATURE BLOCK ── -->
    <div style="font-size: 11pt; margin-bottom: 8px;">Yours faithfully,</div>
    <div style="margin-top: 20px; margin-bottom: 4px;">
      ${signatureLineOrImg}
    </div>
    <div style="font-weight: 700; font-size: 11pt;">${escapeHtml(signatoryName)}</div>
    ${signatoryTitle ? `<div style="font-size: 11pt; color: #333;">${escapeHtml(signatoryTitle)}</div>` : ""}

    <!-- ── FOOTER: pinned to bottom, centred, icon + two phones + email ── -->
    <div style="
        position: absolute;
        bottom: 12mm;
        left: 20mm;
        right: 20mm;
        border-top: 1px solid #888;
        padding-top: 6px;
        text-align: center;
        font-size: 9pt;
        color: #444;
        line-height: 1.6;
      ">
      <div>&#128205; Road 1 House 5B, Isheri-Brooks Estate, Isheri-Olofin, Ogun State</div>
      <div>
        &#128222; +234 809 260 8103 &nbsp;&nbsp;&nbsp;
        &#128222; +234 708 260 8103 &nbsp;&nbsp;&nbsp;
        &#9993; pi.projects20@gmail.com
      </div>
    </div>

  </div>`;
}

function printLetterhead() {
  const html = generateLetterheadHTML();
  const preview = document.getElementById("letterhead-preview");
  const printContainer = document.getElementById("letterhead-print-container");
  const card = document.getElementById("letterhead-preview-card");
  if (preview) preview.innerHTML = html;
  if (printContainer) printContainer.innerHTML = html;
  if (card) card.style.display = "block";
  window.scrollTo(0, document.body.scrollHeight);
}

async function generateLetterheadPDF(orientation) {
  orientation = (orientation || "portrait").toLowerCase();
  const isLandscape = orientation === "landscape" || orientation === "l";
  const jsPdfOrientation = isLandscape ? "landscape" : "portrait";
  const container = document.getElementById("letterhead-print-container");
  if (!container || !container.innerText.trim()) {
    alert("Generate a letter first");
    return null;
  }
  if (typeof html2canvas === "undefined" || typeof jspdf === "undefined") {
    alert("PDF libraries not loaded.");
    return null;
  }

  const originals = {
    display: container.style.display,
    position: container.style.position,
    left: container.style.left,
    top: container.style.top,
    width: container.style.width,
    zIndex: container.style.zIndex,
    background: container.style.background,
    padding: container.style.padding,
  };

  container.style.display = "block";
  container.style.position = "fixed";
  container.style.left = "0";
  container.style.top = "0";
  container.style.width = isLandscape ? "297mm" : "210mm";
  container.style.zIndex = "-9999";
  container.style.background = "white";
  container.style.padding = "0"; // padding is baked into the letterhead-page HTML
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
    container.style.position = originals.position;
    container.style.left = originals.left;
    container.style.top = originals.top;
    container.style.width = originals.width;
    container.style.zIndex = originals.zIndex;
    container.style.background = originals.background;
    container.style.padding = originals.padding;
  }
}

async function saveLetterheadPDF() {
  const pdf = await generateLetterheadPDF("portrait");
  if (pdf) pdf.save("Letterhead.pdf");
}

async function shareLetterheadPDF() {
  const pdf = await generateLetterheadPDF("portrait");
  if (!pdf) return;
  const isMobile =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent,
    );
  if (isMobile && navigator.canShare && navigator.share) {
    try {
      const blob = pdf.output("blob");
      const file = new File([blob], "Letterhead.pdf", {
        type: "application/pdf",
      });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: "Letterhead",
          text: "Letterhead",
        });
        return;
      }
    } catch (err) {
      if (err.name !== "AbortError") console.error("Native share failed:", err);
    }
  }
  pdf.save("Letterhead.pdf");
}