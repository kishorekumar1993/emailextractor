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
  "someone@example.com", "john.doe@example.com", "jane.doe@example.com",
  "name@email.co.uk", "name@company.com", "info@yourdomain.com", "sales@yourdomain.com",
  "contact@yourdomain.com", "user@company.com", "someone@domain.com"
]);

// Dummy and template domain patterns
const DUMMY_DOMAINS = new Set([
  "email.com", "email.co.uk", "example.com", "example.org", "example.net", "example.co.uk",
  "domain.com", "domain.co.uk", "sample.com", "sample.co.uk", "test.com", "test.co.uk", "testing.com",
  "yourdomain.com", "yourcompany.com", "yoursite.com", "mycompany.com", "company.com", "site.com",
  "website.com", "somedomain.com", "sentry.io", "wixpress.com", "wordpress.com", "cookiebot.com",
  "onetrust.com", "cloudflare.com", "gravatar.com"
]);

// Dummy local prefixes in web templates
const DUMMY_LOCAL_PREFIXES = new Set([
  "name", "yourname", "your-name", "your.name", "your_name", "your", "youremail", "your-email", "your.email",
  "user", "username", "someone", "placeholder", "sample", "test", "testing", "first.last", "fullname",
  "client", "recipient"
]);

// Compliance, GDPR, DPO, legal notices & automated daemon emails
const COMPLIANCE_LOCAL_REGEX = /^(?:gdpr|dpo|dpo_.*|groupdpo|nomarketing|no-marketing|unsubscribe|optout|opt-out|noreply|no-reply|donotreply|do-not-reply|mailer-daemon|auto-reply|dataprotection|data-protection|cookie|cookies|abuse|postmaster|webmaster|hostmaster)$/i;

// English stop words and verbs that falsely trigger on bare text de-obfuscation
const INVALID_LOCAL_PARTS = new Set([
  "or", "and", "the", "in", "at", "to", "for", "of", "on", "by", "as", "is", "it",
  "an", "be", "if", "so", "my", "no", "up", "we", "he", "do", "viewed", "available",
  "located", "registered", "hosted", "see", "look", "lookat", "held", "effective"
]);

// File extensions to skip during HTML page crawling
const SKIP_EXT_REGEX = /\.(css|js|jsx|ts|tsx|map|json|xml|rss|atom|woff|woff2|ttf|eot|otf|mp4|webm|ogv|avi|mov|mp3|ogg|wav|flac|aac|zip|tar|gz|bz2|rar|7z|dmg|exe|msi|bin|iso|apk|ipa|wasm|jpg|jpeg|png|gif|webp|svg|bmp|ico|tiff|tif)$/i;

// Paths to ignore (includes pure compliance, GDPR, cookie policy & terms pages)
const IGNORE_PATH_REGEX = /\/(?:wp-includes|wp-json|xmlrpc\.php|cdn-cgi|cgi-bin|node_modules|\.well-known|privacy-policy|privacy|cookie-policy|cookie-notice|cookies|terms-of-use|terms-of-service|terms-and-conditions|terms|legal-notice|legal|disclaimer|imprint-privacy|impressum-datenschutz|gdpr|dpo)\b/i;

// High priority contact, catalog, download, and about pages across all languages
const HIGH_PRIORITY_REGEX = /(?:contact|about|enquiry|inquiry|reach-us|get-in-touch|support|feedback|connect|team|staff|office|location|imprint|impressum|profile|catalog|catalogue|katalog|download|brochure|cert|spec|company|video|animation|media|tour|corp|exhibition|聯絡|關於|簡介|型錄|下載|影片|影音)/i;

// Contact image keywords to identify banners, certificates, business cards, and contact graphics
const CONTACT_IMAGE_KEYWORD_REGEX = /(?:contact|email|e-mail|mail|address|card|footer|header|banner|cert|certificate|duns|iso|reach|info|support|tel|phone|sales|service|corp|logo|letter|stamp|license|bizcard|vcard|about|inquiry|consult|agent|office|branch|touch|sign|badge|profile|brochure|catalog|qr|聯絡|信箱|郵件|名片|證書|證照|電話|諮詢)/i;
const SKIP_IMAGE_NAME_REGEX = /(?:@2x|@3x|icon|arrow|bullet|dot|pixel|avatar|emoji|spinner|placeholder|star|social|facebook|twitter|instagram|linkedin|youtube)\b/i;

function isContactCandidateImage(imgUrl, alt, title, pageUrl) {
  if (!imgUrl || typeof imgUrl !== "string") return false;
  const clean = imgUrl.split("?")[0].toLowerCase();
  if (SKIP_IMAGE_NAME_REGEX.test(clean)) return false;

  const hasImageExt = /\.(png|jpe?g|webp|bmp|gif|tiff?|svg)($|\?)/i.test(imgUrl);
  const looksLikeImagePath = /\/(?:images?|img|photos?|pics?|upload|assets?|static|media|files?|graphics?)\//i.test(imgUrl);
  if (!hasImageExt && !looksLikeImagePath) return false;

  // Direct email in image filename or query
  if (imgUrl.includes("@") || imgUrl.includes("%40") || /_at_|\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(imgUrl)) {
    return true;
  }

  const combined = `${imgUrl} ${alt || ""} ${title || ""}`.toLowerCase();
  if (CONTACT_IMAGE_KEYWORD_REGEX.test(combined)) return true;

  if (pageUrl && /(?:contact|about|touch|inquiry|profile|intro)/i.test(pageUrl)) {
    if (/(?:banner|card|header|cert|upload|files?|company|profile|duns|iso)/i.test(clean)) return true;
  }

  return false;
}

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

function isValidEmail(email, filterCompliance = true) {
  if (!email || typeof email !== "string") return false;
  const clean = email.trim().toLowerCase();
  if (clean.length < 5 || clean.length > 254) return false;

  const atParts = clean.split("@");
  if (atParts.length !== 2) return false;
  const [local, domain] = atParts;
  if (!local || local.length < 1 || local.length > 64 || !domain) return false;

  // Domain cannot start with www. or protocol prefix
  if (domain.startsWith("www.") || domain.startsWith("http.") || domain.startsWith("https.") || domain.startsWith("ftp.")) {
    return false;
  }

  // Local part checks
  if (!/^[a-z0-9](?:[a-z0-9._%+-]*[a-z0-9])?$/.test(local)) return false;
  if (local.includes("..")) return false;

  // Reject common English prepositions/verbs/stop words that falsely match sentences (e.g. or@all.it, viewed@...)
  if (INVALID_LOCAL_PARTS.has(local)) return false;

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

  // Reject dummy domains (email.com, email.co.uk, example.com, etc.)
  if (DUMMY_DOMAINS.has(domain)) return false;

  // Reject dummy local parts on generic domains
  if (DUMMY_LOCAL_PREFIXES.has(local)) return false;

  // Reject compliance / GDPR / DPO / unsubscribe / noreply emails
  if (filterCompliance && COMPLIANCE_LOCAL_REGEX.test(local)) return false;

  return true;
}

function normalizeAndExtractEmails(rawText, filterCompliance = true) {
  if (!rawText || typeof rawText !== "string") return [];

  // Hard cap — prevents catastrophic regex backtracking / high CPU on huge binary blobs or pages
  const MAX = 1_200_000; // 1.2 MB
  if (rawText.length > MAX) rawText = rawText.slice(0, MAX);

  const found = new Set();
  function checkAndAdd(candidate) {
    if (!candidate) return;
    let c = candidate.trim().toLowerCase();
    c = c.replace(/^[<(\["']+|[>)\]"',;:.!]+$/g, "");
    if (isValidEmail(c, filterCompliance)) {
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
  // NEVER replace bare lowercase 'at' or 'dot' as that corrupts English sentences like "viewed at www..." or "...or at all. It..."
  deobfuscated = deobfuscated
    .replace(/\s*(?:\[at\]|\(at\)|\{at\}|\[AT\]|\(AT\)|_at_|\/\*at\*\/)\s*/g, "@")
    .replace(/\s*(?:\[dot\]|\(dot\)|\{dot\}|\[DOT\]|\(DOT\)|_dot_|\/\*dot\*\/)\s*/g, ".")
    .replace(/\b([a-zA-Z0-9._%+-]{2,30})\s+(?:AT)\s+([a-zA-Z0-9.-]+\.[a-zA-Z]{2,24})\b/g, "$1@$2")
    .replace(/\b([a-zA-Z0-9-]+)\s+(?:DOT)\s+([a-zA-Z]{2,24})\b/g, "$1.$2");

  // 8. Spaced emails: "info @ company . com" (bounded, safe, no nested quantifiers)
  deobfuscated = deobfuscated.replace(
    /\b([a-zA-Z0-9_%+-]{1,40})\s*@\s*([a-zA-Z0-9-]{1,40})\s*\.\s*([a-zA-Z]{2,24})\b/g,
    "$1@$2.$3"
  );
  // Second pass for dotted local part e.g. "first . last @ domain . com" (safe bounded)
  deobfuscated = deobfuscated.replace(
    /\b([a-zA-Z0-9_%+-]{1,30})\s*\.\s*([a-zA-Z0-9_%+-]{1,30})\s*@\s*([a-zA-Z0-9-]{1,40})\s*\.\s*([a-zA-Z]{2,24})\b/g,
    "$1.$2@$3.$4"
  );

  // 8.5. Extract from raw HTML attributes: value="", content="", data-*, action="", alt="", title=""
  // (NOTE: EXCLUDE placeholder="" so dummy form placeholders like name@email.co.uk are never extracted!)
  const attrRegex = /\b(?:value|content|data-[a-z0-9_-]+|action|alt|title)=["']([^"']+)["']/gi;
  let attrMatch;
  while ((attrMatch = attrRegex.exec(rawText)) !== null) {
    const val = attrMatch[1];
    if (val && val.includes("@")) {
      for (const p of val.split(/[\s,;]+/)) {
        checkAndAdd(p.replace(/^mailto:/i, "").trim());
      }
    }
  }

  // 8.6. Extract from SVG text elements (<text>, <tspan>, <desc>, <title>)
  const svgTextRegex = /<(?:text|tspan|desc|title)\b[^>]*>([\s\S]*?)<\/(?:text|tspan|desc|title)>/gi;
  let svgMatch;
  while ((svgMatch = svgTextRegex.exec(rawText)) !== null) {
    const val = svgMatch[1];
    if (val && val.includes("@")) {
      const svgEmails = val.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,24}/g) || [];
      for (const em of svgEmails) checkAndAdd(em);
    }
  }

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

  // 10. Extract directly from all mailto links (handles cc, bcc, multi-recipient lists)
  const mailtoFullRegex = /\bmailto:([^\s"'<>]+)/gi;
  let mfMatch;
  while ((mfMatch = mailtoFullRegex.exec(rawText)) !== null) {
    try {
      const decodedMailto = decodeURIComponent(mfMatch[1]);
      for (const p of decodedMailto.split(/[\s,;?&=]+/)) {
        if (p.includes("@")) {
          checkAndAdd(p.replace(/^(?:to|cc|bcc):/i, "").trim());
        }
      }
    } catch {
      for (const p of mfMatch[1].split(/[\s,;?&=]+/)) {
        if (p.includes("@")) {
          checkAndAdd(p.replace(/^(?:to|cc|bcc):/i, "").trim());
        }
      }
    }
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

    // Official supplier storefront subdomains matching company SLD (e.g. soongiant.en.taiwantrade.com)
    const bSld = bHost.split(".")[0];
    if (bSld && bSld.length >= 4) {
      if (
        cHost.startsWith(`${bSld}.`) &&
        (cHost.includes("taiwantrade.com") || cHost.includes("alibaba.com") || cHost.includes("globalsources.com"))
      ) {
        return true;
      }
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

function extractAllLinksAndMedia(html) {
  const rawLinks = [];
  const directPdfCandidates = new Set();
  const imageCandidates = [];
  const videoLinks = [];

  // 1. Regular <a> links & data-href / data-url
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
        // Detect download script endpoints that serve documents/catalogs
        if (/(?:download_file\.asp|download\.php|getfile\.aspx|download\.aspx)\?[^"'\s>]*fid=/i.test(trimmed)) {
          directPdfCandidates.add(trimmed);
        }
        // Detect video / animation links
        if (/(?:youtube\.com\/watch|youtu\.be\/|vimeo\.com\/|youku\.com\/|bilibili\.com\/)/i.test(trimmed)) {
          videoLinks.push(trimmed);
        }
      }
    }
  }

  // 2. Embedded media: iframe, embed, object, video, source, track
  const embRegex = /<(?:iframe|embed|object|video|source|track|link)\b([^>]*)>/gi;
  let embMatch;
  while ((embMatch = embRegex.exec(html)) !== null) {
    const attrs = embMatch[1] || "";
    const srcMatch = attrs.match(/\b(?:src|data|href|poster|data-src|data-video)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const src = srcMatch ? srcMatch[1] || srcMatch[2] || srcMatch[3] : "";
    if (src) {
      const trimmed = src.trim();
      if (trimmed && !trimmed.startsWith("javascript:") && !trimmed.startsWith("#") && !trimmed.startsWith("data:")) {
        rawLinks.push(trimmed);
        if (/\.pdf(\?|$)/i.test(trimmed)) {
          directPdfCandidates.add(trimmed);
        }
        if (/(?:youtube\.com|youtu\.be|vimeo\.com|youku\.com|\.mp4|\.webm|\.m4v)/i.test(trimmed)) {
          videoLinks.push(trimmed);
        }
      }
    }
  }

  // 3. Images: img tags, picture sources, responsive srcset, background images, and meta images
  const imgRegex = /<img\b([^>]*)>/gi;
  let imgMatch;
  while ((imgMatch = imgRegex.exec(html)) !== null) {
    const attrs = imgMatch[1] || "";
    const srcMatch = attrs.match(/\b(?:src|data-src|data-original|data-lazy-src)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const altMatch = attrs.match(/\balt\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const titleMatch = attrs.match(/\btitle\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const imgSrc = srcMatch ? srcMatch[1] || srcMatch[2] || srcMatch[3] : "";
    const alt = altMatch ? altMatch[1] || altMatch[2] || altMatch[3] || "" : "";
    const title = titleMatch ? titleMatch[1] || titleMatch[2] || titleMatch[3] || "" : "";
    if (imgSrc && !imgSrc.startsWith("data:")) {
      imageCandidates.push({ url: imgSrc.trim(), alt, title });
    }

    // Responsive srcset attributes in <img>
    const srcsetMatch = attrs.match(/\b(?:srcset|data-srcset)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    if (srcsetMatch) {
      const srcsetValue = srcsetMatch[1] || srcsetMatch[2] || srcsetMatch[3] || "";
      for (const entry of srcsetValue.split(",")) {
        const candidate = entry.trim().split(/\s+/)[0];
        if (candidate && !candidate.startsWith("data:")) {
          imageCandidates.push({ url: candidate, alt, title });
        }
      }
    }
  }

  // <source> tags in <picture> or media elements
  const sourceRegex = /<source\b([^>]*)>/gi;
  let srcTagMatch;
  while ((srcTagMatch = sourceRegex.exec(html)) !== null) {
    const attrs = srcTagMatch[1] || "";
    const srcMatch = attrs.match(/\b(?:srcset|data-srcset|src)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const srcVal = srcMatch ? srcMatch[1] || srcMatch[2] || srcMatch[3] : "";
    if (srcVal && !srcVal.startsWith("data:")) {
      for (const entry of srcVal.split(",")) {
        const candidate = entry.trim().split(/\s+/)[0];
        if (candidate && !candidate.startsWith("data:")) {
          imageCandidates.push({ url: candidate, alt: "", title: "" });
        }
      }
    }
  }

  // OpenGraph, Twitter, and thumbnail meta images
  const metaImgRegex = /<meta\b[^>]*(?:property|name)\s*=\s*["'](?:og:image|twitter:image|thumbnail)["'][^>]*content\s*=\s*["']([^"']+)["']/gi;
  let metaImgMatch;
  while ((metaImgMatch = metaImgRegex.exec(html)) !== null) {
    const mUrl = metaImgMatch[1];
    if (mUrl && !mUrl.startsWith("data:")) {
      imageCandidates.push({ url: mUrl.trim(), alt: "meta-image", title: "" });
    }
  }

  // Inline CSS background images
  const bgImgRegex = /style\s*=\s*["'][^"']*url\(\s*(?:['"]?)([^'")]+)(?:['"]?)\s*\)[^"']*["']/gi;
  let bgImgMatch;
  while ((bgImgMatch = bgImgRegex.exec(html)) !== null) {
    const bgUrl = bgImgMatch[1];
    if (bgUrl && !bgUrl.startsWith("data:")) {
      imageCandidates.push({ url: bgUrl.trim(), alt: "background-image", title: "" });
    }
  }

  // 4. Schema.org JSON-LD structured data
  const jsonLdRegex = /<script\b[^>]*\btype=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let jMatch;
  while ((jMatch = jsonLdRegex.exec(html)) !== null) {
    const rawJson = jMatch[1];
    if (rawJson) {
      const urlMatches = rawJson.match(/"(?:url|sameAs|contentUrl|embedUrl)":\s*(?:"([^"]+)"|\[([^\]]+)\])/gi);
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
  return { text, rawLinks, directPdfCandidates, imageCandidates, videoLinks };
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
  const subSitemapXmlUrls = new Set();

  const promises = baseEndpoints.map(async (endpoint) => {
    try {
      if (abortSignal && abortSignal.aborted) return;
      const res = await fetch(endpoint, {
        credentials: "omit",
        headers: { "Accept": "text/xml,application/xml,text/plain,*/*" },
        signal: getSignal(3000)
      });
      if (!res.ok) return;
      const text = await res.text();
      if (!text || text.length < 20) return;

      if (endpoint.endsWith("robots.txt")) {
        const smMatches = text.match(/^\s*Sitemap:\s*(https?:\/\/[^\s]+)/gim);
        if (smMatches) {
          for (const sm of smMatches.slice(0, 5)) {
            const smUrl = sm.replace(/^\s*Sitemap:\s*/i, "").trim();
            if (smUrl && !seen.has(smUrl)) {
              seen.add(smUrl);
              if (smUrl.toLowerCase().endsWith(".xml") || smUrl.includes("sitemap")) {
                subSitemapXmlUrls.add(smUrl);
              } else {
                discovered.push(smUrl);
              }
            }
          }
        }
        return;
      }

      // Check all <loc> entries in sitemap index or standard sitemap
      const locs = text.match(/<loc>([^<]+)<\/loc>/gi) || [];
      for (const l of locs) {
        const u = l.replace(/<\/?loc>/gi, "").trim();
        if (u && !seen.has(u)) {
          seen.add(u);
          if (u.toLowerCase().endsWith(".xml") || u.includes("sitemap")) {
            subSitemapXmlUrls.add(u);
          } else {
            discovered.push(u);
          }
        }
      }
    } catch {}
  });

  await Promise.allSettled(promises);

  // Recursively fetch sub-sitemaps (e.g. sitemapen_site.xml, sitemap_products.xml)
  if (subSitemapXmlUrls.size > 0 && !abortSignal?.aborted) {
    const subList = Array.from(subSitemapXmlUrls).slice(0, 8);
    const subPromises = subList.map(async (subUrl) => {
      try {
        if (abortSignal && abortSignal.aborted) return;
        const res = await fetch(subUrl, {
          credentials: "omit",
          headers: { "Accept": "text/xml,application/xml,*/*" },
          signal: getSignal(3000)
        });
        if (!res.ok) return;
        const xml = await res.text();
        const subLocs = xml.match(/<loc>([^<]+)<\/loc>/gi) || [];
        for (const l of subLocs.slice(0, 300)) {
          const u = l.replace(/<\/?loc>/gi, "").trim();
          if (u && !seen.has(u) && !u.toLowerCase().endsWith(".xml")) {
            seen.add(u);
            discovered.push(u);
          }
        }
      } catch {}
    });
    await Promise.allSettled(subPromises);
  }

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
    candidates.add(`${sld}.net`);
    candidates.add(`${sld}.co.uk`);
    candidates.add(`${sld}.de`);
    candidates.add(`${sld}.com.tw`);
    candidates.add(`${sld}.tw`);
    candidates.add(`${sld}.in`);
    candidates.add(`${sld}.co.in`);
    candidates.add(`${sld}.com.au`);
    candidates.add(`${sld}.com.cn`);
    candidates.add(`${sld}.eu`);
  } else if (tld === "com.tw" || tld === "tw") {
    candidates.add(`${sld}.com`);
    candidates.add(`${sld}.net`);
    candidates.add(`${sld}.tw`);
    candidates.add(`${sld}.com.tw`);
    candidates.add(`${sld}.com.cn`);
  } else if (tld === "com.cn" || tld === "cn") {
    candidates.add(`${sld}.com`);
    candidates.add(`${sld}.net`);
    candidates.add(`${sld}.com.cn`);
  } else if (tld === "in" || tld === "co.in") {
    candidates.add(`${sld}.com`);
    candidates.add(`${sld}.net`);
    candidates.add(`${sld}.in`);
  } else if (tld === "co.uk" || tld === "uk") {
    candidates.add(`${sld}.com`);
    candidates.add(`${sld}.co.uk`);
    candidates.add(`${sld}.eu`);
  } else if (tld === "de" || tld === "fr" || tld === "it" || tld === "es" || tld === "ch") {
    candidates.add(`${sld}.com`);
    candidates.add(`${sld}.eu`);
  } else if (tld === "com.au" || tld === "au") {
    candidates.add(`${sld}.com`);
    candidates.add(`${sld}.com.au`);
  } else {
    candidates.add(`${sld}.com`);
    candidates.add(`${sld}.net`);
  }

  candidates.delete(norm);
  return Array.from(candidates).slice(0, 6);
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

function persistCrawlState(isComplete = false) {
  const crawl = activeCrawl || lastCompletedCrawl;
  if (!crawl) return;
  chrome.storage.local.set({
    lastCrawlState: {
      status: isComplete ? "completed" : (crawl.isCrawling ? "running" : (crawl.aborted ? "stopped" : "completed")),
      startUrl: crawl.startUrl,
      pagesCrawled: crawl.visitedUrls ? crawl.visitedUrls.size : (crawl.pagesCrawled || 0),
      pdfsChecked: crawl.visitedPdfs ? crawl.visitedPdfs.size : (crawl.pdfsChecked || 0),
      findings: crawl.findings || [],
      lastUpdated: Date.now()
    }
  }).catch(() => {});
}

let lastProgressEmitTime = 0;
let lastPersistTime = 0;
function emitProgress(data) {
  const now = Date.now();
  if (now - lastProgressEmitTime < 100 && (data.queueRemaining ?? 0) !== 0) return;
  lastProgressEmitTime = now;
  chrome.runtime.sendMessage({ type: "CRAWL_PROGRESS", ...data }).catch(() => {});
  if (now - lastPersistTime > 2000) {
    lastPersistTime = now;
    persistCrawlState(false);
  }
}

function emitEmailFound(finding) {
  chrome.runtime.sendMessage({ type: "EMAIL_FOUND", finding }).catch(() => {});
}

async function runProductionCrawl(crawlState) {
  const { startUrl, maxPages, concurrency, checkPdfs, includeSubdomains, initialFindings, initialLinks, filterCompliance: rawFilterCompliance } = crawlState;
  const filterCompliance = rawFilterCompliance !== false;
  const startObj = new URL(startUrl);
  let baseOrigin = startObj.origin;
  let baseHostname = startObj.hostname;

  const crawlAbortController = new AbortController();
  crawlState.abortController = crawlAbortController;

  function createFetchSignal(timeoutMs = 7500) {
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
  const enqueuedImageUrls = new Set();
  const visitedUrls = new Set();
  const visitedPdfs = new Set();
  const visitedImages = new Set();

  const discoveredCompanyKeywords = new Set();
  const findingsMap = new Map();
  const findings = [];

  crawlState.findings = findings;
  crawlState.visitedUrls = visitedUrls;
  crawlState.visitedPdfs = visitedPdfs;
  crawlState.visitedImages = visitedImages;

  function recordCleanEmail(email, sourceUrl, sourceType, mainPageUrl, extraMeta = {}) {
    if (!email || !isValidEmail(email, filterCompliance)) return;
    const cleanEmail = email.trim().toLowerCase();
    const existing = findingsMap.get(cleanEmail);
    const nowStr = new Date().toISOString();

    const pdfUrl = extraMeta.pdf || (sourceType.toLowerCase().includes("pdf") ? sourceUrl : null);
    const imageUrl = extraMeta.image || (sourceType.toLowerCase().includes("image") ? sourceUrl : null);
    const actualSourceType = extraMeta.sourceType || (pdfUrl ? "pdf" : (imageUrl ? "image" : "html"));

    const sourceEntry = {
      sourceType: actualSourceType,
      sourceUrl: sourceUrl || startUrl,
      mainPageUrl: mainPageUrl || sourceUrl || startUrl,
      pdf: pdfUrl,
      image: imageUrl,
      timestamp: nowStr
    };

    if (existing) {
      const alreadyHasSource = existing.sources.some(
        (s) => s.sourceUrl === sourceEntry.sourceUrl && s.sourceType === sourceEntry.sourceType
      );
      if (!alreadyHasSource) {
        existing.sources.push(sourceEntry);
        existing.occurrences = existing.sources.length;
        if (!existing.pdf && pdfUrl) existing.pdf = pdfUrl;
        if (!existing.image && imageUrl) existing.image = imageUrl;
        emitEmailFound(existing);
        persistCrawlState(false);
      }
    } else {
      const item = {
        copy: cleanEmail,
        url: mainPageUrl || sourceUrl || startUrl,
        pdf: pdfUrl,
        image: imageUrl,
        sourceType: actualSourceType,
        email: cleanEmail,
        sourceUrl: sourceUrl || startUrl,
        mainPageUrl: mainPageUrl || sourceUrl || startUrl,
        occurrences: 1,
        sources: [sourceEntry]
      };
      findingsMap.set(cleanEmail, item);
      findings.push(item);
      emitEmailFound(item);
      persistCrawlState(false);
    }
  }

  const HIGH_VALUE_PDF_REGEX = /(?:catalog|katalog|brochure|prospekt|flyer|profile|company|about|contact|overview|presentation|cert|spec|product-list)/i;

  function enqueuePdf(rawPdfUrl, sourcePage) {
    if (!checkPdfs) return;
    const pdfUrl = cleanAndNormalizeUrl(rawPdfUrl, sourcePage);
    if (!pdfUrl) return;
    if (visitedPdfs.has(pdfUrl) || enqueuedPdfUrls.has(pdfUrl)) return;

    const isHighValue = HIGH_VALUE_PDF_REGEX.test(pdfUrl);
    // Cap low-value part drawings to max 25, while keeping high-value catalogs & brochures prioritized
    if (enqueuedPdfUrls.size >= 25 && !isHighValue) return;

    enqueuedPdfUrls.add(pdfUrl);
    const item = { url: pdfUrl, sourcePage: sourcePage || startUrl };
    if (isHighValue) {
      pdfQueue.unshift(item);
    } else {
      pdfQueue.push(item);
    }
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

  // Ingest initial links from active tab right after initialUrl
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
            // Priority links go right behind initialUrl
            htmlQueue.splice(1, 0, cUrl);
          } else {
            htmlQueue.push(cUrl);
          }
        }
      }
    }
  }

  // Sensible fallback contact paths on base origin, appended at end of queue
  const standardFallbackPaths = [
    "/contact.html", "/contact-us.html", "/contact_us.html", "/contact",
    "/about.html", "/about-us.html", "/about_us.html", "/about",
    "/company-profile.html", "/inquiry.html", "/e-catalog.html"
  ];
  for (const p of standardFallbackPaths) {
    if (htmlQueue.length + visitedUrls.size >= maxPages) break;
    const cUrl = cleanAndNormalizeUrl(`${baseOrigin}${p}`, startUrl);
    if (cUrl && !enqueuedHtmlUrls.has(cUrl)) {
      enqueuedHtmlUrls.add(cUrl);
      htmlQueue.push(cUrl);
    }
  }

  // Background sitemap discovery: feeds sitemap URLs dynamically into crawl queue
  let sitemapFinished = false;
  const sitemapPromise = probeSitemaps(baseOrigin, crawlAbortController.signal)
    .then((sitemapUrls) => {
      if (crawlState.aborted || !Array.isArray(sitemapUrls)) return;
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
        htmlQueue.unshift(...prioritySeeds.slice(-200));
      }
      if (normalSeeds.length > 0 && htmlQueue.length < maxPages) {
        htmlQueue.push(...normalSeeds.slice(0, maxPages - htmlQueue.length));
      }
    })
    .catch(() => {})
    .finally(() => {
      sitemapFinished = true;
    });

  // ── Worker Task Processor ──────────────────────────────────────────
  async function processTask(currentItem, mode) {
    if (crawlState.aborted) return;
    const currentUrl = mode === "html" ? currentItem : currentItem.url;

    emitProgress({
      pagesCrawled: visitedUrls.size,
      pdfsCrawled: visitedPdfs.size,
      queueRemaining: htmlQueue.length + pdfQueue.length,
      currentUrl: mode === "pdf" ? `PDF: ${currentUrl.split("/").pop() || currentUrl}` : currentUrl,
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
          signal: createFetchSignal(9000)
        });
        if (!res.ok) {
          console.debug("PDF response non-OK:", res.status, currentUrl);
          return;
        }

        const contentType = (res.headers.get("content-type") || "").toLowerCase();
        if (contentType.includes("text/html")) return;

        const buffer = await res.arrayBuffer();
        if (buffer.byteLength < 50 || buffer.byteLength > 25 * 1024 * 1024) return;

        // In-Memory scan: extracts digital emails from raw PDF streams in < 5ms using native TextDecoder
        let extractedPdfEmails = [];
        try {
          const uint8 = new Uint8Array(buffer);
          const maxScanBytes = Math.min(uint8.length, 2 * 1024 * 1024); // 2 MB is plenty for PDF text/metadata
          const binaryStr = new TextDecoder("latin1").decode(uint8.subarray(0, maxScanBytes));
          if (binaryStr.includes("@")) {
            extractedPdfEmails = normalizeAndExtractEmails(binaryStr);
          }
        } catch {}

        for (const em of extractedPdfEmails) {
          recordCleanEmail(em, currentUrl, "pdf", mainSitePage, { pdf: currentUrl, sourceType: "pdf" });
        }
      } catch (err) {
        console.debug("PDF fetch error:", currentUrl, err.message);
      }
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
          signal: createFetchSignal(7500)
        });
        if (!res.ok) {
          console.debug("HTML response non-OK:", res.status, currentUrl);
          return;
        }

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

      const { text, rawLinks, directPdfCandidates, imageCandidates, videoLinks } = extractAllLinksAndMedia(html);

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
        recordCleanEmail(m, finalUrl, "html", finalUrl);
      }

      // Extract emails from image alt/title metadata, SVG vector graphics, and contact image candidates
      if (Array.isArray(imageCandidates)) {
        for (const img of imageCandidates) {
          const fullImgUrl = cleanAndNormalizeUrl(img.url, finalUrl);
          if (!fullImgUrl || visitedImages.has(fullImgUrl)) continue;

          // 1. Direct alt/title text inspection
          const combinedImgText = `${img.alt || ""} ${img.title || ""}`;
          if (combinedImgText.includes("@") || combinedImgText.includes("[at]")) {
            const imgEmails = normalizeAndExtractEmails(combinedImgText);
            for (const em of imgEmails) {
              recordCleanEmail(em, finalUrl, "image", finalUrl, { image: fullImgUrl, sourceType: "image" });
            }
          }

          // Direct email in image filename or query
          if (fullImgUrl.includes("@") || /%40|_at_/i.test(fullImgUrl)) {
            try {
              const urlEmails = normalizeAndExtractEmails(decodeURIComponent(fullImgUrl));
              for (const em of urlEmails) {
                recordCleanEmail(em, finalUrl, "image", finalUrl, { image: fullImgUrl, sourceType: "image" });
              }
            } catch {}
          }

          // 2. Direct SVG vector text inspection (only for contact SVGs, max 1.5s timeout)
          if (fullImgUrl.toLowerCase().endsWith(".svg") || fullImgUrl.includes(".svg?")) {
            visitedImages.add(fullImgUrl);
            if (CONTACT_IMAGE_KEYWORD_REGEX.test(fullImgUrl) || (img.alt && CONTACT_IMAGE_KEYWORD_REGEX.test(img.alt))) {
              fetch(fullImgUrl, { signal: createFetchSignal(1500), credentials: "omit" })
                .then((r) => (r.ok ? r.text() : ""))
                .then((svgText) => {
                  if (svgText && svgText.includes("@")) {
                    const svgEmails = normalizeAndExtractEmails(svgText);
                    for (const em of svgEmails) {
                      recordCleanEmail(em, finalUrl, "image", finalUrl, { image: fullImgUrl, sourceType: "image" });
                    }
                  }
                })
                .catch(() => {});
            }
            continue;
          }

          // 3. Dispatch contact candidate images for OCR recognition in popup (strict cap: 3 contact images)
          if (crawlState.ocrImages !== false && isContactCandidateImage(fullImgUrl, img.alt, img.title, finalUrl)) {
            if (enqueuedImageUrls.size < 3) {
              enqueuedImageUrls.add(fullImgUrl);
              visitedImages.add(fullImgUrl);
              chrome.runtime.sendMessage({
                type: "PROCESS_IMAGE_OCR",
                imageUrl: fullImgUrl,
                mainPageUrl: finalUrl,
                altText: img.alt || "",
                titleText: img.title || ""
              }).catch(() => {});
            }
          }
        }
      }

      // Enqueue child links & PDFs
      for (const rawLink of rawLinks) {
        if (!rawLink) continue;

        if (rawLink.toLowerCase().startsWith("mailto:")) {
          try {
            const rawMailto = decodeURIComponent(rawLink);
            const emailsInMailto = normalizeAndExtractEmails(rawMailto);
            for (const em of emailsInMailto) {
              recordCleanEmail(em, finalUrl, "html", finalUrl);
            }
          } catch {}
          continue;
        }

        const cleanUrl = cleanAndNormalizeUrl(rawLink, finalUrl);
        if (!cleanUrl) continue;

        // Check if link points to a PDF file or document download
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

        // Stop enqueuing more HTML pages if max limit is reached
        if (visitedUrls.size >= maxPages) continue;

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

    // When maxPages reached, discard unprocessable HTML items and cap remaining PDFs
    if (visitedUrls.size >= maxPages) {
      if (htmlQueue.length > 0) htmlQueue.length = 0;
      if (pdfQueue.length > 6) pdfQueue.length = 6;
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

  const crawlStartTime = Date.now();
  async function workerThread() {
    let idleWaitAttempts = 0;
    while (!crawlState.aborted && !allWorkCompleted) {
      const task = getNextTask();

      if (!task) {
        if (activeWorkersCount > 0) {
          await new Promise((r) => setTimeout(r, 40));
          continue;
        }

        // Within first 2 seconds, give initialUrl time to finish and enqueue its child links
        if (Date.now() - crawlStartTime < 2000 && visitedUrls.size === 0) {
          await new Promise((r) => setTimeout(r, 100));
          continue;
        }

        // If sitemap probe is still running within the first 4.5 seconds, wait for it before giving up
        if (!sitemapFinished && (Date.now() - crawlStartTime < 4500)) {
          await new Promise((r) => setTimeout(r, 100));
          continue;
        }

        // Grace period check: 5 checks of 100ms
        idleWaitAttempts++;
        if (idleWaitAttempts < 6) {
          await new Promise((r) => setTimeout(r, 100));
          continue;
        }

        if (crawlState.aborted || allWorkCompleted) break;
        if ((htmlQueue.length > 0 && visitedUrls.size < maxPages) || (checkPdfs && pdfQueue.length > 0)) {
          idleWaitAttempts = 0;
          continue;
        }
        if (activeWorkersCount > 0) {
          idleWaitAttempts = 0;
          continue;
        }

        allWorkCompleted = true;
        break;
      }

      idleWaitAttempts = 0;
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

  // Crawl Watchdog: 3 minutes hard cap guarantees no worker can freeze indefinitely
  const CRAWL_WATCHDOG_MS = 3 * 60 * 1000;
  let watchdogFired = false;
  const watchdog = setTimeout(() => {
    watchdogFired = true;
    console.warn("[crawl] Watchdog timer fired (3m limit), terminating crawl gracefully.");
    crawlState.aborted = true;
    allWorkCompleted = true;
    if (crawlAbortController) {
      crawlAbortController.abort();
    }
  }, CRAWL_WATCHDOG_MS);

  try {
    await Promise.all(workerPromises);
    await sitemapPromise;
  } finally {
    clearTimeout(watchdog);
  }

  // ── Sister Domain Fallback & Enrichment Probe ──────────────────────
  const hasOnlyGenericEmail = findings.length > 0 && findings.every((f) => {
    const d = (f.email.split("@")[1] || "").toLowerCase();
    return /^(?:gmail|yahoo|hotmail|outlook|live|aol|qq|163|126|sina)\./i.test(d);
  });
  const shouldEnrich = (findings.length < 2 || hasOnlyGenericEmail) && !crawlState.aborted;

  if (shouldEnrich) {
    try {
      await Promise.race([
        (async () => {
          const fallbackList = await discoverSisterDomainEmails(
            startUrl,
            Array.from(discoveredCompanyKeywords)
          );
          for (const item of fallbackList) {
            recordCleanEmail(item.email, item.sourceUrl, "html", item.sourceUrl, {
              sourceType: "html"
            });
          }
        })(),
        new Promise((r) => setTimeout(r, 2000))
      ]);
    } catch {}
  }

  // Sort findings: primary target-domain emails first, followed by others ordered by frequency
  findings.sort((a, b) => {
    const aDomain = (a.email.split("@")[1] || "").toLowerCase();
    const bDomain = (b.email.split("@")[1] || "").toLowerCase();
    const aMatches = baseHostname.includes(aDomain) || aDomain.includes(baseHostname);
    const bMatches = baseHostname.includes(bDomain) || bDomain.includes(baseHostname);
    if (aMatches && !bMatches) return -1;
    if (!aMatches && bMatches) return 1;
    return (b.occurrences || 1) - (a.occurrences || 1);
  });

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
      ocrImages: msg.ocrImages !== false,
      filterCompliance: msg.filterCompliance !== false,
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
        persistCrawlState(true);
        chrome.runtime.sendMessage({ type: "CRAWL_COMPLETED", data: lastCompletedCrawl }).catch(() => {});
      })
      .catch((err) => {
        if (activeCrawl === crawlState) activeCrawl = null;
        persistCrawlState(false);
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
      persistCrawlState(false);
    }
    sendResponse({ ok: true, stopped: true });
    return false;
  }

  if (msg.type === "GET_CRAWL_STATUS") {
    if (activeCrawl && activeCrawl.isCrawling) {
      sendResponse({
        ok: true,
        isCrawling: true,
        aborted: false,
        findings: activeCrawl.findings || [],
        stats: {
          pagesCrawled: activeCrawl.visitedUrls ? activeCrawl.visitedUrls.size : 0,
          pdfsChecked: activeCrawl.visitedPdfs ? activeCrawl.visitedPdfs.size : 0
        }
      });
      return false;
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
      return false;
    } else {
      chrome.storage.local.get(["lastCrawlState"], (data) => {
        const saved = data && data.lastCrawlState;
        if (saved) {
          sendResponse({
            ok: true,
            isCrawling: false,
            aborted: saved.status === "stopped",
            findings: saved.findings || [],
            stats: {
              pagesCrawled: saved.pagesCrawled || 0,
              pdfsChecked: saved.pdfsChecked || 0
            }
          });
        } else {
          sendResponse({ ok: true, isCrawling: false, findings: [], stats: { pagesCrawled: 0, pdfsChecked: 0 } });
        }
      });
      return true;
    }
  }

  if (msg.type === "EMAIL_FOUND" && msg.finding) {
    if (activeCrawl && Array.isArray(activeCrawl.findings)) {
      const email = (msg.finding.copy || msg.finding.email || "").trim().toLowerCase();
      if (email && !activeCrawl.findings.some((f) => (f.copy || f.email).toLowerCase() === email)) {
        activeCrawl.findings.push(msg.finding);
      }
    }
    return false;
  }

  if (msg.type === "PING") {
    sendResponse({ ok: true, isCrawling: !!(activeCrawl && activeCrawl.isCrawling) });
    return false;
  }

  return false;
});

