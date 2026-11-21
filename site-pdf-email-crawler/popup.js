// ═══════════════════════════════════════════════════════════════════════
// Site & PDF Email Detector — Pure & Ultra-Fast UI Controller
// ═══════════════════════════════════════════════════════════════════════

const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const exportBtn = document.getElementById("exportBtn");
const exportJsonBtn = document.getElementById("exportJsonBtn");
const copyBtn = document.getElementById("copyBtn");
const copyPathBtn = document.getElementById("copyPathBtn");
const statusText = document.getElementById("statusText");
const searchInput = document.getElementById("searchInput");

const statPages = document.getElementById("statPages");
const statPdfs = document.getElementById("statPdfs");
const statImages = document.getElementById("statImages");
const statEmails = document.getElementById("statEmails");
const statQueue = document.getElementById("statQueue");

const ocrStatus = document.getElementById("ocrStatus");
const resultsBody = document.getElementById("resultsBody");

const targetUrlInput = document.getElementById("targetUrlInput");
const detectTabBtn = document.getElementById("detectTabBtn");
const maxPagesSelect = document.getElementById("maxPagesSelect");
const concurrencySelect = document.getElementById("concurrencySelect");
const checkPdfsCheckbox = document.getElementById("checkPdfs");
const ocrImagesCheckbox = document.getElementById("ocrImages");
const filterComplianceCheckbox = document.getElementById("filterCompliance");
const includeSubdomainsCheckbox = document.getElementById("includeSubdomains");
const alwaysWindowModeCheckbox = document.getElementById("alwaysWindowMode");

const popoutWindowBtn = document.getElementById("popoutWindowBtn");
const closeWindowBtn = document.getElementById("closeWindowBtn");
const windowModeBadge = document.getElementById("windowModeBadge");

let currentFindings = [];
const emailRowsMap = new Map();
let isCrawling = false;
let statusPollTimer = null;

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
          : `Crawl completed! Extracted ${currentFindings.length} unique emails.`;
        if (Array.isArray(res.findings)) {
          res.findings.forEach(registerFoundEmail);
        }
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
  const hasData = currentFindings.length > 0;
  exportBtn.disabled = !hasData;
  if (exportJsonBtn) exportJsonBtn.disabled = !hasData;
  copyBtn.disabled = !hasData;
  copyPathBtn.disabled = !hasData;
  if (hasData) {
    searchInput.style.display = "block";
  }
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

  const rowHtml = `
    <td><strong>${escapeHtml(normEmail)}</strong></td>
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
    appendEmailRow(existing);
  } else {
    currentFindings.push(finding);
    appendEmailRow(finding);
  }

  statEmails.textContent = currentFindings.length;
  updateActionButtons();
}

function renderEmailRows(items) {
  resultsBody.innerHTML = "";
  emailRowsMap.clear();

  if (items.length === 0) {
    resultsBody.innerHTML = `<tr><td colspan="4" class="empty-state">${currentFindings.length > 0 ? "No emails matching your search query." : "No emails extracted yet. Click 'Crawl Website' to start."}</td></tr>`;
    return;
  }

  for (const item of items) {
    appendEmailRow(item);
  }
}

// Live search filter
searchInput.addEventListener("input", () => {
  const q = searchInput.value.trim().toLowerCase();
  if (!q) {
    renderEmailRows(currentFindings);
    return;
  }
  const filtered = currentFindings.filter(
    (f) =>
      f.email.toLowerCase().includes(q) ||
      (f.sourceUrl && f.sourceUrl.toLowerCase().includes(q)) ||
      (f.sourceType && f.sourceType.toLowerCase().includes(q))
  );
  renderEmailRows(filtered);
});

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
const POPUP_VALID_TLDS = new Set([
  "com", "net", "org", "edu", "gov", "mil", "int", "io", "co", "ai", "app", "dev",
  "info", "biz", "me", "tv", "cc", "xyz", "online", "site", "tech", "store", "shop",
  "in", "co.in", "net.in", "org.in", "us", "uk", "co.uk", "org.uk", "ca", "au",
  "com.au", "de", "fr", "it", "es", "nl", "eu", "ru", "ch", "at", "be", "dk",
  "se", "no", "fi", "pl", "cz", "ie", "pt", "gr", "ro", "jp", "co.jp", "cn", "com.cn",
  "tw", "com.tw", "hk", "com.hk", "sg", "com.sg", "my", "kr", "br", "mx", "ae", "sa"
]);

const POPUP_DUMMY_DOMAINS = new Set([
  "email.com", "email.co.uk", "example.com", "example.org", "example.net", "example.co.uk",
  "domain.com", "domain.co.uk", "sample.com", "sample.co.uk", "test.com", "test.co.uk", "testing.com",
  "yourdomain.com", "yourcompany.com", "yoursite.com", "mycompany.com", "company.com", "site.com",
  "website.com", "somedomain.com", "sentry.io", "wixpress.com", "wordpress.com", "cookiebot.com",
  "onetrust.com", "cloudflare.com", "gravatar.com"
]);

const POPUP_DUMMY_LOCAL_PREFIXES = new Set([
  "name", "yourname", "your-name", "your.name", "your_name", "your", "youremail", "your-email", "your.email",
  "user", "username", "someone", "placeholder", "sample", "test", "testing", "first.last", "fullname",
  "client", "recipient"
]);

const POPUP_COMPLIANCE_LOCAL_REGEX = /^(?:gdpr|dpo|dpo_.*|groupdpo|nomarketing|no-marketing|unsubscribe|optout|opt-out|noreply|no-reply|donotreply|do-not-reply|mailer-daemon|auto-reply|dataprotection|data-protection|cookie|cookies|abuse|postmaster|webmaster|hostmaster)$/i;

const POPUP_INVALID_LOCAL_PARTS = new Set([
  "or", "and", "the", "in", "at", "to", "for", "of", "on", "by", "as", "is", "it",
  "an", "be", "if", "so", "my", "no", "up", "we", "he", "do", "viewed", "available",
  "located", "registered", "hosted", "see", "look", "lookat", "held", "effective"
]);

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

  // Reject invalid stop words or verbs as local parts (e.g. or@all.it, viewed@...)
  if (POPUP_INVALID_LOCAL_PARTS.has(local)) return false;

  // Reject dummy domains
  if (POPUP_DUMMY_DOMAINS.has(domain)) return false;

  // Reject dummy local parts on generic domains
  if (POPUP_DUMMY_LOCAL_PREFIXES.has(local)) return false;

  // Reject compliance / GDPR / DPO / unsubscribe emails
  if (filterCompliance && POPUP_COMPLIANCE_LOCAL_REGEX.test(local)) return false;

  const tld = domain.split(".").pop();
  if (!POPUP_VALID_TLDS.has(tld) && !(tld.startsWith("xn--") && tld.length >= 5) && !/^[a-z]{2}$/.test(tld)) return false;
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
    .replace(/\b([a-zA-Z0-9._%+-]{2,30})\s+(?:AT)\s+([a-zA-Z0-9.-]+\.[a-zA-Z]{2,24})\b/g, "$1@$2")
    .replace(/\b([a-zA-Z0-9-]+)\s+(?:DOT)\s+([a-zA-Z]{2,24})\b/g, "$1.$2")
    .replace(/\b([a-zA-Z0-9_%+-]{1,40})\s*@\s*([a-zA-Z0-9-]{1,40})\s*\.\s*([a-zA-Z]{2,24})\b/g, "$1@$2.$3")
    .replace(/\b([a-zA-Z0-9_%+-]{1,30})\s*\.\s*([a-zA-Z0-9_%+-]{1,30})\s*@\s*([a-zA-Z0-9-]{1,40})\s*\.\s*([a-zA-Z]{2,24})\b/g, "$1.$2@$3.$4")
    .replace(/@([a-zA-Z0-9-]+),([a-zA-Z]{2,10})/g, "@$1.$2");

  const regex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,24}/g;
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

  if (msg.type === "PROCESS_IMAGE_OCR") {
    enqueueImageOcr(msg);
  }

  if (msg.type === "CRAWL_PROGRESS") {
    requestAnimationFrame(() => {
      if (msg.pagesCrawled !== undefined) statPages.textContent = msg.pagesCrawled;
      if (msg.pdfsCrawled !== undefined) statPdfs.textContent = msg.pdfsCrawled;
      if (msg.findingsCount !== undefined) statEmails.textContent = msg.findingsCount;
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
    statusText.textContent = `Completed! Extracted ${currentFindings.length} unique emails from ${statPages.textContent} pages & ${statPdfs.textContent} PDFs.`;
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
  emailRowsMap.clear();
  processedImages.clear();
  resultsBody.innerHTML = `<tr><td colspan="4" class="empty-state">Starting email crawl...</td></tr>`;

  statPages.textContent = "0";
  statPdfs.textContent = "0";
  if (statImages) statImages.textContent = "0";
  statEmails.textContent = "0";
  statQueue.textContent = "1";
  if (ocrStatus) ocrStatus.style.display = "none";
  searchInput.value = "";
  searchInput.style.display = "none";
  exportBtn.disabled = true;
  if (exportJsonBtn) exportJsonBtn.disabled = true;
  copyBtn.disabled = true;
  copyPathBtn.disabled = true;

  startBtn.style.display = "none";
  stopBtn.style.display = "inline-flex";
  isCrawling = true;
  startStatusPoll();
  statusText.textContent = "Connecting to website and crawling pages...";

  chrome.runtime.sendMessage(
    {
      type: "START_CRAWL",
      startUrl: targetUrl,
      maxPages: parseInt(maxPagesSelect.value, 10),
      concurrency: parseInt(concurrencySelect.value, 10),
      checkPdfs: checkPdfsCheckbox.checked,
      ocrImages: !!(ocrImagesCheckbox && ocrImagesCheckbox.checked),
      filterCompliance: filterComplianceCheckbox ? filterComplianceCheckbox.checked : true,
      includeSubdomains: includeSubdomainsCheckbox.checked
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

// ── Copy Emails ──────────────────────────────────────────────────────
copyBtn.addEventListener("click", () => {
  if (currentFindings.length === 0) return;
  const uniqueEmails = Array.from(new Set(currentFindings.map((f) => f.email))).join("\n");
  navigator.clipboard.writeText(uniqueEmails).then(() => {
    const orig = copyBtn.textContent;
    copyBtn.textContent = "✅ Copied!";
    setTimeout(() => { copyBtn.textContent = orig; }, 1500);
  });
});

// ── Copy with Source Page ────────────────────────────────────────────
copyPathBtn.addEventListener("click", () => {
  const lines = ["email\tsource_type\tfound_on_page"];
  for (const f of currentFindings) {
    lines.push(`${f.email}\t${f.sourceType || "HTML"}\t${f.sourceUrl || f.mainPageUrl || ""}`);
  }
  navigator.clipboard.writeText(lines.join("\n")).then(() => {
    const orig = copyPathBtn.textContent;
    copyPathBtn.textContent = "✅ Copied with Path!";
    setTimeout(() => { copyPathBtn.textContent = orig; }, 1500);
  });
});

// ── Export CSV ───────────────────────────────────────────────────────
exportBtn.addEventListener("click", () => {
  if (currentFindings.length === 0) return;

  function csvEscape(str) {
    if (str === null || str === undefined) return '""';
    const s = String(str).replace(/"/g, '""');
    return `"${s}"`;
  }

  const rows = [
    ["Email", "Source Type", "Occurrences", "Source URL", "Main Website Page"]
      .map(csvEscape)
      .join(",")
  ];

  for (const f of currentFindings) {
    rows.push(
      [
        f.email,
        f.sourceType || "HTML",
        f.occurrences || (f.sources ? f.sources.length : 1),
        f.sourceUrl || "",
        f.mainPageUrl || f.sourceUrl || ""
      ]
        .map(csvEscape)
        .join(",")
    );
  }

  const csvContent = "\uFEFF" + rows.join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const domain = targetUrlInput && targetUrlInput.value
    ? targetUrlInput.value.replace(/^https?:\/\//i, "").split("/")[0].replace(/[^a-zA-Z0-9.-]/g, "_")
    : "site";
  a.download = `extracted_emails_${domain}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

// ── Export JSON ──────────────────────────────────────────────────────
if (exportJsonBtn) {
  exportJsonBtn.addEventListener("click", () => {
    if (currentFindings.length === 0) return;

    const exportData = {
      emails: currentFindings.map((f) => ({
        copy: (f.copy || f.email || "").toLowerCase().trim(),
        url: f.url || f.mainPageUrl || f.sourceUrl || null,
        pdf: f.pdf || null,
        image: f.image || null,
        sourceType: (f.sourceType || (f.pdf ? "pdf" : (f.image ? "image" : "html"))).toLowerCase()
      }))
    };

    const jsonStr = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const domain = targetUrlInput && targetUrlInput.value
      ? targetUrlInput.value.replace(/^https?:\/\//i, "").split("/")[0].replace(/[^a-zA-Z0-9.-]/g, "_")
      : "site";
    a.download = `extracted_emails_${domain}_${new Date().toISOString().slice(0, 10)}.json`;
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
    statEmails.textContent = currentFindings.length;
  }

  if (res.stats) {
    statPages.textContent = res.stats.pagesCrawled || 0;
    statPdfs.textContent = res.stats.pdfsChecked || 0;
  } else if (res.pagesCrawled !== undefined) {
    statPages.textContent = res.pagesCrawled || 0;
    statPdfs.textContent = res.pdfsChecked || 0;
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
    if (currentFindings.length > 0) {
      statusText.textContent = `Extracted ${currentFindings.length} unique emails from ${statPages.textContent} pages & ${statPdfs.textContent} PDFs.`;
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
