/**
 * Provider-agnostic AI abstraction (spec section 7: "Create an AI
 * abstraction layer so multiple AI providers can be used later"). Callers
 * never talk to Anthropic/OpenAI SDKs directly — they call complete()
 * here, so swapping or adding a provider is a change in this one file.
 *
 * Deliberately minimal: a single text-completion call plus an optional
 * vision call for document extraction. No tool-calling loop, no
 * conversation memory — the copilot (src/lib/ai/copilot.ts) does its own
 * "fetch real data, then ask the model to phrase it" orchestration rather
 * than letting the model call tools freely, which is what makes "AI must
 * never invent financial figures" enforceable by construction rather than
 * by prompt instruction alone.
 */

export interface AiCompletionParams {
  system: string;
  prompt: string;
  maxTokens?: number;
}

export interface AiVisionParams {
  system: string;
  prompt: string;
  imageBase64: string;
  mimeType: string;
  maxTokens?: number;
}

export interface AiProvider {
  readonly name: string;
  complete(params: AiCompletionParams): Promise<string>;
  completeWithImage(params: AiVisionParams): Promise<string>;
}

export class AiNotConfiguredError extends Error {
  constructor() {
    super("No AI provider is configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY in your environment.");
    this.name = "AiNotConfiguredError";
  }
}

class AnthropicProvider implements AiProvider {
  readonly name = "anthropic";
  constructor(private apiKey: string, private model = "claude-sonnet-4-5") {}

  async complete({ system, prompt, maxTokens = 1024 }: AiCompletionParams): Promise<string> {
    return this.call(system, [{ role: "user", content: prompt }], maxTokens);
  }

  async completeWithImage({ system, prompt, imageBase64, mimeType, maxTokens = 1024 }: AiVisionParams): Promise<string> {
    return this.call(
      system,
      [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mimeType, data: imageBase64 } },
            { type: "text", text: prompt },
          ],
        },
      ],
      maxTokens
    );
  }

  private async call(system: string, messages: unknown[], maxTokens: number): Promise<string> {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ model: this.model, max_tokens: maxTokens, system, messages }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Anthropic API error ${res.status}: ${body.slice(0, 500)}`);
    }

    const data = (await res.json()) as { content: { type: string; text?: string }[] };
    const text = data.content.find((b) => b.type === "text")?.text;
    if (!text) throw new Error("Anthropic API returned no text content.");
    return text;
  }
}

let cachedProvider: AiProvider | null | undefined;

/** Returns null (not a throw) when unconfigured, so callers can fall back
 *  to deterministic behavior instead of erroring the whole feature out. */
export function getAiProvider(): AiProvider | null {
  if (cachedProvider !== undefined) return cachedProvider;

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    cachedProvider = new AnthropicProvider(anthropicKey);
    return cachedProvider;
  }

  // TODO(Phase 6 follow-up): an OpenAiProvider implementing the same
  // interface when OPENAI_API_KEY is set and AI_PROVIDER=openai.

  cachedProvider = null;
  return null;
}
