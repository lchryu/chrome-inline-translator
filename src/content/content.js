const TOOLBAR_ID = "iqt-toolbar";
const MIN_SELECTION_LENGTH = 1;

let selectedRange = null;
let selectedText = "";
let toolbar = null;

document.addEventListener("mouseup", () => {
  window.setTimeout(handleSelectionChange, 0);
});

document.addEventListener("keyup", (event) => {
  if (event.key === "Escape") {
    removeToolbar();
    return;
  }

  handleSelectionChange();
});

document.addEventListener("scroll", removeToolbar, true);

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
  translateButton.title = "Dịch nhanh";
  translateButton.textContent = "T";
  translateButton.addEventListener("mousedown", (event) => event.preventDefault());
  translateButton.addEventListener("click", translateSelectionInline);

  const closeButton = document.createElement("button");
  closeButton.className = "iqt-button";
  closeButton.type = "button";
  closeButton.title = "Đóng";
  closeButton.textContent = "x";
  closeButton.addEventListener("mousedown", (event) => event.preventDefault());
  closeButton.addEventListener("click", removeToolbar);

  element.append(translateButton, closeButton);
  return element;
}

async function translateSelectionInline() {
  if (!selectedRange || !selectedText) {
    showToast("Không tìm thấy đoạn text đã chọn.");
    return;
  }

  const inline = insertInlineTranslation(selectedRange, "Đang dịch...", "iqt-loading");
  removeToolbar();

  try {
    const response = await chrome.runtime.sendMessage({
      type: "TRANSLATE_SELECTION",
      text: selectedText,
      pageUrl: window.location.href,
      pageTitle: document.title
    });

    if (!response?.ok) {
      throw new Error(response?.error ?? "Không dịch được đoạn này.");
    }

    updateInlineTranslation(inline, response.result.translatedText);
  } catch (error) {
    updateInlineTranslation(
      inline,
      error instanceof Error ? error.message : "Không dịch được đoạn này.",
      "iqt-error"
    );
  }
}

function insertInlineTranslation(range, text, stateClass = "") {
  const wrapper = document.createElement("span");
  wrapper.className = `iqt-inline ${stateClass}`.trim();
  wrapper.setAttribute("data-iqt-inline", "true");

  const textNode = document.createElement("span");
  textNode.className = "iqt-inline-text";
  textNode.textContent = `[${text}]`;

  const close = document.createElement("button");
  close.className = "iqt-inline-close";
  close.type = "button";
  close.title = "Xóa bản dịch";
  close.textContent = "x";
  close.addEventListener("click", () => wrapper.remove());

  wrapper.append(textNode, close);

  const insertionRange = range.cloneRange();
  insertionRange.collapse(false);
  insertionRange.insertNode(wrapper);

  window.getSelection()?.removeAllRanges();
  return wrapper;
}

function updateInlineTranslation(wrapper, text, stateClass = "") {
  wrapper.className = `iqt-inline ${stateClass}`.trim();
  const textNode = wrapper.querySelector(".iqt-inline-text");

  if (textNode) {
    textNode.textContent = `[${text}]`;
  }
}

function removeToolbar() {
  toolbar?.remove();
}

function isInsideExtensionUi(node) {
  const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  return Boolean(element?.closest?.(`#${TOOLBAR_ID}, [data-iqt-inline="true"]`));
}

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "iqt-toast";
  toast.textContent = message;
  document.documentElement.appendChild(toast);
  window.setTimeout(() => toast.remove(), 2800);
}
