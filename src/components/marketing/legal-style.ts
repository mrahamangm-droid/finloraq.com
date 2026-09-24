// Prose typography for long-form legal content (Privacy Policy, Terms of
// Service). Deliberately separate from MARKETING_BASE_STYLE — those tokens
// (colors, buttons, .hero, .sec-head, footer) still apply since both style
// strings are injected together on these pages, but a page of numbered
// legal clauses needs heading/paragraph/list rules that no landing page
// needed before. Scoped under #fm-root .legal-prose so nothing here can
// leak into the rest of the app.
export const LEGAL_PAGE_STYLE = `
  #fm-root .legal-shell{ padding-block:56px 88px; }
  #fm-root .legal-shell .wrap{ max-width:820px; }
  #fm-root .legal-meta{
    font-size:13.5px; color:var(--ink-subtle); margin-top:10px;
  }
  #fm-root .legal-toc{
    margin-top:28px; padding:18px 20px; background:var(--canvas-2);
    border:1px solid var(--line); border-radius:var(--r-lg);
  }
  #fm-root .legal-toc h2{
    font-size:12px; text-transform:uppercase; letter-spacing:.06em;
    font-weight:800; color:var(--ink-subtle); margin:0 0 10px;
  }
  #fm-root .legal-toc ol{ margin:0; padding-left:20px; columns:2; column-gap:24px; }
  #fm-root .legal-toc li{ font-size:13.5px; line-height:1.9; break-inside:avoid; }
  #fm-root .legal-toc a{ color:var(--ink-muted); text-decoration:none; }
  #fm-root .legal-toc a:hover{ color:var(--brand); text-decoration:underline; }
  @media (max-width:640px){ #fm-root .legal-toc ol{ columns:1; } }

  #fm-root .legal-prose{ margin-top:40px; font-size:15.5px; line-height:1.75; color:var(--ink); }
  #fm-root .legal-prose section{ padding-block:26px; border-top:1px solid var(--line); scroll-margin-top:24px; }
  #fm-root .legal-prose section:first-child{ border-top:none; padding-top:0; }
  #fm-root .legal-prose h2{
    font-size:19px; font-weight:800; letter-spacing:-.01em; color:var(--ink);
    display:flex; align-items:baseline; gap:10px;
  }
  #fm-root .legal-prose h2 .num{ color:var(--brand); font-variant-numeric:tabular-nums; }
  #fm-root .legal-prose h3{ font-size:15.5px; font-weight:700; margin-top:20px; }
  #fm-root .legal-prose p{ margin-top:12px; color:var(--ink-muted); }
  #fm-root .legal-prose p:first-of-type{ margin-top:14px; }
  #fm-root .legal-prose ul, #fm-root .legal-prose ol{ margin-top:12px; padding-left:22px; color:var(--ink-muted); }
  #fm-root .legal-prose li{ margin-top:8px; line-height:1.7; }
  #fm-root .legal-prose li::marker{ color:var(--ink-subtle); }
  #fm-root .legal-prose strong{ color:var(--ink); font-weight:700; }
  #fm-root .legal-prose a{ color:var(--brand); text-decoration:underline; text-underline-offset:2px; }
  #fm-root .legal-prose table{ width:100%; margin-top:16px; border-collapse:collapse; font-size:14px; }
  #fm-root .legal-prose th, #fm-root .legal-prose td{
    text-align:left; padding:10px 12px; border:1px solid var(--line); vertical-align:top;
  }
  #fm-root .legal-prose th{ background:var(--canvas-2); font-weight:700; color:var(--ink); }
  #fm-root .legal-prose td{ color:var(--ink-muted); }

  #fm-root .legal-callout{
    margin-top:16px; padding:14px 16px; border-radius:var(--r-md);
    background:var(--brand-tint); border:1px solid var(--line);
    font-size:13.5px; color:var(--ink-muted); line-height:1.65;
  }
  #fm-root .legal-callout strong{ color:var(--ink); }
`;
