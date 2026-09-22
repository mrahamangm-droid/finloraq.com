"use client";

import { useState } from "react";
import { Bot, Send, Mic, Check, X } from "lucide-react";

type Turn = { question: string; answer: string; aiPhrased: boolean };

type VoiceResult =
  | { type: "query"; question: string; answer: string }
  | { type: "action_proposed"; action: "draft_expense"; description: string; amount: number; summary: string }
  | { type: "unrecognized"; message: string };

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

const VOICE_EXAMPLES = [
  "How much cash do we have?",
  "Draft an expense for AED 250 for office supplies",
];

export default function AiCopilotPage() {
  const [mode, setMode] = useState<"chat" | "voice">("chat");
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [transcript, setTranscript] = useState("");
  const [voiceResult, setVoiceResult] = useState<VoiceResult | null>(null);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<string | null>(null);

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

  async function sendVoiceCommand(t: string) {
    if (!t.trim()) return;
    setVoiceLoading(true);
    setVoiceError(null);
    setVoiceResult(null);
    setConfirmed(null);
    const res = await fetch("/api/voice/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript: t }),
    });
    setVoiceLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setVoiceError(data.error ?? "Something went wrong.");
      return;
    }
    setVoiceResult(await res.json());
  }

  async function confirmProposedAction() {
    if (!voiceResult || voiceResult.type !== "action_proposed") return;
    setVoiceLoading(true);
    setVoiceError(null);
    const res = await fetch("/api/voice/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: voiceResult.action,
        description: voiceResult.description,
        amount: voiceResult.amount,
      }),
    });
    setVoiceLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setVoiceError(data.error ?? "Could not create expense.");
      return;
    }
    setConfirmed("Draft expense created. It still needs approval before it posts to the ledger.");
    setVoiceResult(null);
  }

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Finloraq AI Copilot</h1>
          <p className="text-sm text-muted-foreground">
            Answers are computed from your own posted ledger data — the model, when configured,
            only phrases the numbers, it never invents them.
          </p>
        </div>
        <div className="flex shrink-0 rounded-md border border-border p-1">
          <button
            onClick={() => setMode("chat")}
            className={`rounded px-3 py-1 text-xs font-medium ${mode === "chat" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
          >
            Chat
          </button>
          <button
            onClick={() => setMode("voice")}
            className={`rounded px-3 py-1 text-xs font-medium ${mode === "voice" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
          >
            Voice
          </button>
        </div>
      </div>

      {mode === "voice" && (
        <div className="flex-1 space-y-4">
          <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            No speech-to-text provider is configured in this environment, so type what you would
            say — everything downstream (intent parsing, confirmation) runs exactly as it would
            with real voice input. Queries answer immediately; anything that would change your
            books (like drafting an expense) comes back as a proposal you must confirm below.
          </div>

          <div className="flex flex-wrap gap-2">
            {VOICE_EXAMPLES.map((e) => (
              <button key={e} onClick={() => sendVoiceCommand(e)} className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-muted">
                {e}
              </button>
            ))}
          </div>

          <form
            onSubmit={(e) => { e.preventDefault(); sendVoiceCommand(transcript); }}
            className="flex gap-2"
          >
            <input
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="Type a voice command…"
              className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
            <button type="submit" disabled={voiceLoading} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
              <Mic className="h-4 w-4" />
            </button>
          </form>

          {voiceError && <p className="text-sm text-destructive">{voiceError}</p>}
          {confirmed && (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-card-foreground">
              <Check className="h-4 w-4 text-green-600" /> {confirmed}
            </div>
          )}

          {voiceResult?.type === "query" && (
            <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-card-foreground">
              {voiceResult.answer}
            </div>
          )}

          {voiceResult?.type === "unrecognized" && (
            <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
              {voiceResult.message}
            </div>
          )}

          {voiceResult?.type === "action_proposed" && (
            <div className="space-y-3 rounded-lg border border-amber-400/50 bg-amber-50 px-4 py-3 text-sm dark:bg-amber-950/20">
              <div className="font-medium text-foreground">Confirmation required</div>
              <p className="text-muted-foreground">{voiceResult.summary}</p>
              <div className="flex gap-2">
                <button
                  onClick={confirmProposedAction}
                  disabled={voiceLoading}
                  className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
                >
                  <Check className="h-3 w-3" /> Confirm
                </button>
                <button
                  onClick={() => setVoiceResult(null)}
                  className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground"
                >
                  <X className="h-3 w-3" /> Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {mode === "chat" && turns.length === 0 && (
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

      {mode === "chat" && (
        <>
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
        </>
      )}
    </div>
  );
}
