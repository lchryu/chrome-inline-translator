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

const form = document.querySelector("#settings-form");
const status = document.querySelector("#status");

loadSettings();

form.elements.provider.addEventListener("change", () => {
  updateProviderFields(form.elements.provider.value);
});

document.querySelector("#test-provider").addEventListener("click", testProvider);
document.querySelector("#clear-cache").addEventListener("click", clearCache);
document.querySelector("#clear-history").addEventListener("click", clearHistory);

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  await setSyncStorage({ translatorSettings: collectTranslatorSettings() });
  status.textContent = "Saved.";
  window.setTimeout(() => {
    status.textContent = "";
  }, 1800);
});

async function loadSettings() {
  const { translatorSettings } = await getSyncStorage(["translatorSettings"]);
  const settings = { ...DEFAULT_SETTINGS, ...translatorSettings };

  for (const [key, value] of Object.entries(settings)) {
    const field = form.elements.namedItem(key);

    if (field) {
      if (field.type === "checkbox") {
        field.checked = Boolean(value);
      } else {
        field.value = value;
      }
    }
  }

  updateProviderFields(settings.provider);
}

function normalizeValue(value, fallback) {
  return String(value ?? "").trim() || fallback;
}

function collectTranslatorSettings() {
  const formData = new FormData(form);

  return {
    provider: formData.get("provider"),
    aiProvider: normalizeAIProvider(formData.get("aiProvider")),
    sourceLanguage: normalizeValue(formData.get("sourceLanguage"), "auto"),
    targetLanguage: normalizeValue(formData.get("targetLanguage"), "vi"),
    googleApiKey: normalizeValue(formData.get("googleApiKey"), ""),
    openaiApiKey: normalizeValue(formData.get("openaiApiKey"), ""),
    openaiModel: normalizeValue(formData.get("openaiModel"), "gpt-4o-mini"),
    geminiApiKey: normalizeValue(formData.get("geminiApiKey"), ""),
    geminiModel: normalizeGeminiModel(formData.get("geminiModel")),
    autoFallback: formData.get("autoFallback") === "on",
    placementMode: normalizePlacementMode(formData.get("placementMode")),
    saveHistory: formData.get("saveHistory") === "on"
  };
}

function normalizeGeminiModel(value) {
  const model = normalizeValue(value, "gemini-3.1-flash-lite");
  return [
    "gemini-2.0-flash-lite",
    "gemini-2.0-flash-lite-001",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite"
  ].includes(model) ? "gemini-3.1-flash-lite" : model;
}

function normalizePlacementMode(value) {
  const mode = normalizeValue(value, "inline");
  return ["inline", "compact", "block"].includes(mode) ? mode : "inline";
}

function normalizeAIProvider(value) {
  const provider = normalizeValue(value, "gemini");
  return ["auto", "gemini", "openai"].includes(provider) ? provider : "gemini";
}

function updateProviderFields(provider) {
  for (const field of document.querySelectorAll("[data-provider-field]")) {
    field.hidden = provider !== "auto" && field.dataset.providerField !== provider;
  }
}

async function testProvider() {
  status.textContent = "Testing provider...";

  try {
    const response = await sendRuntimeMessage({
      type: "TEST_PROVIDER",
      provider: form.elements.provider.value,
      settings: collectTranslatorSettings()
    });

    if (!response?.ok) {
      throw new Error(response?.error ?? "Provider test failed.");
    }

    status.textContent = `Provider OK: ${response.result.translatedText}`;
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : "Provider test failed.";
  }
}

async function clearCache() {
  const response = await sendRuntimeMessage({ type: "CLEAR_CACHE" });
  status.textContent = response?.ok ? `Cleared ${response.result.cleared} cached items.` : "Could not clear cache.";
}

async function clearHistory() {
  const response = await sendRuntimeMessage({ type: "CLEAR_HISTORY" });
  status.textContent = response?.ok ? "History cleared." : "Could not clear history.";
}

async function sendRuntimeMessage(message) {
  const chromeApi = globalThis.chrome;

  if (!chromeApi?.runtime?.sendMessage) {
    throw new Error("Extension context is not available. Reload the extension settings page.");
  }

  return chromeApi.runtime.sendMessage(message);
}

async function getSyncStorage(keys) {
  const chromeApi = globalThis.chrome;

  if (!chromeApi?.storage?.sync?.get) {
    throw new Error("Extension storage is not available. Reload the extension settings page.");
  }

  return chromeApi.storage.sync.get(keys);
}

async function setSyncStorage(value) {
  const chromeApi = globalThis.chrome;

  if (!chromeApi?.storage?.sync?.set) {
    throw new Error("Extension storage is not available. Reload the extension settings page.");
  }

  return chromeApi.storage.sync.set(value);
}
