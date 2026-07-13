const historyEl = document.querySelector("#history");
const vocabularyEl = document.querySelector("#vocabulary");

document.querySelector("#open-options").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

loadHistory();

async function loadHistory() {
  const response = await sendRuntimeMessage({ type: "GET_HISTORY" });

  if (!response?.ok) {
    historyEl.textContent = "Could not load history.";
    return;
  }

  renderHistory(response.result.history ?? []);
  renderVocabulary(response.result.vocabulary ?? []);
}

async function sendRuntimeMessage(message) {
  const chromeApi = globalThis.chrome;

  if (!chromeApi?.runtime?.sendMessage) {
    throw new Error("Extension context is not available. Please close and reopen this popup.");
  }

  return chromeApi.runtime.sendMessage(message);
}

function renderHistory(history) {
  historyEl.textContent = "";

  if (history.length === 0) {
    historyEl.textContent = "No translations yet.";
    return;
  }

  for (const item of history.slice(0, 5)) {
    const row = document.createElement("article");
    row.className = "history-item";

    const original = document.createElement("div");
    original.className = "original";
    original.textContent = item.originalText;

    const translated = document.createElement("div");
    translated.className = "translated";
    translated.textContent = item.translatedText;

    row.append(original, translated);
    historyEl.append(row);
  }
}

function renderVocabulary(vocabulary) {
  vocabularyEl.textContent = "";

  if (vocabulary.length === 0) {
    vocabularyEl.textContent = "No vocabulary yet.";
    return;
  }

  for (const item of vocabulary.slice(0, 14)) {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = item.count > 1 ? `${item.term} ${item.count}` : item.term;
    vocabularyEl.append(chip);
  }
}
