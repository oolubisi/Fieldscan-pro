// reports.js
import { escapeHtml, escapeAttr, moneyValue } from './utils.js';
import { callApi, getCache, setCache } from './api.js';

export async function initReportsConsoleEngine() {
  const projects = await callApi('getProjects', {});
  const cache = getCache();
  cache.projects = projects || [];
  setCache(cache);
  const pSel = document.getElementById('rep-project-sel');
  if (pSel) pSel.innerHTML = '<option value="">-- Select Project --</option>' + cache.projects.map(p => `<option value="${escapeAttr(p.projectId)}">${escapeHtml(p.clientName)} (${p.projectId})</option>`).join('');
  handleReportOptionsPopulation();
}

export function handleReportOptionsPopulation() {
  const tSel = document.getElementById('rep-template-sel');
  if (tSel) tSel.innerHTML = `<option value="">-- Choose Report --</option>
    <option value="inspection_report">Inspection Report</option>
    <option value="payment_summary">Payment Summary</option>
    <option value="master_dossier">Master Dossier</option>`;
}

export async function compileFieldReport() {
  const pId = document.getElementById('rep-project-sel').value;
  const layout = document.getElementById('rep-template-sel').value;
  if (!pId || !layout) { alert("Select project and report type"); return; }
  const cache = getCache();
  const proj = cache.projects.find(p=>p.projectId===pId);
  if (!proj) { alert("Project not found. Try refreshing the page and selecting again."); return; }

  const inspections = (await callApi('getInspections', {})).filter(i=>i.projectId===pId);
  const payments = (await callApi('getPayments', {})).filter(p=>p.projectId===pId);

  let html = `<h2>FieldScan Pro Report</h2><div>Project: ${escapeHtml(proj.clientName)} (${escapeHtml(pId)})</div>`;
  if (layout === 'inspection_report') {
    if (!inspections.length) {
      html += `<h3>Inspections</h3><div>No inspections recorded for this project.</div>`;
    } else {
      html += `<h3>Inspections</h3>${inspections.map(i=>`<div>${escapeHtml(i.inspectionDate)}: ${escapeHtml(i.areaInspected)} - ${escapeHtml(i.siteCondition)}</div>`).join('')}`;
    }
  } else if (layout === 'payment_summary') {
    const totalIn = payments.filter(p=>p.paymentDirection==='Client Receipt').reduce((s,p)=>s+Number(p.amount||0),0);
    const totalOut = payments.filter(p=>p.paymentDirection!=='Client Receipt').reduce((s,p)=>s+Number(p.amount||0),0);
    html += `<h3>Payments</h3><div>Received: ₦${moneyValue(totalIn)}</div><div>Paid Out: ₦${moneyValue(totalOut)}</div><div>Balance: ₦${moneyValue(totalIn-totalOut)}</div>`;
  } else {
    html += `<h3>Master Dossier</h3><div>${inspections.length} inspections, ${payments.length} payments</div>`;
  }
  const preview = document.getElementById('report-preview-viewport');
  if (preview) preview.innerHTML = html;
  const printContainer = document.getElementById('report-print-container');
  if (printContainer) printContainer.innerHTML = html;
  const card = document.getElementById('report-onscreen-preview-card');
  if (card) card.style.display = 'block';
}
