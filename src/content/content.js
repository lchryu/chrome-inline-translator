const TOOLBAR_ID = "iqt-toolbar";
const PANEL_ID = "iqt-panel";
const MIN_SELECTION_LENGTH = 1;
const MIN_SENTENCES_FOR_SPLIT = 2;
const MAX_SENTENCES_FOR_BATCH = 12;

const inlineBySelection = new Map();

let selectedRange = null;
let selectedText = "";
let toolbar = null;
let panel = null;
let panelOutput = null;
let lastInline = null;
let contentSettings = {
  placementMode: "inline"
};

loadContentSettings();

if (getChromeAPI()?.storage?.onChanged) {
  getChromeAPI().storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "sync" && changes.translatorSettings) {
      contentSettings = {
        ...contentSettings,
        ...changes.translatorSettings.newValue
      };
    }
  });
}

document.addEventListener("mouseup", () => {
  window.setTimeout(handleSelectionChange, 0);
});

document.addEventListener("keyup", (event) => {
  if (event.key === "Escape") {
    removeToolbar();
    removePanel();
    return;
  }

  handleSelectionChange();
});

document.addEventListener("keydown", (event) => {
  if (event.altKey && event.key.toLowerCase() === "t") {
    event.preventDefault();
    translateSelectionInline();
    return;
  }

  const actionByKey = {
    e: "explain",
    s: "summarize",
    g: "grammar",
    p: "phrases"
  };
  const action = event.altKey ? actionByKey[event.key.toLowerCase()] : null;

  if (action) {
    event.preventDefault();
    runShortcutAction(action);
  }
});

document.addEventListener("scroll", () => {
  removeToolbar();
  removePanel();
}, true);

document.addEventListener("mousedown", (event) => {
  const target = event.target;

  if (!(target instanceof Element)) {
    return;
  }

  if (!target.closest(`#${TOOLBAR_ID}, #${PANEL_ID}, [data-iqt-inline="true"]`)) {
    removePanel();
  }
});

function handleSelectionChange() {
  const selection = window.getSelection();
  const text = selection?.toString().trim() ?? "";

  if (!selection || selection.rangeCount === 0 || text.length < MIN_SELECTION_LENGTH) {
    removeToolbar();
    return;
  }

  const range = selection.getRangeAt(0);

  if (!range || range.collapsed || isInsideExtensionUi(range.commonAncestorContainer)) {
    return;
  }

  selectedRange = range.cloneRange();
  selectedText = text;
  showToolbar(range);
}

function showToolbar(range) {
  const rect = range.getBoundingClientRect();

  if (!rect || rect.width === 0 || rect.height === 0) {
    removeToolbar();
    return;
  }

  toolbar = toolbar ?? createToolbar();
  document.documentElement.appendChild(toolbar);

  const toolbarRect = toolbar.getBoundingClientRect();
  const top = Math.max(8, rect.top - toolbarRect.height - 8);
  const left = Math.min(
    window.innerWidth - toolbarRect.width - 8,
    Math.max(8, rect.left + rect.width / 2 - toolbarRect.width / 2)
  );

  toolbar.style.top = `${top}px`;
  toolbar.style.left = `${left}px`;
}

function createToolbar() {
  const element = document.createElement("div");
  element.id = TOOLBAR_ID;
  element.className = "iqt-toolbar";

  const translateButton = document.createElement("button");
  translateButton.className = "iqt-button iqt-button-primary";
  translateButton.type = "button";
  translateButton.title = "Quick translate";
  translateButton.textContent = "T";
  translateButton.addEventListener("mousedown", (event) => event.preventDefault());
  translateButton.addEventListener("click", translateSelectionInline);

  const closeButton = document.createElement("button");
  closeButton.className = "iqt-button";
  closeButton.type = "button";
  closeButton.title = "Close";
  closeButton.textContent = "x";
  closeButton.addEventListener("mousedown", (event) => event.preventDefault());
  closeButton.addEventListener("click", removeToolbar);

  element.append(translateButton, closeButton);
  return element;
}

async function translateSelectionInline(actionAfterTranslate = null) {
  if (!selectedRange || !selectedText) {
    showToast("No selected text found.");
    return;
  }

  const selectionKey = normalizeSelection(selectedText);
  const existingInline = getConnectedInline(selectionKey);

  if (existingInline) {
    existingInline.remove();
    inlineBySelection.delete(selectionKey);
    removeToolbar();
    window.getSelection()?.removeAllRanges();
    return;
  }

  const sentences = splitIntoSentences(selectedText);
  const shouldSplitSentences = !actionAfterTranslate && sentences.length >= MIN_SENTENCES_FOR_SPLIT;

  const inline = shouldSplitSentences
    ? insertSentenceTranslationBlock({
      range: selectedRange,
      originalText: selectedText,
      sentences
    })
    : insertInlineTranslation({
    range: selectedRange,
    originalText: selectedText,
    translatedText: "Translating...",
    stateClass: "iqt-loading",
    placementMode: contentSettings.placementMode
  });

  inlineBySelection.set(selectionKey, inline);
  lastInline = inline;
  removeToolbar();

  if (shouldSplitSentences) {
    await translateSentenceBatch(inline, sentences);
    return;
  }

  try {
    const response = await sendRuntimeMessage({
      type: "TRANSLATE_SELECTION",
      text: selectedText,
      pageUrl: window.location.href,
      pageTitle: document.title
    });

    if (!response?.ok) {
      throw new Error(response?.error ?? "Could not translate this text.");
    }

    updateInlineTranslation(inline, response.result.translatedText);
    if (response.result.fallbackUsed) {
      showToast(`Used ${response.result.provider} fallback.`);
    }

    if (actionAfterTranslate) {
      const output = showInlinePanel(inline);
      runReadingAction(inline, actionAfterTranslate, output);
    }
  } catch (error) {
    updateInlineTranslation(
      inline,
      error instanceof Error ? error.message : "Could not translate this text.",
      "iqt-error"
    );
  }
}

async function translateSentenceBatch(wrapper, sentences) {
  try {
    const response = await sendRuntimeMessage({
      type: "TRANSLATE_BATCH",
      items: sentences.map((text, index) => ({
        id: String(index),
        text
      })),
      pageUrl: window.location.href,
      pageTitle: document.title
    });

    if (!response?.ok) {
      throw new Error(response?.error ?? "Could not translate these sentences.");
    }

    updateSentenceTranslationBlock(wrapper, response.result.items ?? []);
  } catch (error) {
    wrapper.classList.remove("iqt-loading");
    wrapper.classList.add("iqt-error");
    const status = wrapper.querySelector(".iqt-sentence-status");

    if (status) {
      status.textContent = error instanceof Error ? error.message : "Could not translate these sentences.";
    }
  }
}

function insertSentenceTranslationBlock({ range, originalText, sentences }) {
  const wrapper = document.createElement("span");
  wrapper.className = "iqt-inline iqt-sentence-block iqt-loading";
  wrapper.setAttribute("data-iqt-inline", "true");
  wrapper.dataset.originalText = originalText;
  wrapper.dataset.translatedText = "Translating sentences...";
  wrapper.dataset.placementMode = "sentence-block";

  const header = document.createElement("span");
  header.className = "iqt-sentence-header";
  header.textContent = `Translating ${sentences.length} sentences...`;

  const list = document.createElement("span");
  list.className = "iqt-sentence-list";

  sentences.forEach((sentence, index) => {
    const item = document.createElement("button");
    item.className = "iqt-sentence-item";
    item.type = "button";
    item.dataset.index = String(index);
    item.dataset.originalText = sentence;
    item.dataset.translatedText = "";
    item.title = "Open reading tools for this sentence";

    const original = document.createElement("span");
    original.className = "iqt-sentence-original";
    original.textContent = sentence;

    const translated = document.createElement("span");
    translated.className = "iqt-sentence-translated";
    translated.textContent = "Translating...";

    item.append(original, translated);
    item.addEventListener("click", (event) => {
      event.stopPropagation();
      const sentenceInline = createVirtualInlineFromSentence(item);
      showInlinePanel(sentenceInline);
    });
    list.append(item);
  });

  const status = document.createElement("span");
  status.className = "iqt-sentence-status";

  wrapper.append(header, list, status);

  const insertionRange = range.cloneRange();
  insertionRange.collapse(false);
  insertionRange.insertNode(wrapper);

  window.getSelection()?.removeAllRanges();
  return wrapper;
}

function updateSentenceTranslationBlock(wrapper, items) {
  const byId = new Map(items.map((item) => [String(item.id), item]));
  const translations = [];
  let fallbackProvider = "";

  for (const item of wrapper.querySelectorAll(".iqt-sentence-item")) {
    const result = byId.get(item.dataset.index);
    const translated = item.querySelector(".iqt-sentence-translated");

    if (!translated || !result) {
      continue;
    }

    if (result.ok) {
      const text = result.result.translatedText;
      item.dataset.translatedText = text;
      translated.textContent = text;
      translations.push(text);

      if (result.result.fallbackUsed) {
        fallbackProvider = result.result.provider;
      }
    } else {
      item.classList.add("iqt-sentence-item-error");
      translated.textContent = result.error ?? "Could not translate this sentence.";
    }
  }

  wrapper.classList.remove("iqt-loading");
  wrapper.dataset.translatedText = translations.join("\n");
  const header = wrapper.querySelector(".iqt-sentence-header");
  const status = wrapper.querySelector(".iqt-sentence-status");

  if (header) {
    header.textContent = `${translations.length}/${items.length} sentences translated`;
  }

  if (status) {
    status.textContent = fallbackProvider ? `Used ${fallbackProvider} fallback for some sentences.` : "";
  }
}

function createVirtualInlineFromSentence(item) {
  return {
    dataset: {
      originalText: item.dataset.originalText ?? "",
      translatedText: item.dataset.translatedText ?? ""
    },
    getBoundingClientRect: () => item.getBoundingClientRect(),
    remove: () => item.closest("[data-iqt-inline='true']")?.remove()
  };
}

function insertInlineTranslation({ range, originalText, translatedText, stateClass = "", placementMode = "inline" }) {
  const wrapper = document.createElement("span");
  wrapper.className = `iqt-inline iqt-placement-${placementMode} ${stateClass}`.trim();
  wrapper.setAttribute("data-iqt-inline", "true");
  wrapper.dataset.originalText = originalText;
  wrapper.dataset.translatedText = translatedText;
  wrapper.dataset.placementMode = placementMode;

  const textNode = document.createElement("button");
  textNode.className = "iqt-inline-text";
  textNode.type = "button";
  textNode.title = "Open reading tools";
  textNode.textContent = formatTranslationText(translatedText, placementMode);
  textNode.addEventListener("click", (event) => {
    event.stopPropagation();
    showInlinePanel(wrapper);
  });

  wrapper.append(textNode);

  const insertionRange = range.cloneRange();
  insertionRange.collapse(false);
  insertionRange.insertNode(wrapper);

  window.getSelection()?.removeAllRanges();
  return wrapper;
}

function updateInlineTranslation(wrapper, translatedText, stateClass = "") {
  const placementMode = wrapper.dataset.placementMode ?? "inline";
  wrapper.className = `iqt-inline iqt-placement-${placementMode} ${stateClass}`.trim();
  wrapper.dataset.translatedText = translatedText;
  const textNode = wrapper.querySelector(".iqt-inline-text");

  if (textNode) {
    textNode.textContent = formatTranslationText(translatedText, placementMode);
  }
}

function showInlinePanel(inline) {
  removePanel();
  lastInline = inline;

  panel = document.createElement("div");
  panel.id = PANEL_ID;
  panel.className = "iqt-panel";

  const header = document.createElement("div");
  header.className = "iqt-panel-header";

  const title = document.createElement("div");
  title.className = "iqt-panel-title";
  title.textContent = "Reading tools";

  const close = document.createElement("button");
  close.className = "iqt-panel-icon-button";
  close.type = "button";
  close.title = "Close";
  close.textContent = "x";
  close.addEventListener("click", removePanel);

  header.append(title, close);

  const translation = document.createElement("div");
  translation.className = "iqt-panel-translation";
  translation.textContent = inline.dataset.translatedText ?? "";

  const actions = document.createElement("div");
  actions.className = "iqt-panel-actions";

  const output = document.createElement("div");
  output.className = "iqt-panel-output";
  output.hidden = true;
  panelOutput = output;

  const buttons = [
    ["Copy", () => copyInlineTranslation(inline)],
    ["Explain", () => runReadingAction(inline, "explain", output)],
    ["Summarize", () => runReadingAction(inline, "summarize", output)],
    ["Grammar", () => runReadingAction(inline, "grammar", output)],
    ["Phrases", () => runReadingAction(inline, "phrases", output)],
    ["Simplify", () => runReadingAction(inline, "rewrite", output)],
    ["Remove", () => removeInline(inline)]
  ];

  for (const [label, handler] of buttons) {
    const button = document.createElement("button");
    button.className = "iqt-panel-button";
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", handler);
    actions.append(button);
  }

  panel.append(header, translation, actions, output);
  document.documentElement.appendChild(panel);
  positionPanel(panel, inline.getBoundingClientRect());
  return output;
}

function positionPanel(element, anchorRect) {
  const panelRect = element.getBoundingClientRect();
  const top = Math.min(
    window.innerHeight - panelRect.height - 8,
    Math.max(8, anchorRect.bottom + 8)
  );
  const left = Math.min(
    window.innerWidth - panelRect.width - 8,
    Math.max(8, anchorRect.left)
  );

  element.style.top = `${top}px`;
  element.style.left = `${left}px`;
}

async function copyInlineTranslation(inline) {
  const text = inline.dataset.translatedText ?? "";

  try {
    await navigator.clipboard.writeText(text);
    showToast("Translation copied.");
  } catch {
    showToast("Could not copy translation.");
  }
}

async function runReadingAction(inline, action, output) {
  output.hidden = false;
  output.className = "iqt-panel-output iqt-loading";
  output.textContent = "Working...";

  try {
    const response = await sendRuntimeMessage({
      type: "RUN_AI_ACTION",
      action,
      text: inline.dataset.originalText,
      translatedText: inline.dataset.translatedText,
      pageUrl: window.location.href,
      pageTitle: document.title
    });

    if (!response?.ok) {
      throw new Error(response?.error ?? "Could not run this action.");
    }

    output.className = "iqt-panel-output";
    output.textContent = response.result.outputText;
  } catch (error) {
    output.className = "iqt-panel-output iqt-error";
    output.textContent = error instanceof Error ? error.message : "Could not run this action.";
  }
}

function removeInline(inline) {
  inlineBySelection.delete(normalizeSelection(inline.dataset.originalText ?? ""));
  if (lastInline === inline) {
    lastInline = null;
  }
  inline.remove();
  removePanel();
}

function getConnectedInline(selectionKey) {
  const inline = inlineBySelection.get(selectionKey);
  return inline?.isConnected ? inline : null;
}

function removeToolbar() {
  toolbar?.remove();
}

function removePanel() {
  panel?.remove();
  panel = null;
  panelOutput = null;
}

function normalizeSelection(text) {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

async function loadContentSettings() {
  try {
    const { translatorSettings } = await getSyncStorage(["translatorSettings"]);
    contentSettings = {
      ...contentSettings,
      ...translatorSettings
    };
  } catch {
    // The page may still be running an old content script after extension reload.
  }
}

function runShortcutAction(action) {
  const inline = lastInline?.isConnected ? lastInline : null;

  if (inline) {
    const output = panel?.isConnected && panelOutput ? panelOutput : showInlinePanel(inline);
    runReadingAction(inline, action, output);
    return;
  }

  if (selectedRange && selectedText) {
    translateSelectionInline(action);
    return;
  }

  showToast("Select text or click a translation first.");
}

function formatTranslationText(translatedText, placementMode) {
  if (placementMode === "compact") {
    return translatedText;
  }

  if (placementMode === "block") {
    return translatedText;
  }

  return `[${translatedText}]`;
}

function splitIntoSentences(text) {
  const normalizedText = text.trim().replace(/\s+/g, " ");

  if (!normalizedText) {
    return [];
  }

  if ("Segmenter" in Intl) {
    try {
      const segmenter = new Intl.Segmenter(undefined, { granularity: "sentence" });
      return [...segmenter.segment(normalizedText)]
        .map((segment) => segment.segment.trim())
        .filter(Boolean)
        .slice(0, MAX_SENTENCES_FOR_BATCH);
    } catch {
      // Fall through to regex splitter.
    }
  }

  const sentences = normalizedText
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'])/g)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  return (sentences.length > 0 ? sentences : [normalizedText]).slice(0, MAX_SENTENCES_FOR_BATCH);
}

function isInsideExtensionUi(node) {
  const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  return Boolean(element?.closest?.(`#${TOOLBAR_ID}, #${PANEL_ID}, [data-iqt-inline="true"]`));
}

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "iqt-toast";
  toast.textContent = message;
  document.documentElement.appendChild(toast);
  window.setTimeout(() => toast.remove(), 2800);
}

async function sendRuntimeMessage(message) {
  const chromeApi = getChromeAPI();

  if (!chromeApi?.runtime?.sendMessage) {
    throw new Error("Extension context is not available. Refresh this page after reloading the extension.");
  }

  return chromeApi.runtime.sendMessage(message);
}

async function getSyncStorage(keys) {
  const chromeApi = getChromeAPI();

  if (!chromeApi?.storage?.sync?.get) {
    throw new Error("Extension storage is not available. Refresh this page after reloading the extension.");
  }

  return chromeApi.storage.sync.get(keys);
}

function getChromeAPI() {
  return globalThis.chrome;
}
