# Immich Mini

[简体中文](#简体中文) | [English](#english)

> A Windows-first, single-user local media manager derived from
> [Immich](https://github.com/immich-app/immich).
>
> This is an independent community project and is not affiliated with the
> Immich maintainers.

## 简体中文

Immich Mini 是一个面向 Windows 的本地单用户媒体管理器。它复用 Immich Web
前端，保留时间线、相册、标签、评分、地图、人物、搜索和媒体查看等交互，同时
将后端替换为 Fastify、SQLite、Sharp、FFmpeg 和按需启动的人脸 Worker。

本项目基于开源项目 [Immich](https://github.com/immich-app/immich) 改造。
它不是 Immich 官方版本，也没有 Immich 团队的背书或维护承诺。原项目采用
AGPL-3.0，本项目同样按 AGPL-3.0 发布。

### 主要特点

- 复用 Immich Svelte Web 前端，不重新设计页面。
- Windows 原生运行，不依赖 Docker、PostgreSQL、Redis 或 WSL。
- 单用户、本地回环访问，不提供登录、分享和多用户功能。
- 媒体保留在原始目录，不复制、不上传、不覆盖用户原文件。
- 使用 SQLite 保存索引、相册、标签、评分、位置、人脸和任务数据。
- 支持图片、视频、HEIC/JPG 静态预览和 HTTP Range 视频播放。
- 支持苹果 Live Photo 配对 MOV，以及安卓 Motion Photo 内嵌视频。
- 支持时间线、文件夹树、地图、相册、人物、标签、评分和批量操作。
- 人脸识别按需运行；空闲后退出 Python Worker 并释放模型内存。
- 缩略图、视频帧、人脸裁剪图和动态照片缓存都位于应用数据目录。

### 当前限制

- 仅面向 Windows 和本机单用户使用，默认只监听 `127.0.0.1`。
- CLIP 智能搜索、OCR、共享链接和多用户功能未启用。
- 地图点位可缓存，但底图仍依赖 Immich 地图瓦片服务和浏览器 HTTP 缓存。
- 非标准 Motion Photo 标记或浏览器不支持的视频编码可能无法动态播放。
- 媒体元数据编辑写入本地 SQLite，不回写原图片的 EXIF/XMP。

### 环境要求

- Windows 10/11
- Node.js `22.14` 或更高版本
- FFmpeg 和 FFprobe
- Python 与 OpenCV/ONNX Runtime：仅人脸识别需要
- OpenCV Zoo YuNet 和 SFace ONNX 模型：仅人脸识别需要

仓库包含已经构建好的 Immich 前端和对应源码。`runtime/`、模型二进制、
数据库、日志、媒体和本地配置不会提交到 Git。

### 快速启动

```powershell
git clone https://github.com/pmmxd/immich-mini.git
cd immich-mini
npm install
npm run build
npm start
```

打开：

```text
http://127.0.0.1:3310/
```

首次启动后，在 Immich Mini 的设置页添加本地媒体库目录。

### 环境变量

可以从 [`.env.example`](.env.example) 创建本地 `.env`：

```dotenv
PORT=3310
FFMPEG_PATH=ffmpeg
FFPROBE_PATH=ffprobe
# IMMICH_MINI_LIBRARY=C:\Media
# IMMICH_MINI_DATA_DIR=.\data
# IMMICH_MINI_FACE_DETECTION_THRESHOLD=0.7
# IMMICH_MINI_FACE_CLUSTER_THRESHOLD=0.45
```

如果使用项目内置运行时，也可以将 `FFMPEG_PATH`、`FFPROBE_PATH` 和
`PYTHON_PATH` 指向本机的可执行文件。

### 使用 LocalDock 运行

推荐通过 [pmmxd/localdock](https://github.com/pmmxd/localdock) 管理本项目。
LocalDock 是同一作者维护的 Windows 本地服务管理器，可统一启动、停止和查看
Node 后端与静态桥接页。

在 LocalDock 中创建两个服务：

#### Immich Mini Backend

- 类型：Node 后端
- 项目目录：Immich Mini 仓库根目录
- 运行时：系统 `node.exe`，或项目内的 `runtime\node.exe`
- 启动参数：`--enable-source-maps dist/server/index.js`
- 工作目录：仓库根目录
- 端口：`3310`
- 健康检查：`/api/health`
- 打开地址：`http://127.0.0.1:3310/`

#### Immich Mini Tools

- 类型：静态 HTML
- 项目目录：仓库下的 `localdock-site`
- 入口文件：`index.html`
- 端口：`7012`
- 文件桥接：启用
- 桥接根目录：Immich Mini 仓库根目录
- 文件监控：关闭
- 自动刷新：关闭

Tools 仅负责外部软件打开、文件选择、文件夹定位和导出等桌面桥接操作。
详细命令白名单见 [docs/LOCALDOCK.md](docs/LOCALDOCK.md)。

### 数据与隐私

- 原始照片和视频始终保留在用户选择的媒体库目录。
- `.gitignore` 排除了 `data/`、`work/`、`logs/`、`runtime/`、模型二进制、
  数据库、媒体和环境变量。
- Immich Mini 不会把媒体上传到远程服务器。
- 提交问题或日志前，请先删除本机路径、用户名、媒体文件名和数据库内容。

### 开发与验证

```powershell
npm run check
npm test
npm run build
```

前端源码位于 `frontend/immich-web-source/`，构建产物位于
`vendor/immich-web/`。普通用户不需要重新构建前端。

### 许可证与来源

- 原项目：[Immich](https://github.com/immich-app/immich)
- 原项目官网：[https://immich.app](https://immich.app)
- 本地服务管理器：[pmmxd/localdock](https://github.com/pmmxd/localdock)
- 本项目许可证：[AGPL-3.0](LICENSE)
- 第三方说明：[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)

Immich Web 前端源码和构建产物保留在仓库中，其版权归原项目贡献者所有。
Immich Mini 的后端、桌面桥接和本地适配代码由本项目维护者独立实现。

## English

Immich Mini is a Windows-first, single-user local media manager derived from
[Immich](https://github.com/immich-app/immich). It reuses the Immich web
frontend and replaces the original server stack with Fastify, SQLite, Sharp,
FFmpeg, and an on-demand Python/ONNX face worker.

This is an independent community project. It is not an official Immich release
and is not endorsed or maintained by the Immich team. The upstream project and
this derivative are distributed under AGPL-3.0.

### Highlights

- Reuses the Immich Svelte frontend instead of redesigning the interface.
- Runs natively on Windows without Docker, PostgreSQL, Redis, or WSL.
- Single-user localhost application with no login or sharing workflow.
- Keeps source media in place and never uploads or overwrites originals.
- Stores indexes, albums, tags, ratings, locations, faces, and jobs in SQLite.
- Supports images, videos, HEIC/JPG previews, and HTTP Range video playback.
- Supports Apple Live Photo MOV pairing and embedded Android Motion Photos.
- Provides timelines, folders, maps, albums, people, tags, ratings, and batch tools.
- Starts the Python face worker on demand and releases models after idle timeout.

### Requirements

- Windows 10 or 11
- Node.js `22.14` or newer
- FFmpeg and FFprobe
- Python with OpenCV and ONNX Runtime for face recognition
- OpenCV Zoo YuNet and SFace ONNX models for face recognition

The repository includes the upstream Immich frontend source and production
build. Runtime binaries, model weights, databases, logs, local configuration,
and user media are intentionally excluded from Git.

### Quick Start

```powershell
git clone https://github.com/pmmxd/immich-mini.git
cd immich-mini
npm install
npm run build
npm start
```

Open `http://127.0.0.1:3310/` and add a media library from the settings page.

### LocalDock

The recommended Windows launcher is
[pmmxd/localdock](https://github.com/pmmxd/localdock). Configure two LocalDock
services:

- `Immich Mini Backend`: Node service, project root, port `3310`, health path
  `/api/health`, arguments `--enable-source-maps dist/server/index.js`.
- `Immich Mini Tools`: static service rooted at `localdock-site`, port `7012`,
  with file bridge enabled and file monitoring disabled.

See [docs/LOCALDOCK.md](docs/LOCALDOCK.md) for the complete command allow-list
and bridge configuration.

### Privacy

- Original media remains in user-selected directories.
- Git excludes databases, media, logs, runtime binaries, model weights, and
  environment files.
- Before posting logs or issues, remove local paths, usernames, filenames, and
  database content.

### Attribution and License

- Upstream: [Immich](https://github.com/immich-app/immich)
- Immich website: [https://immich.app](https://immich.app)
- LocalDock: [pmmxd/localdock](https://github.com/pmmxd/localdock)
- License: [AGPL-3.0](LICENSE)
- Third-party notices: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)

The Immich frontend source and build remain the work of the Immich
contributors. The Immich Mini backend and local integration layer are
maintained independently.
