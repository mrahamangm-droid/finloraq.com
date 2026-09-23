// Server-renderable markup + scoped styles for the "How Finloraq works" section.
//
// The markup is a plain string (the same pattern MarketingHomePage.tsx uses), so
// it renders on the server for SEO and no-JS visitors, and the identical string
// can be dropped into any other host page. controller.ts progressively enhances
// it with the WebGL scene and the interactive demo.

import { PHASES, SAMPLES, STAGES } from "./content";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

export const HIW_ID = "how-it-works";

export function renderHowItWorksHtml(): string {
  const rail = PHASES.map(
    (p, i) => `<li><button type="button" class="hiw-rail-btn" data-hiw-phase="${i}" aria-label="Show step ${i + 1}: ${esc(p.verb)}">
      <span class="hiw-rail-n">${String(i + 1).padStart(2, "0")}</span><span class="hiw-rail-v">${esc(p.short)}</span><span class="hiw-rail-bar" aria-hidden="true"><i></i></span>
    </button></li>`,
  ).join("");

  const outline = STAGES.map(
    (s, i) => `<li class="hiw-o-stage"><span class="hiw-o-n">${String(i + 1).padStart(2, "0")}</span><h3>${esc(s.title)}</h3><p>${s.items.map(esc).join(" · ")}</p></li>`,
  ).join("");

  const chips = SAMPLES.map((s) => `<button type="button" class="hiw-chip" data-hiw-sample="${esc(s.id)}">${esc(s.chip)}</button>`).join("");

  const steps = ["Detected type", "Extracted data", "Destination module", "Accounting result", "Action", "Customer response"]
    .map((t, i) => `<li class="hiw-step" data-hiw-step="${i}"><div class="hiw-step-h"><span class="hiw-step-n">${i + 1}</span>${t}</div><div class="hiw-step-b"></div></li>`)
    .join("");

  return `<section class="hiw" id="${HIW_ID}" aria-labelledby="hiw-title">
  <div class="hiw-head">
    <div class="hiw-eyebrow">How Finloraq works</div>
    <h2 id="hiw-title">Drop anything.<br /><span>Finloraq handles the rest.</span></h2>
    <p>A photo, a PDF, a spreadsheet, an email, a WhatsApp message — Finloraq reads it, records it as balanced accounting, learns from it and acts on it. You approve what matters.</p>
  </div>

  <ol class="hiw-rail" aria-label="The Finloraq workflow">${rail}</ol>

  <div class="hiw-stage" data-hiw-stage>
    <canvas class="hiw-canvas" aria-hidden="true"></canvas>
    <div class="hiw-labels" aria-hidden="true"></div>
    <div class="hiw-hud">
      <span class="hiw-badge">Demo data · illustrative only</span>
      <div class="hiw-ctrls">
        <button type="button" class="hiw-ctrl" data-hiw-overview hidden>Overview</button>
        <button type="button" class="hiw-ctrl" data-hiw-pause aria-pressed="false">Pause</button>
      </div>
    </div>
    <p class="hiw-hint" aria-hidden="true">Click a document, or drop your own file here</p>
    <div class="hiw-dragover" aria-hidden="true"><div>Release to let Finloraq read it<small>Stays in your browser — nothing is uploaded</small></div></div>
    <div class="hiw-caption" aria-live="off"><b data-hiw-cap-verb>${esc(PHASES[0]!.verb)}</b><span data-hiw-cap-text>${esc(PHASES[0]!.blurb)}</span></div>
    <ol class="hiw-outline" aria-label="Pipeline stages">${outline}</ol>
  </div>

  <button type="button" class="hiw-try-toggle" data-hiw-try aria-expanded="false" aria-controls="hiw-demo">Try it with your own document <span aria-hidden="true">↓</span></button>
  <div class="hiw-demo" id="hiw-demo">
    <div class="hiw-drop-col">
      <h3>Try it with a document</h3>
      <p class="hiw-sub">Drop a file and watch the pipeline handle it — or pick a sample.</p>
      <input type="file" id="hiw-file" class="hiw-sr" accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.csv,.tsv,.xlsx,.xls,.eml,.txt,image/*,application/pdf,text/csv" />
      <label for="hiw-file" class="hiw-dropzone" data-hiw-dropzone>
        <span class="hiw-dz-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4m0 0-4.5 4.5M12 4l4.5 4.5"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg></span>
        <span class="hiw-dz-t">Drop a document or <u>choose a file</u></span>
        <span class="hiw-dz-s">PDF, photo, screenshot, Excel/CSV, email (.eml) or WhatsApp export (.txt) · up to 25 MB</span>
        <span class="hiw-dz-lock"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>Read in your browser only — never uploaded or stored</span>
      </label>
      <p class="hiw-err" role="alert" data-hiw-error hidden></p>
      <div class="hiw-samples"><span>Or try a sample</span><div class="hiw-chips">${chips}</div></div>
      <div class="hiw-how">
        <b>How this preview works</b>
        <p>Your browser reads the file to recognise its format and basic facts — pages, columns, sender. Nothing is sent to Finloraq. In the product, the AI core reads the full content, extracts every value and checks it before anything is recorded.</p>
      </div>
    </div>
    <div class="hiw-trace" data-hiw-trace>
      <div class="hiw-trace-h">
        <div><span class="hiw-trace-k">Finloraq trace</span><b data-hiw-trace-title>Supplier tax invoice</b></div>
        <span class="hiw-trace-badge" data-hiw-trace-badge>Demo data</span>
      </div>
      <p class="hiw-trace-note" data-hiw-trace-note>The tour is running on sample documents. Pick one, or drop your own.</p>
      <ol class="hiw-steps">${steps}</ol>
      <div class="hiw-trace-f"><button type="button" class="hiw-replay" data-hiw-replay>Replay</button><a class="hiw-cta" href="/register">Try it on your books — start free</a></div>
      <p class="hiw-sr" aria-live="polite" data-hiw-live></p>
    </div>
  </div>
</section>`;
}

export const HIW_STYLE = `
#fm-root .hiw, .hiw{
  --h-bg:#060A14; --h-line:rgba(167,156,255,.16); --h-ink:#EEF1F8; --h-muted:#9AA7C0; --h-subtle:#6E7A96;
  --h-indigo:#8B82FF; --h-indigo-2:#A79CFF; --h-teal:#2FBCA9; --h-teal-2:#7FE3D4; --h-amber:#E0A340;
  --h-glass:rgba(17,26,46,.62); --h-glass-2:rgba(12,19,36,.8);
  position:relative; padding:84px 0 104px; color:var(--h-ink);
  background:
    radial-gradient(900px 480px at 50% 0%, rgba(110,100,240,.18), transparent 70%),
    radial-gradient(700px 420px at 90% 70%, rgba(47,188,169,.08), transparent 70%),
    linear-gradient(180deg, #0A1120 0%, var(--h-bg) 40%, #070C18 100%);
  border-top:1px solid #1C2740; overflow:hidden; font-family:var(--font-body, system-ui, sans-serif);
}
.hiw *, .hiw *::before, .hiw *::after{box-sizing:border-box}
.hiw .hiw-sr{position:absolute!important;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.hiw :focus-visible{outline:2px solid var(--h-indigo-2);outline-offset:2px}

.hiw .hiw-head{max-width:760px;margin:0 auto;padding:0 24px;text-align:center}
.hiw .hiw-eyebrow{font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--h-indigo-2)}
#fm-root .hiw .hiw-head h2, .hiw .hiw-head h2{margin:14px 0 0;color:#fff;font-family:var(--font-display, inherit);font-size:clamp(30px,4.6vw,52px);font-weight:800;letter-spacing:-.02em;line-height:1.06;text-wrap:balance}
.hiw .hiw-head h2 span{background:linear-gradient(90deg,var(--h-indigo-2),var(--h-teal-2));-webkit-background-clip:text;background-clip:text;color:transparent}
.hiw .hiw-head p{margin:18px auto 0;max-width:58ch;color:var(--h-muted);font-size:16.5px;line-height:1.6}

/* ---- rail */
.hiw .hiw-rail{list-style:none;margin:40px auto 0;padding:0 24px;max-width:1240px;display:grid;grid-template-columns:repeat(6,1fr);gap:8px}
.hiw .hiw-rail-btn{all:unset;box-sizing:border-box;cursor:pointer;display:grid;grid-template-columns:auto 1fr;align-items:center;column-gap:8px;row-gap:9px;width:100%;padding:10px 12px;border-radius:12px;border:1px solid transparent;color:var(--h-subtle);transition:color .25s,border-color .25s,background-color .25s}
.hiw .hiw-rail-btn:hover{color:var(--h-ink);background:rgba(139,130,255,.06)}
.hiw .hiw-rail-btn:focus-visible{outline:2px solid var(--h-indigo-2);outline-offset:2px}
.hiw .hiw-rail-n{font-family:var(--font-mono, ui-monospace, monospace);font-size:11px;font-weight:600;opacity:.8}
.hiw .hiw-rail-v{font-size:13.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hiw .hiw-rail-bar{grid-column:1/-1;height:2px;border-radius:2px;background:rgba(139,130,255,.16);overflow:hidden}
.hiw .hiw-rail-bar i{display:block;height:100%;width:calc(var(--p,0) * 100%);background:linear-gradient(90deg,var(--h-indigo),var(--h-teal));border-radius:2px}
.hiw .hiw-rail li.is-done .hiw-rail-btn{color:var(--h-muted)}
.hiw .hiw-rail li.is-done .hiw-rail-bar i{width:100%;opacity:.5}
.hiw .hiw-rail li.is-active .hiw-rail-btn{color:#fff;border-color:var(--h-line);background:rgba(139,130,255,.08)}
.hiw .hiw-rail li.is-active .hiw-rail-n{color:var(--h-teal-2)}

/* ---- stage */
.hiw .hiw-stage{position:relative;margin:14px 16px 0;max-width:1320px;height:clamp(470px,40vw,600px);border-radius:28px;overflow:hidden;border:1px solid var(--h-line);background:#070B16;isolation:isolate;box-shadow:0 40px 120px -40px rgba(80,72,229,.35), inset 0 1px 0 rgba(255,255,255,.04)}
@media (min-width:1352px){ .hiw .hiw-stage{margin-inline:auto} }
.hiw .hiw-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:pan-y}
.hiw .hiw-labels{position:absolute;inset:0;pointer-events:none;overflow:hidden;contain:strict}
.hiw .hiw-hud{position:absolute;top:14px;left:14px;right:14px;display:flex;justify-content:space-between;align-items:flex-start;gap:10px;pointer-events:none;z-index:3}
.hiw .hiw-badge{pointer-events:auto;font-size:10.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#F3C77A;background:rgba(224,163,64,.12);border:1px solid rgba(224,163,64,.3);padding:5px 10px;border-radius:999px;backdrop-filter:blur(6px)}
.hiw .hiw-ctrls{display:flex;gap:6px;pointer-events:auto}
.hiw .hiw-ctrl{font:inherit;font-size:12px;font-weight:700;color:var(--h-ink);background:var(--h-glass);border:1px solid var(--h-line);padding:7px 12px;border-radius:999px;cursor:pointer;backdrop-filter:blur(8px);transition:border-color .2s,background-color .2s}
.hiw .hiw-ctrl:hover{border-color:rgba(167,156,255,.5)}
.hiw .hiw-ctrl[aria-pressed="true"]{background:rgba(139,130,255,.22)}
.hiw .hiw-hint{position:absolute;right:16px;bottom:14px;margin:0;font-size:11.5px;color:var(--h-subtle);pointer-events:none;z-index:2}
.hiw .hiw-caption{position:absolute;left:16px;bottom:14px;z-index:2;max-width:390px;margin:0;padding:12px 14px;border-radius:14px;background:var(--h-glass-2);border:1px solid var(--h-line);backdrop-filter:blur(10px);font-size:13px;line-height:1.5;color:var(--h-muted);pointer-events:none}
.hiw .hiw-caption b{display:block;color:#fff;font-size:14px;margin-bottom:2px}
.hiw .hiw-dragover{position:absolute;inset:10px;z-index:5;display:none;place-items:center;border:2px dashed rgba(127,227,212,.7);border-radius:22px;background:rgba(6,10,20,.72);backdrop-filter:blur(4px);text-align:center;font-size:18px;font-weight:800;color:#fff}
.hiw .hiw-dragover small{display:block;font-size:12.5px;font-weight:600;color:var(--h-teal-2);margin-top:6px}
.hiw .hiw-stage.is-drag .hiw-dragover{display:grid}

/* 3D labels (positioned by the scene every frame) */
.hiw .hiw-l{position:absolute;left:0;top:0;translate:-50% -50%;white-space:nowrap;font-size:clamp(10.5px,.85vw,12px);font-weight:600;line-height:1.2;color:rgba(206,212,236,.66);will-change:transform;transition:color .3s,text-shadow .3s,background-color .3s,border-color .3s;visibility:hidden}
.hiw .hiw-l.is-lit{color:#fff;text-shadow:0 0 14px rgba(127,227,212,.8)}
.hiw .hiw-l--left{translate:0 -50%}
.hiw .hiw-l--title{font-size:clamp(8.5px,.78vw,11px);font-weight:800;letter-spacing:clamp(.06em,.01vw + .05em,.14em);text-transform:uppercase;color:rgba(167,156,255,.7)}
.hiw .hiw-l--title span{font-family:var(--font-mono, ui-monospace, monospace);margin-right:7px;opacity:.7}
.hiw .hiw-l--title.is-lit{color:#fff;text-shadow:0 0 16px rgba(139,130,255,.9)}
.hiw .hiw-l--step{font-size:clamp(9px,.74vw,10.5px);font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:rgba(167,156,255,.6)}
.hiw .hiw-l--step.is-lit{color:var(--h-teal-2)}
.hiw .hiw-l--slab{font-size:11px;letter-spacing:.04em}
.hiw .hiw-l--detect,.hiw .hiw-l--action,.hiw .hiw-l--bubble{font-size:12px;font-weight:700;padding:6px 11px;border-radius:999px;backdrop-filter:blur(6px);text-shadow:none}
.hiw .hiw-l--detect{color:#CFF7F0;background:rgba(47,188,169,.14);border:1px solid rgba(47,188,169,.45)}
.hiw .hiw-l--detect::before{content:"Detected · ";color:var(--h-teal-2);font-weight:600}
.hiw .hiw-l--action{color:#FBE3B8;background:rgba(224,163,64,.14);border:1px solid rgba(224,163,64,.45)}
.hiw .hiw-l--action::before{content:"Next · ";color:#F3C77A;font-weight:600}
.hiw .hiw-l--bubble{white-space:normal;width:max-content;max-width:190px;color:#EFFFFB;background:rgba(47,188,169,.2);border:1px solid rgba(47,188,169,.5);border-radius:14px 14px 14px 4px}
.hiw .hiw-l--detect.is-lit,.hiw .hiw-l--action.is-lit,.hiw .hiw-l--bubble.is-lit{text-shadow:none}

/* semantic outline: visible fallback without WebGL, screen-reader only with it */
.hiw .hiw-outline{list-style:none;margin:0;padding:84px 20px 20px;display:grid;grid-template-columns:repeat(3,1fr);gap:12px;position:relative;z-index:1}
.hiw .hiw-o-stage{padding:16px;border-radius:14px;background:var(--h-glass);border:1px solid var(--h-line)}
.hiw .hiw-o-n{font-family:var(--font-mono, ui-monospace, monospace);font-size:11px;color:var(--h-teal-2)}
#fm-root .hiw .hiw-o-stage h3, .hiw .hiw-o-stage h3{margin:6px 0 6px;font-size:15px;color:#fff}
.hiw .hiw-o-stage p{margin:0;font-size:13px;color:var(--h-muted);line-height:1.55}
.hiw.hiw--3d .hiw-outline{position:absolute!important;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);border:0}
.hiw:not(.hiw--3d) .hiw-stage{height:auto;display:flex;flex-direction:column;padding:16px 0 4px}
.hiw:not(.hiw--3d) .hiw-hud{position:relative;inset:auto;padding:0 16px}
.hiw:not(.hiw--3d) .hiw-outline{order:1;padding-top:16px}
.hiw.hiw--reduced .hiw-ctrls [data-hiw-pause]{display:none}
.hiw:not(.hiw--3d) .hiw-caption{order:2}
.hiw:not(.hiw--3d) .hiw-canvas,.hiw:not(.hiw--3d) .hiw-labels,.hiw:not(.hiw--3d) .hiw-hint,.hiw:not(.hiw--3d) .hiw-ctrls{display:none}
.hiw:not(.hiw--3d) .hiw-caption{position:relative;left:auto;bottom:auto;margin:0 20px 20px;max-width:none}

/* ---- demo */
.hiw .hiw-demo{max-width:1320px;margin:22px auto 0;padding:0 16px;display:grid;grid-template-columns:minmax(0,.95fr) minmax(0,1.25fr);gap:18px}
@media (min-width:1352px){ .hiw .hiw-demo{padding:0} }
.hiw .hiw-drop-col,.hiw .hiw-trace{border-radius:22px;border:1px solid var(--h-line);background:linear-gradient(180deg,rgba(17,26,46,.75),rgba(10,16,30,.75));padding:24px}
#fm-root .hiw .hiw-drop-col h3, .hiw .hiw-drop-col h3{margin:0;font-size:18px;color:#fff}
.hiw .hiw-sub{margin:6px 0 16px;color:var(--h-muted);font-size:14px}
.hiw .hiw-dropzone{display:flex;flex-direction:column;align-items:center;text-align:center;gap:6px;padding:26px 18px;border-radius:16px;border:1.5px dashed rgba(167,156,255,.38);background:rgba(139,130,255,.05);cursor:pointer;transition:border-color .2s,background-color .2s,transform .2s}
.hiw .hiw-dropzone:hover,.hiw .hiw-dropzone.is-drag{border-color:var(--h-teal);background:rgba(47,188,169,.08)}
.hiw .hiw-dropzone.is-drag{transform:scale(1.01)}
.hiw #hiw-file:focus-visible + .hiw-dropzone{outline:2px solid var(--h-indigo-2);outline-offset:3px}
.hiw .hiw-dz-icon{display:grid;place-items:center;width:48px;height:48px;border-radius:14px;background:rgba(139,130,255,.14);color:var(--h-indigo-2);margin-bottom:4px}
.hiw .hiw-dz-t{font-weight:700;color:#fff;font-size:15px}
.hiw .hiw-dz-t u{text-decoration-color:rgba(167,156,255,.6);text-underline-offset:3px}
.hiw .hiw-dz-s{font-size:12.5px;color:var(--h-subtle);max-width:40ch}
.hiw .hiw-dz-lock{display:inline-flex;align-items:center;gap:6px;margin-top:6px;font-size:12px;font-weight:600;color:var(--h-teal-2)}
.hiw .hiw-err{margin:10px 0 0;font-size:13px;color:#F4A39B}
.hiw .hiw-samples{margin-top:18px}
.hiw .hiw-samples > span{font-size:11.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--h-subtle)}
.hiw .hiw-chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.hiw .hiw-chip{font:inherit;font-size:13px;font-weight:600;color:var(--h-ink);background:rgba(255,255,255,.03);border:1px solid var(--h-line);padding:8px 13px;border-radius:999px;cursor:pointer;transition:border-color .2s,background-color .2s,color .2s}
.hiw .hiw-chip:hover{border-color:rgba(167,156,255,.55)}
.hiw .hiw-how{margin-top:22px;padding:14px 16px;border-radius:14px;background:rgba(255,255,255,.025);border:1px solid rgba(167,156,255,.1)}
.hiw .hiw-how b{display:block;font-size:13px;color:var(--h-ink)}
.hiw .hiw-how p{margin:6px 0 0;font-size:12.5px;line-height:1.55;color:var(--h-muted)}
.hiw .hiw-mod--field{background:rgba(255,255,255,.05)!important;color:var(--h-muted)!important;font-weight:600}
.hiw .hiw-chip[aria-pressed="true"]{background:rgba(47,188,169,.14);border-color:rgba(47,188,169,.6);color:#fff}

.hiw .hiw-trace-h{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
.hiw .hiw-trace-k{display:block;font-size:11.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--h-subtle)}
.hiw .hiw-trace-h b{display:block;margin-top:4px;font-size:18px;color:#fff;overflow-wrap:anywhere}
.hiw .hiw-trace-badge{flex:none;font-size:10.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;padding:4px 10px;border-radius:999px;color:#F3C77A;background:rgba(224,163,64,.12);border:1px solid rgba(224,163,64,.3)}
.hiw .hiw-trace-badge.is-local{color:var(--h-teal-2);background:rgba(47,188,169,.12);border-color:rgba(47,188,169,.35)}
.hiw .hiw-trace-note{margin:8px 0 0;font-size:13px;color:var(--h-muted)}
.hiw .hiw-steps{list-style:none;margin:16px 0 0;padding:0;display:grid;grid-template-columns:1fr 1fr;gap:10px}
.hiw .hiw-step{border-radius:14px;border:1px solid rgba(167,156,255,.1);background:rgba(255,255,255,.02);padding:12px 14px;min-height:74px;transition:border-color .35s,background-color .35s,opacity .35s;opacity:.45}
.hiw .hiw-step.is-on{opacity:1;border-color:rgba(47,188,169,.35);background:rgba(47,188,169,.05)}
.hiw .hiw-step.is-now{border-color:rgba(127,227,212,.75);box-shadow:0 0 0 3px rgba(47,188,169,.12)}
.hiw .hiw-step-h{display:flex;align-items:center;gap:8px;font-size:11.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--h-muted)}
.hiw .hiw-step-n{display:grid;place-items:center;width:18px;height:18px;border-radius:50%;font-size:10.5px;background:rgba(139,130,255,.18);color:var(--h-indigo-2)}
.hiw .hiw-step.is-on .hiw-step-n{background:var(--h-teal);color:#04201C}
.hiw .hiw-step-b{margin-top:8px;font-size:13.5px;color:var(--h-ink);line-height:1.5}
.hiw .hiw-step:not(.is-on) .hiw-step-b{visibility:hidden}
.hiw .hiw-step-b small{display:block;color:var(--h-subtle);font-size:12px;margin-top:3px}
.hiw .hiw-kv{display:grid;grid-template-columns:auto 1fr;gap:3px 12px;margin:0;font-size:12.5px}
.hiw .hiw-kv dt{color:var(--h-subtle)}
.hiw .hiw-kv dd{margin:0;color:var(--h-ink);font-family:var(--font-mono, ui-monospace, monospace);font-size:12px;overflow-wrap:anywhere}
.hiw .hiw-kv dd.is-pending{font-family:inherit;color:var(--h-subtle);font-style:italic}
.hiw .hiw-mods{display:flex;flex-wrap:wrap;gap:6px}
.hiw .hiw-mod{font-size:12px;font-weight:700;padding:3px 9px;border-radius:999px;background:rgba(139,130,255,.14);color:#D6D2FF}
.hiw .hiw-mod:first-child{background:rgba(47,188,169,.18);color:#CFF7F0}
.hiw .hiw-je{width:100%;border-collapse:collapse;font-size:12px}
.hiw .hiw-je td{padding:3px 0;border-bottom:1px solid rgba(167,156,255,.1);vertical-align:top}
.hiw .hiw-je td.n{text-align:right;font-family:var(--font-mono, ui-monospace, monospace);white-space:nowrap;padding-left:10px;color:var(--h-ink)}
.hiw .hiw-je td.n.p{color:var(--h-subtle);font-family:inherit;font-style:italic}
.hiw .hiw-je th{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--h-subtle);text-align:right;padding-bottom:3px}
.hiw .hiw-je th:first-child{text-align:left}
.hiw .hiw-step[data-hiw-step="1"],.hiw .hiw-step[data-hiw-step="3"]{grid-row:span 2}
.hiw .hiw-trace-f{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:16px;flex-wrap:wrap}
.hiw .hiw-replay{font:inherit;font-size:13px;font-weight:700;color:var(--h-ink);background:transparent;border:1px solid var(--h-line);padding:8px 14px;border-radius:10px;cursor:pointer}
.hiw .hiw-replay:hover{border-color:rgba(167,156,255,.55)}
.hiw .hiw-cta{font-size:13.5px;font-weight:700;color:#fff;background:#6E64F0;padding:9px 16px;border-radius:10px;text-decoration:none}
.hiw .hiw-cta:hover{background:#8981F5}

@media (max-width:980px){
  .hiw .hiw-demo{grid-template-columns:1fr}
}
.hiw .hiw-try-toggle{display:none}
@media (max-width:760px){
  /* Phones: the 3D tour tells the story; the hands-on demo opens on request (or when a card is tapped). */
  .hiw .hiw-try-toggle{display:flex;align-items:center;justify-content:center;gap:8px;width:calc(100% - 32px);margin:16px auto 0;min-height:48px;border-radius:14px;border:1px solid var(--h-line);background:rgba(110,100,240,.16);color:#fff;font:inherit;font-size:15px;font-weight:700;cursor:pointer}
  .hiw .hiw-try-toggle:focus-visible{outline:2px solid #8981F5;outline-offset:2px}
  .hiw .hiw-demo{display:none}
  .hiw.hiw--try-open .hiw-demo{display:grid}
  .hiw.hiw--try-open .hiw-try-toggle span{transform:rotate(180deg)}
}
@media (max-width:760px){
  #fm-root .hiw, .hiw{padding:64px 0 72px}
  .hiw .hiw-head{padding:0 16px}
  .hiw .hiw-head p{font-size:15.5px}
  .hiw .hiw-rail{grid-template-columns:repeat(3,1fr);padding:0 16px;gap:4px;margin-top:28px}
  .hiw .hiw-rail-btn{padding:8px}
  .hiw .hiw-rail-v{font-size:12px}
  .hiw .hiw-stage{height:min(700px,172vw);border-radius:22px}
  .hiw.hiw--3d .hiw-canvas,.hiw.hiw--3d .hiw-labels{height:calc(100% - 104px);bottom:auto}
  .hiw .hiw-caption{left:10px;right:10px;bottom:10px;max-width:none;min-height:84px;padding:10px 12px;font-size:12.5px}
  .hiw .hiw-rail-n{display:none}
  .hiw .hiw-rail-btn{grid-template-columns:1fr}
  .hiw .hiw-hint{display:none}
  .hiw .hiw-l{font-size:10.5px}
  .hiw .hiw-l--title{font-size:10px}
  .hiw .hiw-l--step{font-size:9.5px}
  .hiw .hiw-l--detect,.hiw .hiw-l--action,.hiw .hiw-l--bubble{font-size:11px;padding:5px 9px}
  .hiw .hiw-outline{grid-template-columns:1fr;padding-top:64px}
  .hiw .hiw-drop-col,.hiw .hiw-trace{padding:18px}
  .hiw .hiw-steps{grid-template-columns:1fr}
  .hiw .hiw-step[data-hiw-step="1"],.hiw .hiw-step[data-hiw-step="3"]{grid-row:auto}
}
@media (prefers-reduced-motion: reduce){
  .hiw *, .hiw *::before, .hiw *::after{transition-duration:.001ms!important;animation-duration:.001ms!important}
}
`;
