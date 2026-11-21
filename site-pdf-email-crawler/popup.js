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
const includeSubdomainsCheckbox = document.getElementById("includeSubdomains");
const alwaysWindowModeCheckbox = document.getElementById("alwaysWindowMode");

const popoutWindowBtn = document.getElementById("popoutWindowBtn");
const closeWindowBtn = document.getElementById("closeWindowBtn");
const windowModeBadge = document.getElementById("windowModeBadge");

let currentFindings = [];
const emailRowsMap = new Map();
let isCrawling = false;

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

// Detect active browser tab
async function detectActiveTab() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs && tabs[0] ? tabs[0] : null;
  } catch {
    return null;
  }
}

async function detectActiveTabUrl() {
  const tab = await detectActiveTab();
  return tab && tab.url ? tab.url : "";
}

// Harvest live DOM from current tab
async function harvestActiveTabDom(tabId) {
  if (!tabId || typeof chrome.scripting === "undefined" || !chrome.scripting.executeScript) {
    return { emails: [], links: [] };
  }
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const docText = document.body ? document.body.innerText || "" : "";
        const docHtml = document.documentElement ? document.documentElement.outerHTML || "" : "";
        const linkHrefs = [];
        const links = document.querySelectorAll("a[href], [data-href], [data-url]");
        links.forEach((el) => {
          const href = el.getAttribute("href") || el.getAttribute("data-href") || el.getAttribute("data-url");
          if (href) linkHrefs.push(href);
        });
        return {
          text: docText.slice(0, 500000),
          html: docHtml.slice(0, 1000000),
          links: linkHrefs.slice(0, 500)
        };
      }
    });

    if (results && results[0] && results[0].result) {
      const res = results[0].result;
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,24}/g;
      const emails = [
        ...new Set([
          ...(res.text.match(emailRegex) || []),
          ...(res.html.match(emailRegex) || [])
        ])
      ];
      return {
        emails,
        links: res.links || []
      };
    }
  } catch (err) {
    console.debug("harvestActiveTabDom notice:", err);
  }
  return { emails: [], links: [] };
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

function isPopupValidEmail(email) {
  if (!email || typeof email !== "string") return false;
  const clean = email.trim().toLowerCase();
  if (clean.length < 5 || clean.length > 254) return false;
  const parts = clean.split("@");
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  if (!local || local.length < 1 || !domain || !domain.includes(".")) return false;
  const tld = domain.split(".").pop();
  if (!POPUP_VALID_TLDS.has(tld) && !(tld.startsWith("xn--") && tld.length >= 5) && !/^[a-z]{2}$/.test(tld)) return false;
  return true;
}

function normalizeAndExtractEmails(rawText) {
  if (!rawText || typeof rawText !== "string") return [];
  const found = new Set();

  let deobf = rawText
    .replace(/[©®]/g, "@")
    .replace(/\s*(?:\[at\]|\(at\)|\{at\}|\[AT\]|\(AT\))\s*/g, "@")
    .replace(/\s*(?:\[dot\]|\(dot\)|\{dot\}|\[DOT\]|\(DOT\))\s*/g, ".")
    .replace(/\b([a-zA-Z0-9._%+-]+)\s+(?:at|AT)\s+([a-zA-Z0-9.-]+)\b/g, "$1@$2")
    .replace(/\b([a-zA-Z0-9-]+)\s+(?:dot|DOT)\s+([a-zA-Z]{2,24})\b/g, "$1.$2")
    .replace(/\b([a-zA-Z0-9._%+-]+(?:\s*\.\s*[a-zA-Z0-9._%+-]+)*)\s*@\s*([a-zA-Z0-9-]+(?:\s*\.\s*[a-zA-Z0-9-]+)*\s*\.\s*[a-zA-Z]{2,24})\b/g, (_, l, d) => `${l.replace(/\s+/g, "")}@${d.replace(/\s+/g, "")}`)
    .replace(/@([a-zA-Z0-9-]+),([a-zA-Z]{2,10})/g, "@$1.$2");

  const regex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,24}/g;
  const matches = deobf.match(regex) || [];
  for (let m of matches) {
    m = m.toLowerCase().replace(/^[<(\["']+|[>)\]"',;:.!]+$/g, "");
    if (isPopupValidEmail(m)) {
      found.add(m);
    }
  }
  return Array.from(found);
}

let ocrWorkerPromise = null;
async function getOcrWorker() {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = (async () => {
      if (typeof Tesseract === "undefined") {
        console.warn("Tesseract library not loaded");
        return null;
      }
      try {
        const worker = await Tesseract.createWorker("eng", 1, {
          workerPath: chrome.runtime.getURL("lib/worker.min.js"),
          corePath: chrome.runtime.getURL("lib/tesseract-core-simd-lstm.wasm.js"),
          langPath: chrome.runtime.getURL("lib"),
          errorHandler: (err) => console.warn("Tesseract notice:", err)
        });
        return worker;
      } catch (err) {
        console.error("Failed to initialize Tesseract OCR:", err);
        return null;
      }
    })();
  }
  return ocrWorkerPromise;
}

const imageOcrQueue = [];
const processedImages = new Set();
let isProcessingImages = false;

function enqueueImageOcr(task) {
  if (!task || !task.imageUrl || processedImages.has(task.imageUrl)) return;
  if (ocrImagesCheckbox && !ocrImagesCheckbox.checked) return;
  if (imageOcrQueue.length >= 50) return;
  imageOcrQueue.push(task);
  processNextImageOcr();
}

async function processNextImageOcr() {
  if (isProcessingImages || imageOcrQueue.length === 0) return;
  isProcessingImages = true;

  while (imageOcrQueue.length > 0 && isCrawling) {
    const task = imageOcrQueue.shift();
    if (!task || processedImages.has(task.imageUrl)) continue;
    processedImages.add(task.imageUrl);

    if (statImages) statImages.textContent = processedImages.size;
    if (ocrStatus) {
      ocrStatus.style.display = "block";
      ocrStatus.textContent = `🔍 OCR: Scanning image ${task.imageUrl.split("/").pop()}...`;
    }

    let objectUrl = null;
    try {
      const worker = await getOcrWorker();
      if (!worker) break;

      try {
        const fetchRes = await fetch(task.imageUrl, { signal: AbortSignal.timeout(4000), credentials: "omit" });
        if (fetchRes.ok) {
          const blob = await fetchRes.blob();
          objectUrl = URL.createObjectURL(blob);
        }
      } catch {}

      const img = new Image();
      if (objectUrl) {
        img.src = objectUrl;
      } else {
        img.crossOrigin = "anonymous";
        img.src = task.imageUrl;
      }

      await new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = resolve;
        setTimeout(resolve, 3500);
      });

      if (img.naturalWidth >= 30 && img.naturalHeight >= 15) {
        const maxDim = 800;
        let w = img.naturalWidth;
        let h = img.naturalHeight;
        if (w > maxDim || h > maxDim) {
          if (w > h) { h = Math.round((h * maxDim) / w); w = maxDim; }
          else { w = Math.round((w * maxDim) / h); h = maxDim; }
        }

        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.85);

        const result = await worker.recognize(dataUrl);
        const ocrText = (result && result.data && result.data.text) ? result.data.text : "";
        if (ocrText && ocrText.length > 3) {
          const foundEmails = normalizeAndExtractEmails(ocrText);
          for (const em of foundEmails) {
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
            chrome.runtime.sendMessage({ type: "EMAIL_FOUND", finding: item }).catch(() => {});
          }
        }
      }
    } catch (err) {
      console.debug("OCR error on image:", task.imageUrl, err);
    } finally {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    }

    await new Promise((r) => setTimeout(r, 40));
  }

  isProcessingImages = false;
  if (ocrStatus) ocrStatus.style.display = "none";
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
    startBtn.style.display = "inline-flex";
    stopBtn.style.display = "none";
    statusText.textContent = `Failed: ${msg.error || "Crawl Error"}`;
  }
});

// ── Start Crawl Handler ──────────────────────────────────────────────
startBtn.addEventListener("click", async () => {
  const activeTabObj = await detectActiveTab();
  let targetUrl = targetUrlInput ? targetUrlInput.value.trim() : "";
  if (!targetUrl && activeTabObj && activeTabObj.url) {
    targetUrl = activeTabObj.url;
    if (targetUrlInput) targetUrlInput.value = targetUrl;
  }

  if (!targetUrl || (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://"))) {
    statusText.textContent = "Please enter or navigate to a valid http/https webpage first.";
    return;
  }

  currentFindings = [];
  emailRowsMap.clear();
  imageOcrQueue.length = 0;
  processedImages.clear();
  isProcessingImages = false;
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
  statusText.textContent = "Connecting to website and discovering pages...";

  let initialFindings = [];
  let initialLinks = [];

  // Harvest DOM from currently active tab if URL matches
  if (
    activeTabObj &&
    activeTabObj.id &&
    activeTabObj.url &&
    targetUrl.split("#")[0].replace(/\/$/, "") === activeTabObj.url.split("#")[0].replace(/\/$/, "")
  ) {
    statusText.textContent = "Harvesting live page elements & scripts...";
    const domHarvest = await harvestActiveTabDom(activeTabObj.id);
    if (domHarvest.emails.length > 0) {
      for (const em of domHarvest.emails) {
        const item = {
          email: em,
          sourceType: "HTML (Live Tab)",
          sourceUrl: targetUrl,
          mainPageUrl: targetUrl
        };
        registerFoundEmail(item);
        initialFindings.push(item);
      }
    }
    initialLinks = domHarvest.links || [];
  }

  chrome.runtime.sendMessage(
    {
      type: "START_CRAWL",
      startUrl: targetUrl,
      maxPages: parseInt(maxPagesSelect.value, 10),
      concurrency: parseInt(concurrencySelect.value, 10),
      checkPdfs: checkPdfsCheckbox.checked,
      ocrImages: ocrImagesCheckbox ? ocrImagesCheckbox.checked : true,
      includeSubdomains: includeSubdomainsCheckbox.checked,
      initialFindings,
      initialLinks
    },
    (response) => {
      if (chrome.runtime.lastError) {
        isCrawling = false;
        startBtn.style.display = "inline-flex";
        stopBtn.style.display = "none";
        statusText.textContent = `Error: ${chrome.runtime.lastError.message}`;
        return;
      }

      if (!response || !response.ok) {
        isCrawling = false;
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
  imageOcrQueue.length = 0;
  isProcessingImages = false;
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

// Synchronize state with background service worker on load
chrome.runtime.sendMessage({ type: "GET_CRAWL_STATUS" }, (res) => {
  if (chrome.runtime.lastError || !res || !res.ok) return;

  if (res.findings && res.findings.length > 0) {
    for (const f of res.findings) {
      registerFoundEmail(f);
    }
    statEmails.textContent = currentFindings.length;
  }

  if (res.stats) {
    statPages.textContent = res.stats.pagesCrawled || 0;
    statPdfs.textContent = res.stats.pdfsChecked || 0;
  }

  if (res.isCrawling) {
    isCrawling = true;
    startBtn.style.display = "none";
    stopBtn.style.display = "inline-flex";
    statusText.textContent = "Crawling in progress...";
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
