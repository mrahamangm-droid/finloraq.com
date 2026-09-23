// Shared design tokens + base rules for every marketing/SEO landing page
// (the homepage plus /ai-accounting, /ai-cfo, /cash-flow-forecasting,
// /guides, and any future page that composes <MarketingHeader>/<MarketingFooter>).
//
// This is extracted verbatim from src/components/marketing/MarketingHomePage.tsx's
// own STYLE string (same #fm-root-scoped tokens, buttons, hero, nav, footer)
// so every marketing page shares one visual identity. It deliberately stops
// at the generic building blocks — colors, type, .btn, .hero, .sec-head,
// .final-cta, nav, footer — and leaves homepage-only components (the Business
// Pulse demo, agent grid, pricing table, FAQ accordion, etc.) in
// MarketingHomePage.tsx where they're actually used, so this file stays a
// true "design system," not a dumping ground.
//
// Each page still gets its own #fm-root wrapper (scoped per-route, since
// each route renders its own DOM), so there's no risk of these rules
// leaking into the authenticated app or into each other.
export const MARKETING_BASE_STYLE = `
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
    /* --font-display/--font-body/--font-mono come from next/font on <html>
       (src/app/layout.tsx) and inherit down — see the note in
       MarketingHomePage.tsx for why they're not redeclared here. */
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
  #fm-root nav.links a[aria-current="page"]{color:var(--ink)}
  #fm-root .nav-right{margin-left:auto;display:flex;align-items:center;gap:10px}
  @media (max-width:860px){ #fm-root nav.links{display:none} }

  /* ---------- Mobile menu (< 860px, where nav.links is hidden) ---------- */
  #fm-root [id]{scroll-margin-top:84px}
  #fm-root details.mnav{display:none;position:relative}
  #fm-root details.mnav > summary{list-style:none;display:flex;flex-direction:column;justify-content:center;gap:5px;width:44px;height:44px;padding:0 11px;border:1px solid var(--line-strong);border-radius:var(--r-md);cursor:pointer;color:var(--ink)}
  #fm-root details.mnav > summary::-webkit-details-marker{display:none}
  #fm-root details.mnav > summary span{display:block;height:2px;border-radius:2px;background:currentColor;transition:transform .18s ease, opacity .18s ease}
  #fm-root details.mnav[open] > summary span:nth-child(1){transform:translateY(7px) rotate(45deg)}
  #fm-root details.mnav[open] > summary span:nth-child(2){opacity:0}
  #fm-root details.mnav[open] > summary span:nth-child(3){transform:translateY(-7px) rotate(-45deg)}
  #fm-root details.mnav > summary:focus-visible{outline:2px solid var(--brand);outline-offset:2px}
  #fm-root .mnav-panel{position:fixed;left:0;right:0;top:calc(68px + env(safe-area-inset-top,0px));max-height:calc(100dvh - 68px);overflow-y:auto;background:var(--bg);border-bottom:1px solid var(--line);box-shadow:0 18px 40px rgba(0,0,0,.18);padding:8px 16px 20px;display:flex;flex-direction:column}
  #fm-root .mnav-panel a{display:block;padding:14px 4px;font-size:16px;font-weight:600;color:var(--ink);border-bottom:1px solid var(--line)}
  #fm-root .mnav-panel a[aria-current="page"]{color:var(--brand)}
  #fm-root .mnav-panel .mnav-cta{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px}
  #fm-root .mnav-panel .mnav-cta a{border:none;padding:0}
  #fm-root .mnav-panel .mnav-cta .btn{padding:12px 16px;font-size:15px}
  #fm-root .mnav-panel .mnav-cta .btn-ghost{border:1px solid var(--line-strong)}
  @media (max-width:860px){ #fm-root details.mnav{display:block} #fm-root .nav-row{gap:12px} }
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
  #fm-root .hero h1{font-size:clamp(34px,5.4vw,56px);font-weight:800;letter-spacing:-.02em;line-height:1.05;color:#fff}
  #fm-root .hero h1 span{color:#A79CFF}
  #fm-root .hero p.lead{margin:20px auto 0;font-size:17px;line-height:1.6;color:var(--on-navy-muted);max-width:52ch}
  #fm-root .hero .cta-row{display:flex;gap:12px;margin-top:30px;flex-wrap:wrap;justify-content:center}
  #fm-root .breadcrumb{font-size:12.5px;color:var(--on-navy-muted);margin-bottom:18px}
  #fm-root .breadcrumb a{color:var(--on-navy-muted);text-decoration:underline;text-underline-offset:2px}
  #fm-root .breadcrumb a:hover{color:#fff}

  /* ---------- Generic section headers ---------- */
  #fm-root .sec-head{max-width:680px}
  #fm-root .sec-head.center{margin-inline:auto;text-align:center}
  #fm-root .sec-head h2{font-size:clamp(26px,3.4vw,36px);font-weight:800;letter-spacing:-.015em}
  #fm-root .sec-head p{margin-top:14px;font-size:16px;color:var(--ink-muted);line-height:1.6}
  #fm-root section.on-navy{background:var(--navy);color:var(--on-navy)}
  #fm-root section.on-navy .sec-head h2{color:#fff}
  #fm-root section.on-navy .sec-head p{color:var(--on-navy-muted)}
  #fm-root section.canvas{background:var(--canvas)}
  #fm-root section.canvas-2{background:var(--canvas-2)}

  #fm-root .card{background:var(--canvas);border:1px solid var(--line);border-radius:var(--r-md);box-shadow:var(--shadow-sm)}
  #fm-root .demo-badge{display:inline-block;font-size:10.5px;font-weight:800;letter-spacing:.08em;color:var(--warning);background:var(--warning-bg);padding:4px 10px;border-radius:var(--r-full);margin-bottom:14px}

  /* ---------- Reusable landing-page building blocks ---------- */
  #fm-root .feature-grid{margin-top:36px;display:grid;grid-template-columns:repeat(3,1fr);gap:20px}
  @media (max-width:860px){ #fm-root .feature-grid{grid-template-columns:repeat(2,1fr)} }
  @media (max-width:560px){ #fm-root .feature-grid{grid-template-columns:1fr} }
  #fm-root .feature-card{padding:24px;background:var(--canvas);border:1px solid var(--line);border-radius:var(--r-lg)}
  #fm-root .feature-card h3{font-size:16.5px;font-weight:800;letter-spacing:-.01em}
  #fm-root .feature-card p{margin-top:8px;font-size:13.5px;color:var(--ink-muted);line-height:1.6}
  #fm-root .feature-card .glyph{width:36px;height:36px;border-radius:9px;background:var(--brand-tint);color:var(--brand);display:flex;align-items:center;justify-content:center;font-weight:800;font-family:var(--font-mono);font-size:13px;margin-bottom:14px}

  #fm-root .stat-strip{margin-top:36px;display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--navy-line);border:1px solid var(--navy-line);border-radius:var(--r-lg);overflow:hidden}
  @media (max-width:720px){ #fm-root .stat-strip{grid-template-columns:repeat(2,1fr)} }
  #fm-root .stat-tile{background:var(--navy-2);padding:22px 20px;text-align:center}
  #fm-root .stat-tile .v{font-family:var(--font-mono);font-size:26px;font-weight:700;color:#fff}
  #fm-root .stat-tile .l{margin-top:6px;font-size:12px;color:var(--on-navy-muted);line-height:1.4}

  #fm-root .compare{margin-top:36px;width:100%;border-collapse:collapse;font-size:14px}
  #fm-root .compare th, #fm-root .compare td{text-align:left;padding:14px 16px;border-bottom:1px solid var(--line);vertical-align:top}
  #fm-root .compare thead th{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-subtle);font-weight:700}
  #fm-root .compare td:first-child, #fm-root .compare th:first-child{font-weight:700;color:var(--ink)}
  #fm-root .compare .yes{color:var(--success);font-weight:700}
  #fm-root .compare .no{color:var(--ink-subtle)}
  #fm-root .compare-wrap{overflow-x:auto}

  #fm-root .step-list{margin-top:36px;display:flex;flex-direction:column;gap:0}
  #fm-root .step{display:grid;grid-template-columns:44px 1fr;gap:18px;padding-block:22px;border-top:1px solid var(--line)}
  #fm-root .step:first-child{border-top:none}
  #fm-root .step .n{width:32px;height:32px;border-radius:50%;background:var(--brand-tint);color:var(--brand);display:flex;align-items:center;justify-content:center;font-family:var(--font-mono);font-weight:700;font-size:13px}
  #fm-root .step h3{font-size:16px;font-weight:800}
  #fm-root .step p{margin-top:6px;font-size:14px;color:var(--ink-muted);line-height:1.6;max-width:64ch}

  #fm-root .inline-links{margin-top:14px;display:flex;flex-wrap:wrap;gap:8px 18px;font-size:13.5px}
  #fm-root .inline-links a{color:var(--brand);font-weight:600}
  #fm-root .inline-links a:hover{text-decoration:underline}

  /* ---------- Final CTA / footer (identical to the homepage's) ---------- */
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
