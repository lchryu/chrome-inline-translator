export async function translateWithGoogle({ text, settings }) {
  if (!settings.googleApiKey) {
    throw new Error("Missing Google Cloud Translation API key.");
  }

  const response = await fetch(
    `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(settings.googleApiKey)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        q: text,
        source: settings.sourceLanguage === "auto" ? undefined : settings.sourceLanguage,
        target: settings.targetLanguage,
        format: "text"
      })
    }
  );

  if (!response.ok) {
    throw new Error(`Google Translate failed with HTTP ${response.status}.`);
  }

  const payload = await response.json();
  const translation = payload?.data?.translations?.[0];

  if (!translation?.translatedText) {
    throw new Error("Google Translate returned an empty response.");
  }

  return {
    provider: "google",
    sourceLanguage: translation.detectedSourceLanguage ?? settings.sourceLanguage,
    targetLanguage: settings.targetLanguage,
    translatedText: decodeHtmlEntities(translation.translatedText)
  };
}

function decodeHtmlEntities(value) {
  return value.replace(/&(#\d+|#x[\da-f]+|amp|lt|gt|quot|apos);/gi, (entity, code) => {
    const namedEntities = {
      amp: "&",
      lt: "<",
      gt: ">",
      quot: "\"",
      apos: "'"
    };

    if (code[0] === "#") {
      const radix = code[1]?.toLowerCase() === "x" ? 16 : 10;
      const number = Number.parseInt(code.slice(radix === 16 ? 2 : 1), radix);
      return Number.isFinite(number) ? String.fromCodePoint(number) : entity;
    }

    return namedEntities[code.toLowerCase()] ?? entity;
  });
}
