const TOOLBAR_ID = "iqt-toolbar";
const PANEL_ID = "iqt-panel";
const MIN_SELECTION_LENGTH = 1;

const inlineBySelection = new Map();

let selectedRange = null;
let selectedText = "";
let toolbar = null;
let panel = null;

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

async function translateSelectionInline() {
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

  const inline = insertInlineTranslation({
    range: selectedRange,
    originalText: selectedText,
    translatedText: "Translating...",
    stateClass: "iqt-loading"
  });

  inlineBySelection.set(selectionKey, inline);
  removeToolbar();

  try {
    const response = await chrome.runtime.sendMessage({
      type: "TRANSLATE_SELECTION",
      text: selectedText,
      pageUrl: window.location.href,
      pageTitle: document.title
    });

    if (!response?.ok) {
      throw new Error(response?.error ?? "Could not translate this text.");
    }

    updateInlineTranslation(inline, response.result.translatedText);
  } catch (error) {
    updateInlineTranslation(
      inline,
      error instanceof Error ? error.message : "Could not translate this text.",
      "iqt-error"
    );
  }
}

function insertInlineTranslation({ range, originalText, translatedText, stateClass = "" }) {
  const wrapper = document.createElement("span");
  wrapper.className = `iqt-inline ${stateClass}`.trim();
  wrapper.setAttribute("data-iqt-inline", "true");
  wrapper.dataset.originalText = originalText;
  wrapper.dataset.translatedText = translatedText;

  const textNode = document.createElement("button");
  textNode.className = "iqt-inline-text";
  textNode.type = "button";
  textNode.title = "Open reading tools";
  textNode.textContent = `[${translatedText}]`;
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
  wrapper.className = `iqt-inline ${stateClass}`.trim();
  wrapper.dataset.translatedText = translatedText;
  const textNode = wrapper.querySelector(".iqt-inline-text");

  if (textNode) {
    textNode.textContent = `[${translatedText}]`;
  }
}

function showInlinePanel(inline) {
  removePanel();

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
    const response = await chrome.runtime.sendMessage({
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
}

function normalizeSelection(text) {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
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
