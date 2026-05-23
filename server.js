const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { URL } = require("node:url");
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const cookieParser = require("cookie-parser");

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const CATALOG_PATH = path.join(DATA_DIR, "catalog.json");
const ADMIN_AUTH_PATH = path.join(DATA_DIR, "admin-auth.json");
const REFERENCES_DIR = path.join(DATA_DIR, "references");
const PREVIEWS_DIR = path.join(DATA_DIR, "previews");
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const MAX_REFERENCE_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_BODY_BYTES = 16 * 1024 * 1024;

loadEnv(path.join(ROOT, ".env"));

const PORT = Number(process.env.PORT || 3000);
const API_KEY = process.env.API_MARKET_KEY || process.env.MAGICAPI_KEY || "";
const TRYITON_API_KEY = process.env.TRYITON_API_KEY || "";
const VMODEL_API_TOKEN = process.env.VMODEL_API_TOKEN || process.env.VMODEL_API_KEY || "";
const HAIR_ENGINE = process.env.HAIR_ENGINE || "vmodel";
const MOCK_API =
  String(process.env.MOCK_API || "").toLowerCase() === "true" ||
  !hasRequiredLiveCredentials();
const HAIR_MCP_URL =
  process.env.HAIR_MCP_URL || "https://prod.api.market/api/mcp/magicapi/hair-v2";
const MAGICAPI_HAIR_URL =
  process.env.MAGICAPI_HAIR_URL || "https://api.magicapi.dev/api/v1/magicapi/hair/hair";
const MAGICAPI_HAIR_STATUS_URL =
  process.env.MAGICAPI_HAIR_STATUS_URL ||
  "https://api.magicapi.dev/api/v1/magicapi/hair/predictions";
const TRYITON_HAIRSTYLE_URL =
  process.env.TRYITON_HAIRSTYLE_URL || "https://tryiton.now/api/v1/tryon/hairstyle";
const TRYITON_STATUS_URL =
  process.env.TRYITON_STATUS_URL || "https://tryiton.now/api/v1/status";
const VMODEL_CREATE_URL =
  process.env.VMODEL_CREATE_URL || "https://api.vmodel.ai/api/tasks/v1/create";
const VMODEL_STATUS_URL =
  process.env.VMODEL_STATUS_URL || "https://api.vmodel.ai/api/tasks/v1/get";
const VMODEL_VERSION =
  process.env.VMODEL_VERSION || "5c0440717a995b0bbd93377bd65dbb4fe360f67967c506aa6bd8f6b660733a7e";
const UPLOAD_API_URL =
  process.env.UPLOAD_API_URL || "https://api.magicapi.dev/api/v1/magicapi/image-upload/upload";
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 3000);
const POLL_TIMEOUT_MS = Number(process.env.POLL_TIMEOUT_MS || 600000);
const ADMIN_SESSION_COOKIE = "hair_admin_session";
const ADMIN_SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const ADMIN_PASSWORD_MIN_LENGTH = 8;
const DEFAULT_ADMIN_LOGIN = process.env.DEFAULT_ADMIN_LOGIN || "admin";
const DEFAULT_ADMIN_PASSWORD = process.env.DEFAULT_ADMIN_PASSWORD || "admin";
const publicReferenceUrlCache = new Map();
const adminSessions = new Map();

ensureAdminAuth();

const MAGICAPI_HAIRSTYLES = new Set([
  "afro hairstyle",
  "bob cut hairstyle",
  "bowl cut hairstyle",
  "braid hairstyle",
  "caesar cut hairstyle",
  "chignon hairstyle",
  "cornrows hairstyle",
  "crew cut hairstyle",
  "crown braid hairstyle",
  "curtained hair hairstyle",
  "dido flip hairstyle",
  "dreadlocks hairstyle",
  "extensions hairstyle",
  "fade hairstyle",
  "fauxhawk hairstyle",
  "finger waves hairstyle",
  "french braid hairstyle",
  "frosted tips hairstyle",
  "full crown hairstyle",
  "harvard clip hairstyle",
  "high and tight hairstyle",
  "hime cut hairstyle",
  "hi-top fade hairstyle",
  "jewfro hairstyle",
  "jheri curl hairstyle",
  "liberty spikes hairstyle",
  "marcel waves hairstyle",
  "mohawk hairstyle",
  "pageboy hairstyle",
  "perm hairstyle",
  "pixie cut hairstyle",
  "psychobilly wedge hairstyle",
  "quiff hairstyle",
  "regular taper cut hairstyle",
  "ringlets hairstyle",
  "shingle bob hairstyle",
  "short hair hairstyle",
  "slicked-back hairstyle",
  "spiky hair hairstyle",
  "surfer hair hairstyle",
  "taper cut hairstyle",
  "the rachel hairstyle",
  "undercut hairstyle",
  "updo hairstyle",
]);

const MAGICAPI_STYLE_BY_ID = {
  "slicked-back": "slicked-back hairstyle",
  "long-top-undercut": "quiff hairstyle",
  military: "fade hairstyle",
  "crew-cut": "spiky hair hairstyle",
};

const FALLBACK_CATALOG = {
  hairstyles: [
    {
      id: "bob",
      title: "Боб",
      description: "Четкая форма до линии подбородка",
      apiName: "bob cut hairstyle",
      accent: "#d1495b",
      previewImage: "",
      path: "M166 410 C178 210 330 124 512 124 C694 124 846 210 858 410 L810 572 C760 470 678 414 512 414 C346 414 264 470 214 572 Z",
    },
  ],
  colors: [
    { id: "brown", title: "Каштановый", apiName: "brown", hex: "#6d3f2f" },
    { id: "blond", title: "Блонд", apiName: "blond", hex: "#d8b46a" },
  ],
};

const app = express();
const adminAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Слишком много попыток входа. Попробуйте позже." },
});
const generationLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Слишком много запросов генерации. Подождите минуту." },
});

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:", "https:"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: null,
      },
    },
    crossOriginResourcePolicy: { policy: "cross-origin" },
    strictTransportSecurity: false,
  }),
);
app.use(cookieParser());
app.use(express.json({ limit: `${Math.ceil(MAX_BODY_BYTES / 1024 / 1024)}mb` }));

app.get("/api/config", (req, res) => {
  const catalog = getCatalog();
  return sendJson(res, 200, {
    mode: MOCK_API ? "mock" : "live",
    engine: MOCK_API ? "mock" : HAIR_ENGINE,
    maxUploadMb: Math.floor(MAX_IMAGE_BYTES / 1024 / 1024),
    hairstyles: catalog.hairstyles,
    colors: shouldLockColorToNative() ? [] : catalog.colors,
  });
});

app.get("/api/catalog", requireAdminRoute, (req, res) => {
  return sendJson(res, 200, { catalog: getCatalog() });
});

app.put("/api/catalog", requireAdminRoute, asyncRoute(async (req, res) => {
  const body = await readJson(req);
  const catalog = normalizeCatalog(body.catalog || body);
  saveCatalog(catalog);
  return sendJson(res, 200, { ok: true, catalog });
}));

app.get("/api/admin/status", (req, res) => {
  return sendJson(res, 200, buildAdminStatus(req));
});

app.post("/api/admin/login", adminAuthLimiter, asyncRoute(handleAdminLogin));
app.post("/api/admin/logout", handleAdminLogout);
app.put("/api/admin/password", requireAdminRoute, asyncRoute(handleAdminPasswordChange));
app.post("/api/reference-upload", requireAdminRoute, asyncRoute(handleReferenceUpload));
app.post("/api/card-preview-upload", requireAdminRoute, asyncRoute(handleCardPreviewUpload));

app.get("/health", (req, res) => {
  return sendJson(res, 200, {
    ok: true,
    mode: MOCK_API ? "mock" : "live",
    engine: MOCK_API ? "mock" : HAIR_ENGINE,
    framework: "express",
  });
});

app.post("/api/generate", generationLimiter, asyncRoute(handleGenerate));

app.get("/api/proxy-image", asyncRoute(async (req, res) => {
  await handleProxyImage(buildRequestUrl(req), res);
}));

app.get("/api/reference-image", requireAdminRoute, asyncRoute(async (req, res) => {
  await serveReferenceImage(buildRequestUrl(req), res);
}));

app.get("/api/card-preview-image", asyncRoute(async (req, res) => {
  await serveCardPreviewImage(buildRequestUrl(req), res);
}));

app.use(
  express.static(PUBLIC_DIR, {
    index: "index.html",
    fallthrough: true,
    setHeaders(res) {
      res.setHeader("Cache-Control", "no-store");
    },
  }),
);

app.use((req, res) => {
  return sendJson(res, 404, { error: "Not found" });
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const statusCode = error.statusCode || error.status || 500;
  if (!error.statusCode && !error.status) {
    console.error(error);
  }
  return sendJson(res, statusCode, {
    error: statusCode < 500 ? error.message : "Ошибка генерации",
    details: error.message,
  });
});

app.listen(PORT, () => {
  console.log(`Hair Try-On service: http://localhost:${PORT}`);
  console.log(`Mode: ${MOCK_API ? "mock" : "live"}`);
});

function hasRequiredLiveCredentials() {
  if (HAIR_ENGINE === "tryiton") return Boolean(TRYITON_API_KEY);
  if (HAIR_ENGINE === "vmodel") return Boolean(VMODEL_API_TOKEN && API_KEY);
  return Boolean(API_KEY);
}

function shouldLockColorToNative() {
  return ["magicapi-hair", "vmodel"].includes(HAIR_ENGINE);
}

function asyncRoute(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function requireAdminRoute(req, res, next) {
  try {
    req.adminSession = assertAdmin(req);
    next();
  } catch (error) {
    next(error);
  }
}

function buildRequestUrl(req) {
  return new URL(req.originalUrl || req.url || "/", `${req.protocol || "http"}://${req.headers.host || "localhost"}`);
}

async function handleGenerate(req, res) {
  const body = await readJson(req);
  const catalog = getCatalog();
  const style = catalog.hairstyles.find((item) => item.id === body.hairstyleId);
  const keepNativeColor = body.colorId === "native";
  const color = keepNativeColor
    ? {
        id: "native",
        title: "Родной цвет",
        apiName: "original",
        hex: "#2d2520",
        native: true,
      }
    : catalog.colors.find((item) => item.id === body.colorId);

  if (!style) {
    return sendJson(res, 400, { error: "Выберите прическу из списка" });
  }

  if (!color) {
    return sendJson(res, 400, { error: "Выберите цвет волос из списка" });
  }

  const image = parseImageDataUrl(body.imageDataUrl);

  if (MOCK_API) {
    await delay(900);
    return sendJson(res, 200, {
      mode: "mock",
      sourceUrl: body.imageDataUrl,
      resultUrl: buildMockPreview(body.imageDataUrl, style, color),
      hairstyle: style.title,
      color: color.title,
      note: "Demo-режим: API ключ не задан, реальная генерация не выполнялась.",
    });
  }

  const sourceImage =
    HAIR_ENGINE === "tryiton" ? body.imageDataUrl : await uploadImage(image.buffer, image.mime);
  const predictionId = await createHairPrediction(sourceImage, style, color);
  const result = await waitForPrediction(predictionId);
  const outputUrl = HAIR_ENGINE === "vmodel" ? buildProxyImageUrl(result.outputUrl) : result.outputUrl;

  return sendJson(res, 200, {
    mode: "live",
    sourceUrl: body.imageDataUrl,
    resultUrl: outputUrl,
    imageUrl: outputUrl,
    hairstyle: style.title,
    color: color.title,
    predictionId,
    status: result.status,
  });
}

async function handleProxyImage(requestUrl, res) {
  const rawUrl = requestUrl.searchParams.get("url") || "";
  let remoteUrl;

  try {
    remoteUrl = new URL(rawUrl);
  } catch {
    throw new HttpError(400, "Некорректный URL изображения");
  }

  if (remoteUrl.protocol !== "https:" || !isAllowedVModelAssetHost(remoteUrl.hostname)) {
    throw new HttpError(400, "Этот URL изображения нельзя проксировать");
  }

  const response = await fetch(remoteUrl, {
    method: "GET",
    headers: {
      Accept: "image/avif,image/webp,image/png,image/jpeg,*/*",
      Authorization: `Bearer ${VMODEL_API_TOKEN}`,
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Ошибка загрузки итогового изображения ${response.status}: ${message || response.statusText}`);
  }

  const contentType = response.headers.get("content-type") || "image/webp";
  const contentLength = response.headers.get("content-length");
  const headers = {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
  };
  if (contentLength) headers["Content-Length"] = contentLength;

  res.writeHead(200, headers);
  res.end(Buffer.from(await response.arrayBuffer()));
}

async function handleAdminLogin(req, res) {
  const auth = getAdminAuth();
  if (!auth) {
    throw new HttpError(500, "Администратор не настроен");
  }

  const body = await readJson(req);
  const login = String(body.login || "").trim();
  const password = String(body.password || "");

  if (login !== auth.login || !verifyPassword(password, auth.passwordHash)) {
    throw new HttpError(401, "Неверный логин или пароль");
  }

  createAdminSession(res, auth.login);
  return sendJson(res, 200, { ok: true, authenticated: true, login: auth.login });
}

function handleAdminLogout(req, res) {
  const token = getAdminSessionToken(req);
  if (token) {
    adminSessions.delete(token);
  }
  clearAdminSessionCookie(res);
  return sendJson(res, 200, { ok: true });
}

async function handleAdminPasswordChange(req, res) {
  const session = assertAdmin(req);
  const auth = getAdminAuth();
  if (!auth) {
    throw new HttpError(409, "Администратор еще не создан");
  }

  const body = await readJson(req);
  if (!verifyPassword(String(body.currentPassword || ""), auth.passwordHash)) {
    throw new HttpError(401, "Текущий пароль указан неверно");
  }

  validateAdminPassword(body.newPassword);
  const passwordHash = hashPassword(body.newPassword);
  saveAdminAuth({ login: auth.login, passwordHash, updatedAt: new Date().toISOString() });

  for (const [token, value] of adminSessions.entries()) {
    if (value.login === session.login && token !== session.token) {
      adminSessions.delete(token);
    }
  }

  return sendJson(res, 200, { ok: true });
}

async function handleReferenceUpload(req, res) {
  assertAdmin(req);
  const body = await readJson(req);
  const image = parseReferenceImageDataUrl(body.imageDataUrl);
  const filename = cleanId(path.parse(cleanText(body.filename)).name) || `reference-${Date.now()}`;
  const extension = imageExtension(image.mime);
  const targetPath = path.join(REFERENCES_DIR, `${filename}-${Date.now().toString(36)}.${extension}`);

  fs.mkdirSync(REFERENCES_DIR, { recursive: true });
  fs.writeFileSync(targetPath, image.buffer);

  const sourceFile = toPosix(path.relative(ROOT, targetPath));
  return sendJson(res, 200, {
    ok: true,
    sourceFile,
    previewUrl: buildReferencePreviewUrl(sourceFile),
    mime: image.mime,
    size: image.buffer.length,
  });
}

async function handleCardPreviewUpload(req, res) {
  assertAdmin(req);
  const body = await readJson(req);
  const image = parseReferenceImageDataUrl(body.imageDataUrl);
  const filename = cleanId(path.parse(cleanText(body.filename)).name) || `preview-${Date.now()}`;
  const extension = imageExtension(image.mime);
  const targetPath = path.join(PREVIEWS_DIR, `${filename}-${Date.now().toString(36)}.${extension}`);

  fs.mkdirSync(PREVIEWS_DIR, { recursive: true });
  fs.writeFileSync(targetPath, image.buffer);

  const previewFile = toPosix(path.relative(ROOT, targetPath));
  const previewUrl = buildCardPreviewUrl(previewFile);
  return sendJson(res, 200, {
    ok: true,
    previewFile,
    previewUrl,
    mime: image.mime,
    size: image.buffer.length,
  });
}

async function serveReferenceImage(requestUrl, res) {
  const sourceFile = requestUrl.searchParams.get("path") || "";
  const filePath = resolveReferenceFilePath(sourceFile);

  fs.readFile(filePath, (error, content) => {
    if (error) {
      return sendJson(res, 404, { error: "Референс не найден" });
    }

    res.writeHead(200, {
      "Content-Type": contentType(filePath),
      "Cache-Control": "no-store",
    });
    res.end(content);
  });
}

async function serveCardPreviewImage(requestUrl, res) {
  const previewFile = requestUrl.searchParams.get("path") || "";
  const filePath = resolvePreviewFilePath(previewFile);

  fs.readFile(filePath, (error, content) => {
    if (error) {
      return sendJson(res, 404, { error: "Preview-изображение не найдено" });
    }

    res.writeHead(200, {
      "Content-Type": contentType(filePath),
      "Cache-Control": "public, max-age=3600",
    });
    res.end(content);
  });
}

function buildProxyImageUrl(outputUrl) {
  return `/api/proxy-image?url=${encodeURIComponent(outputUrl)}`;
}

function isAllowedVModelAssetHost(hostname) {
  return (
    hostname === "vmodel.ai" ||
    hostname.endsWith(".vmodel.ai") ||
    hostname === "vmimgs.com" ||
    hostname.endsWith(".vmimgs.com")
  );
}

function getCatalog() {
  try {
    const raw = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
    return normalizeCatalog(raw);
  } catch (error) {
    console.warn(`Catalog fallback is used: ${error.message}`);
    return clone(FALLBACK_CATALOG);
  }
}

function saveCatalog(catalog) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CATALOG_PATH, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
}

function normalizeCatalog(raw) {
  const hairstyles = normalizeItems(raw.hairstyles, normalizeHairstyle);
  const colors = normalizeItems(raw.colors, normalizeColor);

  if (!hairstyles.length) {
    throw new HttpError(400, "В каталоге должна быть хотя бы одна прическа");
  }

  if (!colors.length) {
    throw new HttpError(400, "В каталоге должен быть хотя бы один цвет");
  }

  assertUniqueIds(hairstyles, "причесок");
  assertUniqueIds(colors, "цветов");

  return { hairstyles, colors };
}

function normalizeItems(items, normalize) {
  if (!Array.isArray(items)) return [];
  return items.map(normalize).filter(Boolean);
}

function normalizeHairstyle(item) {
  const id = cleanId(item.id);
  const title = cleanText(item.title);
  const apiName = cleanText(item.apiName);

  if (!id || !title || !apiName) return null;

  return {
    id,
    title,
    description: cleanText(item.description),
    apiName,
    tryitonName: cleanText(item.tryitonName),
    hairProperty: cleanText(item.hairProperty) || "natural",
    accent: cleanHex(item.accent) || "#d1495b",
    previewImage: cleanText(item.previewImage),
    sourceImage: cleanText(item.sourceImage),
    sourceFile: cleanText(item.sourceFile),
    path: cleanText(item.path),
  };
}

function normalizeColor(item) {
  const id = cleanId(item.id);
  const title = cleanText(item.title);
  const apiName = cleanText(item.apiName);
  const hex = cleanHex(item.hex);

  if (!id || !title || !apiName || !hex) return null;

  return { id, title, apiName, tryitonName: cleanText(item.tryitonName), hex };
}

function assertUniqueIds(items, label) {
  const ids = new Set();
  for (const item of items) {
    if (ids.has(item.id)) {
      throw new HttpError(400, `Повторяется id в каталоге ${label}: ${item.id}`);
    }
    ids.add(item.id);
  }
}

function cleanId(value) {
  const id = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return id.slice(0, 64);
}

function cleanText(value) {
  return String(value || "").trim().slice(0, 2000);
}

function cleanHex(value) {
  const hex = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(hex) ? hex : "";
}

function assertAdmin(req) {
  const session = getAdminSession(req);
  if (!session) {
    throw new HttpError(401, "Войдите в админку");
  }
  return session;
}

function buildAdminStatus(req) {
  const auth = getAdminAuth();
  const session = getAdminSession(req);
  return {
    configured: Boolean(auth),
    authenticated: Boolean(session),
    login: session ? session.login : auth ? auth.login : "",
  };
}

function getAdminAuth() {
  try {
    const auth = JSON.parse(fs.readFileSync(ADMIN_AUTH_PATH, "utf8"));
    if (!auth || typeof auth !== "object" || !auth.login || !auth.passwordHash) return null;
    return auth;
  } catch {
    return null;
  }
}

function ensureAdminAuth() {
  if (getAdminAuth()) return;

  const login = validateAdminLogin(DEFAULT_ADMIN_LOGIN);
  const passwordHash = hashPassword(DEFAULT_ADMIN_PASSWORD);
  saveAdminAuth({
    login,
    passwordHash,
    isDefault: true,
    updatedAt: new Date().toISOString(),
  });
  console.log(`Default admin account created: ${login}`);
}

function saveAdminAuth(auth) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(ADMIN_AUTH_PATH, `${JSON.stringify(auth, null, 2)}\n`, "utf8");
}

function validateAdminLogin(value) {
  const login = String(value || "").trim();
  if (!/^[a-zA-Z0-9._-]{3,40}$/.test(login)) {
    throw new HttpError(400, "Логин должен быть 3-40 символов: латиница, цифры, точка, дефис или нижнее подчеркивание");
  }
  return login;
}

function validateAdminPassword(value) {
  const password = String(value || "");
  if (password.length < ADMIN_PASSWORD_MIN_LENGTH) {
    throw new HttpError(400, `Пароль должен быть не короче ${ADMIN_PASSWORD_MIN_LENGTH} символов`);
  }
  return password;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return { algorithm: "scrypt", salt, hash };
}

function verifyPassword(password, passwordHash) {
  if (!passwordHash || passwordHash.algorithm !== "scrypt" || !passwordHash.salt || !passwordHash.hash) {
    return false;
  }

  const expected = Buffer.from(passwordHash.hash, "hex");
  const actual = crypto.scryptSync(String(password || ""), passwordHash.salt, expected.length);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function createAdminSession(res, login) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = Date.now() + ADMIN_SESSION_TTL_MS;
  adminSessions.set(token, { token, login, expiresAt });
  setAdminSessionCookie(res, token, expiresAt);
}

function getAdminSession(req) {
  cleanupAdminSessions();
  const token = getAdminSessionToken(req);
  if (!token) return null;

  const session = adminSessions.get(token);
  if (!session || session.expiresAt <= Date.now()) {
    if (session) adminSessions.delete(token);
    return null;
  }

  return session;
}

function getAdminSessionToken(req) {
  const cookies = parseCookies(req.headers.cookie || "");
  return cookies[ADMIN_SESSION_COOKIE] || "";
}

function cleanupAdminSessions() {
  const now = Date.now();
  for (const [token, session] of adminSessions.entries()) {
    if (session.expiresAt <= now) {
      adminSessions.delete(token);
    }
  }
}

function parseCookies(header) {
  const cookies = {};
  for (const part of String(header || "").split(";")) {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex === -1) continue;
    const key = part.slice(0, separatorIndex).trim();
    const value = part.slice(separatorIndex + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
  }
  return cookies;
}

function setAdminSessionCookie(res, token, expiresAt) {
  const maxAge = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
  res.setHeader(
    "Set-Cookie",
    `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax`,
  );
}

function clearAdminSessionCookie(res) {
  res.setHeader("Set-Cookie", `${ADMIN_SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
}

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function readJson(req) {
  if (req.body && typeof req.body === "object") {
    return Promise.resolve(req.body);
  }

  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];

    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new HttpError(413, "Запрос слишком большой. Фото пользователя до 6 МБ, reference до 10 МБ."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new HttpError(400, "Некорректный JSON"));
      }
    });
    req.on("error", reject);
  });
}

function parseImageDataUrl(value) {
  if (typeof value !== "string") {
    throw new HttpError(400, "Фото не передано");
  }

  const match = value.match(/^data:(image\/(?:png|jpe?g));base64,([a-zA-Z0-9+/=]+)$/);
  if (!match) {
    throw new HttpError(400, "Поддерживаются только PNG и JPEG");
  }

  const mime = match[1] === "image/jpg" ? "image/jpeg" : match[1];
  const buffer = Buffer.from(match[2], "base64");

  if (!buffer.length) {
    throw new HttpError(400, "Фото пустое");
  }

  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new HttpError(413, "Файл слишком большой. Загрузите PNG/JPEG до 6 МБ.");
  }

  return { mime, buffer };
}

function parseReferenceImageDataUrl(value) {
  if (typeof value !== "string") {
    throw new HttpError(400, "Референс не передан");
  }

  const match = value.match(/^data:(image\/(?:png|jpe?g|webp));base64,([a-zA-Z0-9+/=]+)$/);
  if (!match) {
    throw new HttpError(400, "Референс должен быть PNG, JPEG или WEBP");
  }

  const mime = match[1] === "image/jpg" ? "image/jpeg" : match[1];
  const buffer = Buffer.from(match[2], "base64");

  if (!buffer.length) {
    throw new HttpError(400, "Референс пустой");
  }

  if (buffer.length > MAX_REFERENCE_IMAGE_BYTES) {
    throw new HttpError(413, "Референс слишком большой. Загрузите PNG/JPEG/WEBP до 10 МБ.");
  }

  return { mime, buffer };
}

function imageExtension(mime) {
  return (
    {
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/webp": "webp",
    }[mime] || "jpg"
  );
}

async function uploadImage(buffer, mime) {
  const extension = imageExtension(mime);
  const form = new FormData();
  form.append("filename", new Blob([buffer], { type: mime }), `portrait.${extension}`);

  const response = await fetch(UPLOAD_API_URL, {
    method: "POST",
    headers: apiHeaders(false),
    body: form,
  });

  const json = await readApiJson(response);
  const url = json.url || json.imageUrl || json.fileUrl;

  if (!url) {
    throw new Error("Image Upload API не вернул URL изображения");
  }

  return url;
}

async function createHairPrediction(imageUrl, style, color) {
  if (HAIR_ENGINE === "magicapi-hair") {
    return createMagicApiHairPrediction(imageUrl, style, color);
  }

  if (HAIR_ENGINE === "tryiton") {
    return createTryItOnPrediction(imageUrl, style, color);
  }

  if (HAIR_ENGINE === "vmodel") {
    return createVModelPrediction(imageUrl, style);
  }

  return createHairPredictionMcpV2(imageUrl, style, color);
}

async function createTryItOnPrediction(faceImage, style, color) {
  const body = {
    face_image: faceImage,
    haircut: buildTryItOnHaircut(style),
  };

  if (!color.native) {
    body.hair_color = buildTryItOnColor(color);
  }

  const response = await fetch(TRYITON_HAIRSTYLE_URL, {
    method: "POST",
    headers: tryItOnHeaders(true),
    body: JSON.stringify(body),
  });
  const result = await readApiJson(response);
  const id = extractJobId(result);

  if (!id) {
    throw new Error("TryItOn API не вернул идентификатор job");
  }

  return id;
}

async function createMagicApiHairPrediction(imageUrl, style, color) {
  const body = {
    image: imageUrl,
    editing_type: "hairstyle",
    color_description: "black",
    hairstyle_description: buildMagicApiHairstyleName(style),
  };

  const response = await fetch(MAGICAPI_HAIR_URL, {
    method: "POST",
    headers: apiHeaders(true),
    body: JSON.stringify(body),
  });
  const result = await readApiJson(response, "MagicAPI Hair create");
  const id = extractJobId(result);

  if (!id) {
    throw new Error("Сервис обработки не вернул идентификатор задачи");
  }

  return id;
}

async function createVModelPrediction(targetImageUrl, style) {
  const sourceImageUrl = await prepareVModelSourceImage(style);
  const body = {
    version: VMODEL_VERSION,
    input: {
      source: sourceImageUrl,
      target: targetImageUrl,
      disable_safety_checker: false,
    },
  };

  const response = await fetch(VMODEL_CREATE_URL, {
    method: "POST",
    headers: vModelHeaders(true),
    body: JSON.stringify(body),
  });
  const result = await readApiJson(response, "VModel create");
  const id = extractJobId(result);

  if (!id) {
    throw new Error("Сервис обработки не вернул идентификатор задачи");
  }

  console.log(`Generation task created: ${id} / ${style.id}`);
  return id;
}

async function createHairPredictionMcpV2(imageUrl, style, color) {
  const toolResult = await callMcpTool("post_run", {
    body: {
      input: {
        haircolor: buildHairColor(color),
        hairproperty: buildHairProperty(style),
        hairstyle: buildHairstyleName(style),
        image: imageUrl,
      },
    },
  });

  const id = extractJobId(toolResult);

  if (!id) {
    throw new Error("Hair MCP API не вернул идентификатор job");
  }

  return id;
}

async function callMcpTool(name, args) {
  await mcpRequest("initialize", {
    protocolVersion: "2025-03-26",
    capabilities: { tools: {} },
    clientInfo: { name: "hair-try-on-service", version: "1.0.0" },
  });

  const response = await mcpRequest("tools/call", {
    name,
    arguments: args,
  });

  return unwrapMcpResult(response);
}

async function mcpRequest(method, params) {
  const response = await fetch(HAIR_MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "x-api-market-key": API_KEY,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method,
      params,
    }),
  });

  const text = await response.text();
  const json = parseMcpResponse(text);

  if (!response.ok) {
    const message = json?.error?.message || json?.message || response.statusText;
    throw new Error(`MCP API error ${response.status}: ${message}`);
  }

  if (json?.error) {
    throw new Error(json.error.message || "MCP API вернул ошибку");
  }

  return json;
}

function parseMcpResponse(text) {
  const dataLines = text
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .filter(Boolean);

  const payload = dataLines.length ? dataLines[dataLines.length - 1] : text;

  try {
    return JSON.parse(payload);
  } catch {
    return { raw: text };
  }
}

function unwrapMcpResult(json) {
  const result = json?.result || json;
  const content = result?.content;

  if (Array.isArray(content) && content.length) {
    const texts = content
      .map((item) => item?.text)
      .filter((value) => typeof value === "string" && value.trim());
    for (const text of texts) {
      const parsed = tryParseJson(text);
      if (parsed) return parsed;
    }
    return { text: texts.join("\n"), result };
  }

  return result?.structuredContent || result?.data || result;
}

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function extractJobId(result) {
  const candidates = [
    result?.id,
    result?.task_id,
    result?.taskId,
    result?.job_id,
    result?.jobId,
    result?.prediction_id,
    result?.request_id,
    result?.result?.id,
    result?.result?.task_id,
    result?.result?.taskId,
    result?.data?.id,
    result?.data?.task_id,
    result?.data?.taskId,
    result?.data?.job_id,
    result?.data?.jobId,
    result?.output?.id,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }

  const text = JSON.stringify(result);
  const match = text.match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}(?:-[a-z0-9]+)?/i);
  return match ? match[0] : "";
}

function extractStatus(result) {
  const candidates = [
    result?.status,
    result?.state,
    result?.result?.status,
    result?.result?.state,
    result?.data?.status,
    result?.data?.state,
    result?.output?.status,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim().toLowerCase();
  }

  const text = JSON.stringify(result).toLowerCase();
  const match = text.match(/"?(status|state)"?\s*[:=]\s*"?([a-z_ -]+)"?/);
  if (match) return match[2].trim();

  return "";
}

function buildHairColor(color) {
  return normalizePromptValue(color.native ? "same as original" : color.apiName);
}

function buildHairProperty(style) {
  return normalizePromptValue(style.hairProperty || "straight");
}

function buildHairstyleName(style) {
  return normalizePromptValue(style.apiName || style.title);
}

function buildMagicApiHairstyleName(style) {
  const mapped = MAGICAPI_STYLE_BY_ID[style.id];
  if (mapped) return mapped;

  const candidate = buildHairstyleName(style);
  if (MAGICAPI_HAIRSTYLES.has(candidate)) return candidate;

  return "short hair hairstyle";
}

function buildTryItOnHaircut(style) {
  return style.tryitonName || style.apiName || style.title;
}

function buildTryItOnColor(color) {
  return color.tryitonName || color.apiName;
}

function buildVModelSource(style) {
  const source = style.sourceImage || style.previewImage;
  if (!source) {
    throw new HttpError(400, `Для прически "${style.title}" не задан референс`);
  }

  return source;
}

async function prepareVModelSourceImage(style) {
  if (style.sourceFile) {
    return prepareLocalVModelSourceImage(style);
  }

  const source = buildVModelSource(style);
  if (isVModelNativeAsset(source)) return source;

  if (publicReferenceUrlCache.has(source)) {
    return publicReferenceUrlCache.get(source);
  }

  const uploadPromise = downloadRemoteImage(source)
    .then(({ buffer, mime }) => uploadImage(buffer, mime))
    .catch((error) => {
      publicReferenceUrlCache.delete(source);
      console.warn(`Reference upload fallback for ${style.id}: ${error.message}`);
      return source;
    });

  publicReferenceUrlCache.set(source, uploadPromise);
  return uploadPromise;
}

async function prepareLocalVModelSourceImage(style) {
  const filePath = path.resolve(ROOT, style.sourceFile);
  if (filePath !== ROOT && !filePath.startsWith(`${ROOT}${path.sep}`)) {
    throw new HttpError(400, `Некорректный локальный reference для "${style.title}"`);
  }

  const stats = fs.statSync(filePath);
  const cacheKey = `${filePath}:${stats.mtimeMs}:${stats.size}`;
  if (publicReferenceUrlCache.has(cacheKey)) {
    return publicReferenceUrlCache.get(cacheKey);
  }

  const uploadPromise = fs.promises
    .readFile(filePath)
    .then((buffer) => {
      if (buffer.length > MAX_REFERENCE_IMAGE_BYTES) {
        throw new Error("Референс больше 10 МБ");
      }
      return uploadImage(buffer, mimeFromFilePath(filePath));
    })
    .catch((error) => {
      publicReferenceUrlCache.delete(cacheKey);
      throw error;
    });

  publicReferenceUrlCache.set(cacheKey, uploadPromise);
  return uploadPromise;
}

function mimeFromFilePath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

function buildReferencePreviewUrl(sourceFile) {
  return `/api/reference-image?path=${encodeURIComponent(sourceFile)}`;
}

function buildCardPreviewUrl(previewFile) {
  return `/api/card-preview-image?path=${encodeURIComponent(previewFile)}`;
}

function resolveReferenceFilePath(sourceFile) {
  const normalized = toPosix(sourceFile).replace(/^\/+/, "");
  const prefix = "data/references/";
  const relative = normalized.startsWith(prefix) ? normalized.slice(prefix.length) : normalized;

  if (!relative || relative.includes("\0") || relative.split("/").includes("..")) {
    throw new HttpError(400, "Некорректный путь reference-изображения");
  }

  const filePath = path.resolve(REFERENCES_DIR, relative);
  if (!isPathInside(filePath, REFERENCES_DIR)) {
    throw new HttpError(403, "Референс должен лежать в data/references");
  }

  return filePath;
}

function resolvePreviewFilePath(previewFile) {
  const normalized = toPosix(previewFile).replace(/^\/+/, "");
  const prefix = "data/previews/";
  const relative = normalized.startsWith(prefix) ? normalized.slice(prefix.length) : normalized;

  if (!relative || relative.includes("\0") || relative.split("/").includes("..")) {
    throw new HttpError(400, "Некорректный путь preview-изображения");
  }

  const filePath = path.resolve(PREVIEWS_DIR, relative);
  if (!isPathInside(filePath, PREVIEWS_DIR)) {
    throw new HttpError(403, "Preview-изображение должно лежать в data/previews");
  }

  return filePath;
}

function isPathInside(filePath, parentPath) {
  const relative = path.relative(parentPath, filePath);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function toPosix(value) {
  return String(value || "").replace(/\\/g, "/");
}

function isVModelNativeAsset(value) {
  try {
    const url = new URL(value);
    return isAllowedVModelAssetHost(url.hostname);
  } catch {
    return false;
  }
}

async function downloadRemoteImage(imageUrl) {
  let url;
  try {
    url = new URL(imageUrl);
  } catch {
    throw new Error("Некорректный URL reference-картинки");
  }

  if (url.protocol !== "https:") {
    throw new Error("Референс должен быть доступен по HTTPS");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "image/avif,image/webp,image/png,image/jpeg,*/*",
        "User-Agent": "hair-try-on-service/1.0",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`reference download error ${response.status}: ${response.statusText}`);
    }

    const mime = normalizeImageMime(response.headers.get("content-type"));
    if (!mime) {
      throw new Error("URL reference-картинки не вернул PNG/JPEG/WEBP");
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length) {
      throw new Error("Референс пустой");
    }

    if (buffer.length > MAX_REFERENCE_IMAGE_BYTES) {
      throw new Error("Референс больше 10 МБ");
    }

    return { buffer, mime };
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeImageMime(contentType) {
  const value = String(contentType || "").split(";")[0].trim().toLowerCase();
  if (value === "image/jpg") return "image/jpeg";
  if (["image/jpeg", "image/png", "image/webp"].includes(value)) return value;
  return "";
}

function normalizePromptValue(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[,_]+/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 120);
}

async function waitForPrediction(predictionId) {
  if (HAIR_ENGINE === "magicapi-hair") {
    return waitForMagicApiHairPrediction(predictionId);
  }

  if (HAIR_ENGINE === "tryiton") {
    return waitForTryItOnPrediction(predictionId);
  }

  if (HAIR_ENGINE === "vmodel") {
    return waitForVModelPrediction(predictionId);
  }

  const startedAt = Date.now();

  while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
    const result = await callMcpTool("get_status_id", { id: predictionId });
    const status = extractStatus(result);
    const outputUrl = extractOutputUrl(result);

    if (outputUrl && (!status || isSuccessStatus(status))) {
      return { status: status || "completed", outputUrl };
    }

    if (isFailureStatus(status)) {
      throw new Error(result.error || result.message || "Hair MCP API вернул ошибку обработки");
    }

    await delay(POLL_INTERVAL_MS);
  }

  throw new Error("Истекло время ожидания результата Hair MCP API");
}

async function waitForVModelPrediction(predictionId) {
  const startedAt = Date.now();
  const url = `${trimRightSlash(VMODEL_STATUS_URL)}/${encodeURIComponent(predictionId)}`;
  let lastStatus = "";
  let lastMessage = "";

  while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
    const response = await fetch(url, {
      method: "GET",
      headers: vModelHeaders(false),
    });
    const result = await readApiJson(response, "VModel status");
    const status = extractStatus(result);
    const outputUrl = extractOutputUrl(result);
    lastStatus = status || lastStatus;
    lastMessage = extractVModelError(result) || lastMessage;

    if (outputUrl && (!status || isSuccessStatus(status))) {
      return { status: status || "succeeded", outputUrl };
    }

    if (isFailureStatus(status)) {
      console.error("Generation task failed", JSON.stringify(result));
      throw new Error(lastMessage || "Сервис обработки вернул ошибку");
    }

    await delay(POLL_INTERVAL_MS);
  }

  const details = [lastStatus && `последний статус: ${lastStatus}`, lastMessage].filter(Boolean).join("; ");
  throw new Error(`Истекло время ожидания результата${details ? `. ${details}` : ""}`);
}

async function waitForMagicApiHairPrediction(predictionId) {
  const startedAt = Date.now();
  const url = `${trimRightSlash(MAGICAPI_HAIR_STATUS_URL)}/${encodeURIComponent(predictionId)}`;
  let lastStatus = "";
  let lastMessage = "";

  while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
    const response = await fetch(url, {
      method: "GET",
      headers: apiHeaders(false),
    });
    const result = await readApiJson(response, "MagicAPI Hair status");
    const status = extractStatus(result);
    const outputUrl = extractOutputUrl(result);
    lastStatus = status || lastStatus;
    lastMessage = result.message || result.error?.message || lastMessage;

    if (outputUrl && (!status || isSuccessStatus(status))) {
      return { status: status || "succeeded", outputUrl };
    }

    if (isFailureStatus(status)) {
      const message = result.error?.message || result.error || result.message;
      throw new Error(message || "Сервис обработки вернул ошибку");
    }

    await delay(POLL_INTERVAL_MS);
  }

  const details = [lastStatus && `последний статус: ${lastStatus}`, lastMessage].filter(Boolean).join("; ");
  throw new Error(`Истекло время ожидания результата${details ? `. ${details}` : ""}`);
}

async function waitForTryItOnPrediction(predictionId) {
  const startedAt = Date.now();
  const url = `${trimRightSlash(TRYITON_STATUS_URL)}/${encodeURIComponent(predictionId)}`;

  while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
    const response = await fetch(url, {
      method: "GET",
      headers: tryItOnHeaders(false),
    });
    const result = await readApiJson(response);
    const status = extractStatus(result);
    const outputUrl = extractOutputUrl(result);

    if (outputUrl && (!status || isSuccessStatus(status))) {
      return { status: status || "completed", outputUrl };
    }

    if (isFailureStatus(status)) {
      const message = result.error?.message || result.error || result.message;
      throw new Error(message || "TryItOn API вернул ошибку обработки");
    }

    await delay(POLL_INTERVAL_MS);
  }

  throw new Error("Истекло время ожидания результата TryItOn API");
}

function isSuccessStatus(status) {
  return ["succeeded", "success", "completed", "complete", "done"].includes(status);
}

function isFailureStatus(status) {
  return ["failed", "failure", "error", "canceled", "cancelled"].includes(status);
}

function extractVModelError(result) {
  const message =
    result?.result?.error ||
    result?.result?.logs ||
    result?.error ||
    result?.message?.en ||
    result?.message;
  if (typeof message === "string") return message.trim();
  if (message && typeof message === "object") return JSON.stringify(message);
  return "";
}

/*
Legacy prompt helpers were replaced by the MCP tools/call payload:
{
  body: {
    input: { haircolor, hairproperty, hairstyle, image }
  };
}
*/

function extractOutputUrl(json) {
  const candidates = [
    json.result,
    json.output,
    json.image,
    json.url,
    json.result_url,
    json.output_url,
    json.image_url,
    json.text,
    json.result?.output,
    json.result?.url,
    json.result?.result_url,
    json.result?.output_url,
    json.result?.image_url,
    json.data?.result,
    json.data?.output,
    json.data?.image,
    json.data?.url,
    json.data?.result_url,
    json.data?.output_url,
    json.data?.image_url,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    if (typeof candidate === "string") return candidate;
    if (Array.isArray(candidate) && typeof candidate[0] === "string") return candidate[0];
    if (typeof candidate === "object") {
      const nested =
        candidate.url ||
        candidate.image ||
        candidate.image_url ||
        candidate.result ||
        candidate.result_url ||
        candidate.output ||
        candidate.output_url;
      if (typeof nested === "string") return nested;
      if (Array.isArray(nested) && typeof nested[0] === "string") return nested[0];
    }
  }

  const text = JSON.stringify(json);
  const match = text.match(/https?:\/\/[^\s"'<>\\]+/);
  if (match) return match[0].replace(/[),.]+$/, "");

  return "";
}

function apiHeaders(withJson) {
  const headers = {
    accept: "application/json",
    "x-api-market-key": API_KEY,
    "x-magicapi-key": API_KEY,
  };

  if (withJson) {
    headers["Content-Type"] = "application/json";
  }

  return headers;
}

function tryItOnHeaders(withJson) {
  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${TRYITON_API_KEY}`,
  };

  if (withJson) {
    headers["Content-Type"] = "application/json";
  }

  return headers;
}

function vModelHeaders(withJson) {
  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${VMODEL_API_TOKEN}`,
  };

  if (withJson) {
    headers["Content-Type"] = "application/json";
  }

  return headers;
}

async function readApiJson(response, source = "API") {
  const text = await response.text();
  let json;

  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }

  if (!response.ok) {
    const message = getApiErrorMessage(json) || response.statusText;
    throw new Error(`${source} error ${response.status}: ${message}`);
  }

  if (Number.isFinite(json?.code) && json.code !== 200) {
    const message = getApiErrorMessage(json) || "Business status code is not OK";
    throw new Error(`${source} error ${json.code}: ${message}`);
  }

  return json;
}

function getApiErrorMessage(json) {
  if (!json || typeof json !== "object") return "";

  if (json.message && typeof json.message === "object") {
    if (typeof json.message.en === "string" && json.message.en.trim()) return json.message.en.trim();
    if (typeof json.message.zh === "string" && json.message.zh.trim()) return json.message.zh.trim();
  }
  if (typeof json.message === "string" && json.message.trim()) return json.message.trim();
  if (typeof json.detail === "string" && json.detail.trim()) return json.detail.trim();
  if (typeof json.error === "string" && json.error.trim()) return json.error.trim();
  if (json.error && typeof json.error === "object") {
    const name = typeof json.error.name === "string" ? json.error.name : "";
    const message = typeof json.error.message === "string" ? json.error.message : "";
    return [name, message].filter(Boolean).join(": ");
  }

  return "";
}

function buildMockPreview(imageDataUrl, style, color) {
  const hairPath = style.path || FALLBACK_CATALOG.hairstyles[0].path;
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <clipPath id="photo"><rect x="0" y="0" width="1024" height="1024" rx="0"/></clipPath>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="20" stdDeviation="24" flood-color="#111827" flood-opacity="0.28"/>
    </filter>
  </defs>
  <rect width="1024" height="1024" fill="#f4f6f8"/>
  <image href="${escapeXml(imageDataUrl)}" width="1024" height="1024" preserveAspectRatio="xMidYMid slice" clip-path="url(#photo)"/>
  <path d="${escapeXml(hairPath)}" fill="${escapeXml(color.hex)}" opacity="0.76" filter="url(#shadow)"/>
  <path d="${escapeXml(hairPath)}" fill="none" stroke="${escapeXml(style.accent)}" stroke-width="12" opacity="0.38"/>
  <rect x="48" y="896" width="928" height="72" rx="14" fill="#111827" opacity="0.74"/>
  <text x="512" y="942" text-anchor="middle" font-family="Arial, sans-serif" font-size="30" fill="#ffffff">${escapeXml(style.title)} · ${escapeXml(color.title)}</text>
</svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function serveStatic(requestPath, res) {
  const safePath = requestPath === "/" ? "/index.html" : decodeURIComponent(requestPath);
  const normalized = path.normalize(safePath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(PUBLIC_DIR, normalized);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    return sendJson(res, 403, { error: "Forbidden" });
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      return sendJson(res, 404, { error: "Not found" });
    }

    res.writeHead(200, {
      "Content-Type": contentType(filePath),
      "Cache-Control": "no-store",
    });
    res.end(content);
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return (
    {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp",
      ".ico": "image/x-icon",
    }[ext] || "application/octet-stream"
  );
}

function trimRightSlash(value) {
  return value.replace(/\/+$/, "");
}

function escapeXml(value) {
  return String(value).replace(/[<>&'"]/g, (char) => {
    return {
      "<": "&lt;",
      ">": "&gt;",
      "&": "&amp;",
      "'": "&apos;",
      '"': "&quot;",
    }[char];
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}
