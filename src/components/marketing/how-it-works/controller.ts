// Wires the server-rendered "How Finloraq works" markup to the 3D scene and
// the drop-a-document demo. Framework-free on purpose: the React wrapper just
// calls mountHowItWorks() in an effect, and any other host page can too.

import { LOOP_ORDER, MODULES, PHASES, SAMPLES } from "./content";
import type { InputKind, Sample, Trace } from "./content";
import { MAX_BYTES, inspectFile } from "./inspect";
import type { Inspection } from "./inspect";
import { FlowScene, PHASE_START, T } from "./scene";

/** When each trace step becomes visible, in story seconds. */
const STEP_AT = [T.steps[3], T.toModule, T.atModule, T.engineOut, T.actionIn, T.reply] as const;

/** Clicking an input card in 3D plays the sample that best represents it. */
const CARD_SAMPLE: Record<InputKind, string> = {
  photo: "receipt", receipt: "receipt", pdf: "invoice", invoice: "invoice",
  sheet: "bank", email: "email", whatsapp: "whatsapp", screenshot: "whatsapp",
};

function el<T extends Element = HTMLElement>(root: ParentNode, sel: string): T | null {
  return root.querySelector<T & Element>(sel) as T | null;
}

function h(tag: string, attrs: Record<string, string> = {}, ...kids: Array<Node | string>): HTMLElement {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  n.append(...kids);
  return n;
}

export function mountHowItWorks(root: HTMLElement): () => void {
  const cleanup: Array<() => void> = [];
  const on = (t: EventTarget, ev: string, fn: (e: Event) => void, opts?: AddEventListenerOptions) => {
    t.addEventListener(ev, fn, opts);
    cleanup.push(() => t.removeEventListener(ev, fn, opts));
  };

  const stage = el(root, "[data-hiw-stage]");
  const canvas = el<HTMLCanvasElement>(root, ".hiw-canvas");
  const layer = el(root, ".hiw-labels");
  const railItems = Array.from(root.querySelectorAll<HTMLElement>(".hiw-rail li"));
  const railBtns = Array.from(root.querySelectorAll<HTMLButtonElement>("[data-hiw-phase]"));
  const capVerb = el(root, "[data-hiw-cap-verb]");
  const capText = el(root, "[data-hiw-cap-text]");
  const pauseBtn = el<HTMLButtonElement>(root, "[data-hiw-pause]");
  const overviewBtn = el<HTMLButtonElement>(root, "[data-hiw-overview]");
  const fileInput = el<HTMLInputElement>(root, "#hiw-file");
  const dropzone = el(root, "[data-hiw-dropzone]");
  const errorEl = el(root, "[data-hiw-error]");
  const chips = Array.from(root.querySelectorAll<HTMLButtonElement>("[data-hiw-sample]"));
  const steps = Array.from(root.querySelectorAll<HTMLElement>("[data-hiw-step]"));
  const traceTitle = el(root, "[data-hiw-trace-title]");
  const traceBadge = el(root, "[data-hiw-trace-badge]");
  const traceNote = el(root, "[data-hiw-trace-note]");
  const live = el(root, "[data-hiw-live]");
  const replayBtn = el<HTMLButtonElement>(root, "[data-hiw-replay]");
  if (!stage || !canvas || !layer) return () => {};

  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  root.classList.toggle("hiw--reduced", reduced);
  const tour = LOOP_ORDER.map((id) => SAMPLES.find((s) => s.id === id)).filter((s): s is Sample => !!s);
  const byId = (id: string) => SAMPLES.find((s) => s.id === id);

  let scene: FlowScene | null = null;
  let current: { trace: Trace; inspection?: Inspection; sampleId?: string } = { trace: tour[0]! };
  let mode: "tour" | "single" = "tour";
  let paused = false;
  const staticT = T.end; // story time when there is no scene (fallback / reduced motion)

  // ------------------------------------------------------------ trace panel

  function renderTrace() {
    const { trace, inspection, sampleId } = current;
    if (traceTitle) traceTitle.textContent = inspection ? inspection.facts[0]?.value ?? trace.detected : trace.detected;
    if (traceBadge) {
      traceBadge.textContent = inspection ? "Your file · local preview" : "Demo data";
      traceBadge.classList.toggle("is-local", !!inspection);
    }
    if (traceNote) {
      traceNote.textContent = inspection
        ? "Read inside your browser. Real facts about the file are shown; values Finloraq extracts from the content appear in the live product."
        : mode === "tour"
          ? reduced
            ? "Showing a sample document's full route. Pick another sample, or drop your own."
            : "The tour cycles through sample documents. Pick one, or drop your own."
          : `Sample document “${byId(sampleId ?? "")?.fileName ?? ""}” — fictional parties and amounts, clearly not real data.`;
    }
    chips.forEach((c) => c.setAttribute("aria-pressed", String(mode === "single" && c.dataset.hiwSample === sampleId)));

    const body = (i: number) => steps[i]?.querySelector<HTMLElement>(".hiw-step-b");
    const kv = (rows: ReadonlyArray<{ label: string; value: string }>, pending = false) => {
      const dl = h("dl", { class: "hiw-kv" });
      rows.forEach((r) => dl.append(h("dt", {}, r.label), h("dd", pending ? { class: "is-pending" } : {}, r.value)));
      return dl;
    };

    // 1 detected
    const b0 = body(0);
    if (b0) {
      b0.replaceChildren(document.createTextNode(trace.detected), h("small", {}, trace.detectedNote));
      if (inspection) b0.append(kv(inspection.facts.slice(1)));
    }
    // 2 extracted
    const b1 = body(1);
    if (b1) {
      if (trace.fieldsAreDemo) {
        b1.replaceChildren(kv(trace.fields), h("small", {}, "Demo values from a fictional document"));
      } else {
        const tags = h("div", { class: "hiw-mods" });
        trace.fields.forEach((f) => tags.append(h("span", { class: "hiw-mod hiw-mod--field" }, f.label)));
        b1.replaceChildren(tags, h("small", {}, "Fields Finloraq extracts for this type — the values are read from the content in the live product, not in this preview"));
      }
    }
    // 3 destination
    const b2 = body(2);
    if (b2) {
      const mods = h("div", { class: "hiw-mods" });
      trace.modules.forEach((m) => mods.append(h("span", { class: "hiw-mod" }, MODULES.find((x) => x.id === m)?.label ?? m)));
      b2.replaceChildren(mods, h("small", {}, trace.routeNote));
    }
    // 4 accounting
    const b3 = body(3);
    if (b3) {
      if (trace.posting.length) {
        const tbl = h("table", { class: "hiw-je" });
        tbl.append(h("tr", {}, h("th", {}, "Account"), h("th", {}, "Dr"), h("th", {}, "Cr")));
        const cell = (v: string | null | undefined) => (v === undefined ? h("td", { class: "n" }, "") : v === null ? h("td", { class: "n p" }, "from doc") : h("td", { class: "n" }, v));
        trace.posting.forEach((l) => tbl.append(h("tr", {}, h("td", {}, l.account), cell(l.dr), cell(l.cr))));
        b3.replaceChildren(tbl, h("small", {}, trace.postingNote));
      } else {
        b3.replaceChildren(document.createTextNode("No journal entry"), h("small", {}, trace.postingNote));
      }
    }
    body(4)?.replaceChildren(document.createTextNode(trace.action), h("small", {}, "Human-controlled: nothing posts or sends without the rules you set"));
    body(5)?.replaceChildren(document.createTextNode(trace.response.text), h("small", {}, `Channel · ${trace.response.channel}`));

    if (live) live.textContent = `${trace.detected}: routed to ${trace.modules.map((m) => MODULES.find((x) => x.id === m)?.label ?? m).join(", ")}. ${trace.action}. ${trace.response.text}.`;
  }

  let lastShown = -2;
  function revealSteps(t: number) {
    let shown = -1;
    STEP_AT.forEach((at, i) => { if (t >= at) shown = i; });
    if (shown === lastShown) return;
    lastShown = shown;
    steps.forEach((s, i) => {
      s.classList.toggle("is-on", i <= shown);
      s.classList.toggle("is-now", i === shown && shown < steps.length - 1 && !reduced);
    });
  }

  // ------------------------------------------------------------ rail + caption

  let lastPhase = -1;
  function setPhase(p: number) {
    if (p === lastPhase) return;
    lastPhase = p;
    railItems.forEach((li, i) => {
      li.classList.toggle("is-active", i === p);
      li.classList.toggle("is-done", i < p);
    });
    railBtns.forEach((b, i) => (i === p ? b.setAttribute("aria-current", "step") : b.removeAttribute("aria-current")));
    const ph = PHASES[p];
    if (ph && capVerb && capText) { capVerb.textContent = ph.verb; capText.textContent = ph.blurb; }
  }

  function tick(t: number) {
    const p = lastPhase < 0 ? 0 : lastPhase;
    const a = PHASE_START[p] ?? 0, b = PHASE_START[p + 1] ?? T.end;
    railItems[p]?.style.setProperty("--p", String(Math.min(1, Math.max(0, (t - a) / (b - a)))));
    revealSteps(t);
  }

  // ------------------------------------------------------------ actions

  function playTrace(trace: Trace, extra: { inspection?: Inspection; sampleId?: string }) {
    mode = "single";
    current = { trace, ...extra };
    lastShown = -2;
    renderTrace();
    if (scene) {
      scene.play(trace);
      setPaused(false);
    } else {
      setPhase(PHASES.length - 1);
      revealSteps(staticT);
    }
  }

  function playSample(id: string, input?: InputKind) {
    const s = byId(id);
    if (!s) return;
    playTrace(input ? { ...s, input } : s, { sampleId: id });
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (errorEl) errorEl.hidden = true;
    if (file.size > MAX_BYTES) {
      if (errorEl) { errorEl.textContent = "That file is over 25 MB — try a smaller one."; errorEl.hidden = false; }
      return;
    }
    const ins = await inspectFile(file);
    if (ins.format === "unknown" && errorEl) {
      errorEl.textContent = "That format isn't one Finloraq reads yet — showing how it would be handled as a general document.";
      errorEl.hidden = false;
    }
    playTrace(ins.trace, { inspection: ins });
  }

  function setPaused(p: boolean) {
    paused = p;
    scene?.setPaused(p);
    if (pauseBtn) {
      pauseBtn.textContent = p ? "Play" : "Pause";
      pauseBtn.setAttribute("aria-pressed", String(p));
    }
  }

  // ------------------------------------------------------------ events

  railBtns.forEach((b, i) => on(b, "click", () => {
    if (scene) { scene.seekPhase(i); if (overviewBtn && !scene.isOverview()) overviewBtn.hidden = false; }
    else setPhase(i);
  }));
  if (pauseBtn) on(pauseBtn, "click", () => {
    if (paused && scene && mode === "single" && scene.isHolding() && scene.time >= T.end) {
      // "Play" after a single run finished → resume the ambient tour
      mode = "tour";
      scene.tour(tour);
    }
    setPaused(!paused);
  });
  if (overviewBtn) on(overviewBtn, "click", () => { scene?.setOverview(); overviewBtn.hidden = true; });
  if (replayBtn) on(replayBtn, "click", () => {
    if (scene) { scene.play(current.trace); mode = "single"; setPaused(false); lastShown = -2; }
  });
  chips.forEach((c) => on(c, "click", () => playSample(c.dataset.hiwSample ?? "")));
  if (fileInput) on(fileInput, "change", () => { void handleFile(fileInput.files?.[0]); fileInput.value = ""; });

  // drag & drop on both the stage and the dropzone
  let dragDepth = 0;
  const hasFiles = (e: Event) => Array.from((e as DragEvent).dataTransfer?.types ?? []).includes("Files");
  for (const target of [stage, dropzone].filter((x): x is HTMLElement => !!x)) {
    on(target, "dragenter", (e) => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth++; target.classList.add("is-drag"); });
    on(target, "dragover", (e) => { if (!hasFiles(e)) return; e.preventDefault(); (e as DragEvent).dataTransfer!.dropEffect = "copy"; });
    on(target, "dragleave", () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) target.classList.remove("is-drag"); });
    on(target, "drop", (e) => {
      e.preventDefault();
      dragDepth = 0;
      target.classList.remove("is-drag");
      void handleFile((e as DragEvent).dataTransfer?.files?.[0]);
      if (target === dropzone) stage.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
    });
  }

  // ------------------------------------------------------------ boot

  renderTrace();
  setPhase(0);
  revealSteps(-1);

  const boot = () => {
    if (scene || !FlowScene.supported()) return;
    try {
      root.classList.add("hiw--3d"); // canvas must be laid out before the scene measures it
      scene = new FlowScene(canvas, layer, tour[0]!, {
        reducedMotion: reduced,
        onPhase: (p) => {
          // the ambient tour moved on to its next sample → keep the panel in sync
          if (scene && mode === "tour" && scene.currentTrace !== current.trace) {
            current = { trace: scene.currentTrace, sampleId: SAMPLES.find((s) => s === scene?.currentTrace)?.id };
            lastShown = -2;
            renderTrace();
          }
          setPhase(p);
        },
        onTick: tick,
        onEnd: () => { /* hold on the final frame; Replay / Play resume */ },
        onCardClick: (kind) => playSample(CARD_SAMPLE[kind], kind),
        onContextLost: () => { root.classList.remove("hiw--3d"); scene = null; },
      });
      if (reduced) {
        // no autoplay: show the full route for the first sample, frozen
        scene.play(tour[0]!);
        mode = "tour";
      } else {
        scene.tour(tour);
      }
      if (overviewBtn) overviewBtn.hidden = true;
      scene.setVisible(inView && !document.hidden);
    } catch {
      scene = null;
      root.classList.remove("hiw--3d");
    }
  };

  let inView = false;
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.target === stage) {
        inView = e.isIntersecting;
        if (inView) boot();
        scene?.setVisible(inView && !document.hidden);
      }
    }
  }, { rootMargin: "200px 0px" });
  io.observe(stage);
  cleanup.push(() => io.disconnect());
  on(document, "visibilitychange", () => scene?.setVisible(inView && !document.hidden));

  if (!FlowScene.supported()) {
    // Static fallback: the outline is shown and the demo still works (steps appear at once).
    setPhase(0);
  }

  return () => {
    cleanup.forEach((f) => f());
    scene?.dispose();
    scene = null;
  };
}
