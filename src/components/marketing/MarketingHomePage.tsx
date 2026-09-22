// @ts-nocheck
// This file's interactive layer (inside the useEffect below) is a
// vanilla-DOM script ported directly from a static HTML/JS prototype —
// see the note further down. It intentionally isn't typed against
// strict/noUncheckedIndexedAccess (getElementById results, object
// string-indexing, etc. would need heavy casting for no real safety
// benefit, since the whole block is already wrapped in a try/catch as
// progressive enhancement). The JSX below this file's effect is normal
// typed React and unaffected by this.
"use client";

// This is the Finloraq marketing homepage — served at "/". It is
// intentionally self-contained (its own scoped CSS under #fm-root, its
// own interactivity in the effect below) rather than built from the
// app's Tailwind/shadcn components: it's a distinct, marketing-styled
// surface from the authenticated product, the same way most SaaS
// products keep their landing page and app UI as separate systems that
// happen to share a domain. All CSS selectors are scoped under #fm-root
// (see scripts/ for how this was generated) so nothing here leaks into
// the authenticated app's styles, and vice versa.
//
// The interactive "Business Pulse" demo, What-If simulator, FAQ
// accordion and pricing toggle all run on vanilla DOM APIs in the
// effect below rather than React state — this was authored as a static
// HTML/CSS/JS artifact first and ported in directly, which keeps it
// easy to diff against that original. A future pass could re-implement
// it as idiomatic React components if this page grows real product
// logic beyond a marketing demo.
import { useEffect } from "react";

const STYLE = `
  #fm-root{
    --bg:#F6F7FA; --canvas:#FFFFFF; --canvas-2:#F0F2F6;
    --ink:#0E1526; --ink-muted:#4B5568; --ink-subtle:#8890A0;
    --line:#DFE3EB; --line-strong:#C7CEDA;
    --navy:#0A1120; --navy-2:#101A30; --navy-line:#22304C; --on-navy:#EEF1F8; --on-navy-muted:#9AA7C0;
    --brand:#4F46E5; --brand-strong:#3D34C9; --on-brand:#FFFFFF; --brand-tint:#EEEDFC;
    --teal:#0F9E8E; --teal-tint:#E4F6F3;
    --success:#1F8A57; --success-bg:#E6F5EC;
    --warning:#B4740A; --warning-bg:#FBF1DC;
    --danger:#C0392B; --danger-bg:#FBEAE8;
    --r-sm:6px; --r-md:10px; --r-lg:16px; --r-full:999px;
    --shadow-sm:0 1px 2px rgba(10,17,32,.06), 0 1px 1px rgba(10,17,32,.04);
    --shadow-md:0 12px 32px rgba(10,17,32,.10);
    --font-display:'Libre Franklin',ui-sans-serif,system-ui,sans-serif;
    --font-body:'Public Sans',ui-sans-serif,system-ui,sans-serif;
    --font-mono:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace;
  }
  @media (prefers-color-scheme: dark){
    #fm-root:not([data-theme="light"]){
      --bg:#0A0F1C; --canvas:#111A2E; --canvas-2:#0D1424;
      --ink:#EDF1F8; --ink-muted:#A6B0C4; --ink-subtle:#6E788C;
      --line:#233150; --line-strong:#324467;
      --navy:#060A14; --navy-2:#0B1220; --navy-line:#1C2740; --on-navy:#EEF1F8; --on-navy-muted:#8E9AB6;
      --brand:#6E64F0; --brand-strong:#8981F5; --on-brand:#0A0F1C; --brand-tint:#1B1A3A;
      --teal:#2FBCA9; --teal-tint:#0F2A28;
      --success:#3FBE81; --success-bg:#123420;
      --warning:#E0A340; --warning-bg:#3A2C10;
      --danger:#E2685F; --danger-bg:#3A1616;
      --shadow-sm:0 1px 2px rgba(0,0,0,.5); --shadow-md:0 16px 40px rgba(0,0,0,.55);
    }
  }
  #fm-root[data-theme="dark"]{
    --bg:#0A0F1C; --canvas:#111A2E; --canvas-2:#0D1424;
    --ink:#EDF1F8; --ink-muted:#A6B0C4; --ink-subtle:#6E788C;
    --line:#233150; --line-strong:#324467;
    --navy:#060A14; --navy-2:#0B1220; --navy-line:#1C2740; --on-navy:#EEF1F8; --on-navy-muted:#8E9AB6;
    --brand:#6E64F0; --brand-strong:#8981F5; --on-brand:#0A0F1C; --brand-tint:#1B1A3A;
    --teal:#2FBCA9; --teal-tint:#0F2A28;
    --success:#3FBE81; --success-bg:#123420;
    --warning:#E0A340; --warning-bg:#3A2C10;
    --danger:#E2685F; --danger-bg:#3A1616;
    --shadow-sm:0 1px 2px rgba(0,0,0,.5); --shadow-md:0 16px 40px rgba(0,0,0,.55);
  }

  #fm-root, #fm-root *{box-sizing:border-box}
  #fm-root{margin:0;background:var(--bg);color:var(--ink);font-family:var(--font-body);line-height:1.5;-webkit-font-smoothing:antialiased}
  #fm-root h1, #fm-root h2, #fm-root h3, #fm-root h4{font-family:var(--font-display);text-wrap:balance;margin:0;color:var(--ink)}
  #fm-root p{margin:0}
  #fm-root a{color:inherit;text-decoration:none}
  #fm-root .num{font-family:var(--font-mono);font-variant-numeric:tabular-nums}
  #fm-root img, #fm-root svg{max-width:100%}
  #fm-root [hidden]{display:none!important}
  #fm-root :focus-visible{outline:2px solid var(--brand);outline-offset:2px}
  @media (prefers-reduced-motion: reduce){ #fm-root, #fm-root *{animation-duration:.001ms!important;transition-duration:.001ms!important} }

  #fm-root .wrap{max-width:1180px;margin:0 auto;padding-inline:24px}
  #fm-root .eyebrow{font-size:12px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--brand)}
  #fm-root .eyebrow.on-navy{color:#9C93F7}
  #fm-root section{padding-block:88px}
  @media (max-width:720px){ #fm-root section{padding-block:56px} #fm-root .wrap{padding-inline:16px} }

  /* ---------- Nav ---------- */
  #fm-root header.nav{position:sticky;top:env(safe-area-inset-top,0px);z-index:40;background:color-mix(in srgb, var(--bg) 88%, transparent);backdrop-filter:saturate(140%) blur(10px);border-bottom:1px solid var(--line)}
  #fm-root .nav-row{display:flex;align-items:center;gap:32px;height:68px}
  #fm-root .brand-mark{display:flex;align-items:center;gap:9px;font-family:var(--font-display);font-weight:800;font-size:19px;letter-spacing:-.01em;flex:0 0 auto}
  #fm-root .brand-mark .dot{width:9px;height:9px;border-radius:50%;background:var(--brand)}
  #fm-root nav.links{display:flex;gap:28px;font-size:14px;font-weight:600;color:var(--ink-muted)}
  #fm-root nav.links a:hover{color:var(--ink)}
  #fm-root .nav-right{margin-left:auto;display:flex;align-items:center;gap:10px}
  @media (max-width:860px){ #fm-root nav.links{display:none} }

  #fm-root .btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;font-family:var(--font-body);font-weight:700;font-size:14px;border-radius:var(--r-md);padding:11px 20px;border:1px solid transparent;cursor:pointer;transition:transform .12s ease, background .15s ease, border-color .15s ease}
  #fm-root .btn:active{transform:translateY(1px)}
  #fm-root .btn-primary{background:var(--brand);color:var(--on-brand)}
  #fm-root .btn-primary:hover{background:var(--brand-strong)}
  #fm-root .btn-ghost{background:transparent;color:var(--ink);border-color:var(--line-strong)}
  #fm-root .btn-ghost:hover{border-color:var(--brand)}
  #fm-root .btn-ghost.on-navy{color:var(--on-navy);border-color:var(--navy-line)}
  #fm-root .btn-ghost.on-navy:hover{border-color:#5A6C93}
  #fm-root .btn-sm{padding:8px 14px;font-size:13px}
  #fm-root .btn-block{width:100%}

  /* ---------- Hero ---------- */
  #fm-root .hero{background:radial-gradient(1100px 520px at 18% -10%, #171F3A 0%, var(--navy) 55%), var(--navy);color:var(--on-navy);position:relative;overflow:hidden;padding-block:76px 64px;text-align:center}
  #fm-root .hero .wrap{max-width:760px}
  #fm-root .trust-line{display:flex;align-items:center;justify-content:center;gap:10px;margin-top:28px;font-size:13px;color:var(--on-navy-muted)}
  #fm-root .trust-line .sep{width:3px;height:3px;border-radius:50%;background:var(--on-navy-muted)}
  #fm-root .hero h1{font-size:clamp(38px,6.2vw,64px);font-weight:800;letter-spacing:-.02em;line-height:1.03;color:#fff}
  #fm-root .hero h1 span{color:#A79CFF}
  #fm-root .hero p.lead{margin:20px auto 0;font-size:17px;line-height:1.6;color:var(--on-navy-muted);max-width:46ch}
  #fm-root .hero .cta-row{display:flex;gap:12px;margin-top:30px;flex-wrap:wrap;justify-content:center}

  /* ---------- Generic section headers ---------- */
  #fm-root .sec-head{max-width:640px;margin-bottom:40px}
  #fm-root .sec-head h2{font-size:clamp(26px,3.4vw,36px);font-weight:800;letter-spacing:-.015em}
  #fm-root .sec-head p{margin-top:14px;font-size:16px;color:var(--ink-muted);line-height:1.6}
  #fm-root section.on-navy{background:var(--navy);color:var(--on-navy)}
  #fm-root section.on-navy .sec-head h2{color:#fff}
  #fm-root section.on-navy .sec-head p{color:var(--on-navy-muted)}
  #fm-root section.canvas{background:var(--canvas)}

  #fm-root .card{background:var(--canvas);border:1px solid var(--line);border-radius:var(--r-md);box-shadow:var(--shadow-sm)}
  #fm-root .demo-badge{display:inline-block;font-size:10.5px;font-weight:800;letter-spacing:.08em;color:var(--warning);background:var(--warning-bg);padding:4px 10px;border-radius:var(--r-full);margin-bottom:14px}

  /* ---------- Live Product Preview / demo ---------- */
  #fm-root .pulse-demo{display:grid;grid-template-columns:220px 1fr;gap:0;border:1px solid var(--line);border-radius:var(--r-lg);overflow:hidden;background:var(--canvas);box-shadow:var(--shadow-md)}
  @media (max-width:820px){ #fm-root .pulse-demo{grid-template-columns:1fr} }
  #fm-root .demo-nav{background:var(--canvas-2);border-right:1px solid var(--line);padding:14px}
  @media (max-width:820px){ #fm-root .demo-nav{border-right:none;border-bottom:1px solid var(--line);display:flex;flex-wrap:wrap;gap:4px} }
  #fm-root .demo-nav .demo-tag{font-size:10px;font-weight:800;letter-spacing:.08em;color:var(--ink-subtle);padding:6px 8px;margin-bottom:10px}
  @media (max-width:820px){ #fm-root .demo-nav .demo-tag{width:100%} }
  #fm-root .demo-nav button{display:flex;align-items:center;width:100%;text-align:left;gap:9px;padding:9px 10px;border-radius:var(--r-sm);border:none;background:transparent;font:inherit;font-size:13.5px;font-weight:600;color:var(--ink-muted);cursor:pointer}
  @media (max-width:820px){ #fm-root .demo-nav button{width:auto} }
  #fm-root .demo-nav button:hover{background:var(--line)}
  #fm-root .demo-nav button.active{background:var(--brand-tint);color:var(--brand-strong)}
  #fm-root .demo-body{padding:26px;min-height:360px}
  #fm-root .demo-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
  @media (max-width:820px){ #fm-root .demo-grid{grid-template-columns:repeat(2,1fr)} }
  #fm-root .stile{border:1px solid var(--line);border-radius:var(--r-md);padding:14px}
  #fm-root .stile .lbl{font-size:11.5px;color:var(--ink-muted);text-transform:uppercase;letter-spacing:.05em}
  #fm-root .stile .val{font-family:var(--font-mono);font-size:21px;font-weight:700;margin-top:6px}
  #fm-root .stile .delta{font-size:12px;margin-top:4px;font-weight:700}

  #fm-root .todo-list{margin-top:18px;display:flex;flex-direction:column;gap:1px;background:var(--line);border:1px solid var(--line);border-radius:var(--r-md);overflow:hidden}
  #fm-root .todo-item{background:var(--canvas);display:flex;align-items:center;gap:12px;padding:13px 16px}
  #fm-root .todo-item .n{font-family:var(--font-mono);font-size:12px;color:var(--ink-subtle);width:16px}
  #fm-root .todo-item .t{flex:1;font-size:13.5px}
  #fm-root .todo-item .t b{font-weight:700}

  #fm-root .panel-title{font-weight:800;font-size:15px;margin-bottom:16px}
  #fm-root .demo-table{width:100%;border-collapse:collapse;font-size:13px}
  #fm-root .demo-table th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-subtle);padding:8px 10px;border-bottom:1px solid var(--line)}
  #fm-root .demo-table td{padding:10px;border-bottom:1px solid var(--line)}
  #fm-root .demo-table tr:last-child td{border-bottom:none}
  #fm-root .demo-table td.num{text-align:right}
  #fm-root .bar-row{display:flex;align-items:center;gap:12px;padding:9px 0}
  #fm-root .bar-row .bl{width:120px;font-size:13px;flex:0 0 auto}
  #fm-root .bar-track{flex:1;height:8px;background:var(--line);border-radius:var(--r-full);overflow:hidden}
  #fm-root .bar-fill{height:100%;background:var(--brand);border-radius:var(--r-full)}
  #fm-root .bar-row .bv{width:76px;text-align:right;font-size:12.5px;font-weight:700}
  #fm-root .chip-row{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px}
  #fm-root .chip{border:1px solid var(--line);background:var(--canvas);border-radius:var(--r-full);padding:7px 13px;font-size:12.5px;font-weight:600;cursor:pointer;color:var(--ink-muted)}
  #fm-root .chip:hover{border-color:var(--brand);color:var(--brand)}
  #fm-root .chat-log{display:flex;flex-direction:column;gap:12px;min-height:90px}
  #fm-root .chat-msg{max-width:80%;padding:10px 14px;border-radius:var(--r-md);font-size:13.5px;line-height:1.5}
  #fm-root .chat-msg.user{align-self:flex-end;background:var(--brand);color:var(--on-brand)}
  #fm-root .chat-msg.ai{align-self:flex-start;background:var(--canvas-2);border:1px solid var(--line)}
  #fm-root .status-pill{font-size:11px;font-weight:700;padding:3px 9px;border-radius:var(--r-full)}
  #fm-root .status-pill.paid{background:var(--success-bg);color:var(--success)}
  #fm-root .status-pill.overdue{background:var(--danger-bg);color:var(--danger)}
  #fm-root .status-pill.draft{background:#E9F2FB;color:#2A6FB0}
  #fm-root .mini-note{font-size:12.5px;color:var(--ink-muted);margin-top:12px;line-height:1.55}

  #fm-root .tag{font-size:10.5px;font-weight:800;letter-spacing:.06em;padding:3px 8px;border-radius:var(--r-full);display:inline-block}
  #fm-root .tag.warn{background:var(--warning-bg);color:var(--warning)}
  #fm-root .tag.danger{background:var(--danger-bg);color:var(--danger)}
  #fm-root .tag.info{background:#E9F2FB;color:#2A6FB0}

  /* ---------- Finloraq Difference (loop) ---------- */
  #fm-root .loop-track{display:grid;grid-template-columns:repeat(4,1fr);gap:0;margin-top:48px;position:relative}
  @media (max-width:900px){ #fm-root .loop-track{grid-template-columns:1fr;gap:14px} }
  #fm-root .loop-step{position:relative;padding:22px 18px 0;border-top:3px solid var(--line)}
  #fm-root .loop-step.is-active{border-top-color:var(--brand)}
  #fm-root .loop-step .n{font-family:var(--font-mono);font-size:12px;color:var(--ink-subtle)}
  #fm-root .loop-step h4{font-size:16px;margin-top:8px}
  #fm-root .loop-step p{font-size:13.5px;color:var(--ink-muted);margin-top:6px;line-height:1.55}
  @media (max-width:900px){ #fm-root .loop-step{border-top:none;border-left:3px solid var(--line);padding:0 0 0 18px} #fm-root .loop-step.is-active{border-left-color:var(--brand)} }

  /* ---------- Business Pulse example cards ---------- */
  #fm-root .icard-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
  @media (max-width:900px){ #fm-root .icard-grid{grid-template-columns:repeat(2,1fr)} }
  @media (max-width:600px){ #fm-root .icard-grid{grid-template-columns:1fr} }
  #fm-root .icard{border:1px solid var(--line);border-radius:var(--r-lg);background:var(--canvas);padding:18px;display:flex;flex-direction:column;gap:10px;box-shadow:var(--shadow-sm)}
  #fm-root .icard .headline{font-weight:700;font-size:14.5px}
  #fm-root .icard .why{font-size:12.5px;color:var(--ink-muted);line-height:1.5}
  #fm-root .icard .why b{color:var(--ink);font-weight:700}
  #fm-root .icard .actions{display:flex;gap:8px;margin-top:2px}

  /* ---------- Agents ---------- */
  #fm-root .agent-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
  @media (max-width:880px){ #fm-root .agent-grid{grid-template-columns:repeat(2,1fr)} }
  @media (max-width:560px){ #fm-root .agent-grid{grid-template-columns:1fr} }
  #fm-root .agent-card{background:var(--navy-2);border:1px solid var(--navy-line);border-radius:var(--r-lg);padding:22px}
  #fm-root .agent-card .glyph{width:34px;height:34px;border-radius:9px;background:var(--brand-tint);color:var(--brand);display:flex;align-items:center;justify-content:center;font-weight:800;font-family:var(--font-mono);font-size:13px}
  #fm-root .agent-card h4{color:#fff;margin-top:16px;font-size:15.5px}
  #fm-root .agent-card p{color:var(--on-navy-muted);font-size:13.5px;margin-top:8px;line-height:1.55}
  #fm-root .control-strip{margin-top:28px;border:1px solid var(--navy-line);background:var(--navy-2);border-radius:var(--r-md);padding:16px 20px;display:flex;align-items:center;gap:14px;flex-wrap:wrap;color:var(--on-navy-muted);font-size:13.5px}
  #fm-root .control-strip b{color:#fff}

  /* ---------- What-if ---------- */
  #fm-root .whatif{display:grid;grid-template-columns:1fr 1fr;gap:0;border:1px solid var(--line);border-radius:var(--r-lg);overflow:hidden;box-shadow:var(--shadow-sm)}
  @media (max-width:860px){ #fm-root .whatif{grid-template-columns:1fr} }
  #fm-root .whatif-controls{background:var(--canvas);padding:26px;display:flex;flex-direction:column;gap:22px}
  #fm-root .slider-row .top{display:flex;justify-content:space-between;font-size:13.5px;font-weight:700;margin-bottom:8px}
  #fm-root .slider-row .top span.v{font-family:var(--font-mono);color:var(--brand)}
  #fm-root input[type=range]{width:100%;accent-color:var(--brand)}
  #fm-root .whatif-result{background:var(--canvas-2);padding:26px;border-left:1px solid var(--line)}
  @media (max-width:860px){ #fm-root .whatif-result{border-left:none;border-top:1px solid var(--line)} }
  #fm-root .wr-row{display:flex;justify-content:space-between;align-items:baseline;padding:13px 0;border-bottom:1px solid var(--line)}
  #fm-root .wr-row:last-of-type{border-bottom:none}
  #fm-root .wr-row .wv{font-family:var(--font-mono);font-size:19px;font-weight:700}
  #fm-root .sim-note{margin-top:16px;font-size:11.5px;font-weight:700;letter-spacing:.03em;color:var(--warning);background:var(--warning-bg);padding:8px 10px;border-radius:var(--r-sm)}

  /* ---------- Foundation grid ---------- */
  #fm-root .found-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--navy-line);border:1px solid var(--navy-line);border-radius:var(--r-md);overflow:hidden}
  @media (max-width:760px){ #fm-root .found-grid{grid-template-columns:repeat(2,1fr)} }
  #fm-root .found-item{background:var(--navy-2);color:#fff;padding:16px;font-size:13.5px;font-weight:700}

  /* ---------- Doc intelligence ---------- */
  #fm-root .flow{display:flex;flex-wrap:wrap;gap:0;align-items:stretch;margin-top:12px}
  #fm-root .flow-step{background:var(--canvas);border:1px solid var(--line);border-radius:var(--r-md);padding:14px 16px;font-size:13px;font-weight:700;display:flex;align-items:center;min-width:150px;flex:1}
  #fm-root .flow-arrow{display:flex;align-items:center;justify-content:center;width:34px;color:var(--ink-subtle);flex:0 0 auto}
  @media (max-width:760px){ #fm-root .flow{flex-direction:column} #fm-root .flow-arrow{transform:rotate(90deg);width:100%;height:22px} }

  /* ---------- Health ---------- */
  #fm-root .health-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
  @media (max-width:760px){ #fm-root .health-grid{grid-template-columns:1fr 1fr} }
  @media (max-width:480px){ #fm-root .health-grid{grid-template-columns:1fr} }
  #fm-root .health-item{border:1px solid var(--line);border-radius:var(--r-md);padding:16px;display:flex;flex-direction:column;gap:8px}
  #fm-root .health-item .lbl{font-size:12.5px;color:var(--ink-muted);font-weight:700}
  #fm-root .status-badge{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;padding:4px 10px;border-radius:var(--r-full);width:fit-content}
  #fm-root .status-badge.good{background:var(--success-bg);color:var(--success)}
  #fm-root .status-badge.watch{background:var(--warning-bg);color:var(--warning)}
  #fm-root .status-badge.stable{background:#E9F2FB;color:#2A6FB0}
  #fm-root .why-box{border:1px solid var(--line);border-radius:var(--r-lg);background:var(--canvas);box-shadow:var(--shadow-sm);overflow:hidden}
  #fm-root .why-top{padding:18px 22px;border-bottom:1px solid var(--line)}
  #fm-root .why-panel{padding:18px 22px 22px;display:grid;gap:10px}
  #fm-root .why-row{display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--line);font-size:13.5px}
  #fm-root .why-row:last-child{border-bottom:none}
  #fm-root .why-row .amt{font-family:var(--font-mono);font-weight:700;color:var(--danger)}

  /* ---------- Trust ---------- */
  #fm-root .trust-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}
  @media (max-width:700px){ #fm-root .trust-grid{grid-template-columns:1fr} }
  #fm-root .trust-item{display:flex;gap:12px;padding:14px;border:1px solid var(--navy-line);border-radius:var(--r-md);background:var(--navy-2)}
  #fm-root .trust-item .ic{color:var(--teal);flex:0 0 auto;margin-top:1px}
  #fm-root .trust-item h5{color:#fff;font-size:14px;margin-bottom:4px}
  #fm-root .trust-item p{color:var(--on-navy-muted);font-size:12.5px;line-height:1.5}

  /* ---------- Audience ---------- */
  #fm-root .aud-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
  @media (max-width:900px){ #fm-root .aud-grid{grid-template-columns:repeat(2,1fr)} }
  @media (max-width:520px){ #fm-root .aud-grid{grid-template-columns:1fr} }
  #fm-root .aud-card{border:1px solid var(--line);border-radius:var(--r-md);padding:20px;background:var(--canvas)}
  #fm-root .aud-card .eyebrow{margin-bottom:10px}

  /* ---------- Pricing ---------- */
  #fm-root .price-toggle{display:inline-flex;border:1px solid var(--line);border-radius:var(--r-full);padding:3px;gap:2px;margin-bottom:36px}
  #fm-root .price-toggle button{border:none;background:transparent;font:inherit;font-size:13px;font-weight:700;padding:8px 16px;border-radius:var(--r-full);cursor:pointer;color:var(--ink-muted)}
  #fm-root .price-toggle button.active{background:var(--ink);color:var(--canvas)}
  #fm-root .price-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:12px}
  @media (max-width:1024px){ #fm-root .price-grid{grid-template-columns:repeat(3,1fr)} }
  @media (max-width:700px){ #fm-root .price-grid{grid-template-columns:repeat(2,1fr)} }
  @media (max-width:460px){ #fm-root .price-grid{grid-template-columns:1fr} }
  #fm-root .plan{border:1px solid var(--line);border-radius:var(--r-lg);padding:20px;display:flex;flex-direction:column;gap:14px;background:var(--canvas)}
  #fm-root .plan.feat{border-color:var(--brand);box-shadow:0 0 0 1px var(--brand)}
  #fm-root .plan .pname{font-weight:800;font-size:15px}
  #fm-root .plan .pprice{font-family:var(--font-mono);font-size:24px;font-weight:700}
  #fm-root .plan .pprice small{font-family:var(--font-body);font-size:12px;font-weight:600;color:var(--ink-muted)}
  #fm-root .plan ul{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:8px;font-size:12.5px;color:var(--ink-muted);flex:1}
  #fm-root .plan li{display:flex;gap:7px}
  #fm-root .plan li svg{flex:0 0 auto;color:var(--teal);margin-top:2px}

  /* ---------- FAQ ---------- */
  #fm-root .faq{border-top:1px solid var(--line)}
  #fm-root .faq-item{border-bottom:1px solid var(--line)}
  #fm-root .faq-q{width:100%;text-align:left;background:none;border:none;font:inherit;padding:18px 0;display:flex;justify-content:space-between;align-items:center;gap:16px;cursor:pointer;font-weight:700;font-size:15px;color:var(--ink)}
  #fm-root .faq-q .chev{transition:transform .18s ease;flex:0 0 auto;color:var(--ink-subtle)}
  #fm-root .faq-item[open] .chev{transform:rotate(180deg)}
  #fm-root .faq-a{padding-bottom:18px;font-size:14px;color:var(--ink-muted);line-height:1.65;max-width:70ch}

  /* ---------- Final CTA / footer ---------- */
  #fm-root .final-cta{background:radial-gradient(900px 400px at 50% -30%, #1A2246, var(--navy));color:#fff;text-align:center}
  #fm-root .final-cta h2{color:#fff;font-size:clamp(28px,4vw,42px);font-weight:800;letter-spacing:-.02em}
  #fm-root .final-cta p{margin-top:16px;color:var(--on-navy-muted);font-size:16px}
  #fm-root .final-cta .cta-row{justify-content:center;margin-top:30px}

  #fm-root footer{background:var(--navy);color:var(--on-navy-muted);border-top:1px solid var(--navy-line)}
  #fm-root .foot-grid{display:grid;grid-template-columns:1.4fr repeat(4,1fr);gap:32px;padding-block:56px}
  @media (max-width:820px){ #fm-root .foot-grid{grid-template-columns:repeat(2,1fr)} }
  @media (max-width:520px){ #fm-root .foot-grid{grid-template-columns:1fr} }
  #fm-root .foot-grid h6{color:#fff;font-size:12px;text-transform:uppercase;letter-spacing:.06em;margin-bottom:14px}
  #fm-root .foot-grid ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px;font-size:13.5px}
  #fm-root .foot-grid a:hover{color:#fff}
  #fm-root .foot-bottom{border-top:1px solid var(--navy-line);padding:20px 0;font-size:12.5px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px}
`;

const BODY_HTML = `<header class="nav">
  <div class="wrap nav-row">
    <div class="brand-mark"><span class="dot"></span>FINLORAQ</div>
    <nav class="links">
      <a href="#demo">Products</a>
      <a href="#audience">Solutions</a>
      <a href="#agents">AI Finance</a>
      <a href="#foundation">Resources</a>
      <a href="#pricing">Pricing</a>
    </nav>
    <div class="nav-right">
      <a class="btn btn-ghost btn-sm" href="/login">Sign In</a>
      <a class="btn btn-primary btn-sm" href="/register">Start Free</a>
    </div>
  </div>
</header>

<!-- 1. HERO -->
<section class="hero">
  <div class="wrap">
    <div class="eyebrow on-navy">AI Finance Operating System</div>
    <h1 style="margin-top:14px">Your business.<br><span>Understood.</span></h1>
    <p class="lead">Finloraq turns your financial data into clarity, predictions and controlled actions — built on real double-entry accounting, not a dashboard bolted on top of one.</p>
    <div class="cta-row">
      <a class="btn btn-primary" href="/register">Start Free</a>
      <a class="btn btn-ghost on-navy" href="#demo">Explore the Demo</a>
    </div>
    <div class="trust-line">
      <span>Accounting foundation</span><span class="sep"></span><span>AI intelligence</span><span class="sep"></span><span>Human-controlled automation</span>
    </div>
  </div>
</section>

<!-- 2. LIVE PRODUCT PREVIEW / TRY THE DEMO -->
<section class="canvas" id="demo" style="background:var(--canvas-2);border-bottom:1px solid var(--line)">
  <div class="wrap">
    <div class="sec-head">
      <div class="eyebrow">Try it now — no registration</div>
      <h2 style="margin-top:12px">A real Business Pulse dashboard, not a screenshot.</h2>
      <p>Click through Demo Company's books the way you would your own — revenue, expenses, cash, customers, invoices and the AI Copilot all respond live.</p>
    </div>
    <span class="demo-badge">Demo data — Demo Company</span>
    <div class="pulse-demo">
      <div class="demo-nav">
        <div class="demo-tag">DEMO COMPANY</div>
        <button class="active" data-pulse-nav="dashboard">Dashboard</button>
        <button data-pulse-nav="revenue">Revenue</button>
        <button data-pulse-nav="expenses">Expenses</button>
        <button data-pulse-nav="cash">Cash</button>
        <button data-pulse-nav="customers">Customers</button>
        <button data-pulse-nav="invoices">Invoices</button>
        <button data-pulse-nav="ai">AI Copilot</button>
        <button data-pulse-nav="whatif">What-If</button>
      </div>
      <div class="demo-body">

        <div class="demo-panel" data-panel="dashboard">
          <div class="demo-grid">
            <div class="stile"><div class="lbl">Cash</div><div class="val num">$128,450</div><div class="delta up" style="color:var(--success)">↑ 2.0%</div></div>
            <div class="stile"><div class="lbl">Profit margin</div><div class="val num">18.6%</div><div class="delta up" style="color:var(--success)">↑ 1.1pt</div></div>
            <div class="stile"><div class="lbl">Payables</div><div class="val num">$96,300</div><div class="delta" style="color:var(--ink-muted)">— flat</div></div>
            <div class="stile"><div class="lbl">Tax readiness</div><div class="val" style="font-size:17px">Ready</div><div class="delta up" style="color:var(--success)">VAT filed</div></div>
          </div>
          <div style="margin-top:26px" class="panel-title">What should I do today?</div>
          <div class="todo-list">
            <div class="todo-item"><span class="n">1</span><span class="t">Review <b>$18,400</b> overdue from Customer ABC</span><button class="btn btn-ghost btn-sm" data-pulse-nav="invoices">Review</button></div>
            <div class="todo-item"><span class="n">2</span><span class="t">Investigate a <b>23%</b> supplier cost increase</span><button class="btn btn-ghost btn-sm" data-pulse-nav="expenses">Investigate</button></div>
            <div class="todo-item"><span class="n">3</span><span class="t">Reconcile <b>7</b> unmatched bank transactions</span><button class="btn btn-ghost btn-sm" data-pulse-nav="cash">Reconcile</button></div>
            <div class="todo-item"><span class="n">4</span><span class="t">Review a projected cash gap in <b>21 days</b></span><button class="btn btn-ghost btn-sm" data-pulse-nav="cash">View</button></div>
          </div>
        </div>

        <div class="demo-panel" data-panel="revenue" hidden>
          <div class="panel-title">Revenue by customer, this month</div>
          <table class="demo-table">
            <thead><tr><th>Customer</th><th>Invoices</th><th style="text-align:right">Amount</th></tr></thead>
            <tbody>
              <tr><td>Northwind Retail</td><td>6</td><td class="num" style="text-align:right">$62,400</td></tr>
              <tr><td>Customer ABC</td><td>4</td><td class="num" style="text-align:right">$48,900</td></tr>
              <tr><td>Al Fahim Trading</td><td>9</td><td class="num" style="text-align:right">$41,150</td></tr>
              <tr><td>Customer B</td><td>3</td><td class="num" style="text-align:right">$22,300 <span class="tag warn" style="margin-left:6px">DELAYED</span></td></tr>
            </tbody>
          </table>
          <p class="mini-note">Total revenue $284,620, up 12.4% on last month. Customer B's order shipped 5 days late, which is why their invoice landed after month-end close.</p>
        </div>

        <div class="demo-panel" data-panel="expenses" hidden>
          <div class="panel-title">Expenses by category</div>
          <div class="bar-row"><span class="bl">Payroll</span><div class="bar-track"><div class="bar-fill" style="width:62%"></div></div><span class="bv num">$98,300</span></div>
          <div class="bar-row"><span class="bl">Supplier costs</span><div class="bar-track"><div class="bar-fill" style="width:34%;background:var(--warning)"></div></div><span class="bv num">$41,200</span></div>
          <div class="bar-row"><span class="bl">Rent &amp; utilities</span><div class="bar-track"><div class="bar-fill" style="width:14%"></div></div><span class="bv num">$14,600</span></div>
          <div class="bar-row"><span class="bl">Software</span><div class="bar-track"><div class="bar-fill" style="width:6%"></div></div><span class="bv num">$8,310</span></div>
          <p class="mini-note"><b>Anomaly:</b> your main packaging supplier's pricing increased 23% this cycle — that's the orange bar moving faster than the rest.</p>
        </div>

        <div class="demo-panel" data-panel="cash" hidden>
          <div class="demo-grid" style="grid-template-columns:repeat(3,1fr)">
            <div class="stile"><div class="lbl">Cash today</div><div class="val num">$128,450</div></div>
            <div class="stile"><div class="lbl">In 21 days (projected)</div><div class="val num" style="color:var(--danger)">$37,200</div></div>
            <div class="stile"><div class="lbl">Unmatched transactions</div><div class="val num">7</div></div>
          </div>
          <div class="icard" style="margin-top:18px">
            <span class="tag warn" style="width:fit-content">CASH GAP</span>
            <div class="headline">Potential cash pressure in 21 days</div>
            <div class="why"><b>$42K</b> supplier payments due + <b>$31K</b> expected payroll + <b>$18K</b> delayed receivables from Customer B</div>
            <div class="actions"><button class="btn btn-ghost btn-sm" data-pulse-nav="whatif">Model this in What-If</button></div>
          </div>
        </div>

        <div class="demo-panel" data-panel="customers" hidden>
          <div class="panel-title">Customers</div>
          <table class="demo-table">
            <thead><tr><th>Customer</th><th>Balance</th><th>Status</th></tr></thead>
            <tbody>
              <tr><td>Northwind Retail</td><td class="num">$0.00</td><td><span class="status-pill paid">Current</span></td></tr>
              <tr><td>Customer ABC</td><td class="num">$18,400.00</td><td><span class="status-pill overdue">Overdue 12d</span></td></tr>
              <tr><td>Al Fahim Trading</td><td class="num">$6,200.00</td><td><span class="status-pill draft">Due in 9d</span></td></tr>
              <tr><td>Customer B</td><td class="num">$22,300.00</td><td><span class="status-pill draft">Awaiting invoice</span></td></tr>
            </tbody>
          </table>
        </div>

        <div class="demo-panel" data-panel="invoices" hidden>
          <div class="panel-title">Invoices</div>
          <table class="demo-table">
            <thead><tr><th>No.</th><th>Customer</th><th>Due</th><th style="text-align:right">Amount</th><th>Status</th></tr></thead>
            <tbody>
              <tr><td class="num">INV-1042</td><td>Customer ABC</td><td>12 days ago</td><td class="num" style="text-align:right">$18,400</td><td><span class="status-pill overdue">Overdue</span></td></tr>
              <tr><td class="num">INV-1041</td><td>Al Fahim Trading</td><td>in 9 days</td><td class="num" style="text-align:right">$6,200</td><td><span class="status-pill draft">Sent</span></td></tr>
              <tr><td class="num">INV-1040</td><td>Northwind Retail</td><td>Paid</td><td class="num" style="text-align:right">$14,900</td><td><span class="status-pill paid">Paid</span></td></tr>
              <tr><td class="num">INV-1039</td><td>Northwind Retail</td><td>Paid</td><td class="num" style="text-align:right">$9,600</td><td><span class="status-pill paid">Paid</span></td></tr>
            </tbody>
          </table>
        </div>

        <div class="demo-panel" data-panel="ai" hidden>
          <div class="panel-title">Ask the AI Copilot</div>
          <div class="chip-row">
            <button class="chip" data-q="overdue">Show overdue invoices</button>
            <button class="chip" data-q="pl">Open this month's P&amp;L</button>
            <button class="chip" data-q="anomaly">Find unusual supplier expenses</button>
            <button class="chip" data-q="scenario">Start a cash-flow scenario</button>
          </div>
          <div class="chat-log" id="chat-log">
            <div class="chat-msg ai">Ask me about Demo Company's books — try one of the questions above.</div>
          </div>
        </div>

        <div class="demo-panel" data-panel="whatif" hidden>
          <div class="panel-title">What-If, right from the dashboard</div>
          <p class="mini-note" style="margin-top:0">Model a scenario against these same numbers — a slower sales month, a longer payment cycle — before it happens. Nothing here changes an actual record.</p>
          <button class="btn btn-primary btn-sm" style="margin-top:14px" data-scroll="whatif-full">Open the full simulator ↓</button>
        </div>

      </div>
    </div>
  </div>
</section>

<!-- 3. THE FINLORAQ DIFFERENCE -->
<section class="canvas" id="difference">
  <div class="wrap">
    <div class="sec-head" style="margin-bottom:0">
      <div class="eyebrow">From accounting to business intelligence</div>
      <h2 style="margin-top:12px">The Finloraq difference</h2>
      <p>Most software stops at recording a transaction. Finloraq carries it all the way to a decision.</p>
    </div>
    <div class="loop-track">
      <div class="loop-step is-active"><div class="n">01</div><h4>Record</h4><p>Your financial data — invoices, bills, banking, payroll — captured with full double-entry accuracy.</p></div>
      <div class="loop-step"><div class="n">02</div><h4>Understand</h4><p>What happened this week, this month, this quarter — surfaced without digging through reports.</p></div>
      <div class="loop-step"><div class="n">03</div><h4>Predict</h4><p>What could happen next — cash pressure, overdue risk, margin drift, before it lands.</p></div>
      <div class="loop-step"><div class="n">04</div><h4>Act</h4><p>What you should do about it — a reviewed, approved, recorded action.</p></div>
    </div>
  </div>
</section>

<!-- 4. BUSINESS PULSE -->
<section class="canvas" id="pulse" style="background:var(--canvas-2);border-top:1px solid var(--line);border-bottom:1px solid var(--line)">
  <div class="wrap">
    <div class="sec-head">
      <div class="eyebrow">Business Pulse</div>
      <h2 style="margin-top:12px">See your business clearly.</h2>
      <p>Real examples of what Business Pulse surfaces — not generic charts, but specific, actionable signals.</p>
    </div>
    <div class="icard-grid">
      <div class="icard">
        <span class="tag warn" style="width:fit-content">CASH GAP</span>
        <div class="headline">Potential cash pressure in 21 days</div>
        <div class="why"><b>$42K</b> supplier payments + <b>$31K</b> expected payroll + <b>$18K</b> delayed receivables</div>
        <div class="actions"><button class="btn btn-ghost btn-sm">View Forecast</button><button class="btn btn-ghost btn-sm">What If?</button></div>
      </div>
      <div class="icard">
        <span class="tag danger" style="width:fit-content">OVERDUE</span>
        <div class="headline">$18,400 overdue — Customer ABC</div>
        <div class="why">12 days past due, largest open balance this month.</div>
        <div class="actions"><button class="btn btn-ghost btn-sm">Review</button><button class="btn btn-ghost btn-sm">Remind</button></div>
      </div>
      <div class="icard">
        <span class="tag info" style="width:fit-content">ANOMALY</span>
        <div class="headline">Supplier pricing increased 23%</div>
        <div class="why">Packaging supplier cost jumped against a flat order volume.</div>
        <div class="actions"><button class="btn btn-ghost btn-sm">Investigate</button></div>
      </div>
      <div class="icard">
        <span class="tag warn" style="width:fit-content">DUPLICATE CAUGHT</span>
        <div class="headline">Bill #4821 matches a bill already paid</div>
        <div class="why">Same supplier, same amount, 2 days apart — held for review before posting.</div>
        <div class="actions"><button class="btn btn-ghost btn-sm">Review Bill</button></div>
      </div>
      <div class="icard">
        <span class="tag info" style="width:fit-content">TAX</span>
        <div class="headline">VAT return ready for review</div>
        <div class="why">Q3 UAE VAT return calculated and reconciled against posted transactions.</div>
        <div class="actions"><button class="btn btn-ghost btn-sm">Review Return</button></div>
      </div>
      <div class="icard">
        <span class="tag warn" style="width:fit-content">RECONCILE</span>
        <div class="headline">7 bank transactions unmatched</div>
        <div class="why">Sitting in the bank feed for over 5 days without a matching ledger entry.</div>
        <div class="actions"><button class="btn btn-ghost btn-sm">Reconcile</button></div>
      </div>
    </div>
  </div>
</section>

<!-- 5. AI FINANCE TEAM -->
<section class="on-navy" id="agents">
  <div class="wrap">
    <div class="sec-head">
      <div class="eyebrow on-navy">Your finance team, always watching</div>
      <h2 style="margin-top:12px;color:#fff">Six agents. One team.</h2>
      <p>AI recommends. You approve. Finloraq records. Nothing posts to your books without a human decision.</p>
    </div>
    <div class="agent-grid">
      <div class="agent-card"><div class="glyph">AP</div><h4>AP Agent</h4><p>Bills, duplicates, approvals and supplier costs.</p></div>
      <div class="agent-card"><div class="glyph">AR</div><h4>AR Agent</h4><p>Receivables, overdue invoices and collections.</p></div>
      <div class="agent-card"><div class="glyph">CA</div><h4>Cash Agent</h4><p>Cash flow, forecasts and upcoming pressure.</p></div>
      <div class="agent-card"><div class="glyph">CL</div><h4>Close Agent</h4><p>Month-end close and reconciliation.</p></div>
      <div class="agent-card"><div class="glyph">TX</div><h4>Tax Agent</h4><p>Tax readiness and transaction review.</p></div>
      <div class="agent-card"><div class="glyph">CFO</div><h4>CFO Agent</h4><p>Business-level financial intelligence.</p></div>
    </div>
    <div class="control-strip"><b>AI recommends.</b> You approve. <b>Finloraq records.</b> Every agent action runs through your approval workflow — nothing is autonomous by default.</div>
  </div>
</section>

<!-- 6. WHAT-IF SIMULATOR -->
<section class="canvas" id="whatif-full">
  <div class="wrap">
    <div class="sec-head">
      <div class="eyebrow">What-if simulator</div>
      <h2 style="margin-top:12px">Before you make a decision, see the financial impact.</h2>
      <p>Model a scenario against your real numbers — a slower sales month, a longer payment cycle, new hires — before it happens.</p>
    </div>
    <div class="whatif">
      <div class="whatif-controls">
        <div class="slider-row">
          <div class="top"><span>Sales</span><span class="v" id="wf-sales-v">-20%</span></div>
          <input type="range" id="wf-sales" min="-50" max="20" value="-20">
        </div>
        <div class="slider-row">
          <div class="top"><span>Customer payment time</span><span class="v" id="wf-days-v">+15 days</span></div>
          <input type="range" id="wf-days" min="0" max="45" value="15">
        </div>
        <div class="slider-row">
          <div class="top"><span>Hiring</span><span class="v" id="wf-hire-v">+5 employees</span></div>
          <input type="range" id="wf-hire" min="0" max="15" value="5">
        </div>
        <div class="slider-row">
          <div class="top"><span>Supplier costs</span><span class="v" id="wf-cost-v">+10%</span></div>
          <input type="range" id="wf-cost" min="0" max="40" value="10">
        </div>
        <button class="btn btn-primary btn-block">Try a Scenario</button>
      </div>
      <div class="whatif-result">
        <div class="wr-row"><span>Cash impact</span><span class="wv num" id="wf-cash" style="color:var(--danger)">↓ $42K</span></div>
        <div class="wr-row"><span>Profit impact</span><span class="wv num" id="wf-profit" style="color:var(--danger)">↓ $18K</span></div>
        <div class="wr-row"><span>Runway change</span><span class="wv num" id="wf-runway" style="color:var(--danger)">-1.7 months</span></div>
        <div class="sim-note">SIMULATION — DOES NOT CHANGE YOUR ACCOUNTING RECORDS</div>
      </div>
    </div>
  </div>
</section>

<!-- 7. ACCOUNTING FOUNDATION -->
<section class="on-navy" id="foundation">
  <div class="wrap">
    <div class="sec-head">
      <div class="eyebrow on-navy">Accounting foundation</div>
      <h2 style="margin-top:12px;color:#fff">Powerful intelligence. Built on real accounting.</h2>
      <p>Every insight starts with a trusted financial foundation — not a forecast layered over guesswork.</p>
    </div>
    <div class="found-grid">
      <div class="found-item">Double-entry accounting</div>
      <div class="found-item">General ledger</div>
      <div class="found-item">P&amp;L &amp; balance sheet</div>
      <div class="found-item">Cash flow</div>
      <div class="found-item">AR / AP</div>
      <div class="found-item">Banking</div>
      <div class="found-item">Tax</div>
      <div class="found-item">Audit trail</div>
      <div class="found-item">Multi-company</div>
      <div class="found-item">Multi-currency</div>
    </div>
  </div>
</section>

<!-- 8. DOCUMENT -> ACTION -->
<section class="canvas" id="document" style="background:var(--canvas-2);border-top:1px solid var(--line);border-bottom:1px solid var(--line)">
  <div class="wrap">
    <div class="sec-head">
      <div class="eyebrow">Document intelligence</div>
      <h2 style="margin-top:12px">Document → action</h2>
      <p>Upload a supplier invoice and Finloraq carries it the rest of the way — reading, matching and drafting, with your approval at the end.</p>
    </div>
    <div class="flow">
      <div class="flow-step">Upload invoice</div><div class="flow-arrow">→</div>
      <div class="flow-step">AI reads it</div><div class="flow-arrow">→</div>
      <div class="flow-step">Extracts supplier, amount, tax</div><div class="flow-arrow">→</div>
      <div class="flow-step">Checks duplicate</div><div class="flow-arrow">→</div>
      <div class="flow-step">Matches purchase order</div>
    </div>
    <div class="flow" style="margin-top:12px">
      <div class="flow-step">Creates draft bill</div><div class="flow-arrow">→</div>
      <div class="flow-step">Requests approval</div><div class="flow-arrow">→</div>
      <div class="flow-step">Posts to accounting</div><div class="flow-arrow">→</div>
      <div class="flow-step">Updates cash forecast</div>
    </div>
  </div>
</section>

<!-- 9. FINANCIAL HEALTH -->
<section class="canvas" id="health">
  <div class="wrap">
    <div class="sec-head">
      <div class="eyebrow">Financial health</div>
      <h2 style="margin-top:12px">Know the health of your business.</h2>
      <p>Not a mysterious score — every rating traces back to the transactions behind it.</p>
    </div>
    <div class="health-grid">
      <div class="health-item"><span class="lbl">Cash</span><span class="status-badge good">Healthy</span></div>
      <div class="health-item"><span class="lbl">Profitability</span><span class="status-badge good">Strong</span></div>
      <div class="health-item"><span class="lbl">Receivables</span><span class="status-badge watch">Watch</span></div>
      <div class="health-item"><span class="lbl">Expenses</span><span class="status-badge stable">Stable</span></div>
      <div class="health-item"><span class="lbl">Tax readiness</span><span class="status-badge good">Ready</span></div>
      <div class="health-item"><span class="lbl">Reconciliation</span><span class="status-badge watch">3 items</span></div>
    </div>
    <div class="why-box" style="margin-top:20px">
      <div class="why-top"><div style="font-weight:700;font-size:14px">Why did Receivables move to "Watch"?</div></div>
      <div class="why-panel">
        <div class="why-row"><span>Invoices overdue &gt; 30 days</span><span class="amt num">4</span></div>
        <div class="why-row"><span>Largest overdue balance</span><span class="amt num">$18,400 — Customer ABC</span></div>
        <div class="why-row"><span>Average days to pay, last 90 days</span><span class="amt num" style="color:var(--ink)">34 days</span></div>
      </div>
    </div>
  </div>
</section>

<!-- 10. SECURITY & TRUST -->
<section class="on-navy" id="trust">
  <div class="wrap">
    <div class="sec-head">
      <div class="eyebrow on-navy">Security &amp; trust</div>
      <h2 style="margin-top:12px;color:#fff">Your finances deserve trust.</h2>
    </div>
    <div class="trust-grid">
      <div class="trust-item"><div class="ic">●</div><div><h5>Secure authentication &amp; MFA</h5><p>Every sign-in is protected, with optional two-factor authentication per account.</p></div></div>
      <div class="trust-item"><div class="ic">●</div><div><h5>Role-based permissions</h5><p>Every user sees and does exactly what their role allows.</p></div></div>
      <div class="trust-item"><div class="ic">●</div><div><h5>Tenant isolation</h5><p>Each company's data is fully separated at the database level.</p></div></div>
      <div class="trust-item"><div class="ic">●</div><div><h5>Full audit trails</h5><p>Every record change is logged — who, what and when.</p></div></div>
      <div class="trust-item"><div class="ic">●</div><div><h5>Approval workflows</h5><p>AI-recommended actions post only after a human approves them.</p></div></div>
      <div class="trust-item"><div class="ic">●</div><div><h5>Immutable posted transactions</h5><p>A posted, reconciled record can be reversed, never silently edited.</p></div></div>
    </div>
  </div>
</section>

<!-- 11. WHO IT'S FOR -->
<section class="canvas" id="audience">
  <div class="wrap">
    <div class="sec-head">
      <div class="eyebrow">Who is Finloraq for?</div>
      <h2 style="margin-top:12px">Built for the people who run the numbers.</h2>
    </div>
    <div class="aud-grid">
      <div class="aud-card"><div class="eyebrow">Business owners</div><h4 style="font-size:16px;margin-top:2px">Understand your business</h4><p style="font-size:13.5px;color:var(--ink-muted);margin-top:8px">Without becoming an accounting expert.</p></div>
      <div class="aud-card"><div class="eyebrow">Finance teams</div><h4 style="font-size:16px;margin-top:2px">Automate the repetitive work</h4><p style="font-size:13.5px;color:var(--ink-muted);margin-top:8px">Free up time for judgment calls, not data entry.</p></div>
      <div class="aud-card"><div class="eyebrow">Accountants</div><h4 style="font-size:16px;margin-top:2px">Close faster</h4><p style="font-size:13.5px;color:var(--ink-muted);margin-top:8px">With better visibility into every client company.</p></div>
      <div class="aud-card"><div class="eyebrow">Growing companies</div><h4 style="font-size:16px;margin-top:2px">Scale finance</h4><p style="font-size:13.5px;color:var(--ink-muted);margin-top:8px">Without unnecessary complexity along the way.</p></div>
    </div>
  </div>
</section>

<!-- 12. PRICING -->
<section class="canvas" style="background:var(--canvas-2);border-top:1px solid var(--line);border-bottom:1px solid var(--line)" id="pricing">
  <div class="wrap">
    <div class="sec-head">
      <div class="eyebrow">Pricing</div>
      <h2 style="margin-top:12px">Simple plans that grow with you.</h2>
      <p>Final pricing may vary by region and company size — this is a starting guide.</p>
    </div>
    <div class="price-toggle">
      <button class="active" data-billing="monthly">Monthly</button>
      <button data-billing="annual">Annual — save ~15%</button>
    </div>
    <div class="price-grid">
      <div class="plan">
        <div class="pname">Starter</div>
        <div class="pprice num" data-m="29" data-a="25">$29<small>/mo</small></div>
        <ul>
          <li>✓ Core accounting</li><li>✓ 1 company</li><li>✓ Invoicing &amp; bills</li>
        </ul>
        <a class="btn btn-ghost btn-block" href="/register">Start Free</a>
      </div>
      <div class="plan">
        <div class="pname">Growth</div>
        <div class="pprice num" data-m="79" data-a="67">$79<small>/mo</small></div>
        <ul>
          <li>✓ Everything in Starter</li><li>✓ Business Pulse</li><li>✓ Bank feeds &amp; reconciliation</li>
        </ul>
        <a class="btn btn-ghost btn-block" href="/register">Start Free</a>
      </div>
      <div class="plan feat">
        <div class="pname">Professional</div>
        <div class="pprice num" data-m="149" data-a="127">$149<small>/mo</small></div>
        <ul>
          <li>✓ Everything in Growth</li><li>✓ AI Finance Agents</li><li>✓ What-If Simulator</li>
        </ul>
        <a class="btn btn-primary btn-block" href="/register">Start Free</a>
      </div>
      <div class="plan">
        <div class="pname">AI CFO</div>
        <div class="pprice num" data-m="299" data-a="254">$299<small>/mo</small></div>
        <ul>
          <li>✓ Everything in Professional</li><li>✓ CFO Agent</li><li>✓ Multi-company consolidation</li>
        </ul>
        <a class="btn btn-ghost btn-block" href="/register">Start Free</a>
      </div>
      <div class="plan">
        <div class="pname">Enterprise</div>
        <div class="pprice">Talk to us</div>
        <ul>
          <li>✓ Custom limits</li><li>✓ Dedicated support</li><li>✓ Advanced security review</li>
        </ul>
        <a class="btn btn-ghost btn-block" href="mailto:hello@finloraq.com">Contact Sales</a>
      </div>
    </div>
  </div>
</section>

<!-- 13. FAQ -->
<section class="canvas" id="faq">
  <div class="wrap">
    <div class="sec-head" style="margin-bottom:8px"><div class="eyebrow">FAQ</div><h2 style="margin-top:12px">Questions, answered plainly.</h2></div>
    <div class="faq">
      <details class="faq-item" open><summary class="faq-q">What is Finloraq?<svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg></summary><div class="faq-a">An AI Finance Operating System — real double-entry accounting plus AI that explains what happened, why, and what to do next.</div></details>
      <details class="faq-item"><summary class="faq-q">Is Finloraq accounting software?<svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg></summary><div class="faq-a">Yes, at its core — general ledger, P&amp;L, balance sheet, AR/AP and tax are all built in. The AI layer sits on top of that foundation, not instead of it.</div></details>
      <details class="faq-item"><summary class="faq-q">How does the AI work?<svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg></summary><div class="faq-a">Six specialized agents (AP, AR, Cash, Close, Tax, CFO) monitor your books and recommend actions. They draft and flag — they don't post anything without your approval.</div></details>
      <details class="faq-item"><summary class="faq-q">Can AI change my accounting records?<svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg></summary><div class="faq-a">No. AI recommends and drafts; a person approves before anything posts. Posted, reconciled records stay immutable.</div></details>
      <details class="faq-item"><summary class="faq-q">What is Business Pulse?<svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg></summary><div class="faq-a">A single view of the financial signals that matter most — cash, revenue, receivables, anomalies and a daily action list.</div></details>
      <details class="faq-item"><summary class="faq-q">What is the What-If Simulator?<svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg></summary><div class="faq-a">A modeling tool that shows the projected cash, profit and runway impact of a scenario — without changing any actual accounting record.</div></details>
      <details class="faq-item"><summary class="faq-q">Who is Finloraq for?<svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg></summary><div class="faq-a">Business owners, finance teams, accountants and growing companies who want clarity without hiring a full finance department.</div></details>
      <details class="faq-item"><summary class="faq-q">Can Finloraq support multiple companies?<svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg></summary><div class="faq-a">Yes — one login can belong to multiple companies, useful for accountants and multi-entity businesses.</div></details>
      <details class="faq-item"><summary class="faq-q">Can Finloraq support multiple currencies?<svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg></summary><div class="faq-a">Yes, multi-currency is part of the core accounting foundation.</div></details>
      <details class="faq-item"><summary class="faq-q">Is my data secure?<svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg></summary><div class="faq-a">Data is encrypted, tenant-isolated per company, and every change is captured in an audit trail. We only publish compliance certifications once they're actually verified.</div></details>
      <details class="faq-item"><summary class="faq-q">Does Finloraq support UAE VAT?<svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg></summary><div class="faq-a">Yes — the UAE VAT pack, including tax codes and readiness checks, is available today.</div></details>
      <details class="faq-item"><summary class="faq-q">What countries will be supported?<svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg></summary><div class="faq-a">The UAE is live today. Multi-currency and multi-company work with any market; additional country-specific tax packs are on the roadmap.</div></details>
    </div>
  </div>
</section>

<!-- 14. FINAL CTA -->
<section class="final-cta">
  <div class="wrap">
    <h2>Your business is moving.<br>Your finance platform should keep up.</h2>
    <p>Start with accounting. Grow into intelligence.</p>
    <div class="cta-row">
      <a class="btn btn-primary" href="/register">Start Free</a>
      <a class="btn btn-ghost on-navy" href="#demo">Explore Demo</a>
    </div>
  </div>
</section>

<footer>
  <div class="wrap foot-grid">
    <div>
      <div class="brand-mark" style="color:#fff"><span class="dot"></span>FINLORAQ</div>
      <p style="margin-top:14px;font-size:13px;max-width:32ch;line-height:1.6">AI Finance Operating System — accounting foundation, AI intelligence, human-controlled automation.</p>
    </div>
    <div><h6>Product</h6><ul><li><a href="#foundation">Accounting</a></li><li><a href="#pulse">Business Pulse</a></li><li><a href="#agents">AI Finance</a></li><li><a href="#agents">Finance Agents</a></li><li><a href="#whatif-full">What-If</a></li><li><a href="#demo">Forecasting</a></li></ul></div>
    <div><h6>Solutions</h6><ul><li><a href="#audience">Business Owners</a></li><li><a href="#audience">Finance Teams</a></li><li><a href="#audience">Accountants</a></li><li><a href="#audience">Growing Companies</a></li></ul></div>
    <div><h6>Resources</h6><ul><li><a href="#">Documentation</a></li><li><a href="#">Help Center</a></li><li><a href="#">Blog</a></li><li><a href="#">Guides</a></li><li><a href="#">API</a></li></ul></div>
    <div><h6>Company</h6><ul><li><a href="#">About</a></li><li><a href="#">Contact</a></li><li><a href="#">Security</a></li><li><a href="#">Privacy</a></li><li><a href="#">Terms</a></li></ul></div>
  </div>
  <div class="wrap foot-bottom"><span>© Finloraq</span><span>Demo content shown throughout is illustrative and does not represent a real customer.</span></div>
</footer>`;

export function MarketingHomePage() {
  useEffect(() => {
    const root = document.getElementById("fm-root");
    if (!root) return;

    try {
  try{
    // Live Product Preview demo: real tab switching with distinct panels
    var navBtns = document.querySelectorAll('[data-pulse-nav]');
    var panels = document.querySelectorAll('.demo-panel');
    function showPanel(key){
      navBtns.forEach(function(b){ b.classList.toggle('active', b.getAttribute('data-pulse-nav') === key); });
      panels.forEach(function(p){ p.hidden = p.getAttribute('data-panel') !== key; });
    }
    navBtns.forEach(function(btn){
      btn.addEventListener('click', function(){ showPanel(btn.getAttribute('data-pulse-nav')); });
    });

    // AI Copilot canned answers
    var answers = {
      overdue: "1 invoice is overdue: <b>Customer ABC — $18,400, 12 days late.</b> Want me to draft a reminder?",
      pl: "This month's P&amp;L: Revenue <b>$284,620</b>, Expenses <b>$162,410</b>, Net profit <b>$122,210</b> (18.6% margin).",
      anomaly: "Your packaging supplier's cost rose <b>23%</b> against flat order volume this cycle — that's the main driver in Expenses.",
      scenario: "Opening a cash-flow scenario with your current sliders: -20% sales, +15 days payment time. See the What-If tab for live results."
    };
    var chatLog = document.getElementById('chat-log');
    document.querySelectorAll('.chip[data-q]').forEach(function(chip){
      chip.addEventListener('click', function(){
        var q = chip.getAttribute('data-q');
        var userMsg = document.createElement('div');
        userMsg.className = 'chat-msg user';
        userMsg.textContent = chip.textContent;
        var aiMsg = document.createElement('div');
        aiMsg.className = 'chat-msg ai';
        aiMsg.innerHTML = answers[q] || "Here's what I found in Demo Company's books.";
        chatLog.appendChild(userMsg);
        chatLog.appendChild(aiMsg);
        chatLog.scrollTop = chatLog.scrollHeight;
      });
    });

    // In-demo "open full simulator" scroll
    document.querySelectorAll('[data-scroll]').forEach(function(btn){
      btn.addEventListener('click', function(){
        var target = document.getElementById(btn.getAttribute('data-scroll'));
        if(target) target.scrollIntoView({behavior:'smooth', block:'start'});
      });
    });

    // What-if simulator (full section)
    var sales = document.getElementById('wf-sales');
    var days = document.getElementById('wf-days');
    var hire = document.getElementById('wf-hire');
    var cost = document.getElementById('wf-cost');
    function fmtK(n){ var sign = n<0 ? '↓' : (n>0 ? '↑' : '—'); return sign + ' $' + Math.abs(Math.round(n)) + 'K'; }
    function recompute(){
      var s = parseInt(sales.value,10), d = parseInt(days.value,10), h = parseInt(hire.value,10), c = parseInt(cost.value,10);
      document.getElementById('wf-sales-v').textContent = (s>0?'+':'') + s + '%';
      document.getElementById('wf-days-v').textContent = '+' + d + ' days';
      document.getElementById('wf-hire-v').textContent = '+' + h + ' employees';
      document.getElementById('wf-cost-v').textContent = '+' + c + '%';

      var cashImpact = (s * -0.9) + (d * -0.8) + (h * -2.2) + (c * -0.6);
      var profitImpact = (s * -0.55) + (h * -1.1) + (c * -0.5);
      var runway = (cashImpact / 24);

      var cashEl = document.getElementById('wf-cash');
      var profitEl = document.getElementById('wf-profit');
      var runwayEl = document.getElementById('wf-runway');
      cashEl.textContent = fmtK(cashImpact);
      cashEl.style.color = cashImpact < 0 ? 'var(--danger)' : 'var(--success)';
      profitEl.textContent = fmtK(profitImpact);
      profitEl.style.color = profitImpact < 0 ? 'var(--danger)' : 'var(--success)';
      var rTxt = (runway<=0?'':'+') + runway.toFixed(1) + ' months';
      runwayEl.textContent = rTxt;
      runwayEl.style.color = runway < 0 ? 'var(--danger)' : 'var(--success)';
    }
    [sales,days,hire,cost].forEach(function(el){ el.addEventListener('input', recompute); });
    recompute();

    // Pricing toggle
    var billingBtns = document.querySelectorAll('[data-billing]');
    billingBtns.forEach(function(btn){
      btn.addEventListener('click', function(){
        billingBtns.forEach(function(b){ b.classList.remove('active'); });
        btn.classList.add('active');
        var mode = btn.getAttribute('data-billing');
        document.querySelectorAll('.pprice[data-m]').forEach(function(p){
          var val = mode === 'annual' ? p.getAttribute('data-a') : p.getAttribute('data-m');
          p.innerHTML = '$' + val + '<small>/mo</small>';
        });
      });
    });
  }catch(e){ /* progressive enhancement only — page reads fine without JS */ }
    } catch (e) {
      // progressive enhancement only — the page reads fine without JS
    }
  }, []);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: STYLE }} />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Libre+Franklin:wght@600;700;800&family=Public+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600;700&display=swap"
      />
      <div id="fm-root" dangerouslySetInnerHTML={{ __html: BODY_HTML }} />
    </>
  );
}
