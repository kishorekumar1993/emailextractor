// ═══════════════════════════════════════════════════════════════════════
// Site & PDF Email Crawler — Popup & Persistent Window UI Script
// Multi-Source Email Tracking | Visual Content Classification
// Robust PDF.js Rendering & Offline Tesseract OCR
// ═══════════════════════════════════════════════════════════════════════

const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const exportBtn = document.getElementById("exportBtn");
const copyBtn = document.getElementById("copyBtn");
const copyPathBtn = document.getElementById("copyPathBtn");
const copyPdfLinksBtn = document.getElementById("copyPdfLinksBtn");
const copyImageLinksBtn = document.getElementById("copyImageLinksBtn");
const copyAllUnifiedBtn = document.getElementById("copyAllUnifiedBtn");
const statusText = document.getElementById("statusText");
const ocrStatus = document.getElementById("ocrStatus");
const searchInput = document.getElementById("searchInput");
const restrictionBanner = document.getElementById("restrictionBanner");
const restrictionBannerText = document.getElementById("restrictionBannerText");
const warningsBanner = document.getElementById("warningsBanner");
const warningsBannerText = document.getElementById("warningsBannerText");

const statPages = document.getElementById("statPages");
const statPdfs = document.getElementById("statPdfs");
const statImages = document.getElementById("statImages");
const statEmails = document.getElementById("statEmails");
const statQueue = document.getElementById("statQueue");

const tabEmailsBtn = document.getElementById("tabEmailsBtn");
const tabPdfsBtn = document.getElementById("tabPdfsBtn");
const tabImagesBtn = document.getElementById("tabImagesBtn");
const tabWarningsBtn = document.getElementById("tabWarningsBtn");
const tabEmailsCount = document.getElementById("tabEmailsCount");
const tabPdfsCount = document.getElementById("tabPdfsCount");
const tabImagesCount = document.getElementById("tabImagesCount");
const tabWarningsCount = document.getElementById("tabWarningsCount");

const emailsTableContainer = document.getElementById("emailsTableContainer");
const pdfsTableContainer = document.getElementById("pdfsTableContainer");
const imagesTableContainer = document.getElementById("imagesTableContainer");
const warningsTableContainer = document.getElementById("warningsTableContainer");
const resultsBody = document.getElementById("resultsBody");
const pdfsBody = document.getElementById("pdfsBody");
const imagesBody = document.getElementById("imagesBody");
const warningsBody = document.getElementById("warningsBody");

const maxPagesSelect = document.getElementById("maxPagesSelect");
const concurrencySelect = document.getElementById("concurrencySelect");
const ocrImagesCheckbox = document.getElementById("ocrImages");
const skipProductDetailsCheckbox = document.getElementById("skipProductDetails");
const checkPdfsCheckbox = document.getElementById("checkPdfs");
const includeSubdomainsCheckbox = document.getElementById("includeSubdomains");
const popoutWindowBtn = document.getElementById("popoutWindowBtn");
const closeWindowBtn = document.getElementById("closeWindowBtn");
const windowModeBadge = document.getElementById("windowModeBadge");
const targetUrlInput = document.getElementById("targetUrlInput");
const detectTabBtn = document.getElementById("detectTabBtn");
const alwaysWindowModeCheckbox = document.getElementById("alwaysWindowMode");

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,24}/g;

let currentFindings = [];
let currentPdfs = [];
let currentImages = [];
let currentWarnings = []; // Image-only restriction warnings (never stop crawl)
let activeTab = "emails";
let isCrawling = false;
let ocrWorker = null;
let ocrWorkerPromise = null;
let ocrQueueChain = Promise.resolve();

// Configure PDF.js worker
if (typeof pdfjsLib !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("lib/pdf.worker.min.js");
}

// ═══════════════════════════════════════════════════════════════════════
// 1. VISUAL IMAGE CONTENT CLASSIFIER
// High-confidence visual feature analyzer
// RULE: Never guess categories based on ambient colors (e.g. beige box != adult, red/green lamp != food).
// High-confidence visual detection is reserved for unambiguous geometric warning symbols or metallic weapon contours.
// All general category detections (food, adult, medicine, alcohol, etc.) are strictly confirmed by OCR text.
// ═══════════════════════════════════════════════════════════════════════

function analyzeCanvasVisualContent(canvas) {
  try {
    if (!canvas || !canvas.width || !canvas.height) return null;

    const sampleWidth = Math.min(160, canvas.width);
    const sampleHeight = Math.min(160, canvas.height);
    const sampleCanvas = document.createElement("canvas");
    sampleCanvas.width = sampleWidth;
    sampleCanvas.height = sampleHeight;
    const sCtx = sampleCanvas.getContext("2d", { willReadFrequently: true });
    sCtx.drawImage(canvas, 0, 0, sampleWidth, sampleHeight);

    const imgData = sCtx.getImageData(0, 0, sampleWidth, sampleHeight);
    const data = imgData.data;
    const totalPixels = sampleWidth * sampleHeight;

    let hazardYellowCount = 0;
    let darkContrastCount = 0;
    let metallicCount = 0;
    let edgeEnergyTotal = 0;

    for (let y = 0; y < sampleHeight; y++) {
      for (let x = 0; x < sampleWidth; x++) {
        const idx = (y * sampleWidth + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        const maxC = Math.max(r, g, b);
        const minC = Math.min(r, g, b);
        const saturation = maxC === 0 ? 0 : (maxC - minC) / maxC;

        if (x < sampleWidth - 1) {
          const nextR = data[idx + 4];
          const nextG = data[idx + 5];
          const nextB = data[idx + 6];
          edgeEnergyTotal += Math.abs(r - nextR) + Math.abs(g - nextG) + Math.abs(b - nextB);
        }

        // 1. Industrial Hazard Caution Yellow (diamond safety symbol)
        if (r > 205 && g > 180 && b < 40 && saturation > 0.70) {
          hazardYellowCount++;
        }
        if (lum < 35) {
          darkContrastCount++;
        }

        // 2. Metallic Blade profile (low-saturation steel gray)
        if (saturation < 0.12 && lum > 60 && lum < 200) {
          metallicCount++;
        }
      }
    }

    sampleCanvas.width = 0;
    sampleCanvas.height = 0;

    const avgEdgeEnergy = edgeEnergyTotal / totalPixels;
    if (avgEdgeEnergy < 18) return null;

    const hazardRatio = hazardYellowCount / totalPixels;
    const darkRatio = darkContrastCount / totalPixels;
    const metallicRatio = metallicCount / totalPixels;

    // 1. Chemical Hazard (requires bright industrial hazard yellow + dark warning symbol contrast + high edge energy)
    if (hazardRatio > 0.25 && darkRatio > 0.10 && avgEdgeEnergy > 32) {
      return {
        category: "Chemical",
        confidence: 88,
        evidence: [`Visual Content: High-contrast industrial hazard warning symbol pattern (${Math.round(hazardRatio * 100)}%)`],
        visualDescription: "Chemical product or hazardous material safety warning symbol"
      };
    }

    // 2. Weapons & Tactical Blades (requires elongated metallic blade contour)
    const aspectRatio = canvas.width / (canvas.height || 1);
    if ((aspectRatio > 3.2 || aspectRatio < 0.31) && metallicRatio > 0.55 && avgEdgeEnergy > 28) {
      return {
        category: "Weapons & Knives",
        confidence: 84,
        evidence: ["Visual Content: Elongated high-contrast metallic blade contour profile"],
        visualDescription: "Sharp metallic blade or tactical weapon silhouette profile"
      };
    }

    return null;
  } catch {
    return null;
  }
}

// Fast pre-check to detect if an image canvas likely contains readable text strokes
function hasProbableTextInCanvas(canvas) {
  try {
    if (!canvas || canvas.width < 50 || canvas.height < 20) return false;
    const sampleW = Math.min(240, canvas.width);
    const sampleH = Math.min(180, canvas.height);
    const c = document.createElement("canvas");
    c.width = sampleW;
    c.height = sampleH;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(canvas, 0, 0, sampleW, sampleH);
    const imgData = ctx.getImageData(0, 0, sampleW, sampleH);
    const d = imgData.data;

    let highContrastTransitions = 0;
    // Check horizontal scanlines for rapid dark/light transitions (typical of text character strokes)
    for (let y = 10; y < sampleH - 10; y += 4) {
      let prevLum = 0.299 * d[(y * sampleW) * 4] + 0.587 * d[(y * sampleW) * 4 + 1] + 0.114 * d[(y * sampleW) * 4 + 2];
      for (let x = 4; x < sampleW - 4; x += 2) {
        const idx = (y * sampleW + x) * 4;
        const lum = 0.299 * d[idx] + 0.587 * d[idx + 1] + 0.114 * d[idx + 2];
        if (Math.abs(lum - prevLum) > 65) {
          highContrastTransitions++;
        }
        prevLum = lum;
      }
    }
    c.width = 0;
    c.height = 0;
    return highContrastTransitions > 30;
  } catch {
    return true;
  }
}

// Convert Base64 string to Uint8Array for PDF.js
function base64ToUint8Array(base64) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Initialize offline Tesseract OCR worker with singleton promise (prevents duplicate worker spawn)
async function getOcrWorker() {
  if (ocrWorker) return ocrWorker;
  if (ocrWorkerPromise) return ocrWorkerPromise;
  if (typeof Tesseract === "undefined") {
    throw new Error("Tesseract.js library is not available in popup context");
  }

  ocrWorkerPromise = (async () => {
    try {
      const worker = await Tesseract.createWorker("eng", 1, {
        workerPath: chrome.runtime.getURL("lib/worker.min.js"),
        corePath: chrome.runtime.getURL("lib/tesseract-core-simd-lstm.wasm.js"),
        langPath: chrome.runtime.getURL("lib"),
        workerBlobURL: false,
        errorHandler: (err) => {
          console.warn("Tesseract worker notice:", err);
        }
      });
      // Speedup: Disable heavy dictionary dawg graph search to speed up OCR by 2x-3x
      try {
        await worker.setParameters({
          load_system_dawg: "0",
          load_freq_dawg: "0"
        });
      } catch {}
      ocrWorker = worker;
      return worker;
    } catch (err) {
      ocrWorkerPromise = null;
      console.error("Tesseract OCR initialization failed:", err);
      throw err;
    }
  })();

  return ocrWorkerPromise;
}

// Mutex-serialized OCR execution with safety timeout: prevents thread collision and UI hang
function runOcrRecognize(imageSource) {
  ocrQueueChain = ocrQueueChain.then(async () => {
    if (!isCrawling) return { text: "" };
    // Yield to the UI thread event loop so user actions (like Stop) remain instantaneous
    await new Promise((r) => setTimeout(r, 20));
    if (!isCrawling) return { text: "" };

    const worker = await getOcrWorker();
    if (!worker) return { text: "" };

    const ocrPromise = worker.recognize(imageSource);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("OCR timeout (10s)")), 10000)
    );
    const ret = await Promise.race([ocrPromise, timeoutPromise]);
    return { text: ret && ret.data ? ret.data.text || "" : "" };
  }).catch((err) => {
    console.warn("OCR recognize notice:", err.message);
    return { text: "" };
  });

  return ocrQueueChain;
}

// ═══════════════════════════════════════════════════════════════════════
// 2. STRICT EMAIL VALIDATION & SAFE ANTI-OBFUSCATION PARSER
// ═══════════════════════════════════════════════════════════════════════

// Comprehensive, recognized valid ICANN TLDs
const VALID_TLDS = new Set([
  // Common generic and modern gTLDs
  "com", "org", "net", "edu", "gov", "mil", "int", "info", "biz", "name", "pro",
  "io", "co", "ai", "app", "dev", "tech", "online", "site", "store", "shop",
  "global", "agency", "group", "media", "digital", "world", "network", "solutions",
  "services", "center", "company", "systems", "space", "live", "life", "today",
  "news", "studio", "club", "zone", "expert", "care", "link", "support", "work",
  "top", "vip", "xyz", "icu", "click", "fit", "fun", "press", "website", "pub",
  "casa", "ltd", "chat", "law", "bio", "me", "tv", "cc", "eu", "la", "mobi",
  "asia", "cat", "jobs", "tel", "travel", "design", "email", "cloud",
  "trade", "boutique", "direct", "parts", "engineering", "machine", "machinery",
  "holdings", "enterprises", "consulting", "marketing", "international", "solar",
  // Standard two-letter ISO country code ccTLDs
  "ac", "ad", "ae", "af", "ag", "al", "am", "ao", "aq", "ar", "as", "at", "au",
  "aw", "ax", "az", "ba", "bb", "bd", "be", "bf", "bg", "bh", "bi", "bj", "bm",
  "bn", "bo", "br", "bs", "bt", "bw", "by", "bz", "ca", "cd", "cf", "cg", "ch",
  "ci", "ck", "cl", "cm", "cn", "cr", "cu", "cv", "cw", "cx", "cy", "cz", "de",
  "dj", "dk", "dm", "do", "dz", "ec", "ee", "eg", "es", "et", "fi", "fj", "fm",
  "fo", "fr", "ga", "gd", "ge", "gf", "gg", "gh", "gi", "gl", "gm", "gn", "gp",
  "gq", "gr", "gt", "gu", "gw", "gy", "hk", "hn", "hr", "ht", "hu", "id", "ie",
  "il", "im", "in", "iq", "ir", "is", "it", "je", "jm", "jo", "jp", "ke", "kg",
  "kh", "ki", "km", "kn", "kr", "kw", "ky", "kz", "lb", "lc", "li", "lk", "lr",
  "ls", "lt", "lu", "lv", "ly", "ma", "mc", "md", "mf", "mg", "mh", "mk", "ml",
  "mm", "mn", "mo", "mp", "mq", "mr", "ms", "mt", "mu", "mv", "mw", "mx", "my",
  "mz", "na", "nc", "ne", "nf", "ng", "ni", "nl", "no", "np", "nr", "nu", "nz",
  "om", "pa", "pe", "pf", "pg", "ph", "pk", "pl", "pm", "pn", "pr", "ps", "pt",
  "pw", "py", "qa", "re", "ro", "rs", "ru", "rw", "sa", "sb", "sc", "sd", "se",
  "sg", "sh", "si", "sk", "sl", "sm", "sn", "so", "sr", "ss", "st", "sv", "sx",
  "sy", "sz", "tc", "td", "tf", "tg", "th", "tj", "tk", "tl", "tm", "tn", "to",
  "tr", "tt", "tw", "tz", "ua", "ug", "uk", "us", "uy", "uz", "va", "vc", "ve",
  "vg", "vi", "vn", "vu", "ws", "ye", "za", "zm", "zw"
]);

const BAD_ASSET_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "webp", "gif", "svg", "bmp", "ico", "tiff", "tif",
  "css", "js", "mjs", "cjs", "jsx", "ts", "tsx", "json", "xml", "wasm", "map",
  "vue", "php", "py", "cpp", "java", "rb", "go", "rs", "c", "h", "html", "htm",
  "pdf", "zip", "tar", "gz", "rar", "7z", "bz2", "mp4", "mp3", "wav", "webm",
  "avi", "ogg", "ogv", "flac", "aac", "woff", "woff2", "ttf", "eot", "otf",
  "bin", "dat", "exe", "dmg", "apk", "iso", "bak", "tmp", "log", "txt", "csv", "md"
]);

const DUMMY_EMAILS = new Set([
  "test@test.com", "example@example.com", "user@domain.com", "name@company.com",
  "someone@example.com", "sample@sample.com", "admin@domain.com", "email@email.com",
  "user@example.com", "email@example.com", "name@example.com", "yourname@email.com",
  "username@domain.com", "first.last@domain.com"
]);

function safeAtob(b64) {
  try {
    if (typeof atob === "function") return atob(b64);
    if (typeof Buffer !== "undefined") return Buffer.from(b64, "base64").toString("utf-8");
  } catch {}
  return "";
}

function rot13(str) {
  return String(str || "").replace(/[a-zA-Z]/g, (c) => {
    const code = c.charCodeAt(0);
    const base = code >= 97 ? 97 : 65;
    return String.fromCharCode(((code - base + 13) % 26) + base);
  });
}

function cleanEmailToken(str) {
  if (!str) return "";
  return String(str)
    .trim()
    .toLowerCase()
    .replace(/^mailto:\s*/i, "")
    .replace(/^[^a-z0-9]+/, "")
    .replace(/[^a-z0-9]+$/, "");
}

function isValidEmail(email) {
  if (!email || typeof email !== "string") return false;
  const clean = email.trim().toLowerCase();
  if (clean.length < 5 || clean.length > 254) return false;

  const atParts = clean.split("@");
  if (atParts.length !== 2) return false;
  const [local, domain] = atParts;
  if (!local || local.length < 1 || local.length > 64 || !domain) return false;

  // Local part checks: alphanumeric at start/end, valid characters, no consecutive dots
  if (!/^[a-z0-9](?:[a-z0-9._%+-]*[a-z0-9])?$/.test(local)) return false;
  if (local.includes("..")) return false;

  // Domain checks
  if (!domain.includes(".") || domain.startsWith(".") || domain.endsWith(".")) return false;
  const domainLabels = domain.split(".");
  if (domainLabels.length < 2) return false;

  for (const label of domainLabels) {
    if (!label || label.length > 63) return false;
    if (label.startsWith("-") || label.endsWith("-")) return false;
    if (!/^[a-z0-9-]+$/.test(label)) return false;
  }

  // Second-Level Domain (SLD) check: label immediately preceding TLD
  const sld = domainLabels[domainLabels.length - 2];
  if (sld.length < 1) return false;

  // Strict TLD check: must be a recognized ICANN TLD or punycode (rejects fake TLDs like .word)
  const tld = domainLabels[domainLabels.length - 1];
  const isPunycode = tld.startsWith("xn--") && tld.length >= 5;
  const isKnownTld = VALID_TLDS.has(tld);

  if (!isKnownTld && !isPunycode) return false;

  // Asset extension reject
  if (BAD_ASSET_EXTENSIONS.has(tld)) return false;

  // Dummy placeholder emails reject
  if (DUMMY_EMAILS.has(clean)) return false;

  return true;
}

// Decodes Cloudflare email protection XOR cipher
function decodeCloudflareEmail(encodedHex) {
  if (!encodedHex || encodedHex.length < 4) return null;
  try {
    let email = "";
    const k = parseInt(encodedHex.substr(0, 2), 16);
    for (let i = 2; i < encodedHex.length; i += 2) {
      const code = parseInt(encodedHex.substr(i, 2), 16) ^ k;
      email += String.fromCharCode(code);
    }
    return email.replace(/^[^\w]+|[^\w]+$/g, "");
  } catch {
    return null;
  }
}

// Normalized email extractor handling Cloudflare obfuscation, split text, OCR spaces, HTML entities, and broken layout lines
function normalizeAndExtractEmails(rawText) {
  if (!rawText) return [];

  const found = new Set();
  const rawStr = String(rawText);

  // 1. Cloudflare Email Protection Deobfuscation
  const cfEmailRegex = /(?:data-cfemail\s*=\s*["']?([0-9a-fA-F]{4,})["']?|__cf_email__\s*=\s*["']?([0-9a-fA-F]{4,})["']?|\/cdn-cgi\/l\/email-protection(?:#|\?|%23)([0-9a-fA-F]{4,}))/gi;
  let cfMatch;
  while ((cfMatch = cfEmailRegex.exec(rawStr)) !== null) {
    const hex = cfMatch[1] || cfMatch[2] || cfMatch[3];
    const decoded = decodeCloudflareEmail(hex);
    if (decoded) {
      const cleanDecoded = cleanEmailToken(decoded);
      if (isValidEmail(cleanDecoded)) {
        found.add(cleanDecoded);
      }
    }
  }

  // 2. Data Attributes (Plain Text + Base64)
  const dataAttrRegex = /\bdata-(?:email|mail|contact|encoded|address|mailto|recipient|user-email|cfemail)\s*=\s*["']([^"']{5,160})["']/gi;
  let dataMatch;
  while ((dataMatch = dataAttrRegex.exec(rawStr)) !== null) {
    const val = dataMatch[1].trim();
    if (val.includes("@")) {
      const cleanVal = cleanEmailToken(val);
      if (isValidEmail(cleanVal)) found.add(cleanVal);
    }
    if (/^[a-zA-Z0-9+/=]{6,160}$/.test(val) && !val.includes("@")) {
      const decoded = safeAtob(val);
      if (decoded) {
        const cleanDecoded = cleanEmailToken(decoded);
        if (isValidEmail(cleanDecoded)) found.add(cleanDecoded);
      }
    }
  }

  // 3. Split attributes: data-user="..." data-domain="..."
  const userDomainRegex = /(?:data-(?:user|name|account|prefix)\s*=\s*["']([^"']+)["'][^>]*data-(?:domain|host|site)\s*=\s*["']([^"']+)["']|data-(?:domain|host|site)\s*=\s*["']([^"']+)["'][^>]*data-(?:user|name|account|prefix)\s*=\s*["']([^"']+)["'])/gi;
  let udMatch;
  while ((udMatch = userDomainRegex.exec(rawStr)) !== null) {
    const user = (udMatch[1] || udMatch[4] || "").trim();
    const dom = (udMatch[2] || udMatch[3] || "").trim();
    if (user && dom) {
      const candidate = cleanEmailToken(`${user}@${dom}`);
      if (isValidEmail(candidate)) found.add(candidate);
    }
  }

  // 4. Mailto links (supports multi-recipient and query string parameters)
  const mailtoRegex = /mailto:\s*([^\s"'<>]+)/gi;
  let mMatch;
  while ((mMatch = mailtoRegex.exec(rawStr)) !== null) {
    try {
      const decodedMailto = decodeURIComponent(mMatch[1]);
      const addrs = decodedMailto.split(/[?&,;]+/);
      for (const a of addrs) {
        const val = a.includes("=") ? a.split("=")[1] : a;
        const clean = cleanEmailToken(val);
        if (isValidEmail(clean)) found.add(clean);
      }
    } catch {}
  }

  // 5. JavaScript String Concatenation Deobfuscation & Anti-Spam Decoys
  let deobfuscated = rawStr
    .replace(/["']\s*\+\s*["']/g, "")
    .replace(/<(?:span|div|p|i|b|font)\b[^>]*\bstyle\s*=\s*["'][^"']*(?:display\s*:\s*none|visibility\s*:\s*hidden|font-size\s*:\s*0|opacity\s*:\s*0)[^"']*["'][^>]*>[\s\S]*?<\/(?:span|div|p|i|b|font)>/gi, "")
    .replace(/<(?:span|div|p|i|b|font)\b[^>]*\bclass\s*=\s*["'][^"']*(?:hidden|d-none|invisible|sr-only|honeypot|decoy|antispam|nospam|trap)[^"']*["'][^>]*>[\s\S]*?<\/(?:span|div|p|i|b|font)>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");

  // 6. Decode HTML Entities (Numeric &#105;, Hex &#x69;)
  deobfuscated = deobfuscated
    .replace(/[\u00AD\u200B-\u200D\uFEFF\u2060]/g, "")
    .replace(/&amp;#/gi, "&#")
    .replace(/&amp;quot;/gi, '"')
    .replace(/&amp;amp;/gi, "&")
    .replace(/&#0*(\d+);?/g, (_, dec) => {
      const code = parseInt(dec, 10);
      return (code > 0 && code < 65536) ? String.fromCharCode(code) : "";
    })
    .replace(/&#x0*([0-9a-fA-F]+);?/g, (_, hex) => {
      const code = parseInt(hex, 16);
      return (code > 0 && code < 65536) ? String.fromCharCode(code) : "";
    })
    .replace(/%40/gi, "@")
    .replace(/%2e/gi, ".")
    .replace(/%2b/gi, "+")
    .replace(/%2f/gi, "/")
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => {
      const code = parseInt(hex, 16);
      return (code > 0 && code < 65536) ? String.fromCharCode(code) : "";
    })
    .replace(/\\u002f/gi, "/")
    .replace(/\\"/g, '"')
    .replace(/\\\//g, "/")
    .replace(/&commat;/gi, "@")
    .replace(/&period;/gi, ".")
    .replace(/&minus;/gi, "-")
    .replace(/&plus;/gi, "+")
    .replace(/&lowbar;/gi, "_")
    .replace(/&sol;/gi, "/")
    .replace(/&(?:Tab|NewLine|nbsp|ensp|emsp|thinsp);/gi, " ")
    .replace(/[\uFF20\u00A9\u00AE]/g, "@")
    .replace(/[\uFF0E\u00B7\u2022]/g, ".")
    .replace(/[\u00A0\u2028\u2029]/g, " ")
    .replace(/mailto:\s*/gi, "");

  // 7. Obfuscated AT and DOT patterns:
  // ONLY convert explicit bracketed/symbolic forms ([at], (at), {at}, <at>, _at_, -at-, *at*, [@], (@))
  deobfuscated = deobfuscated
    .replace(/\s*[\(\[\{<]\s*(?:at|@|a\s+t)\s*[\)\]\}>]\s*/gi, "@")
    .replace(/\s*[-_/*]\s*(?:at|@)\s*[-_/*]\s*/gi, "@")
    .replace(/\s+[@\uFF20]\s+/g, "@");

  deobfuscated = deobfuscated
    .replace(/\s*[\(\[\{<]\s*(?:dot|\.|d\s+o\s+t)\s*[\)\]\}>]\s*/gi, ".")
    .replace(/\s*[-_/*]\s*(?:dot|\.)\s*[-_/*]\s*/gi, ".");

  // Safely replace "user at domain dot com" or "user AT domain DOT com"
  // ONLY when BOTH "at" and "dot" are present in the exact email token pattern!
  // (Prevents normal English sentences like "...businesses at risk. Word..." from becoming emails!)
  deobfuscated = deobfuscated.replace(
    /\b([a-zA-Z0-9._%+-]+)\s+(?:at|AT)\s+([a-zA-Z0-9-]+)\s+(?:dot|DOT)\s+([a-zA-Z]{2,24})\b/g,
    "$1@$2.$3"
  );

  // 8. Strip tags both cleanly and with spaces
  const strippedClean = deobfuscated
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<[^>]+>/g, "");

  const spacedClean = deobfuscated
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");

  // 9. Fix spaced emails (e.g. "daisyyang @ zungsung . com", "first . last @ sub . domain . co . uk")
  function fixSpacedEmails(str) {
    return str.replace(
      /\b([a-zA-Z0-9._%+-]+(?:\s*\.\s*[a-zA-Z0-9._%+-]+)*)\s*@\s*([a-zA-Z0-9-]+(?:\s*\.\s*[a-zA-Z0-9-]+)*\s*\.\s*[a-zA-Z]{2,24})\b/g,
      (_, localPart, domainPart) => {
        const cl = localPart.replace(/\s+/g, "");
        const cd = domainPart.replace(/\s+/g, "");
        return `${cl}@${cd}`;
      }
    );
  }

  const normalizedTexts = [
    fixSpacedEmails(strippedClean),
    fixSpacedEmails(spacedClean),
    fixSpacedEmails(deobfuscated)
  ];

  const EXTRACT_REGEX = /[a-zA-Z0-9][a-zA-Z0-9._%+-]*@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,24}/g;

  for (const textVer of normalizedTexts) {
    const matches = textVer.match(EXTRACT_REGEX) || [];
    for (const m of matches) {
      const cleanM = cleanEmailToken(m);
      if (isValidEmail(cleanM)) found.add(cleanM);
    }

    const tokens = textVer.split(/[\r\n,;| \t"'<>()[\]{}]+/);
    for (const token of tokens) {
      if (!token || !token.includes("@")) continue;
      const cleanT = cleanEmailToken(token);
      if (isValidEmail(cleanT)) {
        found.add(cleanT);
      } else {
        const rotCandidate = rot13(cleanT);
        if (isValidEmail(rotCandidate)) {
          found.add(rotCandidate);
        }
      }
    }
  }

  // 10. Check Reversed Emails (RTL / CSS bidi override: moc.elpmaxe@ofni -> info@example.com)
  const REVERSED_EMAIL_REGEX = /[a-zA-Z]{2,24}\.[a-zA-Z0-9.-]+@[a-zA-Z0-9._%+-]+[a-zA-Z0-9]/g;
  for (const textVer of normalizedTexts) {
    const revMatches = textVer.match(REVERSED_EMAIL_REGEX) || [];
    for (const rm of revMatches) {
      const reversed = rm.split("").reverse().join("");
      const cleanRev = cleanEmailToken(reversed);
      if (isValidEmail(cleanRev)) found.add(cleanRev);
    }
  }

  return Array.from(found);
}

// ═══════════════════════════════════════════════════════════════════════
// 3. UI RENDERING & MULTI-SOURCE TABLE DISPLAY
// ═══════════════════════════════════════════════════════════════════════

function getBadge(type) {
  if (type.includes("Scanned") || type.includes("Image") || type.includes("OCR")) {
    return `<span class="type-badge type-ocr">${escapeHtml(type)}</span>`;
  }
  if (type.includes("PDF")) {
    return `<span class="type-badge type-pdf">${escapeHtml(type)}</span>`;
  }
  if (type.includes("mailto")) {
    return `<span class="type-badge type-mailto">mailto</span>`;
  }
  return `<span class="type-badge type-html">HTML</span>`;
}

function formatDisplayUrl(url) {
  if (!url) return "-";
  return url.replace(/^https?:\/\//, "");
}

// Fast lookup map for table rows by normalized email string
const emailRowsMap = new Map();

// Add or update row in emails table with multi-source tracking
function appendEmailRow(finding) {
  const normEmail = finding.email.toLowerCase();
  const existingTr = emailRowsMap.get(normEmail);

  const displayDirect = formatDisplayUrl(finding.sourceUrl);
  const displayMain = formatDisplayUrl(finding.mainPageUrl || finding.sourceUrl);
  const occurrences = finding.occurrences || (finding.sources ? finding.sources.length : 1);

  // Multi-source tooltip details
  let sourcesTooltip = "";
  if (finding.sources && finding.sources.length > 0) {
    sourcesTooltip = finding.sources
      .map((s, idx) => `${idx + 1}. [${s.sourceType}] ${s.sourceUrl}`)
      .join(" | ");
  }

  const multiBadge = occurrences > 1
    ? `<span class="badge" title="${escapeHtml(sourcesTooltip)}" style="margin-left:4px;cursor:pointer;background:#e0f2fe;color:#0284c7;">(${occurrences} sources)</span>`
    : "";

  const rowHtml = `
    <td><strong>${escapeHtml(finding.email)}</strong></td>
    <td>${getBadge(finding.sourceType)}${multiBadge}</td>
    <td><a class="main-site-link" href="${escapeHtml(finding.mainPageUrl || finding.sourceUrl)}" target="_blank" title="Found on: ${escapeHtml(finding.mainPageUrl || finding.sourceUrl)}">${escapeHtml(displayMain)}</a></td>
    <td><a class="source-link" href="${escapeHtml(finding.sourceUrl)}" target="_blank" title="${escapeHtml(sourcesTooltip || finding.sourceUrl)}">${escapeHtml(displayDirect)}</a></td>
  `;

  if (existingTr) {
    existingTr.innerHTML = rowHtml;
  } else {
    const tr = document.createElement("tr");
    tr.setAttribute("data-email", normEmail);
    tr.innerHTML = rowHtml;
    emailRowsMap.set(normEmail, tr);
    resultsBody.appendChild(tr);
  }
}

function hashUrlKey(url) {
  let hash = 0;
  const str = String(url || "");
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return "h" + Math.abs(hash);
}

// Add row to PDFs table with in-place DOM updates
function appendPdfRow(pdfRecord) {
  const rowId = "pdf-" + hashUrlKey(pdfRecord.url);
  const existingTr = document.getElementById(rowId);
  const displayMain = formatDisplayUrl(pdfRecord.sourcePage);
  const displayDirect = pdfRecord.url.split("/").pop() || pdfRecord.url;
  const isHasEmail = pdfRecord.emailsFound > 0;

  const html = `
    <td><a class="main-site-link" href="${escapeHtml(pdfRecord.sourcePage)}" target="_blank" title="Linked on main page: ${escapeHtml(pdfRecord.sourcePage)}">${escapeHtml(displayMain)}</a></td>
    <td><a class="source-link" href="${escapeHtml(pdfRecord.url)}" target="_blank" title="Direct PDF URL: ${escapeHtml(pdfRecord.url)}">${escapeHtml(displayDirect)}</a></td>
    <td><span class="status-badge ${isHasEmail ? "has-email" : ""}">${escapeHtml(pdfRecord.status)}</span></td>
  `;

  if (existingTr) {
    existingTr.innerHTML = html;
  } else {
    const tr = document.createElement("tr");
    tr.id = rowId;
    tr.innerHTML = html;
    pdfsBody.appendChild(tr);
  }
}

// Add row to Images table with in-place DOM updates
function appendImageRow(imageRecord) {
  const rowId = "img-" + hashUrlKey(imageRecord.url);
  const existingTr = document.getElementById(rowId);
  const displayMain = formatDisplayUrl(imageRecord.sourcePage);
  const displayDirect = imageRecord.url.split("/").pop() || imageRecord.url;
  const isHasEmail = imageRecord.emailsFound > 0;

  const html = `
    <td><a class="main-site-link" href="${escapeHtml(imageRecord.sourcePage)}" target="_blank" title="Linked on main page: ${escapeHtml(imageRecord.sourcePage)}">${escapeHtml(displayMain)}</a></td>
    <td><a class="source-link" href="${escapeHtml(imageRecord.url)}" target="_blank" title="Direct Image URL: ${escapeHtml(imageRecord.url)}">${escapeHtml(displayDirect)}</a></td>
    <td><span class="status-badge ${isHasEmail ? "has-email" : ""}">${escapeHtml(imageRecord.status)}</span></td>
  `;

  if (existingTr) {
    existingTr.innerHTML = html;
  } else {
    const tr = document.createElement("tr");
    tr.id = rowId;
    tr.innerHTML = html;
    imagesBody.appendChild(tr);
  }
}

function renderEmailRows(items) {
  emailRowsMap.clear();
  resultsBody.innerHTML = "";
  for (const item of items) appendEmailRow(item);
}

function renderPdfRows(items) {
  pdfsBody.innerHTML = "";
  for (const item of items) appendPdfRow(item);
}

function renderImageRows(items) {
  imagesBody.innerHTML = "";
  for (const item of items) appendImageRow(item);
}

// Add row to Warnings table
function appendWarningRow(w) {
  const tr = document.createElement("tr");
  const displayPage = formatDisplayUrl(w.sourcePage);
  const displayImg = w.imageUrl ? w.imageUrl.split("/").pop() || w.imageUrl : "-";
  const conf = w.confidence !== undefined ? `${w.confidence}%` : "-";
  const evidence = (w.evidence || []).join(", ");
  tr.innerHTML = `
    <td><a class="source-link" href="${escapeHtml(w.sourcePage || "")}" target="_blank" title="${escapeHtml(w.sourcePage || "")}">${escapeHtml(displayPage)}</a></td>
    <td><a class="source-link" href="${escapeHtml(w.imageUrl || "")}" target="_blank" title="${escapeHtml(w.imageUrl || "")}">${escapeHtml(displayImg)}</a></td>
    <td><span class="type-badge type-warn">${escapeHtml(w.category || "")}</span></td>
    <td>${escapeHtml(conf)}</td>
    <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(evidence)}">${escapeHtml(evidence)}</td>
    <td><span class="warn-status">⚠ Warning Only</span></td>
  `;
  warningsBody.appendChild(tr);
}

function renderWarningRows(items) {
  warningsBody.innerHTML = "";
  for (const item of items) appendWarningRow(item);
}

// Register an image restriction warning (never stops crawl)
function registerImageWarning(warningRecord) {
  const alreadyExists = currentWarnings.some(
    (cw) => cw.imageUrl === warningRecord.imageUrl && cw.category === warningRecord.category
  );
  if (alreadyExists) return;

  currentWarnings.push(warningRecord);
  tabWarningsCount.textContent = currentWarnings.length;
  appendWarningRow(warningRecord);

  if (warningsBanner) {
    warningsBanner.style.display = "flex";
    warningsBannerText.textContent = `⚠ ${currentWarnings.length} restricted image content warning(s) detected. Crawling continued.`;
  }
  updateActionButtons();
}

// Show site restricted banner and stop further UI updates
function showSiteRestricted(siteRecord) {
  if (restrictionBanner) {
    restrictionBanner.style.display = "flex";
    restrictionBannerText.textContent =
      `🚫 Restricted Site: ${siteRecord.category} business confirmed (${siteRecord.confidence}% confidence) — Crawling halted. Evidence: ${(siteRecord.evidence || []).join(", ")}`;
  }
  statusText.textContent = `🚫 RESTRICTED SITE — ${siteRecord.category} business confirmed. Crawl stopped. No emails extracted.`;
}

// Update specific PDF record status with in-place DOM row update
function updatePdfRecordStatus(url, status, emailsFound) {
  const rec = currentPdfs.find((p) => p.url === url);
  if (rec) {
    rec.status = status;
    if (emailsFound !== undefined) rec.emailsFound = emailsFound;
    appendPdfRow(rec);
  }
}

// Update specific Image record status with in-place DOM row update
function updateImageRecordStatus(url, status, emailsFound) {
  const rec = currentImages.find((img) => img.url === url);
  if (rec) {
    rec.status = status;
    if (emailsFound !== undefined) rec.emailsFound = emailsFound;
    appendImageRow(rec);
  }
}

// Register email globally with multi-source tracking
function registerFoundEmail(finding) {
  const normEmail = finding.email.toLowerCase();
  const existingIndex = currentFindings.findIndex((f) => f.email.toLowerCase() === normEmail);

  if (existingIndex >= 0) {
    // Multi-source update
    const existing = currentFindings[existingIndex];
    if (finding.sources && finding.sources.length > 0) {
      existing.sources = finding.sources;
      existing.occurrences = finding.sources.length;
    } else {
      if (!existing.sources) existing.sources = [];
      const hasSrc = existing.sources.some(
        (s) => s.sourceUrl === finding.sourceUrl && s.sourceType === finding.sourceType
      );
      if (!hasSrc) {
        existing.sources.push({
          sourceType: finding.sourceType,
          sourceUrl: finding.sourceUrl,
          mainPageUrl: finding.mainPageUrl || finding.sourceUrl,
          timestamp: new Date().toISOString()
        });
      }
      existing.occurrences = existing.sources.length;
    }
    appendEmailRow(existing);
    return;
  }

  // New email found
  if (!finding.sources) {
    finding.sources = [{
      sourceType: finding.sourceType,
      sourceUrl: finding.sourceUrl,
      mainPageUrl: finding.mainPageUrl || finding.sourceUrl,
      timestamp: new Date().toISOString()
    }];
    finding.occurrences = 1;
  }

  currentFindings.push(finding);
  statEmails.textContent = currentFindings.length;
  tabEmailsCount.textContent = currentFindings.length;
  appendEmailRow(finding);
  updateActionButtons();

  chrome.runtime.sendMessage({
    type: "REGISTER_EMAIL",
    email: finding.email,
    sourceUrl: finding.sourceUrl,
    sourceType: finding.sourceType,
    mainPageUrl: finding.mainPageUrl
  }).catch(() => {});
}

// Tab Switching
tabEmailsBtn.addEventListener("click", () => {
  activeTab = "emails";
  tabEmailsBtn.classList.add("active");
  tabPdfsBtn.classList.remove("active");
  tabImagesBtn.classList.remove("active");
  if (tabWarningsBtn) tabWarningsBtn.classList.remove("active");
  emailsTableContainer.style.display = "block";
  pdfsTableContainer.style.display = "none";
  imagesTableContainer.style.display = "none";
  if (warningsTableContainer) warningsTableContainer.style.display = "none";
});

tabPdfsBtn.addEventListener("click", () => {
  activeTab = "pdfs";
  tabPdfsBtn.classList.add("active");
  tabEmailsBtn.classList.remove("active");
  tabImagesBtn.classList.remove("active");
  if (tabWarningsBtn) tabWarningsBtn.classList.remove("active");
  pdfsTableContainer.style.display = "block";
  emailsTableContainer.style.display = "none";
  imagesTableContainer.style.display = "none";
  if (warningsTableContainer) warningsTableContainer.style.display = "none";
});

tabImagesBtn.addEventListener("click", () => {
  activeTab = "images";
  tabImagesBtn.classList.add("active");
  tabEmailsBtn.classList.remove("active");
  tabPdfsBtn.classList.remove("active");
  if (tabWarningsBtn) tabWarningsBtn.classList.remove("active");
  imagesTableContainer.style.display = "block";
  emailsTableContainer.style.display = "none";
  pdfsTableContainer.style.display = "none";
  if (warningsTableContainer) warningsTableContainer.style.display = "none";
});

if (tabWarningsBtn) {
  tabWarningsBtn.addEventListener("click", () => {
    activeTab = "warnings";
    tabWarningsBtn.classList.add("active");
    tabEmailsBtn.classList.remove("active");
    tabPdfsBtn.classList.remove("active");
    tabImagesBtn.classList.remove("active");
    if (warningsTableContainer) warningsTableContainer.style.display = "block";
    emailsTableContainer.style.display = "none";
    pdfsTableContainer.style.display = "none";
    imagesTableContainer.style.display = "none";
  });
}

document.getElementById("statCardPages").addEventListener("click", () => tabEmailsBtn.click());
document.getElementById("statCardPdfs").addEventListener("click", () => tabPdfsBtn.click());
document.getElementById("statCardImages").addEventListener("click", () => tabImagesBtn.click());
document.getElementById("statCardEmails").addEventListener("click", () => tabEmailsBtn.click());

// Live Search Filter
searchInput.addEventListener("input", () => {
  const q = searchInput.value.trim().toLowerCase();
  if (activeTab === "emails") {
    if (!q) {
      renderEmailRows(currentFindings);
      return;
    }
    const filtered = currentFindings.filter(
      (f) =>
        f.email.toLowerCase().includes(q) ||
        (f.sourceUrl && f.sourceUrl.toLowerCase().includes(q)) ||
        (f.mainPageUrl && f.mainPageUrl.toLowerCase().includes(q))
    );
    renderEmailRows(filtered);
  } else if (activeTab === "pdfs") {
    if (!q) {
      renderPdfRows(currentPdfs);
      return;
    }
    const filtered = currentPdfs.filter(
      (p) =>
        p.url.toLowerCase().includes(q) ||
        p.domain.toLowerCase().includes(q) ||
        (p.sourcePage && p.sourcePage.toLowerCase().includes(q)) ||
        p.status.toLowerCase().includes(q)
    );
    renderPdfRows(filtered);
  } else if (activeTab === "warnings") {
    if (!q) { renderWarningRows(currentWarnings); return; }
    const filtered = currentWarnings.filter(
      (w) =>
        (w.category || "").toLowerCase().includes(q) ||
        (w.imageUrl || "").toLowerCase().includes(q) ||
        (w.sourcePage || "").toLowerCase().includes(q) ||
        (w.evidence || []).join(" ").toLowerCase().includes(q)
    );
    renderWarningRows(filtered);
  } else {
    if (!q) {
      renderImageRows(currentImages);
      return;
    }
    const filtered = currentImages.filter(
      (img) =>
        img.url.toLowerCase().includes(q) ||
        (img.domain && img.domain.toLowerCase().includes(q)) ||
        (img.sourcePage && img.sourcePage.toLowerCase().includes(q)) ||
        img.status.toLowerCase().includes(q)
    );
    renderImageRows(filtered);
  }
});

function updateActionButtons() {
  const hasData = currentFindings.length > 0 || currentPdfs.length > 0 || currentImages.length > 0;
  exportBtn.disabled = !hasData;
  copyAllUnifiedBtn.disabled = !hasData;
  copyPathBtn.disabled = !hasData;
  copyBtn.disabled = currentFindings.length === 0;
  copyPdfLinksBtn.disabled = currentPdfs.length === 0;
  copyImageLinksBtn.disabled = currentImages.length === 0;
  if (hasData) searchInput.style.display = "block";
}

// ═══════════════════════════════════════════════════════════════════════
// 4. PDF.JS RENDERING & LARGE PDF FALLBACK PIPELINE
// ═══════════════════════════════════════════════════════════════════════

const pdfProcessingQueue = [];
let isProcessingPdfQueue = false;
const processedPdfUrls = new Set();

function enqueuePdfForProcessing(task) {
  if (processedPdfUrls.has(task.pdfUrl)) return;
  pdfProcessingQueue.push(task);
  processPdfQueue();
}

const PDF_CONCURRENCY = 1;
async function processPdfQueue() {
  if (isProcessingPdfQueue) return;
  isProcessingPdfQueue = true;

  const running = new Set();
  while ((pdfProcessingQueue.length > 0 || running.size > 0) && isCrawling) {
    while (pdfProcessingQueue.length > 0 && running.size < PDF_CONCURRENCY && isCrawling) {
      const task = pdfProcessingQueue.shift();
      if (!task || processedPdfUrls.has(task.pdfUrl)) continue;
      processedPdfUrls.add(task.pdfUrl);

      const p = handleProcessPdf(task).finally(() => running.delete(p));
      running.add(p);
    }
    if (running.size > 0) {
      await Promise.race(running);
    }
  }

  isProcessingPdfQueue = false;
  ocrStatus.style.display = "none";

  if (!isCrawling && !isProcessingImageQueue) {
    if (statusText.textContent !== "Crawl stopped by user.") {
      statusText.textContent = `Completed! Extracted ${currentFindings.length} unique emails from ${statPages.textContent} pages, ${currentPdfs.length} PDFs & ${currentImages.length} images.`;
    }
  }
}

async function handleProcessPdf({ pdfUrl, mainPageUrl, base64Data, ocrPdfs }) {
  if (!isCrawling) return;
  const fileName = pdfUrl.split("/").pop() || "document.pdf";
  try {
    ocrStatus.style.display = "flex";
    ocrStatus.textContent = `📄 PDF.js: Opening ${fileName}...`;

    if (typeof pdfjsLib === "undefined") {
      throw new Error("pdfjsLib is not loaded in popup context");
    }

    let rawBytes;
    if (base64Data && base64Data.length > 50) {
      rawBytes = base64ToUint8Array(base64Data);
    } else {
      // Direct fetch fallback for large PDFs
      try {
        const resp = await fetch(pdfUrl, { credentials: "omit" });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        rawBytes = new Uint8Array(await resp.arrayBuffer());
      } catch (directErr) {
        // Fallback: ask background service worker to fetch without CORS restrictions
        const bgRes = await new Promise((resolve) => {
          chrome.runtime.sendMessage({ type: "FETCH_PDF_BUFFER", url: pdfUrl }, resolve);
        });
        if (bgRes && bgRes.ok && bgRes.base64Data) {
          rawBytes = base64ToUint8Array(bgRes.base64Data);
        } else {
          throw new Error(`Failed to load PDF bytes: ${directErr.message}`);
        }
      }
    }

    if (!isCrawling) return;
    const loadingTask = pdfjsLib.getDocument({ data: rawBytes });
    const pdf = await loadingTask.promise;
    const numPages = pdf.numPages;

    let emailsFoundInDoc = 0;
    const shouldOcr = ocrPdfs !== false && ocrImagesCheckbox.checked;

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      if (!isCrawling) break;
      ocrStatus.textContent = `📄 PDF.js: Reading page ${pageNum}/${numPages} of ${fileName}...`;
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const items = textContent.items || [];
      const pageText = items.map((it) => it.str).join(" ");

      // Reconstruct text with spacing and line breaks based on coordinate transforms
      // (CRITICAL FIX: Prevents merging sentences across PDF layout items, eliminating false positives like businesses@risk.word)
      let reconstructedText = "";
      let lastY = null;
      let lastX = null;
      let lastWidth = 0;

      for (const it of items) {
        const str = it.str;
        if (!str) continue;
        const x = it.transform ? it.transform[4] : null;
        const y = it.transform ? it.transform[5] : null;

        if (lastY !== null && y !== null && Math.abs(y - lastY) > 5) {
          reconstructedText += "\n";
          lastX = null;
        } else if (lastX !== null && x !== null && x > lastX + lastWidth + 2) {
          reconstructedText += " ";
        } else if (reconstructedText.length > 0 && !reconstructedText.endsWith(" ") && !reconstructedText.endsWith("\n")) {
          reconstructedText += " ";
        }
        reconstructedText += str;
        lastY = y;
        lastX = x;
        lastWidth = it.width || 0;
      }

      const textEmails = [
        ...new Set([
          ...normalizeAndExtractEmails(pageText),
          ...normalizeAndExtractEmails(reconstructedText)
        ])
      ];

      if (textEmails.length > 0) {
        for (const email of textEmails) {
          emailsFoundInDoc++;
          registerFoundEmail({
            email,
            sourceType: `PDF Text (Page ${pageNum})`,
            sourceUrl: pdfUrl,
            mainPageUrl: mainPageUrl || pdfUrl
          });
        }
      }

      // Digital text check: if the page already contains digital text characters,
      // it was already fully extracted and checked by normalizeAndExtractEmails.
      // OCR is ONLY needed for purely scanned / raster image pages (no extractable digital text).
      const isScannedRasterPage = pageText.trim().length < 30 && items.length < 5;
      // Performance optimization: scanned catalogs/brochures put contacts in front or back covers (first 3 / last 2 pages)
      const isPriorityPage = pageNum <= 3 || pageNum > numPages - 2;
      const isCandidateForOcr = shouldOcr && isScannedRasterPage && isPriorityPage;

      if (isCandidateForOcr) {
        ocrStatus.textContent = `🔍 OCR: Scanning page ${pageNum}/${numPages} canvas for ${fileName}...`;
        const rawViewport = page.getViewport({ scale: 1.0 });
        // Scale down to max 900px dimension: 10x faster OCR and 90% less memory usage
        const maxDim = 900;
        const currentMax = Math.max(rawViewport.width, rawViewport.height);
        const scale = currentMax > maxDim ? maxDim / currentMax : 1.0;
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        await page.render({ canvasContext: ctx, viewport }).promise;

        // Visual analysis of page pixels (warning only)
        const visualResult = analyzeCanvasVisualContent(canvas);

        const dataUrl = canvas.toDataURL("image/jpeg", 0.80);
        canvas.width = 0;
        canvas.height = 0;

        const ocrRet = await runOcrRecognize(dataUrl);
        const ocrText = ocrRet.text || "";
        const ocrEmails = normalizeAndExtractEmails(ocrText);
        for (const email of ocrEmails) {
          emailsFoundInDoc++;
          registerFoundEmail({
            email,
            sourceType: `PDF Scanned (Page ${pageNum} OCR)`,
            sourceUrl: pdfUrl,
            mainPageUrl: mainPageUrl || pdfUrl
          });
        }

        chrome.runtime.sendMessage({
          type: "CHECK_IMAGE_RESTRICTION",
          imageUrl: pdfUrl,
          ocrText,
          visualResult,
          sourcePage: mainPageUrl || pdfUrl
        }, (res) => {
          if (res && res.warning) registerImageWarning(res.warning);
        });
      }
    }

    const finalStatus = emailsFoundInDoc > 0 ? `Active (${emailsFoundInDoc} emails)` : "Parsed (0 emails)";
    updatePdfRecordStatus(pdfUrl, finalStatus, emailsFoundInDoc);
    chrome.runtime.sendMessage({
      type: "UPDATE_PDF_STATUS",
      url: pdfUrl,
      status: finalStatus,
      emailsFound: emailsFoundInDoc
    }).catch(() => {});
  } catch (err) {
    console.error("PDF processing failed:", pdfUrl, err);
    const failStatus = `Failed: ${err.message || "Parse Error"}`;
    updatePdfRecordStatus(pdfUrl, failStatus, 0);
    chrome.runtime.sendMessage({
      type: "UPDATE_PDF_STATUS",
      url: pdfUrl,
      status: failStatus,
      emailsFound: 0
    }).catch(() => {});
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 5. WEBSITE IMAGE OCR & VISUAL RESTRICTION PIPELINE
// ═══════════════════════════════════════════════════════════════════════

const imageProcessingQueue = [];
let isProcessingImageQueue = false;
const processedImageUrls = new Set();

function enqueueImageForProcessing(task) {
  if (processedImageUrls.has(task.imageUrl)) return;
  imageProcessingQueue.push(task);
  processImageQueue();
}

const IMAGE_CONCURRENCY = 1;
async function processImageQueue() {
  if (isProcessingImageQueue) return;
  isProcessingImageQueue = true;

  const running = new Set();
  while ((imageProcessingQueue.length > 0 || running.size > 0) && isCrawling) {
    while (imageProcessingQueue.length > 0 && running.size < IMAGE_CONCURRENCY && isCrawling) {
      const task = imageProcessingQueue.shift();
      if (!task || processedImageUrls.has(task.imageUrl)) continue;
      processedImageUrls.add(task.imageUrl);

      const p = handleProcessImageOcr(task).finally(() => running.delete(p));
      running.add(p);
    }
    if (running.size > 0) {
      await Promise.race(running);
    }
  }

  isProcessingImageQueue = false;
  ocrStatus.style.display = "none";

  if (!isCrawling && !isProcessingPdfQueue) {
    if (statusText.textContent !== "Crawl stopped by user.") {
      statusText.textContent = `Completed! Extracted ${currentFindings.length} unique emails from ${statPages.textContent} pages, ${currentPdfs.length} PDFs & ${currentImages.length} images.`;
    }
  }
}

async function handleProcessImageOcr({ imageUrl, mainPageUrl, dataUrl, imageContext, altText, titleText }) {
  if (!isCrawling) return;
  const fileName = imageUrl.split("/").pop() || "image.jpg";
  try {
    ocrStatus.style.display = "flex";
    ocrStatus.textContent = `🔍 OCR: Scanning image ${fileName}...`;

    let visualResult = null;
    let text = "";
    let emails = [];

    try {
      const img = new Image();
      if (!dataUrl || !dataUrl.startsWith("data:")) {
        img.crossOrigin = "anonymous";
      }
      await new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = resolve;
        img.src = dataUrl || imageUrl;
      });

      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        // Skip tiny icons, bullets, and buttons that cannot fit an email
        if (img.naturalWidth < 120 || img.naturalHeight < 40 || Math.min(img.naturalWidth, img.naturalHeight) < 20) {
          updateImageRecordStatus(imageUrl, "Skipped (too small)", 0);
          chrome.runtime.sendMessage({
            type: "UPDATE_IMAGE_STATUS",
            url: imageUrl,
            status: "Skipped (too small)",
            emailsFound: 0
          }).catch(() => {});
          return;
        }

        // Skip extreme aspect ratio decorative strips or bars
        const ratio = img.naturalWidth / img.naturalHeight;
        if (ratio > 16 || ratio < 0.06) {
          updateImageRecordStatus(imageUrl, "Skipped (banner strip)", 0);
          chrome.runtime.sendMessage({
            type: "UPDATE_IMAGE_STATUS",
            url: imageUrl,
            status: "Skipped (banner strip)",
            emailsFound: 0
          }).catch(() => {});
          return;
        }

        // Scale down oversized images to max 650px for 50% faster OCR without losing legibility
        const maxDim = 650;
        let w = img.naturalWidth;
        let h = img.naturalHeight;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, w, h);
        const hasTextClues = hasProbableTextInCanvas(canvas);
        visualResult = analyzeCanvasVisualContent(canvas);
        const optimizedDataUrl = canvas.toDataURL("image/jpeg", 0.85);
        canvas.width = 0;
        canvas.height = 0;

        // Only run heavy Tesseract OCR if text strokes were detected
        if (hasTextClues) {
          const ret = await runOcrRecognize(optimizedDataUrl);
          text = ret.text || "";
          emails = normalizeAndExtractEmails(text);
        }
      }
    } catch (renderErr) {
      console.warn("Image canvas decode warning:", renderErr);
    }

    let emailsFound = 0;
    for (const email of emails) {
      emailsFound++;
      registerFoundEmail({
        email,
        sourceType: "Website Image (OCR)",
        sourceUrl: imageUrl,
        mainPageUrl: mainPageUrl || imageUrl
      });
    }

    const finalStatus = emailsFound > 0 ? `Active (${emailsFound} emails)` : "Scanned (0 emails)";
    updateImageRecordStatus(imageUrl, finalStatus, emailsFound);
    chrome.runtime.sendMessage({
      type: "UPDATE_IMAGE_STATUS",
      url: imageUrl,
      status: finalStatus,
      emailsFound
    }).catch(() => {});

    // 2. Strict Visual & OCR Content Warning (NEVER stops crawling)
    chrome.runtime.sendMessage({
      type: "CHECK_IMAGE_RESTRICTION",
      imageUrl,
      ocrText: text,
      imageContext: imageContext || "",
      altText: [altText, titleText].filter(Boolean).join(" "),
      visualResult,
      sourcePage: mainPageUrl || imageUrl
    }, (res) => {
      if (res && res.warning) registerImageWarning(res.warning);
    });
  } catch (err) {
    console.warn("Failed to OCR website image:", imageUrl, err);
    const failStatus = `Failed: ${err.message || "OCR Error"}`;
    updateImageRecordStatus(imageUrl, failStatus, 0);
    chrome.runtime.sendMessage({
      type: "UPDATE_IMAGE_STATUS",
      url: imageUrl,
      status: failStatus,
      emailsFound: 0
    }).catch(() => {});
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 6. MESSAGE LISTENERS FROM SERVICE WORKER
// ═══════════════════════════════════════════════════════════════════════

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "EMAIL_FOUND" && msg.finding) {
    registerFoundEmail(msg.finding);
  }

  if (msg.type === "PDF_DISCOVERED" && msg.pdfRecord) {
    const existing = currentPdfs.find((p) => p.url === msg.pdfRecord.url);
    if (!existing) {
      currentPdfs.push(msg.pdfRecord);
      tabPdfsCount.textContent = currentPdfs.length;
      appendPdfRow(msg.pdfRecord);
      updateActionButtons();
    }
  }

  if (msg.type === "IMAGE_DISCOVERED" && msg.imageRecord) {
    const existing = currentImages.find((img) => img.url === msg.imageRecord.url);
    if (!existing) {
      currentImages.push(msg.imageRecord);
      tabImagesCount.textContent = currentImages.length;
      statImages.textContent = currentImages.length;
      appendImageRow(msg.imageRecord);
      updateActionButtons();
    }
  }

  if (msg.type === "PROCESS_PDF") {
    enqueuePdfForProcessing(msg);
  }

  if (msg.type === "PROCESS_IMAGE_OCR" && ocrImagesCheckbox.checked) {
    enqueueImageForProcessing(msg);
  }

  if (msg.type === "IMAGE_RESTRICTION_WARNING" && msg.warningRecord) {
    registerImageWarning(msg.warningRecord);
  }

  if (msg.type === "SITE_RESTRICTED" && msg.siteRecord) {
    showSiteRestricted(msg.siteRecord);
    isCrawling = false;
    startBtn.style.display = "inline-flex";
    stopBtn.style.display = "none";
    stopHeartbeat();
  }

  if (msg.type === "CRAWL_COMPLETED") {
    isCrawling = false;
    startBtn.style.display = "inline-flex";
    stopBtn.style.display = "none";
    stopHeartbeat();
    const d = msg.data || {};
    if (d.findings) {
      for (const f of d.findings) registerFoundEmail(f);
    }
    if (isProcessingPdfQueue || isProcessingImageQueue) {
      statusText.textContent = "HTML crawl complete. Scanning discovered documents & images with OCR...";
    } else {
      statusText.textContent = `Completed! Extracted ${currentFindings.length} unique emails from ${statPages.textContent} pages, ${currentPdfs.length} PDFs & ${currentImages.length} images.${currentWarnings.length > 0 ? ` ${currentWarnings.length} image warning(s).` : ""}`;
    }
    updateActionButtons();
  }

  if (msg.type === "CRAWL_FAILED") {
    isCrawling = false;
    startBtn.style.display = "inline-flex";
    stopBtn.style.display = "none";
    stopHeartbeat();
    statusText.textContent = `Failed: ${msg.error || "Crawl Error"}`;
  }

  if (msg.type === "CRAWL_PROGRESS") {
    requestAnimationFrame(() => {
      if (msg.pagesCrawled !== undefined) statPages.textContent = msg.pagesCrawled;
      if (msg.pdfsCrawled !== undefined) {
        const avail = msg.pdfsAvailable !== undefined ? `${msg.pdfsAvailable} / ${msg.pdfsCrawled}` : msg.pdfsCrawled;
        statPdfs.textContent = avail;
      }
      if (msg.imagesScanned !== undefined) {
        statImages.textContent = msg.imagesScanned;
      }
      if (msg.discoveredPdfsCount !== undefined) {
        tabPdfsCount.textContent = msg.discoveredPdfsCount;
      }
      if (msg.discoveredImagesCount !== undefined) {
        tabImagesCount.textContent = msg.discoveredImagesCount;
      }
      if (msg.queueRemaining !== undefined) statQueue.textContent = msg.queueRemaining;
      if (msg.currentUrl) {
        statusText.textContent = `Reviewing: ${msg.currentUrl}`;
      }
    });
  }
});

let heartbeatTimer = null;
function startHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(() => {
    chrome.runtime.sendMessage({ type: "PING" }).catch(() => {});
  }, 15000);
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 7. USER ACTIONS: START, STOP, EXPORT & UNIFIED COPY
// ═══════════════════════════════════════════════════════════════════════

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
  currentPdfs = [];
  currentImages = [];
  currentWarnings = [];
  processedPdfUrls.clear();
  processedImageUrls.clear();
  emailRowsMap.clear();
  resultsBody.innerHTML = "";
  pdfsBody.innerHTML = "";
  imagesBody.innerHTML = "";
  if (warningsBody) warningsBody.innerHTML = "";
  if (restrictionBanner) restrictionBanner.style.display = "none";
  if (warningsBanner) warningsBanner.style.display = "none";
  if (tabWarningsCount) tabWarningsCount.textContent = "0";
  statPages.textContent = "0";
  statPdfs.textContent = "0";
  statImages.textContent = "0";
  statEmails.textContent = "0";
  statQueue.textContent = "1";
  tabEmailsCount.textContent = "0";
  tabPdfsCount.textContent = "0";
  tabImagesCount.textContent = "0";
  searchInput.value = "";
  searchInput.style.display = "none";
  exportBtn.disabled = true;
  copyBtn.disabled = true;
  copyPathBtn.disabled = true;
  copyPdfLinksBtn.disabled = true;
  copyImageLinksBtn.disabled = true;
  copyAllUnifiedBtn.disabled = true;

  startBtn.style.display = "none";
  stopBtn.style.display = "inline-flex";
  isCrawling = true;
  startHeartbeat();
  statusText.textContent = "Connecting to website and discovering pages...";

  let initialFindings = [];
  let initialLinks = [];

  // Harvest DOM from currently active tab if URLs match
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
      ocrImages: ocrImagesCheckbox.checked,
      ocrPdfs: ocrImagesCheckbox.checked,
      skipProductDetailPages: skipProductDetailsCheckbox.checked,
      checkPdfs: checkPdfsCheckbox.checked,
      includeSubdomains: includeSubdomainsCheckbox.checked,
      initialFindings,
      initialLinks
    },
    (response) => {
      if (chrome.runtime.lastError) {
        isCrawling = false;
        startBtn.style.display = "inline-flex";
        stopBtn.style.display = "none";
        stopHeartbeat();
        statusText.textContent = `Error: ${chrome.runtime.lastError.message}`;
        return;
      }

      if (!response || !response.ok) {
        isCrawling = false;
        startBtn.style.display = "inline-flex";
        stopBtn.style.display = "none";
        stopHeartbeat();
        statusText.textContent = `Failed: ${response?.error || "Unknown error"}`;
        return;
      }

      // Crawl started successfully in the background worker.
      // All findings, progress, and completion are handled reactively by onMessage listeners.
    }
  );
});

// Stop Crawl
stopBtn.addEventListener("click", () => {
  isCrawling = false;
  stopHeartbeat();
  pdfProcessingQueue.length = 0;
  imageProcessingQueue.length = 0;
  stopBtn.style.display = "none";
  startBtn.style.display = "inline-flex";
  statusText.textContent = "Crawl stopped by user.";
  ocrStatus.style.display = "none";
  updateActionButtons();
  chrome.runtime.sendMessage({ type: "STOP_CRAWL" }, () => {});
});

// UNIFIED COPY ALL: Emails + PDFs + Images with Multi-Source URLs
copyAllUnifiedBtn.addEventListener("click", () => {
  if (currentFindings.length === 0 && currentPdfs.length === 0 && currentImages.length === 0) return;

  const sections = [];

  if (currentFindings.length > 0) {
    sections.push(`=== EXTRACTED EMAILS (${currentFindings.length}) ===\nemail\ttype\toccurrences\tmain_website_page\tdirect_source_url\tall_sources`);
    const emailLines = currentFindings
      .map((f) => {
        const allSrcStr = f.sources ? f.sources.map((s) => `[${s.sourceType}] ${s.sourceUrl}`).join(" | ") : f.sourceUrl;
        return `${f.email}\t${f.sourceType}\t${f.occurrences || 1}\t${f.mainPageUrl || f.sourceUrl}\t${f.sourceUrl}\t${allSrcStr}`;
      })
      .join("\n");
    sections.push(emailLines);
  }

  if (currentPdfs.length > 0) {
    sections.push(`\n=== DISCOVERED PDF FILES (${currentPdfs.length}) ===\nmain_website_page\tdirect_pdf_url\tstatus`);
    const pdfLines = currentPdfs
      .map((p) => `${p.sourcePage || "-"}\t${p.url}\t${p.status}`)
      .join("\n");
    sections.push(pdfLines);
  }

  if (currentImages.length > 0) {
    sections.push(`\n=== DISCOVERED IMAGES (${currentImages.length}) ===\nmain_website_page\tdirect_image_url\tstatus`);
    const imgLines = currentImages
      .map((img) => `${img.sourcePage || "-"}\t${img.url}\t${img.status}`)
      .join("\n");
    sections.push(imgLines);
  }

  navigator.clipboard.writeText(sections.join("\n")).then(() => {
    const orig = copyAllUnifiedBtn.textContent;
    copyAllUnifiedBtn.textContent = "✓ Copied All (Emails + PDFs + Images)!";
    setTimeout(() => {
      copyAllUnifiedBtn.textContent = orig;
    }, 1500);
  });
});

// Copy with Path: Copies items with both Main Page URL and direct file URL
copyPathBtn.addEventListener("click", () => {
  const lines = [];

  if (currentFindings.length > 0) {
    for (const f of currentFindings) {
      const allSrcStr = f.sources && f.sources.length > 1
        ? ` | All Sources: ${f.sources.map((s) => `[${s.sourceType}] ${s.sourceUrl}`).join(", ")}`
        : "";
      lines.push(`${f.email}\tMain Page: ${f.mainPageUrl || f.sourceUrl}\tSource: ${f.sourceUrl}${allSrcStr}`);
    }
  }

  if (currentPdfs.length > 0) {
    for (const p of currentPdfs) {
      lines.push(`[PDF]\tMain Page: ${p.sourcePage || "-"}\tDownload: ${p.url}\tStatus: ${p.status}`);
    }
  }

  if (currentImages.length > 0) {
    for (const img of currentImages) {
      lines.push(`[IMAGE]\tMain Page: ${img.sourcePage || "-"}\tDirect: ${img.url}\tStatus: ${img.status}`);
    }
  }

  if (lines.length === 0) return;

  navigator.clipboard.writeText(lines.join("\n")).then(() => {
    const orig = copyPathBtn.textContent;
    copyPathBtn.textContent = "✓ Copied with Path & Main URL!";
    setTimeout(() => {
      copyPathBtn.textContent = orig;
    }, 1500);
  });
});

// Copy Emails Only
copyBtn.addEventListener("click", () => {
  if (currentFindings.length === 0) return;
  const uniqueEmails = Array.from(new Set(currentFindings.map((f) => f.email))).join("\n");
  navigator.clipboard.writeText(uniqueEmails).then(() => {
    const orig = copyBtn.textContent;
    copyBtn.textContent = "✓ Copied Emails!";
    setTimeout(() => {
      copyBtn.textContent = orig;
    }, 1500);
  });
});

// Copy PDF Links with Main Site Origin
copyPdfLinksBtn.addEventListener("click", () => {
  if (currentPdfs.length === 0) return;
  const lines = currentPdfs
    .map((p) => `${p.sourcePage || "-"}\t${p.url}\t${p.status}`)
    .join("\n");
  navigator.clipboard.writeText(lines).then(() => {
    const orig = copyPdfLinksBtn.textContent;
    copyPdfLinksBtn.textContent = "✓ Copied PDF Links!";
    setTimeout(() => {
      copyPdfLinksBtn.textContent = orig;
    }, 1500);
  });
});

// Copy Image Links with Main Site Origin
copyImageLinksBtn.addEventListener("click", () => {
  if (currentImages.length === 0) return;
  const lines = currentImages
    .map((img) => `${img.sourcePage || "-"}\t${img.url}\t${img.status}`)
    .join("\n");
  navigator.clipboard.writeText(lines).then(() => {
    const orig = copyImageLinksBtn.textContent;
    copyImageLinksBtn.textContent = "✓ Copied Image Links!";
    setTimeout(() => {
      copyImageLinksBtn.textContent = orig;
    }, 1500);
  });
});

// Export CSV: Multi-source email support
exportBtn.addEventListener("click", () => {
  if (currentFindings.length === 0 && currentPdfs.length === 0 && currentImages.length === 0) return;

  const rows = [];
  rows.push('"record_type","email_or_file","source_type","occurrences","main_site_page","direct_file_url","all_sources","status"');

  for (const f of currentFindings) {
    const allSrcStr = f.sources ? f.sources.map((s) => `[${s.sourceType}] ${s.sourceUrl}`).join(" | ") : f.sourceUrl;
    rows.push(
      `"EMAIL","${f.email.replace(/"/g, '""')}","${f.sourceType.replace(/"/g, '""')}","${f.occurrences || 1}","${(f.mainPageUrl || f.sourceUrl).replace(/"/g, '""')}","${f.sourceUrl.replace(/"/g, '""')}","${allSrcStr.replace(/"/g, '""')}","Active"`
    );
  }

  for (const p of currentPdfs) {
    rows.push(
      `"PDF_FILE","${p.url.replace(/"/g, '""')}","PDF_DOCUMENT","1","${(p.sourcePage || "").replace(/"/g, '""')}","${p.url.replace(/"/g, '""')}","${p.url.replace(/"/g, '""')}","${(p.status || "").replace(/"/g, '""')}"`
    );
  }

  for (const img of currentImages) {
    rows.push(
      `"IMAGE_FILE","${img.url.replace(/"/g, '""')}","IMAGE_GRAPHIC","1","${(img.sourcePage || "").replace(/"/g, '""')}","${img.url.replace(/"/g, '""')}","${img.url.replace(/"/g, '""')}","${(img.status || "").replace(/"/g, '""')}"`
    );
  }

  downloadCsv(rows.join("\n"), `crawl_report_${new Date().toISOString().slice(0, 10)}.csv`);
});

function downloadCsv(csvContent, filename) {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ═══════════════════════════════════════════════════════════════════════
// 8. PERSISTENT WINDOW MODE, TAB URL DETECTION & DOM HARVESTING
// ═══════════════════════════════════════════════════════════════════════

async function detectActiveTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url && tab.url.startsWith("http")) return tab;
  } catch {}

  try {
    const normalWindows = await chrome.windows.getAll({ windowTypes: ["normal"], populate: true });
    for (const win of normalWindows) {
      if (win.focused) {
        const activeTab = win.tabs && win.tabs.find((t) => t.active);
        if (activeTab && activeTab.url && activeTab.url.startsWith("http")) return activeTab;
      }
    }
    for (const win of normalWindows) {
      const activeTab = win.tabs && win.tabs.find((t) => t.active);
      if (activeTab && activeTab.url && activeTab.url.startsWith("http")) return activeTab;
    }
  } catch {}

  try {
    const allTabs = await chrome.tabs.query({});
    const httpTab = allTabs.find(
      (t) => t.url && t.url.startsWith("http") && !t.url.includes("chrome-extension://")
    );
    if (httpTab) return httpTab;
  } catch {}

  return null;
}

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
      const emails = [
        ...new Set([
          ...normalizeAndExtractEmails(res.text),
          ...normalizeAndExtractEmails(res.html)
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

async function detectActiveTabUrl() {
  const tab = await detectActiveTab();
  return tab && tab.url ? tab.url : "";
}

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
    width: 950,
    height: 800,
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

// Synchronize state with background service worker on load (survives popup reopening)
chrome.runtime.sendMessage({ type: "GET_CRAWL_STATUS" }, (res) => {
  if (chrome.runtime.lastError || !res || !res.ok) return;

  if (res.findings && res.findings.length > 0) {
    for (const f of res.findings) {
      registerFoundEmail(f);
    }
    statEmails.textContent = currentFindings.length;
    tabEmailsCount.textContent = currentFindings.length;
  }

  if (res.discoveredPdfs && res.discoveredPdfs.length > 0) {
    for (const p of res.discoveredPdfs) {
      if (!currentPdfs.some((existing) => existing.url === p.url)) {
        currentPdfs.push(p);
      }
      // If PDF was discovered while popup was closed and is still pending, enqueue for processing
      if (!processedPdfUrls.has(p.url) && (p.status === "Queued" || p.status.includes("Rendering") || p.status.includes("Found"))) {
        enqueuePdfForProcessing({ pdfUrl: p.url, mainPageUrl: p.sourcePage, ocrPdfs: true });
      }
    }
    renderPdfRows(currentPdfs);
    tabPdfsCount.textContent = currentPdfs.length;
    statPdfs.textContent = `${res.stats ? res.stats.pdfsAvailable : currentPdfs.length} / ${currentPdfs.length}`;
  }

  if (res.discoveredImages && res.discoveredImages.length > 0) {
    for (const img of res.discoveredImages) {
      if (!currentImages.some((existing) => existing.url === img.url)) {
        currentImages.push(img);
      }
      // If image was discovered while popup was closed and is still pending, enqueue for OCR
      if (!processedImageUrls.has(img.url) && ocrImagesCheckbox.checked && (img.status === "Queued" || img.status.includes("Scanning") || img.status.includes("Downloading"))) {
        enqueueImageForProcessing({ imageUrl: img.url, mainPageUrl: img.sourcePage });
      }
    }
    renderImageRows(currentImages);
    tabImagesCount.textContent = currentImages.length;
    statImages.textContent = currentImages.length;
  }

  if (res.imageWarnings && res.imageWarnings.length > 0) {
    for (const w of res.imageWarnings) {
      registerImageWarning(w);
    }
  }

  if (res.siteRestrictedRecord) {
    showSiteRestricted(res.siteRestrictedRecord);
  }

  if (res.stats && res.stats.pagesCrawled) {
    statPages.textContent = res.stats.pagesCrawled;
  }

  if (res.isCrawling) {
    isCrawling = true;
    startBtn.style.display = "none";
    stopBtn.style.display = "inline-flex";
    statusText.textContent = "Crawling in progress...";
    startHeartbeat();
  } else {
    isCrawling = false;
    startBtn.style.display = "inline-flex";
    stopBtn.style.display = "none";
    stopHeartbeat();
    if (currentFindings.length > 0 || currentPdfs.length > 0) {
      statusText.textContent = `Completed! Extracted ${currentFindings.length} unique emails from ${statPages.textContent || 0} pages, ${currentPdfs.length} PDFs & ${currentImages.length} images.${currentWarnings.length > 0 ? ` ${currentWarnings.length} image warning(s).` : ""}`;
    }
  }

  updateActionButtons();
});

if (detectTabBtn) {
  detectTabBtn.addEventListener("click", async () => {
    const url = await detectActiveTabUrl();
    if (url) {
      if (targetUrlInput) targetUrlInput.value = url;
      statusText.textContent = `Target set to: ${url}`;
    } else {
      statusText.textContent = "No active web page detected. Please paste target URL manually.";
    }
  });
}

if (popoutWindowBtn) {
  popoutWindowBtn.addEventListener("click", () => {
    openPersistentWindow();
  });
}

if (closeWindowBtn) {
  closeWindowBtn.addEventListener("click", () => {
    window.close();
  });
}

if (alwaysWindowModeCheckbox) {
  chrome.storage.local.get(["alwaysWindowMode"], (data) => {
    if (data && data.alwaysWindowMode) {
      alwaysWindowModeCheckbox.checked = true;
    }
  });
  alwaysWindowModeCheckbox.addEventListener("change", () => {
    chrome.storage.local.set({ alwaysWindowMode: alwaysWindowModeCheckbox.checked });
  });
}
