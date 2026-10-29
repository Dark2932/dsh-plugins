# DSH 插件集

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）写的插件，方向是“实用、轻量、优化”。

## 插件

### dark-toolbox

让 DSH 的插件安装和日常会话更顺手：

- 插件在后台安装，离开页面也不会中断；
- 插件页多一个“安装列表”，实时查看进度和 pnpm 输出；
- 全局“新会话”默认在“未分组”里创建，不再自动选择工作区；
- 所有功能都在“设置 → Dark工具集”里，各自有开关。

[插件说明](dark-toolbox/README.md) · [开发文档](.docs/dark-toolbox.md)

### ssh-link

让 DSH 通过 SSH 操作远端服务器：DSH 仍在本机运行，命令和文件修改发生在远端。

- 在“设置 → SSH 连接”里管理主机；
- 内置远端终端；
- Agent 通过 `ssh_*` 工具在远端执行命令、读写文件、查找和搜索。

[插件说明](ssh-link/README.md) · [开发文档](.docs/ssh-link.md)

## 安装

以下用本仓库当前的 Windows 路径举例，换成你自己的实际路径即可。

### 桌面端

1. 打开 DSH Desktop，进入 **设置 → 插件**。
2. 点 **添加插件**，在“包名或地址”中填入插件目录的**绝对路径**。
3. 确认安装；完成后按提示重载页面，Host 半有变化时重启 DSH。

> 安装 ssh-link 前，先在插件目录执行 `pnpm install --ignore-scripts`，确保 `ssh2` 依赖已就绪。

| 插件 | 填入的路径 |
| --- | --- |
| dark-toolbox | `E:\projects\Dark2932\dsh-plugins\dark-toolbox` |
| ssh-link | `E:\projects\Dark2932\dsh-plugins\ssh-link` |

### 终端

先**完全退出 DSH Desktop**（包括托盘/后台进程），否则桌面端会占用 profile 文件，CLI 可能等待或失败。首次使用 CLI 前，先打开一次 DSH Desktop，让 `desktop` profile 完成初始化。

如果安装 ssh-link，先在插件目录准备依赖：

```sh
cd E:/projects/Dark2932/dsh-plugins/ssh-link
pnpm install --ignore-scripts
cd ..
```

如果 CLI 提示找不到 `pnpm`，先安装 pnpm 并确保它在 PATH 中。

如果 `dsh` 已在 PATH 中：

```sh
dsh plugin --profile desktop add "link:E:/projects/Dark2932/dsh-plugins/dark-toolbox"
dsh plugin --profile desktop add "link:E:/projects/Dark2932/dsh-plugins/ssh-link"
```

Windows 桌面端自带 CLI（默认安装路径），但默认没有加入 PATH，可以用完整路径：

```powershell
& "$env:LOCALAPPDATA\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd" `
  plugin --profile desktop add "link:E:/projects/Dark2932/dsh-plugins/dark-toolbox"
& "$env:LOCALAPPDATA\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd" `
  plugin --profile desktop add "link:E:/projects/Dark2932/dsh-plugins/ssh-link"
```

安装完成后重新打开 DSH Desktop。终端安装和桌面端安装写入的是同一个 profile，不需要重复安装。

## 开发

每个插件的实现说明、关键代码和验证清单在 [`.docs/`](.docs/README.md)。修改代码后请同步更新对应文档和插件 README，约定见 [AGENTS.md](AGENTS.md)。

## License

MIT