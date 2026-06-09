export async function translateWithGemini({ action = "translate", text, translatedText, pageTitle, settings }) {
  if (!settings.geminiApiKey) {
    throw new Error("Missing Gemini API key.");
  }

  const model = settings.geminiModel || "gemini-2.5-flash";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(settings.geminiApiKey)}`;

  const response = await fetch(endpoint, {
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
    })
  });

  if (!response.ok) {
    throw new Error(await buildGeminiErrorMessage(response));
  }

  const payload = await response.json();
  const outputText = extractGeminiText(payload);

  if (!outputText) {
    throw new Error("Gemini returned an empty response.");
  }

  if (action !== "translate") {
    return {
      action,
      provider: "gemini",
      outputText
    };
  }

  return {
    provider: "gemini",
    sourceLanguage: settings.sourceLanguage,
    targetLanguage: settings.targetLanguage,
    translatedText: outputText
  };
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

async function buildGeminiErrorMessage(response) {
  const fallback = `Gemini translation failed with HTTP ${response.status}.`;

  try {
    const payload = await response.json();
    const message = payload?.error?.message;
    const status = payload?.error?.status;
    const detail = [message, status].filter(Boolean).join(" ");

    return detail ? `Gemini: ${detail}` : fallback;
  } catch {
    return fallback;
  }
}
