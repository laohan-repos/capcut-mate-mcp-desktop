const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");

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

  const transport = new StdioClientTransport({
    command: executable,
    args: [path.join(archive, "mcp", "media-server.mjs")],
    env: { ELECTRON_RUN_AS_NODE: "1" },
  });
  const client = new Client({ name: "capcut-package-check", version: "1.0.0" });
  try {
    await client.connect(transport, { timeout: 20_000 });
    const { tools } = await client.listTools();
    for (const name of ["media_upload", "create_draft", "save_draft", "import_draft_to_jianying"]) {
      assert.ok(tools.some((tool) => tool.name === name), `Packaged MCP tool is missing: ${name}`);
    }
    console.log(`Verified native ${process.platform} ${arch} package and ${tools.length} packaged MCP tools.`);
  } finally {
    await client.close();
  }
}

verify().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
