// Homepage-only styles, layered on MARKETING_BASE_STYLE (tokens, nav, buttons,
// footer). Scoped under #fm-root like every marketing page so nothing leaks
// into the signed-in app. All motion sits inside prefers-reduced-motion:
// no-preference, so visitors who ask for less motion get a static page.
export const HOME_STYLE = `
  /* ---------- Hero ---------- */
  #fm-root .hero.home{padding-block:72px 0;text-align:center;background:radial-gradient(900px 480px at 50% -12%, #1E2750 0%, var(--navy) 62%), var(--navy)}
  #fm-root .hero.home .wrap{max-width:1120px}
  #fm-root .hero.home h1{font-size:clamp(38px,7vw,76px);letter-spacing:-.025em;line-height:1;text-transform:uppercase}
  #fm-root .hero.home h1 span{display:block;background:linear-gradient(90deg,#B7AEFF,#7FE3D3);-webkit-background-clip:text;background-clip:text;color:transparent}
  #fm-root .hero.home p.lead{max-width:40ch;font-size:clamp(16px,1.9vw,19px);margin-top:22px}
  #fm-root .hero.home .cta-row{margin-top:30px}
  #fm-root .hero.home .btn{padding:13px 24px;font-size:15px}
  #fm-root .hero-stage{position:relative;margin-top:52px;padding-bottom:64px}
  #fm-root .hero-stage::before{content:"";position:absolute;left:8%;right:8%;top:6%;height:70%;background:radial-gradient(closest-side, rgba(110,100,240,.38), transparent);filter:blur(24px);pointer-events:none}
  @media (max-width:720px){ #fm-root .hero.home{padding-top:48px} #fm-root .hero-stage{margin-top:36px;padding-bottom:40px} #fm-root .hero.home .cta-row .btn{flex:1 1 0;min-width:140px} }

  /* ---------- Dashboard preview ---------- */
  #fm-root .dp{position:relative;text-align:left;background:var(--canvas);color:var(--ink);border:1px solid var(--line);border-radius:18px;box-shadow:0 30px 80px -20px rgba(4,8,20,.55), 0 0 0 1px rgba(255,255,255,.04);overflow:hidden;scroll-margin-top:84px}
  #fm-root .dp-bar{display:flex;align-items:center;gap:12px;height:44px;padding:0 16px;border-bottom:1px solid var(--line);background:var(--canvas-2)}
  #fm-root .dp-dots{display:flex;gap:6px}
  #fm-root .dp-dots i{width:10px;height:10px;border-radius:50%;background:var(--line-strong)}
  #fm-root .dp-title{font-weight:700;font-size:13px}
  #fm-root .dp-badge{margin-left:auto;font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--warning);background:var(--warning-bg);padding:3px 9px;border-radius:var(--r-full)}
  #fm-root .dp-body{display:grid;grid-template-columns:188px minmax(0,1fr)}
  #fm-root .dp-tabs{display:flex;flex-direction:column;gap:2px;padding:12px;border-right:1px solid var(--line);background:var(--canvas-2)}
  #fm-root .dp-tab{font:inherit;font-size:13.5px;font-weight:600;text-align:left;color:var(--ink-muted);background:transparent;border:0;border-radius:8px;padding:10px 12px;cursor:pointer;white-space:nowrap}
  #fm-root .dp-tab:hover{background:var(--line);color:var(--ink)}
  #fm-root .dp-tab[aria-selected="true"]{background:var(--brand-tint);color:var(--brand-strong)}
  #fm-root .dp-panels{display:grid;min-width:0}
  #fm-root .dp-panel{grid-area:1/1;min-width:0;padding:20px;display:flex;flex-direction:column;gap:16px;visibility:hidden}
  #fm-root .dp-panel[data-active="true"]{visibility:visible}
  @media (max-width:760px){
    #fm-root .dp-body{grid-template-columns:minmax(0,1fr)}
    #fm-root .dp-tabs{flex-direction:row;overflow-x:auto;border-right:0;border-bottom:1px solid var(--line);padding:8px;scrollbar-width:none;-webkit-overflow-scrolling:touch}
    #fm-root .dp-tabs::-webkit-scrollbar{display:none}
    #fm-root .dp-tab{padding:9px 12px;min-height:40px}
    #fm-root .dp-panel{padding:14px}
    #fm-root .dp-chart-card{display:none}
  }

  #fm-root .dp-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
  @media (max-width:760px){ #fm-root .dp-kpis{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px} }
  #fm-root .dp-kpi{border:1px solid var(--line);border-radius:12px;padding:12px 14px;min-width:0}
  #fm-root .dp-kpi-l{font-size:11.5px;font-weight:600;color:var(--ink-muted)}
  #fm-root .dp-kpi-v{font-size:clamp(17px,2.2vw,21px);font-weight:700;margin-top:4px;white-space:nowrap}
  #fm-root .dp-kpi-d{font-size:11.5px;font-weight:700;margin-top:2px;color:var(--ink-muted)}
  #fm-root .dp-kpi-d.up{color:var(--success)}
  #fm-root .dp-kpi-d.down{color:var(--danger)}

  #fm-root .dp-split{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.15fr);gap:12px}
  @media (max-width:760px){ #fm-root .dp-split{grid-template-columns:minmax(0,1fr)} }
  #fm-root .dp-card{border:1px solid var(--line);border-radius:12px;padding:14px;min-width:0}
  #fm-root .dp-card-h{font-size:12.5px;font-weight:700;margin-bottom:10px}
  #fm-root .dp-chart{width:100%;height:auto;display:block}
  #fm-root .dp-chart .bar{fill:var(--line-strong)}
  #fm-root .dp-chart .bar.now{fill:var(--brand)}
  #fm-root .dp-chart .axis{fill:var(--ink-subtle);font-size:9px;font-family:var(--font-body)}
  #fm-root .dp-todo{list-style:none;margin:0;padding:0}
  #fm-root .dp-todo li{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 0;border-top:1px solid var(--line);font-size:13px}
  #fm-root .dp-todo li:first-child{border-top:0;padding-top:0}
  #fm-root .dp-link{flex:0 0 auto;font:inherit;font-size:12.5px;font-weight:700;color:var(--brand);background:none;border:0;padding:6px 0;cursor:pointer;white-space:nowrap}
  #fm-root .dp-link:hover{text-decoration:underline}

  #fm-root .dp-bars{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:12px}
  #fm-root .dp-bars li{display:grid;grid-template-columns:86px minmax(0,1fr) 84px;align-items:center;gap:12px;font-size:13px}
  #fm-root .dp-bars-t{height:10px;border-radius:99px;background:var(--canvas-2);overflow:hidden}
  #fm-root .dp-bars-t span{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,var(--brand),var(--teal))}
  #fm-root .dp-bars-v{text-align:right;font-weight:700}
  #fm-root .dp-note{font-size:12.5px;color:var(--ink-muted);line-height:1.55;margin-top:12px}

  #fm-root .dp-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch;padding:0}
  #fm-root .dp-table{width:100%;border-collapse:collapse;font-size:13px;white-space:nowrap}
  #fm-root .dp-table th{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-subtle);text-align:left;padding:10px 14px;border-bottom:1px solid var(--line)}
  #fm-root .dp-table td{padding:11px 14px;border-bottom:1px solid var(--line)}
  #fm-root .dp-table tr:last-child td{border-bottom:0}
  #fm-root .dp-table .r{text-align:right}
  #fm-root .dp-pill{font-size:11px;font-weight:700;padding:3px 9px;border-radius:99px;background:var(--brand-tint);color:var(--brand-strong)}
  #fm-root .dp-pill.overdue{background:var(--danger-bg);color:var(--danger)}
  #fm-root .dp-pill.paid{background:var(--success-bg);color:var(--success)}

  #fm-root .dp-chips{display:flex;flex-wrap:wrap;gap:8px}
  #fm-root .dp-chip{font:inherit;font-size:12.5px;font-weight:600;color:var(--ink);background:var(--canvas);border:1px solid var(--line-strong);border-radius:99px;padding:8px 13px;cursor:pointer;min-height:36px}
  #fm-root .dp-chip:hover{border-color:var(--brand);color:var(--brand)}
  #fm-root .dp-chat{display:flex;flex-direction:column;gap:10px;margin-top:14px}
  #fm-root .dp-pair{display:flex;flex-direction:column;gap:8px}
  #fm-root .dp-msg{max-width:86%;font-size:13px;line-height:1.5;padding:9px 13px;border-radius:12px}
  #fm-root .dp-msg.me{align-self:flex-end;background:var(--brand);color:var(--on-brand);border-bottom-right-radius:4px}
  #fm-root .dp-msg.ai{align-self:flex-start;background:var(--canvas-2);border:1px solid var(--line);border-bottom-left-radius:4px}

  #fm-root .dp-whatif{display:grid;grid-template-columns:1fr 1fr;gap:18px}
  @media (max-width:760px){ #fm-root .dp-whatif{grid-template-columns:1fr} }
  #fm-root .dp-slider{display:flex;flex-direction:column;gap:8px;font-size:13px;font-weight:600}
  #fm-root .dp-slider b{color:var(--brand)}
  #fm-root .dp-slider input{width:100%;accent-color:var(--brand);min-height:28px}
  #fm-root .dp-result{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:16px;padding-top:14px;border-top:1px solid var(--line)}
  #fm-root .dp-result-v{font-size:22px;font-weight:700;margin-top:4px}
  #fm-root .dp-result-v.up{color:var(--success)}
  #fm-root .dp-result-v.down{color:var(--danger)}

  /* ---------- How it works: 2D flow ---------- */
  #fm-root .flow{list-style:none;margin:40px auto 0;padding:0;max-width:760px;display:flex;flex-direction:column;align-items:stretch}
  #fm-root .flow-stage{display:flex;flex-direction:column;align-items:center}
  #fm-root .flow-arrow{display:flex;justify-content:center;color:var(--brand);padding-block:6px}
  #fm-root .flow-card{width:100%;background:var(--canvas);border:1px solid var(--line);border-radius:16px;padding:18px 20px;box-shadow:var(--shadow-sm);transition:border-color .3s ease, box-shadow .3s ease}
  #fm-root .flow-title{display:flex;align-items:center;gap:10px;font-size:15px;font-weight:800;letter-spacing:.06em;text-transform:uppercase}
  #fm-root .flow-n{font-size:12px;color:var(--ink-muted);letter-spacing:0}
  #fm-root .flow-items{list-style:none;margin:12px 0 0;padding:0;display:flex;flex-wrap:wrap;gap:8px}
  #fm-root .flow-items li{font-size:13px;font-weight:600;padding:6px 12px;border-radius:99px;background:var(--canvas-2);border:1px solid var(--line)}
  #fm-root .flow-ai .flow-card{background:linear-gradient(135deg,var(--brand),#3B7DD8);border-color:transparent;color:#fff}
  #fm-root .flow-ai .flow-title, #fm-root .flow-ai .flow-n{color:#fff}
  #fm-root .flow-ai .flow-items li{background:rgba(255,255,255,.14);border-color:rgba(255,255,255,.22);color:#fff}
  @media (prefers-reduced-motion: no-preference){
    #fm-root .flow-stage .flow-card{animation:flow-focus 8s ease-in-out infinite;animation-delay:calc(var(--i) * 2s)}
    #fm-root .flow-arrow svg{animation:flow-drop 8s ease-in-out infinite;animation-delay:calc(var(--i) * 2s - .6s)}
  }
  @keyframes flow-focus{0%,30%,100%{box-shadow:var(--shadow-sm)}8%,22%{box-shadow:0 0 0 2px var(--brand), var(--shadow-md)}}
  @keyframes flow-drop{0%,20%,100%{transform:translateY(0);opacity:.55}8%{transform:translateY(4px);opacity:1}}

  /* ---------- Features ---------- */
  #fm-root .features{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin-top:40px}
  @media (max-width:900px){ #fm-root .features{grid-template-columns:repeat(2,minmax(0,1fr))} }
  @media (max-width:560px){ #fm-root .features{grid-template-columns:minmax(0,1fr);gap:12px} }
  #fm-root .feature{position:relative;background:var(--canvas);border:1px solid var(--line);border-radius:16px;padding:22px;transition:transform .18s ease, box-shadow .18s ease, border-color .18s ease}
  #fm-root .feature:hover{transform:translateY(-2px);box-shadow:var(--shadow-md);border-color:var(--line-strong)}
  @media (hover:none){ #fm-root .feature:hover{transform:none;box-shadow:none;border-color:var(--line)} }
  #fm-root .feature .glyph{width:40px;height:40px;border-radius:11px;background:var(--brand-tint);color:var(--brand);display:flex;align-items:center;justify-content:center;font-family:var(--font-mono);font-weight:700;font-size:12px}
  #fm-root .feature h3{margin-top:16px;font-size:17px;font-weight:800;letter-spacing:-.01em}
  #fm-root .feature p{margin-top:8px;font-size:14px;line-height:1.6;color:var(--ink-muted)}
  #fm-root .soon{position:absolute;top:22px;right:22px;font-size:10.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-muted);background:var(--canvas-2);border:1px solid var(--line);padding:3px 8px;border-radius:99px}

  /* ---------- Trust bar ---------- */
  #fm-root section.trust{padding-block:40px;background:var(--canvas);border-block:1px solid var(--line)}
  #fm-root .trust-row{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:20px}
  @media (max-width:980px){ #fm-root .trust-row{grid-template-columns:repeat(3,minmax(0,1fr));gap:22px 16px} }
  @media (max-width:520px){ #fm-root .trust-row{grid-template-columns:repeat(2,minmax(0,1fr))} }
  #fm-root .trust-row li{display:flex;gap:10px;align-items:flex-start;min-width:0}
  #fm-root .trust-row svg{flex:0 0 auto;color:var(--teal);margin-top:2px}
  #fm-root .trust-row b{display:block;font-size:14px}
  #fm-root .trust-row span{display:block;font-size:12.5px;color:var(--ink-muted);margin-top:2px;line-height:1.4}

  /* ---------- CTA band ---------- */
  #fm-root .final-cta.home h2{text-transform:uppercase;letter-spacing:-.01em}
  #fm-root .final-cta.home .btn{padding:13px 26px;font-size:15px}
`;
