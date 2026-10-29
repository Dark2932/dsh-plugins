# dark-toolbox 开发文档

> 适用版本：`0.2.0`。本文描述插件当前的实际行为；代码变化后请同步更新。

## 1. 概览

dark-toolbox 是面向 DeepSeek Harness（DSH）的轻量工具集，目标是把两类高频操作做得更顺手：

1. **插件安装**：把安装动作放到 Host 后台队列，并在插件页提供实时安装列表。
2. **新建会话**：让全局“新会话”默认创建“无工作区”会话，自动归入侧栏的“未分组”。

插件没有运行时依赖，不需要构建步骤；Host 半和 Client 半都由 DSH 直接加载。

| 项目 | 值 |
| --- | --- |
| 包名 | `dark-toolbox` |
| 版本 | `0.2.0` |
| Host 入口 | `index.js` |
| Client 入口 | `client.js`（`dsh.client.platform = web`） |
| 设置存储 | 浏览器 `localStorage` |
| 安装记录存储 | Host 进程内存，不持久化 |

## 2. 功能

### 2.1 后台安装

- 安装任务由 Host 的 `DarkToolbox` 队列执行，同一时间只跑一个任务，其余排队。
- 安装状态分为：`queued`、`checking`、`installing`、`applying`、`cancelling`、`done`、`failed`、`cancelled`、`ended`。
- 支持包名、Git 地址、tarball、本地目录。
- 安装前预检会调用 `pluginManager.inspect(spec)`，提前拒绝不是插件的包、已安装的包和不兼容版本。
- pnpm 拦截构建脚本时，记录里会带上 `pendingBuilds`，界面提供“允许脚本并重试”。
- 离开页面、刷新页面不会中断安装；已完成记录只在当前 DSH 进程内保留。

### 2.2 安装列表

插件页在“已安装”“发现”右侧增加“安装列表”标签页，展示：

- 任务阶段、耗时、开始时间、来源索引；
- 实时 pnpm 输出；
- 结果、警告、失败原因；
- 取消、允许脚本并重试、忽略等操作。

### 2.3 未分组新对话

- 全局“新会话”按钮和快捷键调用 `uiWorkspace.startSession()` 时不再落到最近工作区，而是创建一个不属于任何 Workspace 的会话。
- 会话由侧栏现有的分组逻辑归入“未分组”。
- 每个工作区分组上的“+”仍然调用 `startSession(workspaceId)`，保持原来的目标。
- 侧栏底部提供独立的“未分组新对话”入口，即使默认开关关闭也可用。
- 如果“未分组”里已有空白会话，优先复用它，避免反复点击产生多条空白记录。

### 2.4 统一设置页

“设置 → Dark工具集”提供全部开关：

| 设置键 | 默认值 | 作用 |
| --- | --- | --- |
| `backgroundInstall` | `true` | 允许从安装列表发起后台安装 |
| `installListTab` | `true` | 显示“安装列表”标签页 |
| `precheck` | `true` | 安装前读取包信息并校验 |
| `liveLog` | `true` | 显示实时 pnpm 输出 |
| `keepFinished` | `true` | 保留成功完成的任务 |
| `noWorkspaceNewSession` | `true` | 全局新会话默认创建未分组会话 |

设置按浏览器保存在 `localStorage` 的 `dsh.dark-toolbox.settings.v1` 键下；读取时会与默认值合并，非法值回退默认。

## 3. 文件结构

```text
dark-toolbox/
├── index.js            Host 半：安装队列、事件订阅、HTTP/SSE API
├── client.js           Client 半：设置页、安装列表、侧栏入口、新会话默认行为
├── cordis.patch.yml    Bundle 补丁：向 profile 插入 dark-toolbox 条目
├── locale/             插件元数据的中英文标题
├── icon.svg            插件图标
├── package.json        包信息与 dsh.client 声明
└── README.md           面向用户的功能和安装说明
```

## 4. Host 半：`index.js`

### 4.1 插件入口

```js
export const inject = ['pluginManager', 'webServer']

export function apply(ctx) {
  const toolbox = new DarkToolbox(ctx)
  // 注册 /dark-toolbox/api
  // 订阅 plugin-manager/install-state、install-log、changed
}
```

`apply` 做三件事：

1. 实例化 `DarkToolbox`，由它持有记录表、队列和活动任务。
2. 通过 `ctx.webServer.register({ kind: 'exact', path: '/dark-toolbox/api', handler })` 暴露 API。
3. 订阅插件管理器事件，把 DSH 其他入口发起的安装也纳入列表。

### 4.2 记录与队列

`DarkToolbox` 的核心状态：

```text
records: Map<id, Record>     所有任务（活动 + 已完成）
queue:   string[]            等待执行的任务 id
activeId: string | null      当前正在执行的任务
listeners: Set<fn>           SSE 订阅者
```

- `createRecord()` / `newRecord()`：创建任务记录，初始化阶段、时间、日志、结果等字段。
- `pruneRecords()`：只保留最近 `MAX_FINISHED_RECORDS = 20` 条已完成记录。
- `install()`：校验 spec，创建记录，加入队列，调用 `pump()`。
- `pump()`：如果已有活动任务或插件已卸载则返回；否则取队首任务执行，结束后清空 `activeId` 并继续下一个。

记录中的 `id` 会作为 `installBundle` 的 `requestId` 传入，用于把 `install-state` / `install-log` 事件关联回正确的任务；如果任务被批准重试，`approvedBuilds` 也会一起带上。

### 4.3 预检与安装

安装流程：

```text
install(spec)
  └─ createRecord
       └─ pump
            ├─ phase = checking
            │    └─ pluginManager.inspect(spec)
            │         ├─ refused → failed
            │         └─ 不是 dsh.bundle → failed
            ├─ phase = installing
            │    └─ pluginManager.installBundle(spec, { requestId, approvedBuilds })
            │         └─ 已安装、版本不兼容等由安装器报告 → done / failed
            ├─ phase = applying
            └─ 写入 result / warnings / pendingBuilds
```

- `installBundle()` 的返回结果被归一化为 `done` / `failed`。
- 如果结果里有 `pendingBuilds`，记录保留这些脚本名，`approve` 动作会带着允许列表重新排队。
- `cancelInstall(id)` 用于取消；如果已经进入 applying，取消可能来不及，会在 `notes` 里说明。

### 4.4 外部安装与事件关联

DSH 的插件页、市场等入口也可能发起安装。Host 通过：

- `plugin-manager/install-state`：同步阶段、结果、错误；
- `plugin-manager/install-log`：追加 pnpm 输出；
- `plugin-manager/changed`：刷新插件列表状态。

匹配不到本地记录的安装会创建一条 `external: true` 的任务。这类任务无法拿到最终结果时，阶段会落到 `ended`，界面提示“安装结束，但未捕获最终结果”。

### 4.5 HTTP 与 SSE

路径：`/dark-toolbox/api`

| 方法 | 用途 |
| --- | --- |
| `GET` | 返回 `{ records, active }` 快照 |
| `GET ?stream=1` | SSE：先发快照，之后推送记录更新和 pnpm 日志 |
| `POST` | JSON 动作：`install`、`cancel`、`approve`、`dismiss`、`clear`、`status` |

安全边界：

- POST 必须带 `x-dark-toolbox: 1` 请求头；
- 带 `Origin` 时必须与请求的 `Host` 同源；
- POST body 上限 64 KB；
- 该路由不额外校验 DSH 登录态，信任边界与本地 DSH 一致。

### 4.6 资源上限

| 常量 | 值 | 含义 |
| --- | --- | --- |
| `MAX_FINISHED_RECORDS` | 20 | 保留的已完成任务数 |
| `MAX_LOG_ENTRIES` | 400 | 单任务日志条数 |
| `MAX_LOG_CHARS` | 48 KB | 单任务日志字符数 |
| `MAX_BODY_BYTES` | 64 KB | POST body 上限 |

## 5. Client 半：`client.js`

### 5.1 模块形式

Client 半通过 DSH 的模块加载器注册：

```js
window.__ModuleLoader__.load({
  id: 'dark-toolbox',
  factory(require) {
    const React = require('react')
    // ...
    return { inject: ['slots', 'locale'], apply }
  },
})
```

只从 Host 模块表取 React，样式使用 DSH 主题 token；不引入额外前端依赖。

### 5.2 设置存储

- `DEFAULT_SETTINGS` 定义所有开关的默认值。
- `loadSettings()` 读取 `localStorage`，只接受布尔值，其余回退默认。
- `updateSetting()` 更新内存值、写回 `localStorage`，并通知订阅者。
- `useSettings()` 通过 `React.useSyncExternalStore` 订阅设置变化。

新增功能时，需要同时修改：`DEFAULT_SETTINGS`、设置页行、对应的 `apply` 逻辑，以及中英文字典。

### 5.3 Slot 注册

| Slot | id | 作用 |
| --- | --- | --- |
| `settings.section` | `dark-toolbox` | “Dark工具集”设置页 |
| `plugins.tab` | `dark-toolbox-installs` | “安装列表”标签页 |
| `sidebar.footer.action` | `dark-toolbox-new-ungrouped` | 侧栏底部“未分组新对话”入口 |

设置页始终注册；安装列表标签页跟随 `installListTab` 开关动态注册/注销；侧栏入口在 `uiWorkspace`、`sessions`、`workspaces` 三个服务可用后注册。

### 5.4 安装列表数据流

```text
InstallListTab
  ├─ EventSource('/dark-toolbox/api?stream=1')
  │    ├─ snapshot → setRecords
  │    ├─ record   → 合并单条任务
  │    └─ log      → 追加 pnpm 输出
  └─ POST /dark-toolbox/api
       ├─ install / cancel / approve
       ├─ dismiss / clear
       └─ status（重连后补一次快照）
```

连接断开时显示“正在重连…”，由 `EventSource` 自动重试；重连后通过 `status` 或首帧快照补齐状态。

### 5.5 未分组新会话

相关函数：

| 函数 | 作用 |
| --- | --- |
| `sessionServices()` | 从当前 Client 上下文取 `uiWorkspace`、`sessions`、`workspaces` |
| `findUngroupedBlank()` | 找出不属于任何 Workspace、未归档的空白会话 |
| `createUngroupedSession()` | 复用空白会话，或 `sessions.create({ cwd: home })`，再 `openSession()` |
| `launchUngroupedSession()` | 对上面的流程做错误处理，必要时弹原生 toast |
| `NewUngroupedAction` | 侧栏底部入口组件 |

为什么传 `cwd: home`：Host 在没有 Workspace 时会把 `process.cwd()` 当作默认目录，那是 DSH 进程目录，不适合作为“无项目”会话的工作目录；用户主目录更中性，也能让文件工具正常工作。

默认行为接管：

```js
ctx.inject(['uiWorkspace', 'sessions', 'workspaces'], (sessionCtx) => {
  const { uiWorkspace } = sessionServices()
  const original = uiWorkspace.startSession
  // 省略开关订阅与恢复逻辑
  const wrapper = function (workspaceId, options) {
    if (workspaceId === undefined && options === undefined) {
      void launchUngroupedSession()
      return
    }
    return original.call(uiWorkspace, workspaceId, options)
  }
  uiWorkspace.startSession = wrapper
})
```

边界：

- 只接管**两个参数都为 `undefined`** 的调用，也就是全局按钮和快捷键。
- 带 `workspaceId` 或 `options` 的调用原样透传，因此工作区分组上的“+”和“创建工作区”流程不受影响。
- 开关关闭或插件卸载时恢复原方法。
- 这是对服务方法的 best-effort 覆盖，不是 DSH 的公开扩展点；如果赋值失败，`newSessionOverrideReady` 为 `false`，设置页显示提示，侧栏入口仍然可用。

## 6. 数据与状态

| 状态 | 位置 | 生命周期 |
| --- | --- | --- |
| 安装任务 | Host `DarkToolbox.records` | 当前 DSH 进程 |
| 已完成任务 | Host 内存，最多 20 条 | 当前 DSH 进程 |
| pnpm 日志 | Host 内存，单任务上限 400 条 / 48 KB | 当前 DSH 进程 |
| 功能开关 | 浏览器 `localStorage` | 当前浏览器 |
| 侧栏入口 | Client slot | 插件加载期间 |

## 7. 兼容性与已知限制

- 安装列表依赖 DSH 插件管理器的事件和 `installBundle` 返回结构；DSH 大版本升级后需要回归。
- 同时只执行一个安装任务；这是有意的限流，避免 pnpm 并发写 profile。
- 已完成记录不跨进程保存；DSH 重启后列表为空。
- 设置按浏览器保存，不同浏览器/设备之间不同步。
- “未分组新会话”依赖 `uiWorkspace.startSession` 的可写性；无法覆盖时会降级到侧栏入口。
- 未分组会话仍然有 `cwd`，默认是用户主目录；它不是“没有文件系统”的会话。

## 8. 验证清单

代码检查：

```sh
node --check dark-toolbox/index.js
node --check dark-toolbox/client.js
node -e "JSON.parse(require('fs').readFileSync('dark-toolbox/package.json','utf8'))"
```

页面手测：

1. 设置 → Dark工具集：六个开关都能切换，刷新后保持。
2. 插件页：安装列表标签页位于“已安装”“发现”右侧；关闭开关后标签页消失并回落到“已安装”。
3. 发起一个安装：阶段、耗时、日志实时更新；离开页面再回来任务仍在。
4. 失败任务：能看到失败原因；有 `pendingBuilds` 时出现“允许脚本并重试”。
5. 关闭“后台安装”后，从安装列表不能再发起新任务，历史仍显示。
6. 全局“新会话”：出现在“未分组”，工作区选择器不预选。
7. 某个工作区分组上的“+”：仍在该工作区创建。
8. 侧栏底部“未分组新对话”：开关关闭时仍能创建。
9. 关闭“新对话默认无工作区”后，全局“新会话”恢复 DSH 原行为。

> 修改 Client 半后，已打开的页面需要刷新才会加载新代码；替换 `client.js` 不会热更新已加载的 bundle。

## 9. 维护提示

新增一个功能时，按以下顺序改：

1. `DEFAULT_SETTINGS` 增加开关；
2. 中英文字典增加标题、描述、提示；
3. 设置页增加 `SettingRow`；
4. `apply` 中增加注册/注销逻辑，注意清理函数；
5. 更新 `package.json` / `VERSION`（行为变化时）；
6. 更新本文件与 `dark-toolbox/README.md`；
7. 跑语法检查和页面手测。