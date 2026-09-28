import type { CSSProperties } from "react";
import { FLOW_STAGES } from "./home-content";

// The "How it works" flow: four stages stacked top to bottom, joined by
// down-arrows. Server-rendered, no JavaScript. The only motion is a highlight
// that steps through the stages and a dot travelling down each connector,
// both pure CSS (see .flow-* in home-style.ts) and switched off entirely under
// prefers-reduced-motion. It replaces the old WebGL walkthrough.
export function HowItWorksFlow() {
  return (
    <ol className="flow" aria-label="How Finloraq works">
      {FLOW_STAGES.map((stage, i) => (
        <li key={stage.id} className={`flow-stage flow-${stage.id}`} style={{ "--i": i } as CSSProperties}>
          {i > 0 && (
            <span className="flow-arrow" aria-hidden="true">
              <svg width="16" height="28" viewBox="0 0 16 28" fill="none">
                <path d="M8 1v24M2 19l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          )}
          <div className="flow-card">
            <h3 className="flow-title">
              <span className="flow-n num">{String(i + 1).padStart(2, "0")}</span>
              {stage.title}
            </h3>
            <ul className="flow-items">
              {stage.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </li>
      ))}
    </ol>
  );
}
