# Inline Quick Translate

Chrome Extension MV3 MVP for selecting text on a webpage and inserting a quick translation inline beside the original text.

## Current MVP

- Select text on any webpage.
- Click the blue translate button.
- The extension inserts the translation immediately after the selection.
- Click the red `x` beside the inserted translation to remove it.
- Translation providers are modular:
  - `mock` for UI testing without keys.
  - `google` for Google Cloud Translation API.
  - `openai` for OpenAI Responses API.
  - `gemini` for Gemini Developer API.

## Load In Chrome

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select this folder.
5. Open the extension settings and choose a provider.

## Provider Notes

`mock` is enabled by default and returns `[vi] selected text` so the inline UX can be tested immediately.

For Google Cloud Translation, set:

- Provider: `Google Cloud Translation`
- Target language: `vi`
- Google API key: your Google Cloud Translation API key

For OpenAI, set:

- Provider: `OpenAI`
- Target language: `vi`
- OpenAI API key
- OpenAI model, for example `gpt-4o-mini`

For Gemini, set:

- Provider: `Gemini`
- Target language: `vi`
- Gemini API key from Google AI Studio
- Gemini model, for example `gemini-2.5-flash`

The UI and translation provider are intentionally separate, so replacing the translation engine later only requires adding or editing files under `src/background/translation/providers`.
