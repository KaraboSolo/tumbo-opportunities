// Gemini REST client: structured JSON generation and embeddings, with usage logging.
import { adminClient, env } from "./http.ts";

const API = "https://generativelanguage.googleapis.com/v1beta";

export const models = {
  parse: () => env("GEMINI_MODEL_PARSE", "gemini-3.5-flash-lite"),
  rerank: () => env("GEMINI_MODEL_RERANK", "gemini-3.8-flash"),
  embed: () => env("GEMINI_MODEL_EMBED", "gemini-embedding-2"),
};

const EMBED_DIM = Number(Deno.env.get("GEMINI_EMBED_DIM") ?? 768);

type Part = { text: string } | { inlineData: { mimeType: string; data: string } };

interface GenerateOptions<T> {
  functionName: string;
  model: string;
  system: string;
  parts: Part[];
  schema: Record<string, unknown>;
  validate: (value: unknown) => value is T;
  temperature?: number;
  maxOutputTokens?: number;
  userId?: string | null;
}

function thinkingConfig(): Record<string, unknown> | undefined {
  const level = Deno.env.get("GEMINI_THINKING_LEVEL");
  const budget = Deno.env.get("GEMINI_THINKING_BUDGET");
  if (level) return { thinkingLevel: level };
  if (budget !== undefined && budget !== "") return { thinkingBudget: Number(budget) };
  return undefined;
}

async function logUsage(functionName: string, model: string, input: number, output: number, userId?: string | null) {
  const { error } = await adminClient().from("llm_usage").insert({
    function_name: functionName,
    model,
    input_tokens: input,
    output_tokens: output,
    user_id: userId ?? null,
  });
  if (error) console.error(`llm_usage insert failed: ${error.message}`);
}

/**
 * Calls Gemini with structured output, validates the JSON, and retries once on
 * an invalid response.
 */
export async function generateJson<T>(opts: GenerateOptions<T>): Promise<T> {
  const body = {
    systemInstruction: { parts: [{ text: opts.system }] },
    contents: [{ role: "user", parts: opts.parts }],
    generationConfig: {
      temperature: opts.temperature ?? 0.1,
      ...(opts.maxOutputTokens ? { maxOutputTokens: opts.maxOutputTokens } : {}),
      responseMimeType: "application/json",
      responseSchema: opts.schema,
      ...(thinkingConfig() ? { thinkingConfig: thinkingConfig() } : {}),
    },
  };

  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`${API}/models/${opts.model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": env("GEMINI_API_KEY") },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      lastError = `Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`;
      if (res.status >= 500 || res.status === 429) continue;
      throw new Error(lastError);
    }
    const data = await res.json();
    const usage = data.usageMetadata ?? {};
    await logUsage(
      opts.functionName,
      opts.model,
      usage.promptTokenCount ?? 0,
      (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0),
      opts.userId,
    );
    const text: string | undefined = data.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p.text ?? "")
      .join("");
    try {
      const parsed = JSON.parse(text ?? "");
      if (opts.validate(parsed)) return parsed;
      lastError = "Gemini response did not match the schema";
    } catch {
      lastError = "Gemini response was not valid JSON";
    }
  }
  throw new Error(lastError);
}

/** Embeds up to 100 texts in one call. */
export async function embedTexts(
  texts: string[],
  taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY",
  functionName: string,
  userId?: string | null,
): Promise<number[][]> {
  if (texts.length === 0) return [];
  const model = models.embed();
  const res = await fetch(`${API}/models/${model}:batchEmbedContents`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": env("GEMINI_API_KEY") },
    body: JSON.stringify({
      requests: texts.map((text) => ({
        model: `models/${model}`,
        content: { parts: [{ text }] },
        taskType,
        outputDimensionality: EMBED_DIM,
      })),
    }),
  });
  if (!res.ok) throw new Error(`Gemini embed ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const vectors: number[][] = (data.embeddings ?? []).map((e: { values: number[] }) => e.values);
  if (vectors.length !== texts.length || vectors.some((v) => v.length !== EMBED_DIM)) {
    throw new Error("Gemini embed returned an unexpected shape");
  }
  // The batch endpoint does not report tokens; log an estimate (about 4 characters per token).
  const estimate = Math.round(texts.reduce((n, t) => n + t.length, 0) / 4);
  await logUsage(functionName, model, estimate, 0, userId);
  return vectors;
}

/** pgvector literal for inserts through PostgREST. */
export const toVector = (v: number[]) => `[${v.join(",")}]`;
