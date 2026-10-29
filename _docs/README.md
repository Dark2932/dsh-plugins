# 插件开发文档

这里保存每个插件的**实现说明**，面向维护者，不面向普通用户。用户功能与安装说明放在插件自己的 `README.md`。

| 插件 | 版本 | 作用 | 文档 |
| --- | --- | --- | --- |
| `dark-toolbox` | 0.2.0 | 后台插件安装、安装列表、未分组新对话、统一设置页 | [dark-toolbox.md](dark-toolbox.md) |
| `ssh-link` | 0.1.0 | SSH 主机管理、远端终端、Agent 远端工具 | [ssh-link.md](ssh-link.md) |

## 共同结构

两个插件都遵循 DSH 的 bundle 形式：

```text
<plugin>/
├── package.json        包信息；dsh.bundle 指向 cordis.patch.yml；dsh.client 声明 Client 半
├── cordis.patch.yml    向 profile 插入插件条目
├── index.js            Host 半：服务、工具、HTTP 路由
├── client.js           Client 半：设置页、标签页、侧栏入口等 UI
├── locale/             插件元数据标题
└── README.md           用户文档
```

- **Host 半**通过 `ctx.effect()` 注册资源，插件卸载时自动释放。
- **Client 半**通过 `ctx.slots.inject()` / `ctx.slots.register()` 挂载 UI，只从 Host 模块表取 React。
- 插件安装不手改 profile 的 `package.json` 或 `cordis.patch.yml`，统一走 `plugin_manager` 或 `dsh plugin`。

## 文档约定

1. 以代码为准。行为和代码不一致时，先改代码或先改文档，不能放任两边矛盾。
2. 每次改代码，同步更新对应插件的 `_docs/<插件>.md`。
3. 每次改用户可见行为，同步更新 `_docs/<插件>.md` 和插件 `README.md`；主仓库 `README.md` 只在插件列表、安装方式或定位变化时修改。
4. 文档里的函数名、常量名、文件路径必须能在仓库中找到。
5. 不把临时调试命令、个人机器路径、凭据写进文档。

具体约定见仓库根目录的 [AGENTS.md](../AGENTS.md)。