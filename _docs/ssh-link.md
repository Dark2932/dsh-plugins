# ssh-link 开发文档

> 适用版本：`0.1.0`。本文描述插件当前的实际行为；代码变化后请同步更新。

## 1. 概览

ssh-link 为 DeepSeek Harness（DSH）增加 SSH 远程操作能力。DSH 仍然运行在本地，但 Agent 可以通过 `ssh_*` 工具在远端服务器上执行命令、读写文件、查找和搜索；设置页里还提供一个“命令 + 输出”式的远端终端。

| 项目 | 值 |
| --- | --- |
| 包名 | `ssh-link` |
| 版本 | `0.1.0` |
| Host 入口 | `index.js` |
| Client 入口 | `client.js`（`dsh.client.platform = web`） |
| 运行时依赖 | `ssh2` |
| 连接配置 | `$DSH_HOME/ssh-link/connections.json` |
| 凭据 | DSH 凭据存储（`ctx.credentials`） |
| 远端要求 | POSIX、SSH、`sftp-server` |

## 2. 功能

### 2.1 主机管理

“设置 → SSH 连接”支持：

- 新建、编辑、删除连接；
- 密码或本地私钥认证，支持带口令的私钥；
- 自定义端口、远端工作目录；
- 设置默认目标；
- 清除已固定的主机密钥；
- 保存/忘记密码和私钥口令。

连接名称必须唯一，重名会自动加 ` (2)`、` (3)` 后缀，保证 `connect <名称>` 不歧义。

### 2.2 远端终端

连接后，在面板里输入命令并回车，命令通过 SSH 在远端执行，输出显示在同一页。它是“命令 + 输出”通道，不是 PTY，因此不支持 `vim`、`htop` 等全屏交互程序。

### 2.3 Agent 工具

| 工具 | 作用 |
| --- | --- |
| `ssh_connection` | 列出、添加、修改、删除、连接、断开、设为默认 |
| `ssh_exec` | 在远端 POSIX shell 执行命令 |
| `ssh_read` | 读取远端文本文件，带行号和分页 |
| `ssh_write` | 整文件写入 |
| `ssh_edit` | 字面量替换，默认要求唯一匹配 |
| `ssh_glob` | 远端 glob 查找 |
| `ssh_grep` | 远端内容搜索，优先 `rg` |

所有工具都接受可选的 `connection`（名称或 id）；省略时使用活动目标。断开后，下一次工具调用会自动重连。

插件还会向 Agent 注入一段系统提示，明确“本地工具操作本机，远端操作使用 `ssh_*`”，避免把远端路径传给本地 `read` / `write`。

### 2.4 主机密钥固定

- 首次连接时记录 SHA-256 主机密钥指纹，并写入连接配置。
- 后续连接会校验指纹；不一致时拒绝连接，并提示需要 `allowHostKeyChange`。
- 服务器重装或换机后，可在编辑连接时勾选“清除已固定的主机密钥”，或调用 `ssh_connection` 时传 `resetHostKey: true` / `allowHostKeyChange: true`。

## 3. 文件结构

```text
ssh-link/
├── index.js            Host 半：连接管理、凭据、SFTP、工具、HTTP API
├── client.js           Client 半：设置页、连接表单、远端终端
├── cordis.patch.yml    Bundle 补丁：向 profile 插入 ssh-link 条目
├── locale/             插件元数据的中英文标题
├── test/
│   ├── ssh-server.mjs  一次性 SSH/SFTP 测试服务器
│   └── e2e.mjs         Host 半端到端测试
├── icon.svg            插件图标
├── package.json        包信息、`ssh2` 依赖、`dsh.client` 声明
└── README.md           面向用户的功能和安装说明
```

## 4. Host 半：`index.js`

### 4.1 插件入口

```js
export const inject = ['tools', 'webServer', 'systemPrompt', 'credentials']

export function apply(ctx) {
  const manager = new SshManager(ctx)
  // 注册 ssh_* 工具
  // 注入系统提示
  // 注册 /ssh-link/api
  // 卸载时断开所有连接
}
```

`apply` 中的资源都通过 `ctx.effect()` 管理，插件停用或 profile 卸载时会释放：

- `manager.dispose()`：关闭所有活动连接；
- 工具注册的 disposer；
- `systemPrompt.section()` 的 disposer；
- `webServer.register()` 的路由。

### 4.2 连接配置：`ProfileStore`

`ProfileStore` 负责读写 `$DSH_HOME/ssh-link/connections.json`：

```json
{
  "version": 1,
  "defaultId": "ssh-ab12cd",
  "connections": [
    {
      "id": "ssh-ab12cd",
      "name": "prod",
      "host": "10.0.0.10",
      "port": 22,
      "user": "deploy",
      "auth": "key",
      "keyPath": "~/.ssh/id_ed25519",
      "remoteCwd": "/var/www/app",
      "hostFingerprint": "SHA256:...",
      "passwordRef": "SSH_LINK_SSH_AB12CD_PASSWORD",
      "passphraseRef": null,
      "createdAt": "2026-..."
    }
  ]
}
```

- `load()` 对缺失或损坏的文件容错，解析失败时从空列表开始。
- `save()` 先写临时文件，再 `rename` 覆盖，权限 `0600`；目录权限 `0700`。
- 连接配置只保存凭据**引用**，不保存密码或口令原文。

### 4.3 凭据

`SshManager.setSecret()` / `secret()` / `hasSecret()` 封装 `ctx.credentials`：

- 密码引用：`SSH_LINK_<ID>_PASSWORD`
- 私钥口令引用：`SSH_LINK_<ID>_PASSPHRASE`
- 空值会 `unset` 并清空引用。
- `sanitize()` 在返回给 Client 或工具前移除 `passwordRef` / `passphraseRef`；`describeAll()` 额外返回 `hasPassword` / `hasPassphrase`。

### 4.4 目标解析

`profileOf(reference)` 的优先级：

1. 精确匹配 id 或 name；
2. 名称大小写不敏感匹配；
3. `defaultId` 指向的连接；
4. 只有一个连接时直接使用它。

`requireProfile()` 在找不到时抛出错误，并列出已保存的连接，方便 Agent 纠正。

### 4.5 连接生命周期

```text
connect(reference)
  ├─ 已有 live 连接 → 设为 default，返回
  ├─ 已有 pending 连接 → 等待同一个 Promise
  └─ openConnection(profile)
       ├─ 读取密码 / 私钥 / 口令
       ├─ ssh2.Client.connect()
       │    ├─ hostHash: sha256
       │    ├─ hostVerifier：校验/观察指纹
       │    ├─ tryKeyboard：用密码回答 keyboard-interactive
       │    └─ keepalive 15s × 3
       ├─ 成功后放入 live Map
       ├─ 首次连接写入 hostFingerprint
       └─ 解析远端 home 目录，失败则断开并报错
```

- `live: Map<id, { client, sftp, sftpPromise, homeDir }>` 保存活动连接。
- `pending: Map<id, Promise>` 避免同一目标并发连接。
- `client.on('close')` 会从 `live` 删除连接；`requireEntry()` 发现没有 live 连接时会自动重连。
- 编辑一个已连接的目标会先断开，确保新配置生效。

### 4.6 命令执行

`exec(reference, command, options)`：

- 工作目录优先级：`options.cwd` > `profile.remoteCwd` > 远端 home；
- 实际命令为 `cd -- <quoted cwd> && <command>`；
- 默认超时 120 秒，可配置 1 秒到 1 小时；
- stdout/stderr 各截断到 200,000 字符；
- 支持 `AbortSignal`；超时或中止时向远端流发送 `KILL` 并关闭；
- 返回 `{ stdout, stderr, code, signal, timedOut, truncated, command, host }`。

`formatExec()` 统一生成给终端或工具看的文本：命令、stdout、stderr、退出码、截断/超时提示。

### 4.7 文件操作

| 方法 | 实现要点 |
| --- | --- |
| `read()` | SFTP 流式读取；按 `offset` / `limit` 取行；单行最多 2,000 字符；输出最多 50 KB；最多扫描 20 MB；带行号与续读提示 |
| `write()` | 内容上限 8 MB；自动创建父目录；直接 `writeFile` |
| `edit()` | 读取整个文件（上限 8 MB）；拒绝二进制；默认要求唯一匹配；`replaceAll` 可全替换 |
| `glob()` | 远端 `find . -type f`，再用 JS 的 `globToRegExp` 匹配；最多显示 200 个 |
| `grep()` | 优先 `rg --line-number ...`，否则 `grep -rnI`；最多 200 行；支持 `include` glob |
| `commandExists()` | `command -v` 探测远端命令 |

路径解析由 `resolveRemotePath()` 处理：

- `~` 展开到远端 home；
- 相对路径以 `remoteCwd` 或 home 为基准；
- 绝对路径原样使用；
- 使用 `posixPath` 处理远端路径，不依赖本机路径规则。

### 4.8 HTTP API

路径：`/ssh-link/api`（`kind: 'exact'`）。

| 方法 | 动作 |
| --- | --- |
| `GET` | 返回连接列表和 `defaultId` |
| `POST` | `save`、`remove`、`connect`、`disconnect`、`default`、`exec`、`status` |

安全边界：

- POST 必须带 `x-ssh-link: 1` 请求头；
- 带 `Origin` 时，必须与请求 `Host` 同源，且协议与 `webServer.protocol` 一致；
- body 上限为 1 MB；
- 该路由不额外校验 DSH 登录态，信任边界与本地 DSH 一致。

错误统一返回 `{ ok: false, error }`；跨源或缺少请求头返回 403。

### 4.9 工具定义

`buildTools(manager)` 返回原始工具定义，`textTool()` 负责：

- 参数必填校验；
- 参数类型/枚举校验；
- 把结果包装成文本输出。

`ssh_connection` 的 `add` / `update` 分别映射到 `upsert({ createOnly, requireExisting })`，避免“更新时误建新连接”。

`apply` 通过 `ctx.tools.register()` 注册工具，通过 `ctx.systemPrompt.section()` 注入 `ssh-link:remote-targets` 提示（order 120）。

## 5. Client 半：`client.js`

### 5.1 设置页

Client 通过 `settings.section` 注册“SSH 连接”页，主要状态：

- `snapshot`：连接列表和默认连接；
- `draft`：新建/编辑表单；
- `lines`：远端终端输出；
- `terminalTarget`：当前终端目标；
- `busyId` / `saving` / `running`：操作状态。

页面加载时调用 `status`，之后每 8 秒静默刷新一次，保证连接状态和其他入口的修改能同步。

表单字段：

- 名称、主机、端口、用户；
- 认证方式：密码 / 私钥；
- 私钥路径、密码、私钥口令；
- 远端工作目录；
- 清除主机密钥、忘记已保存密码。

### 5.2 请求封装

```js
fetch(new URL('ssh-link/api', document.baseURI), {
  method: 'POST',
  credentials: 'same-origin',
  headers: { 'content-type': 'application/json', 'x-ssh-link': '1' },
  body: JSON.stringify({ action, ...payload }),
})
```

`status` 使用 GET；其他动作使用 POST。错误会显示为页面上的错误条，不会静默失败。

### 5.3 远端终端

- 连接成功后，终端目标自动切到该连接。
- 输入命令后调用 `exec`，把格式化的 stdout/stderr/退出码追加到 `lines`。
- 输出区域自动滚动到底部。
- 每个连接共享同一个输出列表；切换目标只改变后续命令的执行主机。
- 终端不保留远端 shell 状态；`cd`、环境变量不会跨命令保留。

## 6. 安全模型

| 资产 | 保护方式 |
| --- | --- |
| 密码 / 私钥口令 | DSH `ctx.credentials`；连接文件只保存引用 |
| 连接配置 | `$DSH_HOME/ssh-link/connections.json`，目录 0700 / 文件 0600 |
| 主机身份 | 首次连接 TOFU 固定 SHA-256；变更默认拒绝 |
| 本地 HTTP | 自定义请求头 + 同源 Origin + 协议一致 + 1 MB body 上限 |
| 工具参数中的密码 | 会进入会话日志；README 建议在设置页录入 |

注意：插件不做额外的密码加密；它依赖 DSH 凭据存储和当前系统账户的权限。

## 7. 已知限制

- 远端必须是 POSIX 系统，且 `sftp-server` 可用。
- 终端不是 PTY，不支持全屏 TUI。
- 每条命令使用独立 SSH 通道，没有持久 shell。
- 单次命令输出约 200 KB，单次读取约 50 KB，超出会截断。
- 不支持端口转发、SFTP 上传/下载按钮、ProxyJump。
- 断线后不会后台自动重连；下一次工具调用会按需重连。
- `ssh_write` 直接覆盖远端文件，不是原子写；重要文件请先备份。

## 8. 验证

语法检查：

```sh
node --check ssh-link/index.js
node --check ssh-link/client.js
```

Host 半端到端测试：

```sh
cd ssh-link

# 终端 1：启动一次性 SSH/SFTP 测试服务器
node test/ssh-server.mjs --port 22999

# 终端 2：用临时 DSH_HOME 跑 e2e
node test/e2e.mjs --port 22999 --state "$TEMP/ssh-link-e2e-state"
```

覆盖范围包括：

- 连接建立与主机密钥固定；
- `ssh_exec`、`ssh_read` 行窗口、`ssh_write`、`ssh_edit` 唯一性；
- UTF-8、CRLF、无结尾换行；
- `remoteCwd` 与 `~` 展开；
- `ssh_glob`、`ssh_grep`；
- 远端失败与退出码；
- 主机密钥变更拒绝与显式覆盖；
- 按需重连；
- 删除连接时清理凭据。

页面手测：

1. 新建密码连接，连接成功，状态变为“已连接”。
2. 新建私钥连接（可带口令），连接成功。
3. 在远端终端执行 `pwd`、`ls`，输出正确。
4. 对 Agent 说“读取远端某个文件”，确认使用 `ssh_read` 而不是本地 `read`。
5. 修改主机密钥后连接被拒绝；清除固定密钥后可重新连接。
6. 删除连接后，凭据被清理。
7. 刷新页面后连接列表和默认目标仍在。

## 9. 维护提示

修改连接字段时，需要同步：

1. `upsert()` 的校验和默认值；
2. `sanitize()` 的输出；
3. `ssh_connection` 工具参数；
4. Client 表单字段和 i18n 字典；
5. README 的使用说明；
6. 本文件的数据结构和安全说明。

新增工具时：

1. 在 `buildTools()` 中定义参数和描述；
2. 让描述明确“远端”语义；
3. 确认输出有上限和截断提示；
4. 在系统提示里补充使用规则；
5. 更新 README 工具表与本文件。