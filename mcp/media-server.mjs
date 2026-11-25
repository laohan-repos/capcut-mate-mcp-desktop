import os from "node:os";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import mediaStore from "../nodeapi/mediaStore.js";

function mediaDirectory() {
  const customDirectory = process.env.CAPCUT_MATE_MEDIA_STORE;
  if (customDirectory) return path.resolve(customDirectory);

  const home = os.homedir();
  let appData;
  if (process.platform === "darwin") {
    appData = path.join(home, "Library", "Application Support");
  } else if (process.platform === "win32") {
    appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
  } else {
    appData = process.env.XDG_CONFIG_HOME || path.join(home, ".config");
  }
  return path.join(appData, "capcut-mate", "media-store");
}

const store = mediaStore.createMediaStore(mediaDirectory(), { useRunningService: true });
const server = new McpServer({ name: "capcut-media", version: "1.0.0" });
const readOnly = { readOnlyHint: true, openWorldHint: false };
const absolutePath = z.string().min(1).refine((value) => path.isAbsolute(value), "请使用本机绝对路径。");

function result(data, isError = false) {
  return {
    content: [{ type: "text", text: JSON.stringify(data) }],
    structuredContent: data,
    ...(isError ? { isError: true } : {}),
  };
}

function linkScope(publicBaseUrl) {
  return publicBaseUrl ? "public" : "local";
}

server.registerTool(
  "media_status",
  {
    description: "检查剪映小助手的素材服务，返回实际端口、配置的公网地址和素材数量。",
    annotations: readOnly,
  },
  async () => {
    const { port, localBaseUrl, publicBaseUrl, files } = await store.getState();
    return result({
      port,
      localBaseUrl,
      publicBaseUrl,
      linkScope: linkScope(publicBaseUrl),
      count: files.length,
    });
  },
);

server.registerTool(
  "media_list",
  {
    description: "分页列出配置中心素材库里的文件，包含素材 ID、文件名、大小和直链。",
    inputSchema: {
      offset: z.number().int().min(0).default(0).describe("从第几项开始，默认 0。"),
      limit: z.number().int().min(1).max(200).default(50).describe("返回的素材数量，默认 50。"),
    },
    annotations: readOnly,
  },
  async ({ offset, limit }) => {
    const { files, publicBaseUrl } = await store.getState();
    return result({
      files: files.slice(offset, offset + limit),
      total: files.length,
      nextOffset: offset + limit < files.length ? offset + limit : null,
      linkScope: linkScope(publicBaseUrl),
    });
  },
);

server.registerTool(
  "media_upload",
  {
    description: "把本机的视频、图片或音频上传到剪映小助手的素材库，返回本次上传的直链。公网直链取决于配置中心的公网地址设置。",
    inputSchema: {
      paths: z.array(absolutePath).min(1).describe("待上传文件的本机绝对路径。"),
    },
    annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  async ({ paths }) => {
    const { imported, files, failures, state } = await store.importFiles(paths);
    return result({
      imported,
      files,
      failures,
      linkScope: linkScope(state.publicBaseUrl),
    }, imported === 0);
  },
);

server.registerTool(
  "media_download",
  {
    description: "按素材 ID 将原文件保存到本机指定位置。默认保留已存在的目标文件。",
    inputSchema: {
      id: z.uuid().describe("素材列表或上传结果中的 ID。"),
      destination: absolutePath.describe("包含文件名的本机保存绝对路径。"),
      overwrite: z.boolean().default(false).describe("是否覆盖同名目标文件，默认 false。"),
    },
    annotations: { destructiveHint: true, openWorldHint: false },
  },
  async ({ id, destination, overwrite }) => {
    const file = await store.getFile(id);
    if (!file) throw new Error("找不到这份素材。");

    try {
      await store.saveFile(file.filePath, destination, { overwrite });
    } catch (error) {
      if (error.code === "EEXIST") {
        throw new Error("目标文件已存在，请选择新的保存路径或明确允许覆盖。");
      }
      throw error;
    }
    return result({ id, name: file.name, size: file.size, destination });
  },
);

await server.connect(new StdioServerTransport());
