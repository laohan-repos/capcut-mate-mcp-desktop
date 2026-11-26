# 剪映小助手桌面端

下载剪映草稿，并在「配置中心」批量上传素材、复制直链和下载原文件。内置本机素材服务，可通过 MCP 调用。

[让 Agent 配置 MCP](#让-agent-配置-mcp)

## 下载桌面安装包

在 [GitHub Releases](https://github.com/laohan-repos/capcut-mate-mcp-desktop/releases/latest) 选择对应系统和芯片的安装包。

| 系统与芯片 | 安装包 |
| --- | --- |
| macOS Apple Silicon（M 系列） | `capcut-mate-macos-arm64-installer.dmg` |
| macOS Intel | `capcut-mate-macos-x64-installer.dmg` |
| Windows x64（Intel 或 AMD） | `capcut-mate-windows-x64-installer.exe` |
| Windows ARM64 | `capcut-mate-windows-arm64-installer.exe` |

## 从源码启动

需要 Node.js 22.12 或更新版本。克隆仓库后，在仓库根目录安装依赖并启动前端。

```bash
git clone https://github.com/laohan-repos/capcut-mate-mcp-desktop.git
cd capcut-mate-mcp-desktop
npm ci
npm --prefix web ci
npm run web:dev
```

保持前端运行，在另一个终端从仓库根目录启动 Electron：

```bash
npm start
```

素材服务默认监听 `127.0.0.1:48763`。如果端口被占用，应用会选择可用端口，实际地址显示在配置中心。线上 CapCut Mate 需要可访问的素材直链，可把自己的 HTTPS 反向代理地址填入「公网直链设置」。

## 让 Agent 配置 MCP

在运行剪映小助手的电脑上，把下面这句话发给有本机终端权限的 Codex、Claude Code 或 WorkBuddy。

> https://github.com/laohan-repos/capcut-mate-mcp-desktop 帮我按 README 给当前客户端添加剪映小助手 MCP。优先使用本机已安装的剪映小助手，最后调用 `media_status` 验证连接。

接入时使用服务名 `capcut-media`，传输方式为本地 `stdio`。GitHub 地址用于读取说明和下载安装包。Agent 应先检查当前客户端是否已配置 `capcut-media`，能用的配置直接复用，修改时只更新这一项。

### 确定本地启动路径

优先使用已安装的桌面版。v1.1.0 安装包内置 MCP。未安装时，可从 [GitHub Releases](https://github.com/laohan-repos/capcut-mate-mcp-desktop/releases/latest) 选择当前系统与芯片的安装包，也可按[从源码启动](#从源码启动)运行。打开剪映小助手，并在接入期间保持运行。

**macOS 安装版**，以应用放在「应用程序」目录为例。

```bash
capcut_exe='/Applications/剪映小助手.app/Contents/MacOS/剪映小助手'
capcut_mcp='/Applications/剪映小助手.app/Contents/Resources/app.asar/mcp/media-server.mjs'
```

**Windows 安装版**，在 PowerShell 中填写实际安装目录。可从剪映小助手快捷方式的「目标」找到它。

```powershell
$capcut_dir = 'C:/实际安装目录'
$capcut_exe = Join-Path $capcut_dir '剪映小助手.exe'
$capcut_mcp = Join-Path $capcut_dir 'resources/app.asar/mcp/media-server.mjs'
```

安装版使用应用自带的 Electron。确认应用可执行文件和 `app.asar` 存在，并保留脚本路径中的 `app.asar/mcp/`。源码版使用 Node.js 22.12 或更新版本，提前在仓库根目录运行 `npm ci`。下方所有路径都使用本机绝对路径。

### 接入 Codex MCP

安装版在设置上面的两个路径后执行。

```sh
codex mcp add capcut-media --env ELECTRON_RUN_AS_NODE=1 -- "$capcut_exe" "$capcut_mcp"
codex mcp get capcut-media
```

源码版在仓库根目录执行。

```bash
codex mcp add capcut-media -- "$(command -v node)" "$(pwd)/mcp/media-server.mjs"
```

```powershell
codex mcp add capcut-media -- (Get-Command node -CommandType Application).Source (Join-Path (Get-Location).Path 'mcp/media-server.mjs')
```

### 接入 Claude Code

以下命令添加到用户配置，供各项目使用。安装版使用上面的路径。

```sh
claude mcp add --env ELECTRON_RUN_AS_NODE=1 --transport stdio --scope user capcut-media -- "$capcut_exe" "$capcut_mcp"
claude mcp get capcut-media
```

源码版填写 Node 可执行文件和剪映小助手源码脚本的实际绝对路径。

```sh
claude mcp add --transport stdio --scope user capcut-media -- "<Node 可执行文件绝对路径>" "<仓库绝对路径>/mcp/media-server.mjs"
```

### 接入 WorkBuddy

在 WorkBuddy 的 MCP 配置中，将以下条目合并到已有的 `mcpServers`。也可编辑用户目录下的 `.workbuddy/mcp.json`。保存后，在 WorkBuddy 的连接器中启用 `capcut-media`，按客户端提示信任。

```json
{
  "mcpServers": {
    "capcut-media": {
      "type": "stdio",
      "command": "/Applications/剪映小助手.app/Contents/MacOS/剪映小助手",
      "args": ["/Applications/剪映小助手.app/Contents/Resources/app.asar/mcp/media-server.mjs"],
      "env": {
        "ELECTRON_RUN_AS_NODE": "1"
      }
    }
  }
}
```

Windows 使用实际安装路径替换 `command` 和 `args` 中的路径，JSON 路径可用 `C:/...` 写法。源码版将 `command` 指向 Node 可执行文件，将 `args` 中的路径指向仓库里的 `mcp/media-server.mjs`，`env` 可省略。

相关文档见 [Claude Code MCP](https://code.claude.com/docs/en/mcp) 和 [WorkBuddy MCP 配置](https://open.workbuddy.cn/docs/connector)。

### 验证连接

配置后重新启动客户端，让 Agent 调用 `capcut-media` 的 `media_status`。返回 `port`、`localBaseUrl` 和 `count` 即表示 Agent 可以访问本机素材服务。若提示素材服务尚未运行，打开剪映小助手，在「配置中心 → 素材上传与下载」确认本机服务地址后重试。

| 工具 | 用途 |
| --- | --- |
| `media_status` | 查询素材服务端口和链接范围 |
| `media_list` | 分页列出素材 |
| `media_upload` | 导入本机素材并返回直链 |
| `media_download` | 按素材 ID 保存原文件 |

### 用 MCP 创建并导入剪映草稿

`create_draft` 返回草稿链接。图片和视频可以直接使用 `media_upload` 或 `media_list` 返回的本机链接，分别传给 `add_images` 和 `add_videos`。这个流程无需配置公网地址。所有时间字段使用微秒，批量素材和字幕传 JSON 数组。可使用 `add_keyframes` 等工具追加动画与效果。

编排完成后调用 `save_draft`，再调用 `import_draft_to_jianying`。桌面版 v1.1.2 起会把素材库里的原文件复制到剪映草稿内并更新路径。重复导入同 ID 草稿时，会返回已有目录。

MCP 默认连接作者的线上 API。自部署时，在 MCP 环境中设置 `CAPCUT_MATE_BASE_URL`。云端导出或其他需要线上读取原文件的接口仍需要线上可访问的素材链接。云端导出和余额查询读取 MCP 环境变量 `CAPCUT_MATE_API_KEY`，云端导出按上游规则计费。

如果 `add_images` 或 `add_videos` 返回 `MEDIA_LINK_LOCAL_ONLY`，可调用 `media_list` 确认链接对应素材库中正确类型的原文件，再继续原草稿。

接口参数对照 [CapCut Mate 官方文档](https://docs.jcaigc.cn/capcut-mate/)。CapCut Mate v1 的入参模型来源提交记录在 `mcp/capcut-api-schema.json`。

## 上游与许可

基于 [CapCut Mate 的 desktop-client](https://github.com/Hommy-master/capcut-mate/tree/bb4e896/desktop-client) 修改，保留原项目的 MIT 许可证和版权声明。见 [LICENSE](LICENSE)。
