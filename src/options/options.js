const DEFAULT_SETTINGS = {
  provider: "mock",
  sourceLanguage: "auto",
  targetLanguage: "vi",
  googleApiKey: "",
  openaiApiKey: "",
  openaiModel: "gpt-4o-mini",
  geminiApiKey: "",
  geminiModel: "gemini-2.5-flash"
};

const form = document.querySelector("#settings-form");
const status = document.querySelector("#status");

loadSettings();

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(form);
  const translatorSettings = {
    provider: formData.get("provider"),
    sourceLanguage: normalizeValue(formData.get("sourceLanguage"), "auto"),
    targetLanguage: normalizeValue(formData.get("targetLanguage"), "vi"),
    googleApiKey: normalizeValue(formData.get("googleApiKey"), ""),
    openaiApiKey: normalizeValue(formData.get("openaiApiKey"), ""),
    openaiModel: normalizeValue(formData.get("openaiModel"), "gpt-4o-mini"),
    geminiApiKey: normalizeValue(formData.get("geminiApiKey"), ""),
    geminiModel: normalizeValue(formData.get("geminiModel"), "gemini-2.5-flash")
  };

  await chrome.storage.sync.set({ translatorSettings });
  status.textContent = "Saved.";
  window.setTimeout(() => {
    status.textContent = "";
  }, 1800);
});

async function loadSettings() {
  const { translatorSettings } = await chrome.storage.sync.get(["translatorSettings"]);
  const settings = { ...DEFAULT_SETTINGS, ...translatorSettings };

  for (const [key, value] of Object.entries(settings)) {
    const field = form.elements.namedItem(key);

    if (field) {
      field.value = value;
    }
  }
}

function normalizeValue(value, fallback) {
  return String(value ?? "").trim() || fallback;
}
