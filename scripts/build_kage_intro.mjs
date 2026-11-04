import fs from 'fs';
import path from 'path';
import { execFileSync, spawn } from 'child_process';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'public/assets');
const TMP_DIR = path.join(ROOT, '.cache_intro_build');
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(TMP_DIR, { recursive: true });

const W = 1920;
const H = 1080;
const FPS = 30;
const DURATION_SEC = 10.6;
const TOTAL_FRAMES = Math.round(FPS * DURATION_SEC); // 318 frames

// Brand palette (#09080B primary background, #C0263D blood red, #6D28D9 deep violet, golden lightning)
const BG_R = 9;
const BG_G = 8;
const BG_B = 11;

/**
 * Decode any image file to raw RGBA buffer via ffmpeg.
 */
function decodeImageToRgba(filePath, targetW = null, targetH = null) {
  const probe = execFileSync('ffprobe', [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height',
    '-of', 'csv=p=0',
    filePath,
  ])
    .toString()
    .trim()
    .split(',');
  const srcW = Number(probe[0]);
  const srcH = Number(probe[1]);
  const outW = targetW || srcW;
  const outH = targetH || srcH;

  const args = ['-v', 'error', '-i', filePath];
  if (targetW && targetH) {
    args.push('-vf', `scale=${outW}:${outH}:flags=lanczos`);
  }
  args.push('-f', 'rawvideo', '-pix_fmt', 'rgba', '-');

  const buf = execFileSync('ffmpeg', args, { maxBuffer: 64 * 1024 * 1024 });
  return { width: outW, height: outH, data: new Uint8Array(buf) };
}

/**
 * Render an SVG string at 1920x1080 RGBA using ffmpeg's librsvg decoder.
 */
function renderSvgToRgba(svgContent, nameHint) {
  const svgPath = path.join(TMP_DIR, `${nameHint}.svg`);
  fs.writeFileSync(svgPath, svgContent, 'utf8');
  const buf = execFileSync(
    'ffmpeg',
    [
      '-v', 'error',
      '-width', String(W),
      '-height', String(H),
      '-c:v', 'librsvg',
      '-i', svgPath,
      '-f', 'rawvideo',
      '-pix_fmt', 'rgba',
      '-',
    ],
    { maxBuffer: 64 * 1024 * 1024 }
  );
  return { width: W, height: H, data: new Uint8Array(buf) };
}

/**
 * Extract clean RGBA anime character sprite from pure-black (#000000) isolated artwork:
 * 1. Connected-component flood fill from all 4 outer image borders where luminance is near-black
 *    (preserves 100% of Zenitsu's dark corps uniform inside his closed lineart silhouette!).
 * 2. Also removes any enclosed pure-pitch-black background pockets (maxRGB <= 8, area >= 35px)
 *    between legs/haori while keeping warm dark-brown uniform (~RGB 30..48) completely solid.
 * 3. Smoothly feathers silhouette edge & preserves warm golden lightning/aura glow.
 * 4. Crops tightly to non-empty bounding box so placement & scaling are exact.
 */
function extractCleanCharacterSprite(filePath, options = {}) {
  const { width, height, data } = decodeImageToRgba(filePath);
  const totalPx = width * height;
  const exterior = new Uint8Array(totalPx); // 1 = exterior black background
  const queue = new Int32Array(totalPx);
  let qHead = 0;
  let qTail = 0;

  const bgThreshold = options.bgThreshold ?? 22;

  const canFlood = (idx) => {
    const o = idx * 4;
    const r = data[o];
    const g = data[o + 1];
    const b = data[o + 2];
    const maxC = r > g ? (r > b ? r : b) : g > b ? g : b;
    // Allow flood fill through near-black pixels, but stop at warm golden glow or lineart
    if (maxC <= bgThreshold) return true;
    // Slight JPEG dark ringing outside character where color is neutral grey-black
    const minC = r < g ? (r < b ? r : b) : g < b ? g : b;
    if (maxC <= 30 && maxC - minC <= 8) return true;
    return false;
  };

  const pushSeed = (x, y) => {
    const idx = y * width + x;
    if (!exterior[idx] && canFlood(idx)) {
      exterior[idx] = 1;
      queue[qTail++] = idx;
    }
  };

  for (let x = 0; x < width; x++) {
    pushSeed(x, 0);
    pushSeed(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    pushSeed(0, y);
    pushSeed(width - 1, y);
  }

  while (qHead < qTail) {
    const curr = queue[qHead++];
    const cx = curr % width;
    const cy = (curr / width) | 0;
    if (cx > 0) {
      const n = curr - 1;
      if (!exterior[n] && canFlood(n)) {
        exterior[n] = 1;
        queue[qTail++] = n;
      }
    }
    if (cx + 1 < width) {
      const n = curr + 1;
      if (!exterior[n] && canFlood(n)) {
        exterior[n] = 1;
        queue[qTail++] = n;
      }
    }
    if (cy > 0) {
      const n = curr - width;
      if (!exterior[n] && canFlood(n)) {
        exterior[n] = 1;
        queue[qTail++] = n;
      }
    }
    if (cy + 1 < height) {
      const n = curr + width;
      if (!exterior[n] && canFlood(n)) {
        exterior[n] = 1;
        queue[qTail++] = n;
      }
    }
  }

  // Pass 2: detect enclosed pure pitch-black background holes (e.g. gap between legs and lightning arc)
  const visitedHole = new Uint8Array(totalPx);
  const compBuf = new Int32Array(totalPx);
  for (let i = 0; i < totalPx; i++) {
    if (exterior[i] || visitedHole[i]) continue;
    const o = i * 4;
    const maxC = Math.max(data[o], data[o + 1], data[o + 2]);
    if (maxC > 9) continue;

    let cHead = 0;
    let cTail = 0;
    visitedHole[i] = 1;
    compBuf[cTail++] = i;
    while (cHead < cTail) {
      const curr = compBuf[cHead++];
      const cx = curr % width;
      const cy = (curr / width) | 0;
      const neighbors = [];
      if (cx > 0) neighbors.push(curr - 1);
      if (cx + 1 < width) neighbors.push(curr + 1);
      if (cy > 0) neighbors.push(curr - width);
      if (cy + 1 < height) neighbors.push(curr + width);
      for (const n of neighbors) {
        if (exterior[n] || visitedHole[n]) continue;
        const no = n * 4;
        const nm = Math.max(data[no], data[no + 1], data[no + 2]);
        if (nm <= 9) {
          visitedHole[n] = 1;
          compBuf[cTail++] = n;
        }
      }
    }
    if (cTail >= 45) {
      for (let k = 0; k < cTail; k++) {
        exterior[compBuf[k]] = 1;
      }
    }
  }

  // Pass 3: compute anti-aliased alpha & de-fringe dark boundary halo
  const alphas = new Uint8Array(totalPx);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (exterior[idx]) {
        alphas[idx] = 0;
        continue;
      }
      // Check if within 2px of exterior background
      let minDist = 3;
      for (let dy = -2; dy <= 2; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -2; dx <= 2; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          if (exterior[ny * width + nx]) {
            const d = Math.abs(dx) + Math.abs(dy);
            if (d < minDist) minDist = d;
          }
        }
      }

      const o = idx * 4;
      const r = data[o];
      const g = data[o + 1];
      const b = data[o + 2];
      const maxC = Math.max(r, g, b);

      if (minDist === 1) {
        // Immediate silhouette edge pixel: smooth anti-aliased ramp
        const isWarmGlow = r > b + 18 && maxC > 35;
        if (isWarmGlow) {
          alphas[idx] = Math.min(255, Math.max(0, Math.round((maxC - 16) * 2.4)));
        } else {
          alphas[idx] = Math.min(230, Math.max(0, Math.round((maxC - 14) * 5.2)));
        }
      } else if (minDist === 2 && maxC < 52) {
        const isWarmGlow = r > b + 15;
        alphas[idx] = isWarmGlow
          ? Math.min(255, Math.round(maxC * 3.6))
          : Math.min(255, Math.round(130 + maxC * 2.4));
      } else {
        // Also convert faint outer golden aura haze softly so no dark box surrounds aura
        if (options.softOuterAura && maxC < 38 && r > b + 8) {
          alphas[idx] = Math.min(255, Math.round(maxC * 5.5));
        } else {
          alphas[idx] = 255;
        }
      }

      // Optional neutral-dark background knockout for wide action frames where lightning touches borders
      if (options.removeDarkNeutralBg && alphas[idx] > 0) {
        const minC = Math.min(r, g, b);
        const sat = maxC - minC;
        const normDx = (x - width * 0.5) / (width * 0.23);
        const normDy = (y - height * 0.52) / (height * 0.36);
        const outsideCore = normDx * normDx + normDy * normDy > 1.0;
        if (outsideCore && sat <= 10 && maxC < 44) {
          const neutralFade = clamp((maxC - 20) / 24, 0, 1);
          alphas[idx] = Math.round(alphas[idx] * neutralFade * neutralFade);
        }
      }

      // Optional smooth cosine/Hermite border feathering so wide lightning bolts never end in a rectangular cut
      if (options.featherBorderX || options.featherBorderY) {
        const bx = options.featherBorderX || 0;
        const by = options.featherBorderY || 0;
        const fx = bx > 0 ? clamp(Math.min(x, width - 1 - x) / bx, 0, 1) : 1;
        const fy = by > 0 ? clamp(Math.min(y, height - 1 - y) / by, 0, 1) : 1;
        const smoothX = fx * fx * (3 - 2 * fx);
        const smoothY = fy * fy * (3 - 2 * fy);
        alphas[idx] = Math.round(alphas[idx] * smoothX * smoothY);
      }
    }
  }

  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const a = alphas[idx];
      data[idx * 4 + 3] = a;
      if (a > 12) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX <= minX || maxY <= minY) {
    return { width, height, data };
  }

  const pad = 4;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(width - 1, maxX + pad);
  maxY = Math.min(height - 1, maxY + pad);

  const cropW = maxX - minX + 1;
  const cropH = maxY - minY + 1;
  const cropped = new Uint8Array(cropW * cropH * 4);
  for (let y = 0; y < cropH; y++) {
    const srcStart = ((minY + y) * width + minX) * 4;
    const dstStart = y * cropW * 4;
    cropped.set(data.subarray(srcStart, srcStart + cropW * 4), dstStart);
  }

  return { width: cropW, height: cropH, data: cropped };
}

/**
 * Build the crisp 1920x1080 KAGE monumental flared-serif SVG wordmark + blood-red underline + subtitle.
 * Geometry matches the classic Roman/Cinzel flared serif KAGE logo with exact known K coordinates:
 * - Wordmark centered around (960, 495)
 * - Letter K top crown sits at y = 388, x = 445..545 (perfect perch seat for Zenitsu!)
 * - Blood-red (#C0263D) underline at y = 638
 * - THE ANIME UNIVERSE wide-tracked uppercase subtitle at y = 694
 */
function buildKageWordmarkLayers() {
  // Layer 1: Monumental K A G E letters matching the uploaded KAGE logo geometry (pure SVG 1.1 for librsvg)
  const kagePaths = `
    <path d="M 432 386 L 520 386 L 520 476 L 604 386 L 668 386 L 568 488 L 670 598 L 600 598 L 520 510 L 520 598 L 450 598 L 464 578 L 464 418 Z"/>
    <path fill-rule="evenodd" d="M 802 390 L 858 390 L 934 598 L 880 598 L 863 550 L 797 550 L 780 598 L 726 598 Z M 830 434 L 806 510 L 854 510 Z"/>
    <path d="M 1198 432 L 1154 454 C 1140 434 1120 426 1098 426 C 1060 426 1042 454 1042 493 C 1042 533 1062 560 1102 560 C 1126 560 1146 553 1158 542 L 1158 524 L 1108 524 L 1108 484 L 1208 484 L 1208 566 C 1182 590 1144 602 1098 602 C 1030 602 988 558 988 493 C 988 428 1032 384 1100 384 C 1142 384 1176 400 1198 432 Z"/>
    <path d="M 1280 390 L 1472 390 L 1472 434 L 1332 434 L 1332 471 L 1452 471 L 1452 515 L 1332 515 L 1332 554 L 1476 554 L 1476 598 L 1280 598 Z"/>
  `;

  const wordmarkSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="kageWhite" x1="0" y1="384" x2="0" y2="602" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="65%" stop-color="#F7F5F9"/>
      <stop offset="100%" stop-color="#E4DFEA"/>
    </linearGradient>
    <filter id="shadowBlur" x="-15%" y="-25%" width="130%" height="160%">
      <feGaussianBlur stdDeviation="9"/>
    </filter>
  </defs>
  <g transform="translate(0, 8)" fill="#040307" opacity="0.88" filter="url(#shadowBlur)">
    ${kagePaths}
  </g>
  <g fill="url(#kageWhite)" stroke="#231D29" stroke-width="3.5" stroke-linejoin="round">
    ${kagePaths}
  </g>
</svg>`;

  // Layer 2: Blood-red (#C0263D) architectural underline + THE ANIME UNIVERSE subtitle
  const subtitleSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="crimsonLine" x1="460" y1="0" x2="1460" y2="0" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#C0263D" stop-opacity="0"/>
      <stop offset="14%" stop-color="#C0263D" stop-opacity="0.92"/>
      <stop offset="50%" stop-color="#EA334E" stop-opacity="1"/>
      <stop offset="86%" stop-color="#C0263D" stop-opacity="0.92"/>
      <stop offset="100%" stop-color="#C0263D" stop-opacity="0"/>
    </linearGradient>
    <filter id="crimsonGlow" x="-20%" y="-300%" width="140%" height="700%">
      <feGaussianBlur stdDeviation="6" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  <g filter="url(#crimsonGlow)">
    <rect x="470" y="635" width="980" height="4.5" rx="2.25" fill="url(#crimsonLine)"/>
  </g>
  <text x="960" y="692"
        text-anchor="middle"
        font-family="Liberation Sans, DejaVu Sans, sans-serif"
        font-size="25"
        font-weight="700"
        letter-spacing="15"
        fill="#ECE7F0">THE ANIME UNIVERSE</text>
</svg>`;

  return {
    wordmark: renderSvgToRgba(wordmarkSvg, 'kage_wordmark'),
    subtitle: renderSvgToRgba(subtitleSvg, 'kage_subtitle'),
  };
}

// Math & Easing helpers
function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function easeOutCubic(t) {
  const c = clamp(t, 0, 1);
  return 1 - Math.pow(1 - c, 3);
}
function easeInOutCubic(t) {
  const c = clamp(t, 0, 1);
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}
function easeInQuad(t) {
  const c = clamp(t, 0, 1);
  return c * c;
}
function easeOutBack(t) {
  const c = clamp(t, 0, 1);
  const c1 = 1.45;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(c - 1, 3) + c1 * Math.pow(c - 1, 2);
}

// Deterministic pseudo-random generator for reproducible crisp lightning & sparks
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fill 1920x1080 RGBA frame buffer with #09080B + subtle volumetric glow.
 */
function clearFrameWithAtmosphere(frame, glows) {
  // Fast baseline fill
  const len = W * H * 4;
  for (let i = 0; i < len; i += 4) {
    frame[i] = BG_R;
    frame[i + 1] = BG_G;
    frame[i + 2] = BG_B;
    frame[i + 3] = 255;
  }

  if (!glows || glows.length === 0) return;

  // Render smooth radial atmospheric glows on a 4x coarse grid + bilinear-free per-row math
  for (const g of glows) {
    if (g.intensity <= 0.004) continue;
    const rad = g.radius;
    const radSq = rad * rad;
    const x0 = Math.max(0, Math.floor(g.cx - rad));
    const x1 = Math.min(W - 1, Math.ceil(g.cx + rad));
    const y0 = Math.max(0, Math.floor(g.cy - rad));
    const y1 = Math.min(H - 1, Math.ceil(g.cy + rad));
    const peakR = g.r * g.intensity;
    const peakG = g.g * g.intensity;
    const peakB = g.b * g.intensity;

    for (let y = y0; y <= y1; y++) {
      const dy = (y - g.cy) * (g.aspectY || 1);
      const dySq = dy * dy;
      if (dySq >= radSq) continue;
      let rowIdx = (y * W + x0) * 4;
      for (let x = x0; x <= x1; x++) {
        const dx = x - g.cx;
        const dSq = dx * dx + dySq;
        if (dSq < radSq) {
          const falloff = 1 - dSq / radSq;
          const w = falloff * falloff;
          const nr = frame[rowIdx] + peakR * w;
          const ng = frame[rowIdx + 1] + peakG * w;
          const nb = frame[rowIdx + 2] + peakB * w;
          frame[rowIdx] = nr > 255 ? 255 : nr;
          frame[rowIdx + 1] = ng > 255 ? 255 : ng;
          frame[rowIdx + 2] = nb > 255 ? 255 : nb;
        }
        rowIdx += 4;
      }
    }
  }
}

/**
 * Bilinearly sample and alpha-composite (or additive-composite) an RGBA sprite onto the 1920x1080 frame.
 * anchorX in [0..1], anchorY in [0..1] specify which point of the sprite maps to (destX, destY).
 */
function blitSpriteBilinear(frame, sprite, opts) {
  const {
    destX,
    destY,
    heightPx,
    anchorX = 0.5,
    anchorY = 0.5,
    opacity = 1,
    additive = false,
    tintGold = 0,
    flipX = false,
  } = opts;
  if (opacity <= 0.005 || heightPx < 2) return;

  const scale = heightPx / sprite.height;
  const drawW = sprite.width * scale;
  const drawH = heightPx;

  const left = destX - drawW * anchorX;
  const top = destY - drawH * anchorY;

  const xStart = Math.max(0, Math.floor(left));
  const yStart = Math.max(0, Math.floor(top));
  const xEnd = Math.min(W - 1, Math.ceil(left + drawW));
  const yEnd = Math.min(H - 1, Math.ceil(top + drawH));

  const invScale = 1 / scale;
  const sw = sprite.width;
  const sh = sprite.height;
  const sdata = sprite.data;

  for (let y = yStart; y <= yEnd; y++) {
    const sy = (y - top) * invScale;
    if (sy < 0 || sy >= sh - 1) continue;
    const sy0 = sy | 0;
    const fy = sy - sy0;
    const ify = 1 - fy;

    for (let x = xStart; x <= xEnd; x++) {
      let sx = (x - left) * invScale;
      if (flipX) sx = sw - 1 - sx;
      if (sx < 0 || sx >= sw - 1) continue;
      const sx0 = sx | 0;
      const fx = sx - sx0;
      const ifx = 1 - fx;

      const w00 = ifx * ify;
      const w10 = fx * ify;
      const w01 = ifx * fy;
      const w11 = fx * fy;

      const i00 = (sy0 * sw + sx0) * 4;
      const i10 = i00 + 4;
      const i01 = i00 + sw * 4;
      const i11 = i01 + 4;

      const sa =
        (sdata[i00 + 3] * w00 +
          sdata[i10 + 3] * w10 +
          sdata[i01 + 3] * w01 +
          sdata[i11 + 3] * w11) *
        opacity;
      if (sa < 1) continue;

      let sr =
        sdata[i00] * w00 + sdata[i10] * w10 + sdata[i01] * w01 + sdata[i11] * w11;
      let sg =
        sdata[i00 + 1] * w00 +
        sdata[i10 + 1] * w10 +
        sdata[i01 + 1] * w01 +
        sdata[i11 + 1] * w11;
      let sb =
        sdata[i00 + 2] * w00 +
        sdata[i10 + 2] * w10 +
        sdata[i01 + 2] * w01 +
        sdata[i11 + 2] * w11;

      if (tintGold > 0) {
        sr = lerp(sr, 255, tintGold);
        sg = lerp(sg, 224, tintGold);
        sb = lerp(sb, 95, tintGold);
      }

      const di = (y * W + x) * 4;
      const alphaNorm = sa / 255;

      if (additive) {
        frame[di] = Math.min(255, frame[di] + sr * alphaNorm);
        frame[di + 1] = Math.min(255, frame[di + 1] + sg * alphaNorm);
        frame[di + 2] = Math.min(255, frame[di + 2] + sb * alphaNorm);
      } else {
        const invA = 1 - alphaNorm;
        frame[di] = sr * alphaNorm + frame[di] * invA;
        frame[di + 1] = sg * alphaNorm + frame[di + 1] * invA;
        frame[di + 2] = sb * alphaNorm + frame[di + 2] * invA;
      }
    }
  }
}

/**
 * Composite a full-screen 1920x1080 RGBA layer with optional horizontal reveal clip and scale.
 */
function compositeFullscreenLayer(frame, layer, opts = {}) {
  const { opacity = 1, revealHalfWidth = W, sheenProgress = -1 } = opts;
  if (opacity <= 0.005) return;
  const ldata = layer.data;
  const cx = W / 2;

  const sheenCenterX = sheenProgress >= 0 && sheenProgress <= 1 ? lerp(360, 1560, sheenProgress) : -9999;

  for (let y = 340; y < 745; y++) {
    for (let x = 380; x < 1540; x++) {
      const distFromCenter = Math.abs(x - cx);
      if (distFromCenter > revealHalfWidth) continue;
      let edgeFade = 1;
      if (revealHalfWidth < 700 && revealHalfWidth - distFromCenter < 48) {
        edgeFade = (revealHalfWidth - distFromCenter) / 48;
      }

      const idx = (y * W + x) * 4;
      const la = ldata[idx + 3] * opacity * edgeFade;
      if (la < 1) continue;

      let lr = ldata[idx];
      let lg = ldata[idx + 1];
      let lb = ldata[idx + 2];

      if (sheenCenterX > 0) {
        const skewX = x + (y - 495) * 0.38;
        const dSheen = Math.abs(skewX - sheenCenterX);
        if (dSheen < 85) {
          const boost = (1 - dSheen / 85) * 0.55;
          lr = Math.min(255, lr + 80 * boost);
          lg = Math.min(255, lg + 68 * boost);
          lb = Math.min(255, lb + 42 * boost);
        }
      }

      const a = la / 255;
      const invA = 1 - a;
      frame[idx] = lr * a + frame[idx] * invA;
      frame[idx + 1] = lg * a + frame[idx + 1] * invA;
      frame[idx + 2] = lb * a + frame[idx + 2] * invA;
    }
  }
}

/**
 * Draw an anti-aliased glowing line segment (used for Thunder Breathing lightning bolts & speed lines).
 */
function drawGlowSegment(frame, x0, y0, x1, y1, coreThickness, glowThickness, r, g, b, intensity) {
  if (intensity <= 0.01) return;
  const pad = Math.ceil(glowThickness + 2);
  const minX = Math.max(0, Math.floor(Math.min(x0, x1) - pad));
  const maxX = Math.min(W - 1, Math.ceil(Math.max(x0, x1) + pad));
  const minY = Math.max(0, Math.floor(Math.min(y0, y1) - pad));
  const maxY = Math.min(H - 1, Math.ceil(Math.max(y0, y1) + pad));

  const dx = x1 - x0;
  const dy = y1 - y0;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 0.01) return;

  const glowSq = glowThickness * glowThickness;
  const coreSq = coreThickness * coreThickness;

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const t = clamp(((x - x0) * dx + (y - y0) * dy) / lenSq, 0, 1);
      const px = x0 + t * dx;
      const py = y0 + t * dy;
      const distSq = (x - px) * (x - px) + (y - py) * (y - py);
      if (distSq >= glowSq) continue;

      const idx = (y * W + x) * 4;
      if (distSq <= coreSq) {
        // White-hot lightning core
        const cw = (1 - distSq / Math.max(0.5, coreSq)) * intensity;
        frame[idx] = Math.min(255, frame[idx] + (255 * cw + r * 0.35 * cw));
        frame[idx + 1] = Math.min(255, frame[idx + 1] + (252 * cw + g * 0.25 * cw));
        frame[idx + 2] = Math.min(255, frame[idx + 2] + (225 * cw));
      } else {
        const gw = Math.pow(1 - distSq / glowSq, 1.85) * intensity;
        frame[idx] = Math.min(255, frame[idx] + r * gw);
        frame[idx + 1] = Math.min(255, frame[idx + 1] + g * gw);
        frame[idx + 2] = Math.min(255, frame[idx + 2] + b * gw);
      }
    }
  }
}

/**
 * Recursively generate and draw jagged anime Thunder Breathing lightning bolt with branches.
 */
function drawLightningBolt(frame, x0, y0, x1, y1, opts = {}) {
  const {
    seed = 1,
    segments = 12,
    jitter = 46,
    coreWidth = 2.6,
    glowWidth = 15,
    intensity = 1,
    branches = 2,
    r = 250,
    g = 204,
    b = 21,
  } = opts;
  const rand = mulberry32(seed);
  const pts = [{ x: x0, y: y0 }];
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;

  for (let i = 1; i < segments; i++) {
    const t = i / segments;
    const env = Math.sin(Math.PI * t);
    const offset = (rand() * 2 - 1) * jitter * env;
    pts.push({
      x: x0 + dx * t + nx * offset,
      y: y0 + dy * t + ny * offset,
    });
  }
  pts.push({ x: x1, y: y1 });

  for (let i = 0; i < pts.length - 1; i++) {
    drawGlowSegment(
      frame,
      pts[i].x,
      pts[i].y,
      pts[i + 1].x,
      pts[i + 1].y,
      coreWidth,
      glowWidth,
      r,
      g,
      b,
      intensity
    );
  }

  for (let br = 0; br < branches; br++) {
    const startIdx = Math.max(1, Math.min(pts.length - 3, Math.floor(rand() * (pts.length - 2))));
    const origin = pts[startIdx];
    const angle = Math.atan2(dy, dx) + (rand() > 0.5 ? 1 : -1) * (0.35 + rand() * 0.55);
    const brLen = len * (0.22 + rand() * 0.25);
    drawLightningBolt(
      frame,
      origin.x,
      origin.y,
      origin.x + Math.cos(angle) * brLen,
      origin.y + Math.sin(angle) * brLen,
      {
        seed: seed * 31 + br + 7,
        segments: Math.max(4, Math.floor(segments * 0.55)),
        jitter: jitter * 0.55,
        coreWidth: coreWidth * 0.62,
        glowWidth: glowWidth * 0.6,
        intensity: intensity * 0.78,
        branches: 0,
        r,
        g,
        b,
      }
    );
  }
}

/**
 * Draw radial anime action speed lines around the periphery during high-speed forward sprint.
 */
function drawAnimeSpeedLines(frame, seed, intensity) {
  if (intensity <= 0.01) return;
  const rand = mulberry32(seed);
  const cx = 960;
  const cy = 510;
  const count = 42;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + (rand() - 0.5) * 0.11;
    const innerR = 390 + rand() * 240;
    const outerR = 980 + rand() * 240;
    const x0 = cx + Math.cos(angle) * innerR;
    const y0 = cy + Math.sin(angle) * innerR * 0.68;
    const x1 = cx + Math.cos(angle) * outerR;
    const y1 = cy + Math.sin(angle) * outerR * 0.68;
    const isGold = i % 3 === 0;
    drawGlowSegment(
      frame,
      x0,
      y0,
      x1,
      y1,
      isGold ? 1.3 : 0.9,
      isGold ? 5.5 : 3.2,
      isGold ? 250 : 220,
      isGold ? 204 : 215,
      isGold ? 35 : 235,
      intensity * (0.35 + rand() * 0.5)
    );
  }
}

/**
 * Draw expanding circular golden/crimson shockwave ring during Beat 4 explosion.
 */
function drawShockwaveRing(frame, cx, cy, radius, thickness, r, g, b, intensity) {
  if (intensity <= 0.01 || radius <= 2) return;
  const outer = radius + thickness;
  const inner = Math.max(0, radius - thickness);
  const outerSq = outer * outer;
  const innerSq = inner * inner;
  const x0 = Math.max(0, Math.floor(cx - outer));
  const x1 = Math.min(W - 1, Math.ceil(cx + outer));
  const y0 = Math.max(0, Math.floor(cy - outer * 0.72));
  const y1 = Math.min(H - 1, Math.ceil(cy + outer * 0.72));

  for (let y = y0; y <= y1; y++) {
    const dy = (y - cy) / 0.72;
    const dySq = dy * dy;
    if (dySq >= outerSq) continue;
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      const dSq = dx * dx + dySq;
      if (dSq >= innerSq && dSq <= outerSq) {
        const d = Math.sqrt(dSq);
        const w = (1 - Math.abs(d - radius) / thickness) * intensity;
        const idx = (y * W + x) * 4;
        frame[idx] = Math.min(255, frame[idx] + r * w);
        frame[idx + 1] = Math.min(255, frame[idx + 1] + g * w);
        frame[idx + 2] = Math.min(255, frame[idx + 2] + b * w);
      }
    }
  }
}

/**
 * Draw subtle floating golden & blood-crimson anime particles.
 */
function drawAmbientSparks(frame, timeSec, intensity = 1) {
  if (intensity <= 0.01) return;
  const rand = mulberry32(9001);
  for (let i = 0; i < 34; i++) {
    const baseX = 220 + rand() * 1480;
    const baseY = 180 + rand() * 720;
    const speedY = 22 + rand() * 38;
    const phase = rand() * 10;
    const x = baseX + Math.sin(timeSec * 1.8 + phase) * 24;
    const y = ((baseY - timeSec * speedY) % 760 + 760) % 760 + 150;
    const pulse = (0.45 + 0.55 * Math.sin(timeSec * 4.2 + phase)) * intensity;
    const isGold = i % 3 !== 0;
    drawGlowSegment(
      frame,
      x,
      y,
      x + (isGold ? 2.5 : 1.5),
      y - (isGold ? 4.5 : 2.5),
      1.2,
      5.2,
      isGold ? 250 : 192,
      isGold ? 204 : 38,
      isGold ? 32 : 61,
      pulse * 0.65
    );
  }
}

/**
 * Synthesize a 48kHz stereo 16-bit WAV anime cinematic soundtrack synchronized to all 10 beats.
 */
function generateIntroAudioWav(wavPath) {
  const sampleRate = 48000;
  const totalSamples = Math.floor(sampleRate * DURATION_SEC);
  const left = new Float32Array(totalSamples);
  const right = new Float32Array(totalSamples);

  // Deterministic filtered noise table
  const rand = mulberry32(424242);
  const noiseLen = sampleRate * 2;
  const whiteNoise = new Float32Array(noiseLen);
  for (let i = 0; i < noiseLen; i++) {
    whiteNoise[i] = rand() * 2 - 1;
  }

  const addTone = (startSec, durSec, fStart, fEnd, amp, pan = 0, wave = 'sine') => {
    const s0 = Math.max(0, Math.floor(startSec * sampleRate));
    const s1 = Math.min(totalSamples, Math.floor((startSec + durSec) * sampleRate));
    const gainL = amp * Math.cos(((pan + 1) * Math.PI) / 4);
    const gainR = amp * Math.sin(((pan + 1) * Math.PI) / 4);
    let phase = 0;
    for (let s = s0; s < s1; s++) {
      const u = (s - s0) / Math.max(1, s1 - s0);
      const freq = fStart * Math.pow(fEnd / fStart, u);
      phase += (2 * Math.PI * freq) / sampleRate;
      const env = Math.sin(Math.min(1, u * 12) * (Math.PI / 2)) * Math.pow(1 - u, 1.45);
      let val = 0;
      if (wave === 'sine') val = Math.sin(phase);
      else if (wave === 'triangle') val = (2 / Math.PI) * Math.asin(Math.sin(phase));
      else val = Math.sin(phase) * 0.7 + Math.sin(phase * 2) * 0.2 + Math.sin(phase * 3) * 0.1;
      left[s] += val * env * gainL;
      right[s] += val * env * gainR;
    }
  };

  const addNoiseBurst = (startSec, durSec, amp, lpAlpha = 0.18, pan = 0, attackPow = 0.25, decayPow = 1.8) => {
    const s0 = Math.max(0, Math.floor(startSec * sampleRate));
    const s1 = Math.min(totalSamples, Math.floor((startSec + durSec) * sampleRate));
    const gainL = amp * Math.cos(((pan + 1) * Math.PI) / 4);
    const gainR = amp * Math.sin(((pan + 1) * Math.PI) / 4);
    let filt = 0;
    for (let s = s0; s < s1; s++) {
      const u = (s - s0) / Math.max(1, s1 - s0);
      const raw = whiteNoise[s % noiseLen];
      filt = filt + lpAlpha * (raw - filt);
      const env = Math.pow(Math.min(1, u / Math.max(0.01, attackPow)), 0.7) * Math.pow(1 - u, decayPow);
      left[s] += filt * env * gainL;
      right[s] += filt * env * gainR;
    }
  };

  // Beat 1 (0.00 - 1.05s): Deep atmospheric drone + electric spark appearance
  addTone(0.02, 2.3, 46.25, 55.0, 0.22, 0, 'rich');
  addTone(0.08, 0.35, 1480, 620, 0.12, -0.1, 'triangle');
  addNoiseBurst(0.08, 0.28, 0.16, 0.55, 0.1, 0.05, 2.2);

  // Beat 2 (1.05 - 2.35s): Rapid anime sprint footsteps + wind rush toward camera
  const stepTimes = [1.12, 1.32, 1.50, 1.67, 1.83, 1.98, 2.13];
  stepTimes.forEach((st, idx) => {
    const p = (idx % 2 === 0 ? -0.22 : 0.22) * (1 - idx * 0.08);
    const vol = 0.14 + idx * 0.022;
    addTone(st, 0.09, 145, 52, vol, p, 'sine');
    addNoiseBurst(st, 0.07, vol * 0.85, 0.35, p, 0.04, 2.5);
  });
  addNoiseBurst(1.05, 1.3, 0.22, 0.14, 0, 0.45, 1.1);

  // Beat 3 (2.35 - 3.70s): Thunder Breathing preparation, katana unsheathe & electric charge
  addTone(2.38, 0.42, 2850, 1340, 0.19, 0.12, 'sine'); // Katana metallic glint
  addTone(2.38, 0.32, 4280, 2120, 0.11, -0.12, 'triangle');
  // Rising electric charge sweep
  addTone(2.42, 1.25, 82.4, 329.6, 0.24, 0, 'rich');
  for (let k = 0; k < 9; k++) {
    addNoiseBurst(2.48 + k * 0.12, 0.09, 0.14 + k * 0.015, 0.72, (k % 2 ? 0.35 : -0.35), 0.05, 2.4);
  }
  // 3.18s: Supersonic Thunderclap slash dash!
  addNoiseBurst(3.16, 0.52, 0.42, 0.62, 0.2, 0.04, 1.6);
  addTone(3.18, 0.45, 1960, 280, 0.25, 0, 'triangle');

  // Beat 4 (3.70 - 4.70s): Massive Golden Lightning Attack Explosion!
  addTone(3.70, 1.15, 125, 29.1, 0.58, 0, 'sine'); // Sub-bass thunder drop
  addTone(3.70, 0.75, 220, 48, 0.34, 0, 'rich');
  addNoiseBurst(3.70, 1.25, 0.56, 0.42, -0.12, 0.02, 1.75); // Thunderclap crack
  addNoiseBurst(3.74, 1.45, 0.44, 0.12, 0.15, 0.08, 1.45); // Rolling low thunder rumble

  // Beat 5 (4.70 - 5.75s): Monumental KAGE Logo Reveal chord (D minor / dark sovereign harmony)
  const kageChord = [73.42, 110.0, 146.83, 220.0, 293.66, 349.23];
  kageChord.forEach((hz, i) => {
    addTone(4.72 + i * 0.03, 3.2, hz, hz * 0.999, i === 0 ? 0.26 : 0.11, (i - 2.5) * 0.12, i < 2 ? 'rich' : 'sine');
  });
  addTone(4.85, 0.95, 880, 1760, 0.08, 0, 'sine'); // Crystalline shimmer

  // Beat 6 (5.75 - 6.65s): Zenitsu shrinks down with nimble golden static shimmer
  addTone(5.82, 0.55, 1174.66, 587.33, 0.12, -0.35, 'triangle');
  addNoiseBurst(5.85, 0.35, 0.12, 0.65, -0.35, 0.08, 2.2);

  // Beat 7 (6.65 - 7.55s): Miniature Zenitsu sprints briskly toward letter K
  const miniSteps = [6.70, 6.84, 6.98, 7.12, 7.26, 7.40];
  miniSteps.forEach((st, idx) => {
    const pan = lerp(-0.48, -0.24, idx / miniSteps.length);
    addTone(st, 0.055, 310, 140, 0.11, pan, 'sine');
    addNoiseBurst(st, 0.045, 0.09, 0.5, pan, 0.05, 2.6);
  });

  // Beat 8 (7.55 - 8.50s): Jumps & climbs onto the K
  addTone(7.56, 0.36, 260, 780, 0.15, -0.25, 'sine'); // Jump whoosh
  addNoiseBurst(7.56, 0.32, 0.16, 0.45, -0.25, 0.06, 2.0);
  addTone(8.02, 0.14, 920, 520, 0.11, -0.22, 'triangle'); // Climb vault tap on K

  // Beat 9 (8.50 - 9.25s): Sits perched on top of the K
  addTone(8.52, 0.22, 190, 78, 0.16, -0.22, 'sine'); // Soft confident perch landing
  addTone(8.55, 0.65, 1046.5, 1567.98, 0.09, -0.2, 'sine'); // Sparkle lock-in

  // Beat 10 (9.25 - 10.60s): Final complete KAGE logo resonance resolving cleanly to silence
  const finalChord = [73.42, 146.83, 220.0, 293.66, 440.0];
  finalChord.forEach((hz, i) => {
    addTone(9.18, 1.35, hz, hz, i === 0 ? 0.22 : 0.085, (i - 2) * 0.1, 'sine');
  });

  // Soft limiter + clean fade-out in final 180ms
  const fadeSamples = Math.floor(0.18 * sampleRate);
  const pcm = Buffer.alloc(44 + totalSamples * 4);
  pcm.write('RIFF', 0);
  pcm.writeUInt32LE(36 + totalSamples * 4, 4);
  pcm.write('WAVE', 8);
  pcm.write('fmt ', 12);
  pcm.writeUInt32LE(16, 16);
  pcm.writeUInt16LE(1, 20); // PCM
  pcm.writeUInt16LE(2, 22); // Stereo
  pcm.writeUInt32LE(sampleRate, 24);
  pcm.writeUInt32LE(sampleRate * 4, 28);
  pcm.writeUInt16LE(4, 32);
  pcm.writeUInt16LE(16, 34);
  pcm.write('data', 36);
  pcm.writeUInt32LE(totalSamples * 4, 40);

  for (let i = 0; i < totalSamples; i++) {
    let fade = 1;
    if (i > totalSamples - fadeSamples) {
      fade = (totalSamples - i) / fadeSamples;
    }
    const l = Math.tanh(left[i] * fade * 1.15);
    const r = Math.tanh(right[i] * fade * 1.15);
    pcm.writeInt16LE(Math.round(l * 32760), 44 + i * 4);
    pcm.writeInt16LE(Math.round(r * 32760), 44 + i * 4 + 2);
  }

  fs.writeFileSync(wavPath, pcm);
}

/**
 * Save a single 1920x1080 RGBA frame buffer to PNG or JPG via ffmpeg.
 */
function saveFrameImage(frame, outPath) {
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-v', 'error',
      '-f', 'rawvideo',
      '-pix_fmt', 'rgba',
      '-s', `${W}x${H}`,
      '-i', '-',
      '-frames:v', '1',
      ...(outPath.endsWith('.jpg') ? ['-q:v', '2'] : []),
      outPath,
    ],
    { input: Buffer.from(frame.buffer, frame.byteOffset, frame.byteLength) }
  );
}

async function main() {
  console.log('1/5 Extracting clean anti-aliased RGBA character poses...');
  const poseAppear = extractCleanCharacterSprite(
    path.join(ROOT, 'src/assets/images/zenitsu_pose_appear_1793790590607.jpg'),
    { softOuterAura: true }
  );
  const poseRunForward = extractCleanCharacterSprite(
    path.join(ROOT, 'src/assets/images/zenitsu_pose_run_forward_1793790592381.jpg')
  );
  const poseThunderStance = extractCleanCharacterSprite(
    path.join(ROOT, 'src/assets/images/kage_intro_thunder_swordsman_1792973563393.jpg'),
    {
      bgThreshold: 22,
      removeDarkNeutralBg: true,
      featherBorderX: 96,
      featherBorderY: 64,
    }
  );
  const poseRunSide = extractCleanCharacterSprite(
    path.join(ROOT, 'src/assets/images/zenitsu_pose_run_side_1793790594681.jpg')
  );
  const poseJumpClimb = extractCleanCharacterSprite(
    path.join(ROOT, 'src/assets/images/zenitsu_pose_jump_climb_1793790597608.jpg')
  );
  const poseSitPerch = extractCleanCharacterSprite(
    path.join(ROOT, 'src/assets/images/zenitsu_pose_sit_perch_1793790597794.jpg')
  );

  console.log('2/5 Rendering 1920x1080 KAGE flared-serif wordmark & crimson subtitle layers...');
  const { wordmark, subtitle } = buildKageWordmarkLayers();

  console.log('3/5 Synthesizing 48kHz stereo anime intro soundtrack...');
  const wavPath = path.join(TMP_DIR, 'kage_intro_audio.wav');
  generateIntroAudioWav(wavPath);

  const mp4Path = path.join(OUT_DIR, 'kage-intro.mp4');
  const webmPath = path.join(OUT_DIR, 'kage-intro.webm');
  const posterPath = path.join(OUT_DIR, 'kage-intro-poster.jpg');
  const finalHdPngPath = path.join(OUT_DIR, 'kage-intro-final-hd.png');

  console.log('4/5 Rendering 318 Full HD (1920x1080 @ 30fps) frames across all 10 exact beats...');

  // Spawn FFmpeg H.264 MP4 encoder streaming raw RGBA frames directly from memory
  const mp4Proc = spawn(
    'ffmpeg',
    [
      '-y',
      '-v', 'error',
      '-f', 'rawvideo',
      '-pix_fmt', 'rgba',
      '-s', `${W}x${H}`,
      '-r', String(FPS),
      '-i', '-',
      '-i', wavPath,
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-crf', '19',
      '-pix_fmt', 'yuv420p',
      '-profile:v', 'high',
      '-level', '4.1',
      '-movflags', '+faststart',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-ar', '48000',
      '-shortest',
      mp4Path,
    ],
    { stdio: ['pipe', 'inherit', 'inherit'] }
  );

  const frame = new Uint8Array(W * H * 4);

  // Perch coordinates on top of the letter K:
  // K upper horizontal crown sits at y = 386, spanning x = 432..520
  // Placing Zenitsu seated at destX = 490, hip anchorY = 0.63 at destY = 390 seats him flush atop the K!
  const K_PERCH_X = 490;
  const K_PERCH_Y = 390;
  const K_FINAL_ZENITSU_H = 192;

  for (let f = 0; f < TOTAL_FRAMES; f++) {
    const t = f / FPS;

    // Camera shake during Thunder Breathing explosion (3.70s - 4.45s)
    let shakeX = 0;
    let shakeY = 0;
    if (t >= 3.70 && t <= 4.48) {
      const decay = 1 - (t - 3.70) / 0.78;
      shakeX = Math.sin(f * 2.9) * 18 * decay * decay;
      shakeY = Math.cos(f * 3.7) * 12 * decay * decay;
    }

    // Dynamic #09080B + Crimson (#C0263D) + Violet (#6D28D9) + Golden Thunder atmospheric lighting
    const glows = [
      {
        cx: 960 + shakeX,
        cy: 520 + shakeY,
        radius: 680,
        r: 109,
        g: 40,
        b: 217,
        intensity: t < 4.5 ? 0.14 : 0.11,
        aspectY: 1.25,
      },
      {
        cx: 960 + shakeX,
        cy: 565 + shakeY,
        radius: 540,
        r: 192,
        g: 38,
        b: 61,
        intensity: t >= 4.5 ? 0.18 : 0.10,
        aspectY: 1.35,
      },
    ];

    if (t >= 2.35 && t <= 5.2) {
      const goldEnv =
        t < 3.7
          ? easeInQuad((t - 2.35) / 1.35) * 0.42
          : Math.max(0, 1 - (t - 3.7) / 1.5) * 0.75;
      glows.push({
        cx: 960 + shakeX,
        cy: 515 + shakeY,
        radius: 780,
        r: 250,
        g: 195,
        b: 28,
        intensity: goldEnv,
        aspectY: 1.15,
      });
    }

    clearFrameWithAtmosphere(frame, glows);
    drawAmbientSparks(frame, t, t < 0.25 ? t / 0.25 : 0.9);

    // =========================================================================
    // BEAT 1 (0.00s – 1.05s): ZENITSU APPEARS FIRST
    // =========================================================================
    if (t < 1.05) {
      const u = t / 1.05;
      const appearOpacity = clamp(u / 0.28, 0, 1);
      const scaleH = lerp(475, 535, easeOutCubic(u));

      // Subtle opening golden static arcs welcoming Zenitsu
      if (u > 0.06 && u < 0.65) {
        drawLightningBolt(frame, 835, 360, 1085, 675, {
          seed: 100 + f,
          segments: 9,
          jitter: 32,
          coreWidth: 1.8,
          glowWidth: 10,
          intensity: (1 - Math.abs(u - 0.32) / 0.35) * 0.75,
          branches: 1,
        });
      }

      blitSpriteBilinear(frame, poseAppear, {
        destX: 960,
        destY: 548,
        heightPx: scaleH,
        anchorX: 0.5,
        anchorY: 0.5,
        opacity: appearOpacity,
        tintGold: Math.max(0, 0.35 - u * 0.9),
      });
    }

    // =========================================================================
    // BEAT 2 (1.05s – 2.35s): HE RUNS TOWARD THE CAMERA
    // =========================================================================
    else if (t < 2.35) {
      const u = (t - 1.05) / 1.30;
      const runZoom = lerp(490, 865, easeInQuad(u));
      const strideBob = Math.abs(Math.sin(u * Math.PI * 6.5)) * -26;
      const swayX = Math.sin(u * Math.PI * 6.5) * 14;

      drawAnimeSpeedLines(frame, 300 + f, lerp(0.35, 0.95, u));

      // Golden speed afterimage behind sprinting Zenitsu
      blitSpriteBilinear(frame, poseRunForward, {
        destX: 960 - swayX * 0.6,
        destY: 552 + strideBob * 0.5,
        heightPx: runZoom * 0.91,
        anchorX: 0.5,
        anchorY: 0.5,
        opacity: 0.24,
        additive: true,
        tintGold: 0.65,
      });

      blitSpriteBilinear(frame, poseRunForward, {
        destX: 960 + swayX,
        destY: 555 + strideBob,
        heightPx: runZoom,
        anchorX: 0.5,
        anchorY: 0.5,
        opacity: 1,
      });

      // Trailing lightning sparks from sprint
      drawLightningBolt(frame, 680, 690, 930 + swayX, 580 + strideBob, {
        seed: 500 + f,
        segments: 8,
        jitter: 26,
        coreWidth: 1.7,
        glowWidth: 9,
        intensity: 0.65,
        branches: 1,
      });
      drawLightningBolt(frame, 1240, 680, 990 + swayX, 575 + strideBob, {
        seed: 600 + f,
        segments: 8,
        jitter: 26,
        coreWidth: 1.7,
        glowWidth: 9,
        intensity: 0.65,
        branches: 1,
      });
    }

    // =========================================================================
    // BEAT 3 (2.35s – 3.70s): HE PREPARES AND PERFORMS THUNDER BREATHING
    // =========================================================================
    else if (t < 3.70) {
      const u = (t - 2.35) / 1.35;
      const isStrikeDash = u > 0.64; // 0..0.64 = crouch & charge; 0.64..1.0 = Thunderclap strike!
      const stanceH = isStrikeDash
        ? lerp(690, 820, (u - 0.64) / 0.36)
        : lerp(650, 690, easeOutCubic(u / 0.64));
      const dashX = isStrikeDash ? lerp(950, 1140, easeInQuad((u - 0.64) / 0.36)) : 950;

      if (isStrikeDash) {
        drawAnimeSpeedLines(frame, 800 + f, 1.0);
        // Golden dash trail afterimage
        blitSpriteBilinear(frame, poseThunderStance, {
          destX: dashX - 150,
          destY: 545,
          heightPx: stanceH * 0.94,
          anchorX: 0.5,
          anchorY: 0.5,
          opacity: 0.38,
          additive: true,
          tintGold: 0.8,
        });
      }

      blitSpriteBilinear(frame, poseThunderStance, {
        destX: dashX,
        destY: 545,
        heightPx: stanceH,
        anchorX: 0.5,
        anchorY: 0.5,
        opacity: 1,
        tintGold: isStrikeDash ? 0.22 : 0,
      });

      // Spiraling golden Thunder Breathing arcs intensifying around his katana & body
      const boltCount = isStrikeDash ? 6 : 3 + Math.floor(u * 4);
      for (let b = 0; b < boltCount; b++) {
        const ang = (b / boltCount) * Math.PI * 2 + t * 5.2;
        const r0 = 70 + (b % 2) * 45;
        const r1 = 360 + u * 260;
        drawLightningBolt(
          frame,
          dashX + Math.cos(ang) * r0,
          555 + Math.sin(ang) * r0 * 0.6,
          dashX + Math.cos(ang + 0.55) * r1,
          545 + Math.sin(ang + 0.55) * r1 * 0.65,
          {
            seed: 1200 + f * 13 + b,
            segments: 10,
            jitter: 38,
            coreWidth: isStrikeDash ? 3.0 : 2.1,
            glowWidth: isStrikeDash ? 18 : 12,
            intensity: lerp(0.55, 1.0, u),
            branches: 2,
          }
        );
      }

      // Razor-sharp diagonal Thunderclap katana slash across the 16:9 canvas during strike!
      if (isStrikeDash) {
        const su = (u - 0.64) / 0.36;
        const sx1 = lerp(220, 1740, easeOutCubic(su));
        const sy1 = lerp(820, 250, easeOutCubic(su));
        drawGlowSegment(frame, 180, 835, sx1, sy1, 5.5, 34, 253, 215, 38, 1.0);
        drawLightningBolt(frame, 180, 835, sx1, sy1, {
          seed: 1900 + f,
          segments: 14,
          jitter: 34,
          coreWidth: 3.4,
          glowWidth: 22,
          intensity: 1.0,
          branches: 3,
        });
      }
    }

    // =========================================================================
    // BEAT 4 (3.70s – 4.70s): THE GOLDEN LIGHTNING ATTACK EXPLODES
    // =========================================================================
    else if (t < 4.70) {
      const u = (t - 3.70) / 1.00;

      // Brief 2-frame ufotable-style golden-white impact flash at detonation
      if (f === 111 || f === 112) {
        for (let i = 0; i < frame.length; i += 4) {
          frame[i] = Math.min(255, frame[i] + 225);
          frame[i + 1] = Math.min(255, frame[i + 1] + 205);
          frame[i + 2] = Math.min(255, frame[i + 2] + 135);
        }
      }

      // Expanding golden & blood-crimson shockwave rings
      drawShockwaveRing(
        frame,
        960 + shakeX,
        515 + shakeY,
        lerp(80, 960, easeOutCubic(u)),
        lerp(42, 14, u),
        252,
        208,
        32,
        (1 - u) * 0.95
      );
      drawShockwaveRing(
        frame,
        960 + shakeX,
        515 + shakeY,
        lerp(40, 680, easeOutCubic(clamp((u - 0.08) / 0.92, 0, 1))),
        22,
        192,
        38,
        61,
        (1 - u) * 0.65
      );

      // Massive multi-directional golden thunderbolt explosion radiating from center
      const rayCount = 9;
      const boltIntensity = Math.pow(1 - u, 0.72);
      for (let rIdx = 0; rIdx < rayCount; rIdx++) {
        const ang = (rIdx / rayCount) * Math.PI * 2 + (f % 3) * 0.08;
        const reach = lerp(260, 980, easeOutCubic(Math.min(1, u * 1.45)));
        drawLightningBolt(
          frame,
          960 + shakeX,
          505 + shakeY,
          960 + Math.cos(ang) * reach,
          505 + Math.sin(ang) * reach * 0.66,
          {
            seed: 2500 + f * 17 + rIdx,
            segments: 12,
            jitter: 54,
            coreWidth: 3.4 * boltIntensity + 0.8,
            glowWidth: 24 * boltIntensity + 6,
            intensity: boltIntensity,
            branches: 2,
          }
        );
      }

      // In final 0.25s of explosion, KAGE begins glowing into view through the golden plasma
      if (u > 0.72) {
        const preReveal = (u - 0.72) / 0.28;
        compositeFullscreenLayer(frame, wordmark, {
          opacity: preReveal * 0.65,
          revealHalfWidth: lerp(240, 620, preReveal),
        });
      }
    }

    // =========================================================================
    // BEATS 5 TO 10 (4.70s – 10.60s): KAGE LOGO + ZENITSU SHRINK, RUN, CLIMB & SIT ON K
    // =========================================================================
    else {
      // --- BEAT 5 (4.70s – 5.75s): THE KAGE LOGO APPEARS ---
      const logoAge = t - 4.70;
      const wordmarkOpacity = clamp(0.65 + (logoAge / 0.45) * 0.35, 0, 1);
      const wordmarkHalfW = logoAge < 0.55 ? lerp(580, 960, easeOutCubic(logoAge / 0.55)) : 960;
      const subOpacity = clamp((logoAge - 0.18) / 0.55, 0, 1);
      const subHalfW = logoAge < 0.75 ? lerp(120, 960, easeOutCubic(clamp((logoAge - 0.12) / 0.63, 0, 1))) : 960;

      // Specular light sweep across K A G E during Beat 5 reveal and again softly in Beat 10
      let sheenProg = -1;
      if (t >= 4.95 && t <= 5.70) {
        sheenProg = (t - 4.95) / 0.75;
      } else if (t >= 9.30 && t <= 10.25) {
        sheenProg = (t - 9.30) / 0.95;
      }

      // Residual golden lightning crackles dissipating around the newly revealed KAGE monument (4.70 - 5.45s)
      if (t < 5.45) {
        const rem = 1 - (t - 4.70) / 0.75;
        drawLightningBolt(frame, 430, 490, 1480, 495, {
          seed: 3400 + f,
          segments: 14,
          jitter: 28,
          coreWidth: 1.8,
          glowWidth: 12,
          intensity: rem * 0.55,
          branches: 1,
        });
      }

      // Render K A G E wordmark + blood-red (#C0263D) underline + THE ANIME UNIVERSE subtitle
      compositeFullscreenLayer(frame, wordmark, {
        opacity: wordmarkOpacity,
        revealHalfWidth: wordmarkHalfW,
        sheenProgress: sheenProg,
      });
      compositeFullscreenLayer(frame, subtitle, {
        opacity: subOpacity,
        revealHalfWidth: subHalfW,
      });

      // --- BEAT 6 (5.75s – 6.65s): ZENITSU BECOMES SMALLER ---
      if (t >= 5.75 && t < 6.65) {
        const u = (t - 5.75) / 0.90;
        const shrinkEase = easeInOutCubic(u);
        const zenH = lerp(390, K_FINAL_ZENITSU_H, shrinkEase);
        const zenX = lerp(255, 275, shrinkEase);
        const zenY = lerp(585, 598, shrinkEase);
        const fadeIn = clamp(u / 0.18, 0, 1);

        // Golden shrink-energy ring & sparks around Zenitsu as he becomes smaller
        drawShockwaveRing(
          frame,
          zenX,
          zenY - zenH * 0.45,
          lerp(155, 48, shrinkEase),
          8,
          250,
          204,
          28,
          Math.sin(u * Math.PI) * 0.65
        );

        blitSpriteBilinear(frame, poseAppear, {
          destX: zenX,
          destY: zenY,
          heightPx: zenH,
          anchorX: 0.5,
          anchorY: 0.96, // Feet anchored cleanly on ground plane y ~ 598
          opacity: fadeIn,
          tintGold: Math.sin(u * Math.PI) * 0.25,
        });
      }

      // --- BEAT 7 (6.65s – 7.55s): HE RUNS TOWARD THE LETTER K ---
      else if (t >= 6.65 && t < 7.55) {
        const u = (t - 6.65) / 0.90;
        const runX = lerp(275, 442, easeInOutCubic(u));
        const strideBob = Math.abs(Math.sin(u * Math.PI * 6)) * -11;

        // Golden dash sparks behind his sandals
        drawLightningBolt(frame, runX - 75, 592, runX - 12, 584 + strideBob, {
          seed: 4200 + f,
          segments: 6,
          jitter: 12,
          coreWidth: 1.4,
          glowWidth: 7,
          intensity: 0.72,
          branches: 0,
        });

        blitSpriteBilinear(frame, poseRunSide, {
          destX: runX,
          destY: 598 + strideBob,
          heightPx: K_FINAL_ZENITSU_H,
          anchorX: 0.5,
          anchorY: 0.96,
          opacity: 1,
        });
      }

      // --- BEAT 8 (7.55s – 8.50s): HE JUMPS AND CLIMBS ONTO THE K ---
      else if (t >= 7.55 && t < 8.50) {
        const u = (t - 7.55) / 0.95;
        // Parabolic jump + agile scramble up the diagonal arm of the K onto its top crown
        let climbX;
        let climbY;
        if (u < 0.58) {
          const ju = u / 0.58;
          climbX = lerp(442, 524, easeOutCubic(ju));
          climbY = lerp(585, 448, easeOutCubic(ju)) - Math.sin(ju * Math.PI) * 42;
        } else {
          const cu = (u - 0.58) / 0.42;
          climbX = lerp(524, K_PERCH_X, easeInOutCubic(cu));
          climbY = lerp(448, K_PERCH_Y, easeOutBack(cu)) - Math.sin(cu * Math.PI) * 26;
        }

        // Golden lightning arc tracing his leap up the letter K
        drawLightningBolt(frame, 446, 580, climbX, climbY - 35, {
          seed: 5100 + f,
          segments: 7,
          jitter: 16,
          coreWidth: 1.6,
          glowWidth: 8,
          intensity: (1 - u * 0.35) * 0.75,
          branches: 1,
        });

        blitSpriteBilinear(frame, poseJumpClimb, {
          destX: climbX,
          destY: climbY,
          heightPx: K_FINAL_ZENITSU_H * 1.02,
          anchorX: 0.5,
          anchorY: 0.65,
          opacity: 1,
        });
      }

      // --- BEAT 9 (8.50s – 9.25s) & BEAT 10 (9.25s – 10.60s):
      //     HE SITS ON TOP OF THE K & THE FINAL COMPLETE KAGE LOGO REMAINS VISIBLE ---
      else if (t >= 8.50) {
        const settleAge = t - 8.50;
        const settleSquash =
          settleAge < 0.28 ? Math.sin((settleAge / 0.28) * Math.PI) * 5 : 0;

        // Subtle landing spark ring right when Zenitsu sits on top of K
        if (settleAge < 0.42) {
          drawShockwaveRing(
            frame,
            K_PERCH_X,
            K_PERCH_Y - 6,
            lerp(14, 72, easeOutCubic(settleAge / 0.42)),
            5,
            252,
            208,
            35,
            (1 - settleAge / 0.42) * 0.75
          );
        }

        // Subtle grounding contact shadow where Zenitsu sits on top of the white K crown
        drawGlowSegment(
          frame,
          K_PERCH_X - 28,
          K_PERCH_Y + 2,
          K_PERCH_X + 26,
          K_PERCH_Y + 2,
          0.1,
          7,
          0,
          0,
          0,
          0 // shadow applied directly below
        );
        for (let sy = K_PERCH_Y - 3; sy <= K_PERCH_Y + 9; sy++) {
          for (let sx = K_PERCH_X - 34; sx <= K_PERCH_X + 34; sx++) {
            const dx = (sx - K_PERCH_X) / 34;
            const dy = (sy - (K_PERCH_Y + 2)) / 6;
            const d2 = dx * dx + dy * dy;
            if (d2 < 1) {
              const idx = (sy * W + sx) * 4;
              const shade = 1 - (1 - d2) * 0.42;
              frame[idx] *= shade;
              frame[idx + 1] *= shade;
              frame[idx + 2] *= shade;
            }
          }
        }

        // Zenitsu seated heroically on top of the letter K!
        blitSpriteBilinear(frame, poseSitPerch, {
          destX: K_PERCH_X,
          destY: K_PERCH_Y + settleSquash,
          heightPx: K_FINAL_ZENITSU_H,
          anchorX: 0.5,
          anchorY: 0.63, // Seated hips rest flush on top of K (y = 392)
          opacity: 1,
        });

        // Subtle living golden aura spark around perched Zenitsu during the final logo hold
        if (f % 4 < 2) {
          drawLightningBolt(
            frame,
            K_PERCH_X - 42,
            K_PERCH_Y - 68,
            K_PERCH_X + 44,
            K_PERCH_Y - 22,
            {
              seed: 6500 + Math.floor(f / 2),
              segments: 6,
              jitter: 10,
              coreWidth: 1.1,
              glowWidth: 5.5,
              intensity: 0.42,
              branches: 0,
            }
          );
        }
      }
    }

    // Save diagnostic beat snapshots + official 1920x1080 poster & final HD fallback frame
    if (f === 12) saveFrameImage(frame, path.join(TMP_DIR, 'beat01_appear.jpg'));
    if (f === 52) saveFrameImage(frame, path.join(TMP_DIR, 'beat02_run_cam.jpg'));
    if (f === 96) {
      saveFrameImage(frame, path.join(TMP_DIR, 'beat03_thunder_breathing.jpg'));
      saveFrameImage(frame, posterPath); // Dramatic Full HD #09080B poster frame!
    }
    if (f === 116) saveFrameImage(frame, path.join(TMP_DIR, 'beat04_explosion.jpg'));
    if (f === 162) saveFrameImage(frame, path.join(TMP_DIR, 'beat05_kage_logo.jpg'));
    if (f === 188) saveFrameImage(frame, path.join(TMP_DIR, 'beat06_shrink.jpg'));
    if (f === 214) saveFrameImage(frame, path.join(TMP_DIR, 'beat07_run_to_k.jpg'));
    if (f === 242) saveFrameImage(frame, path.join(TMP_DIR, 'beat08_jump_climb_k.jpg'));
    if (f === 295) {
      saveFrameImage(frame, path.join(TMP_DIR, 'beat10_final_complete_kage.jpg'));
      saveFrameImage(frame, finalHdPngPath); // Crisp 1920x1080 complete KAGE logo fallback frame!
    }

    const bufChunk = Buffer.from(frame.buffer, frame.byteOffset, frame.byteLength);
    if (!mp4Proc.stdin.write(bufChunk)) {
      await new Promise((resolve) => mp4Proc.stdin.once('drain', resolve));
    }
  }

  mp4Proc.stdin.end();
  await new Promise((resolve, reject) => {
    mp4Proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`MP4 ffmpeg exited with code ${code}`));
    });
  });

  console.log('5/5 Transcoding matching 1920x1080 VP9 + Opus WebM asset...');
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-v', 'error',
      '-i', mp4Path,
      '-c:v', 'libvpx-vp9',
      '-b:v', '0',
      '-crf', '28',
      '-deadline', 'good',
      '-cpu-used', '4',
      '-row-mt', '1',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'libopus',
      '-b:a', '160k',
      webmPath,
    ],
    { stdio: 'inherit' }
  );

  const mp4Stat = fs.statSync(mp4Path);
  const webmStat = fs.statSync(webmPath);
  console.log(
    `DONE! MP4: ${(mp4Stat.size / (1024 * 1024)).toFixed(2)} MB | WebM: ${(
      webmStat.size /
      (1024 * 1024)
    ).toFixed(2)} MB`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
