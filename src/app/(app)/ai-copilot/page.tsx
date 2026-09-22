"use client";

import { useState } from "react";
import { Bot, Send } from "lucide-react";

type Turn = { question: string; answer: string; aiPhrased: boolean };

const EXAMPLES = [
  "Show my overdue customers",
  "How much VAT do I owe?",
  "Which customers are paying late?",
  "What are my largest expenses?",
  "Forecast my cash balance for the next 90 days",
  "Find duplicate supplier invoices",
  "Explain this month's P&L",
  "Why did profit decrease this month?",
];

export default function AiCopilotPage() {
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask(q: string) {
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    const res = await fetch("/api/ai/copilot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: q }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong.");
      return;
    }
    const data = await res.json();
    setTurns((prev) => [...prev, { question: q, answer: data.answer, aiPhrased: data.aiPhrased }]);
    setQuestion("");
  }

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Finloraq AI Copilot</h1>
        <p className="text-sm text-muted-foreground">
          Answers are computed from your own posted ledger data — the model, when configured,
          only phrases the numbers, it never invents them.
        </p>
      </div>

      {turns.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-4">
          <div className="mb-2 text-sm font-medium text-foreground">Try asking:</div>
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((e) => (
              <button key={e} onClick={() => ask(e)} className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-muted">
                {e}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 space-y-4 overflow-y-auto">
        {turns.map((t, i) => (
          <div key={i} className="space-y-2">
            <div className="ml-auto max-w-[80%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">{t.question}</div>
            <div className="flex max-w-[80%] items-start gap-2">
              <Bot className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-card-foreground">
                {t.answer}
                {!t.aiPhrased && (
                  <div className="mt-1 text-xs text-muted-foreground">(no AI provider configured — templated answer)</div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <form
        onSubmit={(e) => { e.preventDefault(); ask(question); }}
        className="flex gap-2 border-t border-border pt-4"
      >
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask about your finances…"
          className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
        <button type="submit" disabled={loading} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
