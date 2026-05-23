const MAX_REFERENCE_FILE_BYTES = 10 * 1024 * 1024;
const REFERENCE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const TILE_COLORS = ["#263238", "#0f766e", "#475569", "#7c3aed", "#be123c", "#2563eb", "#b45309", "#155e75"];

const state = {
  catalog: { hairstyles: [], colors: [] },
  login: "",
  editingHairstyleId: "",
  referenceObjectUrl: "",
};

const root = document.querySelector("#admin-app");
const modeBadge = document.querySelector("#admin-mode");

let ui = {};

showLoginScreen();

function showLoginScreen(message = "") {
  state.catalog = { hairstyles: [], colors: [] };
  state.editingHairstyleId = "";
  if (state.referenceObjectUrl) URL.revokeObjectURL(state.referenceObjectUrl);
  state.referenceObjectUrl = "";

  setMode("Login", false);
  root.innerHTML = `
    <section class="admin-panel admin-auth-panel admin-login-card">
      <div class="block-title">
        <div>
          <p class="eyebrow">Access</p>
          <h2>Вход в админку</h2>
        </div>
        <span class="status-pill mock">Locked</span>
      </div>
      <form class="admin-form auth-form" id="login-form">
        <label>
        Логин
          <input name="login" autocomplete="username" required />
        </label>
        <label>
        Пароль
          <input name="password" type="password" autocomplete="current-password" required />
        </label>
        <button class="primary-button" type="submit">
          <span>Войти в админку</span>
        </button>
      </form>
      <p class="form-message ${message ? "error" : ""}" id="auth-message" role="status">${escapeHtml(message)}</p>
    </section>
  `;

  const loginForm = document.querySelector("#login-form");
  loginForm.addEventListener("submit", handleLoginSubmit);
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = formData(form);
  const message = document.querySelector("#auth-message");
  setMessage(message, "Проверяю доступ...", "");

  try {
    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        login: data.login.trim(),
        password: data.password,
      }),
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || result.details || "Не удалось войти");
    }

    state.login = result.login || data.login.trim();
    await loadCatalog();
    renderAdminPanel();
  } catch (error) {
    setMessage(message, error.message, "error");
  }
}

async function loadCatalog() {
  const response = await fetch("/api/catalog");
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || data.details || "Не удалось загрузить каталог");
  }

  state.catalog = data.catalog;
}

function renderAdminPanel() {
  setMode(`Admin: ${state.login}`, true);
  root.innerHTML = `
    <div class="admin-dashboard">
      <aside class="admin-panel admin-side-panel">
        <div class="block-title">
          <div>
            <p class="eyebrow">Control</p>
            <h2>Панель</h2>
          </div>
        </div>
        <div class="admin-stat-grid">
          <article>
            <strong>${state.catalog.hairstyles.length}</strong>
            <span>причесок</span>
          </article>
          <article>
            <strong>${state.catalog.colors.length}</strong>
            <span>цветов</span>
          </article>
        </div>
        <button class="primary-button" id="save-catalog" type="button">
          <span>Сохранить каталог</span>
        </button>
        <p class="form-message" id="admin-message" role="status"></p>

        <div class="admin-divider"></div>
        <p class="eyebrow">Account</p>
        <p class="muted" id="admin-user">Вы вошли как ${escapeHtml(state.login)}</p>
        <form class="admin-form account-form" id="password-form">
          <label class="full-field">
            Текущий пароль
            <input name="currentPassword" type="password" autocomplete="current-password" required />
          </label>
          <label class="full-field">
            Новый пароль
            <input name="newPassword" type="password" autocomplete="new-password" minlength="8" required />
          </label>
          <label class="full-field">
            Повторите пароль
            <input name="repeatPassword" type="password" autocomplete="new-password" minlength="8" required />
          </label>
          <button class="secondary-button" type="submit">Сменить пароль</button>
        </form>
        <button class="danger-button" id="logout-button" type="button">Выйти</button>
        <p class="form-message" id="account-message" role="status"></p>
      </aside>

      <section class="admin-main-stack">
        <section class="admin-panel admin-editor-panel">
          <div class="block-title">
            <div>
              <p class="eyebrow">Editor</p>
              <h2 id="hairstyle-form-title">Новая прическа</h2>
            </div>
            <span class="status-pill admin-hint-pill">Референс</span>
          </div>
          ${renderHairstyleForm()}
        </section>

        <section class="admin-panel catalog-panel">
          <div class="block-title">
            <div>
              <p class="eyebrow">Catalog</p>
              <h2>Текущие прически</h2>
            </div>
            <span id="catalog-count">${state.catalog.hairstyles.length} причесок</span>
          </div>
          <div class="admin-list" id="catalog-list">${renderHairstyleRows()}</div>
        </section>

        <section class="admin-panel color-admin-panel">
          <div class="block-title">
            <div>
              <p class="eyebrow">Colors</p>
              <h2>Цвета</h2>
            </div>
            <span class="field-note">Сейчас основной сценарий - родной цвет волос.</span>
          </div>
          ${renderColorForm()}
          <div class="admin-list color-list" id="color-list">${renderColorRows()}</div>
        </section>
      </section>
    </div>
  `;

  cacheUi();
  bindPanelEvents();
  resetHairstyleForm();
}

function renderHairstyleForm() {
  return `
    <form class="admin-form" id="hairstyle-form">
      <label>
        Название
        <input name="title" placeholder="Например: Зачес назад" required />
      </label>
      <label>
        ID
        <input name="id" placeholder="slicked-back" />
      </label>
      <label class="full-field">
        Короткое описание
        <textarea name="description" rows="3" placeholder="Что именно должно получиться: длина, виски, верх, переход."></textarea>
      </label>
      <label class="full-field">
        Картинка карточки
        <input name="previewFile" type="file" accept="image/png,image/jpeg,image/webp" />
        <span class="field-note">Если не загрузить картинку, карточка будет однотонной.</span>
      </label>
      <div class="card-preview-box full-field">
        <div class="card-preview-tile" id="card-preview-tile" style="--tile-accent:#38d9ff">
          <span>Однотонная карточка</span>
        </div>
        <span class="source-file-pill" id="preview-file-value">Картинка карточки не выбрана</span>
      </div>
      <label class="full-field">
        Референс прически
        <input name="referenceFile" type="file" accept="image/png,image/jpeg,image/webp" />
        <span class="field-note">Лучше работает фото прически на человеке или манекене: лицо видно, волосы не закрыты, без коллажей.</span>
      </label>
      <div class="reference-uploader full-field">
        <div class="reference-preview" id="reference-preview">
          <span>Референс не выбран</span>
        </div>
        <div class="reference-copy">
          <strong>Что важно для качества</strong>
          <p>Выбирайте пример с нужной формой, похожим ракурсом и чистой линией волос. Чем точнее пример, тем стабильнее генерация.</p>
          <span class="source-file-pill" id="source-file-value">Локальный файл не выбран</span>
        </div>
      </div>
      <input name="sourceFile" type="hidden" />
      <input name="sourceImage" type="hidden" />
      <input name="previewImage" type="hidden" />
      <input name="apiName" type="hidden" />
      <input name="accent" type="hidden" />
      <input name="hairProperty" type="hidden" value="natural" />
      <div class="button-row full-field">
        <button class="primary-button" id="hairstyle-submit" type="submit">
          <span>Добавить прическу</span>
        </button>
        <button class="secondary-button" id="reset-hairstyle-form" type="button">Очистить</button>
      </div>
    </form>
  `;
}

function renderColorForm() {
  return `
    <form class="admin-form compact-admin-form" id="color-form">
      <label>
        Название
        <input name="title" placeholder="Черный" required />
      </label>
      <label>
        ID
        <input name="id" placeholder="black" />
      </label>
      <label>
        API color
        <input name="apiName" list="color-api-values" placeholder="black" required />
      </label>
      <label>
        Цвет
        <input name="hex" type="color" value="#111111" />
      </label>
      <button class="secondary-button" type="submit">Добавить цвет</button>
      <datalist id="color-api-values">
        <option value="black"></option>
        <option value="brown"></option>
        <option value="blond"></option>
        <option value="gray"></option>
        <option value="white"></option>
        <option value="red"></option>
        <option value="orange"></option>
        <option value="yellow"></option>
        <option value="green"></option>
        <option value="blue"></option>
        <option value="purple"></option>
        <option value="pink"></option>
      </datalist>
    </form>
  `;
}

function cacheUi() {
  ui = {
    hairstyleForm: document.querySelector("#hairstyle-form"),
    hairstyleFormTitle: document.querySelector("#hairstyle-form-title"),
    hairstyleSubmit: document.querySelector("#hairstyle-submit span"),
    resetHairstyleForm: document.querySelector("#reset-hairstyle-form"),
    cardPreviewTile: document.querySelector("#card-preview-tile"),
    previewFileValue: document.querySelector("#preview-file-value"),
    referencePreview: document.querySelector("#reference-preview"),
    sourceFileValue: document.querySelector("#source-file-value"),
    colorForm: document.querySelector("#color-form"),
    list: document.querySelector("#catalog-list"),
    colorList: document.querySelector("#color-list"),
    count: document.querySelector("#catalog-count"),
    saveButton: document.querySelector("#save-catalog"),
    passwordForm: document.querySelector("#password-form"),
    logoutButton: document.querySelector("#logout-button"),
    accountMessage: document.querySelector("#account-message"),
    message: document.querySelector("#admin-message"),
  };
}

function bindPanelEvents() {
  ui.passwordForm.addEventListener("submit", handlePasswordSubmit);
  ui.logoutButton.addEventListener("click", handleLogout);
  ui.hairstyleForm.addEventListener("submit", handleHairstyleSubmit);
  ui.hairstyleForm.elements.previewFile.addEventListener("change", handleCardPreviewUpload);
  ui.hairstyleForm.elements.referenceFile.addEventListener("change", handleReferenceUpload);
  ui.resetHairstyleForm.addEventListener("click", resetHairstyleForm);
  ui.colorForm.addEventListener("submit", handleColorSubmit);
  ui.list.addEventListener("click", handleHairstyleListClick);
  ui.colorList.addEventListener("click", handleColorListClick);
  ui.saveButton.addEventListener("click", saveCatalog);
}

async function handlePasswordSubmit(event) {
  event.preventDefault();
  const data = formData(event.currentTarget);

  if (data.newPassword !== data.repeatPassword) {
    setMessage(ui.accountMessage, "Новые пароли не совпадают.", "error");
    return;
  }

  setMessage(ui.accountMessage, "Меняю пароль...", "");

  try {
    const response = await fetch("/api/admin/password", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      }),
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || result.details || "Не удалось сменить пароль");
    }

    event.currentTarget.reset();
    setMessage(ui.accountMessage, "Пароль изменен.", "success");
  } catch (error) {
    setMessage(ui.accountMessage, error.message, "error");
  }
}

async function handleLogout() {
  await fetch("/api/admin/logout", { method: "POST" });
  state.login = "";
  showLoginScreen();
}

async function handleHairstyleSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = formData(form);
  const title = data.title.trim();
  const apiName = (data.apiName || "").trim() || buildStyleLabel(title, data.description);
  const previous = state.catalog.hairstyles.find((hairstyle) => hairstyle.id === state.editingHairstyleId);
  const item = {
    id: data.id.trim() || slugify(title),
    title,
    description: data.description.trim(),
    apiName,
    tryitonName: apiName,
    hairProperty: data.hairProperty.trim() || "natural",
    accent: data.accent || previous?.accent || pickTileColor(data.id || title),
    previewImage: data.previewImage.trim(),
    sourceImage: (data.sourceImage || previous?.sourceImage || "").trim(),
    sourceFile: data.sourceFile.trim(),
  };

  if (!item.title) {
    setMessage(ui.message, "Заполните название прически.", "error");
    return;
  }

  if (!item.id) {
    setMessage(ui.message, "Не удалось создать ID. Укажите его вручную латиницей.", "error");
    return;
  }

  if (!item.sourceFile && !item.sourceImage) {
    setMessage(ui.message, "Добавьте референс прически.", "error");
    return;
  }

  const duplicate = state.catalog.hairstyles.find(
    (hairstyle) => hairstyle.id === item.id && hairstyle.id !== state.editingHairstyleId,
  );
  if (duplicate) {
    setMessage(ui.message, `ID "${item.id}" уже занят. Измените ID или отредактируйте существующую прическу.`, "error");
    return;
  }

  if (state.editingHairstyleId) {
    const index = state.catalog.hairstyles.findIndex((hairstyle) => hairstyle.id === state.editingHairstyleId);
    if (index >= 0) {
      state.catalog.hairstyles[index] = item;
    } else {
      state.catalog.hairstyles.push(item);
    }
    setMessage(ui.message, "Прическа обновлена. Сохраняю каталог...", "");
  } else {
    state.catalog.hairstyles.push(item);
    setMessage(ui.message, "Прическа добавлена. Сохраняю каталог...", "");
  }

  updateCatalogViews();
  resetHairstyleForm();
  await persistCatalog("Прическа сохранена.", "Прическа добавлена локально, но не сохранилась на сервере.");
}

async function handleCardPreviewUpload(event) {
  const file = event.currentTarget.files[0];
  if (!file) return;

  if (!REFERENCE_TYPES.has(file.type)) {
    setMessage(ui.message, "Картинка карточки должна быть PNG, JPEG или WEBP.", "error");
    event.currentTarget.value = "";
    return;
  }

  if (file.size > MAX_REFERENCE_FILE_BYTES) {
    setMessage(ui.message, "Картинка карточки слишком большая. Максимум 10 МБ.", "error");
    event.currentTarget.value = "";
    return;
  }

  setMessage(ui.message, "Загружаю картинку карточки...", "");

  try {
    const imageDataUrl = await readFileAsDataUrl(file);
    const response = await fetch("/api/card-preview-upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: file.name, imageDataUrl }),
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.details || "Не удалось загрузить картинку карточки");
    }

    ui.hairstyleForm.elements.previewImage.value = data.previewUrl;
    ui.previewFileValue.textContent = data.previewFile;
    setCardPreview(data.previewUrl, file.name);
    setMessage(ui.message, "Картинка карточки загружена.", "success");
  } catch (error) {
    if (String(error.message).includes("Войдите")) showLoginScreen("Войдите в админку заново.");
    setMessage(ui.message, error.message, "error");
  }
}

async function handleReferenceUpload(event) {
  const file = event.currentTarget.files[0];
  if (!file) return;

  if (!REFERENCE_TYPES.has(file.type)) {
    setMessage(ui.message, "Референс должен быть PNG, JPEG или WEBP.", "error");
    event.currentTarget.value = "";
    return;
  }

  if (file.size > MAX_REFERENCE_FILE_BYTES) {
    setMessage(ui.message, "Референс слишком большой. Максимум 10 МБ.", "error");
    event.currentTarget.value = "";
    return;
  }

  showLocalReferencePreview(file);
  setMessage(ui.message, "Загружаю референс прически...", "");

  try {
    const imageDataUrl = await readFileAsDataUrl(file);
    const response = await fetch("/api/reference-upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: file.name, imageDataUrl }),
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.details || "Не удалось загрузить reference");
    }

    ui.hairstyleForm.elements.sourceFile.value = data.sourceFile;
    ui.sourceFileValue.textContent = data.sourceFile;
    setReferencePreview(data.previewUrl, "Загруженный референс");
    setMessage(ui.message, "Референс загружен. Теперь можно добавить или обновить прическу.", "success");
  } catch (error) {
    if (String(error.message).includes("Войдите")) showLoginScreen("Войдите в админку заново.");
    setMessage(ui.message, error.message, "error");
  }
}

function handleColorSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = formData(form);
  const title = data.title.trim();
  const item = {
    id: data.id.trim() || slugify(title),
    title,
    apiName: data.apiName.trim(),
    tryitonName: data.apiName.trim(),
    hex: data.hex || "#111111",
  };

  if (!item.title || !item.apiName || !item.id) {
    setMessage(ui.message, "Заполните название, ID и API color.", "error");
    return;
  }

  if (state.catalog.colors.some((color) => color.id === item.id)) {
    setMessage(ui.message, `Цвет с ID "${item.id}" уже есть в каталоге.`, "error");
    return;
  }

  state.catalog.colors.push(item);
  form.reset();
  form.elements.hex.value = "#111111";
  updateCatalogViews();
  setMessage(ui.message, "Цвет добавлен. Сохраняю каталог...", "");
  persistCatalog("Цвет сохранен.", "Цвет добавлен локально, но не сохранился на сервере.");
}

function handleHairstyleListClick(event) {
  const editButton = event.target.closest("[data-edit-style]");
  if (editButton) {
    editHairstyle(editButton.dataset.editStyle);
    return;
  }

  const removeButton = event.target.closest("[data-remove-style]");
  if (!removeButton) return;

  const id = removeButton.dataset.removeStyle;
  state.catalog.hairstyles = state.catalog.hairstyles.filter((item) => item.id !== id);
  if (state.editingHairstyleId === id) resetHairstyleForm();
  updateCatalogViews();
  setMessage(ui.message, "Прическа удалена. Сохраняю каталог...", "");
  persistCatalog("Прическа удалена.", "Прическа удалена локально, но каталог не сохранился на сервере.");
}

function handleColorListClick(event) {
  const removeButton = event.target.closest("[data-remove-color]");
  if (!removeButton) return;

  const id = removeButton.dataset.removeColor;
  state.catalog.colors = state.catalog.colors.filter((item) => item.id !== id);
  updateCatalogViews();
  setMessage(ui.message, "Цвет удален. Сохраняю каталог...", "");
  persistCatalog("Цвет удален.", "Цвет удален локально, но каталог не сохранился на сервере.");
}

function editHairstyle(id) {
  const item = state.catalog.hairstyles.find((hairstyle) => hairstyle.id === id);
  if (!item) return;

  const form = ui.hairstyleForm;
  state.editingHairstyleId = item.id;
  setField(form, "title", item.title);
  setField(form, "id", item.id);
  setField(form, "description", item.description);
  setField(form, "apiName", item.apiName);
  setField(form, "hairProperty", item.hairProperty || "natural");
  setField(form, "accent", item.accent || "#38d9ff");
  setField(form, "previewImage", item.previewImage);
  setField(form, "sourceImage", item.sourceImage);
  setField(form, "sourceFile", item.sourceFile);
  form.elements.referenceFile.value = "";
  form.elements.previewFile.value = "";
  ui.hairstyleFormTitle.textContent = "Редактирование";
  ui.hairstyleSubmit.textContent = "Обновить прическу";
  ui.sourceFileValue.textContent = item.sourceFile || (item.sourceImage ? "Используется URL reference" : "Локальный файл не выбран");
  ui.previewFileValue.textContent = item.previewImage ? "Картинка карточки выбрана" : "Картинка карточки не выбрана";
  setCardPreview(item.previewImage, item.title, item.accent);
  setReferencePreview(hairstylePreviewUrl(item), item.title);
  ui.hairstyleForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function resetHairstyleForm() {
  state.editingHairstyleId = "";
  ui.hairstyleForm.reset();
  ui.hairstyleFormTitle.textContent = "Новая прическа";
  ui.hairstyleSubmit.textContent = "Добавить прическу";
  setField(ui.hairstyleForm, "accent", "");
  setField(ui.hairstyleForm, "hairProperty", "natural");
  ui.sourceFileValue.textContent = "Локальный файл не выбран";
  ui.previewFileValue.textContent = "Картинка карточки не выбрана";
  setCardPreview("", "Однотонная карточка", "#38d9ff");
  setReferencePreview("", "Референс не выбран");
}

async function saveCatalog() {
  await persistCatalog("Каталог сохранен.", "Ошибка сохранения");
}

async function persistCatalog(successMessage, fallbackErrorMessage) {
  setMessage(ui.message, "Сохраняю каталог...", "");
  if (ui.saveButton) ui.saveButton.disabled = true;

  try {
    const response = await fetch("/api/catalog", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ catalog: state.catalog }),
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.details || "Ошибка сохранения");
    }

    state.catalog = data.catalog;
    updateCatalogViews();
    setMessage(ui.message, successMessage, "success");
  } catch (error) {
    if (String(error.message).includes("Войдите")) showLoginScreen("Войдите в админку заново.");
    setMessage(ui.message, error.message || fallbackErrorMessage, "error");
  } finally {
    if (ui.saveButton) ui.saveButton.disabled = false;
  }
}

function updateCatalogViews() {
  ui.count.textContent = `${state.catalog.hairstyles.length} причесок`;
  ui.list.innerHTML = renderHairstyleRows();
  ui.colorList.innerHTML = renderColorRows();
  const statValues = document.querySelectorAll(".admin-stat-grid strong");
  if (statValues[0]) statValues[0].textContent = state.catalog.hairstyles.length;
  if (statValues[1]) statValues[1].textContent = state.catalog.colors.length;
}

function renderHairstyleRows() {
  return state.catalog.hairstyles.map(renderHairstyleRow).join("") || '<p class="muted">Пока нет причесок</p>';
}

function renderColorRows() {
  return state.catalog.colors.map(renderColorRow).join("") || '<p class="muted">Пока нет цветов</p>';
}

function renderHairstyleRow(item) {
  const preview = cardPreviewUrl(item);
  const marker = preview
    ? `<img class="admin-thumb" src="${escapeHtml(preview)}" alt="">`
    : `<i style="background:${escapeHtml(item.accent || "#38d9ff")}" aria-hidden="true"></i>`;
  const referenceType = item.sourceFile ? "local ref" : item.sourceImage ? "url ref" : "no ref";

  return `
    <article class="admin-row">
      ${marker}
      <span>
        <strong>${escapeHtml(item.title)}</strong>
        <small>${escapeHtml(item.id)} · ${escapeHtml(referenceType)}</small>
      </span>
      <div class="admin-row-actions">
        <button class="secondary-button mini-button" type="button" data-edit-style="${escapeHtml(item.id)}">Редактировать</button>
        <button class="danger-button mini-button" type="button" data-remove-style="${escapeHtml(item.id)}">Удалить</button>
      </div>
    </article>
  `;
}

function renderColorRow(item) {
  return `
    <article class="admin-row compact-row">
      <i style="background:${escapeHtml(item.hex || "#111111")}" aria-hidden="true"></i>
      <span>
        <strong>${escapeHtml(item.title)}</strong>
        <small>${escapeHtml(item.id)} · ${escapeHtml(item.apiName)}</small>
      </span>
      <div class="admin-row-actions">
        <button class="danger-button mini-button" type="button" data-remove-color="${escapeHtml(item.id)}">Удалить</button>
      </div>
    </article>
  `;
}

function showLocalReferencePreview(file) {
  if (state.referenceObjectUrl) URL.revokeObjectURL(state.referenceObjectUrl);
  state.referenceObjectUrl = URL.createObjectURL(file);
  setReferencePreview(state.referenceObjectUrl, file.name, true);
  ui.sourceFileValue.textContent = `${file.name} · загрузка...`;
}

function setReferencePreview(url, alt, keepObjectUrl = false) {
  if (state.referenceObjectUrl && state.referenceObjectUrl !== url && !keepObjectUrl) {
    URL.revokeObjectURL(state.referenceObjectUrl);
    state.referenceObjectUrl = "";
  }

  if (!url) {
    ui.referencePreview.innerHTML = "<span>Референс не выбран</span>";
    return;
  }

  ui.referencePreview.innerHTML = `<img src="${escapeHtml(url)}" alt="${escapeHtml(alt || "Референс")}">`;
}

function setCardPreview(url, alt, accent = "#38d9ff") {
  ui.cardPreviewTile.style.setProperty("--tile-accent", accent || "#38d9ff");

  if (!url) {
    ui.cardPreviewTile.innerHTML = "<span>Однотонная карточка</span>";
    return;
  }

  ui.cardPreviewTile.innerHTML = `<img src="${escapeHtml(url)}" alt="${escapeHtml(alt || "Картинка карточки")}">`;
}

function cardPreviewUrl(item) {
  return item.previewImage || "";
}

function hairstylePreviewUrl(item) {
  if (item.sourceFile) {
    return `/api/reference-image?path=${encodeURIComponent(item.sourceFile)}`;
  }
  return item.sourceImage || item.previewImage || "";
}

function setMode(text, isLive) {
  modeBadge.textContent = text;
  modeBadge.classList.toggle("live", Boolean(isLive));
  modeBadge.classList.toggle("mock", !isLive);
}

function setMessage(element, text, type) {
  if (!element) return;
  element.textContent = text;
  element.classList.toggle("error", type === "error");
  element.classList.toggle("success", type === "success");
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
    reader.readAsDataURL(file);
  });
}

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function setField(form, name, value) {
  if (form.elements[name]) {
    form.elements[name].value = value || "";
  }
}

function slugify(value) {
  const fallback = `style-${Date.now()}`;
  const slug = transliterate(value)
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || fallback;
}

function buildStyleLabel(title, description) {
  const text = `${title || ""} ${description || ""}`.trim();
  return text || "custom hairstyle";
}

function pickTileColor(value) {
  const text = String(value || "");
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  return TILE_COLORS[hash % TILE_COLORS.length] || "#38d9ff";
}

function transliterate(value) {
  const map = {
    а: "a",
    б: "b",
    в: "v",
    г: "g",
    д: "d",
    е: "e",
    ё: "e",
    ж: "zh",
    з: "z",
    и: "i",
    й: "y",
    к: "k",
    л: "l",
    м: "m",
    н: "n",
    о: "o",
    п: "p",
    р: "r",
    с: "s",
    т: "t",
    у: "u",
    ф: "f",
    х: "h",
    ц: "c",
    ч: "ch",
    ш: "sh",
    щ: "sch",
    ы: "y",
    э: "e",
    ю: "yu",
    я: "ya",
    ь: "",
    ъ: "",
  };

  return String(value || "").replace(/[а-яё]/gi, (letter) => map[letter.toLowerCase()] || "");
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
