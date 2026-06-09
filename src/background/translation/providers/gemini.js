export async function translateWithGemini({ text, pageTitle, settings }) {
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
                "Translate the selected webpage text naturally.",
                "Return only the translated text, with no explanation.",
                `Target language: ${settings.targetLanguage}.`,
                `Source language: ${settings.sourceLanguage}.`,
                pageTitle ? `Page title: ${pageTitle}.` : "",
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
  const translatedText = extractGeminiText(payload);

  if (!translatedText) {
    throw new Error("Gemini returned an empty response.");
  }

  return {
    provider: "gemini",
    sourceLanguage: settings.sourceLanguage,
    targetLanguage: settings.targetLanguage,
    translatedText
  };
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
