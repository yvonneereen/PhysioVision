const TEXT_SIZE_STORAGE_KEY = "physiovision.text-size.v1";

export const TEXT_SIZE_OPTIONS = Object.freeze([
  Object.freeze({ value: "standard", label: "Standard", percent: 100 }),
  Object.freeze({ value: "large", label: "Large", percent: 125 }),
  Object.freeze({ value: "extra-large", label: "Extra large", percent: 150 }),
]);

const SUPPORTED_SIZES = new Set(TEXT_SIZE_OPTIONS.map(({ value }) => value));

function readStoredTextSize(storage = globalThis.localStorage) {
  try {
    const stored = storage?.getItem(TEXT_SIZE_STORAGE_KEY);
    if (SUPPORTED_SIZES.has(stored)) return stored;
  } catch (_) {
    // The preference still works for this page when storage is unavailable.
  }
  return "standard";
}

let activeTextSize = readStoredTextSize();

const ANNOUNCEMENTS = Object.freeze({
  "en-SG": Object.freeze({
    standard: "Text size changed to Standard.",
    large: "Text size changed to Large.",
    "extra-large": "Text size changed to Extra large.",
  }),
  "zh-SG": Object.freeze({
    standard: "文字大小已更改为标准。",
    large: "文字大小已更改为大。",
    "extra-large": "文字大小已更改为特大。",
  }),
  "ms-SG": Object.freeze({
    standard: "Saiz teks ditukar kepada Standard.",
    large: "Saiz teks ditukar kepada Besar.",
    "extra-large": "Saiz teks ditukar kepada Sangat besar.",
  }),
  "ta-SG": Object.freeze({
    standard: "உரை அளவு வழக்கமானதாக மாற்றப்பட்டது.",
    large: "உரை அளவு பெரியதாக மாற்றப்பட்டது.",
    "extra-large": "உரை அளவு மிகப் பெரியதாக மாற்றப்பட்டது.",
  }),
});

export function getTextSize() {
  return activeTextSize;
}

function syncTextSizeSelectors(documentObject = globalThis.document) {
  documentObject?.querySelectorAll?.("[data-text-size-selector]")
    .forEach((select) => {
      select.value = activeTextSize;
      if (select.dataset.textSizeBound === "true") return;
      select.dataset.textSizeBound = "true";
      select.addEventListener("change", () => setTextSize(select.value));
    });
}

export function setTextSize(size, {
  persist = true,
  announce = true,
  documentObject = globalThis.document,
  storage = globalThis.localStorage,
} = {}) {
  if (!SUPPORTED_SIZES.has(size)) return false;
  activeTextSize = size;

  if (persist) {
    try {
      storage?.setItem(TEXT_SIZE_STORAGE_KEY, size);
    } catch (_) {
      // Keep the in-memory preference when persistent storage is unavailable.
    }
  }

  if (documentObject?.documentElement) {
    documentObject.documentElement.dataset.textSize = size;
    syncTextSizeSelectors(documentObject);
    if (announce) {
      const selected = TEXT_SIZE_OPTIONS.find(({ value }) => value === size);
      const status = documentObject.getElementById?.("textSizeStatus");
      if (status) {
        const locale = documentObject.documentElement.lang || "en-SG";
        status.textContent = ANNOUNCEMENTS[locale]?.[size]
          ?? `Text size changed to ${selected?.label ?? "Standard"}.`;
      }
    }
  }

  globalThis.window?.dispatchEvent?.(new CustomEvent(
    "physiovision:text-size-change",
    { detail: { size, percent: TEXT_SIZE_OPTIONS.find(({ value }) => value === size)?.percent ?? 100 } }
  ));
  return true;
}

export function initializeTextSize(documentObject = globalThis.document) {
  setTextSize(activeTextSize, {
    persist: false,
    announce: false,
    documentObject,
  });
  return activeTextSize;
}

if (globalThis.document) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => initializeTextSize());
  } else {
    initializeTextSize();
  }
}
