export async function translateWithOpenAI({ action = "translate", text, translatedText, pageTitle, settings }) {
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
              text: buildOpenAIInstruction(action, settings)
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
                translatedText ? `Current translation: ${translatedText}` : "",
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
  const outputText = extractResponseText(payload);

  if (!outputText) {
    throw new Error("OpenAI returned an empty response.");
  }

  if (action !== "translate") {
    return {
      action,
      provider: "openai",
      outputText
    };
  }

  return {
    provider: "openai",
    sourceLanguage: settings.sourceLanguage,
    targetLanguage: settings.targetLanguage,
    translatedText: outputText
  };
}

function buildOpenAIInstruction(action, settings) {
  const targetLanguage = settings.targetLanguage || "vi";
  const sourceLanguage = settings.sourceLanguage || "auto";
  const instructions = {
    explain: [
      "You are a concise reading assistant.",
      "Explain the selected webpage text clearly for a language learner.",
      `Use ${targetLanguage}.`,
      "Keep the answer compact and practical."
    ],
    summarize: [
      "You are a concise reading assistant.",
      "Summarize the selected webpage text.",
      `Use ${targetLanguage}.`,
      "Keep the answer concise."
    ],
    grammar: [
      "You are a language tutor.",
      "Analyze the grammar of the selected text.",
      `Use ${targetLanguage}.`,
      "Focus on sentence structure, important phrases, and why the sentence means what it means."
    ],
    phrases: [
      "You are a language tutor.",
      "Extract important vocabulary, idioms, and useful phrases from the selected text.",
      `Use ${targetLanguage}.`,
      "Give short meanings and keep the answer easy to scan."
    ],
    rewrite: [
      "You are a precise rewriting assistant.",
      "Rewrite the selected text in simpler language while preserving the meaning.",
      `Use ${sourceLanguage === "auto" ? "the original language" : sourceLanguage}.`,
      "Return only the rewritten text."
    ],
    translate: [
      "You are a precise translation engine.",
      "Translate the user's selected webpage text naturally.",
      "Return only the translated text, with no explanation."
    ]
  };

  return (instructions[action] ?? instructions.translate).join(" ");
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
