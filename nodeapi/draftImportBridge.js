const { randomBytes, randomUUID } = require("node:crypto");
const { readFileSync, rmSync } = require("node:fs");
const fs = require("node:fs/promises");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");

const manifestName = "draft-import.json";
const requestLimit = 16 * 1024;
const responseLimit = 64 * 1024;

function failure(code, message) {
  return { success: false, code, message };
}

async function startDraftImportBridge(directory, importDraft) {
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const windows = process.platform === "win32";
  const privateDirectory = windows ? null : await fs.mkdtemp(path.join(os.tmpdir(), "capcut-draft-"));
  const socketPath = windows
    ? `\\\\.\\pipe\\capcut-draft-${randomUUID()}`
    : path.join(privateDirectory, "import.sock");
  const manifest = path.join(directory, manifestName);
  const temporary = path.join(directory, `.${randomUUID()}.json`);
  const secret = randomBytes(32).toString("hex");
  const clients = new Set();
  const server = net.createServer((client) => {
    clients.add(client);
    client.on("close", () => clients.delete(client));
    client.on("error", () => client.destroy());
    client.setTimeout(5000, () => client.destroy());
    client.setEncoding("utf8");
    let input = "";
    function onData(chunk) {
      input += chunk;
      if (Buffer.byteLength(input) > requestLimit) {
        client.end(JSON.stringify(failure("INVALID_REQUEST", "草稿导入请求过长。")) + "\n");
        return;
      }
      const lineEnd = input.indexOf("\n");
      if (lineEnd < 0) return;
      client.off("data", onData);
      client.setTimeout(0);
      Promise.resolve().then(() => {
        const request = JSON.parse(input.slice(0, lineEnd));
        if (request.secret !== secret || typeof request.draftUrl !== "string") {
          return failure("INVALID_REQUEST", "草稿导入请求无效。");
        }
        return importDraft(request.draftUrl);
      }).catch((error) => failure("DRAFT_IMPORT_FAILED", error.message))
        .then((response) => client.end(JSON.stringify(response) + "\n"));
    }
    client.on("data", onData);
  });

  function close() {
    process.off("exit", close);
    for (const client of clients) client.destroy();
    server.close();
    try {
      if (JSON.parse(readFileSync(manifest, "utf8")).secret === secret) rmSync(manifest);
    } catch {
      // 文件可能已由更新的桌面实例接管，或启动尚未完成。
    }
    if (privateDirectory) {
      try { rmSync(privateDirectory, { recursive: true, force: true }); } catch {}
    }
  }

  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(socketPath, resolve);
    });
    server.unref();
    await fs.writeFile(temporary, JSON.stringify({ socketPath, secret }), {
      mode: 0o600, flag: "wx",
    });
    await fs.rename(temporary, manifest);
    process.once("exit", close);
    return { close };
  } catch (error) {
    close();
    throw error;
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => {});
  }
}

async function requestDraftImport(directory, draftUrl, signal) {
  const unavailable = failure("DESKTOP_UNAVAILABLE", "请先启动或重启剪映小助手桌面客户端。");
  let connection;
  try {
    connection = JSON.parse(await fs.readFile(path.join(directory, manifestName), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT" || error instanceof SyntaxError) return unavailable;
    throw error;
  }
  if (typeof connection.socketPath !== "string" || !/^[a-f0-9]{64}$/.test(connection.secret)) {
    return unavailable;
  }

  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve(failure("ABORTED", "草稿导入请求已取消。"));
      return;
    }
    const client = net.createConnection(connection.socketPath);
    let sent = false;
    let reply = "";
    function finish(result) {
      signal?.removeEventListener("abort", onAbort);
      client.destroy();
      resolve(result);
    }
    function onAbort() {
      finish({
        ...failure("ABORTED", sent ? "已停止等待，请在桌面助手查看导入结果。" : "草稿导入请求已取消。"),
        outcome_unknown: sent,
      });
    }
    signal?.addEventListener("abort", onAbort, { once: true });
    client.setTimeout(10 * 60 * 1000, () => {
      finish({ ...failure("IMPORT_TIMEOUT", "等待草稿导入超时，请在桌面助手查看结果。"), outcome_unknown: sent });
    });
    client.setEncoding("utf8");
    client.once("connect", () => {
      sent = true;
      client.write(JSON.stringify({ secret: connection.secret, draftUrl }) + "\n");
    });
    client.on("data", (chunk) => {
      reply += chunk;
      const lineEnd = reply.indexOf("\n");
      if (Buffer.byteLength(reply) > responseLimit) {
        finish({ ...failure("INVALID_DESKTOP_REPLY", "桌面客户端响应过长。"), outcome_unknown: sent });
      } else if (lineEnd >= 0) {
        try {
          finish(JSON.parse(reply.slice(0, lineEnd)));
        } catch {
          finish({ ...failure("INVALID_DESKTOP_REPLY", "无法解析桌面客户端返回的结果。"), outcome_unknown: sent });
        }
      }
    });
    const onDisconnect = () => finish(sent
      ? { ...failure("DESKTOP_DISCONNECTED", "桌面客户端未返回结果，请查看下载历史。"), outcome_unknown: true }
      : unavailable);
    client.once("error", onDisconnect);
    client.once("end", onDisconnect);
  });
}

module.exports = { startDraftImportBridge, requestDraftImport };
