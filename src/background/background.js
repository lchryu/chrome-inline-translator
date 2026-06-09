import { translateText } from "./translation/index.js";

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.sync.get(["translatorSettings"]);

  if (!existing.translatorSettings) {
    await chrome.storage.sync.set({
      translatorSettings: {
        provider: "mock",
        sourceLanguage: "auto",
        targetLanguage: "vi",
        googleApiKey: "",
        openaiApiKey: "",
        openaiModel: "gpt-4o-mini",
        geminiApiKey: "",
        geminiModel: "gemini-2.5-flash"
      }
    });
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "TRANSLATE_SELECTION") {
    return false;
  }

  handleTranslation(message)
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error) => {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "Unknown translation error"
      });
    });

  return true;
});

async function handleTranslation(message) {
  const { translatorSettings } = await chrome.storage.sync.get(["translatorSettings"]);
  return translateText({
    text: message.text,
    pageUrl: message.pageUrl,
    pageTitle: message.pageTitle,
    settings: translatorSettings
  });
}
