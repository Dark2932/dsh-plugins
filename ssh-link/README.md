# ssh-link

为 DeepSeek Harness（DSH）添加类 XShell 的 SSH 连接能力：**DSH 继续运行在本地，命令与文件修改发生在远端服务器上**。

- 在 **设置 → SSH 连接** 中管理主机（密码 / 私钥、端口、远端工作目录、主机密钥固定）。
- 连接后在面板内直接跑远端命令（XShell 式终端）。
- Agent 获得 `ssh_*` 工具，可以在远端执行命令、读取/写入/编辑文件、按 glob 查找、按正则搜索。
- 每次连接使用独立的 SSH 通道；主机密钥首次连接时固定（TOFU），之后变更会被拒绝，除非明确允许。
- 密码和私钥口令保存在 DSH 凭据存储（`ctx.credentials`）里，不写进连接配置文件。

## 环境要求

- 远端：POSIX 系统（Linux / macOS），开启 SSH 服务并带有 `sftp-server`。`find`、`grep` 是常用命令；安装了 `rg` 时会优先使用。
- 本地：DSH Desktop / DSH Web。插件自带 `ssh2` 依赖，无需系统 `ssh.exe`。
- 认证：密码，或本地私钥文件（支持带口令的私钥）。

## 安装

```js
// 在 DSH 会话中让 Agent 执行，或由你调用 plugin_manager：
plugin_manager({
  action: 'install_bundle',
  target: 'E:\\projects\\Dark2932\\dsh-plugins\\ssh-link'
})
```

安装前先在本目录装好运行时依赖（本地目录安装会链接这个 checkout）：

```sh
cd E:/projects/Dark2932/dsh-plugins/ssh-link
pnpm install --ignore-scripts
```

安装后重载页面，打开 **设置 → SSH 连接**。插件会写入当前 profile 的 bundle 列表；卸载/停用通过插件管理器完成。

修改本目录代码后：在 **设置 → 插件** 中停用再启用 `ssh-link` 可重载 Host 半；刷新页面加载新的 Client 半。

## 使用

1. 打开 **设置 → SSH 连接 → 新建连接**，填主机、用户、认证方式，保存。
2. 点 **连接**。连接成功后该目标成为活动目标，Agent 默认使用它。
3. 在“远端终端”里输入命令并回车，命令在远端执行；输出显示在同一面板。
4. 直接对 Agent 说：“看一下远端 `/var/www/app` 的配置并修改 `nginx.conf` 的 worker_connections”。Agent 会使用 `ssh_*` 工具完成，而不是修改本地文件。

> 服务器重装或主机密钥变化后，连接会被拒绝。编辑该连接，勾选 **清除已固定的主机密钥**，保存后重新连接即可重新固定新密钥。

### Agent 工具

| 工具 | 作用 |
| --- | --- |
| `ssh_connection` | `list` / `status` / `add` / `update` / `remove` / `connect` / `disconnect` / `default` |
| `ssh_exec` | 在远端 POSIX shell 执行命令，返回 stdout/stderr/退出码 |
| `ssh_read` | 读取远端文本文件（行号 + offset/limit + 截断提示） |
| `ssh_write` | 整文件写入（自动创建父目录） |
| `ssh_edit` | 字面量替换（默认要求唯一匹配，`replace_all` 可全替换） |
| `ssh_glob` | 远端 glob 查找（`**`、`*`、`?`、`{a,b}`、`[abc]`） |
| `ssh_grep` | 远端内容搜索（优先 `rg`，否则 `grep -rnI`） |

所有工具都接受可选 `connection`（名称或 id），省略时使用活动目标。连接断开后，下一次远端工具调用会自动重连。

### 与本地工具的区别

`read` / `write` / `edit` / `glob` / `grep` / `pwsh` / `terminal_*` **仍然操作本地机器**。远端工作必须使用 `ssh_*` 工具；插件会向 Agent 注入一段系统提示说明这一点。插件不替换 DSH 的本地文件系统/沙箱。

## 安全说明

- 密码与私钥口令通过 `ctx.credentials` 保存（凭据引用形如 `SSH_LINK_<ID>_PASSWORD`），连接文件只保存引用。凭据落在 `$DSH_HOME/.credentials.yaml`，由 DSH 与当前系统账户保护；插件本身不做额外加密。
- **通过工具参数传入的密码会出现在会话日志里**；日常请用设置面板录入密码。
- 主机密钥首次连接时固定（SHA-256），变更会报错并提示 `allowHostKeyChange=true`；设置面板中可在编辑连接时勾选“清除已固定的主机密钥”。请在确认服务器重装/换机后才允许。
- 设置面板通过本机回环 HTTP 路由 `/ssh-link/api` 与 Host 通信；该路由要求自定义请求头并校验同源 Origin，且只接受本机访问。它不额外校验 DSH 登录态，因此本机上的其他程序仍可访问——这与本地 DSH 的信任边界一致。
- 连接文件位于 `$DSH_HOME/ssh-link/connections.json`（默认 `~/.dsh/ssh-link/connections.json`），权限尽量设为仅当前用户。

## 已知限制

- 终端是“命令 + 输出”式的非交互通道，不支持全屏 TUI、`vim`、`htop` 等需要 PTY 的程序。需要交互式会话时，仍建议使用系统 SSH 客户端。
- 远端按 POSIX shell 处理；不支持 Windows OpenSSH 目标。
- 每次命令使用独立 SSH 通道；不是持久 shell，因此 `cd`、环境变量不会跨命令保留（请用 `cwd` 参数或把命令写成一行）。
- 单次命令/读取输出有上限（约 200 KB / 50 KB），超出会截断并提示。
- 暂不支持端口转发、SFTP 上传下载按钮、跳板机 ProxyJump。
- 连接断开后不会后台自动重连；下一次工具调用会按需重连。

## 开发与验证

```sh
# 语法检查
node --check index.js
node --check client.js

# 启动一次性测试 SSH/SFTP 服务器（临时目录 + 固定账号 tester/testpass）
node test/ssh-server.mjs --port 22999

# 端到端验证 Host half（使用临时 DSH_HOME，不污染真实 profile）
node test/e2e.mjs --port 22999 --state "$TEMP/ssh-link-e2e-state"
```

端到端检查覆盖：连接与主机密钥固定、`ssh_exec`、`ssh_read` 的行窗口、`ssh_write`、`ssh_edit` 的唯一性错误、UTF-8/CRLF/无结尾换行、`remoteCwd` 的 `~` 展开、`ssh_glob`、`ssh_grep`、远端失败上报、主机密钥变更拒绝/显式覆盖、按需重连、删除连接时清理凭据。

## License

MIT