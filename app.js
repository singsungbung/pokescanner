/* UXRP_Scanner
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
  bottomSheet: $('bottomSheet'),
  sheetGrip: $('sheetGrip'),
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
  candidatePanel: $('candidatePanel'),
  candidateTitle: $('candidateTitle'),
  candidateList: $('candidateList'),
  debugCrop: $('debugCrop'),
  debugScores: $('debugScores'),
  saveDebugSample: $('saveDebugSample'),
  downloadDebugSamples: $('downloadDebugSamples'),
  clearDebugSamples: $('clearDebugSamples'),
  debugSamples: $('debugSamples'),
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
const visualIndex = window.MONPRICE_VISUAL_INDEX || [];
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
  ready: '카드 맞추는 중',
  ocr: '이미지 분석 중',
  candidate: '후보 확인 중',
  complete: '인식 완료',
  failed: '인식 실패',
  missing: 'DB에 없는 카드',
  noPrice: '가격 데이터 없음'
};

const OVERLAY_COLORS = {
  seeking: '#ff5d72',
  stabilizing: '#ffbd4a',
  ocr: '#ffbd4a',
  ready: '#ff5d72',
  candidate: '#ffbd4a',
  complete: '#4aa3ff',
  failed: '#ff5d72',
  missing: '#ff5d72',
  noPrice: '#4aa3ff'
};

const DETECT_EVERY_MS = 120;
const FAST_VISUAL_EVERY_MS = 280;
const STABLE_FRAME_COUNT = 2;
const STABLE_MS = 260;
const OCR_COOLDOWN_MS = 900;
const RECENT_DEDUPE_MS = 30000;
const USE_BOX_TRACKING = true;
const CARD_ASPECT_RATIO = 63 / 88;
const VOTE_WINDOW = 10;
const VOTE_MAX_AGE_MS = 18000;
const DIRECT_SCORE = 68;
const CANDIDATE_SCORE = 32;
const CLEAR_NUMBER_SCORE = 52;
const VISUAL_DIRECT_SCORE = 56;
const VISUAL_CANDIDATE_SCORE = 32;
const VISUAL_PREVIEW_SCORE = 26;
const VISUAL_OCR_LOCK_FLOOR = 22;
const VISUAL_MARGIN_LOCK = 3;
const LOCK_HOLD_MS = 900;
const LOCK_RECHECK_MS = 260;
const LOCK_THUMB_UPDATE_MS = 220;
const LOCK_BEST_FRAME_WINDOW_MS = 1200;
const LOCK_THUMB_MIN_SCORE_GAIN = 3;
const LOCK_THUMB_MIN_MARGIN_GAIN = 2;
const LOCK_SWITCH_SCORE = 52;
const LOCK_SWITCH_VOTES = 2;
const LOCK_LOST_MS = 1100;
const TRACK_SMOOTH_ALPHA = 0.34;
const LOCK_TRACK_SMOOTH_ALPHA = 0.2;
const TRACK_JUMP_LIMIT = 0.5;
const TRACK_RESET_MS = 760;

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
let lastFastVisualTick = 0;
let lastDetection = null;
let stableFrames = 0;
let stableSince = 0;
let latestDetection = null;
let ocrCooldownUntil = 0;
let ocrCandidateId = null;
let ocrCandidateCount = 0;
let lastOverlayState = 'seeking';
let lockedCardId = null;
let lockedAt = 0;
let lockSwitchCardId = null;
let lockSwitchCount = 0;
let lastLockCheckTick = 0;
let lastLockSeenAt = 0;
let lockBestVisualScore = 0;
let lockBestMargin = 0;
let lastLockThumbUpdate = 0;
let smoothedDetection = null;
let smoothedDetectionAt = 0;
let rejectedDetectionJumps = 0;
let consecutiveNumberMisses = 0;
let ocrVotes = [];
let lastDebugSnapshot = null;
const scanThumbByCardId = new Map();

const recentStorageKey = 'm1s_recent_scans_v1';
const collectionStorageKey = 'm1s_collection_v3';
const debugStorageKey = 'm1s_debug_samples_v1';
const DEBUG_SAMPLE_LIMIT = 12;

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
  setGuideColor(OVERLAY_COLORS[key] || OVERLAY_COLORS.seeking, key);
}

function setGuideColor(color, state = '') {
  if (!els.guideFrame) return;
  els.guideFrame.style.setProperty('--guide-color', color);
  els.guideFrame.classList.remove(
    'state-seeking',
    'state-ready',
    'state-stabilizing',
    'state-ocr',
    'state-candidate',
    'state-complete',
    'state-failed',
    'state-missing',
    'state-noPrice'
  );
  if (state) els.guideFrame.classList.add(`state-${state}`);
  els.guideFrame.querySelectorAll('.corner').forEach(corner => {
    corner.style.borderColor = color;
  });
}

function setSheetState(state = 'peek') {
  if (!els.bottomSheet) return;
  const next = ['collapsed', 'peek', 'expanded'].includes(state) ? state : 'peek';
  els.bottomSheet.dataset.sheetState = next;
  els.sheetGrip?.setAttribute('aria-expanded', String(next === 'expanded'));
  els.sheetGrip?.setAttribute(
    'aria-label',
    next === 'expanded' ? '스캔 정보 패널 줄이기' : '스캔 정보 패널 열기'
  );
}

function currentSheetState() {
  return els.bottomSheet?.dataset.sheetState || 'collapsed';
}

function revealSheetForResult() {
  if (currentSheetState() === 'collapsed') setSheetState('peek');
}

function expandSheet() {
  setSheetState('expanded');
}

function collapseSheet() {
  setSheetState('collapsed');
}

function priceHasValue(price) {
  return Boolean(price) && (isFiniteNumber(price.nm_jpy) || isFiniteNumber(price.psa10_jpy));
}

function priceFor(card) {
  return card ? priceByCardId.get(card.card_id) || null : null;
}

function fallbackThumbText(card) {
  return card ? `${card.rarity}\n${pad3(card.index)}` : selectedSet.set_code;
}

function setThumbContent(card) {
  if (!els.thumb) return;
  const src = card ? (scanThumbByCardId.get(card.card_id) || card.local_image_path || card.image_url) : '';
  if (src) {
    els.thumb.innerHTML = `<img src="${src}" alt="">`;
    els.thumb.style.background = '#0f121a';
    return;
  }

  els.thumb.textContent = card ? fallbackThumbText(card) : selectedSet.set_code;
  els.thumb.style.background = card?.rarity === 'MUR'
    ? 'linear-gradient(145deg,#fff4c0,#d9ccff 48%,#ffd166)'
    : card?.rarity === 'SAR'
      ? 'linear-gradient(145deg,#e8f7ff,#ffd166 54%,#ff9f43)'
      : card?.rarity === 'SR'
        ? 'linear-gradient(145deg,#ffffff,#d7e4ff 50%,#ffd166)'
        : card?.rarity === 'AR'
          ? 'linear-gradient(145deg,#fff2c4,#a7e6ff 52%,#ffd166)'
          : 'linear-gradient(145deg,#eef3ff,#ffd166 48%,#f4a51c)';
}

function rememberScanThumbnail(card, sourceCanvas) {
  if (!card || !sourceCanvas) return;
  try {
    const out = document.createElement('canvas');
    out.width = 152;
    out.height = 212;
    const ctx = out.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(sourceCanvas, 0, 0, out.width, out.height);
    scanThumbByCardId.set(card.card_id, out.toDataURL('image/jpeg', 0.82));
  } catch (err) {
    console.warn('scan thumb failed:', err);
  }
}

function updateLockBestFrame(candidate, candidates, cardFrame, now) {
  if (!candidate || !cardFrame || candidate.card.card_id !== lockedCardId) return false;
  if (now - lastLockThumbUpdate < LOCK_THUMB_UPDATE_MS) return false;

  const visualScore = candidate.visualScore || 0;
  const margin = visualMargin(candidates);
  const isEarlyLock = now - lockedAt <= LOCK_BEST_FRAME_WINDOW_MS;
  const betterScore = visualScore >= lockBestVisualScore + (isEarlyLock ? 1 : LOCK_THUMB_MIN_SCORE_GAIN);
  const betterMargin = margin >= lockBestMargin + (isEarlyLock ? 1 : LOCK_THUMB_MIN_MARGIN_GAIN);
  const strongEnough = visualScore >= VISUAL_PREVIEW_SCORE && margin >= 0;

  if (!strongEnough || (!betterScore && !betterMargin)) return false;

  lockBestVisualScore = Math.max(lockBestVisualScore, visualScore);
  lockBestMargin = Math.max(lockBestMargin, margin);
  lastLockThumbUpdate = now;
  rememberScanThumbnail(candidate.card, cardFrame);
  if (currentCard?.card_id === candidate.card.card_id) setThumbContent(currentCard);
  return true;
}

function renderEmpty(statusKey = 'seeking') {
  releaseScanLock();
  currentCard = null;
  els.resultCard?.classList.add('is-empty');
  hideCandidates();
  els.cardName.textContent = '카드를 스캔하거나 검색';
  els.cardSet.textContent = `${selectedSet.language} · ${selectedSet.set_code} ${selectedSet.set_name_ko}`;
  els.cardNumber.textContent = '—';
  els.cardRarity.textContent = '—';
  els.nmPrice.textContent = '—';
  els.psaPrice.textContent = '—';
  els.priceUpdated.textContent = '업데이트 —';
  els.priceConfidence.textContent = '신뢰도 —';
  setThumbContent(null);
  setStatus(statusKey);
  collapseSheet();
}

function renderCard(card) {
  if (!card) return;
  currentCard = card;
  const price = priceFor(card);
  const hasPrice = priceHasValue(price);

  els.resultCard?.classList.remove('is-empty');
  hideCandidates();
  els.cardName.textContent = card.name_jp;
  els.cardSet.textContent = `${card.language} · ${card.set_code} ${card.set_name_ko}`;
  els.cardNumber.textContent = card.number;
  els.cardRarity.textContent = card.rarity;
  els.nmPrice.textContent = hasPrice ? fmtJPY(price.nm_jpy) : '가격 데이터 없음';
  els.psaPrice.textContent = hasPrice ? fmtJPY(price.psa10_jpy) : '가격 데이터 없음';
  els.priceUpdated.textContent = price?.updated_at ? `업데이트 ${price.updated_at}` : '업데이트 —';
  els.priceConfidence.textContent = price?.confidence ? `신뢰도 ${price.confidence}` : '신뢰도 —';
  setThumbContent(card);
  revealSheetForResult();
}

function hideCandidates() {
  els.candidatePanel?.classList.add('is-collapsed');
  if (els.candidateList) els.candidateList.innerHTML = '';
}

function candidateThumbText(card) {
  return fallbackThumbText(card);
}

function renderCandidateCards(candidates, detail = '') {
  if (!els.candidatePanel || !els.candidateList) return;
  const top = candidates[0];
  if (!top) {
    hideCandidates();
    return;
  }

  els.resultCard?.classList.remove('is-empty');
  els.candidatePanel.classList.remove('is-collapsed');
  revealSheetForResult();
  els.candidateTitle.textContent = detail || `이 카드일 가능성이 높음 · ${top.score}점`;
  els.candidateList.innerHTML = '';

  for (const item of candidates.slice(0, 3)) {
    const card = item.card;
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'candidate-item';
    row.setAttribute('role', 'listitem');
    row.setAttribute('aria-label', `${card.name_jp}, ${card.number}, ${card.rarity} 후보 선택`);
    const thumb = card.local_image_path || card.image_url
      ? `<img src="${card.local_image_path || card.image_url}" alt="">`
      : `<span>${candidateThumbText(card)}</span>`;
    row.innerHTML = `
      <span class="candidate-thumb">${thumb}</span>
      <span class="candidate-main">
        <strong>${card.name_jp}</strong>
        <small>${card.name_ko} · ${card.name_en}</small>
        <small>${card.number} · ${card.rarity}</small>
      </span>
      <span class="candidate-score">
        <strong>${item.score}</strong>
        <small>이미지 ${item.visualScore || 0} · 번호 ${item.numberScore} · 이름 ${item.nameScore} · ${item.votes || 1}표</small>
      </span>
    `;
    row.addEventListener('click', () => {
      clearCandidateVotes();
      confirmCard(card, 'candidate');
      lockScan(card);
      hideCandidates();
    });
    els.candidateList.appendChild(row);
  }
}

function normalizeText(raw) {
  return (raw || '')
    .normalize('NFKC')
    .replace(/[ＯｏO]/g, '0')
    .replace(/[Ｉｌl|!]/g, '1')
    .replace(/[／]/g, '/')
    .replace(/[ー－—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeNumberOcr(raw) {
  return (raw || '')
    .normalize('NFKC')
    .replace(/[OoＯｏ]/g, '0')
    .replace(/[IiＩｉLlｌ|!！]/g, '1')
    .replace(/[SsＳｓ]/g, '5')
    .replace(/[ZzＺｚ]/g, '2')
    .replace(/[BbＢｂ]/g, '8')
    .replace(/[GgＧｇ]/g, '6')
    .replace(/[／\\]/g, '/')
    .replace(/[^0-9/]/g, '')
    .replace(/\/+/g, '/');
}

function normalizeOcrText(raw) {
  return normalizeNumberOcr(raw);
}

function levenshteinDistance(a, b) {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  const curr = Array(b.length + 1).fill(0);

  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + cost
      );
    }
    for (let j = 0; j <= b.length; j += 1) prev[j] = curr[j];
  }
  return prev[b.length];
}

function stringSimilarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const distance = levenshteinDistance(a, b);
  return Math.max(0, 1 - distance / Math.max(a.length, b.length));
}

function canonicalNumber(index, denominator) {
  if (!Number.isFinite(index) || !Number.isFinite(denominator) || index < 1 || denominator < 1) return '';
  return `${pad3(index)}/${pad3(denominator)}`;
}

function numberPartsFromCompact(compact) {
  if (!compact) return [];
  const found = [];
  const seen = new Set();
  const add = (indexText, denominatorText) => {
    const index = Number(indexText);
    const denominator = Number(denominatorText);
    if (!Number.isInteger(index) || !Number.isInteger(denominator) || index < 1 || index > 999 || denominator < 0) return;
    const key = `${index}/${denominator}`;
    if (!seen.has(key)) {
      seen.add(key);
      found.push({ index, denominator });
    }
  };

  let hasSlashNumber = false;
  for (const match of compact.matchAll(/(\d{1,3})\/(\d{1,3})/g)) {
    hasSlashNumber = true;
    add(match[1], match[2]);
  }

  const digits = compact.replace(/\D/g, '');
  if (!hasSlashNumber && digits.length >= 4 && digits.length <= 6) {
    add(digits.slice(0, -3), digits.slice(-3));
    add(digits.slice(0, -2), digits.slice(-2));
  }
  if (digits.length >= 1 && digits.length <= 3) {
    add(digits, '0');
  }
  return found;
}

function numberFormsFromText(raw) {
  const compact = normalizeNumberOcr(raw);
  const forms = new Set();
  if (compact) forms.add(compact);
  for (const part of numberPartsFromCompact(compact)) {
    if (part.denominator > 0) {
      forms.add(canonicalNumber(part.index, part.denominator));
      forms.add(`${part.index}/${part.denominator}`);
    }
    if (part.denominator === 0) forms.add(pad3(part.index));
  }
  return [...forms].filter(Boolean);
}

function cardNumberForms(card) {
  const forms = new Set();
  [card.number, card.collector_number, `${card.index}/92`, `${pad3(card.index)}/063`].forEach(value => {
    const compact = normalizeNumberOcr(value);
    if (compact) forms.add(compact);
    for (const part of numberPartsFromCompact(compact)) {
      forms.add(canonicalNumber(part.index, part.denominator));
      forms.add(`${part.index}/${part.denominator}`);
    }
  });
  return [...forms].filter(Boolean);
}

function parseCardNumber(raw, options = {}) {
  const compact = normalizeNumberOcr(raw);
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

function scoreNumberMatch(rawText, card) {
  const observed = numberFormsFromText(rawText);
  if (!observed.length) return 0;
  const targets = cardNumberForms(card);
  let best = 0;

  for (const source of observed) {
    const sourceParts = numberPartsFromCompact(source);
    for (const target of targets) {
      if (!source || !target) continue;
      if (source === target) best = Math.max(best, 60);
      best = Math.max(best, Math.round(stringSimilarity(source, target) * 60));

      const targetParts = numberPartsFromCompact(target);
      for (const sp of sourceParts) {
        for (const tp of targetParts) {
          if (sp.index === tp.index) {
            if (sp.denominator === 0) best = Math.max(best, 45);
            else best = Math.max(best, sp.denominator === tp.denominator ? 60 : 50);
          }
        }
      }
    }
  }
  return Math.min(60, best);
}

function findCardForSearch(raw) {
  const query = normalizeText(raw).toLowerCase();
  if (!query) return null;

  const parsed = parseCardNumber(query);
  const cardByNumber = findCardByParsedNumber(parsed);
  if (cardByNumber) return cardByNumber;

  const fuzzy = scoreOcrCandidates({ numberText: query, nameText: query })[0];
  if (fuzzy && (fuzzy.score >= CANDIDATE_SCORE || fuzzy.numberScore >= 45 || fuzzy.nameScore >= 18)) {
    return fuzzy.card;
  }

  return selectedCards().find(card => {
    const fields = [
      card.name_en, card.name_jp, card.name_ko, card.number,
      card.collector_number, card.rarity, ...(card.search_keywords || [])
    ].filter(Boolean).map(value => String(value).toLowerCase());
    return fields.some(value => value === query || value.includes(query));
  }) || null;
}

function normalizeForNameMatch(raw) {
  return (raw || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[0０]/g, 'o')
    .replace(/[1１|!！]/g, 'l')
    .replace(/[5５]/g, 's')
    .replace(/[2２]/g, 'z')
    .replace(/[8８]/g, 'b')
    .replace(/[6６]/g, 'g')
    .replace(/[^\p{L}\p{N}ぁ-ゟ゠-ヿ一-龯가-힣]/gu, '');
}

function nameFormsForCard(card) {
  const rawFields = [
    card.name_jp,
    card.name_ko,
    card.name_en
  ].filter(Boolean);
  const forms = new Set();
  for (const field of rawFields) {
    const normalized = normalizeForNameMatch(field);
    if (!normalized || /^\d/.test(normalized)) continue;
    forms.add(normalized);
    forms.add(normalized.replace(/^(mega|メガ|메가)/, '').replace(/ex$/, ''));
    String(field).split(/[\s'’・の]+/).forEach(part => {
      const token = normalizeForNameMatch(part);
      if (token.length >= 3) forms.add(token);
    });
  }
  return [...forms].filter(value => value.length >= 2);
}

function scoreNameMatch(rawText, card) {
  const text = normalizeForNameMatch(rawText);
  if (!text) return 0;
  const fields = nameFormsForCard(card);

  let best = 0;
  for (const field of fields) {
    if (!field) continue;
    if (field.length >= 3 && text.includes(field)) best = Math.max(best, 30);
    if (field.includes(text) && text.length >= 2) best = Math.max(best, Math.min(30, 20 + text.length));
    best = Math.max(best, Math.round(stringSimilarity(text, field) * 30));

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
      best = Math.max(best, Math.round((ordered / field.length) * 24));
    }
  }
  return Math.min(30, best);
}

function findCardByNameText(rawText) {
  const scored = selectedCards()
    .map(card => ({ card, score: scoreNameMatch(rawText, card) }))
    .filter(item => item.score >= 16)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.card || null;
}

function scoreOcrCandidate(card, numberText = '', nameText = '') {
  const numberScore = scoreNumberMatch(numberText, card);
  const nameScore = scoreNameMatch(nameText, card);
  const setBonus = (numberScore > 0 || nameScore > 0) ? 10 : 0;
  const score = Math.min(100, numberScore + nameScore + setBonus);
  return { card, score, visualScore: 0, artworkScore: 0, layoutColorScore: 0, numberScore, nameScore, setBonus, votes: 0 };
}

function scoreOcrCandidates({ numberText = '', nameText = '' } = {}) {
  return selectedCards()
    .map(card => scoreOcrCandidate(card, numberText, nameText))
    .filter(item => item.score >= CANDIDATE_SCORE || item.numberScore >= 45 || item.nameScore >= 18)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.numberScore !== a.numberScore) return b.numberScore - a.numberScore;
      return b.nameScore - a.nameScore;
    })
    .slice(0, 6);
}

function hashCanvasRegion(sourceCanvas, rect, size = 8) {
  if (!sourceCanvas) return '';
  const sample = document.createElement('canvas');
  sample.width = size;
  sample.height = size;
  const ctx = sample.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(
    sourceCanvas,
    rect.x, rect.y, rect.width, rect.height,
    0, 0, size, size
  );
  const data = ctx.getImageData(0, 0, size, size).data;
  const gray = [];
  for (let i = 0; i < data.length; i += 4) {
    gray.push(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
  }
  const avg = gray.reduce((sum, value) => sum + value, 0) / Math.max(1, gray.length);
  return gray.map(value => value >= avg ? '1' : '0').join('');
}

function colorGridFromCanvas(sourceCanvas, grid = 4) {
  if (!sourceCanvas) return [];
  const sample = document.createElement('canvas');
  sample.width = grid;
  sample.height = grid;
  const ctx = sample.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(sourceCanvas, 0, 0, grid, grid);
  const data = ctx.getImageData(0, 0, grid, grid).data;
  const colors = [];
  for (let i = 0; i < data.length; i += 4) {
    colors.push(data[i], data[i + 1], data[i + 2]);
  }
  return colors;
}

function extractVisualFeature(cardCanvas) {
  if (!cardCanvas || cardCanvas.width < 40 || cardCanvas.height < 60) return null;
  const full = { x: 0, y: 0, width: cardCanvas.width, height: cardCanvas.height };
  const art = {
    x: Math.round(cardCanvas.width * 0.09),
    y: Math.round(cardCanvas.height * 0.13),
    width: Math.round(cardCanvas.width * 0.82),
    height: Math.round(cardCanvas.height * 0.38)
  };
  return {
    hash: hashCanvasRegion(cardCanvas, full, 8),
    artHash: hashCanvasRegion(cardCanvas, art, 8),
    color: colorGridFromCanvas(cardCanvas, 4)
  };
}

function hashSimilarity(a, b) {
  a = normalizeHashString(a);
  b = normalizeHashString(b);
  if (!a || !b || a.length !== b.length) return 0;
  let same = 0;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] === b[i]) same += 1;
  }
  return same / a.length;
}

function normalizeHashString(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (/^[01]+$/.test(text)) return text;
  if (/^[0-9a-f]+$/i.test(text)) {
    return [...text].map(ch => Number.parseInt(ch, 16).toString(2).padStart(4, '0')).join('');
  }
  return text;
}

function colorSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || !a.length || a.length !== b.length) return 0;
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) {
    const delta = Number(a[i]) - Number(b[i]);
    sum += delta * delta;
  }
  const rms = Math.sqrt(sum / a.length);
  return Math.max(0, 1 - rms / 255);
}

function scoreVisualFeature(feature, entry) {
  if (!feature || !entry) return null;
  const fullHash = entry.hash || entry.full_hash || entry.visual_hash;
  const artHash = entry.artHash || entry.art_hash || entry.artwork_hash;
  const colors = entry.color || entry.color_grid || entry.layout_color;
  const fullScore = Math.round(hashSimilarity(feature.hash, fullHash) * 25);
  const artScore = Math.round(hashSimilarity(feature.artHash, artHash) * 35);
  const colorScore = Math.round(colorSimilarity(feature.color, colors) * 10);
  const visualScore = fullScore + artScore + colorScore;
  return {
    visualScore,
    artworkScore: artScore,
    layoutColorScore: colorScore
  };
}

function scoreVisualCandidates(cardCanvas, minScore = VISUAL_CANDIDATE_SCORE) {
  if (!visualIndex.length || !cardCanvas) return [];
  const feature = extractVisualFeature(cardCanvas);
  if (!feature) return [];

  return visualIndex
    .map(entry => {
      const card = cardById(entry.card_id);
      if (!card || card.language !== selectedSet.language || card.set_code !== selectedSet.set_code) return null;
      const visual = scoreVisualFeature(feature, entry);
      if (!visual) return null;
      const setBonus = visual.visualScore > 0 ? 10 : 0;
      return {
        card,
        score: Math.min(100, visual.visualScore + setBonus),
        visualScore: visual.visualScore,
        artworkScore: visual.artworkScore,
        layoutColorScore: visual.layoutColorScore,
        numberScore: 0,
        nameScore: 0,
        setBonus,
        votes: 0
      };
    })
    .filter(Boolean)
    .filter(item => item.visualScore >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
}

function visualMargin(candidates) {
  if (!candidates?.length) return 0;
  return (candidates[0].visualScore || 0) - (candidates[1]?.visualScore || 0);
}

function isClearVisualCandidate(candidates) {
  const top = candidates?.[0];
  return Boolean(top) &&
    top.visualScore >= VISUAL_DIRECT_SCORE &&
    visualMargin(candidates) >= VISUAL_MARGIN_LOCK;
}

function updateDebugView(cardCanvas, candidates = [], label = '') {
  if (els.debugCrop && cardCanvas) {
    const ctx = els.debugCrop.getContext('2d');
    ctx.clearRect(0, 0, els.debugCrop.width, els.debugCrop.height);
    ctx.drawImage(cardCanvas, 0, 0, els.debugCrop.width, els.debugCrop.height);
  }

  lastDebugSnapshot = {
    captured_at: new Date().toISOString(),
    label: label || '후보 없음',
    selected_set: `${selectedSet.language}|${selectedSet.set_code}`,
    current_card_id: currentCard?.card_id || null,
    current_card_number: currentCard?.number || null,
    locked_card_id: lockedCardId || null,
    scan_status: els.scanStatus?.textContent || '',
    mode_status: els.detectStatus?.textContent || '',
    visual_margin: visualMargin(candidates),
    candidates: candidates.slice(0, 5).map((item, index) => ({
      rank: index + 1,
      card_id: item.card.card_id,
      name_jp: item.card.name_jp,
      name_ko: item.card.name_ko,
      name_en: item.card.name_en,
      number: item.card.number,
      rarity: item.card.rarity,
      score: item.score || 0,
      visualScore: item.visualScore || 0,
      artworkScore: item.artworkScore || 0,
      layoutColorScore: item.layoutColorScore || 0,
      numberScore: item.numberScore || 0,
      nameScore: item.nameScore || 0,
      votes: item.votes || 0
    }))
  };

  if (!els.debugScores) return;
  if (!candidates.length) {
    els.debugScores.textContent = label || '후보 없음';
    return;
  }

  els.debugScores.innerHTML = candidates.slice(0, 5).map((item, index) => `
    <div class="debug-score-row">
      <strong>${index + 1}. ${item.card.number} ${item.card.name_jp}</strong>
      <small>총 ${item.score} · 이미지 ${item.visualScore || 0} · art ${item.artworkScore || 0} · color ${item.layoutColorScore || 0}</small>
      <small>번호 ${item.numberScore || 0} · 이름 ${item.nameScore || 0} · margin ${index === 0 ? visualMargin(candidates) : '-'}</small>
    </div>
  `).join('');
}

function previewVisualCandidates(detection = null, label = '실시간 이미지 후보') {
  if (!visualIndex.length || isOcrBusy) return false;
  const selectedFrame = selectBestCardFrame(detection, VISUAL_PREVIEW_SCORE, true);
  const cardFrame = selectedFrame?.canvas || null;
  if (!cardFrame) return false;

  const candidates = selectedFrame.candidates?.length
    ? selectedFrame.candidates
    : scoreVisualCandidates(cardFrame, VISUAL_PREVIEW_SCORE);
  const debugLabel = selectedFrame?.label ? `${label} · ${selectedFrame.label}` : label;
  updateDebugView(cardFrame, candidates, candidates.length ? debugLabel : `${debugLabel} · 후보 없음`);
  if (!candidates.length) return false;

  handleOcrCandidates(candidates, detection, 'visual preview', {
    visualIndexActive: true,
    confirmImmediately: isClearVisualCandidate(candidates),
    cardFrame
  });
  return true;
}

function isScanLocked() {
  return Boolean(currentCard && lockedCardId === currentCard.card_id);
}

function lockScan(card, options = {}) {
  if (!card) return;
  const now = Date.now();
  lockedCardId = card.card_id;
  lockedAt = now;
  lastLockSeenAt = now;
  lastLockCheckTick = 0;
  lockSwitchCardId = null;
  lockSwitchCount = 0;
  lockBestVisualScore = options.visualScore || 0;
  lockBestMargin = options.margin || 0;
  lastLockThumbUpdate = options.cardFrame ? now : 0;
  if (options.cardFrame) rememberScanThumbnail(card, options.cardFrame);
}

function releaseScanLock() {
  lockedCardId = null;
  lockedAt = 0;
  lastLockSeenAt = 0;
  lastLockCheckTick = 0;
  lockSwitchCardId = null;
  lockSwitchCount = 0;
  lockBestVisualScore = 0;
  lockBestMargin = 0;
  lastLockThumbUpdate = 0;
  resetSmoothedDetection();
}

function reviewLockedCard(detection, now) {
  if (!isScanLocked()) return false;
  drawDetectedOverlay(detection, priceHasValue(priceFor(currentCard)) ? 'complete' : 'noPrice');
  els.detectStatus.textContent = '락온';

  if (now - lastLockCheckTick < LOCK_RECHECK_MS) {
    setStatus(priceHasValue(priceFor(currentCard)) ? 'complete' : 'noPrice', `${currentCard.number} · 검토 중`);
    return true;
  }

  lastLockCheckTick = now;
  const selectedFrame = selectBestCardFrame(detection, Math.max(18, VISUAL_PREVIEW_SCORE - 4), true);
  const cardFrame = selectedFrame?.canvas || null;
  if (!cardFrame) return true;

  const candidates = selectedFrame.candidates?.length
    ? selectedFrame.candidates
    : scoreVisualCandidates(cardFrame, Math.max(18, VISUAL_PREVIEW_SCORE - 4));
  const debugLabel = selectedFrame?.label ? `락온 검토 후보 · ${selectedFrame.label}` : '락온 검토 후보';
  updateDebugView(cardFrame, candidates, candidates.length ? debugLabel : `${debugLabel} 없음`);
  const top = candidates[0];

  if (!top) {
    if (now - lastLockSeenAt > LOCK_LOST_MS) {
      releaseScanLock();
      setStatus('seeking', '카드 없음');
      drawGuideOcrOverlay('seeking');
      lastOverlayState = 'seeking';
    }
    return true;
  }

  const sameCandidate = candidates.find(item => item.card.card_id === lockedCardId);
  if (sameCandidate && sameCandidate.visualScore >= VISUAL_PREVIEW_SCORE) {
    lastLockSeenAt = now;
    lockSwitchCardId = null;
    lockSwitchCount = 0;
    const updatedBestFrame = updateLockBestFrame(sameCandidate, candidates, cardFrame, now);
    setStatus(
      priceHasValue(priceFor(currentCard)) ? 'complete' : 'noPrice',
      updatedBestFrame ? `${currentCard.number} · 이미지 개선됨` : `${currentCard.number} · 검토 중`
    );
    lastOverlayState = priceHasValue(priceFor(currentCard)) ? 'complete' : 'noPrice';
    return true;
  }

  const canSwitch =
    top.card.card_id !== lockedCardId &&
    top.visualScore >= LOCK_SWITCH_SCORE &&
    now - lockedAt >= LOCK_HOLD_MS;

  if (canSwitch) {
    if (lockSwitchCardId === top.card.card_id) lockSwitchCount += 1;
    else {
      lockSwitchCardId = top.card.card_id;
      lockSwitchCount = 1;
    }

    setStatus('candidate', `${top.card.number} 새 카드 검토 ${lockSwitchCount}/${LOCK_SWITCH_VOTES}`);
    drawDetectedOverlay(detection, 'candidate');
    lastOverlayState = 'candidate';

    if (lockSwitchCount >= LOCK_SWITCH_VOTES) {
      rememberScanThumbnail(top.card, cardFrame);
      confirmCard(top.card, 'scan');
      lockScan(top.card, {
        visualScore: top.visualScore || 0,
        margin: visualMargin(candidates),
        cardFrame
      });
      drawDetectedOverlay(detection, priceHasValue(priceFor(top.card)) ? 'complete' : 'noPrice');
      lastOverlayState = priceHasValue(priceFor(top.card)) ? 'complete' : 'noPrice';
    }
    return true;
  }

  setStatus(priceHasValue(priceFor(currentCard)) ? 'complete' : 'noPrice', `${currentCard.number} · 검토 중`);
  return true;
}

function mergeVisualAndOcrCandidates(visualCandidates, ocrCandidates) {
  if (!visualCandidates.length) return ocrCandidates;
  const byCard = new Map();
  for (const item of [...visualCandidates, ...ocrCandidates]) {
    const prev = byCard.get(item.card.card_id) || {
      card: item.card,
      visualScore: 0,
      artworkScore: 0,
      layoutColorScore: 0,
      numberScore: 0,
      nameScore: 0,
      setBonus: 0,
      votes: 0
    };
    prev.visualScore = Math.max(prev.visualScore, item.visualScore || 0);
    prev.artworkScore = Math.max(prev.artworkScore, item.artworkScore || 0);
    prev.layoutColorScore = Math.max(prev.layoutColorScore, item.layoutColorScore || 0);
    prev.numberScore = Math.max(prev.numberScore, item.numberScore || 0);
    prev.nameScore = Math.max(prev.nameScore, item.nameScore || 0);
    prev.setBonus = Math.max(prev.setBonus, item.setBonus || 0);
    byCard.set(item.card.card_id, prev);
  }

  return [...byCard.values()]
    .map(item => ({
      ...item,
      score: Math.min(100, item.visualScore + Math.round(item.numberScore * 0.18) + Math.round(item.nameScore * 0.22) + item.setBonus)
    }))
    .filter(item => item.score >= CANDIDATE_SCORE || item.visualScore >= VISUAL_CANDIDATE_SCORE)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.visualScore - a.visualScore;
    })
    .slice(0, 6);
}

function updateCandidateVotes(candidates) {
  const now = Date.now();
  if (candidates?.length) {
    ocrVotes.push({
      time: now,
      candidates: candidates.slice(0, 3).map((item, index) => ({
        card_id: item.card.card_id,
        score: item.score,
        visualScore: item.visualScore || 0,
        artworkScore: item.artworkScore || 0,
        layoutColorScore: item.layoutColorScore || 0,
        numberScore: item.numberScore,
        nameScore: item.nameScore,
        rank: index
      }))
    });
  }

  ocrVotes = ocrVotes
    .filter(vote => now - vote.time <= VOTE_MAX_AGE_MS)
    .slice(-VOTE_WINDOW);

  const byCard = new Map();
  for (const vote of ocrVotes) {
    for (const item of vote.candidates) {
      const card = cardById(item.card_id);
      if (!card) continue;
      const weight = item.rank === 0 ? 1 : item.rank === 1 ? 0.72 : 0.52;
      const prev = byCard.get(item.card_id) || {
        card,
        scoreTotal: 0,
        weightedTotal: 0,
        visualScore: 0,
        artworkScore: 0,
        layoutColorScore: 0,
        numberScore: 0,
        nameScore: 0,
        bestScore: 0,
        votes: 0
      };
      prev.scoreTotal += item.score;
      prev.weightedTotal += item.score * weight;
      prev.visualScore = Math.max(prev.visualScore, item.visualScore || 0);
      prev.artworkScore = Math.max(prev.artworkScore, item.artworkScore || 0);
      prev.layoutColorScore = Math.max(prev.layoutColorScore, item.layoutColorScore || 0);
      prev.numberScore = Math.max(prev.numberScore, item.numberScore);
      prev.nameScore = Math.max(prev.nameScore, item.nameScore);
      prev.bestScore = Math.max(prev.bestScore, item.score);
      prev.votes += 1;
      byCard.set(item.card_id, prev);
    }
  }

  return [...byCard.values()]
    .map(item => {
      const voteBonus = Math.min(18, Math.max(0, item.votes - 1) * 6);
      const average = item.scoreTotal / Math.max(1, item.votes);
      return {
        card: item.card,
        score: Math.min(100, Math.round(Math.max(item.bestScore, average, item.weightedTotal / Math.max(1, item.votes)) + voteBonus)),
        visualScore: item.visualScore,
        artworkScore: item.artworkScore,
        layoutColorScore: item.layoutColorScore,
        numberScore: item.numberScore,
        nameScore: item.nameScore,
        setBonus: 10,
        votes: item.votes
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.votes !== a.votes) return b.votes - a.votes;
      return b.numberScore - a.numberScore;
    })
    .slice(0, 3);
}

function clearCandidateVotes() {
  ocrVotes = [];
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
    els.detectStatus.textContent = '가이드 스캔';
    return;
  }

  const markReady = () => {
    if (window.cv && cv.Mat) {
      cvReady = true;
      els.detectStatus.textContent = '외곽선 준비';
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
    if (!cvReady) els.detectStatus.textContent = '외곽선 로딩';
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
  resetGuideFramePosition();
}

function videoRectToDisplayRect(rect) {
  if (!rect || !els.detectCanvas || !els.video.videoWidth || !els.video.videoHeight) return null;
  const boxW = els.detectCanvas.clientWidth || els.detectCanvas.getBoundingClientRect().width;
  const boxH = els.detectCanvas.clientHeight || els.detectCanvas.getBoundingClientRect().height;
  if (!boxW || !boxH) return null;

  const scale = Math.max(boxW / els.video.videoWidth, boxH / els.video.videoHeight);
  const offsetX = (boxW - els.video.videoWidth * scale) / 2;
  const offsetY = (boxH - els.video.videoHeight * scale) / 2;
  return {
    x: offsetX + rect.x * scale,
    y: offsetY + rect.y * scale,
    width: rect.width * scale,
    height: rect.height * scale
  };
}

function resetGuideFramePosition() {
  if (!els.guideFrame) return;
  els.guideFrame.classList.remove('is-tracking');
  els.guideFrame.style.left = '';
  els.guideFrame.style.top = '';
  els.guideFrame.style.width = '';
  els.guideFrame.style.height = '';
  els.guideFrame.style.aspectRatio = '';
  els.guideFrame.style.transform = '';
}

function syncGuideFrameToDetection(detection) {
  if (!els.guideFrame || !detection?.rect) return;
  const displayRect = videoRectToDisplayRect(detection.rect);
  if (!displayRect) return;

  els.guideFrame.classList.add('is-tracking');
  els.guideFrame.style.left = `${Math.round(displayRect.x)}px`;
  els.guideFrame.style.top = `${Math.round(displayRect.y)}px`;
  els.guideFrame.style.width = `${Math.round(displayRect.width)}px`;
  els.guideFrame.style.height = `${Math.round(displayRect.height)}px`;
  els.guideFrame.style.aspectRatio = 'auto';
  els.guideFrame.style.transform = 'none';
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
  setGuideColor(color, state);
  syncGuideFrameToDetection(detection);
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

function rotatedRectPoints(rotated) {
  if (!rotated?.center || !rotated?.size) return null;
  const cx = rotated.center.x;
  const cy = rotated.center.y;
  const w = rotated.size.width;
  const h = rotated.size.height;
  const angle = (rotated.angle || 0) * Math.PI / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const corners = [
    { x: -w / 2, y: -h / 2 },
    { x: w / 2, y: -h / 2 },
    { x: w / 2, y: h / 2 },
    { x: -w / 2, y: h / 2 }
  ];

  return corners.map(point => ({
    x: Math.round(cx + point.x * cos - point.y * sin),
    y: Math.round(cy + point.x * sin + point.y * cos)
  }));
}

function detectCardRect() {
  if (!cvReady || !stream || !els.video.videoWidth) return null;
  let src, gray, blur, edges, closed, dilated, contours, hierarchy, kernel;
  try {
    const canvas = getFrameCanvasFull();
    src = cv.imread(canvas);
    gray = new cv.Mat();
    blur = new cv.Mat();
    edges = new cv.Mat();
    closed = new cv.Mat();
    dilated = new cv.Mat();
    contours = new cv.MatVector();
    hierarchy = new cv.Mat();

    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);
    cv.Canny(blur, edges, 35, 118);
    kernel = cv.Mat.ones(3, 3, cv.CV_8U);
    cv.morphologyEx(edges, closed, cv.MORPH_CLOSE, kernel);
    cv.dilate(closed, dilated, kernel);
    cv.findContours(dilated, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    let best = null;
    const frameArea = canvas.width * canvas.height;
    for (let i = 0; i < contours.size(); i += 1) {
      const cnt = contours.get(i);
      const area = cv.contourArea(cnt);
      if (area < frameArea * 0.012 || area > frameArea * 0.78) {
        cnt.delete();
        continue;
      }

      const peri = cv.arcLength(cnt, true);
      const approx = new cv.Mat();
      cv.approxPolyDP(cnt, approx, 0.032 * peri, true);
      const rect = cv.boundingRect(cnt);
      const rotated = cv.minAreaRect(cnt);
      const rw = Math.max(1, rotated?.size?.width || rect.width);
      const rh = Math.max(1, rotated?.size?.height || rect.height);
      const ratio = Math.min(rw, rh) / Math.max(rw, rh);
      const centerBias = 1 - Math.abs((rect.x + rect.width / 2) - canvas.width / 2) / (canvas.width / 2);
      const ratioScore = 1 - Math.min(1, Math.abs(ratio - 0.715) / 0.35);
      const sizeScore = 1 - Math.min(1, Math.abs((area / frameArea) - 0.18) / 0.28);
      const score = area * (0.55 + Math.max(0, centerBias) * 0.24 + ratioScore * 0.5 + sizeScore * 0.16);

      if (approx.rows >= 4 && approx.rows <= 12 && ratio > 0.38 && ratio < 0.9) {
        let points = rotatedRectPoints(rotated) || [];
        if (approx.rows === 4) {
          points = [];
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
    [src, gray, blur, edges, closed, dilated, hierarchy, kernel].forEach(mat => {
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

function cloneDetection(detection) {
  if (!detection?.rect) return null;
  return {
    ...detection,
    rect: { ...detection.rect },
    points: detection.points?.map(point => ({ x: point.x, y: point.y })) || null
  };
}

function detectionJumpRatio(a, b) {
  if (!a?.rect || !b?.rect) return 0;
  const ar = a.rect;
  const br = b.rect;
  const acx = ar.x + ar.width / 2;
  const acy = ar.y + ar.height / 2;
  const bcx = br.x + br.width / 2;
  const bcy = br.y + br.height / 2;
  const diagonal = Math.hypot(br.width, br.height) || 1;
  const centerDelta = Math.hypot(acx - bcx, acy - bcy) / diagonal;
  const widthDelta = Math.abs(ar.width - br.width) / Math.max(ar.width, br.width);
  const heightDelta = Math.abs(ar.height - br.height) / Math.max(ar.height, br.height);
  return centerDelta + widthDelta * 0.55 + heightDelta * 0.55;
}

function blendValue(from, to, alpha) {
  return from + (to - from) * alpha;
}

function blendRect(from, to, alpha) {
  return {
    x: Math.round(blendValue(from.x, to.x, alpha)),
    y: Math.round(blendValue(from.y, to.y, alpha)),
    width: Math.round(blendValue(from.width, to.width, alpha)),
    height: Math.round(blendValue(from.height, to.height, alpha))
  };
}

function blendPoints(fromPoints, toPoints, alpha) {
  const from = orderQuadPoints(fromPoints);
  const to = orderQuadPoints(toPoints);
  if (!from || !to) return toPoints?.map(point => ({ x: point.x, y: point.y })) || null;
  return to.map((point, index) => ({
    x: Math.round(blendValue(from[index].x, point.x, alpha)),
    y: Math.round(blendValue(from[index].y, point.y, alpha))
  }));
}

function resetSmoothedDetection() {
  smoothedDetection = null;
  smoothedDetectionAt = 0;
  rejectedDetectionJumps = 0;
}

function stabilizeDetection(rawDetection, now) {
  if (!rawDetection?.rect) return null;
  const raw = cloneDetection(rawDetection);
  if (!smoothedDetection || now - smoothedDetectionAt > TRACK_RESET_MS) {
    smoothedDetection = raw;
    smoothedDetectionAt = now;
    rejectedDetectionJumps = 0;
    return cloneDetection(smoothedDetection);
  }

  const jump = detectionJumpRatio(raw, smoothedDetection);
  if (isScanLocked() && jump > TRACK_JUMP_LIMIT && rejectedDetectionJumps < 1) {
    rejectedDetectionJumps += 1;
    smoothedDetectionAt = now;
    return cloneDetection(smoothedDetection);
  }

  rejectedDetectionJumps = 0;
  const alpha = isScanLocked() ? LOCK_TRACK_SMOOTH_ALPHA : TRACK_SMOOTH_ALPHA;
  smoothedDetection = {
    ...raw,
    rect: blendRect(smoothedDetection.rect, raw.rect, alpha),
    points: blendPoints(smoothedDetection.points, raw.points, alpha)
  };
  smoothedDetectionAt = now;
  return cloneDetection(smoothedDetection);
}

function centeredCardRect(width, height, widthRatio = 0.68, heightRatio = 0.86) {
  const maxWidth = width * widthRatio;
  const maxHeight = height * heightRatio;
  let cardWidth = maxWidth;
  let cardHeight = cardWidth / CARD_ASPECT_RATIO;
  if (cardHeight > maxHeight) {
    cardHeight = maxHeight;
    cardWidth = cardHeight * CARD_ASPECT_RATIO;
  }

  return {
    x: Math.round((width - cardWidth) / 2),
    y: Math.round((height - cardHeight) / 2),
    width: Math.round(cardWidth),
    height: Math.round(cardHeight)
  };
}

function getGuideFrameVideoRect() {
  const vw = els.video.videoWidth || 1280;
  const vh = els.video.videoHeight || 720;
  return centeredCardRect(vw, vh, 0.68, 0.86);
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
  resetGuideFramePosition();
  const ctx = els.detectCanvas.getContext('2d');
  ctx.clearRect(0, 0, els.detectCanvas.width, els.detectCanvas.height);

  const color = OVERLAY_COLORS[state] || OVERLAY_COLORS.ready;
  const baseGuide = getGuideFrameVideoRect();
  const t = Date.now();
  const breathe = ['ocr', 'candidate'].includes(state)
    ? Math.sin(t / 120) * 5
    : Math.sin(t / 420) * 2;
  const guide = {
    x: Math.round(baseGuide.x - breathe),
    y: Math.round(baseGuide.y - breathe),
    width: Math.round(baseGuide.width + breathe * 2),
    height: Math.round(baseGuide.height + breathe * 2)
  };
  const nameStrip = getNameStripRect(guide);
  const strip = getNumberStripRect(guide);
  setGuideColor(color, state);

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
  if (['ocr', 'candidate'].includes(state)) {
    const progress = (t % 920) / 920;
    const y = guide.y + guide.height * progress;
    ctx.globalAlpha = 0.72;
    ctx.fillStyle = color;
    ctx.fillRect(guide.x + 8, y, guide.width - 16, 3);
  }
  ctx.restore();
}

function processDetectionTick() {
  const now = Date.now();
  const rawDetected = USE_BOX_TRACKING && cvReady ? detectCardRect() : null;
  const detected = rawDetected ? stabilizeDetection(rawDetected, now) : null;
  const canPreviewVisual = !isOcrBusy && now - lastFastVisualTick >= FAST_VISUAL_EVERY_MS;

  if (!detected) {
    latestDetection = null;
    stableFrames = 0;
    stableSince = 0;

    if (isScanLocked()) {
      const heldDetection = smoothedDetection ? cloneDetection(smoothedDetection) : null;
      if (now - lastLockSeenAt > LOCK_LOST_MS) {
        releaseScanLock();
        resetSmoothedDetection();
        drawGuideOcrOverlay('seeking');
        setStatus('seeking', '카드 없음');
        lastOverlayState = 'seeking';
      } else {
        if (heldDetection) drawDetectedOverlay(heldDetection, priceHasValue(priceFor(currentCard)) ? 'complete' : 'noPrice');
        else drawGuideOcrOverlay(priceHasValue(priceFor(currentCard)) ? 'complete' : 'noPrice');
        setStatus(priceHasValue(priceFor(currentCard)) ? 'complete' : 'noPrice', `${currentCard.number} · 검토 중`);
      }
      els.detectStatus.textContent = '락온';
      return;
    }

    resetSmoothedDetection();
    if (!isOcrBusy) {
      const idleState = currentCard ? 'complete' : (lastOverlayState === 'candidate' ? 'candidate' : 'ready');
      const detail = currentCard ? `${currentCard.number} · 카드 대기` : (idleState === 'candidate' ? '후보 확인 중' : '이름/번호 맞추기');
      drawGuideOcrOverlay(idleState);
      els.detectStatus.textContent = '가이드 스캔';
      setStatus(idleState, detail);
      lastOverlayState = idleState;
    }
    if (!currentCard && canPreviewVisual) {
      lastFastVisualTick = now;
      previewVisualCandidates(null, '가이드 이미지 후보');
    }
    if (!currentCard && !isOcrBusy && now >= ocrCooldownUntil) {
      ocrCooldownUntil = now + OCR_COOLDOWN_MS;
      ocrImageFromDetection(null);
    }
    return;
  }

  if (reviewLockedCard(detected, now)) return;

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
    els.detectStatus.textContent = '가이드 스캔';
    const trackingState = lastOverlayState === 'candidate' ? 'candidate' : 'ready';
    setStatus(trackingState, trackingState === 'candidate' ? '후보 확인 중' : '이름/번호 맞추기');
    drawDetectedOverlay(detected, trackingState);
    lastOverlayState = trackingState;
    if (canPreviewVisual) {
      lastFastVisualTick = now;
      previewVisualCandidates(detected, '외곽선 이미지 후보');
    }
    if (now >= ocrCooldownUntil) {
      ocrCooldownUntil = now + OCR_COOLDOWN_MS;
      ocrImageFromDetection(detected);
    }
    return;
  }

  if (isOcrBusy) {
    els.detectStatus.textContent = '분석 중';
    drawDetectedOverlay(detected, 'ocr');
    lastOverlayState = 'ocr';
    return;
  }

  const stableState = ['complete', 'candidate', 'noPrice'].includes(lastOverlayState) ? lastOverlayState : 'ready';
  drawDetectedOverlay(detected, stableState);
  els.detectStatus.textContent = '가이드 스캔';
  if (canPreviewVisual) {
    lastFastVisualTick = now;
    previewVisualCandidates(detected, '안정화 이미지 후보');
  }

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

function insetQuadPoints(points, inset = 0) {
  const ordered = orderQuadPoints(points);
  if (!ordered || inset <= 0) return ordered;
  const center = ordered.reduce((sum, point) => ({
    x: sum.x + point.x / ordered.length,
    y: sum.y + point.y / ordered.length
  }), { x: 0, y: 0 });
  const scale = Math.max(0.68, 1 - inset * 2);
  return ordered.map(point => ({
    x: center.x + (point.x - center.x) * scale,
    y: center.y + (point.y - center.y) * scale
  }));
}

function insetRect(rect, inset = 0) {
  if (!rect) return null;
  const ix = rect.width * inset;
  const iy = rect.height * inset;
  return {
    x: rect.x + ix,
    y: rect.y + iy,
    width: rect.width - ix * 2,
    height: rect.height - iy * 2
  };
}

function captureCardFromQuad(points, inset = 0) {
  if (!cvReady || !points || points.length !== 4) return null;
  const ordered = insetQuadPoints(points, inset);
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
    return warped;
  } catch (err) {
    console.warn('Perspective crop failed:', err);
    return null;
  } finally {
    [src, dst, matrix, srcTri, dstTri].forEach(mat => {
      try { if (mat) mat.delete(); } catch {}
    });
  }
}

function captureCardFromRect(rect, inset = 0.03) {
  if (!rect) return null;
  const canvas = getFrameCanvasFull();
  const vw = canvas.width;
  const vh = canvas.height;
  const inner = insetRect(rect, inset);

  const sx = Math.max(0, Math.round(inner.x));
  const sy = Math.max(0, Math.round(inner.y));
  const sw = Math.min(vw - sx, Math.round(inner.width));
  const sh = Math.min(vh - sy, Math.round(inner.height));
  if (sw < 20 || sh < 20) return null;

  const cardCanvas = document.createElement('canvas');
  cardCanvas.width = sw;
  cardCanvas.height = sh;
  cardCanvas.getContext('2d', { willReadFrequently: true }).drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
  return cardCanvas;
}

function captureCardFromDetection(detection) {
  return captureCardFromQuad(detection?.points) ||
    captureCardFromRect(detection?.rect);
}

function pushFrameVariant(variants, label, canvas) {
  if (!canvas || canvas.width < 20 || canvas.height < 20) return;
  variants.push({ label, canvas });
}

function captureCardFrameVariants(detection, includeGuide = true) {
  const variants = [];
  if (detection?.points?.length === 4 && cvReady) {
    pushFrameVariant(variants, '외곽선 보정', captureCardFromQuad(detection.points, 0));
    pushFrameVariant(variants, '외곽선 안쪽', captureCardFromQuad(detection.points, 0.055));
  }
  if (detection?.rect) {
    pushFrameVariant(variants, '박스 crop', captureCardFromRect(detection.rect, 0.035));
    pushFrameVariant(variants, '탑로더 안쪽', captureCardFromRect(detection.rect, 0.095));
  }
  if (includeGuide) {
    pushFrameVariant(variants, '가이드 crop', captureCardCanvasFromGuide());
  }
  return variants;
}

function selectBestCardFrame(detection, minScore = VISUAL_PREVIEW_SCORE, includeGuide = true) {
  const variants = captureCardFrameVariants(detection, includeGuide);
  if (!variants.length) return null;
  if (!visualIndex.length) {
    return { ...variants[0], candidates: [] };
  }

  let best = null;
  for (const variant of variants) {
    const candidates = scoreVisualCandidates(variant.canvas, minScore);
    const top = candidates[0];
    const sameLockBonus = top?.card?.card_id === lockedCardId ? 5 : 0;
    const marginBonus = Math.min(8, Math.max(0, visualMargin(candidates)));
    const cropBonus = /안쪽/.test(variant.label) ? 1.5 : 0;
    const rank = top ? (top.visualScore || 0) + marginBonus + sameLockBonus + cropBonus : -1;
    if (!best || rank > best.rank) best = { ...variant, candidates, rank };
  }

  return best || { ...variants[0], candidates: [] };
}

function captureNumberFromQuad(points) {
  const cardCanvas = captureCardFromQuad(points);
  return cardCanvas ? cropNumberStrip(cardCanvas) : null;
}

function captureNumberFromRect(rect) {
  const cardCanvas = captureCardFromRect(rect);
  if (!cardCanvas) return null;
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

  const cardRect = centeredCardRect(w, h, 0.82, 0.9);
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
    cardFrame: cardCanvas,
    numberFrame: cropNumberStrip(cardCanvas),
    nameFrame: cropNameStrip(cardCanvas)
  };
}

function captureOcrRegion(detection) {
  return captureNumberFromQuad(detection?.points) ||
    captureNumberFromRect(detection?.rect) ||
    captureNumberFromGuide();
}

function captureOcrRegions(detection) {
  const selectedFrame = selectBestCardFrame(detection, Math.max(18, VISUAL_PREVIEW_SCORE - 6), true);
  if (selectedFrame?.canvas) {
    return {
      cardFrame: selectedFrame.canvas,
      numberFrame: cropNumberStrip(selectedFrame.canvas),
      nameFrame: cropNameStrip(selectedFrame.canvas)
    };
  }

  const guideCardCanvas = captureCardCanvasFromGuide();
  if (guideCardCanvas) {
    return {
      cardFrame: guideCardCanvas,
      numberFrame: cropNumberStrip(guideCardCanvas),
      nameFrame: cropNameStrip(guideCardCanvas)
    };
  }

  const numberFrame = captureNumberFromQuad(detection?.points) || captureNumberFromRect(detection?.rect);
  return {
    cardFrame: null,
    numberFrame,
    nameFrame: null
  };
}

async function ocrPreparedRegions(regions, sourceLabel = '번호 이미지', detection = null, options = {}) {
  if (isOcrBusy) return;
  const hasRegionObject = regions && (
    Object.prototype.hasOwnProperty.call(regions, 'cardFrame') ||
    Object.prototype.hasOwnProperty.call(regions, 'numberFrame') ||
    Object.prototype.hasOwnProperty.call(regions, 'nameFrame')
  );
  const cardFrame = hasRegionObject ? regions.cardFrame || null : null;
  const numberFrame = hasRegionObject ? regions.numberFrame || null : regions;
  const nameFrame = hasRegionObject ? regions.nameFrame || null : null;

  if (!numberFrame && !cardFrame) {
    setStatus('failed', '카드 영역을 자르지 못함');
    if (detection) drawDetectedOverlay(detection, 'failed');
    else drawGuideOcrOverlay('failed');
    lastOverlayState = 'failed';
    return;
  }

  isOcrBusy = true;
  try {
    setStatus('ocr', sourceLabel);
    els.detectStatus.textContent = '분석 중';
    if (detection) drawDetectedOverlay(detection, 'ocr');
    else drawGuideOcrOverlay('ocr');
    lastOverlayState = 'ocr';

    const visualCandidates = scoreVisualCandidates(cardFrame);
    const visualOptions = {
      ...options,
      visualIndexActive: Boolean(visualIndex.length && cardFrame),
      cardFrame
    };
    updateDebugView(cardFrame, visualCandidates, visualCandidates.length ? 'visual 후보' : 'visual 후보 없음');

    if (isClearVisualCandidate(visualCandidates)) {
      consecutiveNumberMisses = 0;
      handleOcrCandidates(visualCandidates, detection, 'visual match', {
        ...visualOptions,
        confirmImmediately: true
      });
      return;
    }

    if (visualCandidates[0]?.score >= VISUAL_CANDIDATE_SCORE) {
      renderCandidateCards(visualCandidates, `이미지 기반 후보 · ${visualCandidates[0].score}점`);
      setStatus('candidate', `${visualCandidates[0].card.number} visual 후보`);
      if (detection) drawDetectedOverlay(detection, 'candidate');
      else drawGuideOcrOverlay('candidate');
      lastOverlayState = 'candidate';
    }

    if (!numberFrame) {
      if (visualCandidates.length) return;
      handleOcrFailure('failed', 'visual 후보 없음', detection, '');
      return;
    }

    const nameTask = startNameMatchOcr(nameFrame);
    const numberText = await runNumberOcr(numberFrame);
    const numberOnlyCandidates = mergeVisualAndOcrCandidates(visualCandidates, scoreOcrCandidates({ numberText }));
    updateDebugView(cardFrame, numberOnlyCandidates, 'visual + 번호 후보');
    const numberTop = numberOnlyCandidates[0];
    if (numberTop?.numberScore >= CLEAR_NUMBER_SCORE && (!visualOptions.visualIndexActive || numberTop.visualScore >= VISUAL_OCR_LOCK_FLOOR)) {
      consecutiveNumberMisses = 0;
      handleOcrCandidates(numberOnlyCandidates, detection, numberText, {
        ...visualOptions,
        confirmImmediately: true
      });
      return;
    }

    let nameText = '';
    if (nameTask) {
      setStatus('ocr', '이름/번호 비교 중');
      const nameResult = await nameTask;
      nameText = nameResult?.text || '';
    }

    const candidates = mergeVisualAndOcrCandidates(visualCandidates, scoreOcrCandidates({ numberText, nameText }));
    updateDebugView(cardFrame, candidates, 'visual + OCR 후보');
    if (candidates.length) {
      consecutiveNumberMisses = 0;
      const rawText = [numberText, nameText].filter(Boolean).join('\n');
      handleOcrCandidates(candidates, detection, rawText, visualOptions);
      return;
    }

    const votedFallback = updateCandidateVotes([]);
    if (votedFallback[0]?.score >= CANDIDATE_SCORE) {
      renderCandidateCards(votedFallback, `반사/흔들림 보정 후보 · ${votedFallback[0].score}점`);
      setStatus('candidate', `${votedFallback[0].card.number} 후보 유지`);
      if (detection) drawDetectedOverlay(detection, 'candidate');
      else drawGuideOcrOverlay('candidate');
      lastOverlayState = 'candidate';
      return;
    }

    consecutiveNumberMisses += 1;
    const parsed = parseCardNumber(numberText, { strict: true });
    handleOcrFailure(parsed ? 'missing' : 'failed', parsed ? parsed.number : '후보 없음', detection, numberText);
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
  if (isScanLocked()) {
    setStatus(priceHasValue(priceFor(currentCard)) ? 'complete' : 'noPrice', `${currentCard.number} · 검토 중`);
    return;
  }
  console.log('OCR miss:', statusKey, detail, rawText);
  ocrCandidateId = null;
  ocrCandidateCount = 0;
  hideCandidates();
  setStatus(statusKey, statusKey === 'missing' ? detail : '직접 검색');
  if (detection) drawDetectedOverlay(detection, statusKey);
  else drawGuideOcrOverlay(statusKey);
  lastOverlayState = statusKey;
}

function handleOcrCandidates(candidates, detection, rawText, options = {}) {
  if (isScanLocked()) {
    setStatus(priceHasValue(priceFor(currentCard)) ? 'complete' : 'noPrice', `${currentCard.number} · 검토 중`);
    return;
  }
  const voted = updateCandidateVotes(candidates);
  const display = voted.length ? voted : candidates.slice(0, 3);
  const top = display[0];
  if (!top || (top.score < CANDIDATE_SCORE && top.nameScore < 18 && top.numberScore < 45 && top.visualScore < VISUAL_CANDIDATE_SCORE)) {
    handleOcrFailure('failed', '후보 없음', detection, rawText);
    return;
  }

  const clearNumber = top.numberScore >= CLEAR_NUMBER_SCORE;
  const clearVisual = top.visualScore >= VISUAL_DIRECT_SCORE && visualMargin(display) >= VISUAL_MARGIN_LOCK;
  const stableVote = top.votes >= 2 && top.score >= 58;
  const visualGate = options.visualIndexActive && top.visualScore < VISUAL_OCR_LOCK_FLOOR && !clearVisual;
  const highConfidence = !visualGate && (top.score >= DIRECT_SCORE || clearNumber || clearVisual || stableVote);

  if (highConfidence) {
    hideCandidates();
    handleDetectedCard(top.card, detection, rawText, {
      ...options,
      confirmImmediately: options.confirmImmediately || clearNumber || stableVote,
      lockVisualScore: top.visualScore || 0,
      lockMargin: visualMargin(display)
    });
    return;
  }

  ocrCandidateId = top.card.card_id;
  ocrCandidateCount = Math.max(ocrCandidateCount, top.votes || 1);
  renderCandidateCards(display, `이 카드일 가능성이 높음 · ${top.score}점`);
  setStatus('candidate', `${top.card.number} 후보`);
  if (detection) drawDetectedOverlay(detection, 'candidate');
  else drawGuideOcrOverlay('candidate');
  lastOverlayState = 'candidate';
  console.log('OCR candidates:', display.map(item => `${item.card.card_id}:${item.score}`).join(', '), rawText);
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
    if (detection) drawDetectedOverlay(detection, 'candidate');
    else drawGuideOcrOverlay('candidate');
    lastOverlayState = 'candidate';
    console.log('OCR candidate:', card.card_id, rawText);
    return;
  }

  const thumbCanvas = options.cardFrame || captureCardFromDetection(detection);
  confirmCard(card, 'scan', thumbCanvas);
  lockScan(card, {
    visualScore: options.lockVisualScore || 0,
    margin: options.lockMargin || 0,
    cardFrame: thumbCanvas
  });
  clearCandidateVotes();
  if (detection) drawDetectedOverlay(detection, priceHasValue(priceFor(card)) ? 'complete' : 'noPrice');
  else drawGuideOcrOverlay(priceHasValue(priceFor(card)) ? 'complete' : 'noPrice');
  lastOverlayState = priceHasValue(priceFor(card)) ? 'complete' : 'noPrice';
  if (navigator.vibrate) navigator.vibrate(45);
  console.log('Detected:', card.card_id, rawText);
}

function confirmCard(card, source = 'scan', thumbCanvas = null) {
  rememberScanThumbnail(card, thumbCanvas);
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
  releaseScanLock();
  stableFrames = 0;
  stableSince = 0;
  els.detectStatus.textContent = cvReady ? '외곽선 준비' : '대기';
  setStatus('seeking');
  collapseSheet();
}

function resetScan() {
  currentCard = null;
  ocrCandidateId = null;
  ocrCandidateCount = 0;
  releaseScanLock();
  clearCandidateVotes();
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
    expandSheet();
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

function debugSamples() {
  return readJson(debugStorageKey, []);
}

function setDebugSamples(items) {
  const trimmed = items.slice(0, DEBUG_SAMPLE_LIMIT);
  try {
    localStorage.setItem(debugStorageKey, JSON.stringify(trimmed));
  } catch (err) {
    console.warn('debug sample storage failed, saving metadata only:', err);
    const metadataOnly = trimmed.slice(0, 6).map(item => ({ ...item, crop_image: '' }));
    localStorage.setItem(debugStorageKey, JSON.stringify(metadataOnly));
  }
  renderDebugSamples();
}

function debugCropDataUrl() {
  try {
    if (!els.debugCrop) return '';
    return els.debugCrop.toDataURL('image/jpeg', 0.74);
  } catch {
    return '';
  }
}

function buildDebugSample(reason = 'manual') {
  const fallbackSnapshot = {
    captured_at: new Date().toISOString(),
    label: '수동 저장',
    selected_set: `${selectedSet.language}|${selectedSet.set_code}`,
    current_card_id: currentCard?.card_id || null,
    current_card_number: currentCard?.number || null,
    locked_card_id: lockedCardId || null,
    scan_status: els.scanStatus?.textContent || '',
    mode_status: els.detectStatus?.textContent || '',
    visual_margin: 0,
    candidates: []
  };
  return {
    ...(lastDebugSnapshot || fallbackSnapshot),
    saved_at: new Date().toISOString(),
    reason,
    user_agent: navigator.userAgent,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio || 1
    },
    crop_image: debugCropDataUrl()
  };
}

function saveCurrentDebugSample() {
  const sample = buildDebugSample('manual');
  if (!sample.crop_image && !sample.candidates.length) {
    setStatus('failed', '저장할 진단 없음');
    return;
  }
  const items = debugSamples();
  items.unshift(sample);
  setDebugSamples(items);
  setStatus('complete', `진단 저장됨 ${Math.min(items.length, DEBUG_SAMPLE_LIMIT)}개`);
}

function downloadDebugSamples() {
  const samples = debugSamples();
  if (!samples.length) {
    setStatus('failed', '저장된 진단 없음');
    return;
  }

  const payload = {
    exported_at: new Date().toISOString(),
    app: 'UXRP_Scanner',
    set: selectedSet,
    samples
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `m1s-scan-debug-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 800);
  setStatus('complete', '진단 다운로드');
}

function clearDebugSamples() {
  localStorage.removeItem(debugStorageKey);
  renderDebugSamples();
  setStatus('ready', '진단 비움');
}

function renderDebugSamples() {
  if (!els.debugSamples) return;
  const samples = debugSamples();
  els.debugSamples.innerHTML = '';
  if (!samples.length) {
    els.debugSamples.textContent = '저장된 진단 없음';
    return;
  }

  const title = document.createElement('div');
  title.className = 'debug-sample-title';
  title.textContent = `저장된 진단 ${samples.length}/${DEBUG_SAMPLE_LIMIT}`;
  els.debugSamples.appendChild(title);

  for (const sample of samples.slice(0, 4)) {
    const top = sample.candidates?.[0];
    const row = document.createElement('div');
    row.className = 'debug-sample-row';
    const time = new Date(sample.saved_at || sample.captured_at).toLocaleString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit'
    });
    row.textContent = top
      ? `${time} · ${sample.label} · 1위 ${top.number} ${top.name_jp} · visual ${top.visualScore}`
      : `${time} · ${sample.label} · 후보 없음`;
    els.debugSamples.appendChild(row);
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
    expandSheet();
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

function initBottomSheet() {
  if (!els.bottomSheet || !els.sheetGrip) return;
  let startY = 0;
  let lastY = 0;
  let isDragging = false;
  let suppressClick = false;

  const nextOnTap = () => {
    const state = currentSheetState();
    if (state === 'collapsed') setSheetState('peek');
    else if (state === 'peek') setSheetState('expanded');
    else setSheetState('peek');
  };

  els.sheetGrip.addEventListener('click', () => {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    nextOnTap();
  });

  els.sheetGrip.addEventListener('pointerdown', event => {
    isDragging = true;
    startY = event.clientY;
    lastY = event.clientY;
    els.bottomSheet.classList.add('is-dragging');
    els.sheetGrip.setPointerCapture?.(event.pointerId);
  });

  els.sheetGrip.addEventListener('pointermove', event => {
    if (!isDragging) return;
    lastY = event.clientY;
  });

  const finishDrag = () => {
    if (!isDragging) return;
    isDragging = false;
    els.bottomSheet.classList.remove('is-dragging');
    const delta = lastY - startY;
    if (Math.abs(delta) < 34) return;

    suppressClick = true;
    if (delta < 0) {
      setSheetState(currentSheetState() === 'collapsed' ? 'peek' : 'expanded');
    } else {
      setSheetState(currentSheetState() === 'expanded' ? 'peek' : 'collapsed');
    }
  };

  els.sheetGrip.addEventListener('pointerup', finishDrag);
  els.sheetGrip.addEventListener('pointercancel', finishDrag);
}

function init() {
  waitForCv();
  initSetPicker();
  initBottomSheet();
  renderEmpty('seeking');
  renderRecentScans();
  renderCollection();
  renderDebugSamples();

  els.searchInput.addEventListener('input', e => renderSearch(e.target.value));
  document.querySelectorAll('[data-quick]').forEach(btn => btn.addEventListener('click', () => {
    els.searchPanel?.classList.remove('is-collapsed');
    expandSheet();
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
    const open = !els.searchPanel.classList.contains('is-collapsed');
    els.toggleSearch.setAttribute('aria-expanded', String(open));
    if (open) {
      expandSheet();
      els.searchInput.focus();
    }
  });
  els.marketBtn.addEventListener('click', () => {
    els.marketPanel.classList.toggle('is-collapsed');
    const open = !els.marketPanel.classList.contains('is-collapsed');
    els.marketBtn.setAttribute('aria-expanded', String(open));
    if (open) expandSheet();
  });
  els.addCollection.addEventListener('click', addCurrentToCollection);
  els.clearCollection.addEventListener('click', () => setCollection([]));
  els.saveDebugSample?.addEventListener('click', saveCurrentDebugSample);
  els.downloadDebugSamples?.addEventListener('click', downloadDebugSamples);
  els.clearDebugSamples?.addEventListener('click', clearDebugSamples);
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
