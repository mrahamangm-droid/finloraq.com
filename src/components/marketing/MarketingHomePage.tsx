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
import { PLANS } from "@/lib/billing/plans";
import { CURRENCY_COOKIE, DISPLAY_CURRENCIES, formatMoney, isBillingCurrency, roundApprox } from "@/lib/billing/currency";

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
    --font-display:'Libre Franklin',ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    --font-body:'Public Sans',ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    --font-mono:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;
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
  #fm-root header.nav{position:sticky;top:env(safe-area-inset-top,0px);z-index:40;background:var(--bg);background:color-mix(in srgb, var(--bg) 88%, transparent);-webkit-backdrop-filter:saturate(140%) blur(10px);backdrop-filter:saturate(140%) blur(10px);border-bottom:1px solid var(--line)}
  #fm-root .nav-row{display:flex;align-items:center;gap:32px;height:68px}
  #fm-root .brand-mark{display:flex;align-items:center;gap:9px;font-family:var(--font-display);font-weight:800;font-size:19px;letter-spacing:-.01em;flex:0 0 auto}
  #fm-root .brand-mark .dot{width:9px;height:9px;border-radius:50%;background:var(--brand)}
  #fm-root nav.links{display:flex;gap:28px;font-size:14px;font-weight:600;color:var(--ink-muted)}
  #fm-root nav.links a:hover{color:var(--ink)}
  #fm-root .nav-right{margin-left:auto;display:flex;align-items:center;gap:10px}
  @media (max-width:960px){ #fm-root nav.links{display:none} }
  /* 961–1100px (small laptops, landscape tablets): tighter spacing so the six links + two buttons never overflow */
  @media (min-width:961px) and (max-width:1100px){ #fm-root nav.links{gap:18px} #fm-root .nav-row{gap:20px} }

  /* ---------- Mobile menu (≤ 960px, where nav.links is hidden) ---------- */
  #fm-root [id]{scroll-margin-top:84px}
  #fm-root details.mnav{display:none;position:relative}
  #fm-root details.mnav > summary{list-style:none;display:flex;flex-direction:column;justify-content:center;gap:5px;width:44px;height:44px;padding:0 11px;border:1px solid var(--line-strong);border-radius:var(--r-md);cursor:pointer;color:var(--ink)}
  #fm-root details.mnav > summary::-webkit-details-marker{display:none}
  #fm-root details.mnav > summary span{display:block;height:2px;border-radius:2px;background:currentColor;transition:transform .18s ease, opacity .18s ease}
  #fm-root details.mnav[open] > summary span:nth-child(1){transform:translateY(7px) rotate(45deg)}
  #fm-root details.mnav[open] > summary span:nth-child(2){opacity:0}
  #fm-root details.mnav[open] > summary span:nth-child(3){transform:translateY(-7px) rotate(-45deg)}
  #fm-root details.mnav > summary:focus-visible{outline:2px solid var(--brand);outline-offset:2px}
  #fm-root .mnav-panel{position:fixed;left:0;right:0;top:calc(68px + env(safe-area-inset-top,0px));max-height:calc(100vh - 68px);max-height:calc(100dvh - 68px);overflow-y:auto;background:var(--bg);border-bottom:1px solid var(--line);box-shadow:0 18px 40px rgba(0,0,0,.18);padding:8px 16px 20px;display:flex;flex-direction:column}
  #fm-root .mnav-panel a{display:block;padding:14px 4px;font-size:16px;font-weight:600;color:var(--ink);border-bottom:1px solid var(--line)}
  #fm-root .mnav-panel a[aria-current="page"]{color:var(--brand)}
  #fm-root .mnav-panel .mnav-cta{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px}
  #fm-root .mnav-panel .mnav-cta a{border:none;padding:0}
  #fm-root .mnav-panel .mnav-cta .btn{padding:12px 16px;font-size:15px}
  #fm-root .mnav-panel .mnav-cta .btn-ghost{border:1px solid var(--line-strong)}
  @media (max-width:960px){ #fm-root details.mnav{display:block} #fm-root .nav-row{gap:12px} }
  #fm-root .nav-right > .btn{white-space:nowrap}
  @media (max-width:480px){ #fm-root .nav-right > .btn-ghost{display:none} #fm-root .nav-right > .btn-sm{padding:9px 14px} }
  @media (max-width:350px){ #fm-root .brand-mark{font-size:17px} #fm-root .nav-right > .btn-sm{padding:8px 11px;font-size:13px} }

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
  #fm-root .demo-badge{display:inline-block;font-size:11.5px;font-weight:800;letter-spacing:.08em;color:var(--warning);background:var(--warning-bg);padding:4px 10px;border-radius:var(--r-full);margin-bottom:14px}

  /* ---------- Live Product Preview / demo ---------- */
  #fm-root .pulse-demo{display:grid;grid-template-columns:220px 1fr;gap:0;border:1px solid var(--line);border-radius:var(--r-lg);overflow:hidden;background:var(--canvas);box-shadow:var(--shadow-md)}
  @media (max-width:820px){ #fm-root .pulse-demo{grid-template-columns:minmax(0,1fr)} }
  #fm-root .demo-nav{background:var(--canvas-2);border-right:1px solid var(--line);padding:14px}
  @media (max-width:820px){ #fm-root .demo-nav{border-right:none;border-bottom:1px solid var(--line);display:flex;flex-wrap:wrap;gap:4px} }
  #fm-root .demo-nav .demo-tag{font-size:11.5px;font-weight:800;letter-spacing:.08em;color:var(--ink-subtle);padding:6px 8px;margin-bottom:10px}
  @media (max-width:820px){ #fm-root .demo-nav .demo-tag{width:100%} }
  #fm-root .demo-nav button{display:flex;align-items:center;width:100%;text-align:left;gap:9px;padding:9px 10px;border-radius:var(--r-sm);border:none;background:transparent;font:inherit;font-size:13.5px;font-weight:600;color:var(--ink-muted);cursor:pointer}
  @media (max-width:820px){ #fm-root .demo-nav button{width:auto} }
  #fm-root .demo-nav button:hover{background:var(--line)}
  #fm-root .demo-nav button.active{background:var(--brand-tint);color:var(--brand-strong)}
  #fm-root .demo-body{padding:26px;min-height:360px}
  #fm-root .demo-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
  @media (max-width:820px){ #fm-root .demo-grid{grid-template-columns:repeat(2,1fr)} }
  /* Small phones: let the demo shrink instead of being clipped, and give it room. */
  #fm-root .demo-body, #fm-root .demo-grid > *, #fm-root .demo-panel{min-width:0}
  @media (max-width:480px){
    #fm-root .demo-body{padding:16px}
    #fm-root .demo-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
    #fm-root .stile{padding:12px}
    #fm-root .stile .val{font-size:clamp(16px,5vw,21px);overflow-wrap:anywhere}
    #fm-root .demo-table{font-size:12px}
    #fm-root .demo-table th, #fm-root .demo-table td{padding:8px 6px}
    #fm-root .demo-grid .stile{padding:12px}
  }
  @media (max-width:820px){
    /* wide demo tables scroll sideways inside their card instead of being cut off */
    #fm-root .demo-table{display:block;max-width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch;white-space:nowrap}
    #fm-root .demo-body svg, #fm-root .demo-body img, #fm-root .demo-body canvas{max-width:100%;height:auto}
    #fm-root .demo-panel{overflow-wrap:anywhere}
  }
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

  #fm-root .tag{font-size:11.5px;font-weight:800;letter-spacing:.06em;padding:3px 8px;border-radius:var(--r-full);display:inline-block}
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
  @media (max-width:560px){ #fm-root .agent-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px} #fm-root .agent-card{padding:14px} #fm-root .agent-card h4{margin-top:10px;font-size:14.5px} #fm-root .agent-card p{font-size:12.5px;margin-top:4px} #fm-root .agent-card .glyph{width:30px;height:30px;font-size:12px} }
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
  /* Foundation + trust (one section, two columns) */
  #fm-root .ft-grid{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:40px;align-items:start}
  #fm-root .ft-col h5{color:#fff;font-size:12px;text-transform:uppercase;letter-spacing:.08em;margin:0 0 14px;opacity:.85}
  #fm-root .ft-grid .found-grid{grid-template-columns:repeat(2,1fr)}
  #fm-root .ft-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:12px}
  #fm-root .ft-list li{color:var(--on-navy-muted);font-size:14px;line-height:1.55;padding-left:18px;position:relative}
  #fm-root .ft-list li::before{content:"";position:absolute;left:0;top:.6em;width:7px;height:7px;border-radius:50%;background:var(--brand)}
  #fm-root .ft-list b{color:#fff}
  @media (max-width:860px){ #fm-root .ft-grid{grid-template-columns:1fr;gap:28px} }

  /* ---------- How it works: 2D animated flow ---------- */
  #fm-root .flow{display:flex;flex-wrap:wrap;gap:0;align-items:stretch;margin-top:12px;max-width:900px;margin-inline:auto}
  #fm-root .flow-step{background:var(--canvas);border:1px solid var(--line);border-radius:var(--r-md);padding:14px 10px;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center;text-align:center;min-width:120px;flex:1;animation:hiw-sweep 9s ease-in-out infinite}
  #fm-root .flow-step:nth-child(3){animation-delay:.5s}
  #fm-root .flow-step:nth-child(5){animation-delay:1s}
  #fm-root .flow-step:nth-child(7){animation-delay:1.5s}
  #fm-root .flow-step:nth-child(9){animation-delay:2s}
  #fm-root .flow-step:nth-child(11){animation-delay:2.5s}
  #fm-root .flow-arrow{display:flex;align-items:center;justify-content:center;width:34px;color:var(--ink-subtle);flex:0 0 auto}
  @keyframes hiw-sweep{0%,84%,100%{background:var(--canvas);color:var(--ink);border-color:var(--line)}4%,14%{background:var(--brand-tint);color:var(--brand-strong);border-color:var(--brand)}}
  @media (max-width:760px){ #fm-root .flow{flex-direction:column} #fm-root .flow-arrow{transform:rotate(90deg);width:100%;height:22px} }

  /* Input docs -> AI hub -> record categories -> outcomes */
  #fm-root .hiw-io{margin-top:48px;display:flex;flex-direction:column;align-items:center;gap:0}
  #fm-root .hiw-chip-row{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;max-width:680px}
  #fm-root .hiw-connector{width:2px;height:30px;background:var(--line-strong);position:relative}
  #fm-root .hiw-connector::after{content:"";position:absolute;left:50%;top:-2px;width:6px;height:6px;margin-left:-3px;border-radius:50%;background:var(--brand);animation:hiw-drop 1.8s linear infinite}
  @keyframes hiw-drop{0%{top:-2px;opacity:0}12%{opacity:1}88%{opacity:1}100%{top:100%;opacity:0}}
  #fm-root .hiw-core{display:flex;align-items:center;gap:8px;padding:14px 26px;border-radius:var(--r-full);background:var(--brand);color:var(--on-brand);font-weight:800;font-size:14px;box-shadow:var(--shadow-md);animation:hiw-corepulse 3s ease-in-out infinite}
  #fm-root .hiw-core .dot{width:8px;height:8px;border-radius:50%;background:currentColor;opacity:.85}
  @keyframes hiw-corepulse{0%,100%{transform:scale(1)}50%{transform:scale(1.045)}}

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
  /* Merged "Why Finloraq" section */
  #fm-root section.why{padding-block:72px}
  #fm-root .why-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
  #fm-root .why-card{background:var(--navy-2);border:1px solid var(--navy-line);border-radius:var(--r-lg);padding:22px;scroll-margin-top:90px}
  #fm-root .why-card h4{color:#fff;font-size:16px}
  #fm-root .why-card p{color:var(--on-navy-muted);font-size:13.5px;margin-top:8px;line-height:1.55}
  #fm-root .why-card .ft-list{margin-top:12px;gap:10px}
  #fm-root .why-tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:14px}
  #fm-root .why-tags span{font-size:12px;font-weight:700;color:#fff;background:rgba(255,255,255,.06);border:1px solid var(--navy-line);border-radius:999px;padding:5px 10px}
  #fm-root .why-aud{display:flex;flex-wrap:wrap;align-items:center;gap:10px 22px;margin-top:22px;padding-top:20px;border-top:1px solid var(--navy-line);font-size:13.5px;color:var(--on-navy-muted);scroll-margin-top:90px}
  #fm-root .why-aud b{color:#fff}
  #fm-root .why-aud-lead{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#9C93F7;font-weight:700}
  @media (max-width:900px){ #fm-root .why-grid{grid-template-columns:1fr} }
  @media (max-width:720px){ #fm-root section.why{padding-block:56px} #fm-root .why-aud{flex-direction:column;align-items:flex-start;gap:8px} }
  #fm-root .hero-more{display:inline-block;margin-top:18px;font-size:14px;font-weight:600;color:#C9C3FF;text-decoration:none}
  #fm-root .hero-more:hover{text-decoration:underline}
  #fm-root .sec-head p a{color:var(--brand)}
  #fm-root .aud-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
  /* Compact audience strip */
  #fm-root section.aud-strip{padding-block:40px;border-bottom:1px solid var(--line)}
  #fm-root .aud-row{display:grid;grid-template-columns:minmax(0,1.2fr) repeat(4,minmax(0,1fr));gap:24px;align-items:start}
  #fm-root .aud-lead h3{font-family:var(--font-display);font-size:20px;line-height:1.25;margin:6px 0 0}
  #fm-root .aud-item b{display:block;font-size:14.5px}
  #fm-root .aud-item span{display:block;font-size:13px;color:var(--ink-muted);margin-top:4px;line-height:1.5}
  @media (max-width:980px){ #fm-root .aud-row{grid-template-columns:repeat(2,minmax(0,1fr))} #fm-root .aud-lead{grid-column:1/-1} }
  @media (max-width:420px){ #fm-root .aud-row{gap:18px 14px} }
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
  @media (max-width:700px){
    /* phones: one swipeable row with the next card peeking, instead of 5 stacked cards */
    #fm-root .price-grid{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;gap:12px;margin-inline:-16px;padding:4px 16px 14px;scroll-padding-inline:16px;scrollbar-width:thin}
    #fm-root .price-grid > .plan{flex:0 0 min(78%,300px);scroll-snap-align:start}
  }
  #fm-root .plan{border:1px solid var(--line);border-radius:var(--r-lg);padding:20px;display:flex;flex-direction:column;gap:14px;background:var(--canvas)}
  #fm-root .plan.feat{border-color:var(--brand);box-shadow:0 0 0 1px var(--brand)}
  #fm-root .plan .pname{font-weight:800;font-size:15px}
  #fm-root .plan .pprice{font-family:var(--font-mono);font-size:24px;font-weight:700}
  #fm-root .cur-bar{display:flex;flex-wrap:wrap;align-items:center;gap:10px 16px;margin:-8px 0 28px}
  #fm-root .cur-pick{display:inline-flex;align-items:center;gap:10px;font-size:13px;font-weight:600;color:var(--ink-muted)}
  #fm-root .cur-pick select{font:inherit;font-size:14px;font-weight:700;color:var(--ink);background:var(--canvas);border:1px solid var(--line-strong);border-radius:var(--r-md);padding:9px 34px 9px 12px;min-height:44px;cursor:pointer;appearance:none;-webkit-appearance:none;background-image:linear-gradient(45deg,transparent 50%,currentColor 50%),linear-gradient(135deg,currentColor 50%,transparent 50%);background-position:calc(100% - 17px) 55%,calc(100% - 12px) 55%;background-size:5px 5px;background-repeat:no-repeat}
  #fm-root .cur-pick select:focus-visible{outline:2px solid var(--brand);outline-offset:2px}
  #fm-root .cur-note{margin:0;font-size:12.5px;color:var(--ink-muted)}
  #fm-root .cur-note a{text-decoration:underline}
  @media (max-width:560px){ #fm-root .cur-pick{width:100%;justify-content:space-between;min-width:0} #fm-root .cur-pick span{flex:0 0 auto} #fm-root .cur-pick select{flex:1 1 0;min-width:0;max-width:260px;width:100%;text-overflow:ellipsis} }
  #fm-root .swipe-hint{display:none;margin:0 0 10px;font-size:12.5px;font-weight:600;color:var(--ink-muted)}
  @media (max-width:700px){ #fm-root .swipe-hint{display:block} }
  #fm-root .plan .pusd{font-size:12px;color:var(--ink-muted);margin-top:2px}
  #fm-root .plan .pprice small{font-family:var(--font-body);font-size:12px;font-weight:600;color:var(--ink-muted)}
  #fm-root .plan ul{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:8px;font-size:12.5px;color:var(--ink-muted);flex:1}
  #fm-root .plan li{display:flex;gap:7px}
  #fm-root .plan li svg{flex:0 0 auto;color:var(--teal);margin-top:2px}

  /* ---------- FAQ ---------- */
  #fm-root .faq{border-top:1px solid var(--line)}
  #fm-root .faq-item{border-bottom:1px solid var(--line)}
  #fm-root .faq-q{width:100%;text-align:left;background:none;border:none;font:inherit;padding:18px 0;display:flex;justify-content:space-between;align-items:center;gap:16px;cursor:pointer;font-weight:700;font-size:15px;color:var(--ink)}
  #fm-root .faq-q{list-style:none}
  #fm-root .faq-q::-webkit-details-marker{display:none}
  #fm-root .faq-q::marker{content:""}
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
  @media (max-width:520px){ #fm-root .foot-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:28px 16px;padding-block:40px} #fm-root .foot-grid > div:first-child{grid-column:1/-1} }
  #fm-root .foot-grid h6{color:#fff;font-size:12px;text-transform:uppercase;letter-spacing:.06em;margin-bottom:14px}
  #fm-root .foot-grid ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px;font-size:13.5px}
  #fm-root .foot-grid a:hover{color:#fff}
  /* Touch screens: footer links get a ≥24px tap area (WCAG 2.2 target size) without changing the desktop look */
  @media (pointer:coarse){ #fm-root .foot-grid ul{gap:2px} #fm-root .foot-grid a{display:inline-block;padding-block:5px} }
  @media (max-width:820px){ #fm-root .foot-grid ul{gap:2px} #fm-root .foot-grid ul a{display:inline-flex;align-items:center;min-height:40px} }
  #fm-root .foot-bottom{border-top:1px solid var(--navy-line);padding:20px 0;font-size:12.5px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px}
`;

const BODY_HTML = `<header class="nav">
  <div class="wrap nav-row">
    <a href="/" class="brand-mark" aria-label="Finloraq home"><span class="dot"></span>FINLORAQ</a>
    <nav class="links">
      <a href="/how-it-works">How it works</a>
      <a href="#demo">Demo</a>
      <a href="#why">Why Finloraq</a>
      <a href="#pricing">Pricing</a>
      <a href="#faq">FAQ</a>
    </nav>
    <div class="nav-right">
      <a class="btn btn-ghost btn-sm" href="/login">Sign In</a>
      <a class="btn btn-primary btn-sm" href="/register">Start Free</a>
      <details class="mnav">
        <summary aria-label="Open menu"><span></span><span></span><span></span></summary>
        <nav class="mnav-panel" aria-label="Main menu">
          <a href="/how-it-works">How it works</a>
          <a href="#demo">Demo</a>
          <a href="#why">Why Finloraq</a>
          <a href="#pricing">Pricing</a>
          <a href="#faq">FAQ</a>
          <a href="/ai-accounting">AI Accounting</a>
          <a href="/ai-cfo">AI CFO</a>
          <a href="/cash-flow-forecasting">Cash Flow Forecasting</a>
          <a href="/guides">Guides</a>
          <div class="mnav-cta">
            <a class="btn btn-ghost" href="/login">Sign In</a>
            <a class="btn btn-primary" href="/register">Start Free</a>
          </div>
        </nav>
      </details>
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
    <a class="hero-more" href="/how-it-works">See how Finloraq works →</a>
    <div class="trust-line">
      <span>Accounting foundation</span><span class="sep"></span><span>AI intelligence</span><span class="sep"></span><span>Human-controlled automation</span>
    </div>
  </div>
</section>

`;

// Everything after the hero. The 3D "How Finloraq works" walkthrough lives
// on its own page (/how-it-works) to keep this page short.
const BODY_HTML_AFTER_HERO = `<!-- 2. HOW IT WORKS — simple 2D animated flow (replaces the old 3D walkthrough on this page; the full 3D version still lives at /how-it-works) -->
<section class="canvas" id="how-it-works-flow" style="border-bottom:1px solid var(--line)">
  <div class="wrap">
    <div class="sec-head" style="margin-inline:auto;text-align:center">
      <div class="eyebrow">How it works</div>
      <h2 style="margin-top:12px">From any document to a decision — automatically.</h2>
      <p style="margin-inline:auto">Upload whatever you already have. Finloraq reads it, records it correctly, and tells you what to do next.</p>
    </div>

    <div class="flow">
      <div class="flow-step">Upload</div>
      <div class="flow-arrow">→</div>
      <div class="flow-step">AI Understands</div>
      <div class="flow-arrow">→</div>
      <div class="flow-step">Record</div>
      <div class="flow-arrow">→</div>
      <div class="flow-step">Analyze</div>
      <div class="flow-arrow">→</div>
      <div class="flow-step">Act</div>
      <div class="flow-arrow">→</div>
      <div class="flow-step">Respond</div>
    </div>

    <div class="hiw-io">
      <div class="hiw-chip-row">
        <span class="chip">PDF</span><span class="chip">Photo</span><span class="chip">Invoice</span><span class="chip">Receipt</span><span class="chip">Excel</span><span class="chip">Email</span><span class="chip">WhatsApp</span>
      </div>
      <div class="hiw-connector"></div>
      <div class="hiw-core"><span class="dot"></span>FINLORAQ AI</div>
      <div class="hiw-connector"></div>
      <div class="hiw-chip-row">
        <span class="chip">Accounting</span><span class="chip">Sales</span><span class="chip">Purchases</span><span class="chip">Expenses</span><span class="chip">Banking</span><span class="chip">Taxes</span>
      </div>
      <div class="hiw-connector"></div>
      <div class="hiw-chip-row">
        <span class="chip">Insights</span><span class="chip">Forecast</span><span class="chip">Actions</span>
      </div>
    </div>
  </div>
</section>

<!-- 3. LIVE PRODUCT PREVIEW / TRY THE DEMO -->
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
          <div class="panel-title">What-If simulator</div>
          <p class="mini-note" style="margin-top:0">Model a slower sales month, a longer payment cycle or new hires against these same numbers. Nothing here changes an actual record.</p>
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
              <div class="wr-row"><span>Cash impact</span><span class="wv num" id="wf-cash" style="color:var(--danger)">↓ $47K</span></div>
              <div class="wr-row"><span>Profit impact</span><span class="wv num" id="wf-profit" style="color:var(--danger)">↓ $22K</span></div>
              <div class="wr-row"><span>Runway change</span><span class="wv num" id="wf-runway" style="color:var(--danger)">-2.0 months</span></div>
              <div class="sim-note">SIMULATION — DOES NOT CHANGE YOUR ACCOUNTING RECORDS</div>
            </div>
          </div>
        </div>

      </div>
    </div>
  </div>
</section>

<!-- 4. WHY FINLORAQ — AI team, accounting core, controls, audience -->
<section class="on-navy why" id="why">
  <div class="wrap">
    <div class="sec-head">
      <div class="eyebrow on-navy">Why Finloraq</div>
      <h2 style="margin-top:12px;color:#fff">AI that does the work. Accounting you can trust.</h2>
      <p>AI recommends. You approve. Finloraq records. Nothing posts to your books without a human decision.</p>
    </div>
    <div class="why-grid">
      <div class="why-card" id="agents">
        <h4>Six AI agents, one finance team</h4>
        <p>Always watching your bills, receivables, cash, close, tax and the big picture.</p>
        <div class="why-tags"><span>AP</span><span>AR</span><span>Cash</span><span>Close</span><span>Tax</span><span>CFO</span></div>
      </div>
      <div class="why-card" id="foundation">
        <h4>Real accounting underneath</h4>
        <p>Every insight traces back to posted, double-entry transactions.</p>
        <div class="why-tags"><span>Double-entry ledger</span><span>P&amp;L &amp; balance sheet</span><span>AR / AP</span><span>Bank reconciliation</span><span>UAE VAT</span><span>Multi-company &amp; currency</span></div>
      </div>
      <div class="why-card" id="trust">
        <h4>You stay in control</h4>
        <ul class="ft-list">
          <li><b>Human approval</b> before anything posts</li>
          <li><b>Immutable history</b> and a full audit trail</li>
          <li><b>Roles, MFA</b> and per-company data isolation</li>
        </ul>
      </div>
    </div>
    <div class="why-aud" id="audience">
      <span class="why-aud-lead">Built for</span>
      <span><b>Business owners</b> who want clarity</span>
      <span><b>Finance teams</b> tired of data entry</span>
      <span><b>Accountants</b> closing many companies</span>
      <span><b>Growing companies</b> scaling finance</span>
    </div>
  </div>
</section>

<!-- 6. PRICING -->
<section class="canvas" style="background:var(--canvas-2);border-top:1px solid var(--line);border-bottom:1px solid var(--line)" id="pricing">
  <div class="wrap">
    <div class="sec-head">
      <div class="eyebrow">Pricing</div>
      <h2 style="margin-top:12px">Simple plans that grow with you.</h2>
      <p>Start free. Upgrade when you need more people, more AI or more automation. Billed monthly, cancel anytime. Prices include VAT where it applies.</p>
    </div>
    <div class="cur-bar">
      <label class="cur-pick"><span>Show prices in</span>
        <select id="fq-cur" aria-label="Currency">
          <optgroup label="Billed in this currency">
            <option value="USD">US$ · US dollar</option>
            <option value="AED" selected>AED · UAE dirham</option>
            <option value="SAR">SAR · Saudi riyal</option>
            <option value="QAR">QAR · Qatari riyal</option>
            <option value="EUR">€ · Euro</option>
            <option value="GBP">£ · British pound</option>
            <option value="CAD">C$ · Canadian dollar</option>
            <option value="AUD">A$ · Australian dollar</option>
          </optgroup>
          <optgroup label="Estimate only · billed in US$" id="fq-cur-est"></optgroup>
        </select>
      </label>
      <p class="cur-note" id="fq-cur-note">Fixed prices in AED. You're charged exactly what you see.</p>
    </div>
    <p class="swipe-hint" aria-hidden="true">Swipe to compare plans →</p>
    <div class="price-grid">
      <div class="plan">
        <div class="pname">Starter</div>
        <div class="pprice num">Free</div><div class="pusd">Free forever · no card needed</div>
        <ul>
          <li>✓ Double-entry accounting &amp; reports</li><li>✓ Invoices, bills &amp; expenses</li><li>✓ UAE VAT tax codes</li><li>✓ 2 users · 20 AI actions/mo</li>
        </ul>
        <a class="btn btn-ghost btn-block" href="/register">Start Free</a>
      </div>
      <div class="plan">
        <div class="pname">Growth</div>
        <div class="pprice num" data-plan="GROWTH">AED 179<small>/mo</small></div><div class="pusd" data-plan-note="GROWTH">Billed monthly in AED</div>
        <ul>
          <li>✓ Everything in Starter</li><li>✓ Receipt &amp; invoice reading (AI)</li><li>✓ E-invoicing</li><li>✓ Bank reconciliation</li><li>✓ 5 users · 200 AI actions/mo</li>
        </ul>
        <a class="btn btn-ghost btn-block" href="/register">Start Free</a>
      </div>
      <div class="plan feat">
        <div class="pname">Professional</div>
        <div class="pprice num" data-plan="PROFESSIONAL">AED 549<small>/mo</small></div><div class="pusd" data-plan-note="PROFESSIONAL">Billed monthly in AED</div>
        <ul>
          <li>✓ Everything in Growth</li><li>✓ Cash-flow intelligence</li><li>✓ Projects &amp; cost centres</li><li>✓ Voice commands &amp; API access</li><li>✓ 15 users · 1,000 AI actions/mo</li>
        </ul>
        <a class="btn btn-primary btn-block" href="/register">Start Free</a>
      </div>
      <div class="plan">
        <div class="pname">AI CFO</div>
        <div class="pprice num" data-plan="AI_CFO">AED 1,099<small>/mo</small></div><div class="pusd" data-plan-note="AI_CFO">Billed monthly in AED</div>
        <ul>
          <li>✓ Everything in Professional</li><li>✓ Multi-company</li><li>✓ Priority support</li><li>✓ 30 users · 5,000 AI actions/mo</li>
        </ul>
        <a class="btn btn-ghost btn-block" href="/register">Start Free</a>
      </div>
      <div class="plan">
        <div class="pname">Enterprise</div>
        <div class="pprice">Talk to us</div>
        <ul>
          <li>✓ Custom users &amp; limits</li><li>✓ Unlimited AI actions</li><li>✓ Dedicated support</li><li>✓ Advanced security review</li>
        </ul>
        <a class="btn btn-ghost btn-block" href="mailto:hello@finloraq.com">Contact Sales</a>
      </div>
    </div>
  </div>
</section>

<!-- 7. FAQ -->
<section class="canvas" id="faq">
  <div class="wrap">
    <div class="sec-head" style="margin-bottom:8px"><div class="eyebrow">FAQ</div><h2 style="margin-top:12px">Questions, answered plainly.</h2><p>More in our <a href="/guides">guides</a>, or email <a href="mailto:hello@finloraq.com">hello@finloraq.com</a>.</p></div>
    <div class="faq">
      <details class="faq-item" open><summary class="faq-q">What is Finloraq?<svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg></summary><div class="faq-a">An AI Finance Operating System: full double-entry accounting software (ledger, P&amp;L, balance sheet, AR/AP, tax) with AI on top that explains what happened, why, and what to do next.</div></details>
      <details class="faq-item"><summary class="faq-q">Can AI change my accounting records?<svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg></summary><div class="faq-a">No. AI recommends and drafts; a person approves before anything posts. Posted, reconciled records stay immutable.</div></details>
      <details class="faq-item"><summary class="faq-q">Is my data secure?<svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg></summary><div class="faq-a">Data is encrypted, tenant-isolated per company, and every change is captured in an audit trail. We only publish compliance certifications once they're actually verified.</div></details>
      <details class="faq-item"><summary class="faq-q">Does Finloraq support UAE VAT?<svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg></summary><div class="faq-a">Yes — the UAE VAT pack, including tax codes and readiness checks, is available today.</div></details>
    </div>
  </div>
</section>

<!-- 8. FINAL CTA -->
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
      <a href="/" class="brand-mark" style="color:#fff" aria-label="Finloraq home"><span class="dot"></span>FINLORAQ</a>
      <p style="margin-top:14px;font-size:13px;max-width:32ch;line-height:1.6">AI Finance Operating System — accounting foundation, AI intelligence, human-controlled automation.</p>
    </div>
    <div><h6>Product</h6><ul><li><a href="/how-it-works">How it works</a></li><li><a href="#demo">Business Pulse</a></li><li><a href="/ai-accounting">AI Accounting</a></li><li><a href="/cash-flow-forecasting">Cash Flow Forecasting</a></li><li><a href="#agents">Finance Agents</a></li></ul></div>
    <div><h6>Solutions</h6><ul><li><a href="/ai-cfo">AI CFO</a></li><li><a href="#audience">Business Owners</a></li><li><a href="#audience">Finance Teams</a></li><li><a href="#audience">Accountants</a></li></ul></div>
    <div><h6>Resources</h6><ul><li><a href="/guides">Guides</a></li><li><a href="#faq">FAQ</a></li><li><a href="mailto:hello@finloraq.com">Help</a></li></ul></div>
    <div><h6>Company</h6><ul><li><a href="mailto:hello@finloraq.com">About</a></li><li><a href="mailto:hello@finloraq.com">Contact</a></li><li><a href="#trust">Security</a></li></ul></div>
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

    // Old deep links (the page used to have separate Pulse / What-If sections):
    // /#whatif-full and /#whatif open the demo on its What-If tab, /#pulse on the dashboard.
    function openFromHash(){
      var h = location.hash;
      if (h === '#whatif-full' || h === '#whatif' || h === '#pulse') {
        showPanel(h === '#pulse' ? 'dashboard' : 'whatif');
        var demo = document.getElementById('demo');
        if (demo) setTimeout(function(){ demo.scrollIntoView({block:'start'}); }, 0);
      }
    }
    openFromHash();
    window.addEventListener('hashchange', openFromHash);

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

      // s is a % change in sales: a drop (negative s) must reduce cash and profit.
      var cashImpact = (s * 0.9) + (d * -0.8) + (h * -2.2) + (c * -0.6);
      var profitImpact = (s * 0.55) + (h * -1.1) + (c * -0.5);
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

  // Pricing currency switcher. Billing currencies show the fixed price
  // Stripe charges; other currencies show a clearly-marked estimate of the
  // US$ price at today's rate. The choice is saved in a cookie the in-app
  // Billing page also reads, so checkout charges the currency picked here.
  useEffect(() => {
    const select = document.getElementById("fq-cur");
    const note = document.getElementById("fq-cur-note");
    const estGroup = document.getElementById("fq-cur-est");
    if (!select || !note) return;
    let rates = {};
    let ratesSource = null;
    const readCookie = () => (document.cookie.match(new RegExp("(?:^|; )" + CURRENCY_COOKIE + "=([^;]+)")) || [])[1];
    const render = (code) => {
      const lower = code.toLowerCase();
      const billable = isBillingCurrency(lower);
      const rate = rates[code];
      if (!billable && !rate) return render("USD");
      select.value = code;
      document.querySelectorAll("#fm-root [data-plan]").forEach((el) => {
        const def = PLANS[el.getAttribute("data-plan")];
        const noteEl = document.querySelector('#fm-root [data-plan-note="' + def.plan + '"]');
        if (billable) {
          el.innerHTML = formatMoney(def.prices[lower], code) + "<small>/mo</small>";
          if (noteEl) noteEl.textContent = "Billed monthly in " + (code === "USD" ? "US$" : code);
        } else {
          el.innerHTML = formatMoney(roundApprox(def.monthlyPriceUsd * rate), code, { approx: true }) + "<small>/mo</small>";
          if (noteEl) noteEl.textContent = "Estimate · billed as US$" + def.monthlyPriceUsd + "/mo";
        }
      });
      if (billable) {
        note.textContent = "Fixed prices in " + code + ". You're charged exactly what you see.";
      } else {
        note.innerHTML = "Estimate at today's rate — you're billed in US$, and your bank may convert at its own rate. " +
          (ratesSource ? 'Rates by <a href="' + ratesSource.url + '" target="_blank" rel="noopener">' + ratesSource.name + "</a>." : "");
      }
    };
    const save = (code) => { document.cookie = CURRENCY_COOKIE + "=" + code + "; Max-Age=31536000; Path=/; SameSite=Lax"; };
    const onChange = () => { save(select.value); render(select.value); };
    select.addEventListener("change", onChange);
    const saved = readCookie();
    if (saved && isBillingCurrency(saved.toLowerCase())) render(saved);
    let cancelled = false;
    fetch("/api/public/pricing")
      .then((r) => (r.ok ? r.json() : null))
      .then((ctx) => {
        if (cancelled || !ctx) return;
        rates = ctx.rates || {};
        ratesSource = ctx.ratesSource || null;
        if (estGroup) {
          estGroup.innerHTML = "";
          Object.keys(DISPLAY_CURRENCIES).filter((c) => rates[c]).forEach((c) => {
            const o = document.createElement("option");
            o.value = c; o.textContent = c + " · " + DISPLAY_CURRENCIES[c];
            estGroup.appendChild(o);
          });
          estGroup.hidden = !estGroup.children.length;
        }
        const pick = saved || ctx.suggested || "AED";
        render(isBillingCurrency(pick.toLowerCase()) || rates[pick] ? pick : "USD");
      })
      .catch(() => { if (!saved) render("AED"); });
    return () => { cancelled = true; select.removeEventListener("change", onChange); };
  }, []);

  // Mobile menu: close it after a link is tapped (same-page #anchors don't
  // reload the page), on Escape, and when tapping outside it.
  useEffect(() => {
    const menu = document.querySelector("#fm-root details.mnav");
    if (!menu) return;
    const close = () => { menu.open = false; };
    const onClick = (e) => {
      if (!menu.open) return;
      if (e.target.closest("details.mnav a") || !menu.contains(e.target)) close();
    };
    const onKey = (e) => { if (e.key === "Escape" && menu.open) { close(); menu.querySelector("summary")?.focus(); } };
    const onToggle = () => menu.querySelector("summary")?.setAttribute("aria-label", menu.open ? "Close menu" : "Open menu");
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    menu.addEventListener("toggle", onToggle);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
      menu.removeEventListener("toggle", onToggle);
    };
  }, []);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: STYLE }} />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Libre+Franklin:wght@600;700;800&family=Public+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600;700&display=swap"
      />
      <div id="fm-root">
        {/* display:contents keeps the wrappers out of layout, so the sticky
            nav and every #fm-root selector behave exactly as before */}
        <div style={{ display: "contents" }} dangerouslySetInnerHTML={{ __html: BODY_HTML }} />
        <div style={{ display: "contents" }} dangerouslySetInnerHTML={{ __html: BODY_HTML_AFTER_HERO }} />
      </div>
    </>
  );
}
