// ═══════════════════════════════════════════════════════════════════════
// Site & PDF Email Crawler — Production Background Service Worker
// Fully MV3 Compliant | Robust Email Extraction | Multi-Source Tracking
// Strict Visual & OCR Warning-Only Detection | Business Classifier
// ═══════════════════════════════════════════════════════════════════════

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,24}/g;

// Static non-document asset extensions to skip from HTML crawl queue
const SKIP_EXT_REGEX = /\.(css|js|jsx|ts|tsx|woff|woff2|ttf|eot|otf|mp4|webm|ogv|avi|mp3|wav|flac|aac|ogg|zip|rar|7z|tar|gz|bz2|iso|dmg|exe|msi|apk|bin|rss|atom|xml|json)(\?.*)?$/i;

// Image extensions to collect for OCR
const IMAGE_EXT_REGEX = /\.(png|jpe?g|webp|bmp|tiff?)(\?.*)?$/i;

// Transactional and checkout paths to skip (including Cloudflare internal paths)
const IGNORE_PATH_REGEX = /\/(?:cart|checkout|basket|my-account|wishlist|login|signin|signup|register|account|password|reset|auth|wp-admin|wp-json|xmlrpc|ajax|feed|rss|atom|cdn-cgi)(?:\/|$|\?)/i;

// Priority high-value pages likely to contain company contact emails
const HIGH_PRIORITY_REGEX = /\/(?:contact(?:[-_]?us)?|about(?:[-_]?us)?|reach[-_]?us|get[-_]?in[-_]?touch|support|team|staff|help|imprint|impressum|terms|privacy|legal|info|catalog|catalogue)(?:\/|$|\?|\.|\b)/i;

const STANDARD_FETCH_HEADERS = {
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache"
};

const PDF_FETCH_HEADERS = {
  "Accept": "application/pdf,application/octet-stream,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9"
};

const IMAGE_FETCH_HEADERS = {
  "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9"
};

// Query parameters to strip for clean URL deduplication
const REDUNDANT_PARAMS = new Set([
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
  "fbclid", "gclid", "ref", "source", "_ga", "_gl", "mc_cid", "mc_eid",
  "variant", "color", "colour", "size", "sku", "currency", "curr", "locale", "lang",
  "qty", "quantity", "add-to-cart", "added-to-cart", "option", "selection",
  "sort", "sorted", "sort_by", "order", "orderby", "order_by", "dir", "direction",
  "filter", "filter_by", "view", "mode", "display", "limit", "per_page", "price",
  "page", "p", "page_num", "paged", "s", "search", "q", "query",
  "sid", "session", "session_id", "phpsessid", "token", "_wpnonce"
]);

// ═══════════════════════════════════════════════════════════════════════
// 1. RESTRICTED INDUSTRY DEFINITIONS & CLASSIFICATION ENGINE
// RULE: Business classification → REJECT  |  Image-only detection → WARN ONLY
// ═══════════════════════════════════════════════════════════════════════

// Exclude common false positives where generic, manufacturing, construction, or e-commerce words resemble restricted terms
const EXCLUDE_FALSE_POSITIVES_REGEX = /\b(?:catalog(?:ue)?|category|categories|cater(?:ing)?|cat\.?\s*no\.?|pet\s*(?:plastic|film|bottle|sheet|material|container)|shipping|shipment|ship\s*to|relationship|partnership|membership|sponsorship|anchor\s*(?:tag|link|text)|saw\s*blade|fan\s*blade|wiper\s*blade|cutter\s*blade|turbine\s*blade|blade\s*connector|blade\s*server|razor\s*blade|storage\s*tank|water\s*tank|think\s*tank|fuel\s*tank|air\s*tank|hardware|software|award|warning|warranty|warehouse|export|support|transport|report|viewport|bar\s*(?:code|chart|pressure)|steel\s*bar|metal\s*bar|round\s*bar|bus\s*bar|navbar|sidebar|toolbar|progressbar|tablet\s*(?:pc|screen|drawing|computer)|pill\s*button|medical\s*grade|marine\s*grade|defense\s*against|defend\s*against|corrosion\s*defense|applications?|industries\s*served|window|windows|door|doors|vinyl|frame|frames|glass|glazing|sash|casement|patio|seal|insulation|energy\s*star|building|home|house|residential|commercial|facade|finish|finishes|brick|wood|coin|coins|token|tokens|acceptor|selector|coin\s*box|cash\s*box|arcade|spare\s*parts?|indicator\s*lamp|lamp|lamps|light|lights|feeder|feeder\s*top|harness|switch|switches|push\s*button|pcb|power\s*supply)\b/gi;

function matchRestrictedKeywords(text, keywords) {
  if (!text) return [];
  const clean = text.replace(EXCLUDE_FALSE_POSITIVES_REGEX, " ").replace(/[-_./\\+]/g, " ");
  const matched = [];
  for (const kw of keywords) {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rx = new RegExp(`\\b${escaped}\\b`, "i");
    if (rx.test(clean)) {
      matched.push(kw);
    }
  }
  return matched;
}

const RESTRICTED_CATEGORIES = {
  PORN_ADULT: {
    id: "PORN_ADULT", label: "Porn & Adult",
    businessKeywords: [
      "adult content", "pornography", "adult entertainment", "explicit adult content",
      "adult website", "erotic service", "nude modeling", "nudity adult", "sex toy manufacturer",
      "escort service", "strip club", "adult video production", "cam site"
    ],
    imageKeywords: [
      "porn", "pornography", "adult xxx", "xxx", "erotic", "nude", "nudity", "nsfw", "sex toy", "strip club", "escort"
    ]
  },
  MEDICINE_MEDICAL: {
    id: "MEDICINE_MEDICAL", label: "Medicine & Medical",
    businessKeywords: [
      "pharmaceutical company", "drug manufacturer", "medicine manufacturer", "medical device company",
      "pharma company", "prescription drugs", "generic medicines", "API pharmaceutical",
      "active pharmaceutical ingredient", "drug formulation", "medicine production", "biopharmaceutical",
      "contract manufacturing pharma", "bulk drug synthesis"
    ],
    imageKeywords: [
      "medicine", "medicines", "medication", "pharmaceutical", "pharma", "prescription",
      "pills", "tablets", "capsule", "capsules", "syringe", "injection", "iv drip", "vaccine", "vaccines", "stethoscope", "blister pack"
    ]
  },
  HOSPITAL_HEALTHCARE: {
    id: "HOSPITAL_HEALTHCARE", label: "Hospital & Healthcare",
    businessKeywords: [
      "hospital healthcare", "medical clinic", "healthcare provider", "medical centre", "nursing home",
      "dental clinic", "eye hospital", "orthopaedic clinic", "cardiology hospital", "maternity hospital",
      "diagnostic centre", "pathology lab", "patient care facility", "outpatient clinic", "inpatient ward",
      "emergency hospital room", "operating theatre hospital", "polyclinic"
    ],
    imageKeywords: [
      "hospital", "clinic", "healthcare", "ambulance", "emergency room", "intensive care", "icu",
      "operating room", "surgery", "patient bed", "doctor nurse", "hospital ward", "polyclinic"
    ]
  },
  FOOD: {
    id: "FOOD", label: "Food",
    businessKeywords: [
      "food manufacturer", "food processing company", "food production plant", "food factory",
      "food packaging company", "food distributor", "food exporter",
      "bakery manufacturer", "dairy food manufacturer", "snack manufacturer", "beverage manufacturer",
      "ready to eat food", "frozen food manufacturer", "canned food", "food ingredients supplier"
    ],
    imageKeywords: [
      "food", "foods", "burger", "burgers", "pizza", "pizzas", "sandwich", "sandwiches",
      "snack", "snacks", "cake", "cakes", "pastry", "bakery", "bread", "cuisine", "recipe",
      "recipes", "meal", "meals", "dish", "dishes", "dessert", "desserts", "restaurant food",
      "fast food", "groceries", "fresh fruit", "fresh vegetable"
    ]
  },
  WEAPONS_KNIVES: {
    id: "WEAPONS_KNIVES", label: "Weapons & Knives",
    businessKeywords: [
      "weapons manufacturer", "arms manufacturer", "gun manufacturer", "firearm manufacturer",
      "combat knife manufacturer", "tactical blade manufacturer", "ammunition manufacturer", "military ordnance",
      "small arms manufacturer", "weapons supplier", "tactical weapons", "combat knife",
      "military weapons supplier", "civilian firearms dealer", "licensed arms dealer"
    ],
    imageKeywords: [
      "weapon", "weapons", "firearm", "firearms", "gun", "guns", "handgun", "handguns",
      "pistol", "pistols", "rifle", "rifles", "shotgun", "shotguns", "knife", "knives",
      "dagger", "daggers", "sword", "swords", "machete", "blade weapon", "tactical knife",
      "combat knife", "hunting knife", "ammunition", "bullets", "grenade", "missile"
    ]
  },
  DEFENCE: {
    id: "DEFENCE", label: "Defence",
    businessKeywords: [
      "defence contractor", "defense contractor", "military contractor", "defence manufacturer",
      "military equipment manufacturer", "armored vehicle manufacturer", "defence systems integrator",
      "defence procurement", "weapons system integrator", "military defence supplier", "naval defence contractor",
      "defence electronics", "ballistic protection manufacturer", "body armor manufacturer"
    ],
    imageKeywords: [
      "defence", "defense", "military", "military tank", "armored vehicle", "body armor",
      "soldier", "warship", "fighter jet", "air defence", "missile launcher", "ballistic"
    ]
  },
  AIRCRAFT_AVIATION: {
    id: "AIRCRAFT_AVIATION", label: "Aircraft & Aviation",
    businessKeywords: [
      "aircraft manufacturer", "aviation company", "airplane manufacturer", "helicopter manufacturer",
      "aircraft parts manufacturer", "avionics manufacturer",
      "aircraft MRO", "airline company", "aviation flight services", "drone aircraft manufacturer",
      "aircraft leasing", "flight training school", "airport operator", "air cargo carrier"
    ],
    imageKeywords: [
      "aircraft", "airplane", "airplanes", "aeroplane", "helicopter", "helicopters",
      "aviation", "airliner", "flight cockpit", "hangar", "jet engine", "uav drone", "airport runway"
    ]
  },
  AEROSPACE: {
    id: "AEROSPACE", label: "Aerospace",
    businessKeywords: [
      "aerospace company", "space rocket company", "satellite manufacturer",
      "space launch vehicle", "spacecraft manufacturer", "orbital space systems", "rocket propulsion",
      "aerospace engineering company", "space technology company", "space exploration",
      "satellite services orbital"
    ],
    imageKeywords: [
      "aerospace", "spacecraft", "space rocket", "satellite", "satellites", "space station",
      "astronaut", "orbital", "space shuttle", "launch vehicle"
    ]
  },
  MARINE: {
    id: "MARINE", label: "Marine",
    businessKeywords: [
      "marine equipment manufacturer", "maritime company", "offshore equipment manufacturer",
      "marine engine manufacturer", "ship equipment supplier", "subsea equipment manufacturer",
      "offshore oil and gas equipment", "marine electronics manufacturer", "port equipment manufacturer",
      "marine propulsion systems", "underwater equipment", "marine safety equipment",
      "ship chandler maritime"
    ],
    imageKeywords: [
      "marine", "maritime", "offshore", "vessel", "vessels", "submarine", "subsea",
      "ocean vessel", "port crane", "underwater diving"
    ]
  },
  SHIP_SHIPBUILDING: {
    id: "SHIP_SHIPBUILDING", label: "Ship & Shipbuilding",
    businessKeywords: [
      "shipbuilding company", "shipyard manufacturer", "shipbuilder", "ship construction",
      "naval shipyard", "commercial shipbuilder", "boat builder manufacturer", "yacht manufacturer",
      "dry dock shipyard", "ship repair yard", "vessel fabrication", "ship hull builder"
    ],
    imageKeywords: [
      "shipyard", "dry dock", "shipbuilding", "ship construction", "cargo ship", "container ship",
      "cruise ship", "naval warship", "yacht", "tugboat", "barge vessel"
    ]
  },
  CHEMICAL: {
    id: "CHEMICAL", label: "Chemical",
    businessKeywords: [
      "chemical manufacturer", "chemical production plant", "chemical synthesis company",
      "specialty chemicals company", "petrochemical manufacturer", "industrial chemical supplier",
      "organic chemicals manufacturer", "inorganic chemicals supplier", "chemical factory",
      "bulk chemical manufacturer", "polymer chemical company"
    ],
    imageKeywords: [
      "chemical", "chemicals", "chemical drum", "chemical plant", "chemical factory",
      "hazardous chemical", "toxic chemical", "chemical formula", "petrochemical", "reagent"
    ]
  },
  ALCOHOL: {
    id: "ALCOHOL", label: "Alcohol",
    businessKeywords: [
      "alcohol manufacturer", "liquor distillery", "brewery company", "wine winery",
      "spirits manufacturer", "craft beer brewery", "commercial distillery", "alcoholic beverage manufacturer",
      "whiskey distillery", "vodka manufacturer", "rum distillery", "cider manufacturer"
    ],
    imageKeywords: [
      "alcohol", "alcoholic", "liquor", "spirits bottle", "beer bottle", "beer can",
      "wine bottle", "whiskey", "vodka", "distillery", "brewery", "champagne", "cocktail"
    ]
  },
  ANIMALS: {
    id: "ANIMALS", label: "Animals",
    businessKeywords: [
      "animal breeding farm", "livestock producer", "animal feed manufacturer", "veterinary company",
      "pet food manufacturer", "poultry farm production", "cattle farm business", "swine producer",
      "aquaculture farm", "exotic animal dealer", "dairy cattle farm"
    ],
    imageKeywords: [
      "animal", "animals", "dog", "dogs", "cat", "cats", "horse", "horses", "cattle",
      "cows", "livestock", "poultry", "chicken", "pig", "sheep", "wildlife", "safari animal"
    ]
  }
};

// ─── Function 1: Restricted Business Detection (text/page content based) ───
// STRICT RULE: Requires at least 3 strong primary business keywords on homepage or verified company profile
// Avoids false positives from incidental words or clients/sectors served
function detectRestrictedBusiness(pageText, pageTitle, pageUrl) {
  if (!pageText) return null;

  const urlLower = (pageUrl || "").toLowerCase();
  const isCorePage =
    urlLower === "" || urlLower.endsWith("/") ||
    urlLower.includes("index") || urlLower.includes("home") ||
    urlLower.includes("about") || urlLower.includes("company") || urlLower.includes("profile");

  if (!isCorePage) return null;

  // Clean incidental phrases like "industries we serve", "applications in food and marine", etc.
  const cleanText = `${pageTitle || ""} ${pageText}`
    .replace(/(?:industries?\s*served|applications?|our\s*clients|sectors?|partners?|shipping\s*to)[\s\S]{0,120}/gi, " ")
    .replace(EXCLUDE_FALSE_POSITIVES_REGEX, " ");

  for (const cat of Object.values(RESTRICTED_CATEGORIES)) {
    const matched = matchRestrictedKeywords(cleanText, cat.businessKeywords);

    // Require at least 3 distinct primary business keywords indicating the core business activity
    if (matched.length >= 3) {
      const confidence = Math.min(99, Math.max(82, Math.round(75 + matched.length * 5)));
      return {
        isRestricted: true,
        category: cat.label,
        categoryId: cat.id,
        confidence,
        evidence: matched.slice(0, 6),
        pageUrl
      };
    }
  }

  return null;
}

// ─── Function 2: Restricted Image Content Detection (Visual + OCR + Context based) ───
// STRICT RULE: Never rejects website. Never flags based on filename. Always Warning Only.
function detectRestrictedImageContent(ocrText, visualResult, imageUrl = "", sourcePage = "", imageContext = "", altText = "") {
  const cleanOcr = (ocrText || "").trim();
  const metaText = [imageContext, altText].filter(Boolean).join(" ").trim();
  const matchedCategories = [];

  // 1. Evaluate visual analysis result (if visual classifier identified visual evidence)
  if (visualResult && visualResult.category) {
    const matchedCat = Object.values(RESTRICTED_CATEGORIES).find(
      (c) => c.label.toLowerCase() === visualResult.category.toLowerCase() || c.id === visualResult.category
    );
    if (matchedCat) {
      matchedCategories.push({
        category: matchedCat.label,
        categoryId: matchedCat.id,
        confidence: visualResult.confidence || 80,
        evidence: Array.isArray(visualResult.evidence) ? visualResult.evidence : [visualResult.visualDescription || "Visual features detected"]
      });
    }
  }

  // 2. Evaluate OCR text inside image and image metadata / caption / section context
  const combinedImageText = `${cleanOcr} ${metaText}`.trim();
  if (combinedImageText) {
    for (const cat of Object.values(RESTRICTED_CATEGORIES)) {
      const ocrMatches = cleanOcr ? matchRestrictedKeywords(cleanOcr, cat.imageKeywords) : [];
      const metaMatches = metaText ? matchRestrictedKeywords(metaText, cat.imageKeywords) : [];
      const allMatches = Array.from(new Set([...ocrMatches, ...metaMatches]));

      if (allMatches.length > 0) {
        const evidenceDetails = [];
        if (ocrMatches.length > 0) {
          evidenceDetails.push(...ocrMatches.slice(0, 3).map((kw) => `Text inside image: "${kw}"`));
        }
        if (metaMatches.length > 0) {
          evidenceDetails.push(...metaMatches.slice(0, 3).map((kw) => `Image context / caption: "${kw}"`));
        }

        const existing = matchedCategories.find((m) => m.categoryId === cat.id);
        if (existing) {
          existing.confidence = Math.min(99, existing.confidence + 15);
          existing.evidence.push(...evidenceDetails);
        } else {
          const baseConf = (ocrMatches.length > 0 && metaMatches.length > 0) ? 88 : (ocrMatches.length > 0 ? 82 : 78);
          const confidence = Math.min(95, Math.max(76, Math.round(baseConf + allMatches.length * 4)));
          matchedCategories.push({
            category: cat.label,
            categoryId: cat.id,
            confidence,
            evidence: evidenceDetails
          });
        }
      }
    }
  }

  if (matchedCategories.length === 0) return null;

  // Return highest confidence category warning
  matchedCategories.sort((a, b) => b.confidence - a.confidence);
  const primary = matchedCategories[0];

  return {
    isWarning: true,
    category: primary.category,
    categoryId: primary.categoryId,
    confidence: primary.confidence,
    evidence: primary.evidence,
    imageUrl,
    sourcePage: sourcePage || imageUrl,
    warningStatus: "Warning Only (Crawl Continued)",
    crawlingStatus: "Continued",
    emailExtractionStatus: "Continued"
  };
}

// ─── Function 3: Image Warning Reporting (NEVER stops crawling) ───
function emitImageRestrictionWarning(warningRecord) {
  chrome.runtime.sendMessage({ type: "IMAGE_RESTRICTION_WARNING", warningRecord }).catch(() => {});
}

// ─── Function 4: Website Rejection (business-level confirmed only) ───
function emitSiteRestricted(siteRecord) {
  chrome.runtime.sendMessage({ type: "SITE_RESTRICTED", siteRecord }).catch(() => {});
}

// ═══════════════════════════════════════════════════════════════════════
// 2. PRODUCT IMAGE EXCLUSION & CORPORATE WHITELIST
// ═══════════════════════════════════════════════════════════════════════

// Corporate Whitelist: Always ALLOW company logos, banners, brochures, catalogs, certificates, etc.
const CORPORATE_WHITELIST_REGEX = /\b(?:logo|brand|site-logo|header-logo|company-logo|about|company|corporate|profile|mission|team|staff|office|facility|hq|contact|reach|address|location|enquiry|support|banner|hero|slider|slide|carousel|billboard|promo|promotion|announcement|header-bg|footer-bg|brochure|catalog|catalogue|flyer|poster|pamphlet|leaflet|prospectus|showcase|showcase-cover|pdf-cover|cover|cert|certificate|certification|iso|award|patent|license|accreditation|compliance|document)\b/i;

// Non-OCR graphics regex: icons, social media, payment badges, UI controls to skip from heavy OCR
const NON_OCR_GRAPHIC_REGEX = /\b(?:icon|icons|social|facebook|twitter|instagram|linkedin|youtube|pinterest|tiktok|whatsapp|wechat|line|telegram|payment|visa|mastercard|paypal|amex|applepay|gpay|stripe|cart|basket|search|magnifier|chevron|caret|arrow|bullet|avatar|divider|rating|star|stars|badge|btn|button|close|cross|menu|hamburger|playstore|appstore|google-play|app-store|flag|flags)\b/i;

// Product Container Regex: Matches container classes/ids for product grids, shop items, galleries
const PRODUCT_CONTAINER_REGEX = /\b(?:product-card|product-item|product-box|product-grid|product-list|products-grid|product-photo|product-img|product-image|product-pic|product-thumb|product-thumbnail|product-gallery|single-product|product-detail|product-zoom|category-img|category-image|category-card|cat-thumb|collection-image|collection-card|item-card|item-photo|item-img|goods-thumb|goods-pic|woocommerce-product|attachment-woocommerce_thumbnail|woocommerce-placeholder|attachment-shop_catalog|attachment-shop_single|pswp__img|shopify-product-form)\b/i;

// Check whether an image is a product item photo to strictly exclude
function isProductItemImage(imgTag, rawUrl, skipProductDetails = true) {
  if (!skipProductDetails) return false;

  const urlLower = String(rawUrl || "").toLowerCase();
  const tagLower = String(imgTag || "").toLowerCase();
  const combined = `${tagLower} ${urlLower}`;

  // Whitelist check: If corporate keywords are present, ALWAYS ALLOW!
  if (CORPORATE_WHITELIST_REGEX.test(combined)) {
    return false;
  }

  // 1. Direct URL Path and File Patterns for Product Item Photos
  const productUrlPatterns = [
    /\/media\/k2\/items\//i,              // Joomla K2 item catalog photos
    /\/wp-content\/uploads\/.*-(?:product|shop|woocommerce)/i,
    /\/products?\/(?!logo|brand|banner|flyer|catalog)/i,
    /\/items?\/(?!logo|brand|banner|flyer|catalog)/i,
    /\/goods\/(?!logo|brand)/i,
    /\/catalog\/product\//i,
    /\/images\/products?\//i,
    /\/uploads\/products?\//i,
    /\/assets\/products?\//i,
    /\/cdn\/shop\/files\/.*_(?:small|medium|large|grande|\d+x\d*)\./i,
    /_[SMLX]{1,2}\.(?:jpe?g|png|webp)$/i  // Size suffixes (_S.jpg, _M.jpg, _L.jpg, _XL.jpg)
  ];

  if (productUrlPatterns.some((rx) => rx.test(urlLower))) {
    return true;
  }

  // 2. Container and Tag Class/ID Patterns
  if (PRODUCT_CONTAINER_REGEX.test(combined)) {
    return true;
  }

  return false;
}

// Check if an image is a candidate for OCR
function isCandidateImage(url, isFromImageElement = false, skipProductDetails = true) {
  try {
    const u = new URL(url);
    const lower = (u.pathname + u.search).toLowerCase();

    // Ignore tiny technical icons, spinners, tracking pixels, and favicons
    const ignoreKeywords = [
      "favicon", "spinner", "loading", "spacer", "pixel", "1x1",
      "arrow", "bullet", "emoji", "blank.gif", "dot.gif", "empty.gif"
    ];
    if (ignoreKeywords.some((kw) => lower.includes(kw))) {
      return false;
    }

    if (skipProductDetails && isProductItemImage("", lower, true)) {
      return false;
    }

    // Skip small UI icons, social badges, and payment gateways unless explicitly whitelisted
    if (NON_OCR_GRAPHIC_REGEX.test(lower) && !CORPORATE_WHITELIST_REGEX.test(lower)) {
      return false;
    }

    if (isFromImageElement) {
      return true;
    }

    return IMAGE_EXT_REGEX.test(lower);
  } catch {
    return false;
  }
}

// Check if a path is an individual product detail page
function isProductDetailPage(pathname) {
  const path = pathname.replace(/\/+$/, "").toLowerCase();

  const listingPages = new Set([
    "", "/", "/products", "/product", "/shop", "/store", "/collections",
    "/catalog", "/catalogs", "/categories", "/category", "/all-products",
    "/our-products", "/featured", "/products.html"
  ]);
  if (listingPages.has(path)) {
    return false;
  }

  const detailPatterns = [
    /\/item\/\d+/i,
    /\/items?\/[^\/]+/i,
    /\/products?\/[^\/]+\/[^\/]+/i,
    /\/collections\/[^\/]+\/products\/[^\/]+/i,
    /\/p\/[^\/]+/i,
    /\/dp\/[^\/]+/i,
    /\/goods\/[^\/]+/i,
    /\/detail\/[^\/]+/i,
    /\/listing\/[^\/]+/i,
    /\/product-detail\/[^\/]+/i,
    /\/product-page\/[^\/]+/i,
    /\/pd\/[^\/]+/i,
    /\/shop\/[^\/]+\/[^\/]+/i
  ];

  return detailPatterns.some((regex) => regex.test(path));
}

// High-Resolution Image Normalizer: converts low-res thumbnails into high-res master originals
function getHighResImageUrl(imageUrl) {
  if (!imageUrl) return imageUrl;
  let u = imageUrl.trim();

  // 1. Yep.com.tw / DShop CDN thumbnails: /thumbnai/<id>/d, /z, /h, /m -> /thumbnai/<id>/
  u = u.replace(/\/thumbnai\/([a-zA-Z0-9_-]+)\/[a-zA-Z0-9_-]+\/?$/i, "/thumbnai/$1/");

  // 2. Direct /resize/WxH/ path stripping
  u = u.replace(/\/resize\/\d+x\d+\//i, "/");

  // 3. WordPress thumbnail sizes: filename-300x200.jpg -> filename.jpg
  u = u.replace(/-\d+x\d+(\.[a-zA-Z]{3,4})(?:\?.*)?$/i, "$1");

  // 4. Shopify thumbnail dimensions: filename_compact.jpg -> filename.jpg
  u = u.replace(/_(?:pico|icon|thumb|small|compact|medium|large|grande|\d+x\d*)(\.[a-zA-Z]{3,4})(?:\?.*)?$/i, "$1");

  // 5. Cloudinary resize transforms
  u = u.replace(/\/(?:w_\d+|h_\d+|c_fill|c_limit|c_scale|q_\d+|f_auto),[^/]+\//i, "/");

  return u;
}

// Check if a URL looks like a PDF link
function isPotentialPdfUrl(targetUrl) {
  try {
    const u = new URL(targetUrl);
    const full = (u.pathname + u.search).toLowerCase();

    if (full.includes(".pdf")) return true;

    const pdfEndpoints = [
      "format=pdf", "type=pdf", "output=pdf", "ext=pdf", "as=pdf", "export=pdf",
      "download_pdf", "generate_pdf", "viewpdf", "getpdf", "showpdf", "renderpdf",
      "/pdf/", "/pdfs/", "/document/pdf"
    ];
    return pdfEndpoints.some((kw) => full.includes(kw));
  } catch {
    return false;
  }
}

// Clean and normalize URLs
function cleanAndNormalizeUrl(rawUrl, baseUrl) {
  try {
    let sanitized = String(rawUrl || "").trim()
      .replace(/^["'\s]+|["'\s]+$/g, "")
      .replace(/\\(["'/\\bfnrtv])/g, "$1") // unescape JSON escapes like \/ -> /
      .replace(/\\+/g, "/"); // normalize any stray backslashes to forward slashes

    if (!sanitized) return null;
    const u = new URL(sanitized, baseUrl);
    u.hash = "";

    // Normalize trailing slash on non-root paths (e.g. /about/ -> /about) to avoid duplicate crawls
    if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
      u.pathname = u.pathname.replace(/\/+$/, "");
    }

    const params = new URLSearchParams(u.search);
    const keys = Array.from(params.keys());
    for (const key of keys) {
      if (REDUNDANT_PARAMS.has(key.toLowerCase()) || key.toLowerCase().startsWith("utm_")) {
        params.delete(key);
      }
    }
    const cleanSearch = params.toString();
    u.search = cleanSearch ? `?${cleanSearch}` : "";

    return u.toString();
  } catch {
    return null;
  }
}

function normalizeHost(host) {
  return (host || "").toLowerCase().replace(/^www\./, "");
}

// Check whether targetUrl is in crawl scope (apex domain and www. are always in scope)
function isUrlInScope(targetUrl, baseOrigin, baseHostname, includeSubdomains) {
  try {
    const u = new URL(targetUrl);
    if (!["http:", "https:"].includes(u.protocol)) return false;

    const targetNorm = normalizeHost(u.hostname);
    const baseNorm = normalizeHost(baseHostname);

    if (includeSubdomains) {
      return (
        targetNorm === baseNorm ||
        targetNorm.endsWith(`.${baseNorm}`) ||
        baseNorm.endsWith(`.${targetNorm}`)
      );
    }

    return targetNorm === baseNorm;
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 3. HTML IMAGE & LINK EXTRACTION (Supports Lazy-Load, Srcset, Backgrounds)
// ═══════════════════════════════════════════════════════════════════════

function extractUrlFromImgTag(attrs) {
  if (!attrs) return null;
  // 1. Check data-src, data-original, data-lazy-src, data-lazy, data-highres, data-zoom-image, data-url, data-img
  const lazyMatch = attrs.match(/\b(?:data-src|data-original|data-lazy-src|data-lazy|data-highres|data-zoom-image|data-url|data-img)=["']([^"']+)["']/i);
  if (lazyMatch && lazyMatch[1] && !lazyMatch[1].trim().startsWith("data:")) {
    return lazyMatch[1].trim();
  }

  // 2. Check srcset / data-srcset (grab highest resolution candidate or first candidate)
  const srcsetMatch = attrs.match(/\b(?:data-srcset|srcset)=["']([^"']+)["']/i);
  if (srcsetMatch && srcsetMatch[1]) {
    const candidates = srcsetMatch[1].split(",");
    const last = candidates[candidates.length - 1].trim().split(/\s+/)[0];
    if (last && !last.startsWith("data:")) {
      return last;
    }
  }

  // 3. Check regular src attribute (ensuring it's not a dummy data: placeholder)
  const srcMatch = attrs.match(/\bsrc=["']([^"']+)["']/i);
  if (srcMatch && srcMatch[1] && !srcMatch[1].trim().startsWith("data:")) {
    return srcMatch[1].trim();
  }

  return null;
}

function extractImageContext(html, tagIndex) {
  if (!html || tagIndex < 0) return "";
  const lookbackStart = Math.max(0, tagIndex - 1600);
  const lookbackChunk = html.substring(lookbackStart, tagIndex);
  
  const lastSectionBreak = Math.max(
    lookbackChunk.lastIndexOf("<section"),
    lookbackChunk.lastIndexOf("<article"),
    lookbackChunk.lastIndexOf("<main"),
    lookbackChunk.lastIndexOf("wpb_wrapper"),
    lookbackChunk.lastIndexOf("entry-content"),
    lookbackChunk.lastIndexOf("post-content")
  );
  
  const relevantSlice = lastSectionBreak !== -1 ? lookbackChunk.substring(lastSectionBreak) : lookbackChunk;
  return relevantSlice
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractImageUrls(html, baseUrl, skipProductDetails = true) {
  const imageMap = new Map();

  function addImage(rawUrl, alt = "", title = "", context = "") {
    if (!rawUrl || rawUrl.startsWith("data:")) return;
    try {
      const resolved = new URL(rawUrl.trim(), baseUrl);
      if (!["http:", "https:"].includes(resolved.protocol)) return;
      const highRes = getHighResImageUrl(resolved.toString());
      if (!imageMap.has(highRes)) {
        imageMap.set(highRes, {
          url: highRes,
          alt: (alt || "").trim(),
          title: (title || "").trim(),
          context: (context || "").trim()
        });
      } else {
        const existing = imageMap.get(highRes);
        if (!existing.context && context) existing.context = context.trim();
        if (!existing.alt && alt) existing.alt = alt.trim();
        if (!existing.title && title) existing.title = title.trim();
      }
    } catch {}
  }

  let isPageProductDetail = false;
  try {
    const pageObj = new URL(baseUrl);
    isPageProductDetail = isProductDetailPage(pageObj.pathname);
  } catch {}

  // If current page is an individual product detail page, allow corporate images, logos, and banners
  if (skipProductDetails && isPageProductDetail) {
    const corporateImgRegex = /<img\b([^>]*\b(?:class|id|alt|src)=["'][^"']*\b(?:logo|brand|header-logo|company-logo|banner|cert|certificate|flyer|catalog)\b[^"']*["'][^>]*)>/gi;
    let mCorp;
    while ((mCorp = corporateImgRegex.exec(html)) !== null) {
      const attrs = mCorp[1];
      const u = extractUrlFromImgTag(attrs);
      if (u) {
        const altMatch = attrs.match(/\balt=["']([^"']*)["']/i);
        const titleMatch = attrs.match(/\btitle=["']([^"']*)["']/i);
        const context = extractImageContext(html, mCorp.index);
        addImage(u, altMatch ? altMatch[1] : "", titleMatch ? titleMatch[1] : "", context);
      }
    }
    return Array.from(imageMap.values());
  }

  // Strip product thumbnail cards/grids, but keep containers containing corporate keywords
  let sanitizedHtml = html;
  if (skipProductDetails) {
    const productContainerRegex = /<(?:div|li|article|section|ul)\b[^>]*\b(?:class|id)=["'][^"']*\b(?:product-card|product-item|product-box|product-grid|product-list|products-grid|item-card|shop-item|product-listing|grid-product|product-grid-item|woocommerce-product|product-miniature|wc-block-grid__product|category-card|category-item|collection-card|product-gallery)\b[^"']*["'][^>]*>[\s\S]*?<\/(?:div|li|article|section|ul)>/gi;
    sanitizedHtml = html.replace(productContainerRegex, (match) => {
      if (CORPORATE_WHITELIST_REGEX.test(match)) {
        return match;
      }
      return " ";
    });
  }

  // 1. <img> tags with data-src, lazy-src, srcset, or src
  const imgRegex = /<img\b([^>]*)>/gi;
  let m;
  while ((m = imgRegex.exec(sanitizedHtml)) !== null) {
    const tag = m[0];
    const attrs = m[1];

    const u = extractUrlFromImgTag(attrs);
    if (!u) continue;

    if (isProductItemImage(tag, u, skipProductDetails)) {
      continue;
    }

    const altMatch = attrs.match(/\balt=["']([^"']*)["']/i);
    const titleMatch = attrs.match(/\btitle=["']([^"']*)["']/i);
    const context = extractImageContext(sanitizedHtml, m.index);

    addImage(u, altMatch ? altMatch[1] : "", titleMatch ? titleMatch[1] : "", context);
    if (imageMap.size >= 25) break;
  }

  // 2. <source srcset="..."> and <img srcset="...">
  const srcRegex = /<(?:source|img)\b[^>]*\b(?:srcset|data-srcset)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  while ((m = srcRegex.exec(sanitizedHtml)) !== null) {
    const rawVal = m[1] || m[2] || m[3] || "";
    if (!rawVal) continue;
    const candidates = rawVal.split(",");
    for (const candidate of candidates) {
      const imageUrl = candidate.trim().split(/\s+/)[0];
      if (imageUrl && !imageUrl.startsWith("data:") && !isProductItemImage(m[0], imageUrl, skipProductDetails)) {
        addImage(imageUrl);
      }
    }
  }

  // 3. CSS background-image in style attributes and inline styles
  const bgRegex = /url\(["']?([^"')]+)["']?\)/gi;
  while ((m = bgRegex.exec(sanitizedHtml)) !== null) {
    const rawUrl = m[1].trim();
    if (rawUrl && !rawUrl.startsWith("data:") && (rawUrl.startsWith("http") || rawUrl.startsWith("/") || rawUrl.startsWith("./"))) {
      if (!isProductItemImage("", rawUrl, skipProductDetails)) {
        addImage(rawUrl);
      }
    }
  }

  // 4. Meta og:image and twitter:image
  const metaRegex = /<meta\b[^>]*(?:\bproperty=["']og:image["']|\bname=["']twitter:image["'])[^>]*\bcontent=["']([^"']+)["'][^>]*>/gi;
  while ((m = metaRegex.exec(html)) !== null) {
    const u = m[1].trim();
    if (u && !u.startsWith("data:") && !isProductItemImage("", u, skipProductDetails)) {
      addImage(u);
    }
  }

  return Array.from(imageMap.values());
}

// Extract links, PDF candidates, JSON paths, and body text
function extractAllLinksAndText(html) {
  const rawLinks = [];
  const directPdfCandidates = new Set();

  // 1. Regular <a> links
  const aRegex = /<a\b([^>]*)>(.*?)<\/a>/gis;
  let aMatch;
  while ((aMatch = aRegex.exec(html)) !== null) {
    const attrs = aMatch[1] || "";
    const innerText = aMatch[2] || "";

    const hrefMatch = attrs.match(/\b(?:href|data-href|data-url)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const href = hrefMatch ? hrefMatch[1] || hrefMatch[2] || hrefMatch[3] : "";
    if (href) {
      const trimmedHref = href.trim().replace(/[\\'"\s]+$/, "");
      if (trimmedHref && !trimmedHref.startsWith("javascript:") && !trimmedHref.startsWith("#")) {
        rawLinks.push(trimmedHref);

        if (
          /\.pdf\b/i.test(innerText) ||
          /\bdownload\s*=\s*["'][^"']*\.pdf/i.test(attrs) ||
          /\btype\s*=\s*["']application\/pdf/i.test(attrs)
        ) {
          directPdfCandidates.add(trimmedHref);
        }
      }
    }
  }

  // 2. Embedded objects / iframes / embeds
  const embeddedRegex = /<(?:iframe|embed|object)\b[^>]*(?:\bsrc|\bdata)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>/gi;
  let embMatch;
  while ((embMatch = embeddedRegex.exec(html)) !== null) {
    const src = embMatch[1] || embMatch[2] || embMatch[3] || "";
    if (src) {
      const trimmedSrc = src.trim().replace(/[\\'"\s]+$/, "");
      if (trimmedSrc && !trimmedSrc.startsWith("javascript:")) {
        rawLinks.push(trimmedSrc);
        if (isPotentialPdfUrl(trimmedSrc)) {
          directPdfCandidates.add(trimmedSrc);
        }
      }
    }
  }

  // 3. Next.js, Nuxt, React SPA router paths and JSON-LD paths:
  // Unescape JSON strings so \"\/contact-us\" becomes "/contact-us"
  const unescapedHtml = html.replace(/\\(["'/\\bfnrtv])/g, "$1");
  const jsonPathRegex = /"(?:\/|https?:\/\/)[a-zA-Z0-9_\-\.~/]+"/g;
  let jpMatch;
  while ((jpMatch = jsonPathRegex.exec(unescapedHtml)) !== null) {
    const candidate = jpMatch[0].slice(1, -1);
    if (
      candidate.startsWith("/") &&
      !candidate.startsWith("/_next/") &&
      !candidate.startsWith("/api/") &&
      !candidate.startsWith("/static/") &&
      !candidate.includes("//") &&
      !candidate.includes("{") &&
      !candidate.includes("<") &&
      !SKIP_EXT_REGEX.test(candidate) &&
      candidate.length > 1 &&
      candidate.length < 150
    ) {
      rawLinks.push(candidate);
      if (isPotentialPdfUrl(candidate)) {
        directPdfCandidates.add(candidate);
      }
    }
  }

  // 4. Schema.org JSON-LD Structured Data extraction (harvests organization emails and sameAs / url links)
  const jsonLdRegex = /<script\b[^>]*\btype=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let jsonLdMatch;
  while ((jsonLdMatch = jsonLdRegex.exec(html)) !== null) {
    const rawJson = jsonLdMatch[1];
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
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ");

  const text = cleanHtml.replace(/<[^>]+>/g, " ");
  return { text, rawLinks, directPdfCandidates };
}

// ═══════════════════════════════════════════════════════════════════════
// 4. STRICT EMAIL VALIDATION & EXTRACTION
// ═══════════════════════════════════════════════════════════════════════

// Recognized valid TLDs (top generic + modern + all ISO country codes)
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

function isValidEmail(email) {
  if (!email || email.length < 6 || email.length > 254) return false;
  const atParts = email.split("@");
  if (atParts.length !== 2) return false;
  const [local, domain] = atParts;
  if (!local || local.length < 2 || local.length > 64 || !domain) return false;

  // Local part checks: must start and end with alphanumeric, no consecutive dots/symbols
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._%+-]*[a-zA-Z0-9]$/.test(local)) return false;
  if (local.includes("..") || local.includes("__") || local.includes("--")) return false;
  // Disallow pure numeric local parts unless >= 4 digits
  if (/^\d+$/.test(local) && local.length < 4) return false;

  // Domain checks
  if (!domain.includes(".") || domain.startsWith(".") || domain.endsWith(".")) return false;
  const domainLabels = domain.split(".");
  if (domainLabels.length < 2) return false;

  for (const label of domainLabels) {
    if (!label || label.length > 63) return false;
    if (label.startsWith("-") || label.endsWith("-")) return false;
    if (!/^[a-zA-Z0-9-]+$/.test(label)) return false;
  }

  // Second-Level Domain (SLD) check: label immediately preceding TLD
  const sld = domainLabels[domainLabels.length - 2].toLowerCase();
  // Reject single-character SLDs (e.g. "0.yl", "j.xbr") unless single-letter on .com
  if (sld.length < 2) {
    const tldCandidate = domainLabels[domainLabels.length - 1].toLowerCase();
    if (tldCandidate !== "com" || !/^[a-zA-Z]$/.test(sld)) return false;
  }
  // Reject SLDs that are pure digits (e.g. "0.com", "123.net")
  if (/^\d+$/.test(sld)) return false;

  // TLD check: must be recognized valid TLD
  const tld = domainLabels[domainLabels.length - 1].toLowerCase();
  if (!VALID_TLDS.has(tld)) return false;

  // Asset extension reject
  const badExtensions = /\.(png|jpe?g|webp|gif|svg|bmp|ico|tiff?|css|js|jsx|ts|tsx|woff2?|ttf|eot|pdf|zip|gz|tar|rar|mp4|webm|avi|mp3|wav|xml|json|wasm|bin|dat)$/i;
  if (badExtensions.test(email)) return false;

  // Dummy placeholder emails reject
  const dummyEmails = new Set([
    "test@test.com", "example@example.com", "user@domain.com", "name@company.com",
    "someone@example.com", "sample@sample.com", "admin@domain.com", "email@email.com"
  ]);
  if (dummyEmails.has(email.toLowerCase())) return false;

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
  // Detects data-cfemail="..." and /cdn-cgi/l/email-protection#...
  const cfEmailRegex = /(?:data-cfemail=["']([0-9a-fA-F]+)["']|\/cdn-cgi\/l\/email-protection(?:#|\?)([0-9a-fA-F]+))/gi;
  let cfMatch;
  while ((cfMatch = cfEmailRegex.exec(rawStr)) !== null) {
    const hex = cfMatch[1] || cfMatch[2];
    const decoded = decodeCloudflareEmail(hex);
    if (decoded) {
      const cleanDecoded = decoded.trim().toLowerCase().replace(/^[^\w]+/, "").replace(/[^\w]+$/, "");
      if (isValidEmail(cleanDecoded)) {
        found.add(cleanDecoded);
      }
    }
  }

  // 2. Base64 Encoded Email Data Attributes (e.g. data-email="...", data-mail="...", data-contact="...")
  const b64AttrRegex = /\bdata-(?:email|mail|contact|encoded)\s*=\s*["']([a-zA-Z0-9+/=]{8,120})["']/gi;
  let b64Match;
  while ((b64Match = b64AttrRegex.exec(rawStr)) !== null) {
    try {
      const decoded = atob(b64Match[1]).trim().toLowerCase().replace(/^[^\w]+/, "").replace(/[^\w]+$/, "");
      if (isValidEmail(decoded)) {
        found.add(decoded);
      }
    } catch {}
  }

  // 3. Decode all HTML Decimal Entities (&#105;) and Hex Entities (&#x69;)
  let text = rawStr
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    // Decode URI component escapes like %40, %2e
    .replace(/%40/gi, "@")
    .replace(/%2e/gi, ".")
    // Decode JSON / Unicode escapes
    .replace(/\\u0040/gi, "@")
    .replace(/\\u002e/gi, ".")
    // HTML named entities
    .replace(/&commat;/gi, "@")
    .replace(/&period;/gi, ".")
    .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, " ")
    .replace(/mailto:\s*/gi, "");

  // Common obfuscation replacements: [at], (at), [dot], (dot), etc.
  const cleaned = text
    .replace(/[@\uFF20\u00A9\u00AE]/g, "@")
    .replace(/\s*[\(\[\{<]\s*(?:at|@)\s*[\)\]\}>]\s*/gi, "@")
    .replace(/\s*([.\uFF0E\u00B7\u2022])\s*/g, ".")
    .replace(/\s*[\(\[\{]\s*dot\s*[\)\]\}]\s*/gi, ".");

  // Also catch spaced emails like "daisyyang @ zungsung . com"
  const unspaced = cleaned.replace(/([a-zA-Z0-9._%+-]+)\s*@\s*([a-zA-Z0-9.-]+)\s*\.\s*([a-zA-Z]{2,24})/g, "$1@$2.$3");

  const tokens = unspaced
    .replace(/<[^>]+>/g, " ")
    .split(/[\r\n,;| \t"'<>()[\]{}]+/)
    .filter(Boolean);

  for (const token of tokens) {
    const trimmed = token.trim().toLowerCase().replace(/^[^\w]+/, "").replace(/[^\w]+$/, "");
    if (isValidEmail(trimmed)) {
      found.add(trimmed);
    } else {
      const matches = trimmed.match(EMAIL_REGEX) || [];
      for (let m of matches) {
        m = m.toLowerCase().replace(/^[^\w]+/, "").replace(/[^\w]+$/, "");
        if (isValidEmail(m)) {
          found.add(m);
        }
      }
    }
  }

  return Array.from(found);
}

// Convert ArrayBuffer to Base64 in chunks
function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  const chunkSize = 8192;
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}

// ═══════════════════════════════════════════════════════════════════════
// 5. SERVICE WORKER MESSAGE DISPATCH & STATE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════

let activeCrawl = null;
let lastCompletedCrawl = null;

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "START_CRAWL") {
    if (activeCrawl) {
      activeCrawl.aborted = true;
      activeCrawl = null;
    }

    const crawlState = {
      aborted: false,
      startUrl: msg.startUrl,
      maxPages: msg.maxPages || 500,
      concurrency: msg.concurrency || 8,
      checkPdfs: msg.checkPdfs !== false,
      ocrPdfs: msg.ocrPdfs !== false,
      ocrImages: msg.ocrImages !== false,
      includeSubdomains: !!msg.includeSubdomains,
      skipProductDetailPages: msg.skipProductDetailPages !== false,
      isCrawling: true
    };
    activeCrawl = crawlState;

    runProductionCrawl(crawlState)
      .then((data) => {
        lastCompletedCrawl = { ...data, isCrawling: false };
        if (activeCrawl === crawlState) activeCrawl = null;
        chrome.runtime.sendMessage({ type: "CRAWL_COMPLETED", data: lastCompletedCrawl }).catch(() => {});
        sendResponse({ ok: true, data });
      })
      .catch((err) => {
        if (activeCrawl === crawlState) activeCrawl = null;
        chrome.runtime.sendMessage({ type: "CRAWL_FAILED", error: err.message }).catch(() => {});
        sendResponse({ ok: false, error: err.message });
      });

    return true;
  }

  if (msg.type === "GET_CRAWL_STATUS") {
    if (activeCrawl) {
      sendResponse({
        ok: true,
        isCrawling: !!activeCrawl.isCrawling,
        aborted: !!activeCrawl.aborted,
        findings: activeCrawl.findings || [],
        discoveredPdfs: activeCrawl.discoveredPdfs || [],
        discoveredImages: activeCrawl.discoveredImages || [],
        imageWarnings: activeCrawl.imageWarnings || [],
        siteRestrictedRecord: activeCrawl.siteRestrictedRecord || null,
        stats: {
          pagesCrawled: activeCrawl.visitedUrls ? activeCrawl.visitedUrls.size : 0,
          pdfsChecked: activeCrawl.visitedPdfs ? activeCrawl.visitedPdfs.size : 0,
          pdfsAvailable: activeCrawl.pdfsAvailableCount || 0,
          imagesScanned: activeCrawl.visitedImages ? activeCrawl.visitedImages.size : 0
        }
      });
    } else if (lastCompletedCrawl) {
      sendResponse({
        ok: true,
        isCrawling: false,
        aborted: !!lastCompletedCrawl.aborted,
        findings: lastCompletedCrawl.findings || [],
        discoveredPdfs: lastCompletedCrawl.discoveredPdfs || [],
        discoveredImages: lastCompletedCrawl.discoveredImages || [],
        imageWarnings: lastCompletedCrawl.imageWarnings || [],
        siteRestrictedRecord: lastCompletedCrawl.siteRestrictedRecord || null,
        stats: {
          pagesCrawled: lastCompletedCrawl.pagesCrawled || 0,
          pdfsChecked: lastCompletedCrawl.pdfsChecked || 0,
          pdfsAvailable: lastCompletedCrawl.pdfsAvailable || 0,
          imagesScanned: lastCompletedCrawl.imagesScanned || 0
        }
      });
    } else {
      sendResponse({ ok: true, isCrawling: false, findings: [], discoveredPdfs: [], discoveredImages: [], imageWarnings: [] });
    }
    return true;
  }

  if (msg.type === "CHECK_IMAGE_RESTRICTION") {
    const warning = detectRestrictedImageContent(
      msg.ocrText,
      msg.visualResult,
      msg.imageUrl,
      msg.sourcePage,
      msg.imageContext,
      msg.altText
    );
    if (warning) {
      emitImageRestrictionWarning(warning);
      if (activeCrawl && activeCrawl.addImageWarning) {
        activeCrawl.addImageWarning(warning);
      }
    }
    sendResponse({ ok: true, warning });
    return true;
  }

  if (msg.type === "REGISTER_EMAIL" || msg.type === "RECORD_OCR_EMAIL") {
    if (activeCrawl && activeCrawl.recordEmail) {
      activeCrawl.recordEmail(msg.email, msg.sourceUrl, msg.sourceType, msg.mainPageUrl);
    }
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === "UPDATE_PDF_STATUS") {
    if (activeCrawl && activeCrawl.updatePdfStatus) {
      activeCrawl.updatePdfStatus(msg.url, msg.status, msg.emailsFound);
    }
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === "UPDATE_IMAGE_STATUS") {
    if (activeCrawl && activeCrawl.updateImageStatus) {
      activeCrawl.updateImageStatus(msg.url, msg.status, msg.emailsFound);
    }
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === "RECORD_IMAGE_WARNING") {
    if (activeCrawl && activeCrawl.addImageWarning) {
      activeCrawl.addImageWarning(msg.warningRecord);
    }
    sendResponse({ ok: true });
    return true;
  }

  // Large PDF binary buffer streaming fallback (bypasses CORS in popup context)
  if (msg.type === "FETCH_PDF_BUFFER") {
    fetch(msg.url, { credentials: "omit", headers: PDF_FETCH_HEADERS })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.arrayBuffer();
      })
      .then((buf) => {
        const b64 = arrayBufferToBase64(buf);
        sendResponse({ ok: true, base64Data: b64, numBytes: buf.byteLength });
      })
      .catch((err) => {
        sendResponse({ ok: false, error: err.message });
      });
    return true;
  }

  if (msg.type === "PING") {
    sendResponse({ ok: true, isCrawling: !!(activeCrawl && activeCrawl.isCrawling) });
    return true;
  }

  if (msg.type === "STOP_CRAWL") {
    if (activeCrawl) {
      activeCrawl.aborted = true;
      activeCrawl.isCrawling = false;
      sendResponse({ ok: true, stopped: true });
    } else {
      sendResponse({ ok: true, stopped: false });
    }
    return true;
  }
});

let lastProgressEmitTime = 0;
function emitProgress(data) {
  const now = Date.now();
  // Throttle updates to at most once per 100ms unless queue is empty (finished)
  if (now - lastProgressEmitTime < 100 && data.queueRemaining !== 0) return;
  lastProgressEmitTime = now;
  chrome.runtime.sendMessage({ type: "CRAWL_PROGRESS", ...data }).catch(() => {});
}

function emitEmailFound(finding) {
  chrome.runtime.sendMessage({ type: "EMAIL_FOUND", finding }).catch(() => {});
}

function emitPdfDiscovered(pdfRecord) {
  chrome.runtime.sendMessage({ type: "PDF_DISCOVERED", pdfRecord }).catch(() => {});
}

function emitImageDiscovered(imageRecord) {
  chrome.runtime.sendMessage({ type: "IMAGE_DISCOVERED", imageRecord }).catch(() => {});
}

function emitProcessPdf(pdfTask) {
  chrome.runtime.sendMessage({ type: "PROCESS_PDF", ...pdfTask }).catch(() => {});
}

function emitProcessImage(imageTask) {
  chrome.runtime.sendMessage({ type: "PROCESS_IMAGE_OCR", ...imageTask }).catch(() => {});
}

// ═══════════════════════════════════════════════════════════════════════
// 5. CORPORATE SISTER DOMAIN & TLD DISCOVERY ENGINE
// Solves missing emails on regional portals (IndiaMART, TradeIndia, B2B) & alternate TLDs
// ═══════════════════════════════════════════════════════════════════════

function generateSisterDomains(domain) {
  const norm = (domain || "").toLowerCase().replace(/^www\./, "");
  const parts = norm.split(".");
  if (parts.length < 2) return [];

  const sld = parts[0];
  const tld = parts.slice(1).join(".");
  const candidates = new Set();

  // Strip geographic or corporate modifiers (e.g. torquemasterindia -> torquemaster)
  const geoKeywords = [
    "india", "australia", "aust", "uk", "usa", "america", "global",
    "intl", "international", "group", "corp", "tools", "industries", "technologies", "tech"
  ];

  for (const kw of geoKeywords) {
    if (sld.includes(kw) && sld.length > kw.length + 2) {
      const stripped = sld.replace(kw, "");
      if (stripped.length >= 3) {
        candidates.add(`${stripped}.in`);
        candidates.add(`${stripped}.com`);
        candidates.add(`${stripped}.co.in`);
        candidates.add(`${stripped}.com.au`);
        candidates.add(`${stripped}.co.uk`);
        candidates.add(`${stripped}.org`);
        candidates.add(`${stripped}.net`);
      }
    }
  }

  // Common TLD switches (e.g. .com <-> .in, .co.in, .com.au, .co.uk)
  if (tld === "com") {
    candidates.add(`${sld}.in`);
    candidates.add(`${sld}.co.in`);
    candidates.add(`${sld}.com.au`);
    candidates.add(`${sld}.co.uk`);
    candidates.add(`${sld}.net`);
    candidates.add(`${sld}.org`);
  } else if (tld === "in" || tld === "co.in") {
    candidates.add(`${sld}.com`);
    candidates.add(`${sld}india.com`);
  } else if (tld === "com.au") {
    candidates.add(`${sld}.com`);
  } else if (tld === "co.uk") {
    candidates.add(`${sld}.com`);
  }

  candidates.delete(norm);
  return Array.from(candidates).slice(0, 8);
}

async function discoverCompanySisterDomainEmails(startUrl, companyKeywords, normalizeAndExtractEmailsFn) {
  try {
    const startObj = new URL(startUrl);
    const sisterDomains = generateSisterDomains(startObj.hostname);
    if (!sisterDomains.length) return [];

    const foundEmails = new Map();
    const probePromises = sisterDomains.map(async (domain) => {
      const testUrls = [`https://www.${domain}/`, `https://${domain}/`];
      for (const tUrl of testUrls) {
        try {
          const res = await fetch(tUrl, {
            credentials: "omit",
            headers: STANDARD_FETCH_HEADERS,
            signal: AbortSignal.timeout(4500)
          });
          if (res.ok) {
            const html = await res.text();
            if (html && html.length > 500) {
              const lowerHtml = html.toLowerCase();
              const matchesCompany =
                companyKeywords.length === 0 ||
                companyKeywords.some((kw) => kw.length >= 4 && lowerHtml.includes(kw.toLowerCase()));

              if (matchesCompany) {
                const extracted = normalizeAndExtractEmailsFn(html);
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

    await Promise.all(probePromises);
    return Array.from(foundEmails.values());
  } catch (err) {
    console.warn("Sister domain probe error:", err);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 6. PRODUCTION CRAWLER EXECUTION CORE
// ═══════════════════════════════════════════════════════════════════════

async function runProductionCrawl(crawlState) {
  const { startUrl, maxPages, concurrency, checkPdfs, ocrPdfs, ocrImages, includeSubdomains, skipProductDetailPages } = crawlState;
  const startObj = new URL(startUrl);
  const baseOrigin = startObj.origin;
  const baseHostname = startObj.hostname;

  const initialUrl = cleanAndNormalizeUrl(startUrl, startUrl);
  const htmlQueue = [initialUrl];
  const pdfQueue = [];
  const imageOcrQueue = [];

  const enqueuedHtmlUrls = new Set([initialUrl]);
  const enqueuedPdfUrls = new Set();
  const enqueuedImageUrls = new Set();
  const visitedUrls = new Set();
  const visitedPdfs = new Set();
  const visitedImages = new Set();

  const discoveredPdfs = [];
  const discoveredImages = [];
  const discoveredCompanyKeywords = new Set();
  let pdfsAvailableCount = 0;

  // Multi-source email tracking: Map<emailString, FindingObject>
  const findingsMap = new Map();
  const findings = [];

  // Expose state references on crawlState for instant popup sync
  crawlState.findings = findings;
  crawlState.discoveredPdfs = discoveredPdfs;
  crawlState.discoveredImages = discoveredImages;
  crawlState.visitedUrls = visitedUrls;
  crawlState.visitedPdfs = visitedPdfs;
  crawlState.visitedImages = visitedImages;
  crawlState.pdfsAvailableCount = 0;

  // ── Multi-Source Email Recorder ──────────────────────────────────────
  function recordEmail(rawEmail, sourceUrl, sourceType, mainPageUrl) {
    if (!rawEmail) return;
    const cleanEmails = normalizeAndExtractEmails(rawEmail);
    if (cleanEmails.length === 0) return;

    for (const email of cleanEmails) {
      const existing = findingsMap.get(email);
      const nowStr = new Date().toISOString();
      const sourceEntry = {
        sourceType: sourceType || "HTML",
        sourceUrl: sourceUrl || startUrl,
        mainPageUrl: mainPageUrl || sourceUrl || startUrl,
        timestamp: nowStr
      };

      if (existing) {
        // Multi-source tracking: check if this source is already logged
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
  }

  crawlState.recordEmail = recordEmail;
  crawlState.updatePdfStatus = (url, status, emailsFound) => {
    const rec = discoveredPdfs.find((p) => p.url === url);
    if (rec) {
      rec.status = status;
      if (emailsFound !== undefined) rec.emailsFound = emailsFound;
    }
  };
  crawlState.updateImageStatus = (url, status, emailsFound) => {
    const rec = discoveredImages.find((img) => img.url === url);
    if (rec) {
      rec.status = status;
      if (emailsFound !== undefined) rec.emailsFound = emailsFound;
    }
  };

  // ── Restricted Tracking ─────────────────────────────────────────────
  const imageWarnings = [];        // image-only warnings (NEVER stops crawl)
  let siteRestrictedRecord = null; // business-confirmed restriction

  crawlState.imageWarnings = imageWarnings;
  crawlState.addImageWarning = (warningRecord) => {
    const exists = imageWarnings.some(
      (w) => w.imageUrl === warningRecord.imageUrl && w.category === warningRecord.category
    );
    if (!exists) {
      imageWarnings.push(warningRecord);
    }
  };

  function enqueuePdf(pdfUrl, sourcePage) {
    if (!checkPdfs) return;
    if (visitedPdfs.has(pdfUrl) || enqueuedPdfUrls.has(pdfUrl)) return;
    enqueuedPdfUrls.add(pdfUrl);

    let domain = "";
    try {
      domain = new URL(pdfUrl).hostname;
    } catch {
      domain = "unknown";
    }

    const pdfRecord = {
      url: pdfUrl,
      domain,
      sourcePage: sourcePage || startUrl,
      status: "Queued",
      emailsFound: 0
    };
    discoveredPdfs.push(pdfRecord);
    emitPdfDiscovered(pdfRecord);

    pdfQueue.push({ url: pdfUrl, record: pdfRecord });
  }

  function enqueueImageForOcr(rawImageUrl, sourcePage, isFromImageElement = true, imageContext = "", altText = "", titleText = "") {
    if (!ocrImages) return;
    const imageUrl = getHighResImageUrl(rawImageUrl);
    if (!imageUrl) return;
    if (visitedImages.has(imageUrl) || enqueuedImageUrls.has(imageUrl)) return;
    if (!isCandidateImage(imageUrl, isFromImageElement, skipProductDetailPages)) return;

    enqueuedImageUrls.add(imageUrl);

    let domain = "";
    try {
      domain = new URL(imageUrl).hostname;
    } catch {
      domain = "unknown";
    }

    const imageRecord = {
      url: imageUrl,
      domain,
      sourcePage: sourcePage || startUrl,
      status: "Queued",
      emailsFound: 0,
      context: imageContext || "",
      alt: altText || "",
      title: titleText || ""
    };
    discoveredImages.push(imageRecord);
    emitImageDiscovered(imageRecord);

    imageOcrQueue.push({
      url: imageUrl,
      originalUrl: rawImageUrl,
      sourcePage,
      context: imageContext || "",
      alt: altText || "",
      title: titleText || "",
      record: imageRecord
    });
  }

  async function processTask(currentItem, mode) {
    if (crawlState.aborted) return;
    const currentUrl = mode === "html" ? currentItem : currentItem.url;

    emitProgress({
      pagesCrawled: visitedUrls.size,
      pdfsCrawled: visitedPdfs.size,
      pdfsAvailable: pdfsAvailableCount,
      imagesScanned: visitedImages.size,
      queueRemaining: htmlQueue.length + pdfQueue.length + imageOcrQueue.length,
      currentUrl,
      findingsCount: findings.length,
      discoveredPdfsCount: discoveredPdfs.length,
      discoveredImagesCount: discoveredImages.length
    });

    // ── Process Discovered PDF Document ──────────────────────────────
    if (mode === "pdf") {
      if (visitedPdfs.has(currentUrl)) return;
      visitedPdfs.add(currentUrl);

      const pdfRec = currentItem.record;
      const mainSitePage = pdfRec ? pdfRec.sourcePage : currentUrl;

      try {
        const res = await fetch(currentUrl, { credentials: "omit", headers: PDF_FETCH_HEADERS });
        if (!res.ok) {
          if (pdfRec) pdfRec.status = `HTTP ${res.status}`;
          return;
        }

        const buffer = await res.arrayBuffer();

        // Base64 encode for PDF.js in popup (up to 15MB)
        const base64Data = buffer.byteLength <= 15 * 1024 * 1024 ? arrayBufferToBase64(buffer) : "";

        pdfsAvailableCount++;
        crawlState.pdfsAvailableCount = pdfsAvailableCount;
        if (pdfRec) pdfRec.status = "Rendering with PDF.js...";

        emitProcessPdf({
          pdfUrl: currentUrl,
          mainPageUrl: mainSitePage,
          base64Data,
          numBytes: buffer.byteLength,
          ocrPdfs
        });
      } catch {
        if (pdfRec) pdfRec.status = "Access/Network Error";
      }
    }
    // ── Process Discovered Website Image ─────────────────────────────
    else if (mode === "image") {
      if (visitedImages.has(currentUrl)) return;
      visitedImages.add(currentUrl);

      const imgRec = currentItem.record;
      const mainSitePage = currentItem.sourcePage || currentUrl;
      const fallbackUrl = currentItem.originalUrl || currentUrl;

      try {
        if (imgRec) imgRec.status = "Downloading...";
        let res = await fetch(currentUrl, { credentials: "omit", headers: IMAGE_FETCH_HEADERS });

        // Fallback if high-res rewrite 404s
        if (!res.ok && currentUrl !== fallbackUrl) {
          res = await fetch(fallbackUrl, { credentials: "omit", headers: IMAGE_FETCH_HEADERS });
        }

        if (!res.ok) {
          if (imgRec) imgRec.status = `HTTP ${res.status}`;
          return;
        }

        const contentType = (res.headers.get("content-type") || "").toLowerCase();
        if (
          !contentType.includes("image") &&
          !contentType.includes("octet-stream") &&
          !contentType.includes("application/octet-stream")
        ) {
          if (imgRec) imgRec.status = "Not an image";
          return;
        }

        const buffer = await res.arrayBuffer();
        if (buffer.byteLength < 2500) {
          if (imgRec) imgRec.status = "Skipped (too small)";
          return;
        }
        if (buffer.byteLength > 20 * 1024 * 1024) {
          if (imgRec) imgRec.status = "Skipped (>20MB)";
          return;
        }

        // If SVG, extract text directly without Tesseract
        if (contentType.includes("svg") || currentUrl.toLowerCase().endsWith(".svg")) {
          const svgText = new TextDecoder("utf-8").decode(buffer);
          const svgEmails = normalizeAndExtractEmails(svgText);
          if (svgEmails.length > 0) {
            for (const em of svgEmails) {
              recordEmail(em, currentUrl, "Website Image (SVG)", mainSitePage);
            }
            if (imgRec) imgRec.status = `Active (${svgEmails.length} emails)`;
          } else {
            if (imgRec) imgRec.status = "Scanned (0 emails)";
          }
          return;
        }

        const base64 = arrayBufferToBase64(buffer);
        const dataUrl = `data:${contentType || "image/jpeg"};base64,${base64}`;

        if (imgRec) imgRec.status = "Scanning with OCR...";
        emitProcessImage({
          imageUrl: currentUrl,
          mainPageUrl: mainSitePage,
          dataUrl,
          imageContext: currentItem.context || "",
          altText: currentItem.alt || "",
          titleText: currentItem.title || ""
        });
      } catch {
        if (imgRec) imgRec.status = "Download Failed";
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

        const res = await fetch(currentUrl, { credentials: "omit", headers: STANDARD_FETCH_HEADERS });
        if (!res.ok) return;

        // Issue 7 Fix: Capture final redirected URL to accurately resolve child links
        finalUrl = res.url || currentUrl;
        visitedUrls.add(finalUrl);

        if (currentUrl === initialUrl && finalUrl !== currentUrl) {
          try {
            const finalObj = new URL(finalUrl);
            if (normalizeHost(finalObj.hostname) !== normalizeHost(baseHostname)) {
              baseHostname = finalObj.hostname;
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

      // Extract company brand names from title, metadata, and logo alt text for sister-domain resolution
      const titleMatch = html.match(/<title\b[^>]*>(.*?)<\/title>/i);
      if (titleMatch && titleMatch[1]) {
        const parts = titleMatch[1].replace(/&amp;/g, "&").split(/[-–|,;:]+/);
        if (parts[0] && parts[0].trim().length >= 3) {
          discoveredCompanyKeywords.add(parts[0].trim());
          const clean = parts[0].replace(/\b(?:private\s+limited|pvt\.?\s*ltd\.?|ltd\.?|inc\.?|llc|corp\.?|gmbh)\b/gi, "").trim();
          if (clean.length >= 3) discoveredCompanyKeywords.add(clean);
        }
      }
      const compInp = html.match(/\bname=["']company_name["'][^>]*\bvalue=["']([^"']+)["']/i);
      if (compInp && compInp[1]) {
        discoveredCompanyKeywords.add(compInp[1].trim());
        const clean = compInp[1].replace(/\b(?:private\s+limited|pvt\.?\s*ltd\.?|ltd\.?|inc\.?|llc)\b/gi, "").trim();
        if (clean.length >= 3) discoveredCompanyKeywords.add(clean);
      }
      const logoAlt = html.match(/<img\b[^>]*\balt=["']([^"']*(?:ltd|limited|tools|company|corp)[^"']*)["']/i);
      if (logoAlt && logoAlt[1]) {
        discoveredCompanyKeywords.add(logoAlt[1].trim());
      }

      // ── Function 1: Restricted Business Detection (text-based, core pages) ──
      if (!siteRestrictedRecord) {
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        const pageTitle = titleMatch ? titleMatch[1] : "";
        const bizResult = detectRestrictedBusiness(text, pageTitle, finalUrl);
        if (bizResult) {
          siteRestrictedRecord = {
            ...bizResult,
            websiteUrl: startUrl,
            detectedOnPage: finalUrl,
            timestamp: new Date().toISOString()
          };
          emitSiteRestricted(siteRestrictedRecord);
          // Confirmed restricted business: halt crawl immediately
          crawlState.aborted = true;
          return;
        }
      }

      if (siteRestrictedRecord) return;

      // Extract emails from visible text, mailto links, and raw HTML attributes
      const textMatches = normalizeAndExtractEmails(text);
      const htmlMatches = normalizeAndExtractEmails(html);
      const allMatches = new Set([...textMatches, ...htmlMatches]);
      for (const m of allMatches) {
        recordEmail(m, finalUrl, "HTML", finalUrl);
      }

      // Collect website corporate images for OCR and visual restriction checks
      if (ocrImages) {
        const imageItems = extractImageUrls(html, finalUrl, skipProductDetailPages);
        for (const item of imageItems) {
          enqueueImageForOcr(item.url, finalUrl, true, item.context, item.alt, item.title);
        }
      }

      // Process found child links
      for (const rawLink of rawLinks) {
        if (!rawLink) continue;

        if (rawLink.toLowerCase().startsWith("mailto:")) {
          const addr = rawLink.slice(7).split("?")[0].trim();
          if (addr) recordEmail(addr, finalUrl, "HTML (mailto)", finalUrl);
          continue;
        }

        // Resolve relative to final redirected URL
        const cleanUrl = cleanAndNormalizeUrl(rawLink, finalUrl);
        if (!cleanUrl) continue;

        // Check if link points to a PDF file on ANY domain
        if (directPdfCandidates.has(rawLink) || isPotentialPdfUrl(cleanUrl)) {
          enqueuePdf(cleanUrl, finalUrl);
          continue;
        }

        // Check if link points to a direct image file
        if (IMAGE_EXT_REGEX.test(cleanUrl)) {
          enqueueImageForOcr(cleanUrl, finalUrl);
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

        const targetObj = new URL(cleanUrl);

        if (skipProductDetailPages && isProductDetailPage(targetObj.pathname)) {
          continue;
        }

        if (visitedUrls.size + htmlQueue.length < maxPages * 1.5) {
          enqueuedHtmlUrls.add(cleanUrl);

          if (HIGH_PRIORITY_REGEX.test(cleanUrl)) {
            htmlQueue.unshift(cleanUrl);
          } else {
            htmlQueue.push(cleanUrl);
          }
        }
      }
    }
  }

  // ── True Concurrent Worker Pool ──────────────────────────────────────
  let activeWorkersCount = 0;
  let allWorkCompleted = false;

  function getNextTask() {
    if (crawlState.aborted) return null;
    if (htmlQueue.length > 0 && visitedUrls.size < maxPages) {
      return { currentItem: htmlQueue.shift(), mode: "html" };
    }
    if (checkPdfs && pdfQueue.length > 0) {
      return { currentItem: pdfQueue.shift(), mode: "pdf" };
    }
    if (ocrImages && imageOcrQueue.length > 0) {
      return { currentItem: imageOcrQueue.shift(), mode: "image" };
    }
    return null;
  }

  async function workerThread() {
    while (!crawlState.aborted && !allWorkCompleted) {
      const task = getNextTask();
      if (!task) {
        if (activeWorkersCount > 0) {
          // Other parallel workers are still fetching pages/PDFs (which may enqueue new work)
          await new Promise((resolve) => setTimeout(resolve, 40));
          continue;
        } else {
          // Grace period check: ensure no worker just finished before queue was populated
          await new Promise((resolve) => setTimeout(resolve, 150));
          if (getNextTask()) continue;
          if (activeWorkersCount > 0) continue;
          allWorkCompleted = true;
          break;
        }
      }

      activeWorkersCount++;
      try {
        await processTask(task.currentItem, task.mode);
      } catch (err) {
        console.warn("Worker error:", err);
      } finally {
        activeWorkersCount--;
      }
    }
  }

  // Launch all workers in parallel immediately
  const workerPromises = [];
  const poolSize = Math.max(1, concurrency || 8);
  for (let w = 0; w < poolSize; w++) {
    workerPromises.push(workerThread());
  }

  await Promise.all(workerPromises);

  // ── Global Fallback: Sister Domain & Alternate TLD Company Probe ──
  // If no emails were discovered in static catalog/HTML pages (common on IndiaMART, TradeIndia, regional domains),
  // probe official sister domains (e.g. torquemasterindia.com -> torquemaster.in)
  if (findings.length === 0 && !crawlState.aborted && !siteRestrictedRecord) {
    emitProgress({
      pagesCrawled: visitedUrls.size,
      pdfsCrawled: visitedPdfs.size,
      pdfsAvailable: pdfsAvailableCount,
      imagesScanned: visitedImages.size,
      queueRemaining: 0,
      currentUrl: "Probing company domain records & sister TLDs...",
      findingsCount: findings.length,
      discoveredPdfsCount: discoveredPdfs.length,
      discoveredImagesCount: discoveredImages.length,
      siteRestricted: false,
      imageWarningsCount: imageWarnings.length
    });

    const fallbackList = await discoverCompanySisterDomainEmails(
      startUrl,
      Array.from(discoveredCompanyKeywords),
      normalizeAndExtractEmails
    );

    const startNormHost = normalizeHost(baseHostname);

    for (const item of fallbackList) {
      const emailDomain = (item.email.split("@")[1] || "").toLowerCase();
      const isDirectDomain = emailDomain === startNormHost || startNormHost.endsWith(emailDomain);
      const label = isDirectDomain
        ? `HTML (Corporate Domain)`
        : `Sister Domain (${item.domain})`;

      recordEmail(item.email, item.sourceUrl, label, startUrl);
    }
  }

  emitProgress({
    pagesCrawled: visitedUrls.size,
    pdfsCrawled: visitedPdfs.size,
    pdfsAvailable: pdfsAvailableCount,
    imagesScanned: visitedImages.size,
    queueRemaining: 0,
    currentUrl: siteRestrictedRecord ? "RESTRICTED – Crawl Halted" : "Completed",
    findingsCount: findings.length,
    discoveredPdfsCount: discoveredPdfs.length,
    discoveredImagesCount: discoveredImages.length,
    siteRestricted: !!siteRestrictedRecord,
    imageWarningsCount: imageWarnings.length
  });

  return {
    pagesCrawled: visitedUrls.size,
    pdfsChecked: visitedPdfs.size,
    pdfsAvailable: pdfsAvailableCount,
    imagesScanned: visitedImages.size,
    discoveredPdfs,
    discoveredImages,
    aborted: crawlState.aborted,
    findings,
    siteRestrictedRecord,
    imageWarnings
  };
}
