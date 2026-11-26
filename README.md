# 剪映小助手桌面端

下载剪映草稿，并在「配置中心」批量上传素材、复制直链和下载原文件。内置本机素材服务，可通过 MCP 调用。

## 下载桌面安装包

在 [GitHub Releases](https://github.com/laohan-repos/capcut-mate-mcp-desktop/releases/latest) 选择对应系统和芯片的安装包。

| 系统与芯片 | 安装包 |
| --- | --- |
| macOS Apple Silicon（M 系列） | `capcut-mate-macos-arm64-installer.dmg` |
| macOS Intel | `capcut-mate-macos-x64-installer.dmg` |
| Windows x64（Intel 或 AMD） | `capcut-mate-windows-x64-installer.exe` |
| Windows ARM64 | `capcut-mate-windows-arm64-installer.exe` |

## 从源码启动

需要 Node.js 22.12 或更新版本。在仓库根目录安装依赖并启动前端：

```bash
npm ci
npm --prefix web ci
npm run web:dev
```

保持前端运行，在另一个终端从仓库根目录启动 Electron：

```bash
npm start
```

素材服务默认监听 `127.0.0.1:48763`。如果端口被占用，应用会选择可用端口，实际地址显示在配置中心。线上 CapCut Mate 需要可访问的素材直链，可把自己的 HTTPS 反向代理地址填入「公网直链设置」。

## 接入 Codex MCP

使用安装包时，可以用应用自带的 Electron 启动 MCP。保持剪映小助手运行，并将命令中的路径对应到实际安装位置。以下命令适用于装在 macOS「应用程序」目录的应用。

```bash
codex mcp add capcut-media --env ELECTRON_RUN_AS_NODE=1 -- \
  "/Applications/剪映小助手.app/Contents/MacOS/剪映小助手" \
  "/Applications/剪映小助手.app/Contents/Resources/app.asar/mcp/media-server.mjs"
```

Windows 用户可在 PowerShell 中执行以下命令，并填写实际安装目录。

```powershell
$installed = 'C:/实际安装目录'
codex mcp add capcut-media --env ELECTRON_RUN_AS_NODE=1 -- "$installed/剪映小助手.exe" "$installed/resources/app.asar/mcp/media-server.mjs"
```

Claude Code 和 WorkBuddy 使用相同的 stdio 命令、脚本路径和环境变量。使用源码时，在仓库根目录用 Node 注册 MCP。

```bash
codex mcp add capcut-media -- node "$(pwd)/mcp/media-server.mjs"
```

| 工具 | 用途 |
| --- | --- |
| `media_status` | 查询素材服务端口和链接范围 |
| `media_list` | 分页列出素材 |
| `media_upload` | 导入本机素材并返回直链 |
| `media_download` | 按素材 ID 保存原文件 |

### 用 MCP 创建并导入剪映草稿

`create_draft` 返回草稿链接。将 `media_upload` 得到的素材直链和该草稿链接交给 `add_videos`、`add_images`、`add_audios` 或 `add_captions`。所有时间字段使用微秒，批量素材和字幕传 JSON 数组。可使用 `add_keyframes` 等工具追加动画与效果。

编排完成后调用 `save_draft`。用 `get_draft` 可以查看工程文件清单，用 `import_draft_to_jianying` 可以通过正在运行的桌面助手导入配置中心指定的剪映草稿目录。重复导入同 ID 草稿时，会返回已有目录。

MCP 默认连接作者的线上 API。自部署时，在 MCP 环境中设置 `CAPCUT_MATE_BASE_URL`。线上 API 需要能访问素材直链，请使用配置中心设置的公网地址。云端导出和余额查询读取 MCP 环境变量 `CAPCUT_MATE_API_KEY`，云端导出按上游规则计费。原素材上传和下载用上表中的本机工具。

接口参数对照 [CapCut Mate 官方文档](https://docs.jcaigc.cn/capcut-mate/)。CapCut Mate v1 的入参模型来源提交记录在 `mcp/capcut-api-schema.json`。

## 上游与许可

基于 [CapCut Mate 的 desktop-client](https://github.com/Hommy-master/capcut-mate/tree/bb4e896/desktop-client) 修改，保留原项目的 MIT 许可证和版权声明。见 [LICENSE](LICENSE)。
