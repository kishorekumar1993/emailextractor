// ═══════════════════════════════════════════════════════════════════════
// Site & PDF Email Detector — Pure & Ultra-Fast UI Controller
// ═══════════════════════════════════════════════════════════════════════

const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const exportBtn = document.getElementById("exportBtn");
const exportJsonBtn = document.getElementById("exportJsonBtn");
const copyBtn = document.getElementById("copyBtn");
const copyPathBtn = document.getElementById("copyPathBtn");
const copyPdfLinksBtn = document.getElementById("copyPdfLinksBtn");
const copyImageLinksBtn = document.getElementById("copyImageLinksBtn");
const copyAllUnifiedBtn = document.getElementById("copyAllUnifiedBtn");
const statusText = document.getElementById("statusText");
const searchInput = document.getElementById("searchInput");

const statPages = document.getElementById("statPages");
const statPdfs = document.getElementById("statPdfs");
const statImages = document.getElementById("statImages");
const statEmails = document.getElementById("statEmails");
const statQueue = document.getElementById("statQueue");

const statCardPages = document.getElementById("statCardPages");
const statCardPdfs = document.getElementById("statCardPdfs");
const statCardImages = document.getElementById("statCardImages");
const statCardEmails = document.getElementById("statCardEmails");

const tabEmailsBtn = document.getElementById("tabEmailsBtn");
const tabPdfsBtn = document.getElementById("tabPdfsBtn");
const tabImagesBtn = document.getElementById("tabImagesBtn");
const tabEmailsCount = document.getElementById("tabEmailsCount");
const tabPdfsCount = document.getElementById("tabPdfsCount");
const tabImagesCount = document.getElementById("tabImagesCount");

const emailsTableContainer = document.getElementById("emailsTableContainer");
const pdfsTableContainer = document.getElementById("pdfsTableContainer");
const imagesTableContainer = document.getElementById("imagesTableContainer");
const resultsBody = document.getElementById("resultsBody");
const pdfsBody = document.getElementById("pdfsBody");
const imagesBody = document.getElementById("imagesBody");

const targetUrlInput = document.getElementById("targetUrlInput");
const pdfUrlInput = document.getElementById("pdfUrlInput");
const scanPdfBtn = document.getElementById("scanPdfBtn");
const detectTabBtn = document.getElementById("detectTabBtn");
const maxPagesSelect = document.getElementById("maxPagesSelect");
const concurrencySelect = document.getElementById("concurrencySelect");
const checkPdfsCheckbox = document.getElementById("checkPdfs");
const ocrImagesCheckbox = document.getElementById("ocrImages");
const filterComplianceCheckbox = document.getElementById("filterCompliance");
const onlyDomainEmailsCheckbox = document.getElementById("onlyDomainEmails");
const includeSubdomainsCheckbox = document.getElementById("includeSubdomains");
const alwaysWindowModeCheckbox = document.getElementById("alwaysWindowMode");

const popoutWindowBtn = document.getElementById("popoutWindowBtn");
const closeWindowBtn = document.getElementById("closeWindowBtn");
const windowModeBadge = document.getElementById("windowModeBadge");

let currentFindings = [];
let currentPdfs = [];
let currentImages = [];
const emailRowsMap = new Map();
const pdfRowsMap = new Map();
const imageRowsMap = new Map();
const pdfOcrJobs = new Map();
let pdfOcrQueue = Promise.resolve();
let activeTab = "emails";
let isCrawling = false;
let statusPollTimer = null;

function setActiveTab(tab) {
  activeTab = tab;
  if (tabEmailsBtn) tabEmailsBtn.classList.toggle("active", tab === "emails");
  if (tabPdfsBtn) tabPdfsBtn.classList.toggle("active", tab === "pdfs");
  if (tabImagesBtn) tabImagesBtn.classList.toggle("active", tab === "images");

  if (emailsTableContainer) emailsTableContainer.style.display = tab === "emails" ? "block" : "none";
  if (pdfsTableContainer) pdfsTableContainer.style.display = tab === "pdfs" ? "block" : "none";
  if (imagesTableContainer) imagesTableContainer.style.display = tab === "images" ? "block" : "none";

  applyCurrentSearchFilter();
}

if (tabEmailsBtn) tabEmailsBtn.addEventListener("click", () => setActiveTab("emails"));
if (tabPdfsBtn) tabPdfsBtn.addEventListener("click", () => setActiveTab("pdfs"));
if (tabImagesBtn) tabImagesBtn.addEventListener("click", () => setActiveTab("images"));

if (statCardEmails) statCardEmails.addEventListener("click", () => setActiveTab("emails"));
if (statCardPdfs) statCardPdfs.addEventListener("click", () => setActiveTab("pdfs"));
if (statCardImages) statCardImages.addEventListener("click", () => setActiveTab("images"));

function startStatusPoll() {
  stopStatusPoll();
  statusPollTimer = setInterval(async () => {
    try {
      const res = await chrome.runtime.sendMessage({ type: "GET_CRAWL_STATUS" });
      if (!res || !res.ok) return;
      if (!res.isCrawling && isCrawling) {
        // Background died, finished silently, or service worker recycled
        isCrawling = false;
        startBtn.style.display = "inline-flex";
        stopBtn.style.display = "none";
        statusText.textContent = res.aborted
          ? "Crawl stopped."
          : `Crawl completed! Extracted ${currentFindings.length} unique emails from ${statPages.textContent} pages, ${currentPdfs.length} PDFs & ${currentImages.length} images.`;
        if (Array.isArray(res.findings)) {
          res.findings.forEach(registerFoundEmail);
        }
        if (Array.isArray(res.discoveredPdfs)) {
          for (const p of res.discoveredPdfs) {
            if (!currentPdfs.some((ex) => ex.url === p.url)) {
              currentPdfs.push(p);
              appendPdfRow(p);
            }
          }
        }
        if (Array.isArray(res.discoveredImages)) {
          for (const img of res.discoveredImages) {
            if (!currentImages.some((ex) => ex.url === img.url)) {
              currentImages.push(img);
              appendImageRow(img);
            }
          }
        }
        updateActionButtons();
        stopStatusPoll();
      }
    } catch {}
  }, 2500);
}

function stopStatusPoll() {
  if (statusPollTimer) {
    clearInterval(statusPollTimer);
    statusPollTimer = null;
  }
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function updateActionButtons() {
  const visibleEmails = typeof getVisibleFindings === "function" ? getVisibleFindings() : currentFindings;
  const hasEmails = visibleEmails.length > 0;
  const hasPdfs = currentPdfs.length > 0;
  const hasImages = currentImages.length > 0;
  const hasAnyData = hasEmails || hasPdfs || hasImages;

  if (copyAllUnifiedBtn) copyAllUnifiedBtn.disabled = !hasAnyData;
  if (copyBtn) copyBtn.disabled = !hasEmails;
  if (copyPathBtn) copyPathBtn.disabled = !hasEmails;
  if (copyPdfLinksBtn) copyPdfLinksBtn.disabled = !hasPdfs;
  if (copyImageLinksBtn) copyImageLinksBtn.disabled = !hasImages;
  if (exportBtn) exportBtn.disabled = !hasAnyData;
  if (exportJsonBtn) exportJsonBtn.disabled = !hasAnyData;

  if (tabEmailsCount) tabEmailsCount.textContent = visibleEmails.length;
  if (tabPdfsCount) tabPdfsCount.textContent = currentPdfs.length;
  if (tabImagesCount) tabImagesCount.textContent = currentImages.length;
  if (statEmails) statEmails.textContent = visibleEmails.length;
  if (statPdfs) statPdfs.textContent = currentPdfs.length;
  if (statImages) statImages.textContent = currentImages.length;

  if (hasAnyData && searchInput) {
    searchInput.style.display = "block";
  }
}

function getCleanTargetDomain() {
  try {
    const rawTarget = targetUrlInput ? targetUrlInput.value.trim() : "";
    if (rawTarget) {
      const u = new URL(rawTarget.startsWith("http") ? rawTarget : "https://" + rawTarget);
      return u.hostname.toLowerCase().replace(/^www\./, "");
    }
  } catch {}
  return "";
}

function isEmailDomainMatch(email) {
  if (!email || !email.includes("@")) return false;
  const targetDomain = getCleanTargetDomain();
  if (!targetDomain) return true;
  const emailDomain = email.split("@")[1].toLowerCase();
  return emailDomain === targetDomain || emailDomain.endsWith("." + targetDomain) || targetDomain.endsWith("." + emailDomain);
}

function getVisibleFindings() {
  if (onlyDomainEmailsCheckbox && onlyDomainEmailsCheckbox.checked) {
    return currentFindings.filter((f) => isEmailDomainMatch(f.copy || f.email));
  }
  return currentFindings;
}

if (onlyDomainEmailsCheckbox) {
  onlyDomainEmailsCheckbox.addEventListener("change", () => {
    applyCurrentSearchFilter();
    updateActionButtons();
  });
}

function appendEmailRow(finding) {
  const normEmail = (finding.copy || finding.email).toLowerCase();
  const existingTr = emailRowsMap.get(normEmail);

  let typeBadgeClass = "type-html";
  const st = (finding.sourceType || "").toLowerCase();
  if (st.includes("pdf")) {
    typeBadgeClass = "type-pdf";
  } else if (st.includes("image")) {
    typeBadgeClass = "type-image";
  } else if (st.includes("mailto")) {
    typeBadgeClass = "type-mailto";
  }

  const occurrences = finding.occurrences || (finding.sources ? finding.sources.length : 1);
  const displayUrl = finding.url || finding.sourceUrl || finding.mainPageUrl || "";

  const isMatch = isEmailDomainMatch(normEmail);
  const domainBadgeHtml = isMatch
    ? `<span class="domain-badge domain-match" title="Direct match with website domain">✓ Domain Match</span>`
    : `<span class="domain-badge domain-external" title="External or ISP email address">ISP / External</span>`;

  const rowHtml = `
    <td><strong>${escapeHtml(normEmail)}</strong>${domainBadgeHtml}</td>
    <td><span class="type-badge ${typeBadgeClass}">${escapeHtml((finding.sourceType || "HTML").toUpperCase())}</span></td>
    <td><a class="source-link" href="${escapeHtml(displayUrl)}" target="_blank" title="${escapeHtml(displayUrl)}">${escapeHtml(displayUrl)}</a></td>
    <td style="text-align: center;"><strong>${occurrences}</strong></td>
  `;

  if (existingTr) {
    existingTr.innerHTML = rowHtml;
  } else {
    // If first row, clear empty-state placeholder
    if (emailRowsMap.size === 0) {
      resultsBody.innerHTML = "";
    }
    const tr = document.createElement("tr");
    tr.id = "email-" + normEmail.replace(/[^a-z0-9_-]/g, "_");
    tr.innerHTML = rowHtml;
    emailRowsMap.set(normEmail, tr);
    resultsBody.appendChild(tr);
  }
}

function registerFoundEmail(finding) {
  if (!finding || !finding.email) return;
  const isStrict = filterComplianceCheckbox ? filterComplianceCheckbox.checked : true;
  if (!isPopupValidEmail(finding.email, isStrict)) return;

  const normEmail = finding.email.toLowerCase();
  const idx = currentFindings.findIndex((f) => f.email.toLowerCase() === normEmail);

  if (idx !== -1) {
    const existing = currentFindings[idx];
    existing.occurrences = (existing.occurrences || 1) + 1;
    if (finding.sources && Array.isArray(finding.sources)) {
      existing.sources = finding.sources;
    }
  } else {
    currentFindings.push(finding);
  }

  applyCurrentSearchFilter();
  statEmails.textContent = getVisibleFindings().length;
  updateActionButtons();
}

function renderEmailRows(items) {
  resultsBody.innerHTML = "";
  emailRowsMap.clear();

  const visibleItems = onlyDomainEmailsCheckbox && onlyDomainEmailsCheckbox.checked
    ? items.filter((f) => isEmailDomainMatch(f.copy || f.email))
    : items;

  if (visibleItems.length === 0) {
    resultsBody.innerHTML = `<tr><td colspan="4" class="empty-state">${currentFindings.length > 0 ? "No emails matching current domain filter or search query." : "No emails extracted yet. Click 'Crawl Website' to start."}</td></tr>`;
    return;
  }

  for (const item of visibleItems) {
    appendEmailRow(item);
  }
}

function appendPdfRow(pdfItem) {
  if (!pdfItem || !pdfItem.url || !pdfsBody) return;
  const url = pdfItem.url;
  const fileName = url.split("/").pop().split("?")[0] || url;
  const sourcePage = pdfItem.sourcePage || "";
  const existingTr = pdfRowsMap.get(url);

  const hasEmail = (pdfItem.emailsFound || 0) > 0;
  const statusStr = pdfItem.status || (hasEmail ? `Scanned (${pdfItem.emailsFound} emails)` : "Queued");
  const badgeClass = hasEmail ? "status-badge has-email" : "status-badge";

  const rowHtml = `
    <td><a class="source-link" href="${escapeHtml(url)}" target="_blank" title="${escapeHtml(url)}">📄 <strong>${escapeHtml(fileName)}</strong></a></td>
    <td><a class="source-link" href="${escapeHtml(sourcePage)}" target="_blank" title="${escapeHtml(sourcePage)}">${escapeHtml(sourcePage)}</a></td>
    <td><span class="${badgeClass}">${escapeHtml(statusStr)}</span></td>
    <td style="text-align: center;">
      <a class="btn-sm-action" href="${escapeHtml(url)}" download="${escapeHtml(fileName)}" target="_blank">📥 Download</a>
      <button class="btn-sm-action pdf-rescan-btn" type="button" data-pdf-url="${escapeHtml(url)}">🔍 OCR</button>
    </td>
  `;

  if (existingTr) {
    existingTr.innerHTML = rowHtml;
  } else {
    if (pdfRowsMap.size === 0) {
      pdfsBody.innerHTML = "";
    }
    const tr = document.createElement("tr");
    tr.innerHTML = rowHtml;
    pdfRowsMap.set(url, tr);
    pdfsBody.appendChild(tr);
  }
}

function renderPdfRows(items) {
  if (!pdfsBody) return;
  pdfsBody.innerHTML = "";
  pdfRowsMap.clear();
  if (items.length === 0) {
    pdfsBody.innerHTML = `<tr><td colspan="4" class="empty-state">${currentPdfs.length > 0 ? "No PDF documents matching search." : "No PDF documents discovered yet."}</td></tr>`;
    return;
  }
  for (const item of items) {
    appendPdfRow(item);
  }
}

async function scanPdfPageImages(pdfUrl, pdfRecord) {
  if (!globalThis.pdfjsLib || !globalThis.Tesseract) {
    throw new Error("The local PDF/OCR libraries did not load. Reload the extension and try again.");
  }
  const strict = filterComplianceCheckbox ? filterComplianceCheckbox.checked : true;

  const response = await fetch(pdfUrl, { credentials: "omit" });
  if (!response.ok) throw new Error(`PDF download failed (HTTP ${response.status}).`);
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength < 50) throw new Error("The response is too small to be a valid PDF.");
  if (buffer.byteLength > 25 * 1024 * 1024) throw new Error("The PDF exceeds the 25 MB scan limit.");

  pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("lib/pdf.worker.min.js");
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    disableWorker: true,
    disableAutoFetch: true,
    disableRange: true,
    disableStream: true,
    isEvalSupported: false,
    useSystemFonts: true,
    stopAtErrors: false
  });
  let pdf;
  let worker;
  let pagesFailed = 0;
  let ocrUnavailable = false;
  const emails = new Set();
  try {
    pdf = await loadingTask.promise;
    const pagesToScan = Math.min(pdf.numPages, 50);
    const pagesNeedingOcr = [];
    for (let pageNumber = 1; pageNumber <= pagesToScan; pageNumber++) {
      let page;
      try {
        page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        const pageText = (content.items || [])
          .filter((item) => typeof item.str === "string")
          .map((item) => item.str)
          .join(" ");
        const pageEmails = normalizeAndExtractEmails(pageText, strict);
        for (const email of pageEmails) emails.add(email);
        if (pageEmails.length === 0) pagesNeedingOcr.push(pageNumber);
      } catch (error) {
        pagesFailed++;
        console.debug(`PDF text extraction failed on page ${pageNumber}:`, error);
      } finally {
        if (page) page.cleanup();
      }
    }

    if (pagesNeedingOcr.length > 0) {
      try {
        worker = await Tesseract.createWorker("eng", 1, {
          workerPath: chrome.runtime.getURL("lib/worker.min.js"),
          corePath: chrome.runtime.getURL("lib/tesseract-core-simd-lstm.wasm.js"),
          langPath: chrome.runtime.getURL("lib"),
          gzip: false
        });
        if (worker.load) await worker.load();
        if (worker.loadLanguage) await worker.loadLanguage("eng");
        if (worker.initialize) await worker.initialize("eng");
      } catch (error) {
        pagesFailed += pagesNeedingOcr.length;
        ocrUnavailable = true;
        console.debug("Could not initialize the local PDF OCR worker:", error);
        if (worker && worker.terminate) await worker.terminate();
        worker = null;
      }
    }

    if (worker) {
      for (const pageNumber of pagesNeedingOcr) {
        let page;
        let canvas;
        try {
          page = await pdf.getPage(pageNumber);
          const viewport = page.getViewport({ scale: 1.75 });
          canvas = document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const context = canvas.getContext("2d", { willReadFrequently: true });
          if (!context) throw new Error("Could not create a canvas for OCR.");
          await page.render({ canvasContext: context, viewport }).promise;
          const result = await worker.recognize(canvas);
          for (const email of normalizeAndExtractEmails(result.data && result.data.text, strict)) {
            emails.add(email);
          }
        } catch (error) {
          pagesFailed++;
          console.debug(`PDF OCR could not scan page ${pageNumber}:`, error);
        } finally {
          if (canvas) {
            canvas.width = 0;
            canvas.height = 0;
          }
          if (page) page.cleanup();
        }
        statusText.textContent = `Scanning PDF page ${pageNumber}/${pagesToScan} with text extraction and OCR...`;
      }
    }

    const validEmails = Array.from(emails).filter((email) => isPopupValidEmail(email, strict));
    const found = validEmails;
    const targetDomain = getCleanTargetDomain();
    const hiddenByDomainFilter = onlyDomainEmailsCheckbox && onlyDomainEmailsCheckbox.checked && targetDomain
      ? validEmails.filter((email) => !isEmailDomainMatch(email)).length
      : 0;

    for (const email of found) {
      registerFoundEmail({
        copy: email,
        email,
        url: pdfUrl,
        pdf: pdfUrl,
        sourceType: "pdf",
        sourceUrl: pdfUrl,
        mainPageUrl: pdfUrl,
        occurrences: 1,
        sources: [{
          sourceType: "pdf",
          sourceUrl: pdfUrl,
          mainPageUrl: pdfUrl,
          pdf: pdfUrl,
          timestamp: new Date().toISOString()
        }]
      });
    }

    const pageNote = pagesToScan < pdf.numPages ? `; scanned ${pagesToScan}/${pdf.numPages} pages` : "";
    const failureNote = pagesFailed ? `; ${pagesFailed} pages failed` : "";
    const domainNote = hiddenByDomainFilter ? `; domain filter hides ${hiddenByDomainFilter}` : "";
    const ocrNote = ocrUnavailable ? "; OCR unavailable" : "";
    pdfRecord.status = `Text/OCR scanned (${found.length} emails${domainNote}${pageNote}${failureNote}${ocrNote})`;
    pdfRecord.emailsFound = found.length;
    appendPdfRow(pdfRecord);
    updateActionButtons();
    return { emails: found, pagesToScan, totalPages: pdf.numPages, pagesFailed };
  } finally {
    if (worker) await worker.terminate();
    if (pdf) await pdf.destroy();
    else if (loadingTask.destroy) await loadingTask.destroy();
  }
}

function runPdfOcr(pdfUrl, pdfRecord) {
  const existingJob = pdfOcrJobs.get(pdfUrl);
  if (existingJob) return existingJob;
  const job = pdfOcrQueue.then(() => scanPdfPageImages(pdfUrl, pdfRecord)).finally(() => {
    pdfOcrJobs.delete(pdfUrl);
  });
  pdfOcrJobs.set(pdfUrl, job);
  pdfOcrQueue = job.catch(() => {});
  return job;
}

function appendImageRow(imageItem) {
  if (!imageItem || !imageItem.url || !imagesBody) return;
  const url = imageItem.url;
  const fileName = url.split("/").pop().split("?")[0] || url;
  const sourcePage = imageItem.sourcePage || "";
  const altOrTitle = imageItem.altText || imageItem.titleText || "Image Asset";
  const existingTr = imageRowsMap.get(url);

  const rowHtml = `
    <td><a class="source-link" href="${escapeHtml(url)}" target="_blank" title="${escapeHtml(url)}">🖼️ <strong>${escapeHtml(fileName)}</strong></a></td>
    <td><a class="source-link" href="${escapeHtml(sourcePage)}" target="_blank" title="${escapeHtml(sourcePage)}">${escapeHtml(sourcePage)}</a></td>
    <td><span title="${escapeHtml(altOrTitle)}">${escapeHtml(altOrTitle.slice(0, 50))}</span></td>
    <td style="text-align: center;"><a class="btn-sm-action" href="${escapeHtml(url)}" target="_blank">🔍 Open</a></td>
  `;

  if (existingTr) {
    existingTr.innerHTML = rowHtml;
  } else {
    if (imageRowsMap.size === 0) {
      imagesBody.innerHTML = "";
    }
    const tr = document.createElement("tr");
    tr.innerHTML = rowHtml;
    imageRowsMap.set(url, tr);
    imagesBody.appendChild(tr);
  }
}

function renderImageRows(items) {
  if (!imagesBody) return;
  imagesBody.innerHTML = "";
  imageRowsMap.clear();
  if (items.length === 0) {
    imagesBody.innerHTML = `<tr><td colspan="4" class="empty-state">${currentImages.length > 0 ? "No images matching search." : "No images discovered yet."}</td></tr>`;
    return;
  }
  for (const item of items) {
    appendImageRow(item);
  }
}

// Live search filter across active tab
function applyCurrentSearchFilter() {
  const q = searchInput ? searchInput.value.trim().toLowerCase() : "";
  if (!q) {
    if (activeTab === "emails") renderEmailRows(currentFindings);
    else if (activeTab === "pdfs") renderPdfRows(currentPdfs);
    else if (activeTab === "images") renderImageRows(currentImages);
    return;
  }

  if (activeTab === "emails") {
    const baseList = getVisibleFindings();
    if (!q) {
      renderEmailRows(baseList);
      return;
    }
    const filtered = baseList.filter(
      (f) =>
        f.email.toLowerCase().includes(q) ||
        (f.sourceUrl && f.sourceUrl.toLowerCase().includes(q)) ||
        (f.sourceType && f.sourceType.toLowerCase().includes(q))
    );
    renderEmailRows(filtered);
  } else if (activeTab === "pdfs") {
    const filtered = currentPdfs.filter(
      (p) =>
        p.url.toLowerCase().includes(q) ||
        (p.sourcePage && p.sourcePage.toLowerCase().includes(q)) ||
        (p.status && p.status.toLowerCase().includes(q))
    );
    renderPdfRows(filtered);
  } else if (activeTab === "images") {
    const filtered = currentImages.filter(
      (img) =>
        img.url.toLowerCase().includes(q) ||
        (img.sourcePage && img.sourcePage.toLowerCase().includes(q)) ||
        (img.altText && img.altText.toLowerCase().includes(q)) ||
        (img.titleText && img.titleText.toLowerCase().includes(q))
    );
    renderImageRows(filtered);
  }
}

if (searchInput) {
  searchInput.addEventListener("input", applyCurrentSearchFilter);
}

// Detect active browser tab (excludes extension popup windows)
async function detectActiveTab() {
  try {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tabs && tabs[0] && tabs[0].url && !tabs[0].url.startsWith("chrome-extension://")) {
      return tabs[0];
    }
    const allTabs = await chrome.tabs.query({ active: true });
    const webTab = allTabs.find((t) => t.url && (t.url.startsWith("http://") || t.url.startsWith("https://")));
    return webTab || (tabs && tabs[0] ? tabs[0] : null);
  } catch {
    return null;
  }
}

async function detectActiveTabUrl() {
  const tab = await detectActiveTab();
  return tab && tab.url ? tab.url : "";
}

// ── Tesseract OCR Engine & Image Extraction ──────────────────────────
const POPUP_DUMMY_DOMAINS = new Set([
  "email.com", "email.co.uk", "example.com", "example.org", "example.net", "example.co.uk",
  "domain.com", "domain.co.uk", "sample.com", "sample.co.uk", "test.com", "test.co.uk", "testing.com",
  "yourdomain.com", "yourcompany.com", "yoursite.com", "mycompany.com", "company.com", "site.com",
  "website.com", "somedomain.com", "sentry.io", "wixpress.com", "wordpress.com", "cookiebot.com",
  "onetrust.com", "cloudflare.com", "gravatar.com"
]);

const POPUP_DUMMY_LOCAL_PREFIXES = new Set([
  "name", "yourname", "your-name", "your.name", "your_name", "your", "youremail", "your-email", "your.email",
  "someone", "placeholder", "sample", "test", "testing", "first.last", "fullname"
]);

const POPUP_COMPLIANCE_LOCAL_REGEX = /^(?:gdpr|dpo|dpo_.*|groupdpo|nomarketing|no-marketing|unsubscribe|optout|opt-out|noreply|no-reply|donotreply|do-not-reply|mailer-daemon|auto-reply|dataprotection|data-protection|cookie|cookies|abuse|postmaster|webmaster|hostmaster)$/i;

function isPopupValidEmail(email, filterCompliance = true) {
  if (!email || typeof email !== "string") return false;
  const clean = email.trim().toLowerCase();
  if (clean.length < 5 || clean.length > 254) return false;
  const parts = clean.split("@");
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  if (!local || local.length < 1 || !domain || !domain.includes(".")) return false;

  // Domain cannot start with www. or protocol prefix
  if (domain.startsWith("www.") || domain.startsWith("http.") || domain.startsWith("https.") || domain.startsWith("ftp.")) {
    return false;
  }

  // Reject dummy domains
  if (POPUP_DUMMY_DOMAINS.has(domain)) return false;

  // Reject dummy local parts on generic domains
  if (POPUP_DUMMY_LOCAL_PREFIXES.has(local)) return false;

  // Reject compliance / GDPR / DPO / unsubscribe emails
  if (filterCompliance && POPUP_COMPLIANCE_LOCAL_REGEX.test(local)) return false;

  const tld = domain.split(".").pop();
  if (!(tld.startsWith("xn--") && tld.length >= 5) && !/^[a-z]{2,63}$/.test(tld)) return false;
  return true;
}

function normalizeAndExtractEmails(rawText, filterCompliance = true) {
  if (!rawText || typeof rawText !== "string") return [];
  const MAX = 1_200_000; // 1.2 MB hard cap prevents UI freeze on huge blobs
  if (rawText.length > MAX) rawText = rawText.slice(0, MAX);
  const found = new Set();

  let deobf = rawText
    .replace(/[©®]/g, "@")
    .replace(/\s*(?:\[at\]|\(at\)|\{at\}|\[AT\]|\(AT\)|_at_|\/\*at\*\/)\s*/g, "@")
    .replace(/\s*(?:\[dot\]|\(dot\)|\{dot\}|\[DOT\]|\(DOT\)|_dot_|\/\*dot\*\/)\s*/g, ".")
    .replace(/\b([a-zA-Z0-9._%+-]{2,30})\s+(?:AT)\s+([a-zA-Z0-9.-]+\.[a-zA-Z0-9-]{2,63})\b/g, "$1@$2")
    .replace(/\b([a-zA-Z0-9-]+)\s+(?:DOT)\s+([a-zA-Z0-9-]{2,63})\b/g, "$1.$2")
    .replace(/\b([a-zA-Z0-9_%+-]{1,40})\s*@\s*([a-zA-Z0-9-]{1,40})\s*\.\s*([a-zA-Z0-9-]{2,63})\b/g, "$1@$2.$3")
    .replace(/\b([a-zA-Z0-9_%+-]{1,30})\s*\.\s*([a-zA-Z0-9_%+-]{1,30})\s*@\s*([a-zA-Z0-9-]{1,40})\s*\.\s*([a-zA-Z0-9-]{2,63})\b/g, "$1.$2@$3.$4")
    .replace(/@([a-zA-Z0-9-]+),([a-zA-Z]{2,10})/g, "@$1.$2");

  const regex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z0-9-]{2,63}/g;
  const matches = deobf.match(regex) || [];
  for (let m of matches) {
    m = m.toLowerCase().replace(/^[<(\["']+|[>)\]"',;:.!]+$/g, "");
    if (isPopupValidEmail(m, filterCompliance)) {
      found.add(m);
    }
  }
  return Array.from(found);
}

const processedImages = new Set();

function enqueueImageOcr(task) {
  if (!task || !task.imageUrl || processedImages.has(task.imageUrl)) return;
  processedImages.add(task.imageUrl);
  if (statImages) statImages.textContent = processedImages.size;

  // Instant native extraction from image URL, alt, and title metadata
  const combined = `${task.imageUrl} ${task.altText || ""} ${task.titleText || ""}`;
  const isStrict = filterComplianceCheckbox ? filterComplianceCheckbox.checked : true;
  const found = normalizeAndExtractEmails(combined, isStrict);
  for (const em of found) {
    const item = {
      copy: em.toLowerCase().trim(),
      email: em.toLowerCase().trim(),
      url: task.mainPageUrl,
      pdf: null,
      image: task.imageUrl,
      sourceType: "image",
      sourceUrl: task.imageUrl,
      mainPageUrl: task.mainPageUrl,
      occurrences: 1,
      sources: [{
        sourceType: "image",
        sourceUrl: task.imageUrl,
        mainPageUrl: task.mainPageUrl,
        image: task.imageUrl,
        pdf: null,
        timestamp: new Date().toISOString()
      }]
    };
    registerFoundEmail(item);
  }
}

// ── Message Listener ─────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "EMAIL_FOUND" && msg.finding) {
    registerFoundEmail(msg.finding);
  }

  if (msg.type === "PDF_DISCOVERED" && msg.pdf) {
    if (!currentPdfs.some((p) => p.url === msg.pdf.url)) {
      currentPdfs.push(msg.pdf);
      appendPdfRow(msg.pdf);
      updateActionButtons();
    }
  }

  if (msg.type === "UPDATE_PDF_STATUS" && msg.url) {
    const p = currentPdfs.find((item) => item.url === msg.url);
    if (p) {
      p.status = msg.status || p.status;
      p.emailsFound = msg.emailsFound !== undefined ? msg.emailsFound : p.emailsFound;
      appendPdfRow(p);
      if (p.emailsFound === 0 && (/^Scanned \(0 emails/i.test(p.status) || /^Failed:/i.test(p.status))) {
        runPdfOcr(p.url, p).then((result) => {
          statusText.textContent = `PDF text/OCR scan completed. Found ${result.emails.length} email${result.emails.length === 1 ? "" : "s"}.`;
        }).catch((error) => {
          p.status = `OCR failed: ${error.message || "Unable to scan PDF."}`;
          appendPdfRow(p);
          statusText.textContent = p.status;
        });
      }
    }
  }

  if (msg.type === "IMAGE_DISCOVERED" && msg.image) {
    if (!currentImages.some((img) => img.url === msg.image.url)) {
      currentImages.push(msg.image);
      appendImageRow(msg.image);
      updateActionButtons();
    }
  }

  if (msg.type === "UPDATE_IMAGE_STATUS" && msg.url) {
    const img = currentImages.find((item) => item.url === msg.url);
    if (img) {
      img.status = msg.status || img.status;
      appendImageRow(img);
    }
  }

  if (msg.type === "PROCESS_IMAGE_OCR") {
    enqueueImageOcr(msg);
  }

  if (msg.type === "CRAWL_PROGRESS") {
    requestAnimationFrame(() => {
      if (msg.pagesCrawled !== undefined) statPages.textContent = msg.pagesCrawled;
      if (msg.pdfsCrawled !== undefined) statPdfs.textContent = msg.pdfsCrawled;
      if (msg.findingsCount !== undefined) statEmails.textContent = getVisibleFindings().length;
      if (msg.queueRemaining !== undefined) statQueue.textContent = msg.queueRemaining;
      if (msg.currentUrl) {
        statusText.textContent = `Reviewing: ${msg.currentUrl}`;
      }
    });
  }

  if (msg.type === "CRAWL_COMPLETED") {
    isCrawling = false;
    stopStatusPoll();
    startBtn.style.display = "inline-flex";
    stopBtn.style.display = "none";
    const d = msg.data || {};
    if (d.findings) {
      for (const f of d.findings) registerFoundEmail(f);
    }
    if (Array.isArray(d.discoveredPdfs)) {
      for (const p of d.discoveredPdfs) {
        if (!currentPdfs.some((ex) => ex.url === p.url)) {
          currentPdfs.push(p);
          appendPdfRow(p);
        }
      }
    }
    if (Array.isArray(d.discoveredImages)) {
      for (const img of d.discoveredImages) {
        if (!currentImages.some((ex) => ex.url === img.url)) {
          currentImages.push(img);
          appendImageRow(img);
        }
      }
    }
    statusText.textContent = `Completed! Extracted ${currentFindings.length} unique emails from ${statPages.textContent} pages, ${currentPdfs.length} PDFs & ${currentImages.length} images.`;
    updateActionButtons();
  }

  if (msg.type === "CRAWL_FAILED") {
    isCrawling = false;
    stopStatusPoll();
    startBtn.style.display = "inline-flex";
    stopBtn.style.display = "none";
    statusText.textContent = `Failed: ${msg.error || "Crawl Error"}`;
  }
});

if (pdfsBody) {
  pdfsBody.addEventListener("click", async (event) => {
    const button = event.target instanceof Element ? event.target.closest(".pdf-rescan-btn") : null;
    if (!button) return;
    const pdfUrl = button.dataset.pdfUrl;
    const pdfRecord = currentPdfs.find((item) => item.url === pdfUrl);
    if (!pdfRecord) return;

    button.disabled = true;
    pdfRecord.status = "OCR scanning...";
    appendPdfRow(pdfRecord);
    try {
      const result = await runPdfOcr(pdfUrl, pdfRecord);
      statusText.textContent = `PDF OCR scan completed. Found ${result.emails.length} email${result.emails.length === 1 ? "" : "s"}.`;
    } catch (error) {
      pdfRecord.status = `OCR failed: ${error.message || "Unable to scan PDF."}`;
      appendPdfRow(pdfRecord);
      statusText.textContent = pdfRecord.status;
    } finally {
      const row = pdfRowsMap.get(pdfUrl);
      const nextButton = row && row.querySelector(".pdf-rescan-btn");
      if (nextButton) nextButton.disabled = false;
    }
  });
}

// ── Direct PDF Link Scan ─────────────────────────────────────────────
if (scanPdfBtn) {
  scanPdfBtn.addEventListener("click", async () => {
    let pdfUrl;
    try {
      const parsedUrl = new URL(pdfUrlInput.value.trim());
      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        throw new Error("Enter a PDF link that starts with http:// or https://.");
      }
      pdfUrl = parsedUrl.toString();
    } catch (error) {
      statusText.textContent = error.message || "Enter a valid PDF link.";
      return;
    }

    scanPdfBtn.disabled = true;
    statusText.textContent = "Downloading and scanning the PDF link...";
    try {
      const response = await chrome.runtime.sendMessage({
        type: "SCAN_PDF_LINK",
        url: pdfUrl,
        filterCompliance: filterComplianceCheckbox ? filterComplianceCheckbox.checked : true,
        onlyDomainEmails: !!(onlyDomainEmailsCheckbox && onlyDomainEmailsCheckbox.checked),
        targetDomain: getCleanTargetDomain()
      });
      if (!response || !response.ok) {
        let pdfRecord = currentPdfs.find((item) => item.url === pdfUrl);
        if (!pdfRecord) {
          pdfRecord = {
            url: pdfUrl,
            sourcePage: "Direct PDF link",
            status: `Background scan failed: ${(response && response.error) || "No response from the scanner."}`,
            emailsFound: 0,
            timestamp: new Date().toISOString()
          };
          currentPdfs.push(pdfRecord);
        }
        appendPdfRow(pdfRecord);
        setActiveTab("pdfs");
        const ocrResult = await runPdfOcr(pdfUrl, pdfRecord);
        statusText.textContent = `PDF text/OCR scan completed. Found ${ocrResult.emails.length} email${ocrResult.emails.length === 1 ? "" : "s"}.`;
        updateActionButtons();
        return;
      }

      if (response.pdf) {
        const existingPdf = currentPdfs.find((item) => item.url === response.pdf.url);
        if (existingPdf) {
          Object.assign(existingPdf, response.pdf);
          appendPdfRow(existingPdf);
        } else {
          currentPdfs.push(response.pdf);
          appendPdfRow(response.pdf);
        }
      }
      for (const finding of response.findings || []) registerFoundEmail(finding);
      setActiveTab("pdfs");
      if ((response.findings || []).length === 0 && response.pdf) {
        const pdfRecord = currentPdfs.find((item) => item.url === response.pdf.url);
        const ocrResult = await runPdfOcr(response.pdf.url, pdfRecord);
        statusText.textContent = `PDF text/OCR scan completed. Found ${ocrResult.emails.length} email${ocrResult.emails.length === 1 ? "" : "s"}.`;
      } else {
        statusText.textContent = `PDF scan completed. Found ${(response.findings || []).length} email${(response.findings || []).length === 1 ? "" : "s"}.`;
      }
      updateActionButtons();
    } catch (error) {
      statusText.textContent = `PDF scan failed: ${error.message || "Unable to contact the scanner."}`;
    } finally {
      scanPdfBtn.disabled = false;
    }
  });
}

// ── Start Crawl Handler ──────────────────────────────────────────────
startBtn.addEventListener("click", async () => {
  let targetUrl = targetUrlInput ? targetUrlInput.value.trim() : "";
  if (!targetUrl || targetUrl.startsWith("chrome-extension://")) {
    const activeTabObj = await detectActiveTab();
    if (activeTabObj && activeTabObj.url && (activeTabObj.url.startsWith("http://") || activeTabObj.url.startsWith("https://"))) {
      targetUrl = activeTabObj.url;
      if (targetUrlInput) targetUrlInput.value = targetUrl;
    }
  }

  if (!targetUrl || (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://"))) {
    statusText.textContent = "Please enter or navigate to a valid http/https webpage first.";
    return;
  }

  currentFindings = [];
  currentPdfs = [];
  currentImages = [];
  emailRowsMap.clear();
  pdfRowsMap.clear();
  imageRowsMap.clear();
  processedImages.clear();

  resultsBody.innerHTML = `<tr><td colspan="4" class="empty-state">Starting email crawl...</td></tr>`;
  if (pdfsBody) pdfsBody.innerHTML = `<tr><td colspan="4" class="empty-state">Searching for PDF documents...</td></tr>`;
  if (imagesBody) imagesBody.innerHTML = `<tr><td colspan="4" class="empty-state">Searching for website images...</td></tr>`;

  statPages.textContent = "0";
  statPdfs.textContent = "0";
  if (statImages) statImages.textContent = "0";
  statEmails.textContent = "0";
  statQueue.textContent = "1";
  if (tabEmailsCount) tabEmailsCount.textContent = "0";
  if (tabPdfsCount) tabPdfsCount.textContent = "0";
  if (tabImagesCount) tabImagesCount.textContent = "0";
  if (ocrStatus) ocrStatus.style.display = "none";
  searchInput.value = "";
  searchInput.style.display = "none";
  exportBtn.disabled = true;
  if (exportJsonBtn) exportJsonBtn.disabled = true;
  copyBtn.disabled = true;
  copyPathBtn.disabled = true;
  if (copyPdfLinksBtn) copyPdfLinksBtn.disabled = true;
  if (copyImageLinksBtn) copyImageLinksBtn.disabled = true;
  if (copyAllUnifiedBtn) copyAllUnifiedBtn.disabled = true;

  startBtn.style.display = "none";
  stopBtn.style.display = "inline-flex";
  isCrawling = true;
  startStatusPoll();
  statusText.textContent = "Connecting to website and crawling pages...";

  let initialFindings = [];
  let initialLinks = [];
  try {
    const activeTab = await detectActiveTab();
    if (activeTab && activeTab.id && activeTab.url && (activeTab.url.startsWith("http://") || activeTab.url.startsWith("https://"))) {
      const execRes = await chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        func: () => {
          const links = Array.from(document.querySelectorAll("a[href], [data-href], [data-url], iframe[src], embed[src]"))
            .map((el) => el.getAttribute("href") || el.getAttribute("data-href") || el.getAttribute("data-url") || el.getAttribute("src"))
            .filter(Boolean);
          const pageHtml = document.documentElement ? document.documentElement.outerHTML : document.body.innerHTML;
          return { links, pageHtml };
        }
      });

      if (execRes && execRes[0] && execRes[0].result) {
        initialLinks = execRes[0].result.links || [];
        const isStrict = filterComplianceCheckbox ? filterComplianceCheckbox.checked : true;
        const domEmails = normalizeAndExtractEmails(execRes[0].result.pageHtml || "", isStrict);
        for (const em of domEmails) {
          const item = {
            email: em,
            sourceType: "HTML (Live Tab)",
            sourceUrl: activeTab.url,
            mainPageUrl: activeTab.url,
            occurrences: 1,
            sources: [{ sourceType: "HTML (Live Tab)", sourceUrl: activeTab.url, mainPageUrl: activeTab.url, timestamp: new Date().toISOString() }]
          };
          initialFindings.push(item);
          registerFoundEmail(item);
        }
      }
    }
  } catch (tabErr) {
    console.debug("Active tab live DOM harvest skipped:", tabErr);
  }

  chrome.runtime.sendMessage(
    {
      type: "START_CRAWL",
      startUrl: targetUrl,
      maxPages: parseInt(maxPagesSelect.value, 10),
      concurrency: parseInt(concurrencySelect.value, 10),
      checkPdfs: checkPdfsCheckbox.checked,
      ocrImages: !!(ocrImagesCheckbox && ocrImagesCheckbox.checked),
      filterCompliance: filterComplianceCheckbox ? filterComplianceCheckbox.checked : true,
      onlyDomainEmails: !!(onlyDomainEmailsCheckbox && onlyDomainEmailsCheckbox.checked),
      includeSubdomains: includeSubdomainsCheckbox.checked,
      initialFindings,
      initialLinks
    },
    (response) => {
      if (chrome.runtime.lastError) {
        isCrawling = false;
        stopStatusPoll();
        startBtn.style.display = "inline-flex";
        stopBtn.style.display = "none";
        statusText.textContent = `Error: ${chrome.runtime.lastError.message}`;
        return;
      }

      if (!response || !response.ok) {
        isCrawling = false;
        stopStatusPoll();
        startBtn.style.display = "inline-flex";
        stopBtn.style.display = "none";
        statusText.textContent = "Failed to initiate crawl process.";
      }
    }
  );
});

// ── Stop Crawl Handler ───────────────────────────────────────────────
stopBtn.addEventListener("click", () => {
  isCrawling = false;
  stopStatusPoll();
  if (ocrStatus) ocrStatus.style.display = "none";
  startBtn.style.display = "inline-flex";
  stopBtn.style.display = "none";
  statusText.textContent = "Crawl stopped by user.";

  chrome.runtime.sendMessage({ type: "STOP_CRAWL" }).catch(() => {});
});

// ── Copy All (Emails + PDFs + Images) Unified ────────────────────────
if (copyAllUnifiedBtn) {
  copyAllUnifiedBtn.addEventListener("click", () => {
    const sections = [];
    const visibleEmails = getVisibleFindings();

    if (visibleEmails.length > 0) {
      sections.push(`=======================================================`);
      sections.push(`EXTRACTED EMAIL ADDRESSES (${visibleEmails.length})`);
      sections.push(`=======================================================`);
      for (const f of visibleEmails) {
        sections.push(`${f.email}\t[${(f.sourceType || "HTML").toUpperCase()}]\tFound On: ${f.sourceUrl || f.mainPageUrl || ""}`);
      }
      sections.push("");
    }

    if (currentPdfs.length > 0) {
      sections.push(`=======================================================`);
      sections.push(`DISCOVERED PDF DOCUMENTS (${currentPdfs.length})`);
      sections.push(`=======================================================`);
      for (const p of currentPdfs) {
        sections.push(`${p.url}\t[${p.status || "Discovered"}]\tFound On: ${p.sourcePage || ""}`);
      }
      sections.push("");
    }

    if (currentImages.length > 0) {
      sections.push(`=======================================================`);
      sections.push(`DISCOVERED IMAGES (${currentImages.length})`);
      sections.push(`=======================================================`);
      for (const img of currentImages) {
        sections.push(`${img.url}\t[${img.altText || img.titleText || "Image"}]\tFound On: ${img.sourcePage || ""}`);
      }
      sections.push("");
    }

    if (sections.length === 0) return;

    navigator.clipboard.writeText(sections.join("\n")).then(() => {
      const orig = copyAllUnifiedBtn.textContent;
      copyAllUnifiedBtn.textContent = "✅ Copied All Items!";
      setTimeout(() => { copyAllUnifiedBtn.textContent = orig; }, 1600);
    });
  });
}

// ── Copy Emails ──────────────────────────────────────────────────────
copyBtn.addEventListener("click", () => {
  const visibleEmails = getVisibleFindings();
  if (visibleEmails.length === 0) return;
  const uniqueEmails = Array.from(new Set(visibleEmails.map((f) => f.email))).join("\n");
  navigator.clipboard.writeText(uniqueEmails).then(() => {
    const orig = copyBtn.textContent;
    copyBtn.textContent = "✅ Copied!";
    setTimeout(() => { copyBtn.textContent = orig; }, 1500);
  });
});

// ── Copy with Source Page ────────────────────────────────────────────
copyPathBtn.addEventListener("click", () => {
  const visibleEmails = getVisibleFindings();
  if (visibleEmails.length === 0) return;
  const lines = ["email\tsource_type\tfound_on_page"];
  for (const f of visibleEmails) {
    lines.push(`${f.email}\t${f.sourceType || "HTML"}\t${f.sourceUrl || f.mainPageUrl || ""}`);
  }
  navigator.clipboard.writeText(lines.join("\n")).then(() => {
    const orig = copyPathBtn.textContent;
    copyPathBtn.textContent = "✅ Copied with Path!";
    setTimeout(() => { copyPathBtn.textContent = orig; }, 1500);
  });
});

// ── Copy PDF Links ───────────────────────────────────────────────────
if (copyPdfLinksBtn) {
  copyPdfLinksBtn.addEventListener("click", () => {
    if (currentPdfs.length === 0) return;
    const lines = ["pdf_url\tfound_on_page\tstatus\temails_found"];
    for (const p of currentPdfs) {
      lines.push(`${p.url}\t${p.sourcePage || ""}\t${p.status || "Discovered"}\t${p.emailsFound || 0}`);
    }
    navigator.clipboard.writeText(lines.join("\n")).then(() => {
      const orig = copyPdfLinksBtn.textContent;
      copyPdfLinksBtn.textContent = "✅ Copied PDF Links!";
      setTimeout(() => { copyPdfLinksBtn.textContent = orig; }, 1500);
    });
  });
}

// ── Copy Image Links ─────────────────────────────────────────────────
if (copyImageLinksBtn) {
  copyImageLinksBtn.addEventListener("click", () => {
    if (currentImages.length === 0) return;
    const lines = ["image_url\tfound_on_page\talt_title_text"];
    for (const img of currentImages) {
      lines.push(`${img.url}\t${img.sourcePage || ""}\t${img.altText || img.titleText || ""}`);
    }
    navigator.clipboard.writeText(lines.join("\n")).then(() => {
      const orig = copyImageLinksBtn.textContent;
      copyImageLinksBtn.textContent = "✅ Copied Image Links!";
      setTimeout(() => { copyImageLinksBtn.textContent = orig; }, 1500);
    });
  });
}

// ── Export CSV ───────────────────────────────────────────────────────
exportBtn.addEventListener("click", () => {
  function csvEscape(str) {
    if (str === null || str === undefined) return '""';
    const s = String(str).replace(/"/g, '""');
    return `"${s}"`;
  }

  const domain = targetUrlInput && targetUrlInput.value
    ? targetUrlInput.value.replace(/^https?:\/\//i, "").split("/")[0].replace(/[^a-zA-Z0-9.-]/g, "_")
    : "site";
  const dateStr = new Date().toISOString().slice(0, 10);

  let filename = "";
  let rows = [];

  if (activeTab === "pdfs" && currentPdfs.length > 0) {
    filename = `discovered_pdfs_${domain}_${dateStr}.csv`;
    rows.push(["Direct PDF File URL", "Found On (Page URL)", "Scan Status", "Emails Found"].map(csvEscape).join(","));
    for (const p of currentPdfs) {
      rows.push([p.url, p.sourcePage || "", p.status || "Queued", p.emailsFound || 0].map(csvEscape).join(","));
    }
  } else if (activeTab === "images" && currentImages.length > 0) {
    filename = `discovered_images_${domain}_${dateStr}.csv`;
    rows.push(["Direct Image URL", "Found On (Page URL)", "Alt / Title Text", "Status"].map(csvEscape).join(","));
    for (const img of currentImages) {
      rows.push([img.url, img.sourcePage || "", img.altText || img.titleText || "", img.status || "Discovered"].map(csvEscape).join(","));
    }
  } else {
    filename = `extracted_emails_${domain}_${dateStr}.csv`;
    rows.push(["Email", "Source Type", "Occurrences", "Source URL", "Main Website Page"].map(csvEscape).join(","));
    const visibleEmails = getVisibleFindings();
    for (const f of visibleEmails) {
      rows.push([
        f.email,
        f.sourceType || "HTML",
        f.occurrences || (f.sources ? f.sources.length : 1),
        f.sourceUrl || "",
        f.mainPageUrl || f.sourceUrl || ""
      ].map(csvEscape).join(","));
    }
  }

  const csvContent = "\uFEFF" + rows.join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

// ── Export JSON ──────────────────────────────────────────────────────
if (exportJsonBtn) {
  exportJsonBtn.addEventListener("click", () => {
    const domain = targetUrlInput && targetUrlInput.value
      ? targetUrlInput.value.replace(/^https?:\/\//i, "").split("/")[0].replace(/[^a-zA-Z0-9.-]/g, "_")
      : "site";

    const visibleEmails = getVisibleFindings();
    const exportData = {
      targetUrl: targetUrlInput ? targetUrlInput.value.trim() : "",
      exportedAt: new Date().toISOString(),
      stats: {
        emailsFound: visibleEmails.length,
        pdfsDiscovered: currentPdfs.length,
        imagesDiscovered: currentImages.length,
        pagesCrawled: statPages ? statPages.textContent : "0"
      },
      emails: visibleEmails,
      pdfs: currentPdfs,
      images: currentImages
    };

    const jsonStr = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `email_pdf_image_crawl_${domain}_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
}

// ── Window Mode & Tab Detection Setup ────────────────────────────────
async function openPersistentWindow() {
  const currentUrl = targetUrlInput ? targetUrlInput.value.trim() : "";
  const popoutUrl = chrome.runtime.getURL(
    "popup.html?mode=window" + (currentUrl ? `&startUrl=${encodeURIComponent(currentUrl)}` : "")
  );

  try {
    const wins = await chrome.windows.getAll({ populate: true });
    for (const w of wins) {
      if (w.type === "popup" && w.tabs && w.tabs.some((t) => t.url && t.url.includes("popup.html?mode=window"))) {
        await chrome.windows.update(w.id, { focused: true });
        window.close();
        return;
      }
    }
  } catch (e) {}

  await chrome.windows.create({
    url: popoutUrl,
    type: "popup",
    width: 800,
    height: 650,
    focused: true
  });
  window.close();
}

const urlParams = new URLSearchParams(window.location.search);
const isWindowMode = urlParams.get("mode") === "window";
const paramStartUrl = urlParams.get("startUrl");

if (isWindowMode) {
  document.body.classList.add("window-mode");
  if (windowModeBadge) windowModeBadge.style.display = "inline-flex";
  if (popoutWindowBtn) popoutWindowBtn.style.display = "none";
  if (closeWindowBtn) closeWindowBtn.style.display = "inline-flex";
  if (paramStartUrl && targetUrlInput) {
    targetUrlInput.value = decodeURIComponent(paramStartUrl);
  }
} else {
  chrome.storage.local.get(["alwaysWindowMode"], (data) => {
    if (data && data.alwaysWindowMode) {
      openPersistentWindow();
    }
  });
}

if (targetUrlInput && !targetUrlInput.value) {
  detectActiveTabUrl().then((detectedUrl) => {
    if (detectedUrl && targetUrlInput && !targetUrlInput.value) {
      targetUrlInput.value = detectedUrl;
    }
  });
}

function syncCrawlState(res) {
  if (!res) return;

  if (Array.isArray(res.findings) && res.findings.length > 0) {
    for (const f of res.findings) {
      registerFoundEmail(f);
    }
    statEmails.textContent = getVisibleFindings().length;
  }

  if (Array.isArray(res.discoveredPdfs) && res.discoveredPdfs.length > 0) {
    for (const p of res.discoveredPdfs) {
      if (!currentPdfs.some((ex) => ex.url === p.url)) {
        currentPdfs.push(p);
      }
    }
    renderPdfRows(currentPdfs);
    for (const pdf of currentPdfs) {
      if (pdf.emailsFound === 0 && (/^Scanned \(0 emails/i.test(pdf.status || "") || /^Failed:/i.test(pdf.status || ""))) {
        runPdfOcr(pdf.url, pdf).then((result) => {
          statusText.textContent = `PDF text/OCR scan completed. Found ${result.emails.length} email${result.emails.length === 1 ? "" : "s"}.`;
        }).catch((error) => {
          pdf.status = `OCR failed: ${error.message || "Unable to scan PDF."}`;
          appendPdfRow(pdf);
          statusText.textContent = pdf.status;
        });
      }
    }
  }

  if (Array.isArray(res.discoveredImages) && res.discoveredImages.length > 0) {
    for (const img of res.discoveredImages) {
      if (!currentImages.some((ex) => ex.url === img.url)) {
        currentImages.push(img);
      }
    }
    renderImageRows(currentImages);
  }

  if (res.stats) {
    statPages.textContent = res.stats.pagesCrawled || 0;
    statPdfs.textContent = currentPdfs.length || res.stats.pdfsChecked || 0;
  } else if (res.pagesCrawled !== undefined) {
    statPages.textContent = res.pagesCrawled || 0;
    statPdfs.textContent = currentPdfs.length || res.pdfsChecked || 0;
  }

  if (statImages) {
    statImages.textContent = currentImages.length;
  }

  if (res.isCrawling === true) {
    isCrawling = true;
    startBtn.style.display = "none";
    stopBtn.style.display = "inline-flex";
    statusText.textContent = "Crawling in progress...";
    startStatusPoll();
  } else {
    isCrawling = false;
    stopStatusPoll();
    startBtn.style.display = "inline-flex";
    stopBtn.style.display = "none";
    if (currentFindings.length > 0 || currentPdfs.length > 0 || currentImages.length > 0) {
      statusText.textContent = `Completed! Extracted ${currentFindings.length} unique emails from ${statPages.textContent} pages, ${currentPdfs.length} PDFs & ${currentImages.length} images.`;
    } else {
      statusText.textContent = "Ready. Open website and click 'Crawl Website'.";
    }
    updateActionButtons();
  }
}

// Synchronize state with background service worker and local storage on load
chrome.runtime.sendMessage({ type: "GET_CRAWL_STATUS" }, (res) => {
  if (!chrome.runtime.lastError && res && res.ok && (res.findings?.length > 0 || res.isCrawling)) {
    syncCrawlState(res);
  } else {
    chrome.storage.local.get(["lastCrawlState"], (data) => {
      if (data && data.lastCrawlState) {
        syncCrawlState(data.lastCrawlState);
      }
    });
  }
});

detectTabBtn.addEventListener("click", async () => {
  const url = await detectActiveTabUrl();
  if (url) {
    targetUrlInput.value = url;
  }
});

popoutWindowBtn.addEventListener("click", () => {
  openPersistentWindow();
});

closeWindowBtn.addEventListener("click", () => {
  window.close();
});

alwaysWindowModeCheckbox.addEventListener("change", () => {
  chrome.storage.local.set({ alwaysWindowMode: alwaysWindowModeCheckbox.checked });
});

chrome.storage.local.get(["alwaysWindowMode"], (data) => {
  if (data && data.alwaysWindowMode) {
    alwaysWindowModeCheckbox.checked = true;
  }
});
