export interface Embedder {
  /** Embedding dimension — must match the vector(N) column. */
  readonly dim: number;
  /** Embeds a batch of texts; returns one vector per input, same order. */
  embed(texts: string[]): Promise<number[][]>;
}

/**
 * OpenAI text-embedding-3-small via plain fetch — no SDK dependency.
 * Cost at Verdict's volume (a handful of records/week) is effectively zero.
 */
export class OpenAIEmbedder implements Embedder {
  readonly dim = 1536;
  private readonly model = "text-embedding-3-small";

  constructor(private readonly apiKey = process.env.OPENAI_API_KEY) {}

  async embed(texts: string[]): Promise<number[][]> {
    if (!this.apiKey) throw new Error("OPENAI_API_KEY is not set");
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: this.model, input: texts }),
    });
    if (!res.ok) {
      throw new Error(`embedding request failed: ${res.status} ${await res.text()}`);
    }
    const body = (await res.json()) as { data: { index: number; embedding: number[] }[] };
    return body.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
  }
}
