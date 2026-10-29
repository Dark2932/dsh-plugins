# ssh-link

让 DeepSeek Harness（DSH）通过 SSH 操作远端服务器：DSH 继续运行在本地，命令和文件修改发生在远端，像用 XShell 一样管理主机。

## 功能

- **主机管理**：在“设置 → SSH 连接”中保存主机、端口、用户、密码或私钥、远端工作目录。
- **远端终端**：连接后在面板里直接输入命令，输出显示在同一页。
- **Agent 工具**：Agent 通过 `ssh_*` 工具在远端执行命令、读取/写入/编辑文件、按 glob 查找、按正则搜索。
- **主机密钥固定**：首次连接记录主机密钥，之后变更会被拒绝；确认服务器重装后可手动清除。
- **凭据保护**：密码和私钥口令保存在 DSH 的凭据存储中，连接配置只保存引用。

## 安装

远端需要 POSIX 系统（Linux / macOS），开启 SSH 和 `sftp-server`。本地需要 `pnpm`。

桌面端：**设置 → 插件 → 添加插件**，填入：

`https://github.com/Dark2932/dsh-plugins#path:/ssh-link`

终端：

```sh
dsh plugin --profile desktop add "https://github.com/Dark2932/dsh-plugins#path:/ssh-link"
```

安装时会自动安装 `ssh2`。只有用本地目录（`link:`）开发时，才需要先在插件目录执行 `pnpm install --ignore-scripts`。

桌面端完整步骤见[主仓库 README](../README.md)。

## 使用

1. 打开 **设置 → SSH 连接 → 新建连接**，填写主机、用户和认证方式，保存。
2. 点“连接”。连接成功后，这个目标成为活动目标，Agent 默认使用它。
3. 在“远端终端”输入命令并回车，命令在远端执行。
4. 对 Agent 说“看一下远端 `/var/www/app` 的配置并修改 `nginx.conf`”，它会使用 `ssh_*` 工具，而不是修改本地文件。

### Agent 工具

| 工具 | 作用 |
| --- | --- |
| `ssh_connection` | 列出、添加、修改、删除、连接、断开、设为默认 |
| `ssh_exec` | 在远端执行命令，返回 stdout/stderr/退出码 |
| `ssh_read` | 读取远端文件（行号、offset/limit、截断提示） |
| `ssh_write` | 整文件写入，自动创建父目录 |
| `ssh_edit` | 字面量替换，默认要求唯一匹配 |
| `ssh_glob` | 远端 glob 查找 |
| `ssh_grep` | 远端内容搜索（优先 `rg`） |

所有工具都可以用 `connection` 指定主机；省略时使用活动目标。断开后，下一次工具调用会自动重连。

## 注意

- 本地 `read` / `write` / `edit` / `glob` / `grep` / `pwsh` 仍然操作本机；远端操作请用 `ssh_*`。
- 终端是“命令 + 输出”模式，不支持 `vim`、`htop` 等需要 PTY 的全屏程序。
- 命令和读取输出有上限，超出会截断并提示。
- 密码通过工具参数传入时会进入会话日志；日常请在设置面板录入。
- 暂不支持端口转发、SFTP 上传/下载按钮、跳板机。

## 开发

实现说明、关键代码和测试方法见 [`_docs/ssh-link.md`](../_docs/ssh-link.md)。

## License

MIT