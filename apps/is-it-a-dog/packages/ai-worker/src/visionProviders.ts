// A pluggable vision backend. Swap providers without touching the worker's
// HTTP layer or the game server.
export interface VisionProvider {
  readonly name: string;
  guess(pngBase64: string): Promise<string>;
}

const PROMPT =
  "This is a doodle from a Pictionary-style game. In ONE lowercase word, " +
  "what is the single object being drawn? Reply with only that word, no punctuation.";

const COMMON = [
  "cat", "dog", "house", "tree", "car", "sun", "fish", "star", "boat",
  "flower", "apple", "bird", "face", "heart", "cloud",
];

// Used when no API key is configured — lets the whole stack run end-to-end
// in dev. It can't be "correct" (it never sees the word), but it proves the
// pipeline: ops -> PNG -> provider -> guess -> chat.
export class MockProvider implements VisionProvider {
  readonly name = "mock";
  async guess(_pngBase64: string): Promise<string> {
    return COMMON[Math.floor(Math.random() * COMMON.length)];
  }
}

export class OpenAIProvider implements VisionProvider {
  readonly name = "openai";
  constructor(
    private apiKey: string,
    private model = process.env.OPENAI_MODEL ?? "gpt-4o-mini"
  ) {}

  async guess(pngBase64: string): Promise<string> {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 10,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: PROMPT },
              {
                type: "image_url",
                image_url: { url: `data:image/png;base64,${pngBase64}` },
              },
            ],
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as any;
    return normalize(data.choices?.[0]?.message?.content ?? "");
  }
}

export class AnthropicProvider implements VisionProvider {
  readonly name = "anthropic";
  constructor(
    private apiKey: string,
    private model = process.env.ANTHROPIC_MODEL ?? "claude-3-5-haiku-latest"
  ) {}

  async guess(pngBase64: string): Promise<string> {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 10,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: "image/png",
                  data: pngBase64,
                },
              },
              { type: "text", text: PROMPT },
            ],
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as any;
    return normalize(data.content?.[0]?.text ?? "");
  }
}

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z\s]/g, "").split(/\s+/)[0] ?? "";
}

// Pick a provider: explicit env override, else first available key, else mock.
export function selectProvider(): VisionProvider {
  const pick = process.env.VISION_PROVIDER?.toLowerCase();
  const openaiKey = process.env.OPENAI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (pick === "openai" && openaiKey) return new OpenAIProvider(openaiKey);
  if (pick === "anthropic" && anthropicKey)
    return new AnthropicProvider(anthropicKey);
  if (pick === "mock") return new MockProvider();

  if (openaiKey) return new OpenAIProvider(openaiKey);
  if (anthropicKey) return new AnthropicProvider(anthropicKey);
  return new MockProvider();
}
