# 剪映小助手桌面端

支持 Windows 和 macOS。可下载剪映草稿，并在「配置中心」批量上传素材、复制直链和下载原文件。内置本机素材服务，可通过 MCP 调用。

[让 Agent 配置 MCP](#让-agent-配置-mcp)

## 下载桌面安装包

按系统和处理器选择安装包。[GitHub Releases 下载](https://github.com/laohan-repos/capcut-mate-mcp-desktop/releases/latest)

| 系统与芯片 | 安装包 |
| --- | --- |
| Windows x64（Intel 或 AMD） | `capcut-mate-windows-x64-installer.exe` |
| Windows ARM64（ARM 处理器） | `capcut-mate-windows-arm64-installer.exe` |
| macOS Apple Silicon（M 系列） | `capcut-mate-macos-arm64-installer.dmg` |
| macOS Intel | `capcut-mate-macos-x64-installer.dmg` |

### Windows 安装与启动

1. 在「设置 → 系统 → 关于」的「设备规格」下查看「系统类型」。基于 x64 的处理器选 x64，基于 ARM 的处理器选 ARM64。[查看 Windows 设备信息](https://support.microsoft.com/zh-cn/windows/experience/find-information-about-your-windows-device)
2. 双击 `.exe`，按向导完成安装。安装完成后，在开始菜单搜索并打开「剪映小助手」。
3. 先打开一次剪映，再到小助手的「配置中心 → 剪映草稿目录」确认状态为「已就绪」。默认草稿目录通常为 `%LOCALAPPDATA%\JianyingPro\User Data\Projects\com.lveditor.draft`。如果你在剪映里改过保存位置，在配置中心选择实际的草稿根目录。

### macOS 安装与启动

1. 在苹果菜单的「关于本机」确认是 Apple 芯片还是 Intel 处理器。
2. 打开 `.dmg`，把「剪映小助手」拖到「应用程序」，再从「应用程序」打开。
3. 先打开一次剪映，再到小助手的「配置中心 → 剪映草稿目录」确认状态为「已就绪」。默认草稿目录通常为 `~/Movies/JianyingPro/User Data/Projects/com.lveditor.draft`。

## 从源码启动

需要 Git 和 Node.js 22.12 或更新版本。

### Windows PowerShell

在第一个 PowerShell 窗口克隆仓库并启动前端。

```powershell
git clone https://gitee.com/laohan_repos/capcut-mate-mcp-desktop.git
Set-Location capcut-mate-mcp-desktop
npm.cmd ci
npm.cmd --prefix web ci
npm.cmd run web:dev
```

保持前端运行。在另一个 PowerShell 窗口进入仓库根目录，执行 `npm.cmd start` 打开桌面端。

### macOS 终端

在第一个终端窗口克隆仓库并启动前端。

```bash
git clone https://gitee.com/laohan_repos/capcut-mate-mcp-desktop.git
cd capcut-mate-mcp-desktop
npm ci
npm --prefix web ci
npm run web:dev
```

保持前端运行。在另一个终端进入仓库根目录，执行 `npm start` 打开桌面端。

素材服务默认监听 `127.0.0.1:48763`。如果端口被占用，应用会选择可用端口，实际地址显示在配置中心。用本机素材编排并导入草稿时，公网地址可以留空。需要云端读取原文件时，可在「公网直链设置」填入可访问的 HTTPS 地址。

### 从当前源码打包

安装依赖后，在仓库根目录构建前端。Windows 执行 `npm.cmd run web:build`，macOS 执行 `npm run web:build`。随后按目标架构执行对应命令，安装包输出到 `dist/`。

| 目标 | 打包命令 |
| --- | --- |
| Windows x64 | `npm.cmd run build-win-installer` |
| Windows ARM64 | `npm.cmd run build-win-arm64-installer` |
| macOS Apple Silicon | `npm run build-mac-installer` |
| macOS Intel | `npm run build-mac-x64-installer` |

## 让 Agent 配置 MCP

在运行剪映小助手的电脑上，把下面这句话发给有本机终端权限的 Codex、Claude Code 或 WorkBuddy。

> https://gitee.com/laohan_repos/capcut-mate-mcp-desktop 帮我按 README 和本机操作系统给当前客户端添加剪映小助手 MCP。优先使用本机已安装的剪映小助手，最后调用 `media_status` 验证连接。

接入时使用服务名 `capcut-media`，传输方式为本地 `stdio`。Agent 应先检查当前客户端是否已配置 `capcut-media`，能用的配置直接复用，修改时只更新这一项。

### 确定本地启动路径

优先使用已安装的桌面版。自 v1.1.0 起，Windows 和 macOS 安装包都内置 MCP。可按[下载桌面安装包](#下载桌面安装包)或[从源码启动](#从源码启动)准备小助手。接入时保持小助手运行。Windows 请在运行小助手的同一个 Windows 用户会话里使用 PowerShell。

**Windows 安装版**。将示例目录换成实际安装目录，可从剪映小助手快捷方式的「属性 → 目标」找到可执行文件。

```powershell
$capcut_dir = 'C:/Program Files/剪映小助手'
$capcut_exe = Join-Path $capcut_dir '剪映小助手.exe'
$capcut_asar = Join-Path $capcut_dir 'resources/app.asar'
$capcut_mcp = Join-Path $capcut_asar 'mcp/media-server.mjs'

Test-Path -LiteralPath $capcut_exe -PathType Leaf
Test-Path -LiteralPath $capcut_asar -PathType Leaf
```

两个检查都返回 `True` 后，在同一个 PowerShell 窗口执行下方的客户端接入命令。

**macOS 安装版**。以下以应用位于「应用程序」目录为例。

```bash
capcut_exe='/Applications/剪映小助手.app/Contents/MacOS/剪映小助手'
capcut_mcp='/Applications/剪映小助手.app/Contents/Resources/app.asar/mcp/media-server.mjs'
```

安装版使用应用自带的 Electron。MCP 脚本位于 `app.asar` 内，配置时保留完整路径 `app.asar/mcp/media-server.mjs`。源码版使用 Node.js 22.12 或更新版本，并提前安装仓库依赖。所有路径填写本机绝对路径。

### 接入 Codex MCP

安装版在设置上面的两个路径后执行。以下命令可直接在 Windows PowerShell 和 macOS 终端使用。

```sh
codex mcp add capcut-media --env ELECTRON_RUN_AS_NODE=1 -- "$capcut_exe" "$capcut_mcp"
codex mcp get capcut-media
```

源码版在仓库根目录按系统执行。

```powershell
codex mcp add capcut-media -- (Get-Command node.exe -CommandType Application).Source (Join-Path (Get-Location).Path 'mcp/media-server.mjs')
```

```bash
codex mcp add capcut-media -- "$(command -v node)" "$(pwd)/mcp/media-server.mjs"
```

### 接入 Claude Code

以下命令添加到用户配置，供各项目使用。安装版先设置对应系统的路径，在 Windows PowerShell 或 macOS 终端执行。

```sh
claude mcp add --env ELECTRON_RUN_AS_NODE=1 --transport stdio --scope user capcut-media -- "$capcut_exe" "$capcut_mcp"
claude mcp get capcut-media
```

源码版在仓库根目录按系统执行。

```powershell
claude mcp add --transport stdio --scope user capcut-media -- (Get-Command node.exe -CommandType Application).Source (Join-Path (Get-Location).Path 'mcp/media-server.mjs')
```

```bash
claude mcp add --transport stdio --scope user capcut-media -- "$(command -v node)" "$(pwd)/mcp/media-server.mjs"
```

### 接入 WorkBuddy

在 WorkBuddy 的 MCP 配置中，将对应系统的 `capcut-media` 条目合并到已有的 `mcpServers`。也可编辑用户目录下的 `.workbuddy/mcp.json`。保存后在连接器中启用 `capcut-media`，按客户端提示信任。

**Windows 安装版**。将 `command` 和 `args` 中的目录换成实际安装目录。JSON 路径可使用 `/`。

```json
{
  "mcpServers": {
    "capcut-media": {
      "type": "stdio",
      "command": "C:/Program Files/剪映小助手/剪映小助手.exe",
      "args": ["C:/Program Files/剪映小助手/resources/app.asar/mcp/media-server.mjs"],
      "env": {
        "ELECTRON_RUN_AS_NODE": "1"
      }
    }
  }
}
```

**macOS 安装版**。

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

源码版将 `command` 指向 Node 可执行文件，Windows 使用 `node.exe` 的绝对路径。将 `args` 中的路径指向仓库里的 `mcp/media-server.mjs`，`env` 可省略。

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

`create_draft` 返回草稿链接。使用 `media_upload` 或 `media_list` 返回的本机链接，可直接调用 `add_images`、`add_videos` 和 `add_audios`。所有时间字段使用微秒，批量素材和字幕传 JSON 数组。可使用 `add_keyframes` 等工具追加动画与效果。

桌面版 v1.1.3 支持用 `get_audio_duration` 测量素材库中的本机配音时长，用 `audio_timelines` 按给定顺序排出连续时间线。将对应时间段和素材链接传给 `add_audios`，并用相同的时间段编排字幕。`easy_create_material` 也支持本机素材链接，使用上游的预设时长。这些步骤均可在公网地址留空时使用。

编排完成后调用 `save_draft`，再调用 `import_draft_to_jianying`。桌面版 v1.1.2 起会把素材库里的原文件复制到剪映草稿内并更新路径。重复导入同 ID 草稿时，会返回已有目录。

桌面版 v1.1.4 起，MCP 上传完成后「配置中心」会自动显示新素材，草稿导入完成后「草稿历史」会自动显示保存结果。

MCP 默认连接作者的线上 API。自部署时，在 MCP 环境中设置 `CAPCUT_MATE_BASE_URL`。云端导出或其他需要线上读取原文件的接口仍需要线上可访问的素材链接。云端导出和余额查询读取 MCP 环境变量 `CAPCUT_MATE_API_KEY`，云端导出按上游规则计费。

如果 `add_images` 或 `add_videos` 返回 `MEDIA_LINK_LOCAL_ONLY`，可调用 `media_list` 确认链接对应素材库中正确类型的原文件，再继续原草稿。

接口参数对照 [CapCut Mate 官方文档](https://docs.jcaigc.cn/capcut-mate/)。CapCut Mate v1 的入参模型来源提交记录在 `mcp/capcut-api-schema.json`。

## 上游与许可

基于 [CapCut Mate 的 desktop-client](https://github.com/Hommy-master/capcut-mate/tree/bb4e896/desktop-client) 修改，保留原项目的 MIT 许可证和版权声明。见 [LICENSE](LICENSE)。
