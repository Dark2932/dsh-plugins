window.__ModuleLoader__.load({
  id: 'ssh-link',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const NS = 'ssh-link'

    // ---------------------------------------------------------------------
    // locale
    // ---------------------------------------------------------------------

    const DICTIONARIES = {
      en: {
        nav: 'SSH',
        title: 'SSH connections',
        subtitle: 'Run DSH locally; commands and file edits happen on the remote server.',
        remoteNote: 'After connecting, the agent can use the ssh_* tools. Relative paths resolve in the remote working directory.',
        newConnection: 'New connection',
        empty: 'No SSH connections yet. Add one to work on a remote server.',
        name: 'Name',
        namePlaceholder: 'my-server (optional)',
        host: 'Host',
        hostPlaceholder: '192.168.1.10 or example.com',
        port: 'Port',
        user: 'User',
        userPlaceholder: 'root',
        auth: 'Authentication',
        passwordAuth: 'Password',
        keyAuth: 'Private key',
        password: 'Password',
        passwordKeep: 'A password is already stored. Leave blank to keep it.',
        passwordPlaceholder: 'Password',
        keyPath: 'Private key file',
        keyPathPlaceholder: '~/.ssh/id_ed25519',
        passphrase: 'Key passphrase',
        passphraseKeep: 'Leave blank to keep the stored passphrase.',
        passphrasePlaceholder: 'Passphrase (optional)',
        remoteCwd: 'Remote working directory',
        remoteCwdPlaceholder: '/var/www (default: home)',
        forgetPassword: 'Forget the stored password',
        resetHostKey: 'Forget the pinned host key',
        resetHostKeyHint: 'Use after the server is rebuilt or its host key changes.',
        save: 'Save',
        saving: 'Saving…',
        cancel: 'Cancel',
        edit: 'Edit',
        remove: 'Remove',
        confirmRemove: 'Confirm remove',
        connect: 'Connect',
        connecting: 'Connecting…',
        disconnect: 'Disconnect',
        connected: 'Connected',
        offline: 'Offline',
        active: 'Active',
        makeActive: 'Set active',
        fingerprint: 'Host key',
        remoteTerminal: 'Remote terminal',
        terminalHint: 'Commands run on the selected remote host, not on this machine.',
        commandPlaceholder: 'command to run on the remote host…',
        run: 'Run',
        running: 'Running…',
        clear: 'Clear',
        noTerminal: 'Connect a host to open its terminal.',
        selectedTarget: 'Target',
        loadFailed: 'Could not read SSH connections',
        requestFailed: 'Request failed',
        emptyTerminal: 'No command output yet.',
        passwordRequired: 'Enter a password for a new password connection.',
        keyRequired: 'Choose a private key file for key authentication.',
        hostRequired: 'Host and user are required.',
        saved: 'Saved',
      },
      zh: {
        nav: 'SSH 连接',
        title: 'SSH 连接',
        subtitle: 'DSH 在本地运行，命令与文件修改都发生在远端服务器上。',
        remoteNote: '连接后，Agent 会使用 ssh_* 工具；相对路径以远端工作目录为基准。',
        newConnection: '新建连接',
        empty: '还没有 SSH 连接。添加一个即可在远端服务器上工作。',
        name: '名称',
        namePlaceholder: '我的服务器（可选）',
        host: '主机',
        hostPlaceholder: '192.168.1.10 或 example.com',
        port: '端口',
        user: '用户',
        userPlaceholder: 'root',
        auth: '认证方式',
        passwordAuth: '密码',
        keyAuth: '私钥',
        password: '密码',
        passwordKeep: '已保存密码，留空表示保持不变。',
        passwordPlaceholder: '密码',
        keyPath: '私钥文件',
        keyPathPlaceholder: '~/.ssh/id_ed25519',
        passphrase: '私钥口令',
        passphraseKeep: '留空表示保留已保存的口令。',
        passphrasePlaceholder: '口令（可选）',
        remoteCwd: '远端工作目录',
        remoteCwdPlaceholder: '/var/www（默认：用户主目录）',
        forgetPassword: '清除已保存的密码',
        resetHostKey: '清除已固定的主机密钥',
        resetHostKeyHint: '服务器重装或主机密钥变更后使用。',
        save: '保存',
        saving: '保存中…',
        cancel: '取消',
        edit: '编辑',
        remove: '删除',
        confirmRemove: '确认删除',
        connect: '连接',
        connecting: '连接中…',
        disconnect: '断开',
        connected: '已连接',
        offline: '未连接',
        active: '活动',
        makeActive: '设为活动',
        fingerprint: '主机密钥',
        remoteTerminal: '远端终端',
        terminalHint: '命令在所选远端服务器上执行，不会在本机执行。',
        commandPlaceholder: '在远端服务器上执行的命令…',
        run: '执行',
        running: '执行中…',
        clear: '清空',
        noTerminal: '先连接一个主机，才能打开它的终端。',
        selectedTarget: '目标',
        loadFailed: '读取 SSH 连接失败',
        requestFailed: '请求失败',
        emptyTerminal: '还没有命令输出。',
        passwordRequired: '新的密码连接需要填写密码。',
        keyRequired: '私钥认证需要选择私钥文件。',
        hostRequired: '主机和用户不能为空。',
        saved: '已保存',
      },
    }

    let activeContext = null
    let translate = (key) => key

    function tr(key, vars) {
      let value = translate(key)
      if (typeof value !== 'string' || value === key) value = DICTIONARIES.zh[key] || DICTIONARIES.en[key] || key
      if (vars) {
        for (const [name, replacement] of Object.entries(vars)) value = value.replaceAll(`{${name}}`, String(replacement))
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
    // host API
    // ---------------------------------------------------------------------

    function apiUrl() {
      return new URL('ssh-link/api', document.baseURI).href
    }

    async function request(action, payload) {
      const url = apiUrl()
      const options = action === 'status'
        ? { method: 'GET', credentials: 'same-origin', headers: { accept: 'application/json', 'x-ssh-link': '1' } }
        : {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json', 'x-ssh-link': '1' },
            body: JSON.stringify({ action, ...payload }),
          }
      let response
      try {
        response = await fetch(url, options)
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

    // ---------------------------------------------------------------------
    // small presentational helpers
    // ---------------------------------------------------------------------

    function shortFingerprint(value) {
      if (!value) return ''
      return value.length > 18 ? `${value.slice(0, 16)}…` : value
    }

    function Field(props) {
      return h('label', { className: 'ssh-link-field', htmlFor: props.id },
        h('span', { className: 'ssh-link-label' }, props.label),
        props.children,
        props.hint ? h('span', { className: 'ssh-link-hint' }, props.hint) : null,
      )
    }

    function ErrorBar(props) {
      if (!props.message) return null
      return h('div', { className: 'ssh-link-error', role: 'alert' }, props.message)
    }

    const STYLE = `
      .ssh-link-root { display: flex; flex-direction: column; gap: 18px; padding: 4px 2px 28px; color: var(--dsw-alias-label-primary); font-size: 13px; line-height: 1.5; }
      .ssh-link-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
      .ssh-link-title { margin: 0; font-size: 17px; font-weight: 600; line-height: 24px; }
      .ssh-link-sub { margin: 4px 0 0; color: var(--dsw-alias-label-secondary); }
      .ssh-link-note { color: var(--dsw-alias-label-secondary); font-size: 12px; border-left: 2px solid var(--dsw-alias-border-l2); padding-left: 10px; }
      .ssh-link-card { border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; background: var(--dsw-alias-bg-layer-1); overflow: hidden; }
      .ssh-link-row { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-top: 1px solid var(--dsw-alias-border-l1); }
      .ssh-link-row:first-child { border-top: none; }
      .ssh-link-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; background: var(--dsw-alias-state-idle-primary); }
      .ssh-link-dot.on { background: var(--dsw-alias-state-success-primary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--dsw-alias-state-success-primary) 18%, transparent); }
      .ssh-link-main { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 2px; }
      .ssh-link-name { font-weight: 600; display: flex; align-items: center; gap: 8px; min-width: 0; }
      .ssh-link-name span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .ssh-link-target { color: var(--dsw-alias-label-secondary); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .ssh-link-meta { color: var(--dsw-alias-label-secondary); font-size: 11px; display: flex; gap: 10px; flex-wrap: wrap; }
      .ssh-link-chip { display: inline-flex; align-items: center; gap: 4px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 999px; padding: 0 7px; height: 18px; font-size: 11px; color: var(--dsw-alias-label-secondary); flex: none; }
      .ssh-link-chip.on { border-color: color-mix(in srgb, var(--dsw-alias-state-success-primary) 45%, transparent); color: var(--dsw-alias-state-success-primary); }
      .ssh-link-actions { display: flex; gap: 6px; flex: none; align-items: center; }
      .ssh-link-btn { height: 28px; padding: 0 10px; border-radius: 7px; border: 1px solid var(--dsw-alias-border-l2); background: transparent; color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; cursor: pointer; white-space: nowrap; }
      .ssh-link-btn:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-2); }
      .ssh-link-btn.primary { background: var(--dsw-alias-brand-primary); border-color: transparent; color: var(--dsw-alias-bg-base); }
      .ssh-link-btn.danger { color: var(--dsw-alias-state-error-primary); border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 45%, transparent); }
      .ssh-link-btn.quiet { border-color: transparent; color: var(--dsw-alias-label-secondary); }
      .ssh-link-btn:disabled { opacity: .5; cursor: default; }
      .ssh-link-empty { padding: 22px 14px; text-align: center; color: var(--dsw-alias-label-secondary); }
      .ssh-link-form { padding: 14px; display: flex; flex-direction: column; gap: 12px; }
      .ssh-link-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
      .ssh-link-field { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
      .ssh-link-field.full { grid-column: 1 / -1; }
      .ssh-link-label { font-size: 12px; font-weight: 550; color: var(--dsw-alias-label-secondary); }
      .ssh-link-input { height: 32px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 7px; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); padding: 0 9px; font: inherit; min-width: 0; }
      .ssh-link-input:focus { outline: 2px solid color-mix(in srgb, var(--dsw-alias-brand-primary) 35%, transparent); outline-offset: 1px; }
      .ssh-link-hint { font-size: 11px; color: var(--dsw-alias-label-secondary); }
      .ssh-link-check { display: flex; align-items: center; gap: 7px; font-size: 12px; color: var(--dsw-alias-label-secondary); }
      .ssh-link-form-actions { display: flex; justify-content: flex-end; gap: 8px; }
      .ssh-link-error { border: 1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 45%, transparent); background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 9%, transparent); color: var(--dsw-alias-state-error-primary); border-radius: 8px; padding: 8px 10px; white-space: pre-wrap; word-break: break-word; }
      .ssh-link-terminal { display: flex; flex-direction: column; gap: 10px; }
      .ssh-link-terminal-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
      .ssh-link-terminal-title { font-weight: 600; }
      .ssh-link-select { height: 30px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 7px; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); padding: 0 8px; font: inherit; font-size: 12px; max-width: 100%; }
      .ssh-link-console { height: 260px; overflow: auto; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; background: var(--dsw-alias-bg-base); padding: 10px 12px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; line-height: 1.55; white-space: pre-wrap; word-break: break-word; }
      .ssh-link-line { margin: 0; }
      .ssh-link-line.command { color: var(--dsw-alias-brand-primary); }
      .ssh-link-line.error { color: var(--dsw-alias-state-error-primary); }
      .ssh-link-line.muted { color: var(--dsw-alias-label-secondary); }
      .ssh-link-command-row { display: flex; gap: 8px; }
      .ssh-link-command-row .ssh-link-input { flex: 1; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; }
      @media (max-width: 620px) { .ssh-link-grid { grid-template-columns: 1fr; } .ssh-link-row { flex-wrap: wrap; } .ssh-link-actions { width: 100%; justify-content: flex-end; } }
    `

    // ---------------------------------------------------------------------
    // Settings section
    // ---------------------------------------------------------------------

    function Section() {
      useLocaleTick()
      const [snapshot, setSnapshot] = React.useState({ connections: [], defaultId: null })
      const [loadError, setLoadError] = React.useState('')
      const [actionError, setActionError] = React.useState('')
      const [busyId, setBusyId] = React.useState('')
      const [draft, setDraft] = React.useState(null)
      const [saving, setSaving] = React.useState(false)
      const [forgetPassword, setForgetPassword] = React.useState(false)
      const [resetHostKey, setResetHostKey] = React.useState(false)
      const [confirmRemove, setConfirmRemove] = React.useState('')
      const [terminalTarget, setTerminalTarget] = React.useState('')
      const [lines, setLines] = React.useState([])
      const [command, setCommand] = React.useState('')
      const [running, setRunning] = React.useState(false)
      const consoleRef = React.useRef(null)

      const refresh = React.useCallback(async (quiet) => {
        try {
          const data = await request('status', {})
          setSnapshot({ connections: data.connections || [], defaultId: data.defaultId || null })
          setLoadError('')
          return data
        } catch (error) {
          if (!quiet) setLoadError(error.message)
          return undefined
        }
      }, [])

      React.useEffect(() => {
        refresh(false)
        const timer = setInterval(() => refresh(true), 8000)
        return () => clearInterval(timer)
      }, [refresh])

      const connected = snapshot.connections.filter((item) => item.connected)
      React.useEffect(() => {
        if (terminalTarget && connected.some((item) => item.id === terminalTarget)) return
        setTerminalTarget(connected[0]?.id || '')
      }, [snapshot, terminalTarget])

      React.useEffect(() => {
        const node = consoleRef.current
        if (node) node.scrollTop = node.scrollHeight
      }, [lines])

      async function perform(action, payload) {
        setActionError('')
        try {
          const data = await request(action, payload)
          await refresh(true)
          return data
        } catch (error) {
          setActionError(error.message)
          return undefined
        }
      }

      async function connect(connection) {
        setBusyId(connection.id)
        const data = await perform('connect', { id: connection.id })
        setBusyId('')
        if (data?.profile) {
          setTerminalTarget(connection.id)
          setLines((previous) => [...previous, { kind: 'muted', text: `[${tr('connected')}] ${connection.user}@${connection.host}:${connection.port}` }])
        }
      }

      async function disconnect(connection) {
        setBusyId(connection.id)
        await perform('disconnect', { id: connection.id })
        setBusyId('')
      }

      async function remove(connection) {
        if (confirmRemove !== connection.id) {
          setConfirmRemove(connection.id)
          return
        }
        setConfirmRemove('')
        setBusyId(connection.id)
        await perform('remove', { id: connection.id })
        setBusyId('')
      }

      async function makeActive(connection) {
        setBusyId(connection.id)
        await perform('default', { id: connection.id })
        setBusyId('')
      }

      function startCreate() {
        setActionError('')
        setForgetPassword(false)
        setResetHostKey(false)
        setDraft({
          id: '',
          name: '',
          host: '',
          port: '22',
          user: '',
          auth: 'password',
          keyPath: '',
          password: '',
          passphrase: '',
          remoteCwd: '',
          hasPassword: false,
          hostFingerprint: '',
        })
      }

      function startEdit(connection) {
        setActionError('')
        setForgetPassword(false)
        setResetHostKey(false)
        setDraft({
          id: connection.id,
          name: connection.name,
          host: connection.host,
          port: String(connection.port),
          user: connection.user,
          auth: connection.auth,
          keyPath: connection.keyPath || '',
          password: '',
          passphrase: '',
          remoteCwd: connection.remoteCwd || '',
          hasPassword: connection.hasPassword,
          hostFingerprint: connection.hostFingerprint || '',
        })
      }

      function updateDraft(field, value) {
        setDraft((current) => (current ? { ...current, [field]: value } : current))
      }

      async function submitDraft(event) {
        event.preventDefault()
        if (!draft) return
        if (!draft.host.trim() || !draft.user.trim()) {
          setActionError(tr('hostRequired'))
          return
        }
        if (!draft.id && draft.auth === 'password' && !draft.password) {
          setActionError(tr('passwordRequired'))
          return
        }
        if (draft.auth === 'key' && !draft.keyPath.trim()) {
          setActionError(tr('keyRequired'))
          return
        }
        const profile = {
          id: draft.id || undefined,
          name: draft.name.trim(),
          host: draft.host.trim(),
          port: Number(draft.port) || 22,
          user: draft.user.trim(),
          auth: draft.auth,
          keyPath: draft.keyPath.trim(),
          remoteCwd: draft.remoteCwd.trim(),
        }
        if (draft.password) profile.password = draft.password
        else if (forgetPassword) profile.clearPassword = true
        if (draft.passphrase) profile.passphrase = draft.passphrase
        if (resetHostKey) profile.resetHostKey = true
        setSaving(true)
        setActionError('')
        try {
          const data = await request('save', { profile })
          setDraft(null)
          setForgetPassword(false)
          setResetHostKey(false)
          await refresh(true)
          if (data.profile) setTerminalTarget((current) => current || data.profile.id)
        } catch (error) {
          setActionError(error.message)
        } finally {
          setSaving(false)
        }
      }

      function pushLine(kind, text) {
        setLines((previous) => [...previous.slice(-499), { kind, text }])
      }

      async function runCommand() {
        const value = command.trim()
        if (!value || !terminalTarget || running) return
        setCommand('')
        setRunning(true)
        pushLine('command', `${terminalTarget ? snapshot.connections.find((item) => item.id === terminalTarget)?.user || '' : ''}$ ${value}`)
        try {
          const data = await request('exec', { id: terminalTarget, command: value })
          const formatted = data.output || ''
          const separator = formatted.indexOf('\n\n')
          const body = separator === -1 ? formatted : formatted.slice(separator + 2)
          pushLine(data.code === 0 ? 'output' : 'error', body || '(no output)')
        } catch (error) {
          pushLine('error', error.message)
        } finally {
          setRunning(false)
        }
      }

      function onCommandKeyDown(event) {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault()
          runCommand()
        }
      }

      const activeTarget = snapshot.connections.find((item) => item.id === terminalTarget)
      const title = h('div', { className: 'ssh-link-head' },
        h('div', null,
          h('h2', { className: 'ssh-link-title' }, tr('title')),
          h('p', { className: 'ssh-link-sub' }, tr('subtitle')),
        ),
        h('button', { type: 'button', className: 'ssh-link-btn primary', onClick: startCreate, disabled: Boolean(draft) }, tr('newConnection')),
      )

      const note = h('div', { className: 'ssh-link-note' }, tr('remoteNote'))
      const error = h(ErrorBar, { message: actionError || loadError })

      const list = h('div', { className: 'ssh-link-card' },
        snapshot.connections.length === 0
          ? h('div', { className: 'ssh-link-empty' }, tr('empty'))
          : snapshot.connections.map((connection) => {
              const isActive = snapshot.defaultId === connection.id
              const isBusy = busyId === connection.id
              return h('div', { className: 'ssh-link-row', key: connection.id },
                h('span', { className: `ssh-link-dot${connection.connected ? ' on' : ''}` }),
                h('div', { className: 'ssh-link-main' },
                  h('div', { className: 'ssh-link-name' },
                    h('span', { title: connection.name }, connection.name),
                    isActive ? h('span', { className: 'ssh-link-chip on' }, tr('active')) : null,
                    connection.hasPassword ? h('span', { className: 'ssh-link-chip' }, tr('passwordAuth')) : null,
                  ),
                  h('div', { className: 'ssh-link-target', title: `${connection.user}@${connection.host}:${connection.port}` },
                    `${connection.user}@${connection.host}:${connection.port}`),
                  h('div', { className: 'ssh-link-meta' },
                    h('span', null, connection.connected ? tr('connected') : tr('offline')),
                    h('span', null, connection.remoteCwd || '~'),
                    connection.hostFingerprint
                      ? h('span', { title: connection.hostFingerprint }, `${tr('fingerprint')} ${shortFingerprint(connection.hostFingerprint)}`)
                      : null,
                  ),
                ),
                h('div', { className: 'ssh-link-actions' },
                  connection.connected
                    ? h('button', { type: 'button', className: 'ssh-link-btn', disabled: isBusy, onClick: () => disconnect(connection) }, isBusy ? tr('connecting') : tr('disconnect'))
                    : h('button', { type: 'button', className: 'ssh-link-btn primary', disabled: isBusy, onClick: () => connect(connection) }, isBusy ? tr('connecting') : tr('connect')),
                  !isActive ? h('button', { type: 'button', className: 'ssh-link-btn quiet', disabled: isBusy, onClick: () => makeActive(connection) }, tr('makeActive')) : null,
                  h('button', { type: 'button', className: 'ssh-link-btn quiet', disabled: Boolean(draft) || isBusy, onClick: () => startEdit(connection) }, tr('edit')),
                  h('button', { type: 'button', className: 'ssh-link-btn danger', disabled: isBusy, onClick: () => remove(connection) }, confirmRemove === connection.id ? tr('confirmRemove') : tr('remove')),
                ),
              )
            }),
      )

      const form = draft
        ? h('form', { className: 'ssh-link-card ssh-link-form', onSubmit: submitDraft },
            h('div', { className: 'ssh-link-grid' },
              h(Field, { id: 'ssh-link-name', label: tr('name') },
                h('input', { id: 'ssh-link-name', className: 'ssh-link-input', value: draft.name, placeholder: tr('namePlaceholder'), onChange: (event) => updateDraft('name', event.target.value) }),
              ),
              h(Field, { id: 'ssh-link-host', label: tr('host') },
                h('input', { id: 'ssh-link-host', className: 'ssh-link-input', value: draft.host, placeholder: tr('hostPlaceholder'), onChange: (event) => updateDraft('host', event.target.value), required: true }),
              ),
              h(Field, { id: 'ssh-link-port', label: tr('port') },
                h('input', { id: 'ssh-link-port', className: 'ssh-link-input', value: draft.port, inputMode: 'numeric', onChange: (event) => updateDraft('port', event.target.value) }),
              ),
              h(Field, { id: 'ssh-link-user', label: tr('user') },
                h('input', { id: 'ssh-link-user', className: 'ssh-link-input', value: draft.user, placeholder: tr('userPlaceholder'), onChange: (event) => updateDraft('user', event.target.value), required: true }),
              ),
              h(Field, { id: 'ssh-link-auth', label: tr('auth') },
                h('select', { id: 'ssh-link-auth', className: 'ssh-link-input', value: draft.auth, onChange: (event) => updateDraft('auth', event.target.value) },
                  h('option', { value: 'password' }, tr('passwordAuth')),
                  h('option', { value: 'key' }, tr('keyAuth')),
                ),
              ),
              draft.auth === 'key'
                ? h(Field, { id: 'ssh-link-key', label: tr('keyPath') },
                    h('input', { id: 'ssh-link-key', className: 'ssh-link-input', value: draft.keyPath, placeholder: tr('keyPathPlaceholder'), onChange: (event) => updateDraft('keyPath', event.target.value) }),
                  )
                : h(Field, { id: 'ssh-link-password', label: tr('password') },
                    h('input', { id: 'ssh-link-password', className: 'ssh-link-input', type: 'password', autoComplete: 'new-password', value: draft.password, placeholder: draft.hasPassword ? '••••••••' : tr('passwordPlaceholder'), onChange: (event) => updateDraft('password', event.target.value) }),
                    draft.id && draft.hasPassword ? h('span', { className: 'ssh-link-hint' }, tr('passwordKeep')) : null,
                  ),
              draft.auth === 'key'
                ? h(Field, { id: 'ssh-link-passphrase', label: tr('passphrase') },
                    h('input', { id: 'ssh-link-passphrase', className: 'ssh-link-input', type: 'password', autoComplete: 'new-password', value: draft.passphrase, placeholder: tr('passphrasePlaceholder'), onChange: (event) => updateDraft('passphrase', event.target.value) }),
                    draft.id ? h('span', { className: 'ssh-link-hint' }, tr('passphraseKeep')) : null,
                  )
                : null,
              h(Field, { id: 'ssh-link-cwd', label: tr('remoteCwd') },
                h('input', { id: 'ssh-link-cwd', className: 'ssh-link-input', value: draft.remoteCwd, placeholder: tr('remoteCwdPlaceholder'), onChange: (event) => updateDraft('remoteCwd', event.target.value) }),
              ),
              draft.id && draft.hasPassword
                ? h('label', { className: 'ssh-link-check ssh-link-field full', htmlFor: 'ssh-link-forget' },
                    h('input', { id: 'ssh-link-forget', type: 'checkbox', checked: forgetPassword, onChange: (event) => setForgetPassword(event.target.checked) }),
                    tr('forgetPassword'),
                  )
                : null,
              draft.id && draft.hostFingerprint
                ? h('label', { className: 'ssh-link-check ssh-link-field full', htmlFor: 'ssh-link-reset-hostkey' },
                    h('input', { id: 'ssh-link-reset-hostkey', type: 'checkbox', checked: resetHostKey, onChange: (event) => setResetHostKey(event.target.checked) }),
                    h('span', null, tr('resetHostKey'), h('span', { className: 'ssh-link-hint' }, ` — ${tr('resetHostKeyHint')}`)),
                  )
                : null,
            ),
            h('div', { className: 'ssh-link-form-actions' },
              h('button', { type: 'button', className: 'ssh-link-btn', onClick: () => { setDraft(null); setActionError('') }, disabled: saving }, tr('cancel')),
              h('button', { type: 'submit', className: 'ssh-link-btn primary', disabled: saving }, saving ? tr('saving') : tr('save')),
            ),
          )
        : null

      const terminal = h('div', { className: 'ssh-link-card ssh-link-form ssh-link-terminal' },
        h('div', { className: 'ssh-link-terminal-head' },
          h('span', { className: 'ssh-link-terminal-title' }, tr('remoteTerminal')),
          connected.length > 0
            ? h('select', { className: 'ssh-link-select', value: terminalTarget, onChange: (event) => setTerminalTarget(event.target.value) },
                connected.map((item) => h('option', { key: item.id, value: item.id }, `${item.name} — ${item.user}@${item.host}`)),
              )
            : null,
          connected.length > 0
            ? h('button', { type: 'button', className: 'ssh-link-btn quiet', onClick: () => setLines([]) }, tr('clear'))
            : null,
        ),
        h('div', { className: 'ssh-link-hint' }, tr('terminalHint')),
        h('div', { className: 'ssh-link-console', ref: consoleRef },
          lines.length === 0
            ? h('p', { className: 'ssh-link-line muted' }, connected.length > 0 ? tr('emptyTerminal') : tr('noTerminal'))
            : lines.map((line, index) => h('p', { key: index, className: `ssh-link-line ${line.kind}` }, line.text)),
        ),
        connected.length > 0
          ? h('div', { className: 'ssh-link-command-row' },
              h('input', {
                className: 'ssh-link-input',
                value: command,
                placeholder: `${tr('commandPlaceholder')}`,
                onChange: (event) => setCommand(event.target.value),
                onKeyDown: onCommandKeyDown,
                disabled: running,
                spellCheck: false,
              }),
              h('button', { type: 'button', className: 'ssh-link-btn primary', onClick: runCommand, disabled: running || !command.trim() },
                running ? tr('running') : tr('run')),
            )
          : null,
      )

      return h('div', { className: 'ssh-link-root' },
        h('style', null, STYLE),
        title,
        note,
        error,
        list,
        form,
        activeTarget ? terminal : null,
      )
    }

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
          // A previous generation that was not disposed may still own the
          // namespace; its dictionary is usable and tr() falls back locally.
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
      }, 'ssh-link.locale')
      ctx.effect(() => ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: 'ssh-link',
        order: 25,
        label: () => tr('nav'),
      }, Section)), 'ssh-link.section')
    }

    return {
      inject: ['slots', 'locale'],
      apply,
    }
  },
})