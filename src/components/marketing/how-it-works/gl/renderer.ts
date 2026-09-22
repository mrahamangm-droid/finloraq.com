// Tiny purpose-built WebGL2 renderer for the "How Finloraq works" scene.
//
// Why not Three.js: this scene needs seven draw passes and ~40 objects. A
// focused renderer is ~15 KB instead of ~150 KB gzipped, has no dependency to
// keep patched, and lets every effect (glass boxes with lit edges, a shaded
// orb impostor, flowing ribbons, the document→record "scan" morph) be a
// single cheap shader. Everything is instanced; a frame is ~45 draw calls.

import type { M4, V3 } from "./math";

const HEADER = "#version 300 es\nprecision highp float;\n";

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type);
  if (!s) throw new Error("createShader failed");
  gl.shaderSource(s, HEADER + src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) {
    throw new Error("Shader compile failed: " + gl.getShaderInfoLog(s));
  }
  return s;
}

class Program {
  readonly p: WebGLProgram;
  private readonly locs = new Map<string, WebGLUniformLocation | null>();
  constructor(readonly gl: WebGL2RenderingContext, vs: string, fs: string) {
    const p = gl.createProgram();
    if (!p) throw new Error("createProgram failed");
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) {
      throw new Error("Program link failed: " + gl.getProgramInfoLog(p));
    }
    this.p = p;
  }
  use() { this.gl.useProgram(this.p); return this; }
  u(name: string) {
    if (!this.locs.has(name)) this.locs.set(name, this.gl.getUniformLocation(this.p, name));
    return this.locs.get(name) ?? null;
  }
  m4(n: string, m: M4) { this.gl.uniformMatrix4fv(this.u(n), false, m); return this; }
  v3(n: string, v: V3 | Float32Array) { this.gl.uniform3f(this.u(n), v[0] ?? 0, v[1] ?? 0, v[2] ?? 0); return this; }
  v4(n: string, a: number, b: number, c: number, d: number) { this.gl.uniform4f(this.u(n), a, b, c, d); return this; }
  v2(n: string, a: number, b: number) { this.gl.uniform2f(this.u(n), a, b); return this; }
  f(n: string, v: number) { this.gl.uniform1f(this.u(n), v); return this; }
  i(n: string, v: number) { this.gl.uniform1i(this.u(n), v); return this; }
}

// ---------------------------------------------------------------- shaders

const BG_VS = `
out vec2 vUV;
void main(){ vec2 p = vec2(float((gl_VertexID<<1)&2), float(gl_VertexID&2)); vUV = p; gl_Position = vec4(p*2.0-1.0, 0.0, 1.0); }`;
const BG_FS = `
in vec2 vUV; out vec4 o;
uniform float uAspect; uniform float uTime; uniform vec2 uShift;
void main(){
  vec2 p = vUV; p.x = (p.x - 0.5) * uAspect + 0.5;
  vec3 top = vec3(0.047,0.071,0.145), bot = vec3(0.020,0.031,0.063);
  vec3 c = mix(bot, top, smoothstep(0.0, 1.0, vUV.y));
  c += vec3(0.26,0.22,0.72) * 0.22 * exp(-dot(p-vec2(0.42,0.52)-uShift*0.02, p-vec2(0.42,0.52)-uShift*0.02)*3.2);
  c += vec3(0.10,0.55,0.50) * 0.10 * exp(-dot(p-vec2(0.82,0.62), p-vec2(0.82,0.62))*5.0);
  float v = smoothstep(1.25, 0.35, length((vUV-0.5)*vec2(1.2,1.0)));
  c *= mix(0.55, 1.0, v);
  // dither to kill banding in the dark gradient
  float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898,78.233))) * 43758.5453);
  c += (n - 0.5) / 255.0;
  o = vec4(c, 1.0);
}`;

const GRID_VS = `
layout(location=0) in vec2 aPos;
uniform mat4 uVP; uniform mat4 uModel;
out vec3 vW;
void main(){ vec4 w = uModel * vec4(aPos.x, 0.0, aPos.y, 1.0); vW = w.xyz; gl_Position = uVP * w; }`;
const GRID_FS = `
in vec3 vW; out vec4 o;
uniform vec3 uCam; uniform vec3 uCenter; uniform vec2 uAxes; uniform float uFade;
float line(vec2 c, float w){ vec2 g = abs(fract(c - 0.5) - 0.5) / fwidth(c); return 1.0 - min(min(g.x, g.y) / w, 1.0); }
void main(){
  vec2 c = uAxes.x > 0.5 ? vW.xy : vW.xz;
  float minor = line(c, 1.0) * 0.35, major = line(c / 4.0, 1.2);
  float d = length(vW - uCenter);
  float fade = exp(-d * uFade) * smoothstep(90.0, 10.0, length(vW - uCam));
  float a = max(minor, major) * fade * 0.28;
  o = vec4(vec3(0.42,0.44,0.95) * a, a);
}`;

const BOX_VS = `
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNor;
layout(location=2) in vec4 iM0; layout(location=3) in vec4 iM1; layout(location=4) in vec4 iM2; layout(location=5) in vec4 iM3;
layout(location=6) in vec4 iColor; layout(location=7) in vec4 iScaleGlow;
uniform mat4 uVP;
out vec3 vW; out vec3 vN; out vec3 vL; out vec4 vC; out vec4 vSG;
void main(){
  mat4 M = mat4(iM0, iM1, iM2, iM3);
  vec4 w = M * vec4(aPos, 1.0);
  vW = w.xyz; vL = aPos; vC = iColor; vSG = iScaleGlow;
  vN = normalize(mat3(M) * (aNor / max(iScaleGlow.xyz * iScaleGlow.xyz, vec3(1e-4))));
  gl_Position = uVP * w;
}`;
const BOX_FS = `
in vec3 vW; in vec3 vN; in vec3 vL; in vec4 vC; in vec4 vSG; out vec4 o;
uniform vec3 uCam;
void main(){
  vec3 N = normalize(vN), V = normalize(uCam - vW);
  float fres = pow(1.0 - max(dot(N, V), 0.0), 2.2);
  vec3 d = (0.5 - abs(vL)) * vSG.xyz;
  float mn = min(d.x, min(d.y, d.z)), mx = max(d.x, max(d.y, d.z));
  float mid = d.x + d.y + d.z - mn - mx;
  float edge = 1.0 - smoothstep(0.0, 0.018 + fwidth(mid) * 1.4, mid);
  float glow = vSG.w;
  vec3 L = normalize(vec3(-0.4, 0.9, 0.6));
  vec3 base = vC.rgb * (0.16 + 0.22 * max(N.y, 0.0) + 0.14 * max(dot(N, L), 0.0));
  vec3 col = base + vC.rgb * fres * (0.45 + glow * 0.6) + mix(vC.rgb, vec3(1.0), 0.45) * edge * (0.5 + glow * 0.9) + vC.rgb * glow * 0.45;
  float a = clamp(vC.a + edge * 0.5 + fres * 0.2, 0.0, 1.0);
  o = vec4(col, a);
}`;

const CARD_VS = `
layout(location=0) in vec2 aPos;
layout(location=2) in vec4 iM0; layout(location=3) in vec4 iM1; layout(location=4) in vec4 iM2; layout(location=5) in vec4 iM3;
layout(location=6) in vec4 iUVA; layout(location=7) in vec4 iUVB; layout(location=8) in vec4 iP; layout(location=9) in vec4 iX;
uniform mat4 uVP;
out vec2 vUV; out vec4 vA; out vec4 vB; out vec4 vP; out vec4 vX;
void main(){
  mat4 M = mat4(iM0, iM1, iM2, iM3);
  vUV = aPos + 0.5; vA = iUVA; vB = iUVB; vP = iP; vX = iX;
  gl_Position = uVP * M * vec4(aPos, 0.0, 1.0);
}`;
const CARD_FS = `
in vec2 vUV; in vec4 vA; in vec4 vB; in vec4 vP; in vec4 vX; out vec4 o;
uniform sampler2D uAtlas; uniform float uTime;
float sdRound(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
void main(){
  float aspect = vX.w;
  vec2 uv = gl_FrontFacing ? vUV : vec2(1.0 - vUV.x, vUV.y);
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
  float d = sdRound(p, vec2(aspect, 1.0) * 0.5, 0.06);
  float fw = fwidth(d);
  float shape = 1.0 - smoothstep(-fw, fw, d);
  vec2 tuv = vec2(uv.x, 1.0 - uv.y);
  vec4 ta = texture(uAtlas, vA.xy + tuv * vA.zw);
  vec4 tb = texture(uAtlas, vB.xy + tuv * vB.zw);
  float m = vP.x;
  float line = 1.0 - m;                 // scan moves top → bottom
  float isB = step(line, uv.y) * step(0.001, m);
  vec4 t = mix(ta, tb, isB);
  float band = (m > 0.001 && m < 0.999) ? exp(-abs(uv.y - line) * 55.0) : 0.0;
  float rim = exp(-abs(d) * 60.0) * (0.25 + vP.z);
  vec3 col = t.rgb + vX.rgb * (band * 1.6 + rim * 0.9 + vP.w * 0.12);
  if (!gl_FrontFacing) col *= 0.35;
  float a = shape * vP.y * max(t.a, 0.85);
  if (a < 0.02) discard;
  o = vec4(col, a);
}`;

const ORB_VS = `
layout(location=0) in vec2 aPos;
uniform mat4 uVP; uniform vec3 uCenter; uniform vec3 uRight; uniform vec3 uUp; uniform float uR;
out vec2 vP;
void main(){ vP = aPos * 2.0 * 2.4; vec3 w = uCenter + (uRight * aPos.x + uUp * aPos.y) * uR * 2.0 * 2.4; gl_Position = uVP * vec4(w, 1.0); }`;
const ORB_FS = `
in vec2 vP; out vec4 o;
uniform float uTime; uniform float uPulse; uniform vec3 uA; uniform vec3 uB;
float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec3 x){ vec3 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(hash(i), hash(i+vec3(1,0,0)), f.x), mix(hash(i+vec3(0,1,0)), hash(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i+vec3(0,0,1)), hash(i+vec3(1,0,1)), f.x), mix(hash(i+vec3(0,1,1)), hash(i+vec3(1,1,1)), f.x), f.y), f.z); }
void main(){
  float r = length(vP);
  vec3 col; float a;
  if (r < 1.0) {
    vec3 n = vec3(vP, sqrt(1.0 - r * r));
    float fres = pow(1.0 - n.z, 2.0);
    float t = uTime * 0.35;
    float c1 = cos(t), s1 = sin(t);
    vec3 q = vec3(c1 * n.x - s1 * n.z, n.y, s1 * n.x + c1 * n.z);
    float f = noise(q * 3.2 + vec3(0.0, t, 0.0)) * 0.6 + noise(q * 7.0 - t) * 0.4;
    float iso = abs(fract(f * 7.0) - 0.5);
    float bands = (1.0 - smoothstep(0.0, 0.06 + fwidth(f * 7.0), iso)) * smoothstep(0.25, 0.65, f);
    float lat = abs(fract(atan(q.y, length(q.xz)) * 3.0 + t * 0.4) - 0.5);
    col = mix(uB * 0.18, uA * 0.9, fres) + uA * bands * 0.55 + uB * (1.0 - smoothstep(0.0, 0.04, lat)) * 0.12 * (1.0 - fres);
    col += vec3(0.85, 0.87, 1.0) * exp(-r * r * 5.0) * (0.35 + uPulse * 0.65);
    col += uA * pow(fres, 3.0) * 0.8;
    a = 1.0;
    float e = smoothstep(1.0, 0.96, r);
    col *= e; a = e;
    col += uA * (1.0 - e) * 0.6;
  } else {
    float g = exp(-(r - 1.0) * 3.2) * (0.42 + uPulse * 0.45);
    col = mix(uA, uB, 0.35) * g; a = g;
  }
  o = vec4(col, a);
}`;

const RIB_VS = `
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aTan; layout(location=2) in vec2 aST;
uniform mat4 uVP; uniform mat4 uModel; uniform vec3 uCam; uniform float uWidth;
out float vSide; out float vT;
void main(){
  vec3 w = (uModel * vec4(aPos, 1.0)).xyz;
  vec3 t = normalize(mat3(uModel) * aTan);
  vec3 s = normalize(cross(t, normalize(uCam - w)));
  w += s * aST.x * uWidth * 0.5;
  vSide = aST.x; vT = aST.y;
  gl_Position = uVP * vec4(w, 1.0);
}`;
const RIB_FS = `
in float vSide; in float vT; out vec4 o;
uniform vec3 uColor; uniform vec3 uHeadColor; uniform float uI; uniform float uTime; uniform float uFlow; uniform float uDash; uniform float uHead; uniform float uLit;
void main(){
  float across = exp(-vSide * vSide * 3.0) * (1.0 - vSide * vSide);
  float dash = smoothstep(0.6, 1.0, fract(vT * uDash - uTime * uFlow));
  float ends = smoothstep(0.0, 0.05, vT) * smoothstep(1.0, 0.95, vT);
  float base = (0.35 + 0.65 * dash) * uI;
  float head = 0.0;
  if (uHead > -0.5) { float k = uHead - vT; head = k >= 0.0 ? exp(-k * 9.0) : 0.0; }
  vec3 c = uColor * base + uHeadColor * (head * 1.8 + uLit * 0.9 * (0.4 + 0.6 * dash));
  c *= across * ends;
  o = vec4(c, max(c.r, max(c.g, c.b)));
}`;

const SPR_VS = `
layout(location=0) in vec2 aPos;
layout(location=6) in vec4 iPS; layout(location=7) in vec4 iC;
uniform mat4 uVP; uniform vec3 uRight; uniform vec3 uUp;
out vec2 vUV; out vec4 vC; out float vHalo;
void main(){
  float size = abs(iPS.w); vHalo = iPS.w < 0.0 ? 1.0 : 0.0;
  vUV = aPos * 2.0; vC = iC;
  vec3 w = iPS.xyz + (uRight * aPos.x + uUp * aPos.y) * size;
  gl_Position = uVP * vec4(w, 1.0);
}`;
const SPR_FS = `
in vec2 vUV; in vec4 vC; in float vHalo; out vec4 o;
void main(){
  float r = length(vUV);
  if (r > 1.0) discard;
  float a = vHalo > 0.5 ? exp(-r * r * 4.0) * (1.0 - r) : (pow(1.0 - r, 2.5) + exp(-r * r * 40.0) * 0.8);
  vec3 c = vC.rgb * a * vC.a;
  o = vec4(c, a * vC.a);
}`;

// ---------------------------------------------------------------- geometry

const CUBE = (() => {
  const f: number[] = [];
  const faces: Array<[V3, V3, V3]> = [
    [[1, 0, 0], [0, 1, 0], [0, 0, 1]], [[-1, 0, 0], [0, 1, 0], [0, 0, -1]],
    [[0, 1, 0], [0, 0, 1], [1, 0, 0]], [[0, -1, 0], [0, 0, -1], [1, 0, 0]],
    [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
  ];
  for (const [n, u, v] of faces) {
    const c = (a: number, b: number): number[] => [0, 1, 2].map((i) => n[i as 0] * 0.5 + u[i as 0] * a * 0.5 + v[i as 0] * b * 0.5);
    const quad = [c(-1, -1), c(1, -1), c(1, 1), c(-1, -1), c(1, 1), c(-1, 1)];
    // keep CCW winding facing +n
    const cr = (() => { const a = quad[0]!, b = quad[1]!, d = quad[2]!; const e1 = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!], e2 = [d[0]! - a[0]!, d[1]! - a[1]!, d[2]! - a[2]!]; return [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!]; })();
    const flip = cr[0]! * n[0] + cr[1]! * n[1] + cr[2]! * n[2] < 0;
    const order = flip ? [0, 2, 1, 3, 5, 4] : [0, 1, 2, 3, 4, 5];
    for (const i of order) f.push(...quad[i]!, ...n);
  }
  return new Float32Array(f);
})();

const QUAD = new Float32Array([-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, 0.5]);

// ---------------------------------------------------------------- public API

export const BOX_STRIDE = 24; // mat4 + color(4) + scaleGlow(4)
export const CARD_STRIDE = 32; // mat4 + uvA(4) + uvB(4) + params(4) + extra(4)
export const SPRITE_STRIDE = 8; // posSize(4) + color(4)

export interface RibbonHandle {
  vao: WebGLVertexArrayObject;
  count: number;
}

export interface RibbonDraw {
  handle: RibbonHandle;
  model: M4;
  width: number;
  color: V3;
  headColor: V3;
  intensity: number;
  flow: number;
  dash: number;
  head: number;
  lit: number;
}

export interface FrameState {
  vp: M4;
  cam: V3;
  right: V3;
  up: V3;
  time: number;
  aspect: number;
  shift: [number, number];
}

export class GLRenderer {
  readonly gl: WebGL2RenderingContext;
  private bg: Program; private grid: Program; private box: Program; private card: Program;
  private orb: Program; private rib: Program; private spr: Program;
  private emptyVao: WebGLVertexArrayObject;
  private gridVao: WebGLVertexArrayObject;
  private boxVao: WebGLVertexArrayObject; private boxBuf: WebGLBuffer;
  private cardVao: WebGLVertexArrayObject; private cardBuf: WebGLBuffer;
  private orbVao: WebGLVertexArrayObject;
  private sprVao: WebGLVertexArrayObject; private sprBuf: WebGLBuffer;
  private atlas: WebGLTexture | null = null;
  private owned: Array<WebGLBuffer | WebGLVertexArrayObject> = [];

  constructor(gl: WebGL2RenderingContext, maxBoxes: number, maxCards: number, maxSprites: number) {
    this.gl = gl;
    this.bg = new Program(gl, BG_VS, BG_FS);
    this.grid = new Program(gl, GRID_VS, GRID_FS);
    this.box = new Program(gl, BOX_VS, BOX_FS);
    this.card = new Program(gl, CARD_VS, CARD_FS);
    this.orb = new Program(gl, ORB_VS, ORB_FS);
    this.rib = new Program(gl, RIB_VS, RIB_FS);
    this.spr = new Program(gl, SPR_VS, SPR_FS);

    this.emptyVao = this.vao();

    this.gridVao = this.vao();
    this.buffer(new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]));
    this.attr(0, 2, 8, 0);

    this.boxVao = this.vao();
    this.buffer(CUBE);
    this.attr(0, 3, 24, 0); this.attr(1, 3, 24, 12);
    this.boxBuf = this.buffer(new Float32Array(maxBoxes * BOX_STRIDE), gl.DYNAMIC_DRAW);
    this.instMat(2, BOX_STRIDE * 4, 0); this.inst(6, 4, BOX_STRIDE * 4, 64); this.inst(7, 4, BOX_STRIDE * 4, 80);

    this.cardVao = this.vao();
    this.buffer(QUAD); this.attr(0, 2, 8, 0);
    this.cardBuf = this.buffer(new Float32Array(maxCards * CARD_STRIDE), gl.DYNAMIC_DRAW);
    this.instMat(2, CARD_STRIDE * 4, 0);
    this.inst(6, 4, CARD_STRIDE * 4, 64); this.inst(7, 4, CARD_STRIDE * 4, 80); this.inst(8, 4, CARD_STRIDE * 4, 96); this.inst(9, 4, CARD_STRIDE * 4, 112);

    this.orbVao = this.vao();
    this.buffer(QUAD); this.attr(0, 2, 8, 0);

    this.sprVao = this.vao();
    this.buffer(QUAD); this.attr(0, 2, 8, 0);
    this.sprBuf = this.buffer(new Float32Array(maxSprites * SPRITE_STRIDE), gl.DYNAMIC_DRAW);
    this.inst(6, 4, SPRITE_STRIDE * 4, 0); this.inst(7, 4, SPRITE_STRIDE * 4, 16);
    gl.bindVertexArray(null);
  }

  private vao() { const v = this.gl.createVertexArray(); if (!v) throw new Error("VAO"); this.gl.bindVertexArray(v); this.owned.push(v); return v; }
  private buffer(data: Float32Array, usage: number = this.gl.STATIC_DRAW) {
    const gl = this.gl, b = gl.createBuffer(); if (!b) throw new Error("buffer");
    gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, usage); this.owned.push(b); return b;
  }
  private attr(loc: number, size: number, stride: number, off: number) {
    this.gl.enableVertexAttribArray(loc); this.gl.vertexAttribPointer(loc, size, this.gl.FLOAT, false, stride, off);
  }
  private inst(loc: number, size: number, stride: number, off: number) { this.attr(loc, size, stride, off); this.gl.vertexAttribDivisor(loc, 1); }
  private instMat(loc: number, stride: number, off: number) { for (let i = 0; i < 4; i++) this.inst(loc + i, 4, stride, off + i * 16); }

  setAtlas(canvas: HTMLCanvasElement) {
    const gl = this.gl;
    if (this.atlas) gl.deleteTexture(this.atlas);
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const aniso = gl.getExtension("EXT_texture_filter_anisotropic");
    if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, 4);
    this.atlas = t;
  }

  /** Builds a ribbon mesh (a strip along a path) once; draw it every frame with drawRibbon. */
  createRibbon(pts: Float32Array): RibbonHandle {
    const gl = this.gl, n = pts.length / 3;
    const data = new Float32Array(n * 2 * 8);
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1) * 3, b = Math.min(n - 1, i + 1) * 3;
      let tx = (pts[b] ?? 0) - (pts[a] ?? 0), ty = (pts[b + 1] ?? 0) - (pts[a + 1] ?? 0), tz = (pts[b + 2] ?? 0) - (pts[a + 2] ?? 0);
      const l = Math.hypot(tx, ty, tz) || 1; tx /= l; ty /= l; tz /= l;
      for (let s = 0; s < 2; s++) {
        const o = (i * 2 + s) * 8;
        data[o] = pts[i * 3] ?? 0; data[o + 1] = pts[i * 3 + 1] ?? 0; data[o + 2] = pts[i * 3 + 2] ?? 0;
        data[o + 3] = tx; data[o + 4] = ty; data[o + 5] = tz;
        data[o + 6] = s === 0 ? -1 : 1; data[o + 7] = i / (n - 1);
      }
    }
    const vao = this.vao();
    this.buffer(data);
    this.attr(0, 3, 32, 0); this.attr(1, 3, 32, 12); this.attr(2, 2, 32, 24);
    gl.bindVertexArray(null);
    return { vao, count: n * 2 };
  }

  resize(w: number, h: number) { this.gl.viewport(0, 0, w, h); }

  frame(
    f: FrameState,
    grid: { model: M4; center: V3; vertical: boolean },
    boxes: { data: Float32Array; count: number },
    cards: { data: Float32Array; count: number },
    orb: { center: V3; radius: number; pulse: number } | null,
    ribbons: readonly RibbonDraw[],
    sprites: { data: Float32Array; count: number },
  ) {
    const gl = this.gl;
    gl.disable(gl.DEPTH_TEST); gl.depthMask(false); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE);

    this.bg.use().f("uAspect", f.aspect).f("uTime", f.time).v2("uShift", f.shift[0], f.shift[1]);
    gl.bindVertexArray(this.emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.depthMask(true);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    // grid
    gl.enable(gl.DEPTH_TEST);
    this.grid.use().m4("uVP", f.vp).m4("uModel", grid.model).v3("uCam", f.cam).v3("uCenter", grid.center)
      .v2("uAxes", grid.vertical ? 1 : 0, 0).f("uFade", 0.045);
    gl.bindVertexArray(this.gridVao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // glass boxes
    gl.depthMask(true);
    if (boxes.count) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.boxBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, boxes.data, 0, boxes.count * BOX_STRIDE);
      this.box.use().m4("uVP", f.vp).v3("uCam", f.cam);
      gl.bindVertexArray(this.boxVao);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 36, boxes.count);
    }

    // cards
    if (cards.count && this.atlas) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.cardBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, cards.data, 0, cards.count * CARD_STRIDE);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.atlas);
      this.card.use().m4("uVP", f.vp).i("uAtlas", 0).f("uTime", f.time);
      gl.bindVertexArray(this.cardVao);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, cards.count);
    }

    // additive light: orb, ribbons, sprites
    gl.depthMask(false);
    gl.blendFunc(gl.ONE, gl.ONE);
    if (orb) {
      this.orb.use().m4("uVP", f.vp).v3("uCenter", orb.center).v3("uRight", f.right).v3("uUp", f.up)
        .f("uR", orb.radius).f("uTime", f.time).f("uPulse", orb.pulse)
        .v3("uA", [0.52, 0.47, 1.0]).v3("uB", [0.18, 0.74, 0.66]);
      gl.bindVertexArray(this.orbVao);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    this.rib.use().m4("uVP", f.vp).v3("uCam", f.cam).f("uTime", f.time);
    for (const r of ribbons) {
      if (r.intensity <= 0.001 && r.lit <= 0.001 && r.head < -0.5) continue;
      this.rib.m4("uModel", r.model).f("uWidth", r.width).v3("uColor", r.color).v3("uHeadColor", r.headColor)
        .f("uI", r.intensity).f("uFlow", r.flow).f("uDash", r.dash).f("uHead", r.head).f("uLit", r.lit);
      gl.bindVertexArray(r.handle.vao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, r.handle.count);
    }
    if (sprites.count) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.sprBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, sprites.data, 0, sprites.count * SPRITE_STRIDE);
      this.spr.use().m4("uVP", f.vp).v3("uRight", f.right).v3("uUp", f.up);
      gl.bindVertexArray(this.sprVao);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, sprites.count);
    }
    gl.bindVertexArray(null);
  }

  dispose() {
    const gl = this.gl;
    for (const o of this.owned) {
      if (o instanceof WebGLBuffer) gl.deleteBuffer(o); else gl.deleteVertexArray(o);
    }
    if (this.atlas) gl.deleteTexture(this.atlas);
    for (const p of [this.bg, this.grid, this.box, this.card, this.orb, this.rib, this.spr]) gl.deleteProgram(p.p);
  }
}
