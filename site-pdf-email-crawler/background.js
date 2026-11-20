// ═══════════════════════════════════════════════════════════════════════
// Site & PDF Email Detector — Background Service Worker (Manifest V3)
// Pure High-Speed Email Crawler & Deep PDF Text Extraction Engine
// ═══════════════════════════════════════════════════════════════════════

// Standard request headers for web pages and PDF streams
const STANDARD_FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
  "Pragma": "no-cache"
};

const PDF_FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "application/pdf,*/*",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache"
};

// Recognized ICANN Top-Level Domains (TLDs)
const VALID_TLDS = new Set([
  "com", "net", "org", "edu", "gov", "mil", "int", "io", "co", "ai", "app", "dev",
  "info", "biz", "me", "tv", "cc", "mobi", "name", "pro", "xyz", "online", "site",
  "tech", "store", "shop", "club", "space", "design", "agency", "digital", "group",
  "world", "live", "global", "solutions", "services", "expert", "company", "media",
  "in", "co.in", "net.in", "org.in", "us", "uk", "co.uk", "org.uk", "me.uk", "ca",
  "au", "com.au", "net.au", "org.au", "de", "fr", "it", "es", "nl", "eu", "ru",
  "ch", "at", "be", "dk", "se", "no", "fi", "pl", "cz", "ie", "pt", "gr", "ro",
  "hu", "bg", "hr", "sk", "si", "lt", "lv", "ee", "jp", "co.jp", "cn", "com.cn",
  "tw", "com.tw", "idv.tw", "hk", "com.hk", "sg", "com.sg", "my", "com.my", "kr",
  "co.kr", "br", "com.br", "mx", "com.mx", "ar", "com.ar", "cl", "co", "com.co",
  "pe", "za", "co.za", "nz", "co.nz", "ae", "sa", "tr", "il", "co.il", "th",
  "co.th", "vn", "ph", "com.ph", "id", "co.id", "pk", "com.pk", "ng", "com.ng",
  "eg", "ke", "asia", "lat", "africa", "swiss", "gmbh", "ltd", "inc", "corp"
]);

// Asset extensions that look like email endings but are file formats
const BAD_ASSET_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "tiff", "tif",
  "css", "js", "mjs", "cjs", "jsx", "ts", "tsx", "map", "json", "xml",
  "woff", "woff2", "ttf", "eot", "otf", "mp4", "mp3", "avi", "mov", "webm",
  "zip", "tar", "gz", "rar", "7z", "pdf", "doc", "docx", "xls", "xlsx",
  "ppt", "pptx", "exe", "apk", "dmg", "iso", "bin", "wasm", "word"
]);

// Placeholder / dummy emails to discard
const DUMMY_EMAILS = new Set([
  "your@email.com", "you@example.com", "name@example.com", "user@domain.com",
  "email@example.com", "email@domain.com", "test@test.com", "admin@domain.com",
  "info@domain.com", "support@domain.com", "contact@domain.com", "sample@email.com",
  "someone@example.com", "john.doe@example.com", "jane.doe@example.com"
]);

// File extensions to skip during HTML page crawling
const SKIP_EXT_REGEX = /\.(css|js|jsx|ts|tsx|map|json|xml|rss|atom|woff|woff2|ttf|eot|otf|mp4|webm|ogv|avi|mov|mp3|ogg|wav|flac|aac|zip|tar|gz|bz2|rar|7z|dmg|exe|msi|bin|iso|apk|ipa|wasm|jpg|jpeg|png|gif|webp|svg|bmp|ico|tiff|tif)$/i;

// Paths to ignore
const IGNORE_PATH_REGEX = /\/(?:wp-includes|wp-json|xmlrpc\.php|cdn-cgi|cgi-bin|node_modules|\.well-known)\//i;

// High priority contact/about pages
const HIGH_PRIORITY_REGEX = /(?:contact|about|enquiry|inquiry|reach-us|get-in-touch|support|feedback|connect|team|staff|office|location|imprint|impressum)/i;

// ═══════════════════════════════════════════════════════════════════════
// 1. STRICT EMAIL VALIDATION & DE-OBFUSCATION PIPELINE
// ═══════════════════════════════════════════════════════════════════════

function decodeCloudflareEmail(cfHex) {
  try {
    const k = parseInt(cfHex.slice(0, 2), 16);
    let str = "";
    for (let i = 2; i < cfHex.length; i += 2) {
      str += String.fromCharCode(parseInt(cfHex.slice(i, i + 2), 16) ^ k);
    }
    return str;
  } catch {
    return "";
  }
}

function decodeRot13(str) {
  return (str || "").replace(/[a-zA-Z]/g, (c) => {
    const b = c <= "Z" ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - b + 13) % 26) + b);
  });
}

function safeAtob(b64) {
  try {
    return atob(b64.trim());
  } catch {
    return "";
  }
}

function decodeHtmlEntities(str) {
  return (str || "")
    .replace(/&#([0-9]{1,7});/gi, (_, code) => {
      try {
        return String.fromCharCode(parseInt(code, 10));
      } catch {
        return "";
      }
    })
    .replace(/&#x([0-9a-f]{1,6});/gi, (_, hex) => {
      try {
        return String.fromCharCode(parseInt(hex, 16));
      } catch {
        return "";
      }
    })
    .replace(/&commat;/gi, "@")
    .replace(/&period;/gi, ".")
    .replace(/&colon;/gi, ":")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function isValidEmail(email) {
  if (!email || typeof email !== "string") return false;
  const clean = email.trim().toLowerCase();
  if (clean.length < 5 || clean.length > 254) return false;

  const atParts = clean.split("@");
  if (atParts.length !== 2) return false;
  const [local, domain] = atParts;
  if (!local || local.length < 1 || local.length > 64 || !domain) return false;

  // Local part checks
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

  // TLD check: must be recognized TLD (rejects fake TLDs like .word, assets like .png)
  const tld = domainLabels[domainLabels.length - 1];
  const isPunycode = tld.startsWith("xn--") && tld.length >= 5;
  const isKnownTld = VALID_TLDS.has(tld);
  if (!isKnownTld && !isPunycode) return false;

  if (BAD_ASSET_EXTENSIONS.has(tld)) return false;
  if (DUMMY_EMAILS.has(clean)) return false;

  return true;
}

function normalizeAndExtractEmails(rawText) {
  if (!rawText || typeof rawText !== "string") return [];

  const found = new Set();
  function checkAndAdd(candidate) {
    if (!candidate) return;
    let c = candidate.trim().toLowerCase();
    c = c.replace(/^[<(\["']+|[>)\]"',;:.!]+$/g, "");
    if (isValidEmail(c)) {
      found.add(c);
    }
  }

  // 1. Cloudflare __cf_email__ protected emails
  const cfRegex = /(?:data-cfemail=["']([0-9a-fA-F]+)["']|\/cdn-cgi\/l\/email-protection#([0-9a-fA-F]+))/gi;
  let cfMatch;
  while ((cfMatch = cfRegex.exec(rawText)) !== null) {
    const hex = cfMatch[1] || cfMatch[2];
    const decoded = decodeCloudflareEmail(hex);
    if (decoded) checkAndAdd(decoded);
  }

  // 2. Base64 mailto payloads
  const b64MailtoRegex = /(?:atob\(['"]|data-mailto=['"]|value=['"])([a-zA-Z0-9+/=]{16,100})['"]/gi;
  let b64Match;
  while ((b64Match = b64MailtoRegex.exec(rawText)) !== null) {
    const decoded = safeAtob(b64Match[1]);
    if (decoded && decoded.includes("@")) {
      for (const part of decoded.split(/[\s,"';<>]+/)) {
        checkAndAdd(part.replace(/^mailto:/i, ""));
      }
    }
  }

  // 3. ROT13 obfuscated emails
  const rot13Regex = /\b(?:rot13|nqqerff)\s*[:=]\s*['"]([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})['"]/gi;
  let r13Match;
  while ((r13Match = rot13Regex.exec(rawText)) !== null) {
    const dec = decodeRot13(r13Match[1]);
    if (dec) checkAndAdd(dec);
  }

  // 4. HTML entity and percent-encoding de-obfuscation
  let deobfuscated = decodeHtmlEntities(rawText);
  deobfuscated = deobfuscated
    .replace(/%40/gi, "@")
    .replace(/%2e/gi, ".")
    .replace(/%2f/gi, "/");

  // 5. HTML comments inside emails (e.g. info<!-- antispam -->@domain.com)
  deobfuscated = deobfuscated.replace(/<!--[\s\S]*?-->/g, "");

  // 6. Split elements (e.g. <span class="u">sales</span>@<span class="d">company.com</span>)
  deobfuscated = deobfuscated.replace(/<span[^>]*>([a-zA-Z0-9._%+-]+)<\/span>\s*@\s*<span[^>]*>([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})<\/span>/gi, "$1@$2");

  // 7. Human text obfuscation: [at], (at), {at}, AT, [dot], (dot), {dot}, DOT (handles multi-level domains)
  deobfuscated = deobfuscated
    .replace(/\s*(?:\[at\]|\(at\)|\{at\}|\[AT\]|\(AT\))\s*/g, "@")
    .replace(/\s*(?:\[dot\]|\(dot\)|\{dot\}|\[DOT\]|\(DOT\))\s*/g, ".")
    .replace(/\b([a-zA-Z0-9._%+-]+)\s+(?:at|AT)\s+([a-zA-Z0-9.-]+)\b/g, "$1@$2")
    .replace(/\b([a-zA-Z0-9-]+)\s+(?:dot|DOT)\s+([a-zA-Z]{2,24})\b/g, "$1.$2");

  // 8. Spaced emails: "info @ company . com"
  deobfuscated = deobfuscated.replace(
    /\b([a-zA-Z0-9._%+-]+(?:\s*\.\s*[a-zA-Z0-9._%+-]+)*)\s*@\s*([a-zA-Z0-9-]+(?:\s*\.\s*[a-zA-Z0-9-]+)*\s*\.\s*[a-zA-Z]{2,24})\b/g,
    (_, localPart, domainPart) => `${localPart.replace(/\s+/g, "")}@${domainPart.replace(/\s+/g, "")}`
  );

  // 9. Standard email extraction from cleaned text
  const cleanText = deobfuscated
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, " ")
    .replace(/<[^>]+>/g, " ");

  const standardRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,24}/g;
  const matches = cleanText.match(standardRegex) || [];
  for (const m of matches) {
    checkAndAdd(m);
  }

  // 10. Extract directly from mailto links
  const mailtoRegex = /href=["']mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,24})[^"']*["']/gi;
  let mtMatch;
  while ((mtMatch = mailtoRegex.exec(rawText)) !== null) {
    checkAndAdd(mtMatch[1]);
  }

  return Array.from(found);
}

// ═══════════════════════════════════════════════════════════════════════
// 2. URL SCOPE & LINK EXTRACTION HELPERS
// ═══════════════════════════════════════════════════════════════════════

function normalizeHost(h) {
  return (h || "").toLowerCase().replace(/^www\./, "");
}

function isUrlInScope(candidateUrl, baseOrigin, baseHostname, includeSubdomains = false) {
  try {
    const cObj = new URL(candidateUrl);
    const bObj = new URL(baseOrigin);

    if (cObj.protocol !== "http:" && cObj.protocol !== "https:") return false;

    const cHost = normalizeHost(cObj.hostname);
    const bHost = normalizeHost(baseHostname || bObj.hostname);

    if (cHost === bHost) return true;

    if (includeSubdomains) {
      if (cHost.endsWith("." + bHost)) return true;
    }

    return false;
  } catch {
    return false;
  }
}

function cleanAndNormalizeUrl(rawUrl, baseUrl) {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  const trimmed = rawUrl.trim();
  if (
    trimmed.startsWith("javascript:") ||
    trimmed.startsWith("mailto:") ||
    trimmed.startsWith("tel:") ||
    trimmed.startsWith("#") ||
    trimmed.startsWith("data:")
  ) {
    return null;
  }

  try {
    const resolved = new URL(trimmed, baseUrl);
    resolved.hash = "";
    return resolved.toString();
  } catch {
    return null;
  }
}

function extractAllLinksAndText(html) {
  const rawLinks = [];
  const directPdfCandidates = new Set();

  // 1. Regular <a> links
  const aRegex = /<a\b([^>]*)>(?:([\s\S]*?)<\/a>)?/gi;
  let aMatch;
  while ((aMatch = aRegex.exec(html)) !== null) {
    const attrs = aMatch[1] || "";
    const innerText = aMatch[2] || "";
    const hrefMatch = attrs.match(/\b(?:href|data-href|data-url)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const href = hrefMatch ? hrefMatch[1] || hrefMatch[2] || hrefMatch[3] : "";
    if (href) {
      const trimmed = href.trim();
      if (trimmed && !trimmed.startsWith("javascript:") && !trimmed.startsWith("#")) {
        rawLinks.push(trimmed);
        if (/\.pdf\b/i.test(innerText) || /\.pdf(\?|$)/i.test(trimmed)) {
          directPdfCandidates.add(trimmed);
        }
      }
    }
  }

  // 2. Embedded elements: iframe, embed, object, link
  const embRegex = /<(?:iframe|embed|object|link)\b[^>]*(?:\bsrc|\bdata|\bhref)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>/gi;
  let embMatch;
  while ((embMatch = embRegex.exec(html)) !== null) {
    const src = embMatch[1] || embMatch[2] || embMatch[3] || "";
    if (src) {
      const trimmed = src.trim();
      if (trimmed && !trimmed.startsWith("javascript:") && !trimmed.startsWith("#")) {
        rawLinks.push(trimmed);
        if (/\.pdf(\?|$)/i.test(trimmed)) {
          directPdfCandidates.add(trimmed);
        }
      }
    }
  }

  // 3. Schema.org JSON-LD structured data
  const jsonLdRegex = /<script\b[^>]*\btype=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let jMatch;
  while ((jMatch = jsonLdRegex.exec(html)) !== null) {
    const rawJson = jMatch[1];
    if (rawJson) {
      const urlMatches = rawJson.match(/"(?:url|sameAs)":\s*(?:"([^"]+)"|\[([^\]]+)\])/gi);
      if (urlMatches) {
        for (const um of urlMatches) {
          const links = um.match(/https?:\/\/[^\s"',]+/gi);
          if (links) rawLinks.push(...links);
        }
      }
    }
  }

  const cleanHtml = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, " ");

  const text = cleanHtml.replace(/<[^>]+>/g, " ");
  return { text, rawLinks, directPdfCandidates };
}

// ═══════════════════════════════════════════════════════════════════════
// 3. FAST CONCURRENT SITEMAP & ROBOTS.TXT DISCOVERY
// ═══════════════════════════════════════════════════════════════════════

async function probeSitemaps(baseOrigin, abortSignal) {
  const discovered = [];
  const baseEndpoints = [
    `${baseOrigin}/sitemap.xml`,
    `${baseOrigin}/robots.txt`
  ];

  function getSignal(ms) {
    if (typeof AbortSignal !== "undefined" && typeof AbortSignal.any === "function") {
      return abortSignal
        ? AbortSignal.any([AbortSignal.timeout(ms), abortSignal])
        : AbortSignal.timeout(ms);
    }
    return AbortSignal.timeout(ms);
  }

  const seen = new Set();
  const promises = baseEndpoints.map(async (endpoint) => {
    try {
      if (abortSignal && abortSignal.aborted) return;
      const res = await fetch(endpoint, {
        credentials: "omit",
        headers: { "Accept": "text/xml,application/xml,text/plain,*/*" },
        signal: getSignal(1500)
      });
      if (!res.ok) return;
      const text = await res.text();
      if (!text || text.length < 20) return;

      if (endpoint.endsWith("robots.txt")) {
        const smMatches = text.match(/^\s*Sitemap:\s*(https?:\/\/[^\s]+)/gim);
        if (smMatches) {
          for (const sm of smMatches.slice(0, 3)) {
            const smUrl = sm.replace(/^\s*Sitemap:\s*/i, "").trim();
            if (smUrl && !seen.has(smUrl)) {
              seen.add(smUrl);
              discovered.push(smUrl);
            }
          }
        }
        return;
      }

      // Check for sitemap index or standard urls
      const subSitemaps = text.match(/<sitemap>[\s\S]*?<loc>([^<]+)<\/loc>[\s\S]*?<\/sitemap>/gi);
      if (subSitemaps && subSitemaps.length > 0) {
        for (const s of subSitemaps.slice(0, 3)) {
          const locMatch = s.match(/<loc>([^<]+)<\/loc>/i);
          if (locMatch && locMatch[1]) {
            const u = locMatch[1].trim();
            if (!seen.has(u)) {
              seen.add(u);
              discovered.push(u);
            }
          }
        }
      } else {
        const locs = text.match(/<loc>([^<]+)<\/loc>/gi) || [];
        for (const l of locs.slice(0, 300)) {
          const u = l.replace(/<\/?loc>/gi, "").trim();
          if (u && !seen.has(u)) {
            seen.add(u);
            discovered.push(u);
          }
        }
      }
    } catch {}
  });

  await Promise.allSettled(promises);
  return discovered;
}

// ═══════════════════════════════════════════════════════════════════════
// 4. CORPORATE SISTER DOMAIN & TLD DISCOVERY
// ═══════════════════════════════════════════════════════════════════════

function generateSisterDomains(domain) {
  const norm = (domain || "").toLowerCase().replace(/^www\./, "");
  const parts = norm.split(".");
  if (parts.length < 2) return [];

  const sld = parts[0];
  const tld = parts.slice(1).join(".");
  const candidates = new Set();

  if (tld === "com") {
    candidates.add(`${sld}.in`);
    candidates.add(`${sld}.co.in`);
    candidates.add(`${sld}.co.uk`);
    candidates.add(`${sld}.de`);
  } else if (tld === "in" || tld === "co.in") {
    candidates.add(`${sld}.com`);
  } else if (tld === "co.uk") {
    candidates.add(`${sld}.com`);
  } else if (tld === "de") {
    candidates.add(`${sld}.com`);
  }

  candidates.delete(norm);
  return Array.from(candidates).slice(0, 4);
}

async function discoverSisterDomainEmails(startUrl, companyKeywords) {
  try {
    const startObj = new URL(startUrl);
    const sisterDomains = generateSisterDomains(startObj.hostname);
    if (!sisterDomains.length) return [];

    const foundEmails = new Map();
    const promises = sisterDomains.map(async (domain) => {
      const testUrls = [`https://www.${domain}/`, `https://${domain}/`];
      for (const tUrl of testUrls) {
        try {
          const res = await fetch(tUrl, {
            credentials: "omit",
            headers: STANDARD_FETCH_HEADERS,
            signal: AbortSignal.timeout(2000)
          });
          if (res.ok) {
            const html = await res.text();
            if (html && html.length > 500) {
              const lowerHtml = html.toLowerCase();
              const matches =
                companyKeywords.length === 0 ||
                companyKeywords.some((kw) => kw.length >= 4 && lowerHtml.includes(kw.toLowerCase()));
              if (matches) {
                const extracted = normalizeAndExtractEmails(html);
                for (const em of extracted) {
                  foundEmails.set(em, { email: em, sourceUrl: tUrl, domain });
                }
                if (foundEmails.size > 0) break;
              }
            }
          }
        } catch {}
      }
    });

    await Promise.allSettled(promises);
    return Array.from(foundEmails.values());
  } catch {
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 5. PRODUCTION CRAWLER EXECUTION CORE
// ═══════════════════════════════════════════════════════════════════════

let activeCrawl = null;
let lastCompletedCrawl = null;

let lastProgressEmitTime = 0;
function emitProgress(data) {
  const now = Date.now();
  if (now - lastProgressEmitTime < 100 && (data.queueRemaining ?? 0) !== 0) return;
  lastProgressEmitTime = now;
  chrome.runtime.sendMessage({ type: "CRAWL_PROGRESS", ...data }).catch(() => {});
}

function emitEmailFound(finding) {
  chrome.runtime.sendMessage({ type: "EMAIL_FOUND", finding }).catch(() => {});
}

async function runProductionCrawl(crawlState) {
  const { startUrl, maxPages, concurrency, checkPdfs, includeSubdomains, initialFindings, initialLinks } = crawlState;
  const startObj = new URL(startUrl);
  let baseOrigin = startObj.origin;
  let baseHostname = startObj.hostname;

  const crawlAbortController = new AbortController();
  crawlState.abortController = crawlAbortController;

  function createFetchSignal(timeoutMs = 4500) {
    if (typeof AbortSignal !== "undefined" && typeof AbortSignal.any === "function") {
      return AbortSignal.any([AbortSignal.timeout(timeoutMs), crawlAbortController.signal]);
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const onCrawlAbort = () => { clearTimeout(timer); ctrl.abort(); };
    crawlAbortController.signal.addEventListener("abort", onCrawlAbort, { once: true });
    return ctrl.signal;
  }

  const initialUrl = cleanAndNormalizeUrl(startUrl, startUrl);
  const htmlQueue = [initialUrl];
  const pdfQueue = [];

  const enqueuedHtmlUrls = new Set([initialUrl]);
  const enqueuedPdfUrls = new Set();
  const visitedUrls = new Set();
  const visitedPdfs = new Set();

  const discoveredCompanyKeywords = new Set();
  const findingsMap = new Map();
  const findings = [];

  crawlState.findings = findings;
  crawlState.visitedUrls = visitedUrls;
  crawlState.visitedPdfs = visitedPdfs;

  function recordCleanEmail(email, sourceUrl, sourceType, mainPageUrl) {
    if (!email || !isValidEmail(email)) return;
    const existing = findingsMap.get(email);
    const nowStr = new Date().toISOString();
    const sourceEntry = {
      sourceType: sourceType || "HTML",
      sourceUrl: sourceUrl || startUrl,
      mainPageUrl: mainPageUrl || sourceUrl || startUrl,
      timestamp: nowStr
    };

    if (existing) {
      const alreadyHasSource = existing.sources.some(
        (s) => s.sourceUrl === sourceEntry.sourceUrl && s.sourceType === sourceEntry.sourceType
      );
      if (!alreadyHasSource) {
        existing.sources.push(sourceEntry);
        existing.occurrences = existing.sources.length;
        emitEmailFound(existing);
      }
    } else {
      const item = {
        email,
        sourceType: sourceType || "HTML",
        sourceUrl: sourceUrl || startUrl,
        mainPageUrl: mainPageUrl || sourceUrl || startUrl,
        occurrences: 1,
        sources: [sourceEntry]
      };
      findingsMap.set(email, item);
      findings.push(item);
      emitEmailFound(item);
    }
  }

  function enqueuePdf(rawPdfUrl, sourcePage) {
    if (!checkPdfs) return;
    const pdfUrl = cleanAndNormalizeUrl(rawPdfUrl, sourcePage);
    if (!pdfUrl) return;
    if (visitedPdfs.has(pdfUrl) || enqueuedPdfUrls.has(pdfUrl)) return;

    enqueuedPdfUrls.add(pdfUrl);
    pdfQueue.push({ url: pdfUrl, sourcePage: sourcePage || startUrl });
  }

  // Ingest initial findings from active tab DOM harvest
  if (Array.isArray(initialFindings)) {
    for (const f of initialFindings) {
      if (f && f.email) {
        recordCleanEmail(f.email, f.sourceUrl, f.sourceType || "HTML (Live Tab)", f.mainPageUrl);
      }
    }
  }

  emitProgress({
    pagesCrawled: 0,
    pdfsCrawled: 0,
    queueRemaining: htmlQueue.length,
    currentUrl: initialUrl,
    findingsCount: findings.length
  });

  // Fast parallel sitemap pre-discovery: seeds site pages in < 1.5s
  try {
    const sitemapUrls = await probeSitemaps(baseOrigin, crawlAbortController.signal);
    const prioritySeeds = [];
    const normalSeeds = [];
    for (const smUrl of sitemapUrls) {
      if (crawlState.aborted) break;
      const cUrl = cleanAndNormalizeUrl(smUrl, startUrl);
      if (cUrl && isUrlInScope(cUrl, baseOrigin, baseHostname, includeSubdomains)) {
        if (cUrl.toLowerCase().endsWith(".pdf")) {
          if (checkPdfs) enqueuePdf(cUrl, startUrl);
          continue;
        }
        if (!enqueuedHtmlUrls.has(cUrl)) {
          enqueuedHtmlUrls.add(cUrl);
          if (HIGH_PRIORITY_REGEX.test(cUrl)) {
            prioritySeeds.push(cUrl);
          } else {
            normalSeeds.push(cUrl);
          }
        }
      }
    }
    if (prioritySeeds.length > 0) {
      htmlQueue.unshift(...prioritySeeds.slice(-500));
    }
    if (normalSeeds.length > 0 && htmlQueue.length < maxPages) {
      htmlQueue.push(...normalSeeds.slice(0, maxPages - htmlQueue.length));
    }
  } catch {}

  // Deep URL Navigation Seeding: root (/), language paths (/en/), contact & about pages
  try {
    const rawPath = startObj.pathname;
    if (rawPath && rawPath !== "/" && rawPath !== "") {
      const rootUrl = cleanAndNormalizeUrl(baseOrigin + "/", startUrl);
      if (rootUrl && !enqueuedHtmlUrls.has(rootUrl)) {
        enqueuedHtmlUrls.add(rootUrl);
        htmlQueue.push(rootUrl);
      }

      const langMatch = rawPath.match(/^\/([a-zA-Z]{2}(?:-[a-zA-Z]{2})?)(?:\/|$)/);
      const langPrefix = langMatch ? `/${langMatch[1]}/` : "/";
      if (langPrefix !== "/") {
        const langUrl = cleanAndNormalizeUrl(baseOrigin + langPrefix, startUrl);
        if (langUrl && !enqueuedHtmlUrls.has(langUrl)) {
          enqueuedHtmlUrls.add(langUrl);
          htmlQueue.push(langUrl);
        }
      }

      const standardContactPaths = [
        "contact.html", "contact-us.html", "contact_us.html", "contactus.html",
        "contacts.html", "about.html", "about-us.html", "about_us.html", "aboutus.html",
        "contact", "contact-us", "about", "about-us"
      ];

      for (const p of standardContactPaths) {
        if (langPrefix !== "/") {
          const lUrl = cleanAndNormalizeUrl(`${baseOrigin}${langPrefix}${p}`, startUrl);
          if (lUrl && !enqueuedHtmlUrls.has(lUrl)) {
            enqueuedHtmlUrls.add(lUrl);
            htmlQueue.push(lUrl);
          }
        }
        const rUrl = cleanAndNormalizeUrl(`${baseOrigin}/${p}`, startUrl);
        if (rUrl && !enqueuedHtmlUrls.has(rUrl)) {
          enqueuedHtmlUrls.add(rUrl);
          htmlQueue.push(rUrl);
        }
      }
    }
  } catch {}

  // Ingest initial links from active tab
  if (Array.isArray(initialLinks)) {
    for (const rawL of initialLinks) {
      if (crawlState.aborted) break;
      const cUrl = cleanAndNormalizeUrl(rawL, startUrl);
      if (cUrl && isUrlInScope(cUrl, baseOrigin, baseHostname, includeSubdomains)) {
        if (cUrl.toLowerCase().endsWith(".pdf")) {
          if (checkPdfs) enqueuePdf(cUrl, startUrl);
          continue;
        }
        if (!enqueuedHtmlUrls.has(cUrl) && htmlQueue.length + visitedUrls.size < maxPages) {
          enqueuedHtmlUrls.add(cUrl);
          if (HIGH_PRIORITY_REGEX.test(cUrl)) {
            htmlQueue.unshift(cUrl);
          } else {
            htmlQueue.push(cUrl);
          }
        }
      }
    }
  }

  // ── Worker Task Processor ──────────────────────────────────────────
  async function processTask(currentItem, mode) {
    if (crawlState.aborted) return;
    const currentUrl = mode === "html" ? currentItem : currentItem.url;

    emitProgress({
      pagesCrawled: visitedUrls.size,
      pdfsCrawled: visitedPdfs.size,
      queueRemaining: htmlQueue.length + pdfQueue.length,
      currentUrl,
      findingsCount: findings.length
    });

    // ── Process PDF Document: Fast In-Memory Text Stream Extraction ────
    if (mode === "pdf") {
      if (visitedPdfs.has(currentUrl)) return;
      visitedPdfs.add(currentUrl);

      const mainSitePage = currentItem.sourcePage || currentUrl;

      try {
        const res = await fetch(currentUrl, {
          credentials: "omit",
          headers: PDF_FETCH_HEADERS,
          signal: createFetchSignal(5000)
        });
        if (!res.ok) return;

        const contentType = (res.headers.get("content-type") || "").toLowerCase();
        if (contentType.includes("text/html")) return;

        const buffer = await res.arrayBuffer();
        if (buffer.byteLength < 50 || buffer.byteLength > 25 * 1024 * 1024) return;

        // In-Memory scan: extracts digital emails from raw PDF streams in ~5ms
        let extractedPdfEmails = [];
        try {
          const uint8 = new Uint8Array(buffer);
          let binaryStr = "";
          const chunkSize = 65536;
          const maxScanBytes = Math.min(uint8.length, 12 * 1024 * 1024);
          for (let i = 0; i < maxScanBytes; i += chunkSize) {
            const chunk = uint8.subarray(i, Math.min(i + chunkSize, maxScanBytes));
            binaryStr += String.fromCharCode.apply(null, chunk);
          }
          extractedPdfEmails = normalizeAndExtractEmails(binaryStr);
        } catch {}

        for (const em of extractedPdfEmails) {
          recordCleanEmail(em, currentUrl, "PDF Document", mainSitePage);
        }
      } catch {}
    }
    // ── Process HTML Web Page ─────────────────────────────────────────
    else {
      if (visitedUrls.has(currentUrl)) return;
      visitedUrls.add(currentUrl);

      let html = "";
      let finalUrl = currentUrl;

      try {
        if (SKIP_EXT_REGEX.test(currentUrl)) return;

        const res = await fetch(currentUrl, {
          credentials: "omit",
          headers: STANDARD_FETCH_HEADERS,
          signal: createFetchSignal(3500)
        });
        if (!res.ok) return;

        finalUrl = res.url || currentUrl;
        visitedUrls.add(finalUrl);

        if (currentUrl === initialUrl && finalUrl !== currentUrl) {
          try {
            const finalObj = new URL(finalUrl);
            if (normalizeHost(finalObj.hostname) !== normalizeHost(baseHostname)) {
              baseHostname = finalObj.hostname;
              baseOrigin = finalObj.origin;
            }
          } catch {}
        }

        const contentType = (res.headers.get("content-type") || "").toLowerCase();
        if (contentType.includes("application/pdf") || currentUrl.toLowerCase().endsWith(".pdf") || finalUrl.toLowerCase().endsWith(".pdf")) {
          enqueuePdf(finalUrl, currentUrl);
          return;
        }

        if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
          return;
        }

        html = await res.text();
      } catch {
        return;
      }

      const { text, rawLinks, directPdfCandidates } = extractAllLinksAndText(html);

      // Harvest brand keywords for sister-domain discovery
      const titleMatch = html.match(/<title\b[^>]*>(.*?)<\/title>/i);
      if (titleMatch && titleMatch[1]) {
        const parts = titleMatch[1].replace(/&amp;/g, "&").split(/[-–|,;:]+/);
        if (parts[0] && parts[0].trim().length >= 3) {
          discoveredCompanyKeywords.add(parts[0].trim());
        }
      }

      // Extract all emails from text, HTML source, and mailto links
      const textMatches = normalizeAndExtractEmails(text);
      const htmlMatches = normalizeAndExtractEmails(html);
      const allMatches = new Set([...textMatches, ...htmlMatches]);
      for (const m of allMatches) {
        recordCleanEmail(m, finalUrl, "HTML", finalUrl);
      }

      // Enqueue child links & PDFs
      for (const rawLink of rawLinks) {
        if (!rawLink) continue;

        if (rawLink.toLowerCase().startsWith("mailto:")) {
          try {
            const rawMailto = decodeURIComponent(rawLink);
            const emailsInMailto = normalizeAndExtractEmails(rawMailto);
            for (const em of emailsInMailto) {
              recordCleanEmail(em, finalUrl, "HTML (mailto)", finalUrl);
            }
          } catch {}
          continue;
        }

        const cleanUrl = cleanAndNormalizeUrl(rawLink, finalUrl);
        if (!cleanUrl) continue;

        // Check if link points to a PDF file on any domain
        if (directPdfCandidates.has(rawLink) || cleanUrl.toLowerCase().endsWith(".pdf")) {
          enqueuePdf(cleanUrl, finalUrl);
          continue;
        }

        if (SKIP_EXT_REGEX.test(cleanUrl)) continue;
        if (IGNORE_PATH_REGEX.test(cleanUrl)) continue;

        if (!isUrlInScope(cleanUrl, baseOrigin, baseHostname, includeSubdomains)) {
          continue;
        }

        if (visitedUrls.has(cleanUrl) || enqueuedHtmlUrls.has(cleanUrl)) {
          continue;
        }

        const isPriority = HIGH_PRIORITY_REGEX.test(cleanUrl);
        const hardCap = isPriority ? Math.ceil(maxPages * 1.1) : maxPages;
        if (visitedUrls.size + htmlQueue.length < hardCap) {
          enqueuedHtmlUrls.add(cleanUrl);
          if (isPriority) {
            htmlQueue.unshift(cleanUrl);
          } else {
            htmlQueue.push(cleanUrl);
          }
        }
      }
    }
  }

  // ── Worker Pool ────────────────────────────────────────────────────
  const poolSize = Math.min(16, Math.max(1, concurrency || 8));
  let activeWorkersCount = 0;
  let activePdfWorkers = 0;
  let allWorkCompleted = false;

  function getNextTask() {
    if (crawlState.aborted) return null;

    const maxPdfWorkers = Math.max(1, Math.min(4, Math.floor(poolSize / 3)));

    // When maxPages reached, discard unprocessable HTML items immediately
    if (visitedUrls.size >= maxPages && htmlQueue.length > 0) {
      htmlQueue.length = 0;
    }

    // 1. PDF dispatch
    if (checkPdfs && pdfQueue.length > 0 && activePdfWorkers < maxPdfWorkers) {
      return { currentItem: pdfQueue.shift(), mode: "pdf" };
    }

    // 2. HTML dispatch
    if (htmlQueue.length > 0 && visitedUrls.size < maxPages) {
      return { currentItem: htmlQueue.shift(), mode: "html" };
    }

    // 3. Drain remaining PDFs when HTML is done
    if (checkPdfs && pdfQueue.length > 0) {
      return { currentItem: pdfQueue.shift(), mode: "pdf" };
    }

    return null;
  }

  async function workerThread() {
    while (!crawlState.aborted && !allWorkCompleted) {
      const task = getNextTask();

      if (!task) {
        if (activeWorkersCount > 0) {
          await new Promise((r) => setTimeout(r, 40));
          continue;
        }

        // Grace period check
        await new Promise((r) => setTimeout(r, 100));
        if (crawlState.aborted || allWorkCompleted) break;
        if (htmlQueue.length > 0 || pdfQueue.length > 0) continue;
        if (activeWorkersCount > 0) continue;

        allWorkCompleted = true;
        break;
      }

      activeWorkersCount++;
      if (task.mode === "pdf") activePdfWorkers++;

      try {
        await processTask(task.currentItem, task.mode);
      } catch (err) {
        console.warn("Worker error:", err);
      } finally {
        activeWorkersCount--;
        if (task.mode === "pdf") activePdfWorkers--;
      }
    }
  }

  const workerPromises = [];
  for (let w = 0; w < poolSize; w++) {
    workerPromises.push(workerThread());
  }

  await Promise.all(workerPromises);

  // ── Sister Domain Fallback Probe ───────────────────────────────────
  if (findings.length === 0 && !crawlState.aborted) {
    emitProgress({
      pagesCrawled: visitedUrls.size,
      pdfsCrawled: visitedPdfs.size,
      queueRemaining: 0,
      currentUrl: "Probing company domain records & sister TLDs...",
      findingsCount: findings.length
    });

    const fallbackList = await discoverSisterDomainEmails(
      startUrl,
      Array.from(discoveredCompanyKeywords)
    );

    for (const item of fallbackList) {
      recordCleanEmail(item.email, item.sourceUrl, `Sister Domain (${item.domain})`, startUrl);
    }
  }

  emitProgress({
    pagesCrawled: visitedUrls.size,
    pdfsCrawled: visitedPdfs.size,
    queueRemaining: 0,
    currentUrl: "Completed",
    findingsCount: findings.length
  });

  return {
    pagesCrawled: visitedUrls.size,
    pdfsChecked: visitedPdfs.size,
    aborted: crawlState.aborted,
    findings
  };
}

// ═══════════════════════════════════════════════════════════════════════
// 6. EXTENSION RUNTIME MESSAGE DISPATCHER
// ═══════════════════════════════════════════════════════════════════════

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "START_CRAWL") {
    if (activeCrawl && activeCrawl.isCrawling) {
      if (activeCrawl.abortController) {
        activeCrawl.abortController.abort();
      }
      activeCrawl.aborted = true;
      activeCrawl.isCrawling = false;
    }

    const crawlState = {
      aborted: false,
      startUrl: msg.startUrl,
      maxPages: msg.maxPages || 500,
      concurrency: msg.concurrency || 8,
      checkPdfs: msg.checkPdfs !== false,
      includeSubdomains: !!msg.includeSubdomains,
      initialFindings: msg.initialFindings || [],
      initialLinks: msg.initialLinks || [],
      isCrawling: true
    };
    activeCrawl = crawlState;

    sendResponse({ ok: true, started: true });

    runProductionCrawl(crawlState)
      .then((data) => {
        lastCompletedCrawl = { ...data, isCrawling: false };
        if (activeCrawl === crawlState) activeCrawl = null;
        chrome.runtime.sendMessage({ type: "CRAWL_COMPLETED", data: lastCompletedCrawl }).catch(() => {});
      })
      .catch((err) => {
        if (activeCrawl === crawlState) activeCrawl = null;
        chrome.runtime.sendMessage({ type: "CRAWL_FAILED", error: err.message }).catch(() => {});
      });

    return false;
  }

  if (msg.type === "STOP_CRAWL") {
    if (activeCrawl) {
      activeCrawl.aborted = true;
      activeCrawl.isCrawling = false;
      if (activeCrawl.abortController) {
        activeCrawl.abortController.abort();
      }
    }
    sendResponse({ ok: true, stopped: true });
    return false;
  }

  if (msg.type === "GET_CRAWL_STATUS") {
    if (activeCrawl) {
      sendResponse({
        ok: true,
        isCrawling: !!activeCrawl.isCrawling,
        aborted: !!activeCrawl.aborted,
        findings: activeCrawl.findings || [],
        stats: {
          pagesCrawled: activeCrawl.visitedUrls ? activeCrawl.visitedUrls.size : 0,
          pdfsChecked: activeCrawl.visitedPdfs ? activeCrawl.visitedPdfs.size : 0
        }
      });
    } else if (lastCompletedCrawl) {
      sendResponse({
        ok: true,
        isCrawling: false,
        aborted: !!lastCompletedCrawl.aborted,
        findings: lastCompletedCrawl.findings || [],
        stats: {
          pagesCrawled: lastCompletedCrawl.pagesCrawled || 0,
          pdfsChecked: lastCompletedCrawl.pdfsChecked || 0
        }
      });
    } else {
      sendResponse({ ok: true, isCrawling: false, findings: [], stats: { pagesCrawled: 0, pdfsChecked: 0 } });
    }
    return false;
  }

  if (msg.type === "PING") {
    sendResponse({ ok: true, isCrawling: !!(activeCrawl && activeCrawl.isCrawling) });
    return false;
  }

  return false;
});

