export async function translateWithMock({ text, settings }) {
  return {
    provider: "mock",
    sourceLanguage: settings.sourceLanguage,
    targetLanguage: settings.targetLanguage,
    translatedText: `[${settings.targetLanguage}] ${text}`
  };
}
