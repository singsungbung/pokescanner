/* MonPrice M1S Scanner
   Static HTML/CSS/JS app.
   - Card DB and price DB are loaded separately.
   - Live detection runs continuously, OCR runs only after stable detection.
   - OCR accepts card-number patterns only and never falls back to the first card.
*/
const $ = (id) => document.getElementById(id);

const els = {
  video: $('video'),
  canvas: $('frameCanvas'),
  detectCanvas: $('detectCanvas'),
  placeholder: $('cameraPlaceholder'),
  guideFrame: $('guideFrame'),
  scanStatus: $('scanStatus'),
  detectStatus: $('detectStatus'),
  resultCard: $('resultCard'),
  resultStatus: $('resultStatus'),
  setSelect: $('setSelect'),
  startCamera: $('startCamera'),
  imageInput: $('imageInput'),
  stopCamera: $('stopCamera'),
  rescanBtn: $('rescanBtn'),
  toggleSearch: $('toggleSearch'),
  marketBtn: $('marketBtn'),
  searchPanel: $('searchPanel'),
  marketPanel: $('marketPanel'),
  searchInput: $('searchInput'),
  searchResults: $('searchResults'),
  cardName: $('cardName'),
  cardSet: $('cardSet'),
  cardNumber: $('cardNumber'),
  cardRarity: $('cardRarity'),
  nmPrice: $('nmPrice'),
  psaPrice: $('psaPrice'),
  priceUpdated: $('priceUpdated'),
  priceConfidence: $('priceConfidence'),
  thumb: $('thumb'),
  addCollection: $('addCollection'),
  collectionCondition: $('collectionCondition'),
  collectionQty: $('collectionQty'),
  purchasePrice: $('purchasePrice'),
  purchaseDate: $('purchaseDate'),
  collectionNote: $('collectionNote'),
  storageLocation: $('storageLocation'),
  collectionSummary: $('collectionSummary'),
  collectionBox: $('collectionBox'),
  clearCollection: $('clearCollection'),
  recentScans: $('recentScans'),
  openCardrush: $('openCardrush'),
  openMercari: $('openMercari'),
  openYahoo: $('openYahoo'),
  openGoogle: $('openGoogle')
};

const cards = window.MONPRICE_CARDS || window.MEGA_SYMPHONIA_CARDS || [];
const prices = window.MONPRICE_PRICES || window.MEGA_SYMPHONIA_PRICES || [];
const sets = window.MONPRICE_SETS || [{
  language: 'JP',
  set_code: 'M1S',
  set_name_en: 'Mega Symphonia',
  set_name_jp: 'メガシンフォニア',
  set_name_ko: '메가심포니아'
}];

const priceByCardId = new Map(prices.map(price => [price.card_id, price]));

const STATUS = {
  seeking: '카드 찾는 중',
  stabilizing: '카드 안정화 중',
  ready: 'OCR 대기',
  ocr: 'OCR 인식 중',
  complete: '인식 완료',
  failed: '인식 실패',
  missing: 'DB에 없는 카드',
  noPrice: '가격 데이터 없음'
};

const OVERLAY_COLORS = {
  seeking: '#ff5d72',
  stabilizing: '#ff5d72',
  ocr: '#ffbd4a',
  ready: '#ffbd4a',
  complete: '#42df87',
  failed: '#ff5d72',
  missing: '#ff5d72',
  noPrice: '#ffbd4a'
};

const DETECT_EVERY_MS = 420;
const STABLE_FRAME_COUNT = 3;
const STABLE_MS = 550;
const OCR_COOLDOWN_MS = 1700;
const RECENT_DEDUPE_MS = 30000;
const USE_BOX_TRACKING = false;

let selectedSet = sets[0];
let currentCard = null;
let stream = null;
let cvReady = false;
let isOcrBusy = false;
let isNameOcrBusy = false;
let ocrWorkerPromise = null;
let nameOcrWorkerPromise = null;
let detectionLoopId = null;
let detectionLoopActive = false;
let lastDetectionTick = 0;
let lastDetection = null;
let stableFrames = 0;
let stableSince = 0;
let latestDetection = null;
let ocrCooldownUntil = 0;
let ocrCandidateId = null;
let ocrCandidateCount = 0;
let lastOverlayState = 'seeking';
let consecutiveNumberMisses = 0;

const recentStorageKey = 'm1s_recent_scans_v1';
const collectionStorageKey = 'm1s_collection_v3';

const isFiniteNumber = (value) => Number.isFinite(value);
const pad3 = (value) => String(value).padStart(3, '0');
const fmtJPY = (value) => isFiniteNumber(value) ? `¥${value.toLocaleString('ja-JP')}` : '가격 데이터 없음';

function selectedCards() {
  return cards.filter(card =>
    card.language === selectedSet.language &&
    card.set_code === selectedSet.set_code
  );
}

function setStatus(key, detail = '') {
  const label = STATUS[key] || key;
  const text = detail ? `${label} · ${detail}` : label;
  if (els.scanStatus) els.scanStatus.textContent = text;
  if (els.resultStatus) els.resultStatus.textContent = text;
  const guideCopy = els.guideFrame?.querySelector('.guide-copy');
  if (guideCopy) guideCopy.textContent = text;
  setGuideColor(OVERLAY_COLORS[key] || OVERLAY_COLORS.seeking);
}

function setGuideColor(color) {
  if (!els.guideFrame) return;
  els.guideFrame.querySelectorAll('.corner').forEach(corner => {
    corner.style.borderColor = color;
  });
}

function priceHasValue(price) {
  return Boolean(price) && (isFiniteNumber(price.nm_jpy) || isFiniteNumber(price.psa10_jpy));
}

function priceFor(card) {
  return card ? priceByCardId.get(card.card_id) || null : null;
}

function renderEmpty(statusKey = 'seeking') {
  currentCard = null;
  els.resultCard?.classList.add('is-empty');
  els.cardName.textContent = '카드를 스캔하거나 검색';
  els.cardSet.textContent = `${selectedSet.language} · ${selectedSet.set_code} ${selectedSet.set_name_ko}`;
  els.cardNumber.textContent = '—';
  els.cardRarity.textContent = '—';
  els.nmPrice.textContent = '—';
  els.psaPrice.textContent = '—';
  els.priceUpdated.textContent = '업데이트 —';
  els.priceConfidence.textContent = '신뢰도 —';
  els.thumb.textContent = selectedSet.set_code;
  els.thumb.style.background = 'linear-gradient(145deg, #eef3ff, #ffd166 48%, #f4a51c)';
  setStatus(statusKey);
}

function renderCard(card) {
  if (!card) return;
  currentCard = card;
  const price = priceFor(card);
  const hasPrice = priceHasValue(price);

  els.resultCard?.classList.remove('is-empty');
  els.cardName.textContent = card.name_jp;
  els.cardSet.textContent = `${card.language} · ${card.set_code} ${card.set_name_ko}`;
  els.cardNumber.textContent = card.number;
  els.cardRarity.textContent = card.rarity;
  els.nmPrice.textContent = hasPrice ? fmtJPY(price.nm_jpy) : '가격 데이터 없음';
  els.psaPrice.textContent = hasPrice ? fmtJPY(price.psa10_jpy) : '가격 데이터 없음';
  els.priceUpdated.textContent = price?.updated_at ? `업데이트 ${price.updated_at}` : '업데이트 —';
  els.priceConfidence.textContent = price?.confidence ? `신뢰도 ${price.confidence}` : '신뢰도 —';
  els.thumb.textContent = `${card.rarity}\n${pad3(card.index)}`;
  els.thumb.style.background = card.rarity === 'MUR'
    ? 'linear-gradient(145deg,#fff4c0,#d9ccff 48%,#ffd166)'
    : card.rarity === 'SAR'
      ? 'linear-gradient(145deg,#e8f7ff,#ffd166 54%,#ff9f43)'
      : card.rarity === 'SR'
        ? 'linear-gradient(145deg,#ffffff,#d7e4ff 50%,#ffd166)'
        : card.rarity === 'AR'
          ? 'linear-gradient(145deg,#fff2c4,#a7e6ff 52%,#ffd166)'
          : 'linear-gradient(145deg,#eef3ff,#ffd166 48%,#f4a51c)';
}

function normalizeText(raw) {
  return (raw || '')
    .replace(/[ＯｏO]/g, '0')
    .replace(/[Ｉｌl]/g, '1')
    .replace(/[／]/g, '/')
    .replace(/[ー－—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeOcrText(raw) {
  return normalizeText(raw)
    .replace(/[^0-9/]/g, '')
    .replace(/\/+/g, '/');
}

function parseCardNumber(raw, options = {}) {
  const compact = normalizeOcrText(raw);
  let match = options.strict
    ? compact.match(/(\d{2,3})\/(063|092|63|92)/)
    : compact.match(/(\d{1,3})\/(0?63|0?92)/);
  if (!match && options.strict) {
    match = compact.match(/(\d{2,3})(063|092)$/);
  }
  if (!match) return null;

  const index = Number(match[1]);
  const denominator = Number(match[2]);
  if (!Number.isInteger(index) || index < 1) return null;

  return {
    index,
    denominator,
    number: `${pad3(index)}/063`,
    collector_number: `${index}/92`,
    raw: compact
  };
}

function findCardByParsedNumber(parsed) {
  if (!parsed) return null;
  return selectedCards().find(card => (
    card.index === parsed.index ||
    card.number === parsed.number ||
    card.collector_number === parsed.collector_number
  )) || null;
}

function findCardForSearch(raw) {
  const query = normalizeText(raw).toLowerCase();
  if (!query) return null;

  const parsed = parseCardNumber(query);
  const cardByNumber = findCardByParsedNumber(parsed);
  if (cardByNumber) return cardByNumber;

  return selectedCards().find(card => {
    const fields = [
      card.name_en, card.name_jp, card.name_ko, card.number,
      card.collector_number, card.rarity, ...(card.search_keywords || [])
    ].filter(Boolean).map(value => String(value).toLowerCase());
    return fields.some(value => value === query || value.includes(query));
  }) || null;
}

function normalizeForNameMatch(raw) {
  return normalizeText(raw)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}ぁ-ゟ゠-ヿ一-龯가-힣]/gu, '');
}

function scoreNameMatch(rawText, card) {
  const text = normalizeForNameMatch(rawText);
  if (!text) return 0;
  const fields = [card.name_jp, card.name_en, card.name_ko, ...(card.search_keywords || [])]
    .filter(Boolean)
    .map(normalizeForNameMatch)
    .filter(value => value.length >= 3);

  let best = 0;
  for (const field of fields) {
    if (!field) continue;
    if (text.includes(field)) best = Math.max(best, 120 + field.length);
    if (field.includes(text) && text.length >= 3) best = Math.max(best, 90 + text.length);

    let ordered = 0;
    let pos = 0;
    for (const ch of field) {
      const found = text.indexOf(ch, pos);
      if (found >= 0) {
        ordered += 1;
        pos = found + 1;
      }
    }
    if (field.length >= 4) {
      best = Math.max(best, Math.round((ordered / field.length) * 80));
    }
  }
  return best;
}

function findCardByNameText(rawText) {
  const scored = selectedCards()
    .map(card => ({ card, score: scoreNameMatch(rawText, card) }))
    .filter(item => item.score >= 68)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.card || null;
}

function searchCards(query) {
  const normalized = normalizeText(query).toLowerCase();
  if (!normalized) return [];

  const exact = findCardForSearch(normalized);
  return selectedCards()
    .map(card => {
      const hay = [
        card.name_en, card.name_jp, card.name_ko, card.number,
        card.collector_number, card.rarity, card.set_code,
        ...(card.search_keywords || [])
      ].filter(Boolean).join(' ').toLowerCase();
      let score = 0;
      if (exact && exact.card_id === card.card_id) score += 100;
      if (hay.includes(normalized)) score += 20;
      for (const part of normalized.split(/\s+/).filter(Boolean)) {
        if (hay.includes(part)) score += 5;
      }
      return { card, score };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map(item => item.card);
}

function renderSearch(query) {
  const results = searchCards(query);
  els.searchResults.innerHTML = '';

  if (!query) return;
  if (!results.length) {
    els.searchResults.textContent = '검색 결과 없음';
    return;
  }

  for (const card of results) {
    const price = priceFor(card);
    const item = document.createElement('div');
    item.className = 'result-item';
    item.innerHTML = `
      <div>
        <strong>${card.name_jp}</strong><br>
        <small>${card.name_en} · ${card.number} · ${card.rarity}</small>
      </div>
      <small>NM ${fmtJPY(price?.nm_jpy)}<br>PSA10 ${fmtJPY(price?.psa10_jpy)}</small>
    `;
    item.addEventListener('click', () => confirmCard(card, 'search'));
    els.searchResults.appendChild(item);
  }
}

function waitForCv() {
  if (!USE_BOX_TRACKING) {
    cvReady = false;
    els.detectStatus.textContent = 'GUIDE OCR';
    return;
  }

  const markReady = () => {
    if (window.cv && cv.Mat) {
      cvReady = true;
      els.detectStatus.textContent = 'BOX READY';
      return true;
    }
    return false;
  };

  if (markReady()) return;
  if (window.cv) {
    cv.onRuntimeInitialized = markReady;
  }

  const iv = setInterval(() => {
    if (markReady()) clearInterval(iv);
  }, 250);

  setTimeout(() => {
    if (!cvReady) els.detectStatus.textContent = 'BOX CDN 대기';
  }, 2500);
}

async function ensureTesseract() {
  if (!window.Tesseract) throw new Error('OCR 라이브러리 로딩 실패. 인터넷 연결을 확인해줘.');
}

async function getOcrWorker() {
  await ensureTesseract();
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = (async () => {
      setStatus('ocr', '엔진 준비');
      const worker = await Tesseract.createWorker('eng');
      try {
        await worker.setParameters({
          tessedit_char_whitelist: '0123456789/',
          tessedit_pageseg_mode: '7',
          classify_bln_numeric_mode: '1'
        });
      } catch (err) {
        console.warn('OCR parameter set skipped:', err);
      }
      return worker;
    })().catch(err => {
      ocrWorkerPromise = null;
      throw err;
    });
  }
  return ocrWorkerPromise;
}

async function getNameOcrWorker() {
  await ensureTesseract();
  if (!nameOcrWorkerPromise) {
    nameOcrWorkerPromise = (async () => {
      const worker = await Tesseract.createWorker('jpn+eng');
      try {
        await worker.setParameters({
          tessedit_pageseg_mode: '7',
          preserve_interword_spaces: '1'
        });
      } catch (err) {
        console.warn('name OCR parameter set skipped:', err);
      }
      return worker;
    })().catch(err => {
      nameOcrWorkerPromise = null;
      throw err;
    });
  }
  return nameOcrWorkerPromise;
}

async function runNumberOcr(imageLike) {
  try {
    const worker = await getOcrWorker();
    const result = await worker.recognize(imageLike);
    return result?.data?.text || '';
  } catch (err) {
    console.warn('worker OCR failed, fallback to recognize:', err);
    const result = await Tesseract.recognize(imageLike, 'eng', {
      tessedit_char_whitelist: '0123456789/',
      tessedit_pageseg_mode: '7'
    });
    return result?.data?.text || '';
  }
}

async function runNameOcr(imageLike) {
  const worker = await getNameOcrWorker();
  const result = await worker.recognize(imageLike);
  return result?.data?.text || '';
}

function startNameMatchOcr(nameFrame) {
  if (!nameFrame || isNameOcrBusy) return null;
  isNameOcrBusy = true;
  return runNameOcr(nameFrame)
    .then(nameText => ({
      text: nameText,
      card: findCardByNameText(nameText)
    }))
    .catch(err => {
      console.warn('name OCR failed:', err);
      return { text: '', card: null, error: err };
    })
    .finally(() => {
      isNameOcrBusy = false;
    });
}

function resizeOverlay() {
  const vw = els.video.videoWidth || 1280;
  const vh = els.video.videoHeight || 720;
  if (els.detectCanvas.width !== vw) els.detectCanvas.width = vw;
  if (els.detectCanvas.height !== vh) els.detectCanvas.height = vh;
}

function clearOverlay() {
  const ctx = els.detectCanvas.getContext('2d');
  ctx.clearRect(0, 0, els.detectCanvas.width, els.detectCanvas.height);
}

function orderQuadPoints(points) {
  if (!points || points.length !== 4) return null;
  const copy = points.map(point => ({ x: point.x, y: point.y }));
  const tl = copy.reduce((best, point) => point.x + point.y < best.x + best.y ? point : best, copy[0]);
  const br = copy.reduce((best, point) => point.x + point.y > best.x + best.y ? point : best, copy[0]);
  const tr = copy.reduce((best, point) => point.x - point.y > best.x - best.y ? point : best, copy[0]);
  const bl = copy.reduce((best, point) => point.x - point.y < best.x - best.y ? point : best, copy[0]);
  return [tl, tr, br, bl];
}

function drawDetectedOverlay(detection, state = 'seeking') {
  resizeOverlay();
  const ctx = els.detectCanvas.getContext('2d');
  ctx.clearRect(0, 0, els.detectCanvas.width, els.detectCanvas.height);
  if (!detection?.rect) return;

  const color = OVERLAY_COLORS[state] || OVERLAY_COLORS.seeking;
  setGuideColor(color);
  ctx.save();
  ctx.lineWidth = 6;
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 16;
  ctx.beginPath();

  const points = orderQuadPoints(detection.points);
  if (points) {
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
    ctx.closePath();
  } else {
    const rect = detection.rect;
    ctx.rect(rect.x, rect.y, rect.width, rect.height);
  }

  ctx.stroke();
  ctx.restore();

  const rect = detection.rect;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,.62)';
  ctx.fillRect(rect.x, Math.max(0, rect.y - 34), Math.min(260, rect.width), 28);
  ctx.fillStyle = '#fff';
  ctx.font = '700 18px -apple-system, Segoe UI, sans-serif';
  ctx.fillText(STATUS[state] || 'CARD', rect.x + 10, Math.max(20, rect.y - 13));
  ctx.restore();
}

function getFrameCanvasFull() {
  const video = els.video;
  const canvas = els.canvas;
  const vw = video.videoWidth || 1280;
  const vh = video.videoHeight || 720;
  canvas.width = vw;
  canvas.height = vh;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.filter = 'contrast(1.12) saturate(0.95)';
  ctx.drawImage(video, 0, 0, vw, vh);
  return canvas;
}

function detectCardRect() {
  if (!cvReady || !stream || !els.video.videoWidth) return null;
  let src, gray, blur, edges, dilated, contours, hierarchy, kernel;
  try {
    const canvas = getFrameCanvasFull();
    src = cv.imread(canvas);
    gray = new cv.Mat();
    blur = new cv.Mat();
    edges = new cv.Mat();
    dilated = new cv.Mat();
    contours = new cv.MatVector();
    hierarchy = new cv.Mat();

    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);
    cv.Canny(blur, edges, 55, 145);
    kernel = cv.Mat.ones(3, 3, cv.CV_8U);
    cv.dilate(edges, dilated, kernel);
    cv.findContours(dilated, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    let best = null;
    const frameArea = canvas.width * canvas.height;
    for (let i = 0; i < contours.size(); i += 1) {
      const cnt = contours.get(i);
      const area = cv.contourArea(cnt);
      if (area < frameArea * 0.05 || area > frameArea * 0.88) {
        cnt.delete();
        continue;
      }

      const peri = cv.arcLength(cnt, true);
      const approx = new cv.Mat();
      cv.approxPolyDP(cnt, approx, 0.024 * peri, true);
      const rect = cv.boundingRect(cnt);
      const ratio = Math.min(rect.width, rect.height) / Math.max(rect.width, rect.height);
      const centerBias = 1 - Math.abs((rect.x + rect.width / 2) - canvas.width / 2) / (canvas.width / 2);
      const ratioScore = 1 - Math.min(1, Math.abs(ratio - 0.715) / 0.35);
      const score = area * (0.65 + centerBias * 0.2 + ratioScore * 0.28);

      if (approx.rows >= 4 && approx.rows <= 8 && ratio > 0.48 && ratio < 0.86) {
        const points = [];
        if (approx.rows === 4) {
          for (let j = 0; j < 4; j += 1) {
            points.push({ x: approx.data32S[j * 2], y: approx.data32S[j * 2 + 1] });
          }
        }
        if (!best || score > best.score) best = { rect, points, score, area };
      }
      approx.delete();
      cnt.delete();
    }
    return best;
  } catch (err) {
    console.warn('OpenCV detection failed:', err);
    return null;
  } finally {
    [src, gray, blur, edges, dilated, hierarchy, kernel].forEach(mat => {
      try { if (mat) mat.delete(); } catch {}
    });
    try { if (contours) contours.delete(); } catch {}
  }
}

function detectionSimilarity(a, b) {
  if (!a?.rect || !b?.rect) return false;
  const ar = a.rect;
  const br = b.rect;
  const acx = ar.x + ar.width / 2;
  const acy = ar.y + ar.height / 2;
  const bcx = br.x + br.width / 2;
  const bcy = br.y + br.height / 2;
  const diagonal = Math.hypot(ar.width, ar.height) || 1;
  const centerDelta = Math.hypot(acx - bcx, acy - bcy) / diagonal;
  const widthDelta = Math.abs(ar.width - br.width) / Math.max(ar.width, br.width);
  const heightDelta = Math.abs(ar.height - br.height) / Math.max(ar.height, br.height);
  return centerDelta < 0.055 && widthDelta < 0.12 && heightDelta < 0.12;
}

function getGuideFrameVideoRect() {
  const vw = els.video.videoWidth || 1280;
  const vh = els.video.videoHeight || 720;
  return {
    x: Math.round(vw * 0.11),
    y: Math.round(vh * 0.12),
    width: Math.round(vw * 0.78),
    height: Math.round(vh * 0.76)
  };
}

function getNumberStripRect(cardRect) {
  const inner = {
    x: cardRect.x + cardRect.width * 0.07,
    y: cardRect.y + cardRect.height * 0.08,
    width: cardRect.width * 0.86,
    height: cardRect.height * 0.84
  };
  return {
    x: Math.round(inner.x),
    y: Math.round(inner.y + inner.height * 0.74),
    width: Math.round(inner.width * 0.72),
    height: Math.round(inner.height * 0.24)
  };
}

function getNameStripRect(cardRect) {
  return {
    x: Math.round(cardRect.x + cardRect.width * 0.07),
    y: Math.round(cardRect.y + cardRect.height * 0.045),
    width: Math.round(cardRect.width * 0.72),
    height: Math.round(cardRect.height * 0.13)
  };
}

function drawGuideOcrOverlay(state = 'ready') {
  resizeOverlay();
  const ctx = els.detectCanvas.getContext('2d');
  ctx.clearRect(0, 0, els.detectCanvas.width, els.detectCanvas.height);

  const color = OVERLAY_COLORS[state] || OVERLAY_COLORS.ready;
  const guide = getGuideFrameVideoRect();
  const nameStrip = getNameStripRect(guide);
  const strip = getNumberStripRect(guide);
  setGuideColor(color);

  ctx.save();
  ctx.lineWidth = 4;
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.strokeRect(guide.x, guide.y, guide.width, guide.height);
  ctx.lineWidth = 3;
  ctx.fillStyle = 'rgba(255,255,255,.07)';
  ctx.fillRect(nameStrip.x, nameStrip.y, nameStrip.width, nameStrip.height);
  ctx.strokeRect(nameStrip.x, nameStrip.y, nameStrip.width, nameStrip.height);
  ctx.fillStyle = 'rgba(255,189,74,.12)';
  ctx.fillRect(strip.x, strip.y, strip.width, strip.height);
  ctx.strokeRect(strip.x, strip.y, strip.width, strip.height);
  ctx.restore();
}

function processDetectionTick() {
  const now = Date.now();
  const detected = USE_BOX_TRACKING && cvReady ? detectCardRect() : null;

  if (!detected) {
    latestDetection = null;
    stableFrames = 0;
    stableSince = 0;
    if (!isOcrBusy) {
      drawGuideOcrOverlay('ready');
      els.detectStatus.textContent = 'GUIDE OCR';
      setStatus('ready', '이름/번호 맞추기');
      lastOverlayState = 'ready';
    }
    if (!isOcrBusy && now >= ocrCooldownUntil) {
      ocrCooldownUntil = now + OCR_COOLDOWN_MS;
      ocrImageFromDetection(null);
    }
    return;
  }

  latestDetection = detected;
  const similar = detectionSimilarity(detected, lastDetection);
  if (similar) {
    stableFrames += 1;
  } else {
    stableFrames = 1;
    stableSince = now;
  }
  lastDetection = detected;

  const stableMs = stableSince ? now - stableSince : 0;
  const isStable = stableFrames >= STABLE_FRAME_COUNT && stableMs >= STABLE_MS;

  if (!isStable) {
    els.detectStatus.textContent = 'GUIDE OCR';
    setStatus('ready', '이름/번호 맞추기');
    drawDetectedOverlay(detected, 'ready');
    lastOverlayState = 'ready';
    if (now >= ocrCooldownUntil) {
      ocrCooldownUntil = now + OCR_COOLDOWN_MS;
      ocrImageFromDetection(detected);
    }
    return;
  }

  if (isOcrBusy) {
    els.detectStatus.textContent = 'OCR';
    drawDetectedOverlay(detected, 'ocr');
    lastOverlayState = 'ocr';
    return;
  }

  drawDetectedOverlay(detected, lastOverlayState === 'complete' ? 'complete' : 'ready');
  els.detectStatus.textContent = 'GUIDE OCR';

  if (now >= ocrCooldownUntil) {
    ocrCooldownUntil = now + OCR_COOLDOWN_MS;
    ocrImageFromDetection(detected);
  }
}

function startDetectionLoop() {
  stopDetectionLoop();
  detectionLoopActive = true;
  const loop = (now) => {
    if (!detectionLoopActive) return;
    if (stream && els.video.videoWidth && now - lastDetectionTick >= DETECT_EVERY_MS) {
      lastDetectionTick = now;
      processDetectionTick();
    }
    detectionLoopId = requestAnimationFrame(loop);
  };
  detectionLoopId = requestAnimationFrame(loop);
}

function stopDetectionLoop() {
  detectionLoopActive = false;
  if (detectionLoopId) cancelAnimationFrame(detectionLoopId);
  detectionLoopId = null;
}

function preprocessForOcr(sourceCanvas) {
  const scale = Math.min(2.4, Math.max(1.5, 900 / Math.max(1, sourceCanvas.width)));
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(sourceCanvas.width * scale));
  out.height = Math.max(1, Math.round(sourceCanvas.height * scale));
  const ctx = out.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.filter = 'grayscale(1) contrast(2.65) brightness(1.18)';
  ctx.drawImage(sourceCanvas, 0, 0, out.width, out.height);
  return out;
}

function cropNumberStrip(sourceCanvas) {
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const inner = {
    x: w * 0.07,
    y: h * 0.08,
    width: w * 0.86,
    height: h * 0.84
  };
  const sx = Math.max(0, Math.round(inner.x + inner.width * 0.00));
  const sy = Math.max(0, Math.round(inner.y + inner.height * 0.74));
  const sw = Math.min(w - sx, Math.round(inner.width * 0.72));
  const sh = Math.min(h - sy, Math.round(inner.height * 0.24));

  const raw = document.createElement('canvas');
  raw.width = Math.max(1, sw);
  raw.height = Math.max(1, sh);
  raw.getContext('2d', { willReadFrequently: true }).drawImage(sourceCanvas, sx, sy, sw, sh, 0, 0, sw, sh);

  els.canvas.width = raw.width;
  els.canvas.height = raw.height;
  els.canvas.getContext('2d', { willReadFrequently: true }).drawImage(raw, 0, 0);
  return preprocessForOcr(raw);
}

function cropNameStrip(sourceCanvas) {
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const sx = Math.max(0, Math.round(w * 0.07));
  const sy = Math.max(0, Math.round(h * 0.045));
  const sw = Math.min(w - sx, Math.round(w * 0.72));
  const sh = Math.min(h - sy, Math.round(h * 0.13));

  const raw = document.createElement('canvas');
  raw.width = Math.max(1, sw);
  raw.height = Math.max(1, sh);
  raw.getContext('2d', { willReadFrequently: true }).drawImage(sourceCanvas, sx, sy, sw, sh, 0, 0, sw, sh);

  const scale = Math.min(2.4, Math.max(1.5, 820 / Math.max(1, raw.width)));
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(raw.width * scale));
  out.height = Math.max(1, Math.round(raw.height * scale));
  const ctx = out.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.filter = 'grayscale(1) contrast(2.2) brightness(1.14)';
  ctx.drawImage(raw, 0, 0, out.width, out.height);
  return out;
}

function captureCardCanvasFromGuide() {
  const canvas = getFrameCanvasFull();
  const vw = canvas.width;
  const vh = canvas.height;
  const rect = getGuideFrameVideoRect();
  const sx = Math.max(0, rect.x);
  const sy = Math.max(0, rect.y);
  const sw = Math.min(vw - sx, rect.width);
  const sh = Math.min(vh - sy, rect.height);
  if (sw < 20 || sh < 20) return null;

  const cardCanvas = document.createElement('canvas');
  cardCanvas.width = sw;
  cardCanvas.height = sh;
  cardCanvas.getContext('2d', { willReadFrequently: true }).drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
  return cardCanvas;
}

function captureNumberFromGuide() {
  const cardCanvas = captureCardCanvasFromGuide();
  return cardCanvas ? cropNumberStrip(cardCanvas) : null;
}

function captureNameFromGuide() {
  const cardCanvas = captureCardCanvasFromGuide();
  return cardCanvas ? cropNameStrip(cardCanvas) : null;
}

function captureNumberFromQuad(points) {
  if (!cvReady || !points || points.length !== 4) return null;
  const ordered = orderQuadPoints(points);
  if (!ordered) return null;

  let src, dst, matrix, srcTri, dstTri;
  try {
    const canvas = getFrameCanvasFull();
    const targetWidth = 720;
    const targetHeight = 1008;
    const warped = document.createElement('canvas');
    warped.width = targetWidth;
    warped.height = targetHeight;

    src = cv.imread(canvas);
    dst = new cv.Mat();
    srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
      ordered[0].x, ordered[0].y,
      ordered[1].x, ordered[1].y,
      ordered[2].x, ordered[2].y,
      ordered[3].x, ordered[3].y
    ]);
    dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
      0, 0,
      targetWidth, 0,
      targetWidth, targetHeight,
      0, targetHeight
    ]);
    matrix = cv.getPerspectiveTransform(srcTri, dstTri);
    cv.warpPerspective(src, dst, matrix, new cv.Size(targetWidth, targetHeight), cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());
    cv.imshow(warped, dst);
    return cropNumberStrip(warped);
  } catch (err) {
    console.warn('Perspective crop failed:', err);
    return null;
  } finally {
    [src, dst, matrix, srcTri, dstTri].forEach(mat => {
      try { if (mat) mat.delete(); } catch {}
    });
  }
}

function captureNumberFromRect(rect) {
  if (!rect) return null;
  const canvas = getFrameCanvasFull();
  const vw = canvas.width;
  const vh = canvas.height;
  const inner = {
    x: rect.x + rect.width * 0.08,
    y: rect.y + rect.height * 0.08,
    width: rect.width * 0.84,
    height: rect.height * 0.82
  };

  const sx = Math.max(0, Math.round(inner.x));
  const sy = Math.max(0, Math.round(inner.y));
  const sw = Math.min(vw - sx, Math.round(inner.width));
  const sh = Math.min(vh - sy, Math.round(inner.height));
  if (sw < 20 || sh < 20) return null;

  const cardCanvas = document.createElement('canvas');
  cardCanvas.width = sw;
  cardCanvas.height = sh;
  cardCanvas.getContext('2d', { willReadFrequently: true }).drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
  return cropNumberStrip(cardCanvas);
}

function preparePhotoCardCanvas(img) {
  const maxW = 1600;
  const naturalW = img.naturalWidth || img.width;
  const naturalH = img.naturalHeight || img.height;
  const ratio = Math.min(1, maxW / Math.max(1, naturalW));
  const w = Math.round(naturalW * ratio);
  const h = Math.round(naturalH * ratio);

  const full = document.createElement('canvas');
  full.width = w;
  full.height = h;
  full.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0, w, h);

  const cardRect = {
    x: Math.round(w * 0.08),
    y: Math.round(h * 0.08),
    width: Math.round(w * 0.84),
    height: Math.round(h * 0.84)
  };
  const sx = Math.max(0, cardRect.x);
  const sy = Math.max(0, cardRect.y);
  const sw = Math.min(w - sx, cardRect.width);
  const sh = Math.min(h - sy, cardRect.height);

  const cardCanvas = document.createElement('canvas');
  cardCanvas.width = Math.max(1, sw);
  cardCanvas.height = Math.max(1, sh);
  cardCanvas.getContext('2d', { willReadFrequently: true }).drawImage(full, sx, sy, sw, sh, 0, 0, sw, sh);
  return cardCanvas;
}

function preparePhotoOcrRegions(img) {
  const cardCanvas = preparePhotoCardCanvas(img);
  return {
    numberFrame: cropNumberStrip(cardCanvas),
    nameFrame: cropNameStrip(cardCanvas)
  };
}

function captureOcrRegion(detection) {
  return captureNumberFromGuide() ||
    captureNumberFromQuad(detection?.points) ||
    captureNumberFromRect(detection?.rect);
}

function captureOcrRegions(detection) {
  const guideCardCanvas = captureCardCanvasFromGuide();
  if (guideCardCanvas) {
    return {
      numberFrame: cropNumberStrip(guideCardCanvas),
      nameFrame: cropNameStrip(guideCardCanvas)
    };
  }

  const numberFrame = captureNumberFromQuad(detection?.points) || captureNumberFromRect(detection?.rect);
  return {
    numberFrame,
    nameFrame: null
  };
}

async function ocrPreparedRegions(regions, sourceLabel = '번호 이미지', detection = null, options = {}) {
  if (isOcrBusy) return;
  const numberFrame = regions?.numberFrame || regions;
  const nameFrame = regions?.nameFrame || null;

  if (!numberFrame) {
    setStatus('failed', '번호 영역을 자르지 못함');
    if (detection) drawDetectedOverlay(detection, 'failed');
    else drawGuideOcrOverlay('failed');
    lastOverlayState = 'failed';
    return;
  }

  isOcrBusy = true;
  try {
    setStatus('ocr', sourceLabel);
    els.detectStatus.textContent = 'OCR';
    if (detection) drawDetectedOverlay(detection, 'ocr');
    else drawGuideOcrOverlay('ocr');
    lastOverlayState = 'ocr';

    const nameTask = startNameMatchOcr(nameFrame);
    const text = await runNumberOcr(numberFrame);
    const parsed = parseCardNumber(text, { strict: true });
    if (!parsed) {
      consecutiveNumberMisses += 1;
      if (nameTask) {
        setStatus('ocr', '이름/번호 비교 중');
        const nameResult = await nameTask;
        if (nameResult?.card) {
          consecutiveNumberMisses = 0;
          const rawText = [text, nameResult.text].filter(Boolean).join('\n');
          handleDetectedCard(nameResult.card, detection, rawText, { ...options, confirmImmediately: true });
          return;
        }
      }
      handleOcrFailure('failed', '번호 패턴 없음', detection, text);
      return;
    }

    const card = findCardByParsedNumber(parsed);
    if (!card) {
      if (nameTask) {
        setStatus('ocr', '이름/번호 비교 중');
        const nameResult = await nameTask;
        if (nameResult?.card) {
          consecutiveNumberMisses = 0;
          const rawText = [text, nameResult.text].filter(Boolean).join('\n');
          handleDetectedCard(nameResult.card, detection, rawText, { ...options, confirmImmediately: true });
          return;
        }
      }
      handleOcrFailure('missing', parsed.number, detection, text);
      return;
    }

    consecutiveNumberMisses = 0;
    handleDetectedCard(card, detection, text, options);
  } catch (err) {
    console.error(err);
    handleOcrFailure('failed', err.message || 'OCR 오류', detection, '');
  } finally {
    isOcrBusy = false;
  }
}

async function ocrPreparedFrame(frame, sourceLabel = '번호 이미지', detection = null, options = {}) {
  return ocrPreparedRegions({ numberFrame: frame, nameFrame: options.nameFrame || null }, sourceLabel, detection, options);
}

async function ocrImageFromDetection(detection) {
  const regions = captureOcrRegions(detection);
  return ocrPreparedRegions(regions, '가이드 이름+번호', detection);
}

function handleOcrFailure(statusKey, detail, detection, rawText) {
  console.log('OCR miss:', statusKey, detail, rawText);
  ocrCandidateId = null;
  ocrCandidateCount = 0;
  setStatus(statusKey, statusKey === 'missing' ? detail : '직접 검색');
  if (detection) drawDetectedOverlay(detection, statusKey);
  else drawGuideOcrOverlay(statusKey);
  lastOverlayState = statusKey;
}

function handleDetectedCard(card, detection, rawText, options = {}) {
  if (ocrCandidateId === card.card_id) ocrCandidateCount += 1;
  else {
    ocrCandidateId = card.card_id;
    ocrCandidateCount = 1;
  }

  const isDifferentCard = currentCard && currentCard.card_id !== card.card_id;
  const requiredCount = options.confirmImmediately ? 1 : (isDifferentCard ? 2 : 1);

  if (ocrCandidateCount < requiredCount) {
    setStatus('stabilizing', `${card.number} 후보 확인 중`);
    drawDetectedOverlay(detection, 'ready');
    lastOverlayState = 'ready';
    console.log('OCR candidate:', card.card_id, rawText);
    return;
  }

  confirmCard(card, 'scan');
  if (detection) drawDetectedOverlay(detection, priceHasValue(priceFor(card)) ? 'complete' : 'noPrice');
  else drawGuideOcrOverlay(priceHasValue(priceFor(card)) ? 'complete' : 'noPrice');
  lastOverlayState = priceHasValue(priceFor(card)) ? 'complete' : 'noPrice';
  if (navigator.vibrate) navigator.vibrate(45);
  console.log('Detected:', card.card_id, rawText);
}

function confirmCard(card, source = 'scan') {
  renderCard(card);
  addRecentScan(card, source);
  renderRecentScans();
  const price = priceFor(card);
  setStatus(priceHasValue(price) ? 'complete' : 'noPrice', card.number);
}

async function startCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    });
    els.video.srcObject = stream;
    els.video.style.display = 'block';
    els.placeholder.style.display = 'none';
    setStatus('ready', '이름/번호 맞추기');
    els.video.onloadedmetadata = () => {
      resizeOverlay();
      els.video.play().catch(() => {});
      startDetectionLoop();
    };
    startDetectionLoop();
  } catch (err) {
    console.error(err);
    setStatus('failed', '카메라 권한 또는 HTTPS 확인');
  }
}

function stopCamera() {
  stopDetectionLoop();
  if (stream) stream.getTracks().forEach(track => track.stop());
  stream = null;
  els.video.srcObject = null;
  els.video.style.display = 'none';
  els.placeholder.style.display = 'grid';
  clearOverlay();
  latestDetection = null;
  lastDetection = null;
  stableFrames = 0;
  stableSince = 0;
  els.detectStatus.textContent = cvReady ? 'BOX READY' : 'BOX OFF';
  setStatus('seeking');
}

function resetScan() {
  currentCard = null;
  ocrCandidateId = null;
  ocrCandidateCount = 0;
  lastOverlayState = 'seeking';
  renderEmpty('seeking');
  clearOverlay();
  ocrCooldownUntil = 0;
}

function getMarketSearchTerm(card) {
  return `${card.name_jp} ${card.number} ${card.rarity} ${card.set_code}`;
}

function openExternal(kind) {
  if (!currentCard) {
    setStatus('failed', '먼저 카드 선택');
    els.searchPanel?.classList.remove('is-collapsed');
    return;
  }
  const q = encodeURIComponent(getMarketSearchTerm(currentCard));
  const urls = {
    cardrush: `https://www.cardrush-pokemon.jp/product-list?keyword=${q}`,
    mercari: `https://jp.mercari.com/search?keyword=${q}`,
    yahoo: `https://auctions.yahoo.co.jp/closedsearch/closedsearch/${q}/0/`,
    google: `https://www.google.com/search?q=${q}`
  };
  window.open(urls[kind], '_blank', 'noopener,noreferrer');
}

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function cardById(cardId) {
  return cards.find(card => card.card_id === cardId || card.id === cardId) || null;
}

function recentScans() {
  return readJson(recentStorageKey, []);
}

function setRecentScans(items) {
  localStorage.setItem(recentStorageKey, JSON.stringify(items));
}

function addRecentScan(card, source) {
  const now = Date.now();
  const items = recentScans();
  const recentDuplicate = items.find(item =>
    item.card_id === card.card_id &&
    now - new Date(item.scanned_at).getTime() < RECENT_DEDUPE_MS
  );
  if (recentDuplicate) return;

  items.unshift({
    card_id: card.card_id,
    source,
    scanned_at: new Date(now).toISOString()
  });
  setRecentScans(items.slice(0, 20));
}

function renderRecentScans() {
  const items = recentScans();
  els.recentScans.innerHTML = '';
  if (!items.length) {
    els.recentScans.textContent = '최근 기록 없음';
    return;
  }

  for (const item of items) {
    const card = cardById(item.card_id);
    if (!card) continue;
    const row = document.createElement('div');
    row.className = 'history-row';
    const time = new Date(item.scanned_at).toLocaleString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    row.innerHTML = `
      <div><strong>${card.name_jp}</strong><br><small>${card.set_code} · ${card.number} · ${card.rarity}</small></div>
      <small>${time}</small>
    `;
    row.addEventListener('click', () => confirmCard(card, 'history'));
    els.recentScans.appendChild(row);
  }
}

function collection() {
  const items = readJson(collectionStorageKey, null);
  if (Array.isArray(items)) return items;

  const legacy = readJson('m1s_collection_v2', []);
  return legacy.map(item => ({
    card_id: item.card_id || item.id,
    condition: 'NM',
    qty: Number(item.qty || 1),
    purchase_price_jpy: null,
    purchase_date: '',
    memo: '',
    storage_location: '',
    added_at: item.addedAt || new Date().toISOString()
  })).filter(item => item.card_id);
}

function setCollection(items) {
  localStorage.setItem(collectionStorageKey, JSON.stringify(items));
  renderCollection();
}

function valueForCondition(condition, price) {
  if (!price) return null;
  if (condition === 'NM') return price.nm_jpy;
  if (condition === 'PSA10') return price.psa10_jpy;
  return null;
}

function renderCollection() {
  const items = collection();
  els.collectionBox.innerHTML = '';

  if (!items.length) {
    els.collectionSummary.textContent = '컬렉션 없음';
    els.collectionBox.textContent = '컬렉션 없음';
    return;
  }

  let conditionTotal = 0;
  let nmTotal = 0;
  let psaTotal = 0;
  let conditionMissing = 0;
  let nmMissing = 0;
  let psaMissing = 0;

  for (const item of items) {
    const card = cardById(item.card_id);
    if (!card) continue;
    const price = priceFor(card);
    const qty = Math.max(1, Number(item.qty || 1));
    const conditionValue = valueForCondition(item.condition, price);

    if (isFiniteNumber(conditionValue)) conditionTotal += conditionValue * qty;
    else conditionMissing += qty;

    if (isFiniteNumber(price?.nm_jpy)) nmTotal += price.nm_jpy * qty;
    else nmMissing += qty;

    if (isFiniteNumber(price?.psa10_jpy)) psaTotal += price.psa10_jpy * qty;
    else psaMissing += qty;

    const row = document.createElement('div');
    row.className = 'collection-row';
    row.innerHTML = `
      <div>
        <strong>${card.name_jp}</strong><br>
        <small>${card.set_code} · ${card.number} · ${card.rarity} · ${item.condition} ×${qty}</small>
      </div>
      <small>NM ${fmtJPY(price?.nm_jpy)}<br>PSA10 ${fmtJPY(price?.psa10_jpy)}</small>
    `;
    els.collectionBox.appendChild(row);
  }

  els.collectionSummary.innerHTML = `
    보유 상태 기준: ${fmtJPY(conditionTotal)}${conditionMissing ? ` · 미반영 ${conditionMissing}장` : ''}<br>
    전부 NM 기준: ${fmtJPY(nmTotal)}${nmMissing ? ` · 미반영 ${nmMissing}장` : ''}<br>
    전부 PSA10 기준: ${fmtJPY(psaTotal)}${psaMissing ? ` · 미반영 ${psaMissing}장` : ''}
  `;
}

function addCurrentToCollection() {
  if (!currentCard) {
    setStatus('failed', '먼저 카드 선택');
    els.searchPanel?.classList.remove('is-collapsed');
    return;
  }

  const qty = Math.max(1, Number(els.collectionQty.value || 1));
  const item = {
    card_id: currentCard.card_id,
    condition: els.collectionCondition.value || 'NM',
    qty,
    purchase_price_jpy: els.purchasePrice.value ? Number(els.purchasePrice.value) : null,
    purchase_date: els.purchaseDate.value || '',
    memo: els.collectionNote.value || '',
    storage_location: els.storageLocation.value || '',
    added_at: new Date().toISOString()
  };

  const items = collection();
  items.push(item);
  setCollection(items);
  setStatus('complete', '컬렉션 추가됨');
}

function initSetPicker() {
  if (!els.setSelect) return;
  els.setSelect.innerHTML = '';
  for (const set of sets) {
    const option = document.createElement('option');
    option.value = `${set.language}|${set.set_code}`;
    option.textContent = `${set.language} · ${set.set_code} ${set.set_name_ko}`;
    els.setSelect.appendChild(option);
  }
  els.setSelect.addEventListener('change', () => {
    const [language, setCode] = els.setSelect.value.split('|');
    selectedSet = sets.find(set => set.language === language && set.set_code === setCode) || sets[0];
    resetScan();
    renderSearch(els.searchInput.value);
  });
}

function init() {
  waitForCv();
  initSetPicker();
  renderEmpty('seeking');
  renderRecentScans();
  renderCollection();

  els.searchInput.addEventListener('input', e => renderSearch(e.target.value));
  document.querySelectorAll('[data-quick]').forEach(btn => btn.addEventListener('click', () => {
    els.searchPanel?.classList.remove('is-collapsed');
    els.searchInput.value = btn.dataset.quick;
    renderSearch(btn.dataset.quick);
    const card = findCardForSearch(btn.dataset.quick);
    if (card) confirmCard(card, 'search');
  }));

  els.startCamera.addEventListener('click', startCamera);
  els.imageInput.addEventListener('change', e => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      const regions = preparePhotoOcrRegions(img);
      ocrPreparedRegions(regions, '사진 이름+번호', null, { confirmImmediately: true });
      URL.revokeObjectURL(img.src);
      els.imageInput.value = '';
    };
    img.onerror = () => {
      setStatus('failed', '사진을 열 수 없음');
      els.imageInput.value = '';
    };
    img.src = URL.createObjectURL(file);
  });
  els.stopCamera.addEventListener('click', stopCamera);
  els.rescanBtn.addEventListener('click', resetScan);
  els.toggleSearch.addEventListener('click', () => {
    els.searchPanel.classList.toggle('is-collapsed');
    if (!els.searchPanel.classList.contains('is-collapsed')) els.searchInput.focus();
  });
  els.marketBtn.addEventListener('click', () => els.marketPanel.classList.toggle('is-collapsed'));
  els.addCollection.addEventListener('click', addCurrentToCollection);
  els.clearCollection.addEventListener('click', () => setCollection([]));
  els.openCardrush.addEventListener('click', () => openExternal('cardrush'));
  els.openMercari.addEventListener('click', () => openExternal('mercari'));
  els.openYahoo.addEventListener('click', () => openExternal('yahoo'));
  els.openGoogle.addEventListener('click', () => openExternal('google'));
  window.addEventListener('resize', resizeOverlay);

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  }
}

window.addEventListener('DOMContentLoaded', init);
