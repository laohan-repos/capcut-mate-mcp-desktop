import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import bridge from "../nodeapi/draftImportBridge.js";
import mediaStore from "../nodeapi/mediaStore.js";

const prefix = "/openapi/capcut-mate/v1/";
const draftId = "20261126090000deadbeef";

test("MCP exposes CapCut drafts alongside our media tools and imports through desktop IPC", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "capcut-mcp-api-test-"));
  const requests = [];
  const imports = [];
  let stubBridge;
  let client;
  let api;
  try {
    api = http.createServer(async (request, response) => {
      const url = new URL(request.url, base);
      const operation = url.pathname.slice(prefix.length);
      let payload = "";
      for await (const chunk of request) payload += chunk;
      const body = payload ? JSON.parse(payload) : undefined;
      requests.push({ operation, method: request.method, body, draft_id: url.searchParams.get("draft_id") });
      if (operation === "add_effects") {
        request.socket.destroy();
        return;
      }
      const results = {
        create_draft: { draft_url: draftUrl },
        add_videos: { draft_url: draftUrl, segment_ids: ["clip-1"] },
        add_images: { draft_url: draftUrl, segment_ids: ["image-1"] },
        add_captions: { code: 2008, message: "字幕参数有误" },
        save_draft: { draft_url: draftUrl },
        get_draft: { files: [`${base}/output/${draftId}/draft_content.json`] },
        keyframes_infos: { keyframes_infos: '[{"segment_id":"clip-1","offset":0,"property":"UNIFORM_SCALE","value":1}]' },
      };
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ code: 0, ...results[operation] }));
    });
    await new Promise((resolve, reject) => {
      api.once("error", reject);
      api.listen(0, "127.0.0.1", resolve);
    });
    const base = `http://127.0.0.1:${api.address().port}`;
    const draftUrl = `${base}${prefix}get_draft?draft_id=${draftId}`;
    stubBridge = await bridge.startDraftImportBridge(directory, async (url) => {
      imports.push(url);
      return { success: true, draft_id: draftId, status: "downloaded" };
    });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [fileURLToPath(new URL("./media-server.mjs", import.meta.url))],
      env: { CAPCUT_MATE_BASE_URL: base, CAPCUT_MATE_MEDIA_STORE: directory },
    });
    client = new Client({ name: "capcut-mcp-test", version: "1.0.0" });
    await client.connect(transport);

    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name);
    assert.equal(names.length, 45);
    assert.ok(!names.includes("upload_file"));
    assert.ok(names.includes("media_upload"));
    assert.equal(tools.find((tool) => tool.name === "add_videos").inputSchema.properties.video_infos.type, "array");
    const call = (name, args = {}) => client.callTool({ name, arguments: args });

    const created = await call("create_draft", { width: 1080, height: 1920 });
    assert.equal(created.structuredContent.draft_url, draftUrl);
    assert.deepEqual(requests[0].body, { height: 1920, width: 1080 });

    const video = { video_url: `${base}/media/start.mp4`, start: 0, end: 5_000_000 };
    const added = await call("add_videos", { draft_url: draftUrl, video_infos: [video] });
    assert.deepEqual(added.structuredContent.segment_ids, ["clip-1"]);
    assert.deepEqual(JSON.parse(requests[1].body.video_infos), [video]);
    const invalidTime = await call("add_videos", { draft_url: draftUrl, video_infos: [{ ...video, end: 0 }] });
    assert.equal(invalidTime.isError, true);
    assert.equal(requests.length, 2);

    const images = [{ image_url: "https://example.test/image.png", start: 5_000_000, end: 8_000_000 }];
    await call("add_images", { draft_url: draftUrl, image_infos: images });
    assert.deepEqual(JSON.parse(requests[2].body.image_infos), images);
    const captionsError = await call("add_captions", {
      draft_url: draftUrl, captions: [{ text: "试片", start: 0, end: 1_000_000 }], font: "江湖体",
    });
    assert.equal(captionsError.isError, true);
    assert.equal(captionsError.structuredContent.upstream_code, 2008);
    assert.equal(captionsError.structuredContent.retryable, false);

    const keyframes = await call("keyframes_infos", {
      ctype: "UNIFORM_SCALE", offsets: [0, 100], values: [1, 1.1],
      segment_infos: [{ id: "clip-1", start: 0, end: 5_000_000 }],
    });
    assert.ok(Array.isArray(keyframes.structuredContent.keyframes_infos));
    assert.equal(requests[4].body.offsets, "0|100");

    const uncertain = await call("add_effects", {
      draft_url: draftUrl, effect_infos: [{ effect_title: "示例", start: 0, end: 1_000_000 }],
    });
    assert.equal(uncertain.isError, true);
    assert.equal(uncertain.structuredContent.outcome_unknown, true);
    assert.equal(requests.filter((entry) => entry.operation === "add_effects").length, 1);

    assert.equal((await call("save_draft", { draft_url: draftUrl })).structuredContent.draft_url, draftUrl);
    const inspected = await call("get_draft", { draft_url: draftUrl });
    assert.equal(inspected.structuredContent.files.length, 1);
    assert.equal(requests.at(-1).method, "GET");
    assert.equal(requests.at(-1).draft_id, draftId);

    const imported = await call("import_draft_to_jianying", { draft_id: draftId });
    assert.equal(imported.structuredContent.status, "downloaded");
    assert.deepEqual(imports, [draftUrl]);

    stubBridge.close();
    stubBridge = null;
    const offline = await call("import_draft_to_jianying", { draft_id: draftId });
    assert.equal(offline.isError, true);
    assert.equal(offline.structuredContent.code, "DESKTOP_UNAVAILABLE");
  } finally {
    await client?.close();
    stubBridge?.close();
    api?.closeAllConnections();
    if (api) await new Promise((resolve) => api.close(resolve));
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("official MCP measures managed audio and submits managed draft references", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "capcut-local-media-test-"));
  const store = mediaStore.createMediaStore(path.join(directory, "media-store"));
  const serverPath = fileURLToPath(new URL("./media-server.mjs", import.meta.url));
  const simulateDraftApi = `
    const fetchLocal = globalThis.fetch;
    globalThis.fetch = (resource, options) => {
      const url = new URL(resource);
      if (url.hostname === "127.0.0.1" && url.pathname === "/media-health") {
        return fetchLocal(resource, options);
      }
      if (url.origin !== "https://capcut-mate.jcaigc.cn") throw new Error("Unexpected request");
      const body = JSON.parse(options.body);
      if (url.pathname.endsWith("/get_audio_duration")) {
        if (body.mp3_url !== "https://example.test/voice.wav") throw new Error("Unexpected remote audio URL");
        return Response.json({ code: 0, duration: 2_000_000 });
      }
      return Response.json({ code: 0, segment_ids: ["clip-1"], submitted: body });
    };
  `;
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", `data:text/javascript,${encodeURIComponent(simulateDraftApi)}`, serverPath],
    env: {
      CAPCUT_MATE_BASE_URL: "https://capcut-mate.jcaigc.cn",
      CAPCUT_MATE_MEDIA_STORE: path.join(directory, "media-store"),
    },
  });
  const client = new Client({ name: "capcut-mcp-local-media-test", version: "1.0.0" });
  try {
    await store.start();
    const paths = ["视频.mp4", "配图 #1.jpg", "配音.wav"].map((name) => path.join(directory, name));
    const pcm = Buffer.alloc(44 + 16000);
    pcm.write("RIFF");
    pcm.writeUInt32LE(pcm.length - 8, 4);
    pcm.write("WAVEfmt ", 8);
    pcm.writeUInt32LE(16, 16);
    pcm.writeUInt16LE(1, 20);
    pcm.writeUInt16LE(1, 22);
    pcm.writeUInt32LE(8000, 24);
    pcm.writeUInt32LE(16000, 28);
    pcm.writeUInt16LE(2, 32);
    pcm.writeUInt16LE(16, 34);
    pcm.write("data", 36);
    pcm.writeUInt32LE(16000, 40);
    await Promise.all(paths.map((filename) => fs.writeFile(filename, filename.endsWith(".wav") ? pcm : "test material")));
    await client.connect(transport);
    const draft_url = `https://capcut-mate.jcaigc.cn${prefix}get_draft?draft_id=${draftId}`;
    const uploaded = await client.callTool({ name: "media_upload", arguments: { paths } });
    assert.equal(uploaded.structuredContent.linkScope, "local");
    const video = uploaded.structuredContent.files.find((file) => file.name.endsWith(".mp4"));
    const image = uploaded.structuredContent.files.find((file) => file.name.endsWith(".jpg"));
    const audio = uploaded.structuredContent.files.find((file) => file.name.endsWith(".wav"));
    const savedVideoUrl = new URL(video.url);
    savedVideoUrl.port = savedVideoUrl.port === "48763" ? "48764" : "48763";
    for (const [name, list, field, source, url] of [
      ["add_videos", "video_infos", "video_url", video, savedVideoUrl.href],
      ["add_images", "image_infos", "image_url", image, image.url],
      ["add_audios", "audio_infos", "audio_url", audio, audio.url],
    ]) {
      const response = await client.callTool({
        name,
        arguments: { draft_url, [list]: [{ [field]: url, start: 0, end: 1_000_000 }] },
      });
      assert.notEqual(response.isError, true);
      assert.deepEqual(response.structuredContent.segment_ids, ["clip-1"]);
      const [item] = JSON.parse(response.structuredContent.submitted[list]);
      assert.equal(item[field], `https://capcut-local.invalid/media/${source.id}/asset${path.extname(source.name)}`);
      const resolved = await store.resolveDraftMedia(item[field]);
      assert.equal(resolved.name, source.name);
    }

    const duration = await client.callTool({ name: "get_audio_duration", arguments: { mp3_url: audio.url } });
    assert.equal(duration.structuredContent.duration, 1_000_000);
    const timeline = await client.callTool({
      name: "audio_timelines", arguments: { links: [audio.url, "https://example.test/voice.wav", audio.url] },
    });
    assert.deepEqual(timeline.structuredContent.timelines, [
      { start: 0, end: 1_000_000 },
      { start: 1_000_000, end: 3_000_000 },
      { start: 3_000_000, end: 4_000_000 },
    ]);
    assert.deepEqual(timeline.structuredContent.all_timelines, [{ start: 0, end: 4_000_000 }]);
    const badTimeline = await client.callTool({
      name: "audio_timelines", arguments: { links: [audio.url, image.url] },
    });
    assert.equal(badTimeline.structuredContent.code, "MEDIA_LINK_LOCAL_ONLY");
    assert.equal(badTimeline.structuredContent.audio_index, 1);

    const quick = await client.callTool({
      name: "easy_create_material",
      arguments: { draft_url, audio_url: audio.url, img_url: image.url, video_url: video.url, text: "测试" },
    });
    for (const [field, file] of [["audio_url", audio], ["img_url", image], ["video_url", video]]) {
      const resolved = await store.resolveDraftMedia(quick.structuredContent.submitted[field]);
      assert.equal(resolved.id, file.id);
    }

    const cases = [
      ["add_videos", "video_infos", "video_url", "http://127.0.0.1:48763/media/start.mp4"],
      ["add_images", "image_infos", "image_url", "http://localhost:48763/media/image.png"],
      ["add_images", "image_infos", "image_url", video.url],
      ["add_images", "image_infos", "image_url", `${image.url}?override=1`],
      ["add_audios", "audio_infos", "audio_url", "http://[::1]:48763/media/voice.mp3"],
    ];
    for (const [name, list, field, url] of cases) {
      const response = await client.callTool({
        name,
        arguments: { draft_url, [list]: [{ [field]: url, start: 0, end: 1_000_000 }] },
      });
      assert.notEqual(response.isError, true);
      const data = response.structuredContent;
      assert.deepEqual(JSON.parse(response.content[0].text), data);
      assert.equal(data.status, "needs_action");
      assert.equal(data.code, "MEDIA_LINK_LOCAL_ONLY");
      assert.equal(data.operation, name);
      assert.equal(data.draft_url, draft_url);
      assert.equal(data.upstream_called, false);
      assert.equal(data.retryable, false);
      assert.equal(data.next_action.tool, "media_list");
      assert.match(data.next_action.instruction, /media_list/);
      assert.equal(data.segment_ids, undefined);
    }
  } finally {
    await client.close();
    await store.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
