# LocalDock Integration

LocalDock 0.7.0 or newer manages Immich Mini as two services. The Node service
owns the application and API. The static service provides only the LocalDock
tool bridge.

## Services

### Immich Mini Backend

- Type: `node`
- Project directory: `<PROJECT_ROOT>`
- Runtime: `node.exe` from `PATH`, or `<PROJECT_ROOT>\runtime\node.exe`
- Arguments:
  `--enable-source-maps dist/server/index.js --immich-mini-production`
- Port: `3310`
- Health check: `/api/health`
- Startup timeout: `30` seconds
- Shutdown timeout: `5` seconds
- Automatic restart: enabled, `2` seconds after an unexpected exit
- Open automatically: enabled
- URL: `http://127.0.0.1:3310/`

LocalDock injects `PORT=3310` and starts the Node process directly. It stops the
full process tree when stopping or restarting the service. The production marker
identifies this managed process, while the fixed loopback port prevents a second
listener.

### Immich Mini Tools

- Type: `static`
- Project directory: `<PROJECT_ROOT>\localdock-site`
- Entry file: `index.html`
- Port: `7012`
- Bridge: enabled, root `<PROJECT_ROOT>`
- Local command execution: enabled
- Open automatically: disabled
- File monitoring: disabled
- Auto reload: disabled

Open it only when the application needs a LocalDock-backed external tool action:

```text
http://127.0.0.1:7012/index.html
```

The page does not start or stop Node. Its `打开照片` link opens the backend at
port `3310`. The backend remains available while the tools service is stopped.

Disable LocalDock file monitoring for the tools service because Immich Mini
already owns media-library monitoring. A second watcher would add load without
changing the library index.

## Command allow-list

The tools service must allow exactly these seven commands:

```json
[
  {
    "id": "immich-open-with",
    "label": "用系统打开方式打开",
    "executable": "C:\\Windows\\System32\\OpenWith.exe",
    "args": [],
    "cwd": "",
    "timeout": 30,
    "allow_args": true,
    "detached": true
  },
  {
    "id": "immich-open-default",
    "label": "用默认软件打开",
    "executable": "C:\\Windows\\explorer.exe",
    "args": [],
    "cwd": "",
    "timeout": 30,
    "allow_args": true,
    "detached": true
  },
  {
    "id": "immich-open-editor",
    "label": "用外部编辑软件打开",
    "executable": "powershell.exe",
    "args": [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      "scripts\\localdock-open-editor.ps1"
    ],
    "cwd": "",
    "timeout": 30,
    "allow_args": true,
    "detached": true
  },
  {
    "id": "immich-open-frame-tool",
    "label": "用相框软件打开",
    "executable": "powershell.exe",
    "args": [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-STA",
      "-File",
      "scripts\\localdock-open-frame-tool.ps1"
    ],
    "cwd": "",
    "timeout": 30,
    "allow_args": true,
    "detached": false
  },
  {
    "id": "immich-open-in-folder",
    "label": "在文件夹中打开",
    "executable": "powershell.exe",
    "args": [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      "scripts\\localdock-open-in-folder.ps1"
    ],
    "cwd": "",
    "timeout": 30,
    "allow_args": true,
    "detached": false
  },
  {
    "id": "immich-choose-folder",
    "label": "选择导出文件夹",
    "executable": "powershell.exe",
    "args": [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-STA",
      "-File",
      "scripts\\localdock-choose-folder.ps1"
    ],
    "cwd": "",
    "timeout": 300,
    "allow_args": true,
    "detached": false
  },
  {
    "id": "immich-export-media",
    "label": "导出媒体到文件夹",
    "executable": "powershell.exe",
    "args": [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      "scripts\\localdock-export-media.ps1"
    ],
    "cwd": "",
    "timeout": 3600,
    "allow_args": true,
    "detached": false
  }
]
```

The removed `immich-mini-start`, `immich-mini-stop` and
`immich-mini-add-library` commands must not be added back. LocalDock owns the
backend lifecycle, and media libraries are added from Immich's user settings.

The batch bar loads `open-tool.html` in a hidden iframe from the LocalDock
origin. That page uses `LocalDock.run` with the selected original paths, so
media libraries outside the LocalDock bridge root work without widening the
bridge filesystem permission or opening a temporary helper window.

The batch actions are:

- `immich-open-default`: open selected images or videos with their Windows
  default applications.
- `immich-open-with`: show the Windows app picker for one selected asset.
- `immich-open-editor`: open images or videos with the configured editor EXE.
- `immich-open-frame-tool`: open selected images with the configured frame tool.
  The copicseal path uses a file-drop clipboard paste because that application
  does not accept image paths as command-line arguments.
- `immich-open-in-folder`: select one file in Explorer or open all distinct
  parent folders for a multi-file selection.
- `immich-choose-folder`: show the folder picker used before rendering internal
  frame exports. The HTTP render request starts only after a folder is chosen.
- `immich-export-media`: show a folder picker and copy the selected originals.
  Existing names are preserved by appending ` (1)`, ` (2)` and so on.

Editor paths are stored by Immich's user-settings API and can be changed under
Settings > External tools. Tool paths are intentionally blank by default;
configure local applications after installation.

The export and folder-picker commands receive only media paths from the page.
Their optional `--destination=<folder>` argument is reserved for direct
validation and must not be added to the LocalDock command configuration.

## Runtime and data boundaries

The Node executable, application dependencies, logs, SQLite database,
thumbnails and face caches remain under `<PROJECT_ROOT>`.
LocalDock does not copy or rewrite them. Media originals stay in the library
directories selected in Immich Mini.

The Node service listens only on loopback. The health endpoint identifies the
service as `immich-mini`. `ImmichMini.exe` remains an optional standalone
fallback and is not required when the LocalDock Node service is used.
