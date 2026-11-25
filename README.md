# 剪映小助手桌面端

下载剪映草稿，并在「配置中心」批量上传素材、复制直链和下载原文件。内置本机素材服务，可通过 MCP 调用。

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

保持桌面客户端运行，在仓库根目录执行：

```bash
codex mcp add capcut-media -- node "$(pwd)/mcp/media-server.mjs"
```

| 工具 | 用途 |
| --- | --- |
| `media_status` | 查询素材服务端口和链接范围 |
| `media_list` | 分页列出素材 |
| `media_upload` | 导入本机素材并返回直链 |
| `media_download` | 按素材 ID 保存原文件 |

## 上游与许可

基于 [CapCut Mate 的 desktop-client](https://github.com/Hommy-master/capcut-mate/tree/bb4e896/desktop-client) 修改，保留原项目的 MIT 许可证和版权声明。见 [LICENSE](LICENSE)。
