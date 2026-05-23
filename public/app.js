const STEP_ORDER = ["upload", "style", "color"];

const nativeColorOption = {
  id: "native",
  title: "Родной цвет",
  apiName: "preserve original hair color",
  hex: "#2f2a26",
  native: true,
};

const state = {
  imageDataUrl: "",
  selectedStyle: "",
  selectedColor: "",
  step: "upload",
  isLoading: false,
  engine: "",
  hairstyles: [],
  colors: [],
};

const elements = {
  form: document.querySelector("#tryon-form"),
  input: document.querySelector("#photo-input"),
  fileLabel: document.querySelector("#file-label"),
  nextUploadButton: document.querySelector("#next-upload-button"),
  nextStyleButton: document.querySelector("#next-style-button"),
  backStyleButton: document.querySelector("#back-style-button"),
  backColorButton: document.querySelector("#back-color-button"),
  stylesGrid: document.querySelector("#styles-grid"),
  colorsGrid: document.querySelector("#colors-grid"),
  styleCount: document.querySelector("#style-count"),
  colorCount: document.querySelector("#color-count"),
  generateButton: document.querySelector("#generate-button"),
  message: document.querySelector("#form-message"),
  summary: document.querySelector("#selection-summary"),
  frontImage: document.querySelector("#front-image"),
  frontPlaceholder: document.querySelector("#front-placeholder"),
  frontText: document.querySelector("#front-text"),
  previewGrid: document.querySelector("#preview-grid"),
  panels: [...document.querySelectorAll(".flow-panel")],
  steps: [...document.querySelectorAll(".step-pill")],
};

init();

async function init() {
  try {
    const response = await fetch("/api/config");
    const config = await response.json();
    state.engine = config.engine || "";
    state.hairstyles = config.hairstyles || [];
    state.colors = [nativeColorOption, ...(config.colors || [])];
    if (state.colors.length === 1) {
      state.selectedColor = state.colors[0].id;
    }

    renderMode(config.mode);
    renderHairstyles();
    renderColors();
    renderColorMode();
    bindEvents();
    updateControls();
  } catch (error) {
    setMessage(`Не удалось загрузить конфигурацию: ${error.message}`, "error");
  }
}

function bindEvents() {
  elements.input.addEventListener("change", handleFileChange);
  elements.form.addEventListener("submit", handleSubmit);
  elements.nextUploadButton.addEventListener("click", () => setStep("style"));
  elements.nextStyleButton.addEventListener("click", () => {
    if (isColorLockedToNative()) {
      elements.form.requestSubmit();
      return;
    }
    setStep("color");
  });
  elements.backStyleButton.addEventListener("click", () => setStep("upload"));
  elements.backColorButton.addEventListener("click", () => setStep("style"));

  elements.steps.forEach((button) => {
    button.addEventListener("click", () => {
      if (!canOpenStep(button.dataset.step)) return;
      setStep(button.dataset.step);
    });
  });

}

function renderMode(mode) {
  return mode;
}

function renderColorMode() {
  const lockedToNative = isColorLockedToNative();
  elements.nextStyleButton.querySelector("span").textContent = lockedToNative
    ? "Сгенерировать"
    : "К выбору цвета";
  elements.steps
    .filter((button) => button.dataset.step === "color")
    .forEach((button) => {
      button.hidden = lockedToNative;
    });
}

function renderHairstyles() {
  elements.styleCount.textContent = `${state.hairstyles.length} вариантов`;
  elements.stylesGrid.innerHTML = state.hairstyles
    .map((style) => {
      return `
        <label class="choice-card hairstyle-card">
          <input type="radio" name="hairstyle" value="${escapeHtml(style.id)}">
          <span class="choice-media">${renderStylePreview(style)}</span>
          <span class="choice-copy">
            <strong>${escapeHtml(style.title)}</strong>
            <small>${escapeHtml(style.description)}</small>
          </span>
        </label>
      `;
    })
    .join("");

  elements.stylesGrid.addEventListener("change", (event) => {
    if (event.target.name === "hairstyle") {
      state.selectedStyle = event.target.value;
      clearResult();
      updateControls();
    }
  });
}

function renderColors() {
  const lockedToNative = isColorLockedToNative();
  elements.colorCount.textContent = lockedToNative
    ? "цвет не меняется"
    : `${state.colors.length} вариантов`;
  elements.colorsGrid.innerHTML = state.colors
    .map((color) => {
      const nativeClass = color.native ? " native-color" : "";
      const swatch = color.native
        ? `<span class="color-swatch native-swatch" aria-hidden="true"></span>`
        : `<span class="color-swatch" style="background:${escapeHtml(color.hex)}" aria-hidden="true"></span>`;
      const description = color.native ? "без изменения цвета" : color.apiName;

      return `
        <label class="choice-card color-card${nativeClass}">
          <input type="radio" name="haircolor" value="${escapeHtml(color.id)}"${state.selectedColor === color.id ? " checked" : ""}>
          ${swatch}
          <span class="choice-copy">
            <strong>${escapeHtml(color.title)}</strong>
            <small>${escapeHtml(description)}</small>
          </span>
        </label>
      `;
    })
    .join("");

  elements.colorsGrid.addEventListener("change", (event) => {
    if (event.target.name === "haircolor") {
      state.selectedColor = event.target.value;
      clearResult();
      updateControls();
    }
  });
}

function renderStylePreview(style) {
  if (style.previewImage) {
    return `<img class="style-preview-img" src="${escapeHtml(style.previewImage)}" alt="">`;
  }

  return `<span class="style-tile" style="--tile-accent:${escapeHtml(style.accent || "#38d9ff")}"></span>`;
}

async function handleFileChange(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  if (!["image/png", "image/jpeg"].includes(file.type)) {
    resetPhoto();
    setMessage("Поддерживаются только PNG и JPEG.", "error");
    return;
  }

  const maxBytes = 6 * 1024 * 1024;
  if (file.size > maxBytes) {
    resetPhoto();
    setMessage("Файл больше 6 МБ. Выберите другое фото.", "error");
    return;
  }

  state.imageDataUrl = await readFileAsDataUrl(file);
  elements.fileLabel.textContent = formatFileName(file.name);
  elements.fileLabel.title = file.name;
  clearResult();
  setMessage("Фото загружено.", "success");
  updateControls();
}

async function handleSubmit(event) {
  event.preventDefault();
  if (!state.imageDataUrl || !state.selectedStyle || !state.selectedColor || state.isLoading) return;

  setLoading(true);
  setMessage("Генерация запущена. Дождитесь итогового изображения.", "");
  clearImage(elements.frontImage);
  elements.frontPlaceholder.hidden = false;

  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageDataUrl: state.imageDataUrl,
        hairstyleId: state.selectedStyle,
        colorId: state.selectedColor,
      }),
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.details || result.error || "Ошибка генерации");
    }

    const generatedUrl = result.resultUrl || result.imageUrl || result.afterUrl || result.frontUrl;
    if (!generatedUrl) {
      throw new Error("API не вернул ссылку на готовое изображение");
    }
    const preparedResult = await prepareResultImage(generatedUrl, {
      cropBeforeAfter: state.engine === "magicapi-hair",
    });
    setImage(elements.frontImage, elements.frontPlaceholder, preparedResult.src, {
      cropRightHalf: preparedResult.cropRightHalf,
    });
    setMessage("Результат готов.", "success");
  } catch (error) {
    elements.frontText.textContent = "Не удалось получить результат";
    setMessage(error.message, "error");
  } finally {
    setLoading(false);
  }
}

function setStep(step) {
  state.step = step;
  elements.panels.forEach((panel) => {
    panel.classList.toggle("is-active", panel.dataset.panel === step);
  });
  elements.steps.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.step === step);
  });
  updateControls();
}

function setLoading(value) {
  state.isLoading = value;
  elements.generateButton.querySelector("span").textContent = value ? "Генерация" : "Сгенерировать";
  elements.frontPlaceholder.classList.toggle("is-loading", value);
  if (value) {
    elements.frontText.textContent = "";
  }
  updateControls();
}

function updateControls() {
  const selectedStyle = state.hairstyles.find((item) => item.id === state.selectedStyle);
  const selectedColor = state.colors.find((item) => item.id === state.selectedColor);

  elements.nextUploadButton.disabled = state.isLoading || !state.imageDataUrl;
  elements.nextStyleButton.disabled = state.isLoading || !selectedStyle;
  elements.generateButton.disabled =
    state.isLoading || !state.imageDataUrl || !selectedStyle || !selectedColor;

  elements.steps.forEach((button) => {
    button.disabled = !canOpenStep(button.dataset.step);
  });

  if (!state.imageDataUrl) {
    elements.summary.textContent =
      isColorLockedToNative()
        ? "Загрузите фото, затем выберите прическу. Цвет волос останется родным."
        : "Загрузите фото, затем выберите прическу и цвет.";
  } else if (!selectedStyle) {
    elements.summary.textContent = "Фото загружено. Выберите прическу.";
  } else if (!selectedColor) {
    elements.summary.textContent =
      isColorLockedToNative()
        ? `${selectedStyle.title}. Цвет волос останется родным.`
        : `${selectedStyle.title}. Выберите цвет или оставьте родной.`;
  } else {
    elements.summary.textContent =
      isColorLockedToNative()
        ? `${selectedStyle.title}. Цвет волос останется родным.`
        : `${selectedStyle.title}, цвет: ${selectedColor.title}`;
  }
}

function canOpenStep(step) {
  if (step === "upload") return true;
  if (step === "style") return Boolean(state.imageDataUrl);
  if (step === "color" && isColorLockedToNative()) return false;
  if (step === "color") return Boolean(state.imageDataUrl && state.selectedStyle);
  return STEP_ORDER.includes(step);
}

function isColorLockedToNative() {
  return state.colors.length === 1 && state.colors[0].native;
}

function clearResult() {
  clearImage(elements.frontImage);
  elements.frontPlaceholder.hidden = false;
  elements.frontText.textContent = "Ожидает генерации";
}

function setMessage(text, type) {
  elements.message.textContent = text;
  elements.message.classList.toggle("error", type === "error");
  elements.message.classList.toggle("success", type === "success");
}

async function prepareResultImage(src, options = {}) {
  if (!options.cropBeforeAfter) {
    return { src, cropRightHalf: false };
  }

  const croppedSrc = await cropRightHalfImage(src);

  if (croppedSrc) {
    return { src: croppedSrc, cropRightHalf: false };
  }

  return { src, cropRightHalf: true };
}

function cropRightHalfImage(src) {
  return new Promise((resolve) => {
    const source = new Image();
    source.crossOrigin = "anonymous";
    source.onload = () => {
      const naturalWidth = source.naturalWidth || 0;
      const naturalHeight = source.naturalHeight || 0;

      if (!looksLikeBeforeAfterImage(naturalWidth, naturalHeight)) {
        resolve("");
        return;
      }

      try {
        const cropWidth = Math.floor(naturalWidth / 2);
        const canvas = document.createElement("canvas");
        canvas.width = cropWidth;
        canvas.height = naturalHeight;

        const context = canvas.getContext("2d");
        if (!context) {
          resolve("");
          return;
        }

        context.drawImage(
          source,
          cropWidth,
          0,
          cropWidth,
          naturalHeight,
          0,
          0,
          cropWidth,
          naturalHeight,
        );
        resolve(canvas.toDataURL("image/png"));
      } catch {
        resolve("");
      }
    };
    source.onerror = () => resolve("");
    source.src = src;
  });
}

function looksLikeBeforeAfterImage(width, height) {
  return width > 0 && height > 0 && width / height >= 1.35;
}

function setImage(image, placeholder, src, options = {}) {
  const frame = image.closest(".image-frame");
  frame?.classList.remove("has-result");
  frame?.classList.toggle("crop-right-result", Boolean(options.cropRightHalf));
  frame?.style.removeProperty("--result-ratio");
  image.onerror = () => {
    frame?.classList.remove("has-result");
    image.classList.remove("has-image");
    image.removeAttribute("src");
    elements.frontText.textContent = "Не удалось загрузить итоговое изображение";
    placeholder.hidden = false;
    setMessage("Изображение сгенерировано, но не загрузилось в браузере. Попробуйте сгенерировать еще раз.", "error");
  };
  image.onload = () => {
    const naturalWidth = image.naturalWidth || 1;
    const naturalHeight = image.naturalHeight || 1;
    const ratio =
      options.cropRightHalf && looksLikeBeforeAfterImage(naturalWidth, naturalHeight)
        ? naturalWidth / 2 / naturalHeight
        : naturalWidth / naturalHeight;

    frame?.style.setProperty("--result-ratio", String(ratio));
    frame?.classList.add("has-result");
    image.classList.add("has-image");
    placeholder.hidden = true;
  };
  image.src = src;
}

function clearImage(image) {
  const frame = image.closest(".image-frame");
  frame?.classList.remove("has-result");
  frame?.classList.remove("crop-right-result");
  frame?.style.removeProperty("--result-ratio");
  image.onload = null;
  image.onerror = null;
  image.removeAttribute("src");
  image.classList.remove("has-image");
}

function resetPhoto() {
  state.imageDataUrl = "";
  elements.fileLabel.textContent = "Выбрать фото";
  elements.fileLabel.removeAttribute("title");
  clearResult();
  updateControls();
}

function formatFileName(name) {
  const value = String(name || "photo");
  if (value.length <= 42) return value;

  const dotIndex = value.lastIndexOf(".");
  const extension = dotIndex > 0 ? value.slice(dotIndex) : "";
  const base = dotIndex > 0 ? value.slice(0, dotIndex) : value;

  return `${base.slice(0, 20)}...${base.slice(-10)}${extension}`;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
    reader.readAsDataURL(file);
  });
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[char];
  });
}
