export type OtterLoaderInstance = {
  succeed: (opts?: { instant?: boolean }) => void;
  reset: () => void;
  destroy: () => void;
};

export type OtterLoaderOptions = {
  pad?: number;
};

interface Cell {
  i: number;
  j: number;
  on: boolean;
  tone: number;
  row?: number;
  r?: number;
  arrive?: number;
}

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1190 1195" width="1190" height="1195">
  <defs><clipPath id="r"><rect x="0" y="0" width="1190" height="1195" rx="215"/></clipPath></defs>
  
  <g clip-path="url(#r)">
    
    <!-- filled shapes, no strokes -->
    <path d="M355 720 C330 790 300 880 300 1000 C300 1090 305 1160 310 1200 L1080 1200 C1075 1080 1060 880 1035 760 C1020 690 1010 620 1005 560 L620 720 Z" fill="#8AD684"/>
    <path d="M355 730 C300 800 220 900 160 1000 C120 1060 95 1110 85 1200 L295 1200 C290 1100 295 1000 320 900 C335 850 350 790 355 730 Z" fill="#8AD684"/>
    <path d="M255 290 C320 200 440 140 570 128 C690 118 800 150 905 235 C980 300 1015 400 1010 560 C1006 640 985 700 930 720 C820 735 700 735 600 722 C520 715 420 705 350 700 C280 690 210 640 190 560 C175 490 195 400 255 290 Z" fill="#8AD684"/>
    <!-- one continuous outline: jaw, muzzle, crown, right side, down the body -->
    <g fill="none" stroke="#101614" stroke-width="15" stroke-linejoin="round" stroke-linecap="round">
      <path d="M615 722 C520 716 420 706 350 700 C280 690 210 640 190 560 C175 490 195 400 255 290 C320 200 440 140 570 128 C690 118 800 150 905 235 C980 300 1015 400 1010 560 C1015 700 1040 900 1080 1200"/>
      <!-- left arm outline, open at the bottom -->
      <path d="M355 730 C300 800 220 900 160 1000 C120 1060 95 1110 85 1200"/>
      <path d="M355 730 C340 800 320 880 318 960 C315 1050 300 1120 295 1200"/>
      <!-- sketchy inner strokes from the source -->
      <path d="M975 990 C950 1050 920 1110 900 1150" stroke-width="12"/>
      <path d="M700 890 C700 980 690 1080 680 1200" stroke-width="10" opacity="0.7"/>
    </g>
    <!-- chest panel -->
    <path d="M640 760 C660 830 690 880 705 900 C712 1000 705 1100 700 1200 L1005 1200 C1005 1080 990 900 955 780 C880 770 760 765 640 760 Z" fill="#A5E392"/>
    <!-- muzzle -->
    <path d="M180 540 C165 460 215 405 300 402 C345 400 380 410 405 420 C470 400 560 430 585 500 C605 570 585 635 520 640 C455 645 395 625 360 590 C335 630 275 655 235 645 C200 635 185 590 180 540 Z" fill="#BAEBA5"/>
    <!-- eyes -->
    <ellipse cx="305" cy="372" rx="32" ry="46" fill="#4A2020" transform="rotate(-8 305 372)"/>
    <ellipse cx="322" cy="345" rx="15" ry="20" fill="#FFF8EC" transform="rotate(-20 322 345)"/>
    <ellipse cx="602" cy="385" rx="38" ry="56" fill="#4A2020" transform="rotate(-8 602 385)"/>
    <ellipse cx="628" cy="352" rx="17" ry="22" fill="#FFF8EC" transform="rotate(-20 628 352)"/>
    <!-- nose + mouth -->
    <path d="M312 398 C345 388 400 392 430 405 C405 440 385 460 370 468 C350 460 330 430 312 398 Z" fill="#9C4535"/>
    <path d="M370 468 C360 452 345 442 330 440" fill="none" stroke="#7A3328" stroke-width="10" stroke-linecap="round"/>
    <path d="M370 468 C380 452 395 442 410 440" fill="none" stroke="#7A3328" stroke-width="10" stroke-linecap="round"/>
    <!-- cheek spots -->
    <ellipse cx="650" cy="498" rx="30" ry="16" fill="#3E8A63" transform="rotate(-25 650 498)"/>
    <ellipse cx="700" cy="478" rx="30" ry="16" fill="#3E8A63" transform="rotate(-25 700 478)"/>
    <ellipse cx="716" cy="526" rx="30" ry="16" fill="#3E8A63" transform="rotate(-25 716 526)"/>
  </g>
</svg>
`;

const N = 36;
const STEP = 52; // ms per beat
const OFF = 0.12;
const REST = 0.3;
const EDGE = 6;
const GLOW_K = 0.3;
const HANDOFF = 8; // beats the scan takes to fade out after succeed()
const SCAN_EXTRA = 6;
const SCAN_TRAIL = 6; // half period = rows + 6 beats; trail length in beats
const INK: [number, number, number] = [244, 244, 244]; // mono dot colour
const BLUE: [number, number, number] = [30, 122, 255];
const BLUE_LIGHT: [number, number, number] = [70, 150, 255];
const GLOW: [number, number, number] = [232, 243, 255];
const TONE_MONO = [0.42, 0.62, 0.82, 1]; // alpha per tone: muzzle, body, mid, eyes/outline
const TONE_BLUE = [0.3, 0.55, 0.8, 1];
const TONE_R = [0.8, 0.9, 1, 1.08]; // dot radius per tone

const mod = (a: number, n: number) => ((a % n) + n) % n;
const q = (x: number, l: number) => Math.round(x * l) / l;
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const mix = (
  a: [number, number, number],
  b: [number, number, number],
  t: number
): [number, number, number] => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const rgb = (c: [number, number, number], a: number) =>
  `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

// Sample the otter SVG once, shared across all instances
let cells: Cell[] | null = null;
let otter: Cell[] | null = null;
let geo: { H: number; R: number; muzzle: { x: number; y: number } } | null = null;
let ready: Promise<void> | null = null;

function sample(): Promise<void> {
  if (ready) return ready;
  ready = new Promise<void>((res) => {
    if (typeof window === "undefined") {
      res();
      return;
    }
    const img = new Image();
    img.onload = () => {
      const mid = document.createElement("canvas");
      mid.width = mid.height = N * 4;
      const mg = mid.getContext("2d");
      if (!mg) {
        res();
        return;
      }
      mg.imageSmoothingQuality = "high";
      mg.drawImage(img, 0, 0, N * 4, N * 4);

      const c = document.createElement("canvas");
      c.width = c.height = N;
      const g = c.getContext("2d", { willReadFrequently: true });
      if (!g) {
        res();
        return;
      }
      g.imageSmoothingQuality = "high";
      g.drawImage(mid, 0, 0, N, N);

      const p = g.getImageData(0, 0, N, N).data;
      cells = [];
      otter = [];
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          const k = (j * N + i) * 4;
          const a = p[k + 3] / 255;
          const r = a > 0 ? p[k] / a : 0;
          const gg = a > 0 ? p[k + 1] / a : 0;
          const b = a > 0 ? p[k + 2] / a : 0;
          const lum = (0.299 * r + 0.587 * gg + 0.114 * b) / 255;
          const cell: Cell = {
            i,
            j,
            on: a > 0.35,
            tone: lum > 0.76 ? 0 : lum > 0.55 ? 1 : lum > 0.3 ? 2 : 3,
          };
          cells.push(cell);
          if (cell.on) otter.push(cell);
        }
      }

      let sx = 0;
      let sy = 0;
      let minJ = N;
      let maxJ = 0;
      for (const cell of otter) {
        sx += cell.i;
        sy += cell.j;
        minJ = Math.min(minJ, cell.j);
        maxJ = Math.max(maxJ, cell.j);
      }
      const cx = sx / otter.length;
      const cy = sy / otter.length;
      let R = 1;
      for (const cell of otter) {
        R = Math.max(R, Math.hypot(cell.i - cx, cell.j - cy));
      }
      for (const cell of otter) {
        cell.row = cell.j - minJ;
        cell.r = Math.hypot(cell.i - cx, cell.j - cy) / R;
      }

      // Left edge of the muzzle: the lightest dots in the otter's upper left
      const muz = otter.filter((cell) => cell.tone === 0 && cell.j < cy && cell.i < cx);
      let mx = cx;
      let my = cy;
      if (muz.length) {
        const minX = Math.min(...muz.map((cell) => cell.i));
        const col = muz
          .filter((cell) => cell.i <= minX + 1)
          .map((cell) => cell.j)
          .sort((a, b) => a - b);
        mx = minX;
        my = col[col.length >> 1];
      }
      geo = { H: maxJ - minJ + 1, R, muzzle: { x: mx, y: my } };
      for (const cell of otter) {
        cell.arrive = (Math.hypot(cell.i - mx, cell.j - my) / (2 * R)) * 26; // Beat at which the blue reaches this dot
      }
      res();
    };
    img.src = "data:image/svg+xml;utf8," + encodeURIComponent(SVG);
  });
  return ready;
}

// Sine-eased scan bounce with time-based afterglow
const ease = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2; // sine in-out
const easeInv = (y: number) => Math.acos(1 - 2 * clamp(y, 0, 1)) / Math.PI;

function front(s: number) {
  if (!geo) return { pos: 0, down: true, inHalf: 0, P: 1 };
  const P = geo.H + SCAN_EXTRA;
  const ph = mod(s, 2 * P);
  const down = ph < P;
  const u = (down ? ph : ph - P) / P;
  const e = ease(u);
  return { pos: (down ? e : 1 - e) * (geo.H - 1), down, inHalf: down ? ph : ph - P, P };
}

function since(r: number, s: number) {
  if (!geo) return 0;
  const { pos, down, inHalf, P } = front(s);
  const y = r / (geo.H - 1);
  const tDown = P * easeInv(y);
  const tUp = P * easeInv(1 - y);
  if (down) return r <= pos + 1e-9 ? inHalf - tDown : inHalf + (P - tUp);
  return r >= pos - 1e-9 ? inHalf - tUp : inHalf + (P - tDown);
}

function scan(c: Cell, s: number) {
  if (c.row === undefined) return OFF;
  const { pos } = front(s);
  if (Math.abs(c.row - pos) < 0.6) return 1;
  return q(Math.max(OFF, 1 - Math.max(0, since(c.row, s)) / SCAN_TRAIL), 4);
}

export function createOtterLoader(
  canvas: HTMLCanvasElement,
  opts?: OtterLoaderOptions
): OtterLoaderInstance {
  const PAD = opts && opts.pad != null ? opts.pad : 0;
  let tapBeat: number | null = null;
  let last = -1;
  let raf = 0;
  let alive = true;

  function paint(s: number) {
    if (!cells || !otter || !geo) return;
    const dpr = Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 2);
    const size = canvas.clientWidth || 240;
    const targetDim = Math.round(size * dpr);
    if (canvas.width !== targetDim || canvas.height !== targetDim) {
      canvas.width = canvas.height = targetDim;
    }
    const g = canvas.getContext("2d");
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, size, size);

    const pad = size * PAD;
    const cs = (size - 2 * pad) / N;
    const base = cs * 0.34;
    const b = tapBeat == null ? -1 : s - tapBeat; // Beats since succeed()

    g.fillStyle = "rgba(255,255,255,0.12)";
    for (const c of cells) {
      if (c.on) continue;
      g.beginPath();
      g.arc(pad + (c.i + 0.5) * cs, pad + (c.j + 0.5) * cs, base * 0.85, 0, Math.PI * 2);
      g.fill();
    }

    for (const c of otter) {
      const w = b < 0 ? 1 : clamp(1 - b / HANDOFF, 0, 1); // Scan weight: 1 while loading, fades out after succeed()
      const ks = scan(c, s);
      const k = REST + (ks - REST) * w; // Band and trail fade toward dim rest
      const ta = (b < 0 ? TONE_MONO : TONE_BLUE)[c.tone];
      const tr = TONE_R[c.tone];
      let col: [number, number, number] = INK;
      let alpha = (0.16 + 0.84 * k) * ta;
      let rad = base * (0.82 + 0.28 * k) * tr;

      if (b >= 0 && c.arrive !== undefined && c.r !== undefined) {
        const p = clamp((b - c.arrive) / EDGE, 0, 1);
        const glow = p > 0 && p < 1 ? GLOW_K : 0;
        if (p > 0) {
          const breath = 0.9 + 0.1 * Math.sin(s * 0.35 + c.r * 4);
          const blue = mix(BLUE, BLUE_LIGHT, breath - 0.9);
          const a2 = ta * breath;
          col = mix(mix(col, blue, p), GLOW, glow);
          alpha = alpha + (a2 - alpha) * Math.min(1, p + glow);
          rad = rad * (1 + 0.12 * glow) + base * 0.06 * p;
        }
      }

      g.fillStyle = rgb(col, alpha);
      g.beginPath();
      g.arc(pad + (c.i + 0.5) * cs, pad + (c.j + 0.5) * cs, rad, 0, Math.PI * 2);
      g.fill();
    }
  }

  function tick(now: number) {
    if (!alive) return;
    const s = Math.floor(now / STEP);
    if (s !== last) {
      last = s;
      paint(s);
    }
    raf = requestAnimationFrame(tick);
  }

  sample().then(() => {
    if (!alive) return;
    raf = requestAnimationFrame(tick);
  });

  return {
    succeed(o?: { instant?: boolean }) {
      tapBeat = Math.floor(performance.now() / STEP) - (o && o.instant ? 1000 : 0);
    },
    reset() {
      tapBeat = null;
    },
    destroy() {
      alive = false;
      cancelAnimationFrame(raf);
    },
  };
}
