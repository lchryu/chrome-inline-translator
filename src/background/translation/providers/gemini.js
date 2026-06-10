const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash-lite";
const FALLBACK_GEMINI_MODELS = ["gemini-2.5-flash-lite", "gemini-2.5-flash"];
const RETRYABLE_STATUSES = new Set(["UNAVAILABLE", "RESOURCE_EXHAUSTED", "ABORTED", "DEADLINE_EXCEEDED"]);

export async function translateWithGemini({ action = "translate", text, translatedText, pageTitle, settings }) {
  if (!settings.geminiApiKey) {
    throw new Error("Missing Gemini API key.");
  }

  const models = buildModelFallbacks(settings.geminiModel);
  const requestBody = buildGeminiRequestBody({ action, text, translatedText, pageTitle, settings });
  const payload = await callGeminiWithFallbacks({
    apiKey: settings.geminiApiKey,
    models,
    requestBody
  });

  const outputText = extractGeminiText(payload);

  if (!outputText) {
    throw new Error("Gemini returned an empty response.");
  }

  if (action !== "translate") {
    return {
      action,
      provider: "gemini",
      model: payload.modelUsed,
      outputText
    };
  }

  return {
    provider: "gemini",
    model: payload.modelUsed,
    sourceLanguage: settings.sourceLanguage,
    targetLanguage: settings.targetLanguage,
    translatedText: outputText
  };
}

function buildModelFallbacks(preferredModel) {
  const normalizedPreferred = normalizeGeminiModel(preferredModel);
  return [...new Set([normalizedPreferred, ...FALLBACK_GEMINI_MODELS])];
}

function normalizeGeminiModel(model) {
  const normalized = String(model ?? "").trim();
  return normalized && normalized !== "gemini-2.5-flash" ? normalized : DEFAULT_GEMINI_MODEL;
}

function buildGeminiRequestBody({ action, text, translatedText, pageTitle, settings }) {
  return {
    contents: [
      {
        role: "user",
        parts: [
          {
            text: [
              buildGeminiInstruction(action, settings),
              pageTitle ? `Page title: ${pageTitle}.` : "",
              translatedText ? `Current translation: ${translatedText}` : "",
              "Selected text:",
              text
            ].filter(Boolean).join("\n")
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.1
    }
  };
}

async function callGeminiWithFallbacks({ apiKey, models, requestBody }) {
  let lastError = null;

  for (const model of models) {
    for (const delayMs of [0, 500, 1400]) {
      if (delayMs > 0) {
        await wait(delayMs);
      }

      try {
        const payload = await callGemini({ apiKey, model, requestBody });
        return {
          ...payload,
          modelUsed: model
        };
      } catch (error) {
        lastError = error;

        if (!isRetryableGeminiError(error)) {
          throw error;
        }
      }
    }
  }

  throw new Error(
    lastError?.geminiStatus === "UNAVAILABLE"
      ? "Gemini is busy right now. The extension retried and tried fallback models, but the API is still unavailable. Please try again shortly."
      : lastError?.message ?? "Gemini is unavailable right now."
  );
}

async function callGemini({ apiKey, model, requestBody }) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    throw await buildGeminiError(response);
  }

  return response.json();
}

function buildGeminiInstruction(action, settings) {
  const targetLanguage = settings.targetLanguage || "vi";
  const sourceLanguage = settings.sourceLanguage || "auto";
  const instructions = {
    explain: [
      "Explain the selected webpage text clearly for a language learner.",
      `Use ${targetLanguage}.`,
      "Keep the answer compact and practical."
    ],
    summarize: [
      "Summarize the selected webpage text.",
      `Use ${targetLanguage}.`,
      "Keep the answer concise."
    ],
    grammar: [
      "Analyze the grammar of the selected text.",
      `Use ${targetLanguage}.`,
      "Focus on sentence structure, important phrases, and why the sentence means what it means."
    ],
    phrases: [
      "Extract important vocabulary, idioms, and useful phrases from the selected text.",
      `Use ${targetLanguage}.`,
      "Give short meanings and keep the answer easy to scan."
    ],
    rewrite: [
      "Rewrite the selected text in simpler language while preserving the meaning.",
      `Use ${sourceLanguage === "auto" ? "the original language" : sourceLanguage}.`,
      "Return only the rewritten text."
    ],
    translate: [
      "Translate the selected webpage text naturally.",
      "Return only the translated text, with no explanation.",
      `Target language: ${targetLanguage}.`,
      `Source language: ${sourceLanguage}.`
    ]
  };

  return (instructions[action] ?? instructions.translate).join(" ");
}

function extractGeminiText(payload) {
  return payload.candidates
    ?.flatMap((candidate) => candidate.content?.parts ?? [])
    ?.map((part) => part.text ?? "")
    ?.join("")
    ?.trim();
}

async function buildGeminiError(response) {
  const fallback = `Gemini translation failed with HTTP ${response.status}.`;

  try {
    const payload = await response.json();
    const message = payload?.error?.message;
    const status = payload?.error?.status;
    const detail = [message, status].filter(Boolean).join(" ");
    const error = new Error(detail ? `Gemini: ${detail}` : fallback);
    error.geminiStatus = status;
    error.httpStatus = response.status;

    return error;
  } catch {
    const error = new Error(fallback);
    error.httpStatus = response.status;
    return error;
  }
}

function isRetryableGeminiError(error) {
  return RETRYABLE_STATUSES.has(error?.geminiStatus) || [429, 500, 502, 503, 504].includes(error?.httpStatus);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
