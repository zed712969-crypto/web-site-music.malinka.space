(() => {
  const mainCanvas = document.getElementById('mainCanvas');
  const mainCtx = mainCanvas.getContext('2d', { alpha: true });
  const glowCanvas = document.getElementById('glowCanvas');
  const glowCtx = glowCanvas.getContext('2d', { alpha: true });

  const sheetFxCanvas = document.getElementById('sheetFxCanvas');
  const sheetFxCtx = sheetFxCanvas.getContext('2d', { alpha: true });
  const entryGate = document.getElementById('entryGate');
  const enterBtn = document.getElementById('enterBtn');
  const stageFixed = document.getElementById('stageFixed');
  const heroSection = document.getElementById('heroSection');
  const profileSheet = document.getElementById('profileSheet');
  const scrollCue = document.getElementById('scrollCue');
  const bgAudio = document.getElementById('bgAudio');

  const SCENE_DURATION = 4.0; // 2 bars (8 beats) at 120 BPM
  const GLITCH_CUT_DUR = 0.28;
  const SCENE_COUNT = 16;
  const BEAT_DUR = 0.5; // 120 BPM

  const AMBER_STOPS = [
    [108, 52, 0],
    [198, 106, 6],
    [255, 170, 22],
    [255, 218, 98],
    [198, 106, 6],
  ];

  const ALPHANUM_RAMP = ' .,:;il1!tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$█';
  const CODE_CHARS = '0123456789ABCDEFabcdefXYZPQRSWpqrstvwxyz#*%+=✦';
  const GLITCH_GLYPHS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#@$%&*+=<>|/\\▓▒░█✦';
  const SCRAMBLE_GLYPHS = '0123456789ABCDEFabcdefXYZ#*%+=✦▓░';

  const state = {
    elapsed: 0,
    paused: false,
    width: 0,
    height: 0,
    dpr: 1,
    cols: 120,
    rows: 50,
    cellW: 9,
    cellH: 13,
    fontSize: 11,
    mouseX: 0.5,
    mouseY: 0.5,
    mouseActive: false,
    scrollFrac: 0,
    galaxyParticles: [],
    ctosNodes: [],
    rainCols: [],
    lorenzPoints: [],
    sheetW: 0,
    sheetH: 0,
    audioPlaying: false,
    manualSceneOffset: 0,
    prevMid: 0,
    audioGlitchBoost: 0,
    bassEnergy: 0,
    midEnergy: 0,
    highEnergy: 0,
    energySmooth: 0.22,
    motionPos: 0,
    activeSceneIdx: 3,
    sceneHoldTime: 0,
    manualHoldTimer: 0,
    wasHype: false,
    entered: false,
    strobeFlash: 0,
    lastTitleSync: 0,
    lastBarIndex: -1,
    lastQuarterBeat: -1,
  };

  function amberColor(t, brightness = 1, peakMix = 0) {
    const w = ((t % 1) + 1) % 1;
    const scaled = w * (AMBER_STOPS.length - 1);
    const i = Math.floor(scaled);
    const f = scaled - i;
    const c1 = AMBER_STOPS[i];
    const c2 = AMBER_STOPS[Math.min(i + 1, AMBER_STOPS.length - 1)];

    let r = c1[0] + (c2[0] - c1[0]) * f;
    let g = c1[1] + (c2[1] - c1[1]) * f;
    let b = c1[2] + (c2[2] - c1[2]) * f;

    if (peakMix > 0) {
      r += (255 - r) * peakMix;
      g += (244 - g) * peakMix;
      b += (202 - b) * peakMix;
    }

    r = Math.min(255, r * brightness) | 0;
    g = Math.min(255, g * brightness) | 0;
    b = Math.min(255, b * brightness) | 0;
    return `rgb(${r},${g},${b})`;
  }

  // Beat-synced steady rotation locked to track tempo (no wobble/rocking)
  function syncedAngle(beatPos, rate = 0.5) {
    return beatPos * rate;
  }

  function initParticlesAndAttractors() {
    state.galaxyParticles = [];
    for (let i = 0; i < 920; i++) {
      const arm = i % 4;
      const dist = Math.pow(Math.random(), 0.72) * 0.48;
      const baseAngle = (arm * Math.PI) / 2 + dist * 6.8 + (Math.random() - 0.5) * 0.45;
      state.galaxyParticles.push({
        dist,
        angle: baseAngle,
        speed: 0.45 + (0.5 - dist) * 1.15,
        size: Math.random(),
        ch: CODE_CHARS[i % CODE_CHARS.length],
      });
    }

    state.ctosNodes = [];
    for (let i = 0; i < 24; i++) {
      state.ctosNodes.push({
        x: Math.random(),
        y: Math.random(),
        vx: (Math.random() - 0.5) * 0.08,
        vy: (Math.random() - 0.5) * 0.08,
        label: CODE_CHARS[(i * 7) % CODE_CHARS.length] + String(i % 10),
      });
    }

    // Precompute Lorenz strange attractor trajectory
    state.lorenzPoints = [];
    let lx = 0.1, ly = 0, lz = 0;
    const sigma = 10, rho = 28, beta = 8 / 3, step = 0.008;
    for (let i = 0; i < 1400; i++) {
      const dx = sigma * (ly - lx) * step;
      const dy = (lx * (rho - lz) - ly) * step;
      const dz = (lx * ly - beta * lz) * step;
      lx += dx; ly += dy; lz += dz;
      if (i > 120) {
        state.lorenzPoints.push([lx * 0.045, ly * 0.045, (lz - 24) * 0.045]);
      }
    }
  }

  function initRain() {
    state.rainCols = [];
    for (let c = 0; c < state.cols; c++) {
      state.rainCols.push({
        y: Math.random() * state.rows,
        speed: 14 + Math.random() * 24,
        len: 7 + Math.floor(Math.random() * 14),
        seed: Math.floor(Math.random() * 1000),
      });
    }
  }

  function resize() {
    const rect = mainCanvas.getBoundingClientRect();
    state.dpr = Math.min(window.devicePixelRatio || 1, 2);
    state.width = Math.max(300, rect.width);
    state.height = Math.max(300, rect.height);

    mainCanvas.width = Math.floor(state.width * state.dpr);
    mainCanvas.height = Math.floor(state.height * state.dpr);
    glowCanvas.width = mainCanvas.width;
    glowCanvas.height = mainCanvas.height;

    mainCtx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    glowCtx.setTransform(1, 0, 0, 1, 0, 0);

    const targetCols = Math.min(156, Math.max(68, Math.floor(state.width / 8.5)));
    state.cellW = state.width / targetCols;
    state.cellH = Math.max(10.5, state.cellW * 1.42);
    state.cols = targetCols;
    state.rows = Math.max(28, Math.floor(state.height / state.cellH));
    state.fontSize = Math.max(8.5, Math.min(14, Math.floor(state.cellH * 0.88)));

    mainCtx.font = `700 ${state.fontSize}px "JetBrains Mono", monospace`;
    mainCtx.textAlign = 'center';
    mainCtx.textBaseline = 'middle';

    initRain();

    const sRect = profileSheet.getBoundingClientRect();
    state.sheetW = Math.max(300, sRect.width);
    state.sheetH = Math.max(300, sRect.height);
    sheetFxCanvas.width = Math.floor(state.sheetW * state.dpr);
    sheetFxCanvas.height = Math.floor(state.sheetH * state.dpr);
    sheetFxCtx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    sheetFxCtx.font = `600 12px "JetBrains Mono", monospace`;
    sheetFxCtx.textAlign = 'center';
    sheetFxCtx.textBaseline = 'middle';
  }

  function createGrid() {
    const n = state.cols * state.rows;
    return {
      chars: new Array(n).fill(' '),
      colorT: new Float32Array(n),
      alpha: new Float32Array(n),
      peak: new Float32Array(n),
      zBuf: new Float32Array(n),
    };
  }

  function setCell(grid, col, row, ch, colorT, alpha = 1, peak = 0) {
    if (col < 0 || col >= state.cols || row < 0 || row >= state.rows) return;
    const idx = row * state.cols + col;
    grid.chars[idx] = ch;
    grid.colorT[idx] = colorT;
    grid.alpha[idx] = alpha;
    grid.peak[idx] = peak;
  }

  function setCellZ(grid, col, row, zInv, ch, colorT, alpha = 1, peak = 0) {
    if (col < 0 || col >= state.cols || row < 0 || row >= state.rows) return;
    const idx = row * state.cols + col;
    if (zInv >= grid.zBuf[idx]) {
      grid.zBuf[idx] = zInv;
      grid.chars[idx] = ch;
      grid.colorT[idx] = colorT;
      grid.alpha[idx] = alpha;
      grid.peak[idx] = peak;
    }
  }

  function drawLine(grid, x0, y0, x1, y1, ch, colorT, alpha, peak = 0.2) {
    const steps = Math.max(4, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    for (let i = 0; i <= steps; i++) {
      const f = i / steps;
      const col = Math.round(x0 + (x1 - x0) * f);
      const row = Math.round(y0 + (y1 - y0) * f);
      if (col >= 0 && col < state.cols && row >= 0 && row < state.rows) {
        const idx = row * state.cols + col;
        if (grid.chars[idx] === ' ') {
          grid.chars[idx] = ch;
          grid.colorT[idx] = colorT;
          grid.alpha[idx] = alpha;
          grid.peak[idx] = peak;
        }
      }
    }
  }

  function drawLine3D(grid, x0, y0, z0, x1, y1, z1, ch, colorT, alpha = 0.9, peak = 0.35) {
    const steps = Math.max(8, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 1.35));
    for (let i = 0; i <= steps; i++) {
      const f = i / steps;
      const x = Math.round(x0 + (x1 - x0) * f);
      const y = Math.round(y0 + (y1 - y0) * f);
      const z = z0 + (z1 - z0) * f;
      setCellZ(grid, x, y, 1 / Math.max(0.5, z), ch, colorT + f * 0.12, alpha, peak);
    }
  }

  function sparkleDist(x, y) {
    return Math.pow(Math.pow(Math.abs(x), 0.52) + Math.pow(Math.abs(y), 0.52), 1 / 0.52);
  }

  // Cyber background: calm & minimal on quiet parts, dense & fast when beat/lead hits
  function renderCyberBackground(grid, motionPos, dt, beatPulse, energy) {
    const cols = state.cols, rows = state.rows;
    const nodeSpeedScale = 0.35 + energy * 2.6;

    for (let i = 0; i < state.ctosNodes.length; i++) {
      const n = state.ctosNodes[i];
      n.x = (n.x + n.vx * dt * nodeSpeedScale + 1) % 1;
      n.y = (n.y + n.vy * dt * nodeSpeedScale + 1) % 1;
    }

    const linkRadius = 0.14 + energy * 0.16;
    for (let i = 0; i < state.ctosNodes.length; i++) {
      const a = state.ctosNodes[i];
      const ax = a.x * cols, ay = a.y * rows;
      for (let j = i + 1; j < state.ctosNodes.length; j++) {
        const b = state.ctosNodes[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < linkRadius) {
          drawLine(
            grid,
            ax,
            ay,
            b.x * cols,
            b.y * rows,
            energy > 0.55 ? ':' : '·',
            d * 2 + motionPos * 0.06,
            (1 - d / linkRadius) * (0.14 + energy * 0.42),
            energy * 0.35
          );
        }
      }
      if (state.mouseActive) {
        const dm = Math.hypot(a.x - state.mouseX, a.y - state.mouseY);
        if (dm < 0.28) {
          drawLine(grid, ax, ay, state.mouseX * cols, state.mouseY * rows, ':', 0.7, (1 - dm / 0.28) * 0.55, 0.5);
        }
      }
      const rx = Math.round(ax), ry = Math.round(ay);
      setCell(grid, rx, ry, '+', 0.65, 0.22 + energy * 0.6, energy * 0.45);
      if (energy > 0.48) {
        setCell(grid, rx + 1, ry, a.label[0], 0.5, 0.42, 0.25);
        setCell(grid, rx + 2, ry, a.label[1], 0.5, 0.42, 0.25);
      }
    }

    // Scan lines activate strongly with track energy
    if (energy > 0.28) {
      const scanRow = Math.floor(((motionPos * 0.15) % 1) * rows);
      for (let c = 0; c < cols; c += 2) {
        if (grid.chars[scanRow * cols + c] === ' ') {
          setCell(grid, c, scanRow, c % 6 === 0 ? '0' : '─', c / cols + motionPos * 0.08, 0.14 + energy * 0.38, energy * 0.4);
        }
      }
      if (energy > 0.52) {
        const scanCol = Math.floor(((motionPos * 0.1) % 1) * cols);
        for (let r = 0; r < rows; r += 2) {
          if (grid.chars[r * cols + scanCol] === ' ') {
            setCell(grid, scanCol, r, r % 6 === 0 ? '1' : '│', r / rows + motionPos * 0.08, 0.14 + energy * 0.32, energy * 0.35);
          }
        }
      }
    }

    // Glitch code bursts only when beat/lead hits hard
    const intensity = Math.max(beatPulse * 0.85, energy);
    if (energy > 0.46 && intensity > 0.58) {
      const burstCount = Math.floor((intensity - 0.4) * 12);
      for (let b = 0; b < burstCount; b++) {
        const br = Math.floor(Math.random() * rows);
        const bc = Math.floor(Math.random() * (cols - 10));
        const len = 3 + Math.floor(Math.random() * 11);
        for (let k = 0; k < len; k++) {
          const ch = GLITCH_GLYPHS[(b * 7 + k + Math.floor(motionPos * 24)) % GLITCH_GLYPHS.length];
          setCell(grid, bc + k, br, ch, Math.random(), 0.24 + intensity * 0.4, 0.5);
        }
      }
    }

    const aspect = (cols * state.cellW) / (rows * state.cellH);
    const step = energy > 0.55 ? 2 : 3;
    for (let r = 1; r < rows; r += step) {
      const ny = (r + 0.5) / rows - 0.5;
      for (let c = 1; c < cols; c += step) {
        if (grid.chars[r * cols + c] !== ' ') continue;
        const nx = ((c + 0.5) / cols - 0.5) * aspect;
        const dist = Math.hypot(nx, ny);
        const w = Math.sin(dist * (16 + energy * 10) - motionPos * Math.PI);
        if (w > 0.52) {
          const ch = (energy > 0.45 && w > 0.84) ? CODE_CHARS[(c + r) % CODE_CHARS.length] : '·';
          setCell(grid, c, r, ch, dist + motionPos * 0.05, 0.1 + energy * 0.34, energy * 0.28);
        }
      }
    }
  }

  function applyGlitchPass(grid, strength, beatPos) {
    if (strength <= 0.02) return;
    const cols = state.cols, rows = state.rows;
    const bandCount = Math.max(3, Math.floor(strength * 14));

    for (let b = 0; b < bandCount; b++) {
      const rStart = Math.floor(Math.random() * rows);
      const rHeight = 1 + Math.floor(Math.random() * Math.max(2, Math.floor(strength * 4)));
      const shift = Math.round((Math.random() - 0.5) * cols * 0.35 * strength);

      for (let r = rStart; r < Math.min(rows, rStart + rHeight); r++) {
        const rowChars = grid.chars.slice(r * cols, (r + 1) * cols);
        const rowAlpha = grid.alpha.slice(r * cols, (r + 1) * cols);
        const rowPeak = grid.peak.slice(r * cols, (r + 1) * cols);
        const rowColor = grid.colorT.slice(r * cols, (r + 1) * cols);

        for (let c = 0; c < cols; c++) {
          const srcC = ((c - shift) % cols + cols) % cols;
          const idx = r * cols + c;
          grid.chars[idx] = rowChars[srcC];
          grid.alpha[idx] = rowAlpha[srcC];
          grid.peak[idx] = Math.min(1, rowPeak[srcC] + strength * 0.55);
          grid.colorT[idx] = rowColor[srcC] + 0.25;

          if (Math.random() < strength * 0.14) {
            grid.chars[idx] = GLITCH_GLYPHS[(c + r + Math.floor(beatPos * 45)) % GLITCH_GLYPHS.length];
            grid.alpha[idx] = Math.max(grid.alpha[idx], 0.58);
            grid.peak[idx] = 0.88;
          }
        }
      }
    }
  }

  // --- 16 BEAT-SYNCED 3D SCENES (letters, numbers & symbols) ---

  // 1. 3D Faceted Star Core (beat-synced rotation)
  function sceneFacetedSparkle3D(grid, beatPos, beatPulse) {
    const cols = state.cols, rows = state.rows;
    const aspect = (cols * state.cellW) / (rows * state.cellH);
    const yaw = syncedAngle(beatPos, Math.PI * 0.25, 0.16);
    const pitch = Math.sin(beatPos * Math.PI * 0.25) * 0.6 + state.scrollFrac * 0.5;
    const roll = syncedAngle(beatPos, 0.18, 0.08);
    const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
    const cosP = Math.cos(pitch), sinP = Math.sin(pitch);
    const cosR = Math.cos(roll), sinR = Math.sin(roll);
    const cx = cols * 0.5, cy = rows * 0.5;
    const scale = Math.min(cols * 0.36, rows * 0.68) * (1 + beatPulse * 0.09);

    for (let ring = 0; ring < 2; ring++) {
      for (let i = 0; i < 96; i++) {
        const a = (i / 96) * Math.PI * 2 + syncedAngle(beatPos, ring === 0 ? 0.5 : -0.4, 0.12);
        const x0 = Math.cos(a) * 1.25, y0 = Math.sin(a) * 0.44 * (ring === 0 ? 1 : -1), z0 = Math.sin(a) * 1.15;
        const rx = x0 * cosY - z0 * sinY, rz = x0 * sinY + z0 * cosY;
        const ry = y0 * cosP - rz * sinP;
        const depth = 3.2 + (y0 * sinP + rz * cosP);
        const px = Math.round(cx + (rx / depth) * scale * 2.5);
        const py = Math.round(cy + (ry / depth) * scale * 1.6);
        const ch = i % 12 === 0 ? '✦' : CODE_CHARS[i % CODE_CHARS.length];
        setCellZ(grid, px, py, 1 / depth, ch, i / 96 + beatPos * 0.1, 0.82, i % 12 === 0 ? 0.92 : 0.3);
      }
    }

    const starRadius = 0.38 + beatPulse * 0.045;
    for (let r = 1; r < rows - 1; r++) {
      const sy0 = ((r + 0.5) / rows - 0.5) * 1.08;
      for (let c = 1; c < cols - 1; c++) {
        const sx0 = (((c + 0.5) / cols - 0.5) * aspect) * 1.08;
        const sx = sx0 * cosR - sy0 * sinR, sy = sx0 * sinR + sy0 * cosR;
        for (let z = -0.18; z <= 0.18; z += 0.025) {
          const tx = sx * cosY + z * sinY, tz = -sx * sinY + z * cosY;
          const ty = sy * cosP + tz * sinP, tz2 = -sy * sinP + tz * cosP;
          const d = sparkleDist(tx, ty) + Math.abs(tz2) * 1.65;
          if (d < starRadius) {
            const lum = Math.max(0.15, Math.min(1, 1 - d / starRadius + (0.18 - z) * 1.4));
            const ch = lum > 0.9 ? '✦' : ALPHANUM_RAMP[Math.min(ALPHANUM_RAMP.length - 1, Math.floor(lum * ALPHANUM_RAMP.length))];
            setCellZ(grid, c, r, 1 / (2.5 + z), ch, d * 1.8 + beatPos * 0.12, 0.98, lum > 0.72 ? 0.7 : 0.15);
            break;
          }
        }
      }
    }
  }

  // 2. 3D Torus Knot (p=2, q=3)
  function sceneTorusKnot(grid, beatPos, beatPulse) {
    const cols = state.cols, rows = state.rows;
    const cx = cols * 0.5, cy = rows * 0.5;
    const scaleX = Math.min(cols * 0.66, rows * 1.06) * (1 + beatPulse * 0.06);
    const scaleY = scaleX * 0.56;
    const yaw = -syncedAngle(beatPos, 0.5, 0.14);
    const pitch = Math.cos(beatPos * Math.PI * 0.25) * 0.8;
    const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
    const cosP = Math.cos(pitch), sinP = Math.sin(pitch);
    const tubeR = 0.34 + beatPulse * 0.035;

    for (let u = 0; u < Math.PI * 2; u += 0.028) {
      const cu2 = Math.cos(2 * u), su2 = Math.sin(2 * u), cu3 = Math.cos(3 * u), su3 = Math.sin(3 * u);
      const x = (2 + cu3) * cu2 * 0.55, y = (2 + cu3) * su2 * 0.55, z = su3 * 0.75;
      const du = 0.01;
      const x2 = (2 + Math.cos(3 * (u + du))) * Math.cos(2 * (u + du)) * 0.55;
      const y2 = (2 + Math.cos(3 * (u + du))) * Math.sin(2 * (u + du)) * 0.55;
      const z2 = Math.sin(3 * (u + du)) * 0.75;
      let tx = x2 - x, ty = y2 - y, tz = z2 - z;
      const tLen = Math.hypot(tx, ty, tz) || 1;
      tx /= tLen; ty /= tLen; tz /= tLen;
      let nx = -ty, ny = tx, nz = 0;
      const nLen = Math.hypot(nx, ny, nz) || 1;
      nx /= nLen; ny /= nLen;
      const bx = ty * nz - tz * ny, by = tz * nx - tx * nz, bz = tx * ny - ty * nx;

      for (let v = 0; v < Math.PI * 2; v += 0.42) {
        const cv = Math.cos(v), sv = Math.sin(v);
        const px0 = x + tubeR * (cv * nx + sv * bx), py0 = y + tubeR * (cv * ny + sv * by), pz0 = z + tubeR * (cv * nz + sv * bz);
        const rx = px0 * cosY - pz0 * sinY, rz = px0 * sinY + pz0 * cosY;
        const ry = py0 * cosP - rz * sinP;
        const depth = 4.6 + (py0 * sinP + rz * cosP);
        const sx = Math.round(cx + (rx / depth) * scaleX);
        const sy = Math.round(cy - (ry / depth) * scaleY);
        const lum = Math.max(0.12, Math.min(1, 0.55 + cv * 0.35 + Math.sin(u * 4 - beatPos * Math.PI) * 0.25));
        const ch = ALPHANUM_RAMP[Math.min(ALPHANUM_RAMP.length - 1, Math.floor(lum * ALPHANUM_RAMP.length))];
        setCellZ(grid, sx, sy, 1 / depth, ch, u / (Math.PI * 2) + beatPos * 0.1, 0.45 + lum * 0.55, lum > 0.78 ? 0.65 : 0.1);
      }
    }
  }

  // 3. 4D Tesseract
  function sceneTesseract4D(grid, beatPos, beatPulse) {
    const cols = state.cols, rows = state.rows;
    const cx = cols * 0.5, cy = rows * 0.5;
    const scaleX = Math.min(cols * 0.44, rows * 0.72) * (1 + beatPulse * 0.08);
    const scaleY = scaleX * 0.56;
    const verts4D = [];
    for (let i = 0; i < 16; i++) {
      verts4D.push([(i & 1) ? 1 : -1, (i & 2) ? 1 : -1, (i & 4) ? 1 : -1, (i & 8) ? 1 : -1]);
    }
    const aXW = syncedAngle(beatPos, Math.PI * 0.25, 0.16);
    const aYW = -syncedAngle(beatPos, 0.42, 0.1);
    const aXY = beatPos * 0.28, aXZ = Math.sin(beatPos * 0.35) * 1.3;
    const proj = verts4D.map(([x, y, z, w]) => {
      let x1 = x * Math.cos(aXW) - w * Math.sin(aXW), w1 = x * Math.sin(aXW) + w * Math.cos(aXW);
      let y1 = y * Math.cos(aYW) - w1 * Math.sin(aYW), w2 = y * Math.sin(aYW) + w1 * Math.cos(aYW);
      let x2 = x1 * Math.cos(aXY) - y1 * Math.sin(aXY), y2 = x1 * Math.sin(aXY) + y1 * Math.cos(aXY);
      let x3 = x2 * Math.cos(aXZ) - z * Math.sin(aXZ), z3 = x2 * Math.sin(aXZ) + z * Math.cos(aXZ);
      const d4 = 2.9 - w2, px3 = x3 / d4, py3 = y2 / d4, pz3 = z3 / d4, d3 = 2.6 + pz3;
      return { sx: cx + (px3 / d3) * scaleX * 2.4, sy: cy + (py3 / d3) * scaleY * 2.4, z: d3, w: w2 };
    });

    for (let i = 0; i < 16; i++) {
      for (let bit = 0; bit < 4; bit++) {
        const j = i ^ (1 << bit);
        if (i < j) {
          const a = proj[i], b = proj[j];
          const ch = bit === 3 ? '0' : (a.w + b.w > 0 ? 'X' : '1');
          drawLine3D(grid, a.sx, a.sy, a.z, b.sx, b.sy, b.z, ch, (i / 16) + beatPos * 0.1, 0.88, bit === 3 ? 0.2 : 0.48);
        }
      }
    }
    for (let i = 0; i < 16; i++) {
      const p = proj[i];
      setCellZ(grid, Math.round(p.sx), Math.round(p.sy), 2 / p.z, '✦', i / 16 + beatPos * 0.12, 1, 0.92);
    }
  }

  // 4. Sacred Mandala
  function sceneMandala(grid, beatPos, beatPulse) {
    const cols = state.cols, rows = state.rows;
    const aspect = (cols * state.cellW) / (rows * state.cellH);
    const pulseScale = 1 + beatPulse * 0.09;

    for (let r = 1; r < rows - 1; r++) {
      const ny = ((r + 0.5) / rows - 0.5) / pulseScale;
      for (let c = 1; c < cols - 1; c++) {
        const nx = (((c + 0.5) / cols - 0.5) * aspect) / pulseScale;
        const dist = Math.hypot(nx, ny), ang = Math.atan2(ny, nx);
        const petals1 = Math.abs(Math.cos(4 * (ang + syncedAngle(beatPos, 0.3, 0.1)))) * 0.32 + 0.14;
        const petals2 = Math.abs(Math.sin(8 * (ang - syncedAngle(beatPos, 0.22, 0.08)))) * 0.24 + 0.18;
        const rotStar = syncedAngle(beatPos, 0.25, 0.12);
        const dStar = sparkleDist(nx * Math.cos(rotStar) - ny * Math.sin(rotStar), nx * Math.sin(rotStar) + ny * Math.cos(rotStar));
        const ring1 = Math.exp(-Math.abs(dist - petals1) * 48);
        const ring2 = Math.exp(-Math.abs(dist - petals2) * 48);
        const starEdge = Math.exp(-Math.abs(dStar - 0.36) * 42) + Math.exp(-Math.abs(dStar - 0.2) * 48);
        const lum = Math.min(1, ring1 * 0.9 + ring2 * 0.8 + starEdge);
        if (lum > 0.18) {
          const ch = lum > 0.86 ? '✦' : ALPHANUM_RAMP[Math.min(ALPHANUM_RAMP.length - 1, Math.floor(lum * ALPHANUM_RAMP.length))];
          setCell(grid, c, r, ch, dist * 1.4 + ang / (Math.PI * 2) + beatPos * 0.1, lum, lum > 0.76 ? 0.75 : 0.18);
        }
      }
    }
  }

  // 5. 3D Mobius Strip
  function sceneMobiusStrip(grid, beatPos, beatPulse) {
    const cols = state.cols, rows = state.rows;
    const cx = cols * 0.5, cy = rows * 0.5;
    const scaleX = Math.min(cols * 0.72, rows * 1.15) * (1 + beatPulse * 0.07);
    const scaleY = scaleX * 0.56;
    const yaw = -syncedAngle(beatPos, 0.55, 0.14);
    const pitch = 0.5 + Math.sin(beatPos * Math.PI * 0.3) * 0.45;
    const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
    const cosP = Math.cos(pitch), sinP = Math.sin(pitch);

    for (let u = 0; u < Math.PI * 2; u += 0.032) {
      for (let v = -0.65; v <= 0.65; v += 0.08) {
        const halfU = u * 0.5, R = 1.65;
        const x0 = (R + v * Math.cos(halfU)) * Math.cos(u);
        const y0 = (R + v * Math.cos(halfU)) * Math.sin(u);
        const z0 = v * Math.sin(halfU);
        const rx = x0 * cosY - z0 * sinY, rz = x0 * sinY + z0 * cosY;
        const ry = y0 * cosP - rz * sinP;
        const depth = 4.8 + (y0 * sinP + rz * cosP);
        const sx = Math.round(cx + (rx / depth) * scaleX * 1.35);
        const sy = Math.round(cy - (ry / depth) * scaleY * 1.35);
        const wave = Math.sin(u * 4 - beatPos * Math.PI * 2 + v * 4) * 0.5 + 0.5;
        const isEdge = Math.abs(v) > 0.55;
        const ch = isEdge ? '█' : ALPHANUM_RAMP[Math.min(ALPHANUM_RAMP.length - 1, Math.floor(wave * ALPHANUM_RAMP.length))];
        setCellZ(grid, sx, sy, 1 / depth, ch, u / (Math.PI * 2) + beatPos * 0.1, 0.45 + wave * 0.55, isEdge ? 0.72 : wave * 0.3);
      }
    }
  }

  // 6. Double Helix DNA 3D
  function sceneDoubleHelix(grid, beatPos, beatPulse) {
    const cols = state.cols, rows = state.rows;
    const cx = cols * 0.5, cy = rows * 0.5;
    const radius = Math.min(cols * 0.22, rows * 0.36) * (1 + beatPulse * 0.08);
    const tilt = Math.sin(beatPos * Math.PI * 0.25) * 0.38;
    const cosT = Math.cos(tilt), sinT = Math.sin(tilt);

    for (let i = 0; i < 160; i++) {
      const f = i / 160;
      const y0 = (f - 0.5) * rows * 0.88;
      const phase = f * Math.PI * 5 - syncedAngle(beatPos, Math.PI * 0.5, 0.2);
      const xA0 = Math.cos(phase) * radius, zA = Math.sin(phase);
      const xB0 = Math.cos(phase + Math.PI) * radius, zB = Math.sin(phase + Math.PI);
      const xA = cx + xA0 * cosT - y0 * sinT, yA = cy + xA0 * sinT + y0 * cosT;
      const xB = cx + xB0 * cosT - y0 * sinT, yB = cy + xB0 * sinT + y0 * cosT;

      if (i % 8 === 0) {
        const bridgeCh = ['A', 'T', 'G', 'C'][Math.floor(i / 8) % 4];
        drawLine3D(grid, xA, yA, 3 + zA, xB, yB, 3 + zB, bridgeCh, f + beatPos * 0.1, 0.68, 0.2);
      }
      const lumA = (zA + 1) * 0.5, lumB = (zB + 1) * 0.5;
      setCellZ(grid, Math.round(xA), Math.round(yA), 1 / (3 + zA), lumA > 0.65 ? '✦' : '0', f + beatPos * 0.1, 0.4 + lumA * 0.6, lumA * 0.8);
      setCellZ(grid, Math.round(xB), Math.round(yB), 1 / (3 + zB), lumB > 0.65 ? '✦' : '1', f + 0.5 + beatPos * 0.1, 0.4 + lumB * 0.6, lumB * 0.8);
    }
  }

  // 7. 3D Torus
  function sceneTorus3D(grid, beatPos, beatPulse) {
    const cols = state.cols, rows = state.rows;
    const cx = cols * 0.5, cy = rows * 0.5;
    const scaleX = Math.min(cols * 0.76, rows * 1.25) * (1 + beatPulse * 0.07);
    const scaleY = scaleX * 0.54;
    const A = syncedAngle(beatPos, 0.55, 0.16);
    const B = -syncedAngle(beatPos, 0.38, 0.12) + Math.sin(beatPos * 0.3) * 0.45;
    const cosA = Math.cos(A), sinA = Math.sin(A), cosB = Math.cos(B), sinB = Math.sin(B);
    const R1 = 1.0, R2 = 2.05, K2 = 5.0;

    for (let theta = 0; theta < Math.PI * 2; theta += 0.062) {
      const cosT = Math.cos(theta), sinT = Math.sin(theta);
      for (let phi = 0; phi < Math.PI * 2; phi += 0.022) {
        const cosP = Math.cos(phi), sinP = Math.sin(phi);
        const circleX = R2 + R1 * cosT, circleY = R1 * sinT;
        const x = circleX * (cosB * cosP + sinA * sinB * sinP) - circleY * cosA * sinB;
        const y = circleX * (sinB * cosP - sinA * cosB * sinP) + circleY * cosA * cosB;
        const z = K2 + cosA * circleX * sinP + circleY * sinA, ooz = 1 / z;
        const xp = Math.round(cx + scaleX * ooz * x), yp = Math.round(cy - scaleY * ooz * y);
        const L = cosP * cosT * sinB - cosA * cosT * sinP - sinA * sinT + cosB * (cosA * sinT - cosT * sinA * sinP);
        const lum = Math.max(0.1, Math.min(1, (L + 1.15) * 0.45 + Math.max(0, Math.sin(phi * 3 - beatPos * Math.PI * 2 + theta)) * 0.25 + beatPulse * 0.14));
        const ch = ALPHANUM_RAMP[Math.min(ALPHANUM_RAMP.length - 1, Math.floor(lum * ALPHANUM_RAMP.length))];
        setCellZ(grid, xp, yp, ooz, ch, phi / (Math.PI * 2) + beatPos * 0.08, 0.34 + lum * 0.66, lum > 0.78 ? 0.68 : 0.1);
      }
    }
  }

  // 8. Dyson Geodesic Sphere with TRUE rotating 3D Sparkle Core inside
  function sceneDysonSphere(grid, beatPos, beatPulse) {
    const cols = state.cols, rows = state.rows;
    const cx = cols * 0.5, cy = rows * 0.5;
    const scaleX = Math.min(cols * 0.46, rows * 0.82) * (1 + beatPulse * 0.07);
    const scaleY = scaleX * 0.56;
    const aspect = (cols * state.cellW) / (rows * state.cellH);

    // True 3D rotating core star inside the rings (Z-buffered)
    const sYaw = syncedAngle(beatPos, 0.65);
    const sPitch = Math.sin(beatPos * Math.PI * 0.25) * 0.55;
    const sRoll = syncedAngle(beatPos, 0.25);
    const cosSY = Math.cos(sYaw), sinSY = Math.sin(sYaw);
    const cosSP = Math.cos(sPitch), sinSP = Math.sin(sPitch);
    const cosSR = Math.cos(sRoll), sinSR = Math.sin(sRoll);
    const coreRad = 0.21 + beatPulse * 0.035;

    for (let r = Math.floor(rows * 0.22); r < Math.floor(rows * 0.78); r++) {
      const sy0 = (r + 0.5) / rows - 0.5;
      for (let c = Math.floor(cols * 0.24); c < Math.floor(cols * 0.76); c++) {
        const sx0 = ((c + 0.5) / cols - 0.5) * aspect;
        const sx = sx0 * cosSR - sy0 * sinSR;
        const sy = sx0 * sinSR + sy0 * cosSR;
        for (let z = -0.14; z <= 0.14; z += 0.024) {
          const tx = sx * cosSY + z * sinSY;
          const tz = -sx * sinSY + z * cosSY;
          const ty = sy * cosSP + tz * sinSP;
          const tz2 = -sy * sinSP + tz * cosSP;
          const d = sparkleDist(tx, ty) + Math.abs(tz2) * 1.45;
          if (d < coreRad) {
            const lum = Math.max(0.2, Math.min(1, 1 - d / coreRad + (0.14 - z) * 1.5));
            const ch = lum > 0.86 ? '✦' : ALPHANUM_RAMP[Math.min(ALPHANUM_RAMP.length - 1, Math.floor(lum * ALPHANUM_RAMP.length))];
            setCellZ(grid, c, r, 1 / (3.2 + z * 2.2), ch, d * 2 + beatPos * 0.15, 0.98, lum > 0.7 ? 0.78 : 0.22);
            break;
          }
        }
      }
    }

    for (let ring = 0; ring < 6; ring++) {
      const dir = ring % 2 === 0 ? 1 : -1;
      const rotX = ring * 0.52 + syncedAngle(beatPos, (0.32 + ring * 0.05) * dir);
      const rotY = ring * 0.78 - syncedAngle(beatPos, (0.24 + ring * 0.04) * dir);
      for (let i = 0; i < 120; i++) {
        const a = (i / 120) * Math.PI * 2;
        const x0 = Math.cos(a), y0 = Math.sin(a), z0 = 0;
        const y1 = y0 * Math.cos(rotX) - z0 * Math.sin(rotX), z1 = y0 * Math.sin(rotX) + z0 * Math.cos(rotX);
        const x2 = x0 * Math.cos(rotY) - z1 * Math.sin(rotY), z2 = x0 * Math.sin(rotY) + z1 * Math.cos(rotY);
        const depth = 3.2 + z2;
        const sx = Math.round(cx + (x2 / depth) * scaleX * 2.5);
        const sy = Math.round(cy + (y1 / depth) * scaleY * 2.5);
        const ch = i % 10 === 0 ? '✦' : (z2 < 0 ? CODE_CHARS[i % 16] : '·');
        setCellZ(grid, sx, sy, 1 / depth, ch, ring / 6 + beatPos * 0.1, z2 < 0 ? 0.98 : 0.45, z2 < -0.3 ? 0.65 : 0.12);
      }
    }
  }

  // 9. Spiral Galaxy Vortex
  function sceneGalaxyVortex(grid, beatPos, beatPulse) {
    const cols = state.cols, rows = state.rows;
    const aspect = (cols * state.cellW) / (rows * state.cellH);
    const tilt = 0.56 + Math.sin(beatPos * Math.PI * 0.25) * 0.25;
    const rotW = syncedAngle(beatPos, 0.25, 0.12);
    const cosW = Math.cos(rotW), sinW = Math.sin(rotW);

    for (let i = 0; i < state.galaxyParticles.length; i++) {
      const p = state.galaxyParticles[i];
      const ang = p.angle + beatPos * p.speed * 0.45;
      const d = p.dist * (1 + beatPulse * 0.06);
      const gx0 = Math.cos(ang) * d, gy0 = Math.sin(ang) * d * tilt;
      const gx = gx0 * cosW - gy0 * sinW, gy = gx0 * sinW + gy0 * cosW;
      const c = Math.round((gx / aspect + 0.5) * cols), r = Math.round((gy + 0.5) * rows);
      const ch = d < 0.09 ? '✦' : (p.size > 0.45 ? p.ch : '·');
      setCell(grid, c, r, ch, d * 2 + beatPos * 0.12, Math.max(0.3, 1 - d * 1.4), d < 0.12 ? 0.9 : p.size * 0.4);
    }
  }

  // 10. Hyperspace Star Tunnel
  function sceneStarTunnel(grid, beatPos, beatPulse) {
    const cols = state.cols, rows = state.rows;
    const aspect = (cols * state.cellW) / (rows * state.cellH);
    const twistBase = syncedAngle(beatPos, 0.35, 0.16);

    for (let r = 1; r < rows - 1; r++) {
      const ny = (r + 0.5) / rows - 0.5;
      for (let c = 1; c < cols - 1; c++) {
        const nx = ((c + 0.5) / cols - 0.5) * aspect;
        const ang = Math.atan2(ny, nx);
        const rx = nx * Math.cos(twistBase) - ny * Math.sin(twistBase);
        const ry = nx * Math.sin(twistBase) + ny * Math.cos(twistBase);
        const dStar = Math.max(0.025, sparkleDist(rx, ry));
        const depth = 0.45 / dStar + beatPos * 2.1;
        const lum = Math.max(0, Math.sin(depth * Math.PI * 2) * 0.55 + Math.cos(ang * 8 + depth * 0.45) * 0.45 + beatPulse * 0.16);
        if (dStar < 0.065) setCell(grid, c, r, '✦', beatPos * 0.2, 1, 0.96);
        else if (lum > 0.15) {
          const ch = ALPHANUM_RAMP[Math.min(ALPHANUM_RAMP.length - 1, Math.floor(lum * ALPHANUM_RAMP.length))];
          setCell(grid, c, r, ch, depth * 0.1 + ang * 0.06, Math.min(1, dStar * 1.6) * lum, lum > 0.76 ? 0.7 : 0.14);
        }
      }
    }
  }

  // 11. 3D Wave Terrain
  function sceneWaveTerrain3D(grid, beatPos, beatPulse) {
    const cols = state.cols, rows = state.rows;
    const cx = cols * 0.5;
    const camYaw = Math.sin(beatPos * Math.PI * 0.25) * 0.5;
    const cosC = Math.cos(camYaw), sinC = Math.sin(camYaw);

    for (let z = 3.2; z >= 0.7; z -= 0.065) {
      for (let x = -2.4; x <= 2.4; x += 0.04) {
        const wx = x * cosC - (z - 1.9) * sinC, wz = x * sinC + (z - 1.9) * cosC;
        const rDist = Math.hypot(wx, wz), starWave = sparkleDist(wx * 0.5, wz * 0.5);
        const h = (Math.sin(rDist * 5.5 - beatPos * Math.PI) * 0.26 + Math.cos(starWave * 7.0 - beatPos * 1.4) * 0.22 + Math.sin(wx * 2.8 + beatPos) * 0.12) * (1 + beatPulse * 0.2);
        const sx = Math.round(cx + (x / z) * cols * 0.42);
        const sy = Math.round(rows * 0.58 - ((h - 0.35) / z) * rows * 0.52);
        const lum = Math.max(0.15, Math.min(1, (h + 0.55) / 1.1));
        const ch = lum > 0.88 ? '✦' : ALPHANUM_RAMP[Math.min(ALPHANUM_RAMP.length - 1, Math.floor(lum * ALPHANUM_RAMP.length))];
        setCellZ(grid, sx, sy, 1 / z, ch, rDist * 0.35 + beatPos * 0.1, Math.min(1, 1.35 - z * 0.26), lum > 0.76 ? 0.65 : 0.12);
      }
    }
  }

  // 12. 8x Kaleidoscope
  function sceneKaleidoscope(grid, beatPos, beatPulse) {
    const cols = state.cols, rows = state.rows;
    const aspect = (cols * state.cellW) / (rows * state.cellH);

    for (let r = 1; r < rows - 1; r++) {
      const ny = (r + 0.5) / rows - 0.5;
      for (let c = 1; c < cols - 1; c++) {
        const nx = ((c + 0.5) / cols - 0.5) * aspect;
        const dist = Math.hypot(nx, ny);
        let ang = Math.atan2(ny, nx) + syncedAngle(beatPos, 0.2, 0.12);
        const sector = Math.PI / 4;
        ang = Math.abs(((ang % (sector * 2)) + sector * 2) % (sector * 2) - sector);
        const kx = Math.cos(ang) * dist, ky = Math.sin(ang) * dist;
        const val = (Math.sin(sparkleDist(kx, ky) * 26 - beatPos * Math.PI * 2) + Math.cos((kx * 18 - ky * 18) + beatPos * 1.7)) * 0.5 + beatPulse * 0.14;
        if (val > 0.06) {
          const ch = val > 0.88 ? '✦' : ALPHANUM_RAMP[Math.min(ALPHANUM_RAMP.length - 1, Math.floor(val * ALPHANUM_RAMP.length))];
          setCell(grid, c, r, ch, dist * 1.3 + beatPos * 0.12, 0.35 + val * 0.65, val > 0.76 ? 0.76 : 0.16);
        }
      }
    }
  }

  // 13. NEW: 3D Lorenz Strange Attractor (butterfly chaos trajectory)
  function sceneLorenzAttractor(grid, beatPos, beatPulse) {
    const cols = state.cols, rows = state.rows;
    const cx = cols * 0.5, cy = rows * 0.5;
    const scaleX = Math.min(cols * 0.45, rows * 0.85) * (1 + beatPulse * 0.07);
    const scaleY = scaleX * 0.58;
    const yaw = syncedAngle(beatPos, 0.45, 0.14);
    const pitch = Math.sin(beatPos * Math.PI * 0.2) * 0.42;
    const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
    const cosP = Math.cos(pitch), sinP = Math.sin(pitch);

    const pts = state.lorenzPoints;
    const headIdx = Math.floor((beatPos * 180) % pts.length);
    for (let i = 0; i < pts.length; i++) {
      const [x0, y0, z0] = pts[i];
      const rx = x0 * cosY - z0 * sinY, rz = x0 * sinY + z0 * cosY;
      const ry = y0 * cosP - rz * sinP;
      const depth = 2.8 + (y0 * sinP + rz * cosP);
      const sx = Math.round(cx + (rx / depth) * scaleX * 1.45);
      const sy = Math.round(cy + (ry / depth) * scaleY * 1.45);
      const distFromHead = ((headIdx - i) + pts.length) % pts.length;
      const isHot = distFromHead < 95;
      const ch = distFromHead < 8 ? '✦' : (isHot ? CODE_CHARS[i % CODE_CHARS.length] : ALPHANUM_RAMP[Math.min(ALPHANUM_RAMP.length - 1, 6 + (i % 14))]);
      setCellZ(grid, sx, sy, 1 / depth, ch, i / pts.length + beatPos * 0.15, isHot ? 1 : 0.52, isHot ? 0.85 : 0.15);
    }
  }

  // 14. 3D Rotating Hyper-Lattice Cube Matrix + Cyber Rain
  function sceneCyberRainShock(grid, beatPos, beatPulse) {
    const cols = state.cols, rows = state.rows;
    const cx = cols * 0.5, cy = rows * 0.5;
    const scaleX = Math.min(cols * 0.38, rows * 0.68) * (1 + beatPulse * 0.08);
    const scaleY = scaleX * 0.56;
    const yaw = syncedAngle(beatPos, 0.48);
    const pitch = syncedAngle(beatPos, 0.28);
    const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
    const cosP = Math.cos(pitch), sinP = Math.sin(pitch);

    // Subtle rain on edges
    for (let c = 1; c < cols - 1; c += 3) {
      const rc = state.rainCols[c];
      if (!rc) continue;
      const head = Math.floor((rc.y + beatPos * rc.speed * 0.45) % (rows + rc.len));
      for (let k = 0; k < rc.len; k++) {
        const r = head - k;
        if (r < 1 || r >= rows - 1) continue;
        const ch = CODE_CHARS[(rc.seed + r * 5 + Math.floor(beatPos * 6)) % CODE_CHARS.length];
        setCell(grid, c, r, ch, c / cols + beatPos * 0.08, (1 - k / rc.len) * 0.42, k === 0 ? 0.65 : 0.05);
      }
    }

    // 3x3x3 3D lattice with energy wave
    const pts = [];
    for (let gx = -1; gx <= 1; gx++) {
      for (let gy = -1; gy <= 1; gy++) {
        for (let gz = -1; gz <= 1; gz++) {
          const x = gx * 0.95, y = gy * 0.95, z = gz * 0.95;
          const rx = x * cosY - z * sinY, rz = x * sinY + z * cosY;
          const ry = y * cosP - rz * sinP;
          const depth = 4.2 + (y * sinP + rz * cosP);
          pts.push({
            gx, gy, gz,
            sx: cx + (rx / depth) * scaleX * 2.2,
            sy: cy + (ry / depth) * scaleY * 2.2,
            depth,
            wave: Math.sin((gx + gy + gz) * 1.4 - beatPos * Math.PI * 1.5) * 0.5 + 0.5,
          });
        }
      }
    }

    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      for (let j = i + 1; j < pts.length; j++) {
        const b = pts[j];
        if (Math.abs(a.gx - b.gx) + Math.abs(a.gy - b.gy) + Math.abs(a.gz - b.gz) === 1) {
          drawLine3D(grid, a.sx, a.sy, a.depth, b.sx, b.sy, b.depth, a.wave > 0.65 ? '+' : '·', (a.wave + beatPos * 0.1), 0.55 + a.wave * 0.35, a.wave * 0.45);
        }
      }
      const ch = a.wave > 0.78 ? '✦' : CODE_CHARS[(i + Math.floor(beatPos * 4)) % CODE_CHARS.length];
      setCellZ(grid, Math.round(a.sx), Math.round(a.sy), 2 / a.depth, ch, a.wave + beatPos * 0.15, 0.98, a.wave > 0.72 ? 0.88 : 0.32);
    }
  }

  // 15. NEW: 3D Wireframe Icosahedron / Star Polyhedron
  function sceneWirePolyhedron(grid, beatPos, beatPulse) {
    const cols = state.cols, rows = state.rows;
    const cx = cols * 0.5, cy = rows * 0.5;
    const scaleX = Math.min(cols * 0.42, rows * 0.74) * (1 + beatPulse * 0.09);
    const scaleY = scaleX * 0.56;
    const phi = (1 + Math.sqrt(5)) / 2;
    const rawVerts = [
      [-1, phi, 0], [1, phi, 0], [-1, -phi, 0], [1, -phi, 0],
      [0, -1, phi], [0, 1, phi], [0, -1, -phi], [0, 1, -phi],
      [phi, 0, -1], [phi, 0, 1], [-phi, 0, -1], [-phi, 0, 1],
    ];
    const yaw = syncedAngle(beatPos, 0.55, 0.18);
    const pitch = syncedAngle(beatPos, 0.35, 0.1);
    const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
    const cosP = Math.cos(pitch), sinP = Math.sin(pitch);

    const proj = rawVerts.map(([x, y, z]) => {
      const rx = x * cosY - z * sinY, rz = x * sinY + z * cosY;
      const ry = y * cosP - rz * sinP;
      const depth = 4.2 + (y * sinP + rz * cosP);
      return { x, y, z, sx: cx + (rx / depth) * scaleX * 2.1, sy: cy + (ry / depth) * scaleY * 2.1, depth };
    });

    for (let i = 0; i < proj.length; i++) {
      for (let j = i + 1; j < proj.length; j++) {
        const d3 = Math.hypot(proj[i].x - proj[j].x, proj[i].y - proj[j].y, proj[i].z - proj[j].z);
        if (d3 < 2.15) {
          const ch = CODE_CHARS[(i + j) % CODE_CHARS.length];
          drawLine3D(grid, proj[i].sx, proj[i].sy, proj[i].depth, proj[j].sx, proj[j].sy, proj[j].depth, ch, (i / 12) + beatPos * 0.12, 0.88, 0.45);
        }
      }
      setCellZ(grid, Math.round(proj[i].sx), Math.round(proj[i].sy), 2 / proj[i].depth, '✦', i / 12 + beatPos * 0.15, 1, 0.94);
    }
  }

  // 16. NEW: 3D Audio Lissajous Ribbon + Live Frequency Bars
  function sceneAudioLissajous(grid, beatPos, beatPulse) {
    const cols = state.cols, rows = state.rows;
    const cx = cols * 0.5, cy = rows * 0.44;
    const rx = Math.min(cols * 0.34, rows * 0.62) * (1 + beatPulse * 0.08);
    const ry = rx * 0.52;
    const phaseShift = syncedAngle(beatPos, 0.45, 0.12);

    for (let i = 0; i < 240; i++) {
      const t = (i / 240) * Math.PI * 2;
      const x = Math.sin(3 * t + phaseShift) * rx;
      const y = Math.sin(4 * t) * ry;
      const z = Math.cos(5 * t - phaseShift);
      const px = Math.round(cx + x);
      const py = Math.round(cy + y);
      const ch = i % 15 === 0 ? '✦' : CODE_CHARS[i % CODE_CHARS.length];
      setCellZ(grid, px, py, 1 / (2.5 + z), ch, i / 240 + beatPos * 0.15, 0.5 + (1 - z) * 0.25, z < 0 ? 0.72 : 0.2);
    }

    // Bottom live FFT bars
    const bars = Math.min(36, Math.floor((cols - 6) / 3));
    const startC = Math.floor((cols - bars * 3) / 2);
    for (let b = 0; b < bars; b++) {
      let val = Math.abs(Math.sin(b * 0.4 + beatPos * Math.PI * 2)) * 0.45 + beatPulse * 0.45;
      if (state.audioPlaying && audio.freqData) {
        const bin = Math.floor((b / bars) * (audio.freqData.length * 0.65));
        val = Math.max(val * 0.3, audio.freqData[bin] / 255);
      }
      const h = Math.max(1, Math.round(val * rows * 0.26));
      const cPos = startC + b * 3;
      for (let dy = 0; dy < h; dy++) {
        const ch = dy === h - 1 ? '✦' : CODE_CHARS[(b + dy) % 16];
        setCell(grid, cPos, rows - 2 - dy, ch, b / bars + beatPos * 0.1, 0.92, dy === h - 1 ? 0.85 : 0.25);
        setCell(grid, cPos + 1, rows - 2 - dy, ch, b / bars + beatPos * 0.1, 0.92, dy === h - 1 ? 0.85 : 0.25);
      }
    }
  }

  const SCENE_FNS = [
    sceneFacetedSparkle3D,
    sceneTorusKnot,
    sceneTesseract4D,
    sceneLorenzAttractor,
    sceneMandala,
    sceneWirePolyhedron,
    sceneMobiusStrip,
    sceneCyberRainShock,
    sceneDoubleHelix,
    sceneTorus3D,
    sceneAudioLissajous,
    sceneDysonSphere,
    sceneGalaxyVortex,
    sceneStarTunnel,
    sceneWaveTerrain3D,
    sceneKaleidoscope,
  ];

  // Cyber FX on lower sheet
  function renderSheetFx(beatPos, dt, beatPulse) {
    const w = state.sheetW, h = state.sheetH;
    if (!w || !h) return;
    sheetFxCtx.clearRect(0, 0, w, h);

    const scanY = ((beatPos * 0.14) % 1) * h;
    sheetFxCtx.strokeStyle = `rgba(255, 178, 36, ${0.18 + beatPulse * 0.25})`;
    sheetFxCtx.lineWidth = 1;
    sheetFxCtx.beginPath();
    sheetFxCtx.moveTo(0, scanY);
    sheetFxCtx.lineTo(w, scanY);
    sheetFxCtx.stroke();

    for (let i = 0; i < state.ctosNodes.length; i++) {
      const a = state.ctosNodes[i];
      for (let j = i + 1; j < state.ctosNodes.length; j++) {
        const b = state.ctosNodes[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < 0.26) {
          sheetFxCtx.strokeStyle = `rgba(255, 165, 25, ${(1 - d / 0.26) * (0.2 + beatPulse * 0.18)})`;
          sheetFxCtx.beginPath();
          sheetFxCtx.moveTo(a.x * w, a.y * h);
          sheetFxCtx.lineTo(b.x * w, b.y * h);
          sheetFxCtx.stroke();
        }
      }
      sheetFxCtx.fillStyle = `rgba(255, 210, 95, ${0.35 + beatPulse * 0.45})`;
      sheetFxCtx.fillText(a.label, a.x * w, a.y * h);
    }

    if (beatPulse > 0.72) {
      for (let g = 0; g < 5; g++) {
        const gx = Math.random() * w;
        const gy = Math.random() * h;
        const gw = 20 + Math.random() * 90;
        sheetFxCtx.fillStyle = `rgba(255, 190, 60, ${0.12 + beatPulse * 0.18})`;
        sheetFxCtx.fillRect(gx, gy, gw, 2);
      }
    }
  }

  // Bug-free glitch text animation with lock + hover cooldown
  function triggerGlitchText(el, fast = false, fromHover = false) {
    const now = performance.now();
    if (el._isGlitching) return;
    if (fromHover && el._lastGlitchEnd && now - el._lastGlitchEnd < 650) return;

    const target = el.dataset.text || el.textContent;
    el._isGlitching = true;
    el.classList.remove('is-glitching');
    void el.offsetWidth;
    el.classList.add('is-glitching');

    if (el._scrambleTimer) clearInterval(el._scrambleTimer);
    let step = 0;
    const total = fast ? Math.max(5, Math.ceil(target.length * 0.75)) : Math.max(8, target.length + 4);
    el._scrambleTimer = setInterval(() => {
      step++;
      const revealed = Math.floor((step / total) * target.length);
      let next = '';
      for (let i = 0; i < target.length; i++) {
        const ch = target[i];
        next += (ch === ' ' || i < revealed) ? ch : SCRAMBLE_GLYPHS[(i * 7 + step * 5) % SCRAMBLE_GLYPHS.length];
      }
      el.textContent = next;
      if (step >= total) {
        clearInterval(el._scrambleTimer);
        el._scrambleTimer = null;
        el.textContent = target;
        el.classList.remove('is-glitching');
        el._isGlitching = false;
        el._lastGlitchEnd = performance.now();
      }
    }, fast ? 26 : 22);
  }

  const glitchTextEls = Array.from(document.querySelectorAll('.glitch-text'));
  let revealedOnce = false;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && !revealedOnce) {
          revealedOnce = true;
          glitchTextEls.forEach((el, idx) => {
            setTimeout(() => triggerGlitchText(el, false, false), idx * 55);
          });
        }
      });
    },
    { threshold: 0.2 }
  );
  observer.observe(profileSheet);

  glitchTextEls.forEach((el) => {
    el.addEventListener('mouseenter', () => triggerGlitchText(el, false, true));
  });

  function scheduleAmbientTextGlitch() {
    const delay = 1600 + Math.random() * 2400;
    setTimeout(() => {
      if (state.scrollFrac > 0.15 && glitchTextEls.length > 0) {
        const pick = glitchTextEls[Math.floor(Math.random() * glitchTextEls.length)];
        triggerGlitchText(pick, true, false);
      }
      scheduleAmbientTextGlitch();
    }, delay);
  }
  scheduleAmbientTextGlitch();

  // Audio sync with background track + rock-solid looping
  const audio = {
    ctx: null,
    analyser: null,
    freqData: null,
    mediaSource: null,
  };

  function setupAudioGraph() {
    if (!audio.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      audio.ctx = new AC();
      audio.analyser = audio.ctx.createAnalyser();
      audio.analyser.fftSize = 256;
      audio.analyser.smoothingTimeConstant = 0.62;
      audio.analyser.connect(audio.ctx.destination);
      audio.freqData = new Uint8Array(audio.analyser.frequencyBinCount);
    }
    if (!audio.mediaSource) {
      audio.mediaSource = audio.ctx.createMediaElementSource(bgAudio);
      audio.mediaSource.connect(audio.analyser);
    }
    return true;
  }

  bgAudio.loop = true;
  bgAudio.addEventListener('ended', () => {
    bgAudio.currentTime = 0;
    bgAudio.play().catch(() => {});
  });

  async function tryStartAudio() {
    if (!setupAudioGraph()) return;
    try {
      if (audio.ctx.state === 'suspended') await audio.ctx.resume();
      if (bgAudio.paused) await bgAudio.play();
      state.audioPlaying = !bgAudio.paused;
    } catch {
      // Browser autoplay waits for user interaction
    }
  }

  // Entry Gate: lock scroll + keep background inert; dissolve warning on AGREE
  document.documentElement.classList.add('is-locked');
  document.body.classList.add('is-locked');
  enterBtn.focus({ preventScroll: true });

  const warnTitleEl = document.getElementById('warnTitle');
  const warnDescEl = entryGate.querySelector('.entry-desc');

  function dissolveText(el) {
    if (!el) return;
    const orig = el.textContent;
    let step = 0;
    const timer = setInterval(() => {
      step++;
      let out = '';
      for (let i = 0; i < orig.length; i++) {
        const ch = orig[i];
        if (ch === ' ') out += ' ';
        else if (Math.random() < step * 0.18) out += ' ';
        else if (Math.random() < step * 0.26) out += SCRAMBLE_GLYPHS[(i + step * 3) % SCRAMBLE_GLYPHS.length];
        else out += ch;
      }
      el.textContent = out;
      if (step >= 8) {
        clearInterval(timer);
      }
    }, 38);
  }

  async function enterExperience() {
    if (state.entered) return;
    state.entered = true;

    // Start music synchronously inside click gesture
    tryStartAudio();

    entryGate.classList.add('is-dissolving');
    dissolveText(warnTitleEl);
    dissolveText(warnDescEl);

    setTimeout(() => {
      entryGate.classList.add('is-hidden');
      entryGate.setAttribute('aria-hidden', 'true');
      entryGate.inert = true;
      stageFixed.inert = false;
      heroSection.inert = false;
      profileSheet.inert = false;
      document.documentElement.classList.remove('is-locked');
      document.body.classList.remove('is-locked');
      resize();
      state.audioGlitchBoost = 0.72;
      state.strobeFlash = 0.45;
    }, 340);
  }

  enterBtn.addEventListener('click', enterExperience);

  const TITLE_CALM = ['✦ malinkadev', '✧ malinkadev', '· malinkadev ·', '◈ malinkadev'];
  const TITLE_HYPE = ['✦ MALINKADEV ✦', '▓ M4L1NK4D3V', '▒ m@l1nk@d3v', '✦ m4l1nk4d3v', '█ MALINKADEV █'];

  function syncTabTitle(now, energy, beatPulse, isGlitch) {
    if (!state.entered) return;
    if (now - state.lastTitleSync < 140) return;
    state.lastTitleSync = now;

    const tickIdx = Math.floor(state.motionPos * 2.5);
    if (isGlitch || state.strobeFlash > 0.32 || energy > 0.46) {
      document.title = TITLE_HYPE[(tickIdx + (beatPulse > 0.7 ? 1 : 0)) % TITLE_HYPE.length];
    } else {
      document.title = TITLE_CALM[tickIdx % TITLE_CALM.length];
    }
  }

  function updateScrollState() {
    const maxS = Math.max(1, window.innerHeight);
    state.scrollFrac = Math.min(1, Math.max(0, window.scrollY / maxS));
    scrollCue.classList.toggle('is-hidden', window.scrollY > 40);
  }

  const CALM_SCENES = [3, 4, 6, 8, 12, 14];
  const HYPE_SCENES = [0, 1, 2, 5, 7, 9, 10, 11, 13, 15];

  let lastTs = performance.now();

  function pickFromPool(pool, excludeIdx) {
    const candidates = pool.filter((id) => id !== excludeIdx);
    return candidates[Math.floor(Math.random() * candidates.length)] ?? pool[0];
  }

  function tick(now) {
    const dt = Math.max(0, Math.min(0.05, (now - lastTs) / 1000));
    lastTs = now;

    if (!state.paused) {
      state.elapsed = Math.max(0, state.elapsed + dt);
      state.sceneHoldTime += dt;
      state.manualHoldTimer = Math.max(0, state.manualHoldTimer - dt);
    }

    let bassEnergy = 0, midEnergy = 0, highEnergy = 0;
    if (state.entered && !bgAudio.paused && audio.analyser && audio.freqData) {
      state.audioPlaying = true;
      audio.analyser.getByteFrequencyData(audio.freqData);

      let bSum = 0;
      for (let i = 0; i <= 5; i++) bSum += audio.freqData[i];
      bassEnergy = bSum / (6 * 255);

      let mSum = 0;
      for (let i = 8; i <= 28; i++) mSum += audio.freqData[i];
      midEnergy = mSum / (21 * 255);

      let hSum = 0;
      for (let i = 32; i <= 90; i++) hSum += audio.freqData[i];
      highEnergy = hSum / (59 * 255);

      const midDelta = midEnergy - state.prevMid;
      state.prevMid = state.prevMid * 0.72 + midEnergy * 0.28;
      if (midDelta > 0.055 && state.energySmooth > 0.34) {
        state.audioGlitchBoost = Math.min(0.92, Math.max(state.audioGlitchBoost, 0.45 + midDelta * 3.6));
        state.strobeFlash = Math.min(0.7, Math.max(state.strobeFlash, 0.32 + midDelta * 2.8));
        if (state.scrollFrac > 0.2 && Math.random() < 0.42 && glitchTextEls.length > 0) {
          const pick = glitchTextEls[Math.floor(Math.random() * glitchTextEls.length)];
          triggerGlitchText(pick, true, false);
        }
      }
    } else {
      state.audioPlaying = false;
    }

    state.bassEnergy = bassEnergy;
    state.midEnergy = midEnergy;
    state.highEnergy = highEnergy;
    state.audioGlitchBoost = Math.max(0, state.audioGlitchBoost - dt * 3.6);
    state.strobeFlash = Math.max(0, state.strobeFlash - dt * 6.8);

    // Before clicking ENTER: keep background gentle with zero flashing
    const instantEnergy = !state.entered
      ? 0.2
      : (state.audioPlaying
          ? Math.min(1, bassEnergy * 0.65 + midEnergy * 0.55 + highEnergy * 0.45)
          : 0.28);
    const attackRate = instantEnergy > state.energySmooth ? 5.4 : 1.9;
    state.energySmooth += (instantEnergy - state.energySmooth) * Math.min(1, dt * attackRate);

    const energy = state.energySmooth;
    const isHype = state.entered && energy >= 0.4;

    if (!state.paused) {
      const speedMul = state.entered ? (0.52 + Math.pow(energy, 1.35) * 3.7) : 0.4;
      state.motionPos += dt * speedMul;
    }

    const syncTime = state.audioPlaying ? Math.max(0, bgAudio.currentTime) : state.elapsed;
    const beatCount = syncTime / BEAT_DUR; // 2 beats/sec at 120 BPM
    const beatPhase = beatCount % 1;
    const barIndex = Math.floor(beatCount / 4); // exact 4/4 bar index
    const quarterBeat = Math.floor(beatCount);
    const gridBeat = Math.pow(Math.max(0, 1 - beatPhase * 2.15), 2);
    const beatPulse = !state.entered
      ? 0.12
      : (state.audioPlaying
          ? Math.min(1, Math.max(bassEnergy * 1.25 * (0.4 + energy), gridBeat * energy))
          : gridBeat * 0.42);
    document.documentElement.style.setProperty('--beat', beatPulse.toFixed(3));

    if (state.entered && energy > 0.5 && beatPulse > 0.8) {
      state.strobeFlash = Math.max(state.strobeFlash, 0.36);
    }

    // Scene transitions locked strictly to 4/4 bars (every 2 bars on hype, every 4 bars on calm)
    if (state.entered) {
      const barChanged = barIndex !== state.lastBarIndex;
      const beatChanged = quarterBeat !== state.lastQuarterBeat;

      if (isHype && !state.wasHype && beatChanged) {
        state.wasHype = true;
        state.activeSceneIdx = pickFromPool(HYPE_SCENES, state.activeSceneIdx);
        state.sceneHoldTime = 0;
        state.audioGlitchBoost = Math.max(state.audioGlitchBoost, 0.85);
        state.strobeFlash = Math.max(state.strobeFlash, 0.55);
      } else if (barChanged) {
        state.lastBarIndex = barIndex;
        const barsPerScene = isHype ? 2 : 4; // 2 bars (8 beats) or 4 bars (16 beats) in 4/4
        if (barIndex % barsPerScene === 0) {
          state.wasHype = isHype;
          state.activeSceneIdx = pickFromPool(isHype ? HYPE_SCENES : CALM_SCENES, state.activeSceneIdx);
          state.sceneHoldTime = 0;
        }
      }
      state.lastQuarterBeat = quarterBeat;
    }

    const idx = state.activeSceneIdx;
    const localT = state.sceneHoldTime;

    const grid = createGrid();
    renderCyberBackground(grid, state.motionPos, dt, beatPulse, energy);
    SCENE_FNS[idx](grid, state.motionPos, beatPulse);

    if (state.entered) {
      let glitchStrength = state.audioGlitchBoost;
      if (localT < GLITCH_CUT_DUR) {
        glitchStrength = Math.max(glitchStrength, (1 - localT / GLITCH_CUT_DUR) * (0.45 + energy * 0.55));
      } else if (energy > 0.52 && beatPulse > 0.78 && Math.random() < 0.42) {
        glitchStrength = Math.max(glitchStrength, 0.38 + energy * 0.34);
      }
      applyGlitchPass(grid, glitchStrength, state.motionPos);
    }

    if (state.mouseActive) {
      const mc = state.mouseX * state.cols, mr = state.mouseY * state.rows;
      for (let r = Math.max(1, Math.floor(mr - 4)); r <= Math.min(state.rows - 2, Math.ceil(mr + 4)); r++) {
        for (let c = Math.max(1, Math.floor(mc - 6)); c <= Math.min(state.cols - 2, Math.ceil(mc + 6)); c++) {
          const dist = Math.hypot((c - mc) * 0.62, r - mr);
          if (dist < 3.5) {
            const cellIdx = r * state.cols + c;
            const boost = 1 - dist / 3.5;
            if (grid.chars[cellIdx] === ' ') {
              grid.chars[cellIdx] = boost > 0.6 ? '✦' : CODE_CHARS[(c + r) % CODE_CHARS.length];
              grid.colorT[cellIdx] = state.mouseX + state.motionPos * 0.08;
            }
            grid.alpha[cellIdx] = Math.min(1, Math.max(grid.alpha[cellIdx], boost * 0.85));
            grid.peak[cellIdx] = Math.min(1, grid.peak[cellIdx] + boost * 0.58);
          }
        }
      }
    }

    // Controlled strobe micro-shake on heavy drops (disabled before warning gate is cleared)
    if (state.entered && state.strobeFlash > 0.25) {
      const sx = ((Math.random() - 0.5) * 5 * state.strobeFlash).toFixed(1);
      const sy = ((Math.random() - 0.5) * 4 * state.strobeFlash).toFixed(1);
      mainCanvas.style.transform = `translate(${sx}px, ${sy}px)`;
    } else {
      mainCanvas.style.transform = '';
    }

    mainCtx.clearRect(0, 0, state.width, state.height);
    const beatBrightness = 1.0 + energy * 0.25 + beatPulse * 0.22 + state.strobeFlash * 0.52;
    for (let r = 0; r < state.rows; r++) {
      const py = (r + 0.5) * state.cellH;
      for (let c = 0; c < state.cols; c++) {
        const cellIdx = r * state.cols + c;
        const ch = grid.chars[cellIdx];
        const a = grid.alpha[cellIdx];
        if (ch === ' ' || a <= 0.02) continue;

        const px = (c + 0.5) * state.cellW;
        mainCtx.globalAlpha = a;
        mainCtx.fillStyle = amberColor(
          grid.colorT[cellIdx],
          beatBrightness,
          Math.min(1, grid.peak[cellIdx] + beatPulse * 0.16 + state.strobeFlash * 0.42)
        );
        mainCtx.fillText(ch, px, py);
      }
    }
    mainCtx.globalAlpha = 1;

    glowCtx.clearRect(0, 0, glowCanvas.width, glowCanvas.height);
    glowCtx.drawImage(mainCanvas, 0, 0);

    if (state.scrollFrac > 0.02) {
      renderSheetFx(state.motionPos, dt, beatPulse);
    }

    syncTabTitle(now, energy, beatPulse, state.audioGlitchBoost > 0.35);

    requestAnimationFrame(tick);
  }

  window.addEventListener('mousemove', (e) => {
    state.mouseX = e.clientX / Math.max(1, window.innerWidth);
    state.mouseY = e.clientY / Math.max(1, window.innerHeight);
    state.mouseActive = state.entered && window.scrollY < window.innerHeight * 0.8;
  });

  window.addEventListener('keydown', (e) => {
    if (!state.entered) {
      if (e.key === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        enterExperience();
      }
      return;
    }
    if (e.code === 'Space' && window.scrollY < window.innerHeight * 0.5) {
      e.preventDefault();
      state.paused = !state.paused;
      if (state.paused) bgAudio.pause();
      else tryStartAudio();
    }
  });

  window.addEventListener('scroll', updateScrollState, { passive: true });
  window.addEventListener('resize', resize);

  initParticlesAndAttractors();
  resize();
  updateScrollState();
  requestAnimationFrame(tick);
})();
