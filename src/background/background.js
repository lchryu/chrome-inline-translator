import { runAIAction, translateText } from "./translation/index.js";

const CACHE_PREFIX = "translationCache:";
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 14;

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
  if (message?.type !== "TRANSLATE_SELECTION" && message?.type !== "RUN_AI_ACTION") {
    return false;
  }

  handleMessage(message)
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error) => {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "Unknown translation error"
      });
    });

  return true;
});

async function handleMessage(message) {
  if (message.type === "RUN_AI_ACTION") {
    return handleAIAction(message);
  }

  return handleTranslation(message);
}

async function handleTranslation(message) {
  const { translatorSettings } = await chrome.storage.sync.get(["translatorSettings"]);
  const cacheKey = await buildCacheKey(message.text, translatorSettings);
  const cached = await readCachedTranslation(cacheKey);

  if (cached) {
    return {
      ...cached,
      cached: true
    };
  }

  const result = await translateText({
    text: message.text,
    pageUrl: message.pageUrl,
    pageTitle: message.pageTitle,
    settings: translatorSettings
  });

  await writeCachedTranslation(cacheKey, result);
  return {
    ...result,
    cached: false
  };
}

async function handleAIAction(message) {
  const { translatorSettings } = await chrome.storage.sync.get(["translatorSettings"]);

  return runAIAction({
    action: message.action,
    text: message.text,
    translatedText: message.translatedText,
    pageUrl: message.pageUrl,
    pageTitle: message.pageTitle,
    settings: translatorSettings
  });
}

async function buildCacheKey(text, settings = {}) {
  const payload = [
    settings.provider ?? "mock",
    settings.sourceLanguage ?? "auto",
    settings.targetLanguage ?? "vi",
    settings.openaiModel ?? "",
    settings.geminiModel ?? "",
    text.trim()
  ].join("\n");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  const hash = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  return `${CACHE_PREFIX}${hash}`;
}

async function readCachedTranslation(cacheKey) {
  const item = await chrome.storage.local.get([cacheKey]);
  const entry = item[cacheKey];

  if (!entry || Date.now() - entry.createdAt > CACHE_TTL_MS) {
    if (entry) {
      await chrome.storage.local.remove(cacheKey);
    }

    return null;
  }

  return entry.result;
}

async function writeCachedTranslation(cacheKey, result) {
  await chrome.storage.local.set({
    [cacheKey]: {
      createdAt: Date.now(),
      result
    }
  });
}
