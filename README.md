# DSH 插件集

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）写的插件，方向是“实用、轻量、优化”。

## 插件

### dark-toolbox

让 DSH 的插件安装和日常会话更顺手：

- 插件在后台安装，离开页面也不会中断；
- 插件页多一个“安装列表”，实时查看进度和 pnpm 输出；
- 全局“新会话”默认在“未分组”里创建，不再自动选择工作区；
- 所有功能都在“设置 → Dark工具集”里，各自有开关。

[插件说明](dark-toolbox/README.md) · [开发文档](_docs/dark-toolbox.md)

#### 安装

```sh
dsh plugin --profile desktop add "https://github.com/Dark2932/dsh-plugins#path:/dark-toolbox" //桌面端请直接输入引号内地址
```

### ssh-link

让 DSH 通过 SSH 操作远端服务器：DSH 仍在本机运行，命令和文件修改发生在远端。

- 在“设置 → SSH 连接”里管理主机；
- 内置远端终端；
- Agent 通过 `ssh_*` 工具在远端执行命令、读写文件、查找和搜索。

[插件说明](ssh-link/README.md) · [开发文档](_docs/ssh-link.md)

#### 安装

```sh
dsh plugin --profile desktop add "https://github.com/Dark2932/dsh-plugins#path:/ssh-link" //桌面端请直接输入引号内地址
```

## 开发

每个插件的实现说明、关键代码和验证清单在 [`_docs/`](_docs/README.md)。

修改代码后请同步更新对应文档和插件 README，约定见 [AGENTS.md](AGENTS.md)。

## 许可证

MIT（麻省理工学院）