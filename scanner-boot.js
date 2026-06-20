/* Runtime scanner patch.
   Keeps app.js as the source of truth but enables card-box tracking first:
   no live OCR until a card-shaped box is detected and stable. */
(async function bootScanner() {
  const PATCH_VERSION = 'scanner-lock-on-flow-v1';

  function replaceFunction(source, name, replacement) {
    const needle = `function ${name}(`;
    const start = source.indexOf(needle);
    if (start < 0) throw new Error(`${name}() not found in app.js`);

    const braceStart = source.indexOf('{', start);
    if (braceStart < 0) throw new Error(`${name}() body not found in app.js`);

    let depth = 0;
    let inString = '';
    let escaped = false;
    let inLineComment = false;
    let inBlockComment = false;

    for (let i = braceStart; i < source.length; i += 1) {
      const ch = source[i];
      const next = source[i + 1];

      if (inLineComment) {
        if (ch === '\n') inLineComment = false;
        continue;
      }
      if (inBlockComment) {
        if (ch === '*' && next === '/') {
          inBlockComment = false;
          i += 1;
        }
        continue;
      }
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === '\\') {
          escaped = true;
        } else if (ch === inString) {
          inString = '';
        }
        continue;
      }

      if (ch === '/' && next === '/') {
        inLineComment = true;
        i += 1;
        continue;
      }
      if (ch === '/' && next === '*') {
        inBlockComment = true;
        i += 1;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') {
        inString = ch;
        continue;
      }
      if (ch === '{') depth += 1;
      if (ch === '}') {
        depth -= 1;
        if (depth === 0) return `${source.slice(0, start)}${replacement}${source.slice(i + 1)}`;
      }
    }
    throw new Error(`${name}() closing brace not found in app.js`);
  }

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
      .replace('ready: \'OCR 대기\'', 'ready: \'카드 고정 중\'');

    source = source.replace(
      'let ocrVotes = [];',
      `let ocrVotes = [];
let noCardSince = 0;`
    );

    const captureHelpers = String.raw`
function captureCardCanvasFromQuad(points) {
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
    return warped;
  } catch (err) {
    console.warn('Perspective card crop failed:', err);
    return null;
  } finally {
    [src, dst, matrix, srcTri, dstTri].forEach(mat => {
      try { if (mat) mat.delete(); } catch {}
    });
  }
}

function captureCardCanvasFromRect(rect) {
  if (!rect) return null;
  const canvas = getFrameCanvasFull();
  const vw = canvas.width;
  const vh = canvas.height;
  const padX = rect.width * 0.015;
  const padY = rect.height * 0.015;
  const sx = Math.max(0, Math.round(rect.x + padX));
  const sy = Math.max(0, Math.round(rect.y + padY));
  const sw = Math.min(vw - sx, Math.round(rect.width - padX * 2));
  const sh = Math.min(vh - sy, Math.round(rect.height - padY * 2));
  if (sw < 40 || sh < 60) return null;

  const cardCanvas = document.createElement('canvas');
  cardCanvas.width = sw;
  cardCanvas.height = sh;
  cardCanvas.getContext('2d', { willReadFrequently: true }).drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
  return cardCanvas;
}

function captureCardCanvasFromDetection(detection) {
  return captureCardCanvasFromQuad(detection?.points) || captureCardCanvasFromRect(detection?.rect);
}
`;

    source = source.replace('function captureNumberFromQuad(points) {', `${captureHelpers}\nfunction captureNumberFromQuad(points) {`);

    source = replaceFunction(source, 'captureOcrRegions', String.raw`function captureOcrRegions(detection) {
  const detectedCardCanvas = captureCardCanvasFromDetection(detection);
  if (detectedCardCanvas) {
    return {
      cardFrame: detectedCardCanvas,
      numberFrame: cropNumberStrip(detectedCardCanvas),
      nameFrame: cropNameStrip(detectedCardCanvas)
    };
  }

  // Live scanning should not OCR empty guide-frame pixels.
  // No detected card box = no live OCR.
  if (!detection) {
    return {
      cardFrame: null,
      numberFrame: null,
      nameFrame: null
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

  return {
    cardFrame: null,
    numberFrame: null,
    nameFrame: null
  };
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
      els.detectStatus.textContent = cvReady ? 'BOX SEARCH' : 'BOX CDN 대기';
      setStatus(currentCard ? 'complete' : 'seeking', currentCard ? currentCard.number : '카드를 먼저 잡는 중');
      lastOverlayState = currentCard ? 'complete' : 'seeking';
    }
    return;
  }

  noCardSince = 0;
  latestDetection = detected;
  const similar = detectionSimilarity(detected, lastDetection);
  if (similar) {
    stableFrames += 1;
  } else {
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
