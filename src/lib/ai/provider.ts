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

/** Superset of AiVisionParams: also accepts application/pdf, for the
 *  Customer File Intelligence pipeline (src/lib/ai/customer-extraction.ts),
 *  which needs to read PDFs as well as photos/scans. Kept as a separate
 *  method from completeWithImage() rather than widening that one, so the
 *  existing expense-extraction call site (src/lib/ai/extraction.ts) is
 *  untouched. */
export interface AiFileParams {
  system: string;
  prompt: string;
  fileBase64: string;
  mimeType: string;
  maxTokens?: number;
}

export interface AiProvider {
  readonly name: string;
  complete(params: AiCompletionParams): Promise<string>;
  completeWithImage(params: AiVisionParams): Promise<string>;
  completeWithFile(params: AiFileParams): Promise<string>;
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

  /**
   * Reads either an image or a PDF and returns the model's raw text
   * response. PDFs use Anthropic's "document" content block (still gated
   * behind the pdfs-2024-09-25 beta header at the time this was written) —
   * everything else (image/png, image/jpeg, image/webp, image/gif) uses
   * the same "image" block completeWithImage() uses.
   */
  async completeWithFile({ system, prompt, fileBase64, mimeType, maxTokens = 1024 }: AiFileParams): Promise<string> {
    const isPdf = mimeType === "application/pdf";
    const block = isPdf
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: fileBase64 } }
      : { type: "image", source: { type: "base64", media_type: mimeType, data: fileBase64 } };

    return this.call(
      system,
      [{ role: "user", content: [block, { type: "text", text: prompt }] }],
      maxTokens,
      isPdf ? { "anthropic-beta": "pdfs-2024-09-25" } : undefined
    );
  }

  private async call(system: string, messages: unknown[], maxTokens: number, extraHeaders?: Record<string, string>): Promise<string> {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        ...extraHeaders,
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
