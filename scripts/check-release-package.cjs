const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");
const { version } = require("../package.json");

function findPackage(dist, arch) {
  const children = fs.readdirSync(dist, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  if (process.platform === "darwin") {
    const folder = children.find((name) => name === `mac-${arch}`) || children.find((name) => name === "mac");
    assert.ok(folder, "macOS application output is missing");
    const root = path.join(dist, folder);
    const bundle = fs.readdirSync(root).find((name) => name.endsWith(".app"));
    assert.ok(bundle, "Application bundle is missing");
    const contents = path.join(root, bundle, "Contents");
    const info = path.join(contents, "Info.plist");
    const name = execFileSync("plutil", ["-extract", "CFBundleExecutable", "raw", "-o", "-", info], { encoding: "utf8" }).trim();
    const executable = path.join(contents, "MacOS", name);
    const architecture = execFileSync("lipo", ["-archs", executable], { encoding: "utf8" }).trim();
    assert.equal(architecture, arch === "x64" ? "x86_64" : arch);
    return { executable, archive: path.join(contents, "Resources", "app.asar") };
  }

  assert.equal(process.platform, "win32");
  const folder = children.find((name) => name === `win-${arch}-unpacked`)
    || children.find((name) => name === "win-unpacked");
  assert.ok(folder, "Windows application output is missing");
  const root = path.join(dist, folder);
  const executable = path.join(root, "剪映小助手.exe");
  const file = fs.openSync(executable, "r");
  try {
    const dos = Buffer.alloc(64);
    assert.equal(fs.readSync(file, dos, 0, dos.length, 0), dos.length);
    assert.equal(dos.toString("ascii", 0, 2), "MZ");
    const section = Buffer.alloc(6);
    assert.equal(fs.readSync(file, section, 0, section.length, dos.readUInt32LE(60)), section.length);
    assert.equal(section.toString("ascii", 0, 4), "PE\0\0");
    assert.equal(section.readUInt16LE(4), arch === "x64" ? 0x8664 : 0xaa64);
  } finally {
    fs.closeSync(file);
  }
  return { executable, archive: path.join(root, "resources", "app.asar") };
}

async function verify() {
  const arch = process.argv[2];
  assert.ok(arch === "arm64" || arch === "x64");
  assert.equal(process.arch, arch, "The MCP smoke test must run on the target architecture");
  const { executable, archive } = findPackage(path.resolve(process.argv[3] || "dist"), arch);
  assert.ok(fs.statSync(archive).isFile());
  execFileSync(executable, ["-e", "require('node:fs').accessSync(process.argv[1])", path.join(archive, "ui", "index.html")], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    timeout: 15_000,
  });

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "capcut-package-check-"));
  const id = randomUUID();
  const audioId = randomUUID();
  const simulateDraftApi = `
    globalThis.fetch = (resource, options) => {
      const body = JSON.parse(options.body);
      const operation = new URL(resource).pathname.split("/").pop();
      if (operation === "add_videos"
        && JSON.parse(body.video_infos)[0].video_url === "https://capcut-local.invalid/media/${id}/asset.mp4") {
        return Response.json({ code: 0, segment_ids: ["clip-1"] });
      }
      if (operation === "add_audios"
        && JSON.parse(body.audio_infos)[0].audio_url === "https://capcut-local.invalid/media/${audioId}/asset.mp3") {
        return Response.json({ code: 0, audio_ids: ["voice-1"] });
      }
      throw new Error("Unexpected upstream request during the package check");
    };
  `;
  const transport = new StdioClientTransport({
    command: executable,
    args: [
      "--import",
      `data:text/javascript,${encodeURIComponent(simulateDraftApi)}`,
      path.join(archive, "mcp", "media-server.mjs"),
    ],
    env: {
      ELECTRON_RUN_AS_NODE: "1",
      CAPCUT_MATE_BASE_URL: "https://capcut-mate.jcaigc.cn",
      CAPCUT_MATE_MEDIA_STORE: directory,
    },
  });
  const client = new Client({ name: "capcut-package-check", version: "1.0.0" });
  try {
    fs.mkdirSync(path.join(directory, id));
    fs.writeFileSync(path.join(directory, id, "sample.mp4"), "sample");
    fs.mkdirSync(path.join(directory, audioId));
    fs.copyFileSync(path.join(__dirname, "fixtures", "voice.test.mp3"), path.join(directory, audioId, "voice.mp3"));
    await client.connect(transport, { timeout: 20_000 });
    assert.equal(client.getServerVersion().version, version);
    const { tools } = await client.listTools();
    assert.equal(tools.length, 45);
    for (const name of ["media_upload", "create_draft", "save_draft", "import_draft_to_jianying"]) {
      assert.ok(tools.some((tool) => tool.name === name), `Packaged MCP tool is missing: ${name}`);
    }
    const draft_url = "https://capcut-mate.jcaigc.cn/openapi/capcut-mate/v1/get_draft?draft_id=20261126090000deadbeef";
    const localMedia = await client.callTool({
      name: "add_videos",
      arguments: {
        draft_url,
        video_infos: [{ video_url: `http://127.0.0.1:48763/media/${id}/sample.mp4`, start: 0, end: 1_000_000 }],
      },
    });
    assert.notEqual(localMedia.isError, true);
    assert.deepEqual(localMedia.structuredContent.segment_ids, ["clip-1"]);
    const audio_url = `http://127.0.0.1:48763/media/${audioId}/voice.mp3`;
    const measured = await client.callTool({ name: "get_audio_duration", arguments: { mp3_url: audio_url } });
    assert.notEqual(measured.isError, true, JSON.stringify(measured));
    assert.equal(measured.structuredContent.duration, 125_000);
    const added = await client.callTool({
      name: "add_audios",
      arguments: { draft_url, audio_infos: [{ audio_url, start: 0, end: measured.structuredContent.duration }] },
    });
    assert.notEqual(added.isError, true, JSON.stringify(added));
    assert.deepEqual(added.structuredContent.audio_ids, ["voice-1"]);
    console.log(`Verified native ${process.platform} ${arch} package, ${tools.length} MCP tools and local-audio decoding (v${version}).`);
  } finally {
    await client.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

verify().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
