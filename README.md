# Chrome Inline Translator

A lightweight Chrome extension for reading foreign-language webpages without losing your place. Select text, click the floating translate button, and the translation appears inline right beside the original sentence.

The extension is built around a provider adapter layer, so the reading experience stays the same while the translation engine can be swapped between Gemini, OpenAI, Google Cloud Translation, or a mock provider for local UI testing.

## Features

- Inline translation beside selected webpage text
- Floating selection toolbar
- Removable inline translations
- Translation cache for repeated selections
- Clickable inline translations with a compact reading-tools panel
- Reading actions for explain, summarize, grammar, phrases, and rewrite
- `Alt+T` shortcut for translating the current selection
- `Alt+E`, `Alt+S`, `Alt+G`, and `Alt+P` shortcuts for reading actions
- Provider fallback when another configured provider can handle the request
- Inline, compact, and block placement modes
- Recent translation history and vocabulary capture
- Provider test, clear cache, and clear history controls
- Modular translation providers
- Gemini Developer API support
- OpenAI Responses API support
- Google Cloud Translation API support
- Mock provider for zero-key local testing

## Installation

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this repository folder.
5. Open any webpage, select text, and click the blue `T` button.

After changing extension source code, reload the extension from `chrome://extensions` and refresh the webpage you are testing.

Tip: select text and press `Alt+T` to translate without using the mouse. Click an inline translation to open reading tools or remove it. Use `Alt+E`, `Alt+S`, `Alt+G`, and `Alt+P` for explain, summarize, grammar, and phrases.

## Provider Setup

Open the extension popup and click **Settings**.

### Gemini

Gemini is a good default for this extension because it has a developer free tier and works well for short contextual translations.

1. Create a key in [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Set provider to `Gemini`.
3. Paste the Gemini API key.
4. Use `gemini-2.5-flash-lite` as the model unless you have a reason to change it.
5. Set target language to `vi` or your preferred language code.

### OpenAI

OpenAI is useful if you want high-quality contextual translation and later AI reading actions.

1. Create a key in [OpenAI Platform](https://platform.openai.com/api-keys).
2. Make sure API billing or credits are active.
3. Set provider to `OpenAI`.
4. Paste the OpenAI API key.
5. Use a compact model such as `gpt-4o-mini`.

ChatGPT Plus/Pro does not include OpenAI API quota. The API is billed separately.

### Google Cloud Translation

Google Cloud Translation is a strong option for fast, direct translation.

1. Create a Google Cloud project.
2. Enable Cloud Translation API.
3. Create an API key.
4. Set provider to `Google Cloud Translation`.
5. Paste the key and set the target language.

Google Cloud Translation has a monthly free tier for standard text translation, but billing setup may still be required.

### Mock

The mock provider requires no key. It returns `[target-language] selected text`, which is useful for testing the extension UI.

## Project Structure

```txt
manifest.json
src/
  background/
    background.js
    translation/
      index.js
      providers/
        gemini.js
        google.js
        mock.js
        openai.js
  content/
    content.js
    content.css
  options/
    options.html
    options.css
    options.js
  popup/
    popup.html
    popup.css
    popup.js
```

## Development Notes

- `src/content` owns the webpage UI: selection toolbar, inline translations, and reading controls.
- `src/background` owns provider calls and API key access.
- `src/background/translation/providers` contains provider-specific adapters.
- API keys are stored with `chrome.storage.sync`.
- Translation history, vocabulary, and cache entries are stored with `chrome.storage.local`.

## Roadmap

- Optional reading mode for translating paragraph-by-paragraph
- Exportable vocabulary/history lists
- Better provider-specific error messages
