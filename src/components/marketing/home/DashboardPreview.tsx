"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { DEMO, projectedCash90, type PreviewTab } from "./demo-data";

// The hero's live product preview: a small, working slice of the Finloraq UI
// running on clearly labelled demo data. Everything is rendered as real DOM
// (text, tables, inline SVG) so it stays sharp, accessible and theme-aware,
// and nothing here talks to a server or touches real records.

const TABS: { id: PreviewTab; label: string }[] = [
  { id: "pulse", label: "Business Pulse" },
  { id: "cash", label: "Cash forecast" },
  { id: "invoices", label: "Invoices" },
  { id: "copilot", label: "AI Copilot" },
  { id: "whatif", label: "What-If" },
];

const money = (n: number) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");

export function DashboardPreview() {
  const [tab, setTab] = useState<PreviewTab>("pulse");
  const baseId = useId();
  const tabRefs = useRef<Record<PreviewTab, HTMLButtonElement | null>>({
    pulse: null, cash: null, invoices: null, copilot: null, whatif: null,
  });

  // Deep links from the old homepage: /#pricing and /#faq now live on
  // /pricing; /#whatif and /#pulse open the matching preview tab.
  useEffect(() => {
    const h = window.location.hash;
    if (h === "#pricing" || h === "#faq") {
      window.location.replace(h === "#faq" ? "/pricing#faq" : "/pricing");
    } else if (h === "#whatif" || h === "#whatif-full") {
      setTab("whatif");
    }
  }, []);

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const delta = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!delta && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const next = e.key === "Home" ? 0 : e.key === "End" ? TABS.length - 1 : (i + delta + TABS.length) % TABS.length;
    const id = TABS[next]!.id;
    setTab(id);
    tabRefs.current[id]?.focus();
  };

  return (
    <div className="dp" id="demo">
      <div className="dp-bar">
        <span className="dp-dots" aria-hidden="true"><i /><i /><i /></span>
        <span className="dp-title">Demo Company</span>
        <span className="dp-badge">Demo data</span>
      </div>
      <div className="dp-body">
        <div className="dp-tabs" role="tablist" aria-label="Product preview">
          {TABS.map((t, i) => (
            <button
              key={t.id}
              ref={(el) => { tabRefs.current[t.id] = el; }}
              role="tab"
              type="button"
              id={`${baseId}-tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`${baseId}-panel-${t.id}`}
              tabIndex={tab === t.id ? 0 : -1}
              className="dp-tab"
              onClick={() => setTab(t.id)}
              onKeyDown={(e) => onTabKey(e, i)}
            >
              {t.label}
            </button>
          ))}
        </div>
        {/* Every panel is rendered into the same grid cell, so the frame is
            always as tall as the tallest panel and switching tabs never makes
            the page jump. Inactive panels are invisible and inert (out of the
            tab order and the accessibility tree). */}
        <div className="dp-panels">
          {TABS.map((t) => (
            <div
              key={t.id}
              className="dp-panel"
              role="tabpanel"
              id={`${baseId}-panel-${t.id}`}
              aria-labelledby={`${baseId}-tab-${t.id}`}
              data-active={tab === t.id}
              inert={tab !== t.id}
            >
              {t.id === "pulse" && <PulsePanel go={setTab} />}
              {t.id === "cash" && <CashPanel />}
              {t.id === "invoices" && <InvoicesPanel />}
              {t.id === "copilot" && <CopilotPanel />}
              {t.id === "whatif" && <WhatIfPanel />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PulsePanel({ go }: { go: (t: PreviewTab) => void }) {
  const max = Math.max(...DEMO.revenueByMonth.map((m) => m.value));
  return (
    <>
      <div className="dp-kpis">
        {DEMO.kpis.map((k) => (
          <div className="dp-kpi" key={k.label}>
            <div className="dp-kpi-l">{k.label}</div>
            <div className="dp-kpi-v num">{money(k.value)}</div>
            <div className={`dp-kpi-d ${k.trend}`}>{k.delta}</div>
          </div>
        ))}
      </div>
      <div className="dp-split">
        <div className="dp-card dp-chart-card">
          <div className="dp-card-h">Revenue, last 6 months</div>
          <svg className="dp-chart" viewBox="0 0 240 90" role="img" aria-label={`Revenue by month: ${DEMO.revenueByMonth.map((m) => `${m.month} ${money(m.value)}`).join(", ")}`}>
            {DEMO.revenueByMonth.map((m, i) => {
              const h = Math.round((m.value / max) * 64);
              return (
                <g key={m.month}>
                  <rect x={8 + i * 39} y={72 - h} width="24" height={h} rx="4" className={i === DEMO.revenueByMonth.length - 1 ? "bar now" : "bar"} />
                  <text x={20 + i * 39} y="86" textAnchor="middle" className="axis">{m.month}</text>
                </g>
              );
            })}
          </svg>
        </div>
        <div className="dp-card">
          <div className="dp-card-h">Needs you today</div>
          <ul className="dp-todo">
            {DEMO.todos.map((t) => (
              <li key={t.text}>
                <span>{t.text}</span>
                <button type="button" className="dp-link" onClick={() => go(t.tab)}>{t.cta}</button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}

function CashPanel() {
  const max = Math.max(DEMO.cashToday, ...DEMO.forecast.map((f) => f.cash));
  const rows = [{ label: "Today", cash: DEMO.cashToday }, ...DEMO.forecast.map((f) => ({ label: `In ${f.days} days`, cash: f.cash }))];
  return (
    <div className="dp-card">
      <div className="dp-card-h">Projected cash from open invoices and bills</div>
      <ul className="dp-bars">
        {rows.map((r) => (
          <li key={r.label}>
            <span className="dp-bars-l">{r.label}</span>
            <span className="dp-bars-t"><span style={{ width: `${Math.max(4, (r.cash / max) * 100)}%` }} /></span>
            <span className="dp-bars-v num">{money(r.cash)}</span>
          </li>
        ))}
      </ul>
      <p className="dp-note">Lowest point is in about 30 days, when supplier payments and payroll land before Customer ABC pays.</p>
    </div>
  );
}

function InvoicesPanel() {
  return (
    <div className="dp-card dp-scroll">
      <table className="dp-table">
        <thead>
          <tr><th>No.</th><th>Customer</th><th>Due</th><th className="r">Amount</th><th>Status</th></tr>
        </thead>
        <tbody>
          {DEMO.invoices.map((inv) => (
            <tr key={inv.no}>
              <td className="num">{inv.no}</td>
              <td>{inv.customer}</td>
              <td>{inv.due}</td>
              <td className="num r">{money(inv.amount)}</td>
              <td><span className={`dp-pill ${inv.status}`}>{inv.status === "overdue" ? "Overdue" : inv.status === "paid" ? "Paid" : "Sent"}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CopilotPanel() {
  const [log, setLog] = useState<{ q: string; a: string }[]>([]);
  return (
    <div className="dp-card">
      <div className="dp-chips">
        {DEMO.copilot.map((c) => (
          <button key={c.q} type="button" className="dp-chip" onClick={() => setLog((l) => [...l.slice(-1), c])}>
            {c.q}
          </button>
        ))}
      </div>
      <div className="dp-chat" aria-live="polite">
        {log.length === 0 && <p className="dp-msg ai">Ask about Demo Company&apos;s books. Pick a question above.</p>}
        {log.map((m, i) => (
          <div key={i} className="dp-pair">
            <p className="dp-msg me">{m.q}</p>
            <p className="dp-msg ai">{m.a}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function WhatIfPanel() {
  const [sales, setSales] = useState(-10);
  const [delay, setDelay] = useState(10);
  const projected = projectedCash90(sales, delay);
  const change = projected - DEMO.forecast[2].cash;
  return (
    <div className="dp-card">
      <div className="dp-whatif">
        <label className="dp-slider">
          <span>Sales change <b className="num">{sales > 0 ? "+" : ""}{sales}%</b></span>
          <input type="range" min={-50} max={30} step={5} value={sales} onChange={(e) => setSales(Number(e.target.value))} />
        </label>
        <label className="dp-slider">
          <span>Customers pay later by <b className="num">{delay} days</b></span>
          <input type="range" min={0} max={45} step={5} value={delay} onChange={(e) => setDelay(Number(e.target.value))} />
        </label>
      </div>
      <div className="dp-result">
        <div>
          <div className="dp-kpi-l">Cash in 90 days</div>
          <div className={`dp-result-v num ${projected < 0 ? "down" : ""}`}>{money(projected)}</div>
        </div>
        <div>
          <div className="dp-kpi-l">Versus forecast</div>
          <div className={`dp-result-v num ${change < 0 ? "down" : "up"}`}>{change >= 0 ? "+" : ""}{money(change)}</div>
        </div>
      </div>
      <p className="dp-note">Preview simulation on demo numbers. It never changes accounting records.</p>
    </div>
  );
}
