// Splits the native splash mark into the two layers `LaunchSplash` animates:
// apps/mobile/assets/images/splash-check.png and splash-leaf.png. Both are
// rasterised from the logo/ghiras-icon.svg geometry onto the same 512px canvas
// and placement as splash-icon.png, and the script prints how far their
// composite strays from that file (meanErr ~0.25/255 at the defaults below).
//
// usage, from the repo root (pngjs ships with Expo's toolchain):
//   node logo/splash-layers.js node_modules/.pnpm/pngjs@3.4.0/node_modules/pngjs \
//     apps/mobile/assets/images/splash-icon.png apps/mobile/assets/images
// Pass `-` as the output dir to only print the diff. Optional trailing args
// override the unit→pixel transform: <scale> <offsetX> <offsetY>.
const fs = require("fs");
const path = require("path");
const { PNG } = require(path.resolve(process.argv[2]));
const ref = PNG.sync.read(fs.readFileSync(process.argv[3]));
const outDir = process.argv[4];
const S = Number(process.argv[5] ?? 6.245);
const OX = Number(process.argv[6] ?? -75.2);
const OY = Number(process.argv[7] ?? -37.2);
const N = 512;
const SS = 6; // supersamples per axis

const segDist = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};
const bez = (p0, p1, p2, p3, steps) => {
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, u = 1 - t;
    out.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ]);
  }
  return out;
};
const leafPoly = [
  ...bez([66, 44], [66, 27], [76, 16], [91, 16], 120),
  ...bez([91, 16], [91, 33], [81, 44], [66, 44], 120),
];
const inPoly = (x, y) => {
  if (x < 65.9 || x > 91.1 || y < 15.9 || y > 44.1) return false;
  let inside = false;
  for (let i = 0, j = leafPoly.length - 1; i < leafPoly.length; j = i++) {
    const [xi, yi] = leafPoly[i], [xj, yj] = leafPoly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const inCheck = (x, y) =>
  segDist(x, y, 20, 56, 40, 76) <= 6 || segDist(x, y, 40, 76, 66, 44) <= 6;
const inVein = (x, y) => segDist(x, y, 68, 42, 84, 26) <= 1.25;

const LEAF = [0xcf, 0xf2, 0xe0];
const VEIN = [0x1f, 0x7a, 0x5c];
const check = new PNG({ width: N, height: N });
const leaf = new PNG({ width: N, height: N });
let err = 0, maxErr = 0;
for (let py = 0; py < N; py++) {
  for (let px = 0; px < N; px++) {
    let c = 0, l = 0, v = 0;
    const cu = (px + 0.5 - OX) / S, cw = (py + 0.5 - OY) / S;
    const near = cu > 12 && cu < 93 && cw > 14 && cw < 84;
    for (let sy = 0; near && sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const u = (px + (sx + 0.5) / SS - OX) / S;
        const w = (py + (sy + 0.5) / SS - OY) / S;
        if (inCheck(u, w)) c++;
        if (inPoly(u, w)) l++;
        if (inVein(u, w)) v++;
      }
    }
    const n = SS * SS, i = (py * N + px) * 4;
    const ac = c / n, al = l / n, av = (v / n) * 0.5;
    check.data.set([255, 255, 255, Math.round(ac * 255)], i);
    // vein (50% opacity) over the leaf, straight-alpha "over"
    const a = av + al * (1 - av);
    const mix = (k) => (a ? (VEIN[k] * av + LEAF[k] * al * (1 - av)) / a : 0);
    leaf.data.set([mix(0), mix(1), mix(2), a * 255].map(Math.round), i);
    // composite leaf over check, compare with the shipped splash icon
    const A = a + ac * (1 - a);
    const comp = [0, 1, 2].map((k) => (A ? (mix(k) * a + 255 * ac * (1 - a)) / A : 0));
    const r = ref.data;
    const e =
      Math.abs(A * 255 - r[i + 3]) +
      (A > 0.5 && r[i + 3] > 128 ? [0, 1, 2].reduce((s, k) => s + Math.abs(comp[k] - r[i + k]), 0) / 3 : 0);
    err += e;
    maxErr = Math.max(maxErr, e);
  }
}
console.log(`S=${S} OX=${OX} OY=${OY} meanErr=${(err / (N * N)).toFixed(4)} maxErr=${maxErr.toFixed(1)}`);
if (outDir !== "-") {
  fs.writeFileSync(path.join(outDir, "splash-check.png"), PNG.sync.write(check));
  fs.writeFileSync(path.join(outDir, "splash-leaf.png"), PNG.sync.write(leaf));
}
