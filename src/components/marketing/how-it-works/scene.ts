// The "How Finloraq works" 3D scene: layout, story timeline, camera, labels.
//
// One document at a time travels the full pipeline:
//   input card → AI core (scanned: document morphs into a structured record)
//   → routed to its modules → filed down through Journal/Ledger/Reconciliation/
//   Reports → sparks feed Intelligence → an action card waits for approval →
//   the concierge replies.
// Everything is driven by a single clock `t` (seconds into the story), so the
// scene can be paused, scrubbed by phase, or frozen on its final frame for
// reduced motion without separate code paths.

import { CORE_STEPS, CONCIERGE_CHANNELS, ENGINE_STEPS, INPUTS, INTEL_STEPS, MODULES, STAGES } from "./content";
import type { InputKind, ModuleId, Trace } from "./content";
import { CARD_ASPECT, drawAtlas, faceUV } from "./gl/atlas";
import type { FaceId } from "./gl/atlas";
import {
  Path, add, clamp, compose, damp, easeInOut, easeOut, easeOutBack, lerp, lerp3, lookAt, mat4, multiply, norm, perspective,
  project, rng, scale, smooth, span, sub, v3,
} from "./gl/math";
import type { M4, V3 } from "./gl/math";
import { BOX_STRIDE, CARD_STRIDE, GLRenderer, SPRITE_STRIDE } from "./gl/renderer";
import type { RibbonDraw, RibbonHandle } from "./gl/renderer";

// ------------------------------------------------------------------ timeline

export const T = {
  fly: 0.45, arrive: 1.35,
  steps: [1.55, 2.05, 2.55, 3.05] as const,
  morphA: 1.6, morphB: 3.3,
  toModule: 3.5, atModule: 4.25, toEngine: 4.45, atEngine: 5.05,
  slabs: [5.15, 5.5, 5.85, 6.2] as const,
  engineOut: 6.5,
  intel: [6.75, 7.1, 7.45, 7.8] as const,
  action: 8.0, actionIn: 8.5, toConcierge: 9.0, reply: 9.4,
  end: 10.8, total: 11.8,
};

/** Start time of each headline phase (drop, understand, record, analyze, act, respond). */
export const PHASE_START = [0, T.arrive, T.toModule, T.engineOut, T.action, T.toConcierge] as const;

export function phaseAt(t: number): number {
  let p = 0;
  for (let i = 0; i < PHASE_START.length; i++) if (t >= PHASE_START[i]!) p = i;
  return p;
}

// ------------------------------------------------------------------ layout

interface Layout {
  portrait: boolean;
  flow: V3;
  stage: V3[];
  titles: V3[];
  cards: Array<{ p: V3; r: V3 }>;
  cardSize: [number, number];
  core: V3; coreR: number; nodes: V3[]; rings: number[];
  modules: V3[]; moduleSize: V3;
  slabs: V3[]; slabSize: V3;
  bars: V3[]; barLen: number; barSize: [number, number];
  channels: V3[]; channelSize: V3;
  action: V3; reply: V3;
  intelIn: V3; intelOut: V3; conciergeIn: V3;
  bounds: { min: V3; max: V3 };
}

function buildLayout(portrait: boolean): Layout {
  const R = rng(7);
  if (!portrait) {
    const X = [-15.6, -8.4, -1.3, 4.9, 10.3, 15.8];
    const stage = X.map((x) => v3(x, 0, 0));
    const cards: Layout["cards"] = [];
    for (let i = 0; i < 8; i++) {
      const col = i % 2, row = Math.floor(i / 2);
      cards.push({ p: v3(X[0]! + (col ? 0.88 : -0.88), 3.1 - row * 2.07, col ? -0.35 : 0.35), r: v3((R() - 0.5) * 0.12, (col ? -1 : 1) * 0.16 + (R() - 0.5) * 0.1, (R() - 0.5) * 0.08) });
    }
    const core = v3(X[1]!, 0, 0), coreR = 1.7;
    const nodes = [135, 45, -45, -135].map((a) => v3(core[0] + Math.cos((a * Math.PI) / 180) * 2.85, Math.sin((a * Math.PI) / 180) * 2.85, 0.4));
    const modules = MODULES.map((_, i) => v3(X[2]!, 3.85 - i * 1.1, 0));
    const slabs = [2.25, 0.75, -0.75, -2.25].map((y) => v3(X[3]!, y, 0));
    const bars = [2.1, 0.7, -0.7, -2.1].map((y) => v3(X[4]! - 1.45, y, 0));
    const channels = [1.5, 0, -1.5].map((y) => v3(X[5]!, y + 0.8, 0));
    return {
      portrait, flow: v3(1, 0, 0), stage,
      titles: X.map((x) => v3(x, 5.35, 0)),
      cards, cardSize: [1.3, 1.62],
      core, coreR, nodes, rings: [2.3, 2.75, 3.25],
      modules, moduleSize: v3(2.3, 0.62, 0.5),
      slabs, slabSize: v3(2.8, 0.26, 1.9),
      bars, barLen: 2.9, barSize: [0.34, 0.5],
      channels, channelSize: v3(2.4, 0.62, 0.5),
      action: v3(X[4]!, -4.0, 0.6), reply: v3(X[5]!, -2.35, 0.6),
      intelIn: v3(X[4]! - 1.9, 0, 0), intelOut: v3(X[4]!, -2.75, 0.3), conciergeIn: v3(X[5]! - 1.5, 0.8, 0),
      bounds: { min: v3(-17.4, -5.6, 0), max: v3(17.6, 5.8, 0) },
    };
  }
  const Y = [0, -6.3, -13.4, -19.7, -25.5, -33.4];
  const stage = Y.map((y) => v3(0, y, 0));
  const cards: Layout["cards"] = [];
  for (let i = 0; i < 8; i++) {
    const col = i % 4, row = Math.floor(i / 4);
    cards.push({ p: v3(-2.7 + col * 1.8, 0.95 - row * 1.9, (col % 2 ? -0.3 : 0.3)), r: v3((R() - 0.5) * 0.12, (R() - 0.5) * 0.3, (R() - 0.5) * 0.08) });
  }
  const core = v3(0, Y[1]!, 0), coreR = 1.45;
  const nodes = [135, 45, -45, -135].map((a) => v3(Math.cos((a * Math.PI) / 180) * 2.35, core[1] + Math.sin((a * Math.PI) / 180) * 2.35, 0.4));
  const modules = MODULES.map((_, i) => v3(i % 2 ? 1.65 : -1.65, Y[2]! + 1.35 - Math.floor(i / 2) * 0.9, 0));
  const slabs = [1.35, 0.45, -0.45, -1.35].map((d) => v3(0, Y[3]! + d, 0));
  const bars = [1.35, 0.45, -0.45, -1.35].map((d) => v3(-2.3, Y[4]! + d, 0));
  const channels = [-2.35, 0, 2.35].map((x) => v3(x, Y[5]! + 0.7, 0));
  return {
    portrait, flow: v3(0, -1, 0), stage,
    titles: Y.map((y, i) => v3(0, y + [2.55, 3.35, 2.45, 2.3, 2.3, 1.75][i]!, 0)),
    cards, cardSize: [1.2, 1.5],
    core, coreR, nodes, rings: [1.9, 2.3, 2.7],
    modules, moduleSize: v3(3.0, 0.6, 0.45),
    slabs, slabSize: v3(4.4, 0.24, 1.8),
    bars, barLen: 4.6, barSize: [0.3, 0.45],
    channels, channelSize: v3(2.1, 0.6, 0.45),
    action: v3(0, -29.3, 0.9), reply: v3(1.2, Y[5]! - 1.35, 0.9),
    intelIn: v3(0, Y[4]! + 1.95, 0), intelOut: v3(0, Y[4]! - 1.9, 0), conciergeIn: v3(0, Y[5]! + 1.25, 0),
    bounds: { min: v3(-4.3, Y[5]! - 2.4, 0), max: v3(4.3, 3.0, 0) },
  };
}

// ------------------------------------------------------------------ labels

interface Label {
  el: HTMLElement;
  pos: () => V3;
  lit: () => number;
  vis: () => number;
  last: { x: number; y: number; o: number; lit: boolean };
}

// ------------------------------------------------------------------ scene

export interface SceneCallbacks {
  onPhase?: (phase: number) => void;
  onTick?: (t: number) => void;
  onEnd?: () => void;
  onCardClick?: (kind: InputKind) => void;
  onContextLost?: () => void;
}

const COL = {
  indigo: v3(0.45, 0.41, 1.0),
  indigoDim: v3(0.3, 0.3, 0.72),
  teal: v3(0.18, 0.74, 0.66),
  amber: v3(0.9, 0.64, 0.25),
  white: v3(0.85, 0.9, 1.0),
};

export class FlowScene {
  private static support: boolean | undefined;
  static supported(): boolean {
    if (FlowScene.support === undefined) {
      try {
        const gl = document.createElement("canvas").getContext("webgl2");
        FlowScene.support = !!gl;
        gl?.getExtension("WEBGL_lose_context")?.loseContext(); // free the probe context right away
      } catch {
        FlowScene.support = false;
      }
    }
    return FlowScene.support;
  }

  private gl: WebGL2RenderingContext;
  private r: GLRenderer;
  private L!: Layout;
  private dpr = 1;
  private maxDpr: number;
  private w = 1; private h = 1;
  private raf = 0;
  private running = false;
  private visible = false;
  private paused = false;
  private readonly reduced: boolean;
  private last = 0;
  private frameTimes: number[] = [];

  // story
  private t = 0;
  private clock = 0; // wall time, drives ambient motion
  private trace: Trace;
  private cardIndex = 5;
  private moduleIdx: number[] = [1];
  private channelIdx = 1;
  private hold = false; // single play: stop at the end instead of looping
  private queue: Trace[] = [];
  private queueI = 0;
  private lastPhase = -1;
  private flights!: { toCore: Path; toModule: Path; toEngine: Path };

  // camera
  private mode: "overview" | "follow" = "overview";
  private camTarget = v3(); private camEye = v3(0, 4, 30);
  private goalTarget = v3(); private goalEye = v3();
  private pointer = { x: 0, y: 0, sx: 0, sy: 0, inside: false, px: -1, py: -1 };
  private hovered = -1;
  private hoverLift = new Float32Array(8);
  private proj = mat4(); private view = mat4(); private vp = mat4();
  private right = v3(1, 0, 0); private up = v3(0, 1, 0);

  // geometry
  private ribbons: Array<RibbonDraw & { path: Path; kind: string; idx: number }> = [];
  private ringModels: M4[] = [];
  private boxes = new Float32Array(40 * BOX_STRIDE); private boxCount = 0;
  private cards = new Float32Array(16 * CARD_STRIDE); private cardCount = 0;
  private sprites = new Float32Array(520 * SPRITE_STRIDE); private spriteCount = 0;
  private dust: Array<{ p: V3; s: number; ph: number }> = [];
  private streams: Array<{ rib: number; u: number; speed: number; size: number }> = [];
  private gridModel = mat4();
  private labels: Label[] = [];
  private dyn!: { detect: HTMLElement; action: HTMLElement; bubble: HTMLElement };

  private readonly ro: ResizeObserver;
  private readonly off: Array<() => void> = [];

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly layer: HTMLElement,
    firstTrace: Trace,
    opts: { reducedMotion: boolean } & SceneCallbacks,
  ) {
    this.cb = opts;
    this.reduced = opts.reducedMotion;
    const gl = canvas.getContext("webgl2", { antialias: true, alpha: false, powerPreference: "high-performance", preserveDrawingBuffer: false });
    if (!gl) throw new Error("WebGL2 unavailable");
    this.gl = gl;
    const mobile = matchMedia("(pointer: coarse)").matches;
    this.maxDpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2);
    this.dpr = this.maxDpr;
    this.r = new GLRenderer(gl, 40, 16, 520);
    this.r.setAtlas(drawAtlas());
    this.trace = firstTrace;

    const R = rng(11);
    for (let i = 0; i < 110; i++) this.dust.push({ p: v3((R() - 0.5) * 50, (R() - 0.5) * 44 - 12, -3 - R() * 12), s: 0.03 + R() * 0.07, ph: R() * 6.28 });

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.resize();

    const on = <K extends keyof HTMLElementEventMap>(el: HTMLElement, ev: K, fn: (e: HTMLElementEventMap[K]) => void) => {
      el.addEventListener(ev, fn as EventListener);
      this.off.push(() => el.removeEventListener(ev, fn as EventListener));
    };
    on(canvas, "pointermove", (e) => {
      const b = canvas.getBoundingClientRect();
      this.pointer.x = ((e.clientX - b.left) / b.width) * 2 - 1;
      this.pointer.y = ((e.clientY - b.top) / b.height) * 2 - 1;
      this.pointer.px = e.clientX - b.left; this.pointer.py = e.clientY - b.top;
      this.pointer.inside = true;
      this.pickHover();
    });
    on(canvas, "pointerleave", () => { this.pointer.inside = false; this.pointer.px = -1; this.pickHover(); });
    on(canvas, "click", () => {
      if (this.hovered >= 0) this.cb.onCardClick?.(INPUTS[this.hovered]!.id);
    });
    const lost = (e: Event) => { e.preventDefault(); this.stop(); this.cb.onContextLost?.(); };
    canvas.addEventListener("webglcontextlost", lost);
    this.off.push(() => canvas.removeEventListener("webglcontextlost", lost));

    this.setTrace(firstTrace);
    if (this.reduced) this.t = T.end - 0.05;
  }

  private cb: SceneCallbacks;

  // ---------------------------------------------------------------- public

  /** Loop through these traces (the ambient tour). */
  tour(traces: Trace[]) {
    this.queue = traces;
    this.queueI = 0;
    this.hold = false;
    const first = traces[0];
    if (first) this.start(first);
  }

  /** Play one trace and hold on its final frame. */
  play(trace: Trace) {
    this.hold = true;
    this.start(trace);
  }

  isHolding() { return this.hold; }

  seekPhase(i: number) {
    this.t = PHASE_START[i] ?? 0;
    if (this.reduced) this.t = T.end - 0.05;
    this.lastPhase = -1;
    if (!this.reduced && !this.L.portrait) this.mode = "follow";
    this.invalidate();
  }

  setOverview() { this.mode = "overview"; this.invalidate(); }
  isOverview() { return this.mode === "overview"; }

  setPaused(p: boolean) { this.paused = p; this.sync(); }
  setVisible(v: boolean) { this.visible = v; this.sync(); }

  dispose() {
    this.stop();
    this.ro.disconnect();
    this.off.forEach((f) => f());
    this.layer.replaceChildren();
    this.r.dispose();
    this.gl.getExtension("WEBGL_lose_context")?.loseContext();
  }

  // ---------------------------------------------------------------- setup

  private start(trace: Trace) {
    this.setTrace(trace);
    this.t = this.reduced ? T.end - 0.05 : 0;
    this.lastPhase = -1;
    this.invalidate();
  }

  private setTrace(trace: Trace) {
    this.trace = trace;
    this.cardIndex = Math.max(0, INPUTS.findIndex((i) => i.id === trace.input));
    const idx = (m: ModuleId) => MODULES.findIndex((x) => x.id === m);
    this.moduleIdx = trace.modules.map(idx).filter((i) => i >= 0);
    if (!this.moduleIdx.length) this.moduleIdx = [0];
    const ch = CONCIERGE_CHANNELS.findIndex((c) => c.toLowerCase() === trace.response.channel.toLowerCase());
    this.channelIdx = ch >= 0 ? ch : 1;
    if (this.dyn) {
      this.dyn.detect.textContent = trace.detected;
      this.dyn.action.textContent = trace.actionShort;
      this.dyn.bubble.textContent = trace.bubble;
    }
    if (this.L) this.buildFlights();
  }

  private scanPos(): V3 {
    const L = this.L;
    return add(L.core, v3(0, 0, L.coreR + 0.85));
  }

  private engineTop(): V3 { return add(this.L.slabs[0]!, v3(0, 0.75, 0)); }
  private engineBottom(): V3 { return add(this.L.slabs[3]!, v3(0, -0.75, 0)); }

  private entry(p: V3, half: number): V3 { return sub(p, scale(this.L.flow, half)); }
  private exit(p: V3, half: number): V3 { return add(p, scale(this.L.flow, half)); }

  private buildFlights() {
    const L = this.L;
    const card = L.cards[this.cardIndex]!.p;
    const lifted = add(card, v3(0, 0, 1.0));
    const sp = this.scanPos();
    const m = L.modules[this.moduleIdx[0]!]!;
    const half = L.portrait ? L.moduleSize[1] / 2 : L.moduleSize[0] / 2;
    const mEntry = this.entry(m, half + 0.2);
    this.flights = {
      toCore: new Path([lifted, add(lerp3(lifted, sp, 0.5), v3(0, L.portrait ? 0 : 1.2, 1.4)), sp], 48),
      toModule: new Path([sp, add(lerp3(sp, mEntry, 0.5), v3(0, 0, 0.8)), mEntry, m], 48),
      toEngine: new Path([m, add(this.exit(m, half + 0.6), v3(0, 0, 0.4)), add(this.engineTop(), v3(0, 0.6, 0.3)), this.engineTop()], 48),
    };
  }

  private buildScene(portrait: boolean) {
    this.L = buildLayout(portrait);
    const L = this.L;
    // Ribbon meshes are rebuilt only when the layout flips between landscape and portrait.
    this.ribbons = [];
    const add_ = (kind: string, idx: number, ctrl: V3[], width: number, color: V3, dash = 6, flow = 0.35) => {
      const path = new Path(ctrl, 72);
      const handle: RibbonHandle = this.r.createRibbon(path.pts);
      this.ribbons.push({ handle, model: mat4(), width, color, headColor: COL.white, intensity: 0.5, flow, dash, head: -1, lit: 0, path, kind, idx });
    };
    const core = L.core;
    L.cards.forEach((c, i) => {
      const end = add(core, scale(norm(sub(c.p, core)), L.coreR * 0.95));
      const mid = add(lerp3(c.p, end, 0.5), v3(0, 0, 0.9));
      add_("in", i, [c.p, mid, end], 0.05, COL.indigo, 4, 0.5);
    });
    L.modules.forEach((m, i) => {
      const half = L.portrait ? L.moduleSize[1] / 2 : L.moduleSize[0] / 2;
      const e = this.entry(m, half);
      const s = add(core, scale(norm(sub(e, core)), L.coreR * 1.02));
      add_("fan", i, [s, lerp3(s, e, 0.55), e], 0.065, COL.indigo, 5, 0.45);
      const x = this.exit(m, half);
      const top = this.engineTop();
      add_("merge", i, [x, lerp3(x, top, 0.5), top], 0.065, COL.indigoDim, 5, 0.45);
    });
    const eb = this.engineBottom();
    add_("spine", 0, [eb, lerp3(eb, L.intelIn, 0.5), L.intelIn], 0.1, COL.teal, 6, 0.4);
    add_("spine", 1, [L.intelOut, lerp3(L.intelOut, L.action, 0.5), L.action], 0.09, COL.amber, 6, 0.4);
    add_("spine", 2, [L.action, lerp3(L.action, L.conciergeIn, 0.5), L.conciergeIn], 0.09, COL.teal, 6, 0.4);
    // rings around the core (unit circles, scaled per frame through their model matrix)
    this.ringModels = [];
    L.rings.forEach((rad, i) => {
      const pts: V3[] = [];
      for (let k = 0; k <= 96; k++) { const a = (k / 96) * Math.PI * 2; pts.push(v3(Math.cos(a) * rad, Math.sin(a) * rad, 0)); }
      const path = new Path(pts, 96);
      const handle = this.r.createRibbon(path.pts);
      const model = mat4();
      this.ringModels.push(model);
      this.ribbons.push({ handle, model, width: 0.035 + i * 0.01, color: i === 1 ? COL.teal : COL.indigo, headColor: COL.white, intensity: 0.55, flow: 0.08 + i * 0.05, dash: 10 + i * 6, head: -1, lit: 0, path, kind: "ring", idx: i });
    });
    // ambient data streams
    this.streams = [];
    const R = rng(3);
    this.ribbons.forEach((rb, ri) => {
      if (rb.kind === "ring") return;
      const n = rb.kind === "spine" ? 7 : rb.kind === "in" ? 3 : 2;
      for (let k = 0; k < n; k++) this.streams.push({ rib: ri, u: R(), speed: 0.12 + R() * 0.12, size: 0.045 + R() * 0.04 });
    });
    // grid: floor in landscape, back wall in portrait
    const g = this.gridModel;
    const cx = (L.bounds.min[0] + L.bounds.max[0]) / 2, cy = (L.bounds.min[1] + L.bounds.max[1]) / 2;
    if (portrait) {
      // rotate the XZ plane to XY (a wall behind the pipeline)
      g.set([40, 0, 0, 0, 0, 0, -1, 0, 0, 40, 0, 0, cx, cy, -4.5, 1]);
    } else {
      g.set([45, 0, 0, 0, 0, 1, 0, 0, 0, 0, 45, 0, cx, -5.2, -2, 1]);
    }
    this.buildLabels();
    this.buildFlights();
  }

  private buildLabels() {
    this.layer.replaceChildren();
    this.labels = [];
    const L = this.L;
    const mk = (cls: string, html: string, pos: () => V3, lit: () => number = () => 0, vis: () => number = () => 1) => {
      const el = document.createElement("div");
      el.className = "hiw-l " + cls;
      el.innerHTML = html;
      this.layer.appendChild(el);
      const lab: Label = { el, pos, lit, vis, last: { x: -1e4, y: -1e4, o: -1, lit: false } };
      this.labels.push(lab);
      return el;
    };
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
    STAGES.forEach((s, i) => {
      mk("hiw-l--title", `<span>${String(i + 1).padStart(2, "0")}</span>${esc(s.title)}`, () => L.titles[i]!, () => this.stageLit(i));
    });
    CORE_STEPS.forEach((s, i) => {
      const n = L.nodes[i]!;
      const off = v3(Math.sign(n[0] - L.core[0]) * 0.35, Math.sign(n[1] - L.core[1]) * 0.42, 0);
      mk("hiw-l--step", esc(s), () => add(n, off), () => this.nodeLit(i));
    });
    MODULES.forEach((m, i) => mk("hiw-l--item", esc(m.label), () => add(L.modules[i]!, v3(0, 0, L.moduleSize[2] / 2 + 0.01)), () => this.moduleLit(i)));
    ENGINE_STEPS.forEach((s, i) => mk("hiw-l--item hiw-l--slab", esc(s), () => add(L.slabs[i]!, v3(0, L.portrait ? 0.3 : 0.4, L.slabSize[2] / 2)), () => this.slabLit(i)));
    INTEL_STEPS.forEach((s, i) => mk("hiw-l--item hiw-l--left", esc(s), () => add(L.bars[i]!, v3(-0.05, L.portrait ? 0.38 : 0.5, 0.3)), () => this.barLit(i)));
    CONCIERGE_CHANNELS.forEach((c, i) => mk("hiw-l--item", esc(c), () => add(L.channels[i]!, v3(0, 0, L.channelSize[2] / 2 + 0.01)), () => (i === this.channelIdx ? this.channelLit() : 0)));
    const detect = mk("hiw-l--detect", "", () => add(L.core, v3(0, -(L.coreR + (L.portrait ? 0.75 : 0.85)), 0.6)), () => 1,
      () => (this.t >= T.steps[3] ? smooth((this.t - T.steps[3]) / 0.3) * this.fadeOut() : 0));
    const action = mk("hiw-l--action", "", () => add(L.action, v3(0, -1.08, 0.2)), () => 1,
      () => smooth((this.t - T.actionIn) / 0.3) * this.fadeOut());
    const bubble = mk("hiw-l--bubble", "", () => add(L.reply, v3(0, -1.2, 0.2)), () => 1,
      () => smooth((this.t - T.reply - 0.3) / 0.3) * this.fadeOut());
    this.dyn = { detect, action, bubble };
    detect.textContent = this.trace.detected;
    action.textContent = this.trace.actionShort;
    bubble.textContent = this.trace.bubble;
  }

  // ---------------------------------------------------------------- state helpers (all pure functions of t)

  private fadeOut() { return this.hold ? 1 : 1 - span(this.t, T.end, T.total - 0.15); }
  private pulse(at: number, len = 0.9) { const k = this.t - at; return k < 0 ? 0 : Math.exp(-k / len * 3); }
  private after(at: number, ramp = 0.25) { return smooth((this.t - at) / ramp) * this.fadeOut(); }

  private nodeLit(i: number) {
    const s = T.steps[i as 0]!;
    const k = this.t - s;
    if (k < 0) return 0;
    return Math.max(this.pulse(s, 1.2), 0.45 * (1 - span(this.t, T.toModule + 0.4, T.toModule + 1.2))) * this.fadeOut();
  }
  private moduleLit(i: number) {
    const rank = this.moduleIdx.indexOf(i);
    if (rank < 0) return 0;
    const start = rank === 0 ? T.atModule - 0.1 : T.atModule + 0.1 + rank * 0.12;
    return (rank === 0 ? 0.6 : 0.35) * this.after(start) + (rank === 0 ? 0.5 * this.pulse(T.atModule, 0.8) : 0.3 * this.pulse(start, 0.8));
  }
  private slabLit(i: number) { const s = T.slabs[i as 0]!; return 0.35 * this.after(s) + 0.7 * this.pulse(s, 0.7); }
  private barLit(i: number) { const s = T.intel[i as 0]!; return 0.3 * this.after(s) + 0.75 * this.pulse(s, 0.8); }
  private channelLit() { return 0.5 * this.after(T.reply - 0.2) + 0.6 * this.pulse(T.reply - 0.2, 0.8); }
  private stageLit(i: number) {
    const ranges: Array<[number, number]> = [[0, T.arrive], [T.arrive, T.toModule], [T.toModule, T.atEngine - 0.1], [T.atEngine - 0.1, T.engineOut], [T.engineOut, T.toConcierge], [T.toConcierge, Infinity]];
    const [a, b] = ranges[i]!;
    return this.t >= a && this.t < b ? 1 : 0;
  }

  /** Where the travelling document is, and how it looks, at time t. */
  private packet(): { p: V3; r: V3; s: number; morph: number; op: number; face: FaceId } | null {
    const t = this.t, L = this.L, F = this.flights;
    const card = L.cards[this.cardIndex]!;
    const face = this.trace.input as FaceId;
    if (t < T.fly) {
      const k = easeOut(t / T.fly);
      return { p: add(card.p, v3(0, 0, k * 1.0)), r: lerp3(card.r, v3(0, 0, 0), k), s: 1 + k * 0.08, morph: 0, op: 1, face };
    }
    if (t < T.arrive) {
      const k = easeInOut(span(t, T.fly, T.arrive));
      return { p: F.toCore.at(k), r: v3(0, Math.sin(k * Math.PI) * 0.5, Math.sin(k * Math.PI) * -0.1), s: 1.08 + k * 0.1, morph: 0, op: 1, face };
    }
    if (t < T.toModule) {
      const bob = Math.sin((t - T.arrive) * 3) * 0.05;
      return { p: add(this.scanPos(), v3(0, bob, 0)), r: v3(0, Math.sin((t - T.arrive) * 1.6) * 0.12, 0), s: 1.18, morph: easeInOut(span(t, T.morphA, T.morphB)), op: 1, face };
    }
    if (t < T.atModule) {
      const k = easeInOut(span(t, T.toModule, T.atModule));
      return { p: F.toModule.at(k), r: v3(0, 0, 0), s: lerp(1.18, 0.78, k), morph: 1, op: 1, face };
    }
    if (t < T.toEngine) return { p: add(L.modules[this.moduleIdx[0]!]!, v3(0, 0, 0.5)), r: v3(0, 0, 0), s: 0.78, morph: 1, op: 1, face };
    if (t < T.atEngine) {
      const k = easeInOut(span(t, T.toEngine, T.atEngine));
      return { p: F.toEngine.at(k), r: v3(-k * 1.15, 0, 0), s: lerp(0.78, 0.85, k), morph: 1, op: 1, face };
    }
    if (t < T.engineOut + 0.25) {
      const k = span(t, T.atEngine, T.engineOut);
      const p = lerp3(this.engineTop(), this.engineBottom(), easeInOut(k));
      return { p: add(p, v3(0, 0, 0.35)), r: v3(-1.15, 0, 0), s: 0.85, morph: 1, op: 1 - span(t, T.engineOut, T.engineOut + 0.25), face };
    }
    return null;
  }

  /** The point the camera follows. */
  private focusPoint(): V3 {
    const t = this.t, L = this.L;
    const pk = this.packet();
    if (pk && t < T.engineOut) return t < T.arrive ? lerp3(L.stage[0]!, L.core, smooth(t / T.arrive)) : pk.p;
    if (t < T.action) return L.stage[4]!;
    if (t < T.toConcierge) return L.action;
    return L.stage[5]!;
  }

  // ---------------------------------------------------------------- frame

  private resize() {
    const b = this.canvas.getBoundingClientRect();
    if (b.width < 2 || b.height < 2) return;
    const portrait = b.width / b.height < 0.95;
    if (!this.L || this.L.portrait !== portrait) {
      this.buildScene(portrait);
      if (portrait) this.mode = "follow";
      else if (this.mode === "follow" && this.L) this.mode = "overview";
      this.snapCamera = true;
    }
    this.w = Math.round(b.width * this.dpr);
    this.h = Math.round(b.height * this.dpr);
    this.canvas.width = this.w;
    this.canvas.height = this.h;
    this.r.resize(this.w, this.h);
    this.invalidate();
  }

  private snapCamera = true;

  private updateCamera(dt: number) {
    const L = this.L;
    const aspect = this.w / this.h;
    const fov = (L.portrait ? 42 : 32) * (Math.PI / 180);
    const tanH = Math.tan(fov / 2);
    const focus = this.focusPoint();
    let target: V3, dist: number;
    // a slow sway keeps the overview alive without ever cropping the pipeline
    const sway = this.reduced ? 0 : Math.sin(this.clock * 0.13) * 0.05;
    const dir = L.portrait ? norm(v3(sway * 0.6, 0.2, 1)) : norm(v3(-0.06 + sway, 0.22 + sway * 0.4, 1));
    if (L.portrait) {
      dist = 4.6 / (tanH * aspect);
      dist = clamp(dist, 12, 24);
      target = v3(0, clamp(focus[1] - 0.8, L.bounds.min[1] + 4, L.bounds.max[1] - 4), 0);
    } else if (this.mode === "overview") {
      const cx = (L.bounds.min[0] + L.bounds.max[0]) / 2, cy = (L.bounds.min[1] + L.bounds.max[1]) / 2;
      const hw = (L.bounds.max[0] - L.bounds.min[0]) / 2 + 1.9, hh = (L.bounds.max[1] - L.bounds.min[1]) / 2 + 0.6;
      dist = Math.max(hw / (tanH * aspect), hh / tanH) * 1.02;
      target = v3(cx, cy - 0.2, 0);
    } else {
      dist = Math.max(8.5 / (tanH * aspect), 6.2 / tanH);
      target = v3(focus[0], 0.2, 0);
    }
    const par = this.reduced ? 0 : 1;
    this.pointer.sx += (this.pointer.x * (this.pointer.inside ? 1 : 0) - this.pointer.sx) * damp(3, dt);
    this.pointer.sy += (this.pointer.y * (this.pointer.inside ? 1 : 0) - this.pointer.sy) * damp(3, dt);
    const eye = add(target, add(scale(dir, dist), v3(this.pointer.sx * 1.6 * par, -this.pointer.sy * 1.0 * par, 0)));
    this.goalTarget = target; this.goalEye = eye;
    // dt 0 = a one-off render while paused (e.g. after a seek): jump straight there
    const k = this.snapCamera || this.reduced || dt === 0 ? 1 : damp(2.2, dt);
    this.snapCamera = false;
    this.camTarget = lerp3(this.camTarget, target, k);
    this.camEye = lerp3(this.camEye, eye, k);
    perspective(this.proj, fov, aspect, 0.5, 200);
    lookAt(this.view, this.camEye, this.camTarget);
    multiply(this.vp, this.proj, this.view);
    this.right = v3(this.view[0]!, this.view[4]!, this.view[8]!);
    this.up = v3(this.view[1]!, this.view[5]!, this.view[9]!);
  }

  private pushBox(p: V3, s: V3, color: V3, alpha: number, glow: number, rot: V3 = v3()) {
    if (this.boxCount >= 40) return;
    const o = this.boxCount++ * BOX_STRIDE, b = this.boxes;
    compose(b, o, p, rot, s);
    b[o + 16] = color[0]; b[o + 17] = color[1]; b[o + 18] = color[2]; b[o + 19] = alpha;
    b[o + 20] = s[0]; b[o + 21] = s[1]; b[o + 22] = s[2]; b[o + 23] = glow;
  }

  private pushCard(p: V3, r: V3, sc: number, a: FaceId, b: FaceId, morph: number, op: number, glow: number, tint: V3, hl = 0) {
    if (this.cardCount >= 16 || op <= 0.01 || sc <= 0.01) return;
    const o = this.cardCount++ * CARD_STRIDE, d = this.cards;
    const [w, h] = this.L.cardSize;
    compose(d, o, p, r, v3(w * sc, h * sc, 1));
    d.set(faceUV(a), o + 16);
    d.set(faceUV(b), o + 20);
    d[o + 24] = morph; d[o + 25] = op; d[o + 26] = glow; d[o + 27] = hl;
    d[o + 28] = tint[0]; d[o + 29] = tint[1]; d[o + 30] = tint[2]; d[o + 31] = CARD_ASPECT;
  }

  private pushSprite(p: V3, size: number, c: V3, a: number, halo = false) {
    if (this.spriteCount >= 520 || a <= 0.004) return;
    const o = this.spriteCount++ * SPRITE_STRIDE, d = this.sprites;
    d[o] = p[0]; d[o + 1] = p[1]; d[o + 2] = p[2]; d[o + 3] = halo ? -size : size;
    d[o + 4] = c[0]; d[o + 5] = c[1]; d[o + 6] = c[2]; d[o + 7] = a;
  }

  private build(time: number, dt: number) {
    const L = this.L, t = this.t;
    this.boxCount = 0; this.cardCount = 0; this.spriteCount = 0;
    const motion = this.reduced ? 0 : 1;

    // ---- input cards
    const pk = this.packet();
    for (let i = 0; i < 8; i++) {
      const c = L.cards[i]!;
      const target = i === this.hovered ? 1 : 0;
      this.hoverLift[i]! += (target - this.hoverLift[i]!) * damp(10, dt || 0.016);
      const hl = this.hoverLift[i]!;
      const bob = Math.sin(time * 0.9 + i * 1.3) * 0.08 * motion;
      const isPacket = i === this.cardIndex;
      // the source card dims while its "copy" travels, then returns
      const op = isPacket ? (pk ? 0.28 : 0.28 + 0.72 * span(t, T.end - 0.5, T.end)) : 1;
      const holdOp = isPacket && this.hold && !pk ? 0.28 : op;
      this.pushCard(add(c.p, v3(0, bob + hl * 0.15, hl * 0.6)), add(c.r, v3(0, Math.sin(time * 0.5 + i) * 0.05 * motion, 0)), 1 + hl * 0.08,
        INPUTS[i]!.id as FaceId, INPUTS[i]!.id as FaceId, 0, holdOp, 0.1 + hl * 0.8, COL.indigo, hl);
      if (hl > 0.02) this.pushSprite(c.p, 1.6, COL.indigo, hl * 0.35, true);
    }

    // ---- travelling document → record
    if (pk) {
      this.pushCard(pk.p, pk.r, pk.s, pk.face, "record", pk.morph, pk.op, 0.6, COL.teal, 0);
      this.pushSprite(pk.p, 1.5 * pk.s, pk.morph > 0.5 ? COL.teal : COL.indigo, 0.35 * pk.op, true);
    }

    // ---- core
    const corePulse = T.steps.reduce((a, s) => a + this.pulse(s, 0.6), 0) * 0.6 + 0.4 * this.pulse(T.morphB, 0.8);
    L.nodes.forEach((n, i) => {
      const lit = this.nodeLit(i);
      this.pushSprite(n, 0.16 + lit * 0.08, lit > 0.05 ? COL.teal : COL.indigo, 0.55 + lit * 0.45);
      this.pushSprite(n, 1.1, COL.teal, lit * 0.55, true);
    });

    // ---- modules
    L.modules.forEach((m, i) => {
      const lit = this.moduleLit(i);
      this.pushBox(m, L.moduleSize, lit > 0.02 ? lerp3(COL.indigo, COL.teal, clamp(lit * 1.6)) : COL.indigoDim, 0.45, lit);
      if (lit > 0.02) this.pushSprite(m, 1.9, COL.teal, lit * 0.4, true);
    });

    // ---- engine
    L.slabs.forEach((s, i) => {
      const lit = this.slabLit(i);
      this.pushBox(s, L.slabSize, lerp3(COL.indigoDim, COL.teal, clamp(lit * 1.3)), 0.4, lit);
      if (lit > 0.02) this.pushSprite(s, 2.2, COL.teal, lit * 0.35, true);
    });

    // ---- intelligence bars (lengths are shape only — no numbers are shown)
    const base = [0.62, 0.8, 0.55, 0.72];
    L.bars.forEach((b, i) => {
      const lit = this.barLit(i);
      const grow = base[i]! + 0.14 * this.after(T.intel[i as 0]!, 0.5) + Math.sin(time * 0.7 + i) * 0.015 * motion;
      const len = L.barLen * grow;
      const [th, dp] = L.barSize;
      this.pushBox(add(b, v3(L.barLen / 2, 0, -0.02)), v3(L.barLen, th * 0.6, dp * 0.6), COL.indigoDim, 0.12, 0);
      this.pushBox(add(b, v3(len / 2, 0, 0)), v3(len, th, dp), lerp3(COL.indigo, COL.teal, 0.4 + lit * 0.6), 0.55, lit * 0.8);
      if (lit > 0.05) this.pushSprite(add(b, v3(len, 0, 0)), 1.0, COL.teal, lit * 0.5, true);
    });

    // ---- concierge
    L.channels.forEach((c, i) => {
      const lit = i === this.channelIdx ? this.channelLit() : 0;
      this.pushBox(c, L.channelSize, lit > 0.02 ? lerp3(COL.indigo, COL.teal, clamp(lit * 1.6)) : COL.indigoDim, 0.45, lit);
      if (lit > 0.02) this.pushSprite(c, 1.9, COL.teal, lit * 0.45, true);
    });

    // ---- action + reply cards
    const aIn = this.reduced ? (t >= T.action ? 1 : 0) : easeOutBack(span(t, T.action, T.actionIn));
    const fo = this.fadeOut();
    this.pushCard(add(L.action, v3(0, Math.sin(time * 1.2) * 0.05 * motion, 0)), v3(0, Math.sin(time * 0.6) * 0.1 * motion, 0), 0.9 * aIn, "action", "action", 0, fo, 0.5 + 0.5 * this.pulse(T.actionIn, 1), COL.amber);
    if (aIn > 0) this.pushSprite(L.action, 1.8, COL.amber, 0.35 * aIn * fo, true);
    const rIn = this.reduced ? (t >= T.reply ? 1 : 0) : easeOutBack(span(t, T.reply, T.reply + 0.45));
    this.pushCard(add(L.reply, v3(0, Math.sin(time * 1.1 + 1) * 0.05 * motion, 0)), v3(0, 0, 0), 0.9 * rIn, "reply", "reply", 0, fo, 0.5, COL.teal);
    if (rIn > 0) this.pushSprite(L.reply, 1.7, COL.teal, 0.3 * rIn * fo, true);

    // ---- ribbons
    const route = new Set<string>([`in:${this.cardIndex}`]);
    this.moduleIdx.forEach((m) => { route.add(`fan:${m}`); route.add(`merge:${m}`); });
    const heads: Record<string, [number, number]> = {
      [`in:${this.cardIndex}`]: [T.fly, T.arrive],
      "spine:0": [T.engineOut, T.intel[0]],
      "spine:1": [T.intel[3] + 0.1, T.action + 0.2],
      "spine:2": [T.toConcierge - 0.1, T.reply],
    };
    this.moduleIdx.forEach((m, rank) => {
      heads[`fan:${m}`] = rank === 0 ? [T.toModule, T.atModule] : [T.atModule, T.atModule + 0.6 + rank * 0.1];
      heads[`merge:${m}`] = rank === 0 ? [T.toEngine, T.atEngine] : [T.toEngine + 0.1, T.atEngine + 0.2];
    });
    for (const rb of this.ribbons) {
      const key = `${rb.kind}:${rb.idx}`;
      if (rb.kind === "ring") {
        const sp = time * (0.18 + rb.idx * 0.07) * (rb.idx % 2 ? -1 : 1) * motion;
        const tilt = [0.9, -0.55, 0.25][rb.idx]!;
        compose(rb.model, 0, L.core, v3(tilt + Math.sin(time * 0.2) * 0.1 * motion, rb.idx === 2 ? 0.6 : -0.3, sp), v3(1, 1, 1));
        rb.intensity = 0.45 + corePulse * 0.6;
        continue;
      }
      const h = heads[key];
      const onRoute = route.has(key) || rb.kind === "spine";
      rb.head = h && t >= h[0] && t <= h[1] + 0.35 ? easeInOut(span(t, h[0], h[1])) * 1.05 : -1;
      rb.lit = h && onRoute ? 0.55 * smooth((t - h[1]) / 0.3) * fo : 0;
      rb.intensity = rb.kind === "spine" ? (rb.idx === 0 ? 0.35 : 0.1 + 0.25 * this.after(h ? h[0] : 0, 0.4)) : rb.kind === "in" ? 0.3 : 0.2;
      if (this.reduced && onRoute && h && t >= h[1]) rb.lit = 0.8;
    }

    // ---- streams + sparks + dust
    for (const s of this.streams) {
      const rb = this.ribbons[s.rib]!;
      s.u = (s.u + s.speed * dt * motion) % 1;
      const p = rb.path.at(s.u);
      const boost = rb.lit + (rb.head >= 0 ? 0.8 : 0);
      const edge = Math.sin(s.u * Math.PI);
      this.pushSprite(p, s.size * (1 + boost * 0.5), rb.lit > 0.1 ? COL.teal : rb.color, (0.35 + boost * 0.6) * edge);
    }
    // sparks rising from the engine into intelligence
    if (t > T.engineOut - 0.1 && t < T.intel[3] + 0.6 && !this.reduced) {
      const spine = this.ribbons.find((r) => r.kind === "spine" && r.idx === 0);
      if (spine) {
        for (let k = 0; k < 10; k++) {
          const u = span(t, T.engineOut + k * 0.05, T.engineOut + 0.55 + k * 0.05);
          if (u <= 0 || u >= 1) continue;
          const p = spine.path.at(u);
          const bar = L.bars[k % 4]!;
          const q = lerp3(p, add(bar, v3(0.2, 0, 0.2)), smooth((u - 0.6) / 0.4));
          this.pushSprite(add(q, v3(0, Math.sin(k * 2.1) * 0.25 * (1 - u), 0)), 0.09, COL.white, 0.9 * (1 - u * 0.5));
        }
      }
    }
    for (const d of this.dust) {
      const y = d.p[1] + Math.sin(time * 0.15 + d.ph) * 0.4 * motion;
      this.pushSprite(v3(d.p[0], y, d.p[2]), d.s, COL.indigo, 0.35 + 0.25 * Math.sin(time * 0.8 + d.ph) * motion);
    }

    return { corePulse };
  }

  private renderFrame(time: number, dt: number) {
    if (!this.L || this.gl.isContextLost()) return;
    this.clock = time;
    this.updateCamera(dt);
    const { corePulse } = this.build(time, dt);
    const aspect = this.w / this.h;
    this.r.frame(
      { vp: this.vp, cam: this.camEye, right: this.right, up: this.up, time, aspect, shift: [this.pointer.sx, this.pointer.sy] },
      { model: this.gridModel, center: this.L.portrait ? v3(0, this.camTarget[1], -4.5) : v3(this.camTarget[0], -5.2, 0), vertical: this.L.portrait },
      { data: this.boxes, count: this.boxCount },
      { data: this.cards, count: this.cardCount },
      { center: this.L.core, radius: this.L.coreR, pulse: clamp(corePulse, 0, 1.4) },
      this.ribbons,
      { data: this.sprites, count: this.spriteCount },
    );
    this.updateLabels();
  }

  private updateLabels() {
    const cw = this.w / this.dpr, ch = this.h / this.dpr;
    for (const l of this.labels) {
      const p = project(this.vp, l.pos());
      let o = l.vis();
      if (p.w <= 0 || Math.abs(p.x) > 1.2 || Math.abs(p.y) > 1.2) o = 0;
      const x = Math.round((p.x * 0.5 + 0.5) * cw * 2) / 2, y = Math.round((0.5 - p.y * 0.5) * ch * 2) / 2;
      const lit = l.lit() > 0.3;
      const last = l.last;
      if (x !== last.x || y !== last.y) { l.el.style.transform = `translate3d(${x}px,${y}px,0)`; last.x = x; last.y = y; }
      const oq = Math.round(o * 50) / 50;
      if (oq !== last.o) { l.el.style.opacity = String(oq); last.o = oq; l.el.style.visibility = oq <= 0 ? "hidden" : "visible"; }
      if (lit !== last.lit) { l.el.classList.toggle("is-lit", lit); last.lit = lit; }
    }
  }

  private pickHover() {
    let best = -1;
    if (this.pointer.inside && this.pointer.px >= 0) {
      const cw = this.w / this.dpr, ch = this.h / this.dpr;
      let bestD = Infinity;
      this.L.cards.forEach((c, i) => {
        const a = project(this.vp, c.p), b = project(this.vp, add(c.p, v3(this.L.cardSize[0] / 2, this.L.cardSize[1] / 2, 0)));
        if (a.w <= 0) return;
        const sx = (a.x * 0.5 + 0.5) * cw, sy = (0.5 - a.y * 0.5) * ch;
        const hw = Math.abs((b.x - a.x) * 0.5 * cw), hh = Math.abs((b.y - a.y) * 0.5 * ch);
        const dx = Math.abs(this.pointer.px - sx), dy = Math.abs(this.pointer.py - sy);
        if (dx <= hw && dy <= hh && dx + dy < bestD) { bestD = dx + dy; best = i; }
      });
    }
    if (best !== this.hovered) {
      this.hovered = best;
      this.canvas.style.cursor = best >= 0 ? "pointer" : "";
      this.canvas.title = best >= 0 ? `Send a ${INPUTS[best]!.label} through Finloraq` : "";
      this.invalidate();
    }
  }

  // ---------------------------------------------------------------- loop

  private get shouldRun() { return this.visible && !this.paused && !this.reduced; }

  private sync() {
    if (this.shouldRun) this.startLoop();
    else { this.stop(); this.invalidate(); }
  }

  private startLoop() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const tick = (now: number) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.advance(dt);
      this.renderFrame(now / 1000, dt);
      this.adapt(dt);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private stop() { this.running = false; cancelAnimationFrame(this.raf); }

  private pending = 0;
  /** Render one frame when the loop isn't running (paused, reduced motion, hover). */
  private invalidate() {
    if (this.running || this.pending || !this.L) return;
    this.pending = requestAnimationFrame(() => {
      this.pending = 0;
      // a paused scene still lets hover lifts settle
      const settling = Array.from(this.hoverLift).some((v, i) => Math.abs((i === this.hovered ? 1 : 0) - v) > 0.01);
      this.renderFrame(performance.now() / 1000, settling ? 0.016 : 0);
      this.emitPhase();
      if (settling) this.invalidate();
    });
  }

  private advance(dt: number) {
    if (this.hold && this.t >= T.end) { this.t = T.end; this.emitPhase(); return; }
    this.t += dt;
    if (this.hold && this.t >= T.end) {
      this.t = T.end;
      this.cb.onEnd?.();
    } else if (!this.hold && this.t >= T.total) {
      this.queueI = (this.queueI + 1) % Math.max(1, this.queue.length);
      const next = this.queue[this.queueI];
      if (next) this.setTrace(next);
      this.t = 0;
      this.lastPhase = -1;
    }
    this.emitPhase();
  }

  private emitPhase() {
    const p = phaseAt(this.t);
    if (p !== this.lastPhase) { this.lastPhase = p; this.cb.onPhase?.(p); }
    this.cb.onTick?.(this.t);
  }

  /** Drop resolution when frames are consistently slow. */
  private adapt(dt: number) {
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 90) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes = [];
    if (avg > 1 / 42 && this.dpr > 1) {
      this.dpr = Math.max(1, this.dpr - 0.25);
      this.resize();
    } else if (avg > 1 / 30 && this.dust.length > 40) {
      this.dust.length = 40;
    }
  }

  /** Current story time (seconds). */
  get time() { return this.t; }
  get currentTrace() { return this.trace; }
}
