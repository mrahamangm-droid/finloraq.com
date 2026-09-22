// Minimal 3D math for the homepage scene: just what it uses, column-major like WebGL.

export type V3 = [number, number, number];
export type M4 = Float32Array;

export const v3 = (x = 0, y = 0, z = 0): V3 => [x, y, z];
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
export const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a: V3): V3 => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (x: number) => { const t = clamp(x); return t * t * (3 - 2 * t); };
export const easeInOut = (x: number) => { const t = clamp(x); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
export const easeOut = (x: number) => 1 - Math.pow(1 - clamp(x), 3);
export const easeOutBack = (x: number) => { const t = clamp(x), c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
/** 0→1 progress of `t` within [a, b]. */
export const span = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
/** Frame-rate independent damping factor. */
export const damp = (lambda: number, dt: number) => 1 - Math.exp(-lambda * dt);

export const mat4 = (): M4 => { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; };

export function perspective(out: M4, fovy: number, aspect: number, near: number, far: number): M4 {
  const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  out.fill(0);
  out[0] = f / aspect; out[5] = f; out[10] = (far + near) * nf; out[11] = -1; out[14] = 2 * far * near * nf;
  return out;
}

export function lookAt(out: M4, eye: V3, target: V3, up: V3 = [0, 1, 0]): M4 {
  const z = norm(sub(eye, target));
  const x = norm(cross(up, z));
  const y = cross(z, x);
  out[0] = x[0]; out[1] = y[0]; out[2] = z[0]; out[3] = 0;
  out[4] = x[1]; out[5] = y[1]; out[6] = z[1]; out[7] = 0;
  out[8] = x[2]; out[9] = y[2]; out[10] = z[2]; out[11] = 0;
  out[12] = -dot(x, eye); out[13] = -dot(y, eye); out[14] = -dot(z, eye); out[15] = 1;
  return out;
}

export function multiply(out: M4, a: M4, b: M4): M4 {
  const r = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let rI = 0; rI < 4; rI++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += (a[k * 4 + rI] ?? 0) * (b[c * 4 + k] ?? 0);
      r[c * 4 + rI] = s;
    }
  }
  out.set(r);
  return out;
}

/** Writes translate · rotate(XYZ euler) · scale into `out` at `offset` (for instance buffers). */
export function compose(out: Float32Array, offset: number, p: V3, r: V3, s: V3): void {
  const [cx, cy, cz] = [Math.cos(r[0]), Math.cos(r[1]), Math.cos(r[2])];
  const [sx, sy, sz] = [Math.sin(r[0]), Math.sin(r[1]), Math.sin(r[2])];
  // R = Rz · Ry · Rx
  const m00 = cy * cz, m01 = sx * sy * cz - cx * sz, m02 = cx * sy * cz + sx * sz;
  const m10 = cy * sz, m11 = sx * sy * sz + cx * cz, m12 = cx * sy * sz - sx * cz;
  const m20 = -sy, m21 = sx * cy, m22 = cx * cy;
  const o = offset;
  out[o] = m00 * s[0]; out[o + 1] = m10 * s[0]; out[o + 2] = m20 * s[0]; out[o + 3] = 0;
  out[o + 4] = m01 * s[1]; out[o + 5] = m11 * s[1]; out[o + 6] = m21 * s[1]; out[o + 7] = 0;
  out[o + 8] = m02 * s[2]; out[o + 9] = m12 * s[2]; out[o + 10] = m22 * s[2]; out[o + 11] = 0;
  out[o + 12] = p[0]; out[o + 13] = p[1]; out[o + 14] = p[2]; out[o + 15] = 1;
}

/** Projects a world point with a view-projection matrix. Returns NDC xy + clip w. */
export function project(vp: M4, p: V3): { x: number; y: number; w: number } {
  const x = (vp[0] ?? 0) * p[0] + (vp[4] ?? 0) * p[1] + (vp[8] ?? 0) * p[2] + (vp[12] ?? 0);
  const y = (vp[1] ?? 0) * p[0] + (vp[5] ?? 0) * p[1] + (vp[9] ?? 0) * p[2] + (vp[13] ?? 0);
  const w = (vp[3] ?? 0) * p[0] + (vp[7] ?? 0) * p[1] + (vp[11] ?? 0) * p[2] + (vp[15] ?? 0);
  return { x: x / w, y: y / w, w };
}

/**
 * A smooth path through control points (centripetal-ish Catmull-Rom),
 * resampled to equal arc-length steps so `at(t)` moves at constant speed.
 */
export class Path {
  readonly pts: Float32Array;
  readonly n: number;
  readonly length: number;

  constructor(ctrl: readonly V3[], samples = 64) {
    const raw: V3[] = [];
    const P = (i: number): V3 => ctrl[Math.max(0, Math.min(ctrl.length - 1, i))] ?? [0, 0, 0];
    const segs = Math.max(1, ctrl.length - 1);
    const per = Math.max(8, Math.ceil((samples * 3) / segs));
    for (let s = 0; s < segs; s++) {
      const p0 = P(s - 1), p1 = P(s), p2 = P(s + 1), p3 = P(s + 2);
      for (let k = 0; k < per; k++) {
        const t = k / per, t2 = t * t, t3 = t2 * t;
        const c = (i: 0 | 1 | 2) =>
          0.5 * (2 * p1[i] + (-p0[i] + p2[i]) * t + (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t2 + (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * t3);
        raw.push([c(0), c(1), c(2)]);
      }
    }
    raw.push(P(ctrl.length - 1));
    const cum = [0];
    for (let i = 1; i < raw.length; i++) cum.push((cum[i - 1] ?? 0) + len(sub(raw[i] as V3, raw[i - 1] as V3)));
    const total = cum[cum.length - 1] ?? 0;
    this.length = total;
    this.n = samples;
    this.pts = new Float32Array((samples + 1) * 3);
    let j = 0;
    for (let i = 0; i <= samples; i++) {
      const d = (i / samples) * total;
      while (j < cum.length - 2 && (cum[j + 1] ?? 0) < d) j++;
      const a = raw[j] as V3, b = (raw[j + 1] ?? a) as V3;
      const segLen = (cum[j + 1] ?? 0) - (cum[j] ?? 0) || 1;
      const p = lerp3(a, b, clamp((d - (cum[j] ?? 0)) / segLen));
      this.pts.set(p, i * 3);
    }
  }

  at(t: number, out: V3 = [0, 0, 0]): V3 {
    const f = clamp(t) * this.n;
    const i = Math.min(this.n - 1, Math.floor(f));
    const k = f - i, a = i * 3, b = a + 3, p = this.pts;
    out[0] = (p[a] ?? 0) + ((p[b] ?? 0) - (p[a] ?? 0)) * k;
    out[1] = (p[a + 1] ?? 0) + ((p[b + 1] ?? 0) - (p[a + 1] ?? 0)) * k;
    out[2] = (p[a + 2] ?? 0) + ((p[b + 2] ?? 0) - (p[a + 2] ?? 0)) * k;
    return out;
  }
}

/** Deterministic PRNG so the layout is identical on every load. */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
