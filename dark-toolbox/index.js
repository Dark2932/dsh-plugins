/**
 * dark-toolbox — Host half.
 *
 * A lightweight background driver for plugin installs plus the live progress
 * feed behind the "安装列表" tab:
 *   - JSON actions over `/dark-toolbox/api` (install / cancel / approve / ...)
 *   - one Server-Sent Events stream with snapshots, records, and pnpm chunks
 *   - observation of every install the profile's plugin manager runs, so the
 *     list also shows installs started from the built-in Plugins dialog
 *
 * Installs are serialized in process (the manager writes profile files under
 * one lock) and continue independently of any browser page.
 */

const API_PATH = '/dark-toolbox/api'
const MAX_BODY_BYTES = 64 * 1024
const MAX_FINISHED_RECORDS = 20
const MAX_LOG_ENTRIES = 400
const MAX_LOG_CHARS = 48 * 1024
const HEARTBEAT_MS = 15000

const ACTIVE_PHASES = new Set(['queued', 'checking', 'installing', 'applying', 'cancelling'])
const FINAL_PHASES = new Set(['done', 'failed', 'cancelled', 'ended'])

export const inject = ['pluginManager', 'webServer']

export function apply(ctx) {
  const toolbox = new DarkToolbox(ctx)

  ctx.effect(() => () => toolbox.dispose(), 'dark-toolbox.dispose')
  ctx.effect(
    () => ctx.webServer.register({ kind: 'exact', path: API_PATH, handler: toolbox.handle }),
    'dark-toolbox.http',
  )
  ctx.effect(
    () => ctx.on('plugin-manager/install-state', (progress) => toolbox.onInstallState(progress)),
    'dark-toolbox.install-state',
  )
  ctx.effect(
    () => ctx.on('plugin-manager/install-log', (chunk) => toolbox.onInstallLog(chunk)),
    'dark-toolbox.install-log',
  )
  ctx.effect(
    () => ctx.on('plugin-manager/changed', () => toolbox.onManagerChanged()),
    'dark-toolbox.changed',
  )

  ctx.logger?.info('dark-toolbox ready: background installs + live install list')
}

class DarkToolbox {
  constructor(ctx) {
    this.ctx = ctx
    this.records = new Map()
    this.queue = []
    this.activeId = null
    this.clients = new Set()
    this.settling = new Set()
    this.disposed = false
    this.handle = this.handle.bind(this)
    this.heartbeat = setInterval(() => this.broadcastRaw(': ping\n\n'), HEARTBEAT_MS)
    this.heartbeat.unref?.()
  }

  // -------------------------------------------------------------------------
  // records
  // -------------------------------------------------------------------------

  createRecord(spec, { precheck = true, external = false } = {}) {
    const record = this.newRecord(spec, { precheck, external })
    this.records.set(record.id, record)
    this.pruneRecords()
    return record
  }

  newRecord(spec, { precheck = true, external = false } = {}) {
    return {
      id: `dark-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      spec: typeof spec === 'string' ? spec.trim() : '',
      name: '',
      version: '',
      phase: 'queued',
      attempt: null,
      startedAt: Date.now(),
      updatedAt: Date.now(),
      finishedAt: null,
      external,
      precheck,
      cancelRequested: false,
      approvedBuilds: [],
      pendingBuilds: [],
      notes: [],
      logs: [],
      logChars: 0,
      result: null,
    }
  }

  ensureRecord(id) {
    let record = this.records.get(id)
    if (record) return record
    record = this.newRecord('', { precheck: false, external: true })
    record.id = id
    record.phase = 'installing'
    this.records.set(id, record)
    this.pruneRecords()
    return record
  }

  pruneRecords() {
    const finished = [...this.records.values()]
      .filter((record) => FINAL_PHASES.has(record.phase))
      .sort((a, b) => (a.finishedAt ?? a.startedAt) - (b.finishedAt ?? b.startedAt))
    while (finished.length > MAX_FINISHED_RECORDS) {
      const oldest = finished.shift()
      this.records.delete(oldest.id)
    }
  }

  touch(record, { recordEvent = true } = {}) {
    record.updatedAt = Date.now()
    if (recordEvent) this.broadcast('record', this.publicRecord(record))
  }

  publicRecord(record) {
    return {
      id: record.id,
      spec: record.spec,
      name: record.name,
      version: record.version,
      phase: record.phase,
      attempt: record.attempt,
      startedAt: record.startedAt,
      updatedAt: record.updatedAt,
      finishedAt: record.finishedAt,
      external: record.external,
      pendingBuilds: record.pendingBuilds.length > 0 ? record.pendingBuilds : null,
      approvedBuilds: record.approvedBuilds.length > 0 ? record.approvedBuilds : null,
      notes: record.notes.slice(-3),
      result: record.result,
    }
  }

  snapshot() {
    const records = [...this.records.values()]
      .sort((a, b) => {
        const aActive = ACTIVE_PHASES.has(a.phase)
        const bActive = ACTIVE_PHASES.has(b.phase)
        if (aActive !== bActive) return aActive ? -1 : 1
        return b.startedAt - a.startedAt
      })
      .map((record) => ({
        ...this.publicRecord(record),
        logs: record.logs.slice(-MAX_LOG_ENTRIES),
      }))
    return { records, active: records.filter((record) => ACTIVE_PHASES.has(record.phase)).length }
  }

  // -------------------------------------------------------------------------
  // install lifecycle
  // -------------------------------------------------------------------------

  install(spec, options = {}) {
    if (typeof spec !== 'string' || spec.trim() === '') {
      throw Object.assign(new Error('a package spec is required'), { status: 400 })
    }
    const trimmed = spec.trim()
    if (trimmed.length > 500) {
      throw Object.assign(new Error('package spec is too long'), { status: 400 })
    }
    const record = this.createRecord(trimmed, { precheck: options.precheck !== false })
    this.queue.push(record.id)
    this.broadcast('record', this.publicRecord(record))
    this.pump()
    return record
  }

  pump() {
    if (this.disposed || this.activeId) return
    let id
    while (this.queue.length > 0) {
      id = this.queue.shift()
      const candidate = this.records.get(id)
      if (!candidate) continue
      if (FINAL_PHASES.has(candidate.phase)) continue
      break
    }
    if (!id) return
    const record = this.records.get(id)
    if (!record) return this.pump()
    this.activeId = id
    this.run(record)
      .catch((error) => {
        this.fail(record, { code: 'operation-error', diagnostic: errorMessage(error) })
      })
      .finally(() => {
        this.activeId = null
        if (!this.disposed) setTimeout(() => this.pump(), 0)
      })
  }

  async run(record) {
    if (record.cancelRequested) {
      this.settleCancelled(record)
      return
    }

    if (record.precheck) {
      record.phase = 'checking'
      this.touch(record)
      try {
        const inspection = await this.ctx.pluginManager.inspect(record.spec)
        if (inspection.status === 'refused') {
          this.fail(record, {
            code: inspection.problem || 'unknown',
            diagnostic: inspection.reason || 'the spec was refused',
          })
          return
        }
        if (inspection.bundle === false) {
          this.fail(record, {
            code: 'not-bundle',
            diagnostic: `${inspection.name || record.spec} does not declare a dsh.bundle patch`,
          })
          return
        }
        record.name = inspection.name || record.name
        record.version = inspection.version || record.version
        record.inspectKind = inspection.kind || null
        this.touch(record)
      } catch (error) {
        record.notes.push(`precheck skipped: ${errorMessage(error)}`)
      }
    }

    if (record.cancelRequested) {
      this.settleCancelled(record)
      return
    }

    record.phase = 'installing'
    record.attempt = null
    this.touch(record)

    const options = { requestId: record.id }
    if (record.approvedBuilds.length > 0) options.approvedBuilds = [...record.approvedBuilds]
    const result = await this.ctx.pluginManager.installBundle(record.spec, options)
    this.settle(record, result)
  }

  settle(record, result) {
    const pendingBuilds = Array.isArray(result?.pendingBuilds)
      ? result.pendingBuilds.filter((name) => typeof name === 'string')
      : []

    record.result = {
      application: result?.application ?? 'unknown',
      stage: result?.stage ?? null,
      target: result?.target ?? record.spec,
      bundle: result?.bundle ?? null,
      version: result?.version ?? null,
      restartReason: result?.restartReason ?? null,
      warnings: Array.isArray(result?.warnings) ? result.warnings.slice(0, 8) : [],
      error: result?.error ?? null,
    }
    record.pendingBuilds = pendingBuilds
    record.finishedAt = Date.now()
    record.attempt = null

    if (result?.version) record.version = result.version
    if (result?.bundle) record.name = record.name || result.bundle

    if (pendingBuilds.length > 0) record.phase = 'failed'
    else if (result?.application === 'cancelled') record.phase = 'cancelled'
    else if (result?.application === 'failed') record.phase = 'failed'
    else record.phase = 'done'

    this.touch(record)
    this.pruneRecords()
  }

  fail(record, error) {
    record.result = {
      application: 'failed',
      stage: null,
      target: record.spec,
      bundle: null,
      version: null,
      restartReason: null,
      warnings: [],
      error: { code: error?.code || 'operation-error', diagnostic: error?.diagnostic || '' },
    }
    record.phase = 'failed'
    record.finishedAt = Date.now()
    record.attempt = null
    this.touch(record)
    this.pruneRecords()
  }

  settleCancelled(record) {
    record.result = {
      application: 'cancelled',
      stage: null,
      target: record.spec,
      bundle: null,
      version: null,
      restartReason: null,
      warnings: [],
      error: null,
    }
    record.phase = 'cancelled'
    record.finishedAt = Date.now()
    record.attempt = null
    this.touch(record)
  }

  async cancel(id) {
    const record = this.records.get(id)
    if (!record) return { status: 'not-running' }
    if (FINAL_PHASES.has(record.phase)) return { status: 'not-running' }

    const queuedAt = this.queue.indexOf(id)
    if (queuedAt !== -1) {
      this.queue.splice(queuedAt, 1)
      this.settleCancelled(record)
      return { status: 'cancelled' }
    }

    record.cancelRequested = true
    record.phase = 'cancelling'
    this.touch(record)
    try {
      const outcome = await this.ctx.pluginManager.cancelInstall(id)
      if (outcome?.status === 'cancelled') return { status: 'cancelled' }
      if (outcome?.status === 'too-late') {
        record.notes.push('the bundle is already being applied; cancellation was too late')
        this.touch(record)
      }
      return { status: outcome?.status ?? 'unknown' }
    } catch (error) {
      record.notes.push(`cancel failed: ${errorMessage(error)}`)
      this.touch(record)
      throw error
    }
  }

  approve(id) {
    const record = this.records.get(id)
    if (!record) throw Object.assign(new Error('unknown install task'), { status: 404 })
    if (record.pendingBuilds.length === 0) {
      throw Object.assign(new Error('this task has no build scripts to approve'), { status: 400 })
    }
    record.approvedBuilds = [...record.pendingBuilds]
    record.pendingBuilds = []
    record.result = null
    record.phase = 'queued'
    record.finishedAt = null
    record.startedAt = Date.now()
    record.cancelRequested = false
    record.notes.push('retrying with the reported build scripts approved')
    this.queue.push(record.id)
    this.touch(record)
    this.pump()
    return record
  }

  dismiss(id) {
    const record = this.records.get(id)
    if (!record) return false
    if (!FINAL_PHASES.has(record.phase)) {
      throw Object.assign(new Error('the install task is still running'), { status: 409 })
    }
    this.records.delete(id)
    this.broadcast('snapshot', this.snapshot())
    return true
  }

  clearFinished() {
    let removed = 0
    for (const [id, record] of this.records) {
      if (!FINAL_PHASES.has(record.phase)) continue
      this.records.delete(id)
      removed += 1
    }
    if (removed > 0) this.broadcast('snapshot', this.snapshot())
    return removed
  }

  // -------------------------------------------------------------------------
  // manager events
  // -------------------------------------------------------------------------

  onInstallState(progress) {
    if (!progress || typeof progress.requestId !== 'string') return
    const record = this.ensureRecord(progress.requestId)
    if (progress.phase === 'applying') record.phase = 'applying'
    else if (progress.phase === 'cancelling') {
      record.phase = 'cancelling'
      record.cancelRequested = true
    } else record.phase = 'installing'
    if (progress.attempt) {
      record.attempt = {
        registry: progress.attempt.registry ?? null,
        index: progress.attempt.index,
        total: progress.attempt.total,
      }
    }
    this.touch(record)
  }

  onInstallLog(chunk) {
    if (!chunk) return
    const requestId = typeof chunk.requestId === 'string' ? chunk.requestId : ''
    if (!requestId) return
    const record = this.ensureRecord(requestId)

    if (!record.spec) {
      const spec = specFromArgv(chunk.argv)
      if (spec) record.spec = spec
    }

    const text = typeof chunk.text === 'string' ? chunk.text : ''
    if (text.length === 0) return
    const entry = {
      at: Date.now(),
      stream: chunk.stream === 'stderr' ? 'stderr' : 'stdout',
      text,
    }
    record.logs.push(entry)
    record.logChars += text.length
    while (record.logs.length > MAX_LOG_ENTRIES || record.logChars > MAX_LOG_CHARS) {
      const dropped = record.logs.shift()
      if (!dropped) break
      record.logChars -= dropped.text.length
    }
    record.updatedAt = Date.now()
    this.broadcast('log', { id: record.id, ...entry })
  }

  onManagerChanged() {
    for (const record of this.records.values()) {
      if (record.external && ACTIVE_PHASES.has(record.phase)) {
        void this.settleExternal(record)
      }
    }
  }

  async settleExternal(record) {
    if (this.settling.has(record.id)) return
    this.settling.add(record.id)
    try {
      const result = await this.ctx.pluginManager.waitForInstall(record.id)
      if (result) {
        this.settle(record, result)
        return
      }
    } catch {
      // fall through: the task is no longer active
    } finally {
      this.settling.delete(record.id)
    }
    if (!FINAL_PHASES.has(record.phase)) {
      record.result = {
        application: 'unknown',
        stage: null,
        target: record.spec,
        bundle: null,
        version: null,
        restartReason: null,
        warnings: [],
        error: null,
      }
      record.phase = 'ended'
      record.finishedAt = Date.now()
      record.attempt = null
      record.notes.push('the install finished outside this toolbox; the final result was not retained')
      this.touch(record)
      this.pruneRecords()
    }
  }

  // -------------------------------------------------------------------------
  // HTTP
  // -------------------------------------------------------------------------

  async handle(request, response) {
    try {
      const url = new URL(request.url || '/', 'http://dark-toolbox.local')
      if (request.method === 'GET' && url.searchParams.get('stream') === '1') {
        this.startStream(request, response)
        return
      }
      if (request.method === 'GET') {
        this.assertTrusted(request, false)
        this.sendJson(response, 200, { ok: true, ...this.snapshot() })
        return
      }
      if (request.method !== 'POST') {
        this.sendJson(response, 405, { ok: false, error: 'method not allowed' })
        return
      }
      this.assertTrusted(request, true)
      const body = await readJsonBody(request, MAX_BODY_BYTES)
      const action = typeof body.action === 'string' ? body.action : ''
      const result = await this.action(action, body)
      this.sendJson(response, 200, { ok: true, ...result })
    } catch (error) {
      const status = typeof error?.status === 'number' ? error.status : 400
      this.sendJson(response, status, { ok: false, error: errorMessage(error) })
    }
  }

  async action(action, body) {
    switch (action) {
      case 'install': {
        const record = this.install(body.spec, { precheck: body.precheck !== false })
        return { id: record.id, record: this.publicRecord(record) }
      }
      case 'cancel':
        return { status: await this.cancel(String(body.id || '')) }
      case 'approve': {
        const record = this.approve(String(body.id || ''))
        return { record: this.publicRecord(record) }
      }
      case 'dismiss':
        return { removed: this.dismiss(String(body.id || '')) }
      case 'clear':
        return { removed: this.clearFinished() }
      case 'status':
        return this.snapshot()
      default:
        throw Object.assign(new Error(`unknown action "${action}"`), { status: 400 })
    }
  }

  startStream(request, response) {
    this.assertTrusted(request, false)
    response.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    })
    response.flushHeaders?.()
    request.socket?.setNoDelay?.(true)
    request.socket?.setTimeout?.(0)
    response.write('retry: 3000\n\n')
    this.sendEvent(response, 'snapshot', this.snapshot())

    this.clients.add(response)
    const cleanup = () => {
      this.clients.delete(response)
    }
    request.on('close', cleanup)
    response.on('close', cleanup)
    response.on('error', cleanup)
  }

  assertTrusted(request, requireHeader) {
    if (requireHeader && request.headers['x-dark-toolbox'] !== '1') {
      throw Object.assign(new Error('missing x-dark-toolbox request header'), { status: 403 })
    }
    const origin = request.headers.origin
    if (!origin) return
    let parsed
    try {
      parsed = new URL(origin)
    } catch {
      throw Object.assign(new Error('malformed Origin header'), { status: 403 })
    }
    if (parsed.host !== request.headers.host) {
      throw Object.assign(new Error('cross-origin request refused'), { status: 403 })
    }
  }

  sendJson(response, status, value) {
    const body = `${JSON.stringify(value)}\n`
    response.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'content-length': Buffer.byteLength(body),
      'cache-control': 'no-store',
    })
    response.end(body)
  }

  sendEvent(response, event, data) {
    try {
      response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    } catch {
      this.clients.delete(response)
    }
  }

  broadcast(event, data) {
    for (const client of this.clients) this.sendEvent(client, event, data)
  }

  broadcastRaw(text) {
    for (const client of this.clients) {
      try {
        client.write(text)
      } catch {
        this.clients.delete(client)
      }
    }
  }

  dispose() {
    this.disposed = true
    clearInterval(this.heartbeat)
    this.queue = []
    for (const client of this.clients) {
      try {
        client.end()
      } catch {
        // the browser may be gone already
      }
    }
    this.clients.clear()
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function specFromArgv(argv) {
  if (!Array.isArray(argv)) return ''
  const at = argv.indexOf('add')
  if (at === -1) return ''
  for (let index = at + 1; index < argv.length; index += 1) {
    const token = argv[index]
    if (typeof token !== 'string' || token.length === 0) continue
    if (token.startsWith('-')) continue
    return token
  }
  return ''
}

function readJsonBody(request, limit) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    request.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        reject(Object.assign(new Error('request body is too large'), { status: 413 }))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8')
      if (!text.trim()) {
        resolve({})
        return
      }
      try {
        const value = JSON.parse(text)
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
          reject(Object.assign(new Error('body must be a JSON object'), { status: 400 }))
          return
        }
        resolve(value)
      } catch {
        reject(Object.assign(new Error('body must be valid JSON'), { status: 400 }))
      }
    })
    request.on('error', (error) => reject(error))
  })
}

function errorMessage(error) {
  if (error && typeof error === 'object' && typeof error.message === 'string') return error.message
  return String(error)
}

// Exported for the repository's local test harness only; not part of the plugin API.
export const __test = { DarkToolbox, specFromArgv }