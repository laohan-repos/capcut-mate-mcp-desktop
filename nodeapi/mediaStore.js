const { randomUUID } = require("node:crypto");
const { createReadStream, constants } = require("node:fs");
const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const { pipeline } = require("node:stream/promises");

const HOST = "127.0.0.1";
const DEFAULT_PORT = 48763;
const HEALTH_PATH = "/media-health";
const SERVICE_HEADER = "x-capcut-mate-media";
const FILE_ID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const MEDIA_TYPES = {
  mp4: "video/mp4", mov: "video/quicktime", m4v: "video/mp4", webm: "video/webm",
  mkv: "video/x-matroska", avi: "video/x-msvideo", mpg: "video/mpeg",
  mpeg: "video/mpeg", ts: "video/mp2t", "3gp": "video/3gpp",
  mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", aac: "audio/aac",
  flac: "audio/flac", ogg: "audio/ogg", opus: "audio/ogg", aiff: "audio/aiff",
  wma: "audio/x-ms-wma",
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
  webp: "image/webp", avif: "image/avif", bmp: "image/bmp", tif: "image/tiff",
  tiff: "image/tiff", heic: "image/heic", heif: "image/heif",
};
const MEDIA_EXTENSIONS = Object.keys(MEDIA_TYPES);

function mediaType(name) {
  const extension = path.extname(name).slice(1).toLowerCase();
  return Object.hasOwn(MEDIA_TYPES, extension) ? MEDIA_TYPES[extension] : null;
}

function normalizePublicBaseUrl(value) {
  if (typeof value !== "string") throw new Error("请输入有效的公网地址。");
  const trimmed = value.trim();
  if (!trimmed) return "";

  let url;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("请输入以 https:// 开头的公网地址。");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new Error("公网地址须使用 HTTPS，且不能包含账号、查询参数或片段。");
  }
  return url.href.replace(/\/+$/, "");
}

function byteRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2]) || size === 0) return null;

  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (start < 0 || start >= size || start > end) return null;
  return { start, end };
}

function validPort(port) {
  return Number.isInteger(port) && port >= 1024 && port <= 65535;
}

function localUrl(port) {
  return `http://${HOST}:${port}`;
}

function createMediaStore(directory, { useRunningService = false } = {}) {
  const settingsPath = path.join(directory, "settings.json");
  let settings;
  let starting;
  let settingsWrite = Promise.resolve();

  const server = useRunningService ? null : http.createServer((request, response) => {
    serve(request, response).catch(() => {
      if (response.headersSent) response.destroy();
      else response.writeHead(500).end();
    });
  });

  async function readSettings() {
    try {
      return JSON.parse(await fs.readFile(settingsPath, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return {};
      throw error;
    }
  }

  async function writeSettings(nextSettings) {
    const temporary = path.join(directory, `.${randomUUID()}.json`);
    try {
      await fs.writeFile(temporary, JSON.stringify(nextSettings), { mode: 0o600 });
      await fs.rename(temporary, settingsPath);
    } finally {
      await fs.rm(temporary, { force: true }).catch(() => {});
    }
  }

  function listen(port) {
    return new Promise((resolve, reject) => {
      const onError = (error) => {
        server.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        server.off("error", onError);
        resolve(server.address().port);
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen({ host: HOST, port });
    });
  }

  async function initialize() {
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const saved = await readSettings();
    const requestedPort = validPort(saved.port) ? saved.port : DEFAULT_PORT;
    const port = await listen(requestedPort).catch((error) => {
      if (error.code === "EADDRINUSE") return listen(0);
      throw error;
    });
    try {
      settings = { port, publicBaseUrl: normalizePublicBaseUrl(saved.publicBaseUrl ?? "") };
      if (saved.port !== port) await writeSettings(settings);
      server.unref();
      return port;
    } catch (error) {
      await close();
      throw error;
    }
  }

  function start() {
    starting ??= initialize().catch((error) => {
      starting = undefined;
      throw error;
    });
    return starting;
  }

  function close() {
    return new Promise((resolve) => {
      server.close(resolve);
      server.closeAllConnections();
    });
  }

  async function activeSettings() {
    if (!useRunningService) {
      await start();
      return settings;
    }

    const { port, publicBaseUrl } = await readSettings();
    const unavailable = "剪映小助手的素材服务尚未运行。请启动或重启桌面客户端。";
    if (!validPort(port)) throw new Error(unavailable);
    const response = await fetch(localUrl(port) + HEALTH_PATH, {
      method: "HEAD",
      redirect: "error",
      signal: AbortSignal.timeout(1500),
    }).catch(() => null);
    if (response?.status !== 204 || response.headers.get(SERVICE_HEADER) !== "1") {
      throw new Error(unavailable);
    }
    return { port, publicBaseUrl: normalizePublicBaseUrl(publicBaseUrl ?? "") };
  }

  async function getFile(id) {
    if (typeof id !== "string" || !FILE_ID.test(id)) return null;
    const fileDirectory = path.join(directory, id);
    try {
      if (!(await fs.lstat(fileDirectory)).isDirectory()) return null;
      const entries = await fs.readdir(fileDirectory, { withFileTypes: true });
      const entry = entries.find((item) => item.isFile() && mediaType(item.name));
      if (!entry) return null;
      const filePath = path.join(fileDirectory, entry.name);
      const stat = await fs.lstat(filePath);
      if (!stat.isFile()) return null;
      return {
        id, name: entry.name, size: stat.size, addedAt: stat.birthtimeMs,
        type: mediaType(entry.name), filePath,
      };
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  }

  async function serve(request, response) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { Allow: "GET, HEAD" }).end();
      return;
    }
    if (request.url === HEALTH_PATH) {
      response.writeHead(204, { [SERVICE_HEADER]: "1" }).end();
      return;
    }
    const route = /^\/media\/([0-9a-f-]+)\/[^/?]+(?:\?.*)?$/.exec(request.url);
    const file = route && await getFile(route[1]);
    if (!file) {
      response.writeHead(404).end();
      return;
    }

    const headers = {
      "Accept-Ranges": "bytes",
      "Content-Type": file.type,
      "Content-Length": file.size,
      "X-Content-Type-Options": "nosniff",
    };
    const range = request.headers.range ? byteRange(request.headers.range, file.size) : undefined;
    if (range === null) {
      response.writeHead(416, { "Content-Range": `bytes */${file.size}` }).end();
      return;
    }
    if (range) {
      headers["Content-Range"] = `bytes ${range.start}-${range.end}/${file.size}`;
      headers["Content-Length"] = range.end - range.start + 1;
    }
    response.writeHead(range ? 206 : 200, headers);
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    await pipeline(createReadStream(file.filePath, range), response);
  }

  async function listState({ port, publicBaseUrl }) {
    const localBaseUrl = localUrl(port);
    const baseUrl = publicBaseUrl || localBaseUrl;
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const files = await Promise.all(entries.filter((entry) => entry.isDirectory() && FILE_ID.test(entry.name))
      .map((entry) => getFile(entry.name)));
    return {
      port,
      localBaseUrl,
      publicBaseUrl,
      files: files.filter(Boolean).sort((a, b) => b.addedAt - a.addedAt || a.id.localeCompare(b.id))
        .map(({ id, name, size }) => ({ id, name, size, url: `${baseUrl}/media/${id}/${encodeURIComponent(name)}` })),
    };
  }

  async function getState() {
    return listState(await activeSettings());
  }

  async function importFiles(sources) {
    const active = await activeSettings();
    const failures = [];
    const uploadedIds = new Set();
    for (const source of sources) {
      const name = path.basename(source);
      const id = randomUUID();
      const staging = path.join(directory, `.${id}`);
      try {
        if (!mediaType(name) || !(await fs.stat(source)).isFile()) {
          throw new Error("请选择支持的视频、图片或音频文件。");
        }
        await fs.mkdir(staging, { mode: 0o700 });
        await fs.copyFile(source, path.join(staging, name), constants.COPYFILE_EXCL);
        await fs.rename(staging, path.join(directory, id));
        uploadedIds.add(id);
      } catch (error) {
        failures.push({ name, message: error.message });
      } finally {
        await fs.rm(staging, { recursive: true, force: true }).catch(() => {});
      }
    }
    const state = await listState(active);
    const files = state.files.filter((file) => uploadedIds.has(file.id));
    return { imported: uploadedIds.size, failures, files, state };
  }

  async function setPublicBaseUrl(value) {
    const publicBaseUrl = normalizePublicBaseUrl(value);
    await start();
    const update = settingsWrite.then(async () => {
      const next = { ...settings, publicBaseUrl };
      await writeSettings(next);
      settings = next;
    });
    settingsWrite = update.catch(() => {});
    await update;
    return getState();
  }

  async function saveFile(filePath, destination, { overwrite = true } = {}) {
    if (overwrite && path.resolve(destination) === filePath) return;
    const temporary = path.join(path.dirname(destination), `.${randomUUID()}.part`);
    try {
      await fs.copyFile(filePath, temporary, constants.COPYFILE_EXCL);
      if (overwrite) {
        await fs.rename(temporary, destination);
      } else {
        await fs.link(temporary, destination).catch((error) => {
          if (!["EPERM", "ENOTSUP", "EOPNOTSUPP", "EMLINK"].includes(error.code)) throw error;
          return fs.copyFile(temporary, destination, constants.COPYFILE_EXCL);
        });
      }
    } finally {
      await fs.rm(temporary, { force: true }).catch(() => {});
    }
  }

  const media = { getState, getFile, importFiles, saveFile };
  return useRunningService ? media : { ...media, start, close, setPublicBaseUrl };
}

module.exports = { createMediaStore, MEDIA_EXTENSIONS };
