/* Lock-on scanner boot: card box first, OCR only after stable card tracking. */
(async function bootScanner() {
  const PATCH_VERSION = 'scanner-lock-on-v2';

  function replaceFunction(source, name, replacement) {
    const start = source.indexOf(`function ${name}(`);
    if (start < 0) throw new Error(`${name} not found`);
    const braceStart = source.indexOf('{', start);
    let depth = 0;
    let quote = '';
    let escaped = false;
    let lineComment = false;
    let blockComment = false;

    for (let i = braceStart; i < source.length; i += 1) {
      const ch = source[i];
      const next = source[i + 1];
      if (lineComment) { if (ch === '\n') lineComment = false; continue; }
      if (blockComment) { if (ch === '*' && next === '/') { blockComment = false; i += 1; } continue; }
      if (quote) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === quote) quote = '';
        continue;
      }
      if (ch === '/' && next === '/') { lineComment = true; i += 1; continue; }
      if (ch === '/' && next === '*') { blockComment = true; i += 1; continue; }
      if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
      if (ch === '{') depth += 1;
      if (ch === '}') {
        depth -= 1;
        if (depth === 0) return `${source.slice(0, start)}${replacement}${source.slice(i + 1)}`;
      }
    }
    throw new Error(`${name} replacement failed`);
  }

  const cardCropHelpers = String.raw`
function captureCardCanvasFromRect(rect) {
  if (!rect) return null;
  const canvas = getFrameCanvasFull();
  const padX = rect.width * 0.015;
  const padY = rect.height * 0.015;
  const sx = Math.max(0, Math.round(rect.x + padX));
  const sy = Math.max(0, Math.round(rect.y + padY));
  const sw = Math.min(canvas.width - sx, Math.round(rect.width - padX * 2));
  const sh = Math.min(canvas.height - sy, Math.round(rect.height - padY * 2));
  if (sw < 40 || sh < 60) return null;

  const cardCanvas = document.createElement('canvas');
  cardCanvas.width = sw;
  cardCanvas.height = sh;
  cardCanvas.getContext('2d', { willReadFrequently: true }).drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
  return cardCanvas;
}
`;

  try {
    let source = await fetch(`./app.js?${PATCH_VERSION}`, { cache: 'no-store' }).then(response => {
      if (!response.ok) throw new Error(`app.js load failed: ${response.status}`);
      return response.text();
    });

    source = source
      .replace('const DETECT_EVERY_MS = 420;', 'const DETECT_EVERY_MS = 180;')
      .replace('const STABLE_FRAME_COUNT = 3;', 'const STABLE_FRAME_COUNT = 4;')
      .replace('const STABLE_MS = 550;', 'const STABLE_MS = 650;')
      .replace('const OCR_COOLDOWN_MS = 1700;', 'const OCR_COOLDOWN_MS = 1400;')
      .replace('const USE_BOX_TRACKING = false;', 'const USE_BOX_TRACKING = true;')
      .replace("ready: 'OCR 대기'", "ready: '카드 고정 중'")
      .replace('let ocrVotes = [];', 'let ocrVotes = [];\nlet noCardSince = 0;');

    source = source.replace('function captureNumberFromQuad(points) {', `${cardCropHelpers}\nfunction captureNumberFromQuad(points) {`);

    source = replaceFunction(source, 'waitForCv', String.raw`function waitForCv() {
  cvReady = true;
  if (els.detectStatus) els.detectStatus.textContent = 'BOX READY';
}`);

    source = replaceFunction(source, 'detectCardRect', String.raw`function detectCardRect() {
  if (!stream || !els.video.videoWidth) return null;
  try {
    const frame = getFrameCanvasFull();
    const sampleW = 96;
    const sampleH = Math.max(54, Math.round(frame.height * sampleW / Math.max(1, frame.width)));
    const sample = document.createElement('canvas');
    sample.width = sampleW;
    sample.height = sampleH;
    const sctx = sample.getContext('2d', { willReadFrequently: true });
    sctx.imageSmoothingEnabled = true;
    sctx.drawImage(frame, 0, 0, sampleW, sampleH);
    const data = sctx.getImageData(0, 0, sampleW, sampleH).data;
    let minX = sampleW, minY = sampleH, maxX = 0, maxY = 0, active = 0;

    const grayAt = (x, y) => {
      const i = (y * sampleW + x) * 4;
      return data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    };

    for (let y = 1; y < sampleH - 1; y += 1) {
      for (let x = 1; x < sampleW - 1; x += 1) {
        const i = (y * sampleW + x) * 4;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const sat = max ? (max - min) / max : 0;
        const gx = Math.abs(grayAt(x + 1, y) - grayAt(x - 1, y));
        const gy = Math.abs(grayAt(x, y + 1) - grayAt(x, y - 1));
        if (gx + gy > 30 || sat > 0.24) {
          active += 1;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (!active) return null;
    const sx = frame.width / sampleW;
    const sy = frame.height / sampleH;
    const rect = {
      x: Math.max(0, Math.round((minX - 1) * sx)),
      y: Math.max(0, Math.round((minY - 1) * sy)),
      width: Math.min(frame.width, Math.round((maxX - minX + 3) * sx)),
      height: Math.min(frame.height, Math.round((maxY - minY + 3) * sy))
    };

    const areaRatio = (rect.width * rect.height) / Math.max(1, frame.width * frame.height);
    const ratio = Math.min(rect.width, rect.height) / Math.max(rect.width, rect.height);
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    const centerDelta = Math.hypot(cx - frame.width / 2, cy - frame.height / 2) / Math.hypot(frame.width, frame.height);
    const density = active / (sampleW * sampleH);

    if (areaRatio < 0.08 || areaRatio > 0.86) return null;
    if (ratio < 0.42 || ratio > 0.92) return null;
    if (centerDelta > 0.33) return null;
    if (density < 0.025) return null;

    return { rect, points: null, score: areaRatio * 1000 + density * 100, area: rect.width * rect.height, edgeDensity: density };
  } catch (err) {
    console.warn('JS card detection failed:', err);
    return null;
  }
}`);

    source = replaceFunction(source, 'captureOcrRegions', String.raw`function captureOcrRegions(detection) {
  const cardCanvas = captureCardCanvasFromRect(detection?.rect);
  if (cardCanvas) {
    return {
      cardFrame: cardCanvas,
      numberFrame: cropNumberStrip(cardCanvas),
      nameFrame: cropNameStrip(cardCanvas)
    };
  }

  // No detected card box = no live OCR against empty guide pixels.
  if (!detection) {
    return { cardFrame: null, numberFrame: null, nameFrame: null };
  }

  return { cardFrame: null, numberFrame: null, nameFrame: null };
}`);

    source = replaceFunction(source, 'processDetectionTick', String.raw`function processDetectionTick() {
  const now = Date.now();
  const detected = USE_BOX_TRACKING && cvReady ? detectCardRect() : null;

  if (!detected) {
    latestDetection = null;
    lastDetection = null;
    stableFrames = 0;
    stableSince = 0;
    ocrCooldownUntil = Math.max(ocrCooldownUntil, now + 450);
    if (!noCardSince) noCardSince = now;

    if (!isOcrBusy) {
      hideCandidates();
      drawGuideOcrOverlay(currentCard ? 'complete' : 'seeking');
      els.detectStatus.textContent = 'BOX SEARCH';
      setStatus(currentCard ? 'complete' : 'seeking', currentCard ? currentCard.number : '카드를 먼저 잡는 중');
      lastOverlayState = currentCard ? 'complete' : 'seeking';
    }
    return;
  }

  noCardSince = 0;
  latestDetection = detected;
  const similar = detectionSimilarity(detected, lastDetection);
  if (similar) stableFrames += 1;
  else {
    stableFrames = 1;
    stableSince = now;
    if (!currentCard) clearCandidateVotes();
  }
  lastDetection = detected;

  const stableMs = stableSince ? now - stableSince : 0;
  const isStable = stableFrames >= STABLE_FRAME_COUNT && stableMs >= STABLE_MS;

  if (!isStable) {
    ocrCooldownUntil = Math.max(ocrCooldownUntil, now + 250);
    els.detectStatus.textContent = 'BOX LOCK';
    setStatus('stabilizing', Math.min(stableFrames, STABLE_FRAME_COUNT) + '/' + STABLE_FRAME_COUNT + ' 프레임');
    drawDetectedOverlay(detected, 'stabilizing');
    lastOverlayState = 'stabilizing';
    return;
  }

  if (isOcrBusy) {
    els.detectStatus.textContent = 'OCR';
    drawDetectedOverlay(detected, 'ocr');
    lastOverlayState = 'ocr';
    return;
  }

  els.detectStatus.textContent = 'BOX LOCKED';
  drawDetectedOverlay(detected, lastOverlayState === 'complete' ? 'complete' : 'ready');
  setStatus('ready', '카드 고정됨 · 스캔 준비');
  lastOverlayState = lastOverlayState === 'complete' ? 'complete' : 'ready';

  if (now >= ocrCooldownUntil) {
    ocrCooldownUntil = now + OCR_COOLDOWN_MS;
    ocrImageFromDetection(detected);
  }
}`);

    source = source.replace(
      "window.addEventListener('DOMContentLoaded', init);",
      "if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', init); else init();"
    );

    const script = document.createElement('script');
    script.text = `${source}\n//# sourceURL=app.js?${PATCH_VERSION}`;
    document.head.appendChild(script);
  } catch (err) {
    console.error('scanner boot failed:', err);
    const status = document.getElementById('scanStatus');
    if (status) status.textContent = `스캐너 로딩 실패 · ${err.message || err}`;
  }
})();
