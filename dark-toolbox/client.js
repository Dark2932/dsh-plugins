window.__ModuleLoader__.load({
  id: 'dark-toolbox',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const NS = 'dark-toolbox'
    const VERSION = '0.2.0'
    const STORAGE_KEY = 'dsh.dark-toolbox.settings.v1'

    // ---------------------------------------------------------------------
    // locale
    // ---------------------------------------------------------------------

    const DICTIONARIES = {
      en: {
        nav: 'Dark Toolbox',
        tabLabel: 'Install list',
        settingsIntro: 'Practical, lightweight, optimized. Every feature in this toolbox has its own switch.',
        groupInstall: 'Install',
        backgroundTitle: 'Background installs',
        backgroundDesc: 'Installs queue on the Host with no dialog. Leave this page, keep using DSH; the install keeps going.',
        tabTitle: 'Install list tab',
        tabDesc: 'Show the Install list tab to the right of Installed and Discover on the Plugins page.',
        precheckTitle: 'Preflight check',
        precheckDesc: 'Read the package first and confirm it is an installable plugin, so a non-plugin is not downloaded in full.',
        liveLogTitle: 'Live output',
        liveLogDesc: 'Show the pnpm output stream inside each install task. Useful when a run fails.',
        keepFinishedTitle: 'Keep finished tasks',
        keepFinishedDesc: 'Successful tasks stay in the list. When off, they disappear as soon as they finish.',
        groupSession: 'Sessions',
        noWorkspaceTitle: 'New chats start ungrouped',
        noWorkspaceDesc: 'The sidebar New Session button and its shortcut create the chat under Ungrouped instead of the most recent workspace. The + on a workspace group still creates in that workspace.',
        noWorkspaceEntry: 'The entry below the session list lets you start an ungrouped chat at any time, even when this switch is off.',
        overrideUnavailable: 'This DSH version does not expose the New Session default, so the switch cannot change it. Use the sidebar entry instead.',
        newUngroupedAction: 'New ungrouped chat',
        creatingUngrouped: 'Creating…',
        newUngroupedFailed: 'Could not create the chat.',
        groupAbout: 'About',
        aboutText: 'The queue runs inside the DSH process: closing or refreshing the page does not stop an install. Finished tasks are kept for this DSH run only.',
        formTitle: 'Install a plugin',
        formDesc: 'Package name, Git address, tarball, or local directory. The task queues in the background.',
        specPlaceholder: 'e.g. dsh-better-sidebar@0.28.2, git+https://…, or E:\\plugins\\my-plugin',
        installAction: 'Install in background',
        submitting: 'Submitting…',
        clearFinished: 'Clear finished',
        connected: 'Live',
        disconnected: 'Reconnecting…',
        emptyTitle: 'No install tasks yet',
        emptyDesc: 'Type a plugin above, or start one from Discover. Progress shows up here in real time.',
        installerOffTitle: 'Background installs are off',
        installerOffDesc: 'Turn on Background installs in Settings → Dark Toolbox to start tasks from here. History below stays visible.',
        stateQueued: 'Queued',
        stateChecking: 'Checking',
        stateInstalling: 'Installing',
        stateApplying: 'Applying',
        stateCancelling: 'Cancelling',
        stateDone: 'Done',
        stateFailed: 'Failed',
        stateCancelled: 'Cancelled',
        stateEnded: 'Ended',
        external: 'External',
        cancel: 'Cancel',
        cancelling: 'Cancelling…',
        approve: 'Allow scripts and retry',
        approveHint: 'pnpm blocked these build scripts. Approving retries the same install with them allowed.',
        logTitle: 'pnpm output',
        logEmpty: 'Waiting for output…',
        elapsed: 'elapsed',
        started: 'started',
        registryAttempt: 'source {index}/{total}',
        restartRequired: 'Takes effect after DSH restarts.',
        overridden: 'A higher-priority layer overrides this row.',
        unknownResult: 'The install ended, but this toolbox did not capture the final result.',
        dismiss: 'Dismiss',
        specRequired: 'Enter the plugin you want to install.',
        requestFailed: 'Request failed',
        errorNotBundle: 'This package does not declare dsh.bundle, so it is not an installable plugin.',
        errorAlreadyInstalled: 'This plugin is already installed.',
        errorInvalidSpec: 'This install source is not recognized.',
        errorNotPackage: 'No readable package.json exists at that path.',
        errorNotFound: 'The package or version was not found.',
        errorNetwork: 'The network is unavailable. Check the proxy or try another registry.',
        errorIncompatible: 'The plugin is not compatible with this DSH version.',
        errorBuildBlocked: 'pnpm blocked a dependency build script.',
        errorPnpmMissing: 'pnpm was not found. Make sure it is installed and on PATH.',
        errorTimeout: 'The install timed out.',
        errorOperation: 'The install operation failed.',
        taskFallback: 'Task {id}',
        phasePrecheck: 'Reading package metadata…',
      },
      zh: {
        nav: 'Dark工具集',
        tabLabel: '安装列表',
        settingsIntro: '实用、轻量、优化。这个工具集里的每项功能都有独立开关。',
        groupInstall: '安装',
        backgroundTitle: '后台安装',
        backgroundDesc: '安装任务在 Host 排队执行，不弹窗、不阻塞；离开本页继续用 DSH，安装也不会中断。',
        tabTitle: '安装列表页',
        tabDesc: '在插件页“已安装”和“发现”右侧显示“安装列表”标签页。',
        precheckTitle: '安装前预检',
        precheckDesc: '先读取包信息，确认它是可安装的插件包，避免下载完才发现不是插件。',
        liveLogTitle: '实时输出',
        liveLogDesc: '在安装任务里显示 pnpm 的实时输出，排查失败时很有用。',
        keepFinishedTitle: '保留已完成任务',
        keepFinishedDesc: '成功的任务继续留在列表里；关闭后任务一完成就从列表收起。',
        groupSession: '会话',
        noWorkspaceTitle: '新对话默认无工作区',
        noWorkspaceDesc: '侧栏的“新会话”按钮和快捷键会直接在“未分组”里新建，不再选最近的工作区；工作区分组上的“+”仍然在该工作区新建。',
        noWorkspaceEntry: '会话列表下方的入口随时可以新建未分组对话，即使这个开关关着。',
        overrideUnavailable: '当前 DSH 版本没有开放“新会话”的默认入口，这个开关无法改变它；请使用侧栏入口。',
        newUngroupedAction: '未分组新对话',
        creatingUngrouped: '正在新建…',
        newUngroupedFailed: '无法新建对话。',
        groupAbout: '关于',
        aboutText: '安装队列运行在 DSH 进程内：关闭或刷新页面都不会中断安装。已完成记录只在本次 DSH 运行期间保留。',
        formTitle: '安装新插件',
        formDesc: '支持包名、Git 地址、tarball 或本地目录。任务会在后台排队。',
        specPlaceholder: '例如 dsh-better-sidebar@0.28.2、git+https://… 或 E:\\plugins\\my-plugin',
        installAction: '后台安装',
        submitting: '正在提交…',
        clearFinished: '清空已完成',
        connected: '实时连接',
        disconnected: '正在重连…',
        emptyTitle: '还没有安装任务',
        emptyDesc: '在上方填写插件，或从“发现”页开始安装；进度会实时显示在这里。',
        installerOffTitle: '后台安装已关闭',
        installerOffDesc: '在“设置 → Dark工具集”里打开“后台安装”，就能从这里开始任务。下方的历史记录仍会显示。',
        stateQueued: '排队中',
        stateChecking: '预检中',
        stateInstalling: '下载安装中',
        stateApplying: '正在启用',
        stateCancelling: '正在取消',
        stateDone: '已完成',
        stateFailed: '安装失败',
        stateCancelled: '已取消',
        stateEnded: '已结束',
        external: '外部任务',
        cancel: '取消',
        cancelling: '取消中…',
        approve: '允许脚本并重试',
        approveHint: 'pnpm 阻止了以下构建脚本。允许后会按相同参数重试安装。',
        logTitle: 'pnpm 输出',
        logEmpty: '等待输出…',
        elapsed: '耗时',
        started: '开始',
        registryAttempt: '源 {index}/{total}',
        restartRequired: '重启 DSH 后生效。',
        overridden: '这一行被更高优先级的配置覆盖。',
        unknownResult: '安装已结束，但本次工具集没有捕获到最终结果。',
        dismiss: '移除记录',
        specRequired: '请先填写要安装的插件。',
        requestFailed: '请求失败',
        errorNotBundle: '这个包没有声明 dsh.bundle，不是可安装的插件包。',
        errorAlreadyInstalled: '这个插件已经安装。',
        errorInvalidSpec: '无法识别的安装来源。',
        errorNotPackage: '这个路径下没有可读取的 package.json。',
        errorNotFound: '找不到这个包或版本。',
        errorNetwork: '网络不可用，请检查代理或换一个源。',
        errorIncompatible: '插件与当前 DSH 版本不兼容。',
        errorBuildBlocked: '依赖的构建脚本被 pnpm 阻止。',
        errorPnpmMissing: '找不到 pnpm，请确认它已安装并在 PATH 中。',
        errorTimeout: '安装超时。',
        errorOperation: '安装操作失败。',
        taskFallback: '任务 {id}',
        phasePrecheck: '正在读取包信息…',
      },
    }

    let activeContext = null
    let translate = (key) => key

    function tr(key, vars) {
      let value = translate(key)
      if (typeof value !== 'string' || value === key) value = DICTIONARIES.zh[key] || DICTIONARIES.en[key] || key
      if (vars) {
        for (const [name, replacement] of Object.entries(vars)) {
          value = value.replaceAll(`{${name}}`, String(replacement))
        }
      }
      return value
    }

    function useLocaleTick() {
      const [, setTick] = React.useState(0)
      React.useEffect(() => {
        if (!activeContext?.locale?.subscribe) return undefined
        return activeContext.locale.subscribe(() => setTick((value) => value + 1))
      }, [])
    }

    // ---------------------------------------------------------------------
    // settings store (per browser, localStorage)
    // ---------------------------------------------------------------------

    const DEFAULT_SETTINGS = {
      backgroundInstall: true,
      installListTab: true,
      precheck: true,
      liveLog: true,
      keepFinished: true,
      noWorkspaceNewSession: true,
    }

    function loadSettings() {
      const next = { ...DEFAULT_SETTINGS }
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        if (!raw) return next
        const parsed = JSON.parse(raw)
        for (const key of Object.keys(DEFAULT_SETTINGS)) {
          if (typeof parsed?.[key] === 'boolean') next[key] = parsed[key]
        }
      } catch {
        // private mode or corrupt value: defaults stay authoritative
      }
      return next
    }

    let settings = loadSettings()
    const settingsListeners = new Set()

    function getSettings() {
      return settings
    }

    function subscribeSettings(listener) {
      settingsListeners.add(listener)
      return () => settingsListeners.delete(listener)
    }

    function updateSetting(key, value) {
      if (!(key in DEFAULT_SETTINGS) || typeof value !== 'boolean') return
      settings = { ...settings, [key]: value }
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
      } catch {
        // storage can be unavailable; the in-memory value still applies
      }
      for (const listener of settingsListeners) listener()
    }

    function useSettings() {
      return React.useSyncExternalStore(subscribeSettings, getSettings, getSettings)
    }

    // ---------------------------------------------------------------------
    // ungrouped sessions (no workspace)
    // ---------------------------------------------------------------------

    /** Whether the global New Session default is currently ours, for the settings hint. */
    let newSessionOverrideReady = false

    function sessionServices() {
      const ctx = activeContext
      if (!ctx?.get) return null
      const uiWorkspace = ctx.get('uiWorkspace')
      const sessions = ctx.get('sessions')
      const workspaces = ctx.get('workspaces')
      if (!uiWorkspace || !sessions || !workspaces) return null
      return { uiWorkspace, sessions, workspaces }
    }

    /**
     * A blank Session outside every Workspace is already the Ungrouped row.
     * Reuse it so New Session returns to an unsent draft, like a Workspace does.
     */
    function findUngroupedBlank(sessionState, workspaceState) {
      const members = new Set()
      for (const workspace of workspaceState.items || []) {
        for (const id of workspace.sessionIds || []) members.add(id)
      }
      const archived = new Set(workspaceState.archivedSessionIds || [])
      return (sessionState.ids || []).find((id) => {
        const summary = sessionState.byId?.[id]
        return summary?.blank === true && !members.has(id) && !archived.has(id)
      })
    }

    async function createUngroupedSession() {
      const services = sessionServices()
      if (!services) throw new Error(tr('newUngroupedFailed'))
      const { uiWorkspace, sessions, workspaces } = services
      const workspaceState = workspaces.list.getSnapshot()
      const sessionState = sessions.list.getSnapshot()
      let sessionId = findUngroupedBlank(sessionState, workspaceState)
      if (sessionId === undefined) {
        if (typeof sessions.create !== 'function') throw new Error(tr('newUngroupedFailed'))
        // The Host's fallback is its process directory; the user's home is the
        // neutral place for a chat that belongs to no project.
        const home = activeContext?.remote?.$host?.home
        sessionId = await sessions.create(home ? { cwd: home } : {})
      }
      uiWorkspace.openSession(sessionId)
      return sessionId
    }

    function launchUngroupedSession() {
      return createUngroupedSession().catch((error) => {
        const message = error?.message || tr('newUngroupedFailed')
        const services = sessionServices()
        if (services && typeof services.uiWorkspace.notify === 'function') {
          try {
            services.uiWorkspace.notify({ kind: 'createFailed', message })
            return
          } catch {
            // fall through to the console
          }
        }
        console.warn('[dark-toolbox] ungrouped session creation failed:', message)
      })
    }

    // ---------------------------------------------------------------------
    // host API
    // ---------------------------------------------------------------------

    function apiUrl(query = '') {
      return new URL(`dark-toolbox/api${query}`, document.baseURI).href
    }

    async function post(action, payload) {
      let response
      try {
        response = await fetch(apiUrl(), {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json', 'x-dark-toolbox': '1' },
          body: JSON.stringify({ action, ...payload }),
        })
      } catch (error) {
        throw new Error(`${tr('requestFailed')}: ${error.message}`)
      }
      let data
      try {
        data = await response.json()
      } catch {
        throw new Error(`${tr('requestFailed')}: HTTP ${response.status}`)
      }
      if (!data.ok) throw new Error(data.error || tr('requestFailed'))
      return data
    }

    const ACTIVE_PHASES = new Set(['queued', 'checking', 'installing', 'applying', 'cancelling'])

    function isFinal(phase) {
      return phase === 'done' || phase === 'failed' || phase === 'cancelled' || phase === 'ended'
    }

    function mergeRecord(records, record) {
      const index = records.findIndex((item) => item.id === record.id)
      if (index === -1) return [...records, record]
      const next = records.slice()
      next[index] = record
      return next
    }

    function orderRecords(records) {
      return records.slice().sort((a, b) => {
        const aActive = ACTIVE_PHASES.has(a.phase)
        const bActive = ACTIVE_PHASES.has(b.phase)
        if (aActive !== bActive) return aActive ? -1 : 1
        return b.startedAt - a.startedAt
      })
    }

    function useInstallFeed(enabled) {
      const [records, setRecords] = React.useState([])
      const [logs, setLogs] = React.useState({})
      const [connected, setConnected] = React.useState(false)

      React.useEffect(() => {
        if (!enabled) return undefined
        const source = new EventSource(apiUrl('?stream=1'))
        const onSnapshot = (event) => {
          let payload
          try {
            payload = JSON.parse(event.data)
          } catch {
            return
          }
          const list = Array.isArray(payload.records) ? payload.records : []
          const nextLogs = {}
          const nextRecords = []
          for (const item of list) {
            const { logs: itemLogs, ...record } = item
            nextRecords.push(record)
            nextLogs[record.id] = Array.isArray(itemLogs) ? itemLogs : []
          }
          setRecords(nextRecords)
          setLogs(nextLogs)
        }
        const onRecord = (event) => {
          let record
          try {
            record = JSON.parse(event.data)
          } catch {
            return
          }
          if (!record?.id) return
          setRecords((current) => mergeRecord(current, record))
        }
        const onLog = (event) => {
          let chunk
          try {
            chunk = JSON.parse(event.data)
          } catch {
            return
          }
          if (!chunk?.id) return
          setLogs((current) => {
            const entries = current[chunk.id] ? [...current[chunk.id], chunk] : [chunk]
            return { ...current, [chunk.id]: entries.slice(-300) }
          })
        }
        source.addEventListener('snapshot', onSnapshot)
        source.addEventListener('record', onRecord)
        source.addEventListener('log', onLog)
        source.onopen = () => setConnected(true)
        source.onerror = () => setConnected(false)
        return () => {
          source.removeEventListener('snapshot', onSnapshot)
          source.removeEventListener('record', onRecord)
          source.removeEventListener('log', onLog)
          source.close()
        }
      }, [enabled])

      return { records, logs, connected }
    }

    // ---------------------------------------------------------------------
    // formatting helpers
    // ---------------------------------------------------------------------

    function stripAnsi(text) {
      return text.replace(/\u001b\[[0-9;?]*[A-Za-z]/g, '')
    }

    function logText(entries) {
      const raw = entries.map((entry) => entry.text).join('')
      const clean = stripAnsi(raw).replace(/\r/g, '\n')
      return clean.split('\n').slice(-80).join('\n').trim()
    }

    function formatDuration(ms) {
      const total = Math.max(0, Math.round(ms / 1000))
      if (total < 60) return `${total}s`
      const minutes = Math.floor(total / 60)
      const seconds = total % 60
      if (minutes < 60) return `${minutes}m ${seconds}s`
      const hours = Math.floor(minutes / 60)
      return `${hours}h ${minutes % 60}m`
    }

    function formatTime(timestamp) {
      try {
        return new Date(timestamp).toLocaleTimeString()
      } catch {
        return ''
      }
    }

    function shortId(id) {
      return id.length > 8 ? id.slice(-6) : id
    }

    function displayName(record) {
      if (record.name) return record.name
      if (record.spec) return record.spec
      return tr('taskFallback', { id: shortId(record.id) })
    }

    function phaseLabel(phase) {
      switch (phase) {
        case 'queued': return tr('stateQueued')
        case 'checking': return tr('stateChecking')
        case 'installing': return tr('stateInstalling')
        case 'applying': return tr('stateApplying')
        case 'cancelling': return tr('stateCancelling')
        case 'done': return tr('stateDone')
        case 'failed': return tr('stateFailed')
        case 'cancelled': return tr('stateCancelled')
        case 'ended': return tr('stateEnded')
        default: return phase
      }
    }

    function phaseClass(phase) {
      if (phase === 'done') return ' done'
      if (phase === 'failed') return ' failed'
      if (phase === 'cancelled' || phase === 'ended') return ' cancelled'
      return ' active'
    }

    function percentOf(record) {
      switch (record.phase) {
        case 'queued': return 4
        case 'checking': return 12
        case 'installing': {
          if (!record.attempt) return 45
          const total = Math.max(1, record.attempt.total || 1)
          const index = Math.max(1, record.attempt.index || 1)
          return Math.min(80, 30 + Math.round(((index - 1) / total) * 50))
        }
        case 'applying': return 90
        case 'cancelling': return 90
        default: return 100
      }
    }

    function errorText(result) {
      const error = result?.error
      if (!error) return ''
      const known = {
        'not-bundle': tr('errorNotBundle'),
        'already-installed': tr('errorAlreadyInstalled'),
        'invalid-spec': tr('errorInvalidSpec'),
        'not-found': tr('errorNotFound'),
        'not-a-package': tr('errorNotPackage'),
        network: tr('errorNetwork'),
        'incompatible-version': tr('errorIncompatible'),
        'build-blocked': tr('errorBuildBlocked'),
        'pnpm-missing': tr('errorPnpmMissing'),
        timeout: tr('errorTimeout'),
        'operation-error': tr('errorOperation'),
      }
      return known[error.code] || error.diagnostic || tr('errorOperation')
    }

    // ---------------------------------------------------------------------
    // shared controls
    // ---------------------------------------------------------------------

    function Switch(props) {
      return h('button', {
        type: 'button',
        role: 'switch',
        'aria-checked': props.checked,
        'aria-label': props.label,
        className: `dt-switch${props.checked ? ' on' : ''}`,
        onClick: () => props.onChange(!props.checked),
      }, h('span', { className: 'dt-switch-thumb', 'aria-hidden': 'true' }))
    }

    function SettingRow(props) {
      return h('div', { className: 'dt-row' },
        h('div', { className: 'dt-row-text' },
          h('div', { className: 'dt-row-title' }, props.title),
          h('div', { className: 'dt-row-desc' }, props.desc),
          props.note ? h('div', { className: 'dt-row-warn' }, props.note) : null,
        ),
        h(Switch, { checked: props.checked, label: props.title, onChange: props.onChange }),
      )
    }

    function ErrorBar(props) {
      if (!props.message) return null
      return h('div', { className: 'dt-error', role: 'alert' }, props.message)
    }

    /** Sidebar-foot entry: always available, even when the default stays stock. */
    function NewUngroupedAction(props) {
      useLocaleTick()
      const [busy, setBusy] = React.useState(false)
      const wide = props?.wide !== false
      const label = tr('newUngroupedAction')
      const run = async () => {
        if (busy) return
        setBusy(true)
        try {
          await launchUngroupedSession()
        } finally {
          setBusy(false)
        }
      }
      return h('button', {
        type: 'button',
        className: `dt-new-ungrouped${wide ? '' : ' rail'}`,
        title: label,
        'aria-label': label,
        disabled: busy,
        onClick: run,
      },
        h('svg', {
          width: 16,
          height: 16,
          viewBox: '0 0 16 16',
          fill: 'none',
          'aria-hidden': 'true',
          className: 'dt-new-ungrouped-icon',
        },
          h('path', {
            d: 'M3.4 3.2h9.2a1.4 1.4 0 0 1 1.4 1.4v5.1a1.4 1.4 0 0 1-1.4 1.4H7.2L4 13.2v-2.1H3.4A1.4 1.4 0 0 1 2 9.7V4.6a1.4 1.4 0 0 1 1.4-1.4Z',
            stroke: 'currentColor',
            strokeWidth: '1.2',
            strokeLinejoin: 'round',
          }),
          h('path', {
            d: 'M8 5.1v3.4M6.3 6.8h3.4',
            stroke: 'currentColor',
            strokeWidth: '1.2',
            strokeLinecap: 'round',
          }),
        ),
        wide ? h('span', { className: 'dt-new-ungrouped-label' }, busy ? tr('creatingUngrouped') : label) : null,
      )
    }

    // ---------------------------------------------------------------------
    // settings section: Dark工具集
    // ---------------------------------------------------------------------

    function SettingsSection() {
      useLocaleTick()
      const current = useSettings()

      return h('div', { className: 'dt-root dt-settings' },
        h('div', { className: 'dt-settings-head' },
          h('h2', { className: 'dt-settings-title' }, tr('nav')),
          h('p', { className: 'dt-settings-sub' }, tr('settingsIntro')),
        ),
        h('div', { className: 'dt-group' },
          h('div', { className: 'dt-group-head' }, tr('groupInstall')),
          h(SettingRow, {
            title: tr('backgroundTitle'),
            desc: tr('backgroundDesc'),
            checked: current.backgroundInstall,
            onChange: (next) => updateSetting('backgroundInstall', next),
          }),
          h(SettingRow, {
            title: tr('tabTitle'),
            desc: tr('tabDesc'),
            checked: current.installListTab,
            onChange: (next) => updateSetting('installListTab', next),
          }),
          h(SettingRow, {
            title: tr('precheckTitle'),
            desc: tr('precheckDesc'),
            checked: current.precheck,
            onChange: (next) => updateSetting('precheck', next),
          }),
          h(SettingRow, {
            title: tr('liveLogTitle'),
            desc: tr('liveLogDesc'),
            checked: current.liveLog,
            onChange: (next) => updateSetting('liveLog', next),
          }),
          h(SettingRow, {
            title: tr('keepFinishedTitle'),
            desc: tr('keepFinishedDesc'),
            checked: current.keepFinished,
            onChange: (next) => updateSetting('keepFinished', next),
          }),
        ),
        h('div', { className: 'dt-group' },
          h('div', { className: 'dt-group-head' }, tr('groupSession')),
          h(SettingRow, {
            title: tr('noWorkspaceTitle'),
            desc: tr('noWorkspaceDesc'),
            note: current.noWorkspaceNewSession && !newSessionOverrideReady
              ? tr('overrideUnavailable')
              : tr('noWorkspaceEntry'),
            checked: current.noWorkspaceNewSession,
            onChange: (next) => updateSetting('noWorkspaceNewSession', next),
          }),
        ),
        h('div', { className: 'dt-group' },
          h('div', { className: 'dt-group-head' }, tr('groupAbout')),
          h('p', { className: 'dt-about' }, tr('aboutText')),
          h('div', { className: 'dt-badge' },
            h('span', { className: 'dt-badge-name' }, 'dark-toolbox'),
            h('span', { className: 'dt-badge-tag' }, `v${VERSION}`),
          ),
        ),
        h(Style),
      )
    }

    // ---------------------------------------------------------------------
    // install list tab
    // ---------------------------------------------------------------------

    function InstallTaskCard(props) {
      const { record, entries, showLog, now } = props
      const active = ACTIVE_PHASES.has(record.phase)
      const percent = percentOf(record)
      const result = record.result
      const error = errorText(result)
      const text = showLog ? logText(entries) : ''
      const warnings = Array.isArray(result?.warnings) ? result.warnings : []
      const pending = Array.isArray(record.pendingBuilds) ? record.pendingBuilds : []

      const actions = []
      if (active) {
        actions.push(h('button', {
          key: 'cancel',
          type: 'button',
          className: 'dt-btn danger',
          disabled: record.phase === 'cancelling',
          onClick: () => props.onCancel(record),
        }, record.phase === 'cancelling' ? tr('cancelling') : tr('cancel')))
      }
      if (pending.length > 0) {
        actions.push(h('button', {
          key: 'approve',
          type: 'button',
          className: 'dt-btn primary',
          onClick: () => props.onApprove(record),
        }, tr('approve')))
      }
      if (isFinal(record.phase)) {
        actions.push(h('button', {
          key: 'dismiss',
          type: 'button',
          className: 'dt-btn quiet',
          onClick: () => props.onDismiss(record),
        }, tr('dismiss')))
      }

      return h('div', { className: 'dt-card' },
        h('div', { className: 'dt-card-head' },
          h('div', { className: 'dt-card-title' },
            h('span', { className: 'dt-name', title: record.spec || record.id }, displayName(record)),
            record.version ? h('span', { className: 'dt-version' }, `v${record.version}`) : null,
            record.external ? h('span', { className: 'dt-chip' }, tr('external')) : null,
          ),
          h('span', { className: `dt-phase${phaseClass(record.phase)}` }, phaseLabel(record.phase)),
        ),
        record.spec ? h('div', { className: 'dt-spec', title: record.spec }, record.spec) : null,
        h('div', { className: 'dt-meta' },
          h('span', null, `${tr('elapsed')} ${formatDuration((record.finishedAt || now) - record.startedAt)}`),
          record.startedAt ? h('span', null, `${tr('started')} ${formatTime(record.startedAt)}`) : null,
          record.attempt ? h('span', null, tr('registryAttempt', { index: record.attempt.index, total: record.attempt.total })) : null,
          record.phase === 'checking' ? h('span', null, tr('phasePrecheck')) : null,
        ),
        h('div', { className: `dt-progress ${active ? 'running' : record.phase}` },
          h('div', { className: 'dt-progress-fill', style: { width: `${percent}%` } }),
        ),
        error ? h('div', { className: 'dt-error', role: 'alert' }, error,
          result?.error?.diagnostic && result.error.diagnostic !== error
            ? h('div', { className: 'dt-diag' }, result.error.diagnostic)
            : null,
        ) : null,
        pending.length > 0
          ? h('div', { className: 'dt-pending' },
              h('div', { className: 'dt-pending-title' }, tr('approveHint')),
              h('div', { className: 'dt-pending-list' }, pending.map((name) => h('code', { key: name }, name))),
            )
          : null,
        result?.application === 'restart-required' ? h('div', { className: 'dt-note' }, tr('restartRequired')) : null,
        result?.application === 'overridden' ? h('div', { className: 'dt-note' }, tr('overridden')) : null,
        result?.application === 'unknown' ? h('div', { className: 'dt-note' }, tr('unknownResult')) : null,
        warnings.length > 0
          ? h('div', { className: 'dt-warnings' }, warnings.slice(0, 3).map((warning, index) => h('div', { key: index }, warning)))
          : null,
        actions.length > 0 ? h('div', { className: 'dt-actions' }, actions) : null,
        showLog && (active || entries.length > 0 || record.phase === 'failed')
          ? h('details', { className: 'dt-log' },
              h('summary', null, tr('logTitle')),
              text ? h('pre', null, text) : h('div', { className: 'dt-log-empty' }, tr('logEmpty')),
            )
          : null,
      )
    }

    function InstallListTab() {
      useLocaleTick()
      const current = useSettings()
      const feed = useInstallFeed(true)
      const [spec, setSpec] = React.useState('')
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState('')
      const [now, setNow] = React.useState(Date.now())
      const hasActive = feed.records.some((record) => ACTIVE_PHASES.has(record.phase))

      React.useEffect(() => {
        if (!hasActive) return undefined
        const timer = setInterval(() => setNow(Date.now()), 1000)
        return () => clearInterval(timer)
      }, [hasActive])

      async function submit(event) {
        event.preventDefault()
        const value = spec.trim()
        if (!value) {
          setError(tr('specRequired'))
          return
        }
        setBusy(true)
        setError('')
        try {
          await post('install', { spec: value, precheck: current.precheck })
          setSpec('')
        } catch (caught) {
          setError(caught.message)
        } finally {
          setBusy(false)
        }
      }

      async function cancel(record) {
        setError('')
        try {
          await post('cancel', { id: record.id })
        } catch (caught) {
          setError(caught.message)
        }
      }

      async function approve(record) {
        setError('')
        try {
          await post('approve', { id: record.id })
        } catch (caught) {
          setError(caught.message)
        }
      }

      async function dismiss(record) {
        setError('')
        try {
          await post('dismiss', { id: record.id })
        } catch (caught) {
          setError(caught.message)
        }
      }

      async function clearFinished() {
        setError('')
        try {
          await post('clear', {})
        } catch (caught) {
          setError(caught.message)
        }
      }

      const visible = orderRecords(feed.records).filter((record) => {
        if (current.keepFinished) return true
        if (!isFinal(record.phase)) return true
        return record.phase !== 'done' && record.phase !== 'ended'
      })
      const finishedCount = feed.records.filter((record) => isFinal(record.phase)).length

      return h('div', { className: 'dt-root dt-install-tab' },
        h('div', { className: 'dt-tab-head' },
          h('div', { className: 'dt-tab-heading' },
            h('div', { className: 'dt-tab-title' }, tr('tabLabel')),
            h('p', { className: 'dt-tab-desc' }, tr('backgroundDesc')),
          ),
          h('div', { className: 'dt-tab-tools' },
            h('span', { className: 'dt-conn' },
              h('span', { className: `dt-dot${feed.connected ? ' on' : ''}`, 'aria-hidden': 'true' }),
              feed.connected ? tr('connected') : tr('disconnected'),
            ),
            finishedCount > 0
              ? h('button', { type: 'button', className: 'dt-btn quiet', onClick: clearFinished }, tr('clearFinished'))
              : null,
          ),
        ),

        current.backgroundInstall
          ? h('form', { className: 'dt-install-card', onSubmit: submit },
              h('div', { className: 'dt-install-text' },
                h('div', { className: 'dt-install-title' }, tr('formTitle')),
                h('p', { className: 'dt-install-desc' }, tr('formDesc')),
              ),
              h('div', { className: 'dt-install-row' },
                h('input', {
                  className: 'dt-input',
                  value: spec,
                  placeholder: tr('specPlaceholder'),
                  'aria-label': tr('formTitle'),
                  spellCheck: false,
                  onChange: (event) => setSpec(event.target.value),
                  disabled: busy,
                }),
                h('button', {
                  type: 'submit',
                  className: 'dt-btn primary',
                  disabled: busy || spec.trim() === '',
                }, busy ? tr('submitting') : tr('installAction')),
              ),
            )
          : h('div', { className: 'dt-card dt-off-card' },
              h('div', { className: 'dt-install-title' }, tr('installerOffTitle')),
              h('p', { className: 'dt-install-desc' }, tr('installerOffDesc')),
            ),

        h(ErrorBar, { message: error }),

        visible.length === 0
          ? h('div', { className: 'dt-empty' },
              h('div', { className: 'dt-empty-title' }, tr('emptyTitle')),
              h('p', { className: 'dt-empty-desc' }, tr('emptyDesc')),
            )
          : h('div', { className: 'dt-task-list', 'aria-live': 'polite' },
              visible.map((record) => h(InstallTaskCard, {
                key: record.id,
                record,
                entries: feed.logs[record.id] || [],
                showLog: current.liveLog,
                now,
                onCancel: cancel,
                onApprove: approve,
                onDismiss: dismiss,
              })),
            ),
        h(Style),
      )
    }

    // ---------------------------------------------------------------------
    // styles (theme tokens only)
    // ---------------------------------------------------------------------

    function Style() {
      return h('style', null, STYLE)
    }

    const STYLE = `
      .dt-root { display: flex; flex-direction: column; gap: 16px; width: 100%; max-width: 820px; padding: 4px 2px 28px; color: var(--dsw-alias-label-primary); font-size: 13px; line-height: 1.5; }
      .dt-settings { max-width: 760px; }
      .dt-settings-head { display: flex; flex-direction: column; gap: 4px; padding: 0 2px; }
      .dt-settings-title { margin: 0; font-size: 17px; line-height: 24px; font-weight: 600; color: var(--dsw-alias-label-primary); }
      .dt-settings-sub { margin: 0; font-size: 12px; line-height: 19px; color: var(--dsw-alias-label-secondary); }
      .dt-group { display: flex; flex-direction: column; gap: 0; padding: 18px 20px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 16px; background: var(--dsw-alias-bg-layer-1); }
      .dt-group-head { padding: 0 2px 6px; font-size: 13px; font-weight: 600; line-height: 20px; color: var(--dsw-alias-label-primary); }
      .dt-row { display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 12px 2px; border-bottom: 1px solid var(--dsw-alias-border-l1); }
      .dt-row:last-child { border-bottom: none; }
      .dt-row-text { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
      .dt-row-title { font-size: 14px; line-height: 22px; color: var(--dsw-alias-label-primary); }
      .dt-row-desc { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
      .dt-row-warn { font-size: 11px; line-height: 17px; color: var(--dsw-alias-state-warn-primary); }
      .dt-switch { position: relative; flex: none; width: 36px; height: 20px; padding: 0; box-sizing: border-box; border: 1px solid var(--dsw-alias-border-l2); border-radius: 10px; background: var(--dsw-alias-bg-layer-2); cursor: pointer; transition: background .15s ease, border-color .15s ease; }
      .dt-switch.on { background: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); }
      .dt-switch:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
      .dt-switch-thumb { position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%; background: var(--dsw-alias-label-secondary); transition: transform .15s ease, background .15s ease; }
      .dt-switch.on .dt-switch-thumb { transform: translateX(16px); background: var(--dsw-alias-bg-base); }
      .dt-about { margin: 0 0 10px; padding: 0 2px; font-size: 12px; line-height: 19px; color: var(--dsw-alias-label-secondary); }
      .dt-badge { display: inline-flex; align-items: center; gap: 8px; align-self: flex-start; padding: 4px 12px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 999px; background: var(--dsw-alias-bg-layer-2); font-size: 12px; line-height: 18px; }
      .dt-badge-name { font-weight: 600; color: var(--dsw-alias-label-primary); }
      .dt-badge-tag { color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; }
      .dt-new-ungrouped { display: flex; align-items: center; justify-content: flex-start; gap: 8px; flex: 0 1 auto; width: auto; max-width: 100%; min-width: 0; height: 32px; margin: 0 2px 8px; padding: 0 8px; box-sizing: border-box; border: none; border-radius: 8px; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 13px; line-height: 20px; text-align: left; cursor: pointer; }
      .dt-new-ungrouped:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
      .dt-new-ungrouped:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
      .dt-new-ungrouped:disabled { opacity: .55; cursor: default; }
      .dt-new-ungrouped.rail { width: 36px; height: 36px; justify-content: center; margin: 0 0 6px; padding: 0; }
      .dt-new-ungrouped-icon { flex: none; }
      .dt-new-ungrouped-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .dt-tab-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
      .dt-tab-heading { min-width: 0; }
      .dt-tab-title { font-size: 17px; line-height: 24px; font-weight: 600; }
      .dt-tab-desc { margin: 4px 0 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
      .dt-tab-tools { display: inline-flex; align-items: center; gap: 10px; flex: none; }
      .dt-conn { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; color: var(--dsw-alias-label-secondary); }
      .dt-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--dsw-alias-state-idle-primary); }
      .dt-dot.on { background: var(--dsw-alias-state-success-primary); }
      .dt-install-card { display: flex; flex-direction: column; gap: 12px; padding: 16px 18px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 14px; background: var(--dsw-alias-bg-layer-1); }
      .dt-install-title { font-size: 14px; font-weight: 600; line-height: 22px; }
      .dt-install-desc { margin: 3px 0 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
      .dt-install-row { display: flex; gap: 8px; }
      .dt-input { flex: 1; min-width: 0; height: 34px; padding: 0 10px; box-sizing: border-box; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font: inherit; font-size: 13px; }
      .dt-input:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
      .dt-input::placeholder { color: var(--dsw-alias-label-secondary); opacity: .8; }
      .dt-btn { height: 30px; padding: 0 12px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; background: transparent; color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; white-space: nowrap; cursor: pointer; }
      .dt-btn:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-2); }
      .dt-btn:disabled { opacity: .5; cursor: default; }
      .dt-btn.primary { background: var(--dsw-alias-brand-primary); border-color: transparent; color: var(--dsw-alias-bg-base); }
      .dt-btn.primary:hover:not(:disabled) { background: var(--dsw-alias-brand-primary); opacity: .9; }
      .dt-btn.danger { color: var(--dsw-alias-state-error-primary); border-color: var(--dsw-alias-state-error-primary); }
      .dt-btn.quiet { border-color: transparent; color: var(--dsw-alias-label-secondary); }
      .dt-btn:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
      .dt-error { padding: 8px 10px; border: 1px solid var(--dsw-alias-state-error-primary); border-radius: 8px; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-state-error-primary); font-size: 12px; line-height: 18px; white-space: pre-wrap; word-break: break-word; }
      .dt-diag { font-size: 11px; opacity: .85; margin-top: 4px; }
      .dt-task-list { display: flex; flex-direction: column; gap: 10px; }
      .dt-card { display: flex; flex-direction: column; gap: 8px; padding: 14px 16px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 14px; background: var(--dsw-alias-bg-layer-1); }
      .dt-card-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
      .dt-card-title { display: flex; align-items: center; gap: 8px; min-width: 0; flex-wrap: wrap; }
      .dt-name { font-size: 14px; font-weight: 600; line-height: 22px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
      .dt-version { font-size: 11px; color: var(--dsw-alias-label-secondary); }
      .dt-chip { padding: 0 7px; height: 18px; display: inline-flex; align-items: center; border: 1px solid var(--dsw-alias-border-l2); border-radius: 999px; font-size: 11px; color: var(--dsw-alias-label-secondary); }
      .dt-phase { flex: none; padding: 1px 8px; border-radius: 999px; border: 1px solid var(--dsw-alias-border-l2); font-size: 11px; line-height: 17px; color: var(--dsw-alias-label-secondary); }
      .dt-phase.active { color: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); }
      .dt-phase.done { color: var(--dsw-alias-state-success-primary); border-color: var(--dsw-alias-state-success-primary); }
      .dt-phase.failed { color: var(--dsw-alias-state-error-primary); border-color: var(--dsw-alias-state-error-primary); }
      .dt-phase.cancelled { color: var(--dsw-alias-state-idle-primary); }
      .dt-spec { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11px; line-height: 17px; color: var(--dsw-alias-label-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .dt-meta { display: flex; flex-wrap: wrap; gap: 12px; font-size: 11px; line-height: 17px; color: var(--dsw-alias-label-secondary); }
      .dt-progress { height: 6px; border-radius: 3px; background: var(--dsw-alias-bg-layer-2); overflow: hidden; }
      .dt-progress-fill { height: 100%; border-radius: inherit; background: var(--dsw-alias-brand-primary); transition: width .3s ease; }
      .dt-progress.running .dt-progress-fill { animation: dt-breathe 1.4s ease-in-out infinite; }
      .dt-progress.done .dt-progress-fill { background: var(--dsw-alias-state-success-primary); }
      .dt-progress.failed .dt-progress-fill { background: var(--dsw-alias-state-error-primary); }
      .dt-progress.cancelled .dt-progress-fill, .dt-progress.ended .dt-progress-fill { background: var(--dsw-alias-state-idle-primary); }
      @keyframes dt-breathe { 0%, 100% { opacity: .45; } 50% { opacity: 1; } }
      .dt-pending { padding: 10px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; background: var(--dsw-alias-bg-layer-2); font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
      .dt-pending-title { margin-bottom: 6px; }
      .dt-pending-list { display: flex; flex-wrap: wrap; gap: 6px; }
      .dt-pending-list code { padding: 1px 6px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 6px; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font-size: 11px; }
      .dt-note { font-size: 12px; color: var(--dsw-alias-state-warn-primary); }
      .dt-warnings { display: flex; flex-direction: column; gap: 3px; font-size: 11px; line-height: 17px; color: var(--dsw-alias-label-secondary); }
      .dt-actions { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; }
      .dt-log summary { cursor: pointer; font-size: 12px; color: var(--dsw-alias-label-secondary); }
      .dt-log pre { margin: 6px 0 0; max-height: 200px; overflow: auto; padding: 8px 10px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-secondary); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11px; line-height: 1.55; white-space: pre-wrap; word-break: break-word; }
      .dt-log-empty { padding: 8px 2px; font-size: 11px; color: var(--dsw-alias-label-secondary); }
      .dt-empty { padding: 26px 16px; border: 1px dashed var(--dsw-alias-border-l2); border-radius: 14px; text-align: center; }
      .dt-empty-title { font-size: 14px; font-weight: 600; line-height: 22px; }
      .dt-empty-desc { margin: 4px 0 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
      .dt-off-card { gap: 2px; }
      @media (max-width: 620px) { .dt-install-row { flex-direction: column; } .dt-install-row .dt-btn { height: 34px; } }
      @media (prefers-reduced-motion: reduce) { .dt-progress.running .dt-progress-fill { animation: none; opacity: .8; } .dt-switch, .dt-switch-thumb, .dt-progress-fill { transition: none; } }
    `

    // ---------------------------------------------------------------------
    // client plugin
    // ---------------------------------------------------------------------

    function apply(ctx) {
      activeContext = ctx
      ctx.effect(() => {
        let disposeLocale
        try {
          disposeLocale = ctx.locale.register(NS, DICTIONARIES)
        } catch (error) {
          if (!/already|duplicate|occupied/i.test(String(error?.message))) throw error
        }
        translate = ctx.locale.bind(NS)
        return () => {
          disposeLocale?.()
          if (activeContext === ctx) {
            activeContext = null
            translate = (key) => key
          }
        }
      }, 'dark-toolbox.locale')

      ctx.effect(() => ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: 'dark-toolbox',
        order: 16,
        label: () => tr('nav'),
      }, SettingsSection)), 'dark-toolbox.settings')

      // New Session default: the shipped global action (button + shortcut) calls
      // startSession() with no workspace; its own policy then falls back to the
      // current or most recent workspace. Take that one call only, so per-workspace
      // "+" actions keep their target. Restore the prototype method on teardown.
      ctx.inject(['uiWorkspace', 'sessions', 'workspaces'], (sessionCtx) => {
        sessionCtx.effect(() => {
          const services = sessionServices()
          if (!services) return undefined
          const { uiWorkspace } = services
          const original = uiWorkspace.startSession
          let wrapper = null
          let installed = false

          const restore = () => {
            if (!installed) return
            if (uiWorkspace.startSession === wrapper) uiWorkspace.startSession = original
            installed = false
            wrapper = null
            newSessionOverrideReady = false
          }

          const install = () => {
            if (installed || !getSettings().noWorkspaceNewSession) return
            wrapper = function (workspaceId, options) {
              if (workspaceId === undefined && options === undefined && getSettings().noWorkspaceNewSession) {
                void launchUngroupedSession()
                return
              }
              return original.call(uiWorkspace, workspaceId, options)
            }
            try {
              uiWorkspace.startSession = wrapper
              installed = true
              newSessionOverrideReady = true
            } catch (error) {
              wrapper = null
              console.warn('[dark-toolbox] cannot take over the New Session default:', error)
            }
          }

          const sync = () => {
            if (getSettings().noWorkspaceNewSession) install()
            else restore()
          }
          const off = subscribeSettings(sync)
          sync()
          return () => {
            off()
            restore()
          }
        }, 'dark-toolbox.new-session-default')

        sessionCtx.effect(() => sessionCtx.slots.inject('sidebar.footer.action', () => sessionCtx.slots.register({
          name: 'sidebar.footer.action',
          id: 'dark-toolbox-new-ungrouped',
          order: 10,
          label: () => tr('newUngroupedAction'),
        }, NewUngroupedAction)), 'dark-toolbox.new-ungrouped-entry')
      })

      // The install tab follows the feature switch: unregistering it removes
      // the tab immediately, and the page falls back to Installed.
      ctx.effect(() => {
        let injected = false
        let disposeTab = null
        const sync = () => {
          if (!injected) return
          if (disposeTab) {
            disposeTab()
            disposeTab = null
          }
          if (!settings.installListTab) return
          disposeTab = ctx.slots.register({
            name: 'plugins.tab',
            id: 'dark-toolbox-installs',
            order: 1000,
            label: () => tr('tabLabel'),
          }, InstallListTab)
        }
        const offInject = ctx.slots.inject('plugins.tab', () => {
          injected = true
          sync()
          return () => {
            injected = false
            if (disposeTab) {
              disposeTab()
              disposeTab = null
            }
          }
        })
        const offSettings = subscribeSettings(sync)
        return () => {
          offSettings()
          offInject?.()
          if (disposeTab) {
            disposeTab()
            disposeTab = null
          }
        }
      }, 'dark-toolbox.install-tab')
    }

    return {
      inject: ['slots', 'locale'],
      apply,
    }
  },
})