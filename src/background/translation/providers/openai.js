export async function translateWithOpenAI({ text, pageTitle, settings }) {
  if (!settings.openaiApiKey) {
    throw new Error("Missing OpenAI API key.");
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${settings.openaiApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: settings.openaiModel || "gpt-4o-mini",
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: [
                "You are a precise translation engine.",
                "Translate the user's selected webpage text naturally.",
                "Return only the translated text, with no explanation."
              ].join(" ")
            }
          ]
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: [
                `Target language: ${settings.targetLanguage}.`,
                `Source language: ${settings.sourceLanguage}.`,
                pageTitle ? `Page title: ${pageTitle}.` : "",
                "Selected text:",
                text
              ].filter(Boolean).join("\n")
            }
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(await buildOpenAIErrorMessage(response));
  }

  const payload = await response.json();
  const translatedText = extractResponseText(payload);

  if (!translatedText) {
    throw new Error("OpenAI returned an empty response.");
  }

  return {
    provider: "openai",
    sourceLanguage: settings.sourceLanguage,
    targetLanguage: settings.targetLanguage,
    translatedText
  };
}

function extractResponseText(payload) {
  if (payload.output_text) {
    return payload.output_text.trim();
  }

  return payload.output
    ?.flatMap((item) => item.content ?? [])
    ?.map((content) => content.text ?? "")
    ?.join("")
    ?.trim();
}

async function buildOpenAIErrorMessage(response) {
  const fallback = `OpenAI translation failed with HTTP ${response.status}.`;

  try {
    const payload = await response.json();
    const message = payload?.error?.message;
    const code = payload?.error?.code;
    const type = payload?.error?.type;
    const detail = [message, code || type].filter(Boolean).join(" ");

    return detail ? `OpenAI: ${detail}` : fallback;
  } catch {
    return fallback;
  }
}
