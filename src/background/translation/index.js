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

  const aiProviders = buildAIProviderOrder(resolvedSettings);
  const errors = [];

  for (const provider of aiProviders) {
    try {
      if (provider === "gemini") {
        return translateWithGemini({
          action,
          text: cleanText,
          translatedText,
          pageUrl,
          pageTitle,
          settings: {
            ...resolvedSettings,
            provider
          }
        });
      }

      if (provider === "openai") {
        return translateWithOpenAI({
          action,
          text: cleanText,
          translatedText,
          pageUrl,
          pageTitle,
          settings: {
            ...resolvedSettings,
            provider
          }
        });
      }
    } catch (error) {
      errors.push(`${provider}: ${error instanceof Error ? error.message : "Unknown error"}`);

      if (!resolvedSettings.autoFallback) {
        throw error;
      }
    }
  }

  throw new Error(`AI actions require Gemini or OpenAI. ${errors.join(" | ")}`);
}

function buildAIProviderOrder(settings) {
  const candidates = [
    settings.provider,
    "gemini",
    "openai"
  ];

  return [...new Set(candidates)].filter((provider) => {
    if (provider === "gemini") {
      return Boolean(settings.geminiApiKey);
    }

    if (provider === "openai") {
      return Boolean(settings.openaiApiKey);
    }

    return false;
  });
}
