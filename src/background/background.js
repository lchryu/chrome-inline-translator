import { runAIAction, translateText } from "./translation/index.js";

const CACHE_PREFIX = "translationCache:";
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 14;
const HISTORY_KEY = "translationHistory";
const VOCABULARY_KEY = "vocabularyItems";
const MAX_HISTORY_ITEMS = 120;
const MAX_BATCH_ITEMS = 12;

const DEFAULT_SETTINGS = {
  provider: "auto",
  aiProvider: "gemini",
  sourceLanguage: "auto",
  targetLanguage: "vi",
  googleApiKey: "",
  openaiApiKey: "",
  openaiModel: "gpt-4o-mini",
  geminiApiKey: "",
  geminiModel: "gemini-3.1-flash-lite",
  autoFallback: true,
  placementMode: "inline",
  saveHistory: true
};

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.sync.get(["translatorSettings"]);

  if (!existing.translatorSettings) {
    await chrome.storage.sync.set({
      translatorSettings: DEFAULT_SETTINGS
    });
    return;
  }

  await chrome.storage.sync.set({
    translatorSettings: normalizeSettings(existing.translatorSettings)
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (![
    "TRANSLATE_SELECTION",
    "TRANSLATE_BATCH",
    "RUN_AI_ACTION",
    "TEST_PROVIDER",
    "GET_HISTORY",
    "CLEAR_HISTORY",
    "CLEAR_CACHE"
  ].includes(message?.type)) {
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

  if (message.type === "TRANSLATE_BATCH") {
    return handleBatchTranslation(message);
  }

  if (message.type === "TEST_PROVIDER") {
    return handleProviderTest(message);
  }

  if (message.type === "GET_HISTORY") {
    return handleGetHistory();
  }

  if (message.type === "CLEAR_HISTORY") {
    return handleClearHistory();
  }

  if (message.type === "CLEAR_CACHE") {
    return handleClearCache();
  }

  return handleTranslation(message);
}

async function handleBatchTranslation(message) {
  const items = Array.isArray(message.items) ? message.items.slice(0, MAX_BATCH_ITEMS) : [];

  if (items.length === 0) {
    throw new Error("No batch items to translate.");
  }

  const results = [];

  for (const item of items) {
    try {
      const result = await handleTranslation({
        text: item.text,
        pageUrl: message.pageUrl,
        pageTitle: message.pageTitle
      });

      results.push({
        id: item.id,
        text: item.text,
        ok: true,
        result
      });
    } catch (error) {
      results.push({
        id: item.id,
        text: item.text,
        ok: false,
        error: error instanceof Error ? error.message : "Unknown translation error"
      });
    }
  }

  return { items: results };
}

async function handleTranslation(message) {
  const translatorSettings = await getTranslatorSettings();
  const cacheKey = await buildCacheKey(message.text, translatorSettings);
  const cached = await readCachedTranslation(cacheKey);

  if (cached) {
    await saveHistoryItem(message, cached, translatorSettings);
    return {
      ...cached,
      cached: true
    };
  }

  const result = await translateWithFallbacks({
    text: message.text,
    pageUrl: message.pageUrl,
    pageTitle: message.pageTitle,
    settings: translatorSettings
  });

  await writeCachedTranslation(cacheKey, result);
  await saveHistoryItem(message, result, translatorSettings);
  return {
    ...result,
    cached: false
  };
}

async function handleAIAction(message) {
  const translatorSettings = await getTranslatorSettings();

  return runAIAction({
    action: message.action,
    text: message.text,
    translatedText: message.translatedText,
    pageUrl: message.pageUrl,
    pageTitle: message.pageTitle,
    settings: translatorSettings
  });
}

async function handleProviderTest(message) {
  const translatorSettings = normalizeSettings({
    ...(await getTranslatorSettings()),
    ...message.settings
  });
  const provider = message.provider ?? translatorSettings.provider;
  const testPayload = {
    text: "Hello, this is a quick translation test.",
    pageUrl: "",
    pageTitle: "Provider test",
    settings: {
      ...translatorSettings,
      provider,
      autoFallback: provider === "auto" ? translatorSettings.autoFallback : false
    }
  };

  if (provider === "auto") {
    return translateWithFallbacks(testPayload);
  }

  return translateText(testPayload);
}

async function handleGetHistory() {
  const data = await chrome.storage.local.get([HISTORY_KEY, VOCABULARY_KEY]);
  return {
    history: data[HISTORY_KEY] ?? [],
    vocabulary: data[VOCABULARY_KEY] ?? []
  };
}

async function handleClearHistory() {
  await chrome.storage.local.remove([HISTORY_KEY, VOCABULARY_KEY]);
  return { cleared: true };
}

async function handleClearCache() {
  const allItems = await chrome.storage.local.get(null);
  const cacheKeys = Object.keys(allItems).filter((key) => key.startsWith(CACHE_PREFIX));
  await chrome.storage.local.remove(cacheKeys);
  return { cleared: cacheKeys.length };
}

async function getTranslatorSettings() {
  const { translatorSettings } = await chrome.storage.sync.get(["translatorSettings"]);
  return normalizeSettings(translatorSettings);
}

function normalizeSettings(settings = {}) {
  const normalized = {
    ...DEFAULT_SETTINGS,
    ...settings
  };

  if (!["auto", "mock", "gemini", "google", "openai"].includes(normalized.provider)) {
    normalized.provider = "auto";
  }

  if (!["auto", "gemini", "openai"].includes(normalized.aiProvider)) {
    normalized.aiProvider = "gemini";
  }

  if (isRetiredGeminiModel(normalized.geminiModel)) {
    normalized.geminiModel = "gemini-3.1-flash-lite";
  }

  if (!["inline", "block", "compact"].includes(normalized.placementMode)) {
    normalized.placementMode = "inline";
  }

  return normalized;
}

function isRetiredGeminiModel(model) {
  return !model || [
    "gemini-2.0-flash-lite",
    "gemini-2.0-flash-lite-001",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite"
  ].includes(model);
}

async function translateWithFallbacks({ text, pageUrl, pageTitle, settings }) {
  const providerOrder = buildProviderOrder(settings);
  const errors = [];

  for (const provider of providerOrder) {
    try {
      const result = await translateText({
        text,
        pageUrl,
        pageTitle,
        settings: {
          ...settings,
          provider
        }
      });

      return {
        ...result,
        fallbackUsed: settings.provider !== "auto" && provider !== settings.provider,
        requestedProvider: settings.provider
      };
    } catch (error) {
      errors.push(`${provider}: ${error instanceof Error ? error.message : "Unknown error"}`);

      if (!settings.autoFallback) {
        throw error;
      }
    }
  }

  throw new Error(`All translation providers failed. ${errors.join(" | ")}`);
}

function buildProviderOrder(settings) {
  const candidates = settings.provider === "auto"
    ? ["google", "gemini", "openai"]
    : [settings.provider, "google", "gemini", "openai"];

  if (settings.provider === "mock") {
    candidates.push("mock");
  }

  return [...new Set(candidates)].filter((provider) => isProviderConfigured(provider, settings));
}

function isProviderConfigured(provider, settings) {
  if (provider === "mock") {
    return true;
  }

  if (provider === "gemini") {
    return Boolean(settings.geminiApiKey);
  }

  if (provider === "google") {
    return Boolean(settings.googleApiKey);
  }

  if (provider === "openai") {
    return Boolean(settings.openaiApiKey);
  }

  return false;
}

async function buildCacheKey(text, settings = {}) {
  const payload = [
    settings.provider ?? "mock",
    settings.aiProvider ?? "gemini",
    settings.sourceLanguage ?? "auto",
    settings.targetLanguage ?? "vi",
    settings.openaiModel ?? "",
    settings.geminiModel ?? "",
    settings.autoFallback ? "fallback" : "single",
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

async function saveHistoryItem(message, result, settings) {
  if (!settings.saveHistory || !result?.translatedText) {
    return;
  }

  const item = {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    pageTitle: message.pageTitle ?? "",
    pageUrl: message.pageUrl ?? "",
    sourceLanguage: result.sourceLanguage ?? settings.sourceLanguage,
    targetLanguage: result.targetLanguage ?? settings.targetLanguage,
    provider: result.provider ?? settings.provider,
    originalText: message.text.trim(),
    translatedText: result.translatedText
  };
  const data = await chrome.storage.local.get([HISTORY_KEY, VOCABULARY_KEY]);
  const history = [item, ...(data[HISTORY_KEY] ?? [])].slice(0, MAX_HISTORY_ITEMS);
  const vocabulary = mergeVocabulary(data[VOCABULARY_KEY] ?? [], item);

  await chrome.storage.local.set({
    [HISTORY_KEY]: history,
    [VOCABULARY_KEY]: vocabulary
  });
}

function mergeVocabulary(existing, item) {
  const byTerm = new Map(existing.map((entry) => [entry.term.toLowerCase(), entry]));

  for (const term of extractVocabularyTerms(item.originalText)) {
    const key = term.toLowerCase();
    const current = byTerm.get(key);

    byTerm.set(key, {
      term,
      count: (current?.count ?? 0) + 1,
      lastSeenAt: item.createdAt,
      lastPageTitle: item.pageTitle,
      sampleText: item.originalText,
      sampleTranslation: item.translatedText
    });
  }

  return [...byTerm.values()]
    .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
    .slice(0, 160);
}

function extractVocabularyTerms(text) {
  return [...new Set(
    text
      .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
      .split(/\s+/)
      .map((word) => word.trim())
      .filter((word) => word.length >= 4 && !/^\d+$/.test(word))
  )].slice(0, 10);
}
