import { translateWithGoogle } from "./providers/google.js";
import { translateWithGemini } from "./providers/gemini.js";
import { translateWithMock } from "./providers/mock.js";
import { translateWithOpenAI } from "./providers/openai.js";

const providers = {
  gemini: translateWithGemini,
  google: translateWithGoogle,
  mock: translateWithMock,
  openai: translateWithOpenAI
};

export async function translateText({ text, pageUrl, pageTitle, settings }) {
  const cleanText = text?.trim();

  if (!cleanText) {
    throw new Error("No text selected.");
  }

  const resolvedSettings = {
    provider: "mock",
    sourceLanguage: "auto",
    targetLanguage: "vi",
    ...settings
  };

  const provider = providers[resolvedSettings.provider] ?? providers.mock;

  return provider({
    text: cleanText,
    pageUrl,
    pageTitle,
    settings: resolvedSettings
  });
}

export async function runAIAction({ action, text, translatedText, pageUrl, pageTitle, settings }) {
  const cleanText = text?.trim();

  if (!cleanText) {
    throw new Error("No text selected.");
  }

  const resolvedSettings = {
    provider: "mock",
    sourceLanguage: "auto",
    targetLanguage: "vi",
    ...settings
  };

  if (resolvedSettings.provider === "gemini") {
    return translateWithGemini({
      action,
      text: cleanText,
      translatedText,
      pageUrl,
      pageTitle,
      settings: resolvedSettings
    });
  }

  if (resolvedSettings.provider === "openai") {
    return translateWithOpenAI({
      action,
      text: cleanText,
      translatedText,
      pageUrl,
      pageTitle,
      settings: resolvedSettings
    });
  }

  throw new Error("AI actions require the Gemini or OpenAI provider.");
}
