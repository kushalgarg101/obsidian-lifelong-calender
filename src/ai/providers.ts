import type { ChatAnswer, Citation, SourceChunk, TimelineSettings } from "../types";
import { requestUrl } from "obsidian";

interface ProviderResult {
  answer: string;
  citationIds: string[];
}

export async function askProvider(
  settings: TimelineSettings,
  question: string,
  chunks: SourceChunk[]
): Promise<ChatAnswer> {
  if (!settings.aiModel) {
    throw new Error("Configure an AI model in Lifelong Calendar settings.");
  }

  const providerResult = await generateWithProvider(settings, question, chunks);
  const citations = providerResult.citationIds
    .map((id) => chunks.find((chunk) => chunk.id === id))
    .filter((chunk): chunk is SourceChunk => !!chunk)
    .map(toCitation);

  return {
    answer: providerResult.answer,
    citations
  };
}

async function generateWithProvider(
  settings: TimelineSettings,
  question: string,
  chunks: SourceChunk[]
): Promise<ProviderResult> {
  switch (settings.aiProvider) {
    case "gemini":
      return askGemini(settings, question, chunks);
    case "ollama":
      return askOllama(settings, question, chunks);
    case "groq":
    case "openai":
    case "custom": {
      return askOpenAICompatible(settings, question, chunks);
    }
    default: {
      const exhaustiveCheck: never = settings.aiProvider;
      throw new Error(`Unsupported provider: ${exhaustiveCheck as string}`);
    }
  }
}

async function askOpenAICompatible(
  settings: TimelineSettings,
  question: string,
  chunks: SourceChunk[]
): Promise<ProviderResult> {
  const baseUrl = settings.aiBaseUrl || defaultBaseUrl(settings.aiProvider);
  const response = await requestUrl({
    url: `${baseUrl}/chat/completions`,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.aiApiKey}`
    },
    body: JSON.stringify({
      model: settings.aiModel,
      temperature: 0.2,
      response_format: {
        type: "json_object"
      },
      messages: buildMessages(question, chunks)
    })
  });

  if (response.status >= 400) {
    throw new Error(`AI provider error (${response.status}): ${response.text}`);
  }

  const json = response.json as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = json.choices?.[0]?.message?.content ?? "";
  return parseModelResult(content, chunks);
}

async function askGemini(
  settings: TimelineSettings,
  question: string,
  chunks: SourceChunk[]
): Promise<ProviderResult> {
  const baseUrl = settings.aiBaseUrl || "https://generativelanguage.googleapis.com/v1beta";
  const response = await requestUrl({
    url: `${baseUrl}/models/${settings.aiModel}:generateContent?key=${encodeURIComponent(settings.aiApiKey)}`,
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: buildPrompt(question, chunks)
            }
          ]
        }
      ]
    })
  });

  if (response.status >= 400) {
    throw new Error(`Gemini error (${response.status}): ${response.text}`);
  }

  const json = response.json as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const content = json.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
  return parseModelResult(content, chunks);
}

async function askOllama(
  settings: TimelineSettings,
  question: string,
  chunks: SourceChunk[]
): Promise<ProviderResult> {
  const baseUrl = settings.aiBaseUrl || "http://localhost:11434";
  const response = await requestUrl({
    url: `${baseUrl}/api/generate`,
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: settings.aiModel,
      prompt: buildPrompt(question, chunks),
      stream: false
    })
  });

  if (response.status >= 400) {
    throw new Error(`Ollama error (${response.status}): ${response.text}`);
  }

  const json = response.json as { response?: string };
  return parseModelResult(json.response ?? "", chunks);
}

function buildMessages(question: string, chunks: SourceChunk[]): Array<{ role: string; content: string }> {
  return [
    {
      role: "system",
      content: "You answer questions about the user's lifelong calendar and linked notes. Use only the provided sources. Reply as JSON with keys answer and citationIds."
    },
    {
      role: "user",
      content: buildPrompt(question, chunks)
    }
  ];
}

function buildPrompt(question: string, chunks: SourceChunk[]): string {
  const sourceText = chunks.map((chunk, index) => {
    return [
      `Source ${index + 1}`,
      `id: ${chunk.id}`,
      `type: ${chunk.sourceType}`,
      `title: ${chunk.sourceTitle}`,
      chunk.sourceDate ? `date: ${chunk.sourceDate}` : "",
      `path: ${chunk.sourceFilePath}`,
      `excerpt: ${chunk.excerpt}`,
      `text: ${chunk.text.slice(0, 1800)}`
    ]
      .filter(Boolean)
      .join("\n");
  }).join("\n\n");

  return [
    "Question:",
    question,
    "",
    "Sources:",
    sourceText,
    "",
    'Return JSON like {"answer":"...","citationIds":["entry:1","note:path"]}.'
  ].join("\n");
}

function parseModelResult(content: string, chunks: SourceChunk[]): ProviderResult {
  try {
    const parsed = JSON.parse(extractJsonObject(content)) as {
      answer?: string;
      citationIds?: string[];
    };

    return {
      answer: parsed.answer?.trim() || "I could not produce a grounded answer.",
      citationIds: (parsed.citationIds ?? []).filter((id) => chunks.some((chunk) => chunk.id === id))
    };
  } catch {
    return {
      answer: content.trim() || "I could not produce a grounded answer.",
      citationIds: []
    };
  }
}

function extractJsonObject(value: string): string {
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON object found in provider response.");
  }

  return value.slice(start, end + 1);
}

function toCitation(chunk: SourceChunk): Citation {
  return {
    id: chunk.id,
    sourceType: chunk.sourceType,
    sourceFilePath: chunk.sourceFilePath,
    sourceTitle: chunk.sourceTitle,
    sourceDate: chunk.sourceDate,
    excerpt: chunk.excerpt
  };
}

function defaultBaseUrl(provider: TimelineSettings["aiProvider"]): string {
  switch (provider) {
    case "openai":
      return "https://api.openai.com/v1";
    case "groq":
      return "https://api.groq.com/openai/v1";
    case "custom":
      throw new Error("Set a base URL for the custom provider.");
    default:
      return "";
  }
}
