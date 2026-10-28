/**
 * ssh-link — SSH connections for DeepSeek Harness.
 *
 * Host half: a small connection manager on top of `ssh2`, a credential-backed
 * profile store, model-facing tools that run commands and edit files on the
 * remote host, and one loopback JSON route used by the Settings panel.
 *
 * The remote side is assumed to be POSIX (Linux/macOS) with a POSIX login
 * shell, sftp-server, find, grep and (optionally) ripgrep.
 */
import { createRequire } from 'node:module'
import { StringDecoder } from 'node:string_decoder'
import { promises as fsp } from 'node:fs'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { posix as posixPath } from 'node:path'

const require = createRequire(import.meta.url)
const { Client } = require('ssh2')

export const name = 'ssh-link'
export const inject = ['tools', 'webServer', 'systemPrompt', 'credentials']

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const STATE_FILE = path.join(HOME, 'ssh-link', 'connections.json')
const API_PATH = '/ssh-link/api'

const MAX_EXEC_OUTPUT = 200_000
const MAX_READ_OUTPUT = 50 * 1024
const MAX_READ_SCAN = 20 * 1024 * 1024
const MAX_FILE_BYTES = 8 * 1024 * 1024
const MAX_GLOB_FILES = 200
const MAX_GREP_LINES = 200
const MAX_LINE_LENGTH = 2000
const DEFAULT_READ_LINES = 2000
const DEFAULT_EXEC_TIMEOUT = 120_000

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------

function errorMessage(error) {
  if (error instanceof Error) return error.message
  return String(error)
}

/** Human-readable connection failure with the most useful hint attached. */
function connectionError(error, profile) {
  const message = errorMessage(error)
  const where = `${profile.user}@${profile.host}:${profile.port}`
  if (/Host denied \(verification failed\)/i.test(message)) {
    return new Error(
      `host key verification failed for ${where}. If this host is new or was rebuilt, reconnect with allowHostKeyChange=true.`,
    )
  }
  if (/All configured authentication methods failed/i.test(message)) {
    return new Error(`SSH authentication failed for ${where}: check the user, password/key and passphrase.`)
  }
  if (/Timed out while waiting for handshake/i.test(message)) {
    return new Error(`SSH handshake with ${where} timed out after 20s.`)
  }
  const code = error?.code || error?.errno
  if (code === 'ECONNREFUSED') return new Error(`connection refused by ${where}`)
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return new Error(`cannot resolve host "${profile.host}"`)
  if (code === 'EHOSTUNREACH' || code === 'ENETUNREACH') return new Error(`host ${profile.host} is unreachable`)
  return new Error(`SSH connection to ${where} failed: ${message}`)
}

function expandHome(input) {
  let value = String(input || '').trim()
  if (value === '~') return os.homedir()
  if (value.startsWith('~/') || value.startsWith('~\\')) value = path.join(os.homedir(), value.slice(2))
  return value
}

/** POSIX single-quote a value for a remote shell. */
function shQuote(value) {
  return `'${String(value).replaceAll("'", `'\\''`)}'`
}

function clampInt(value, fallback, min, max) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(number)))
}

/** ssh2 hands back the SHA-256 digest as hex; present it like OpenSSH does. */
function canonicalHostFingerprint(hash) {
  const value = String(hash || '')
  if (!/^[0-9a-f]{64}$/i.test(value)) return value
  return `SHA256:${Buffer.from(value, 'hex').toString('base64').replace(/=+$/, '')}`
}

function formatProfile(profile) {
  const flags = []
  if (profile.connected) flags.push('connected')
  if (profile.hasPassword) flags.push('password stored')
  if (profile.keyPath) flags.push(`key ${profile.keyPath}`)
  if (profile.hostFingerprint) flags.push('host key pinned')
  const cwd = profile.remoteCwd || '(home)'
  return `- ${profile.name} [${profile.id}] ${profile.user}@${profile.host}:${profile.port} — ${flags.join(', ') || 'offline'}; cwd ${cwd}`
}

/** Glob to RegExp: `**`, `*`, `?`, `{a,b}` and character classes. */
function globToRegExp(pattern) {
  let out = '^'
  let braceDepth = 0
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index]
    if (char === '*') {
      if (pattern[index + 1] === '*') {
        index += 1
        if (pattern[index + 1] === '/') {
          index += 1
          out += '(?:.*/)?'
        } else out += '.*'
      } else out += '[^/]*'
      continue
    }
    if (char === '?') { out += '[^/]'; continue }
    if (char === '{') { braceDepth += 1; out += '(?:'; continue }
    if (char === '}' && braceDepth > 0) { braceDepth -= 1; out += ')'; continue }
    if (char === ',' && braceDepth > 0) { out += '|'; continue }
    if (char === '[') {
      let end = index + 1
      if (pattern[end] === '!' || pattern[end] === '^') end += 1
      if (pattern[end] === ']') end += 1
      while (end < pattern.length && pattern[end] !== ']') end += 1
      if (end < pattern.length) {
        let body = pattern.slice(index + 1, end)
        if (body.startsWith('!')) body = `^${body.slice(1)}`
        out += `[${body}]`
        index = end
        continue
      }
    }
    out += char.replace(/[.+^$()|\\]/g, '\\$&')
  }
  out += '$'
  try {
    return new RegExp(out)
  } catch {
    return new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)
  }
}

function matchesGlob(pattern, value) {
  const regexp = globToRegExp(pattern)
  if (regexp.test(value)) return true
  if (!pattern.includes('/')) return regexp.test(posixPath.basename(value))
  return false
}

// ---------------------------------------------------------------------------
// durable profile store
// ---------------------------------------------------------------------------

class ProfileStore {
  constructor(file) {
    this.file = file
    this.data = { version: 1, defaultId: null, connections: [] }
    this.load()
  }

  load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'))
      if (parsed && Array.isArray(parsed.connections)) {
        this.data = {
          version: 1,
          defaultId: typeof parsed.defaultId === 'string' ? parsed.defaultId : null,
          connections: parsed.connections.filter((item) => item && typeof item.id === 'string'),
        }
      }
    } catch {
      // missing or malformed: start empty, the next save rewrites it
    }
  }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 })
    const temporary = `${this.file}.${process.pid}.tmp`
    fs.writeFileSync(temporary, `${JSON.stringify(this.data, null, 2)}\n`, { mode: 0o600 })
    fs.renameSync(temporary, this.file)
  }

  get connections() {
    return this.data.connections
  }

  set connections(value) {
    this.data.connections = value
  }

  get defaultId() {
    return this.data.defaultId
  }

  set defaultId(value) {
    this.data.defaultId = value
  }
}

// ---------------------------------------------------------------------------
// SSH manager
// ---------------------------------------------------------------------------

class SshManager {
  constructor(ctx) {
    this.ctx = ctx
    this.store = new ProfileStore(STATE_FILE)
    /** @type {Map<string, {client: any, sftp?: any, sftpPromise?: Promise<any>, homeDir?: string}>} */
    this.live = new Map()
    /** @type {Map<string, Promise<any>>} */
    this.pending = new Map()
    /** @type {Map<string, boolean>} */
    this.rgAvailable = new Map()
  }

  // -- profile bookkeeping --------------------------------------------------

  profileOf(reference) {
    if (reference && typeof reference === 'string') {
      const exact = this.store.connections.find((item) => item.id === reference || item.name === reference)
      if (exact) return exact
      const lower = reference.toLowerCase()
      return this.store.connections.find((item) => item.name.toLowerCase() === lower)
    }
    if (this.store.defaultId) {
      const preferred = this.store.connections.find((item) => item.id === this.store.defaultId)
      if (preferred) return preferred
    }
    return this.store.connections.length === 1 ? this.store.connections[0] : undefined
  }

  requireProfile(reference) {
    const profile = this.profileOf(reference)
    if (profile) return profile
    const known = this.store.connections.map((item) => `${item.name} [${item.id}]`).join(', ') || '(none saved)'
    throw new Error(
      reference
        ? `no SSH connection matches "${reference}"; saved connections: ${known}`
        : `no active SSH connection; save one in Settings → SSH 连接 or call ssh_connection with action "add", then connect. Connections: ${known}`,
    )
  }

  secretRef(profile, kind) {
    return kind === 'password' ? profile.passwordRef : profile.passphraseRef
  }

  async setSecret(profile, kind, value) {
    const field = kind === 'password' ? 'passwordRef' : 'passphraseRef'
    if (value === null || value === undefined || value === '') {
      if (profile[field]) {
        try {
          await this.ctx.credentials.unset(profile[field])
        } catch {
          // a missing credential is already the desired state
        }
      }
      profile[field] = null
      return
    }
    const ref = profile[field] || `SSH_LINK_${profile.id.toUpperCase().replace(/[^A-Z0-9_]/g, '_')}_${kind.toUpperCase()}`
    await this.ctx.credentials.set(ref, String(value))
    profile[field] = ref
  }

  async secret(profile, kind) {
    const ref = this.secretRef(profile, kind)
    if (!ref) return undefined
    const hit = await this.ctx.credentials.resolve(ref)
    return hit?.value
  }

  async hasSecret(profile, kind) {
    const ref = this.secretRef(profile, kind)
    if (!ref) return false
    try {
      const info = await this.ctx.credentials.describe(ref)
      return info?.configured === true
    } catch {
      return false
    }
  }

  sanitize(profile) {
    return {
      id: profile.id,
      name: profile.name,
      host: profile.host,
      port: profile.port,
      user: profile.user,
      auth: profile.auth,
      keyPath: profile.keyPath || '',
      remoteCwd: profile.remoteCwd || '',
      hostFingerprint: profile.hostFingerprint || '',
      connected: this.live.has(profile.id),
      hasPassword: Boolean(profile.passwordRef),
      hasPassphrase: Boolean(profile.passphraseRef),
      createdAt: profile.createdAt,
    }
  }

  async describeAll() {
    return {
      connections: await Promise.all(
        this.store.connections.map(async (profile) => {
          const view = this.sanitize(profile)
          view.hasPassword = await this.hasSecret(profile, 'password')
          view.hasPassphrase = await this.hasSecret(profile, 'passphrase')
          return view
        }),
      ),
      defaultId: this.store.defaultId,
    }
  }

  async upsert(input = {}) {
    const requestedId = typeof input.id === 'string' ? input.id : undefined
    let profile = requestedId ? this.store.connections.find((item) => item.id === requestedId) : undefined
    if (!profile && input.createOnly !== true && typeof input.name === 'string' && input.name) {
      profile = this.store.connections.find((item) => item.name === input.name)
    }
    const creating = profile === undefined
    if (creating && input.requireExisting === true) {
      throw new Error(`no saved SSH connection matches "${requestedId || input.name || ''}"; use action "add" to create it`)
    }
    if (creating) {
      profile = {
        id: `ssh-${Math.random().toString(36).slice(2, 8)}`,
        name: '',
        host: '',
        port: 22,
        user: '',
        auth: 'password',
        keyPath: '',
        remoteCwd: '',
        hostFingerprint: '',
        createdAt: new Date().toISOString(),
      }
    }

    const next = { ...profile }
    if (typeof input.host === 'string') next.host = input.host.trim()
    if (typeof input.user === 'string') next.user = input.user.trim()
    if (input.port !== undefined) next.port = clampInt(input.port, 22, 1, 65535)
    if (typeof input.name === 'string' && input.name.trim()) next.name = input.name.trim()
    if (typeof input.auth === 'string') {
      if (input.auth !== 'password' && input.auth !== 'key') throw new Error('auth must be "password" or "key"')
      next.auth = input.auth
    }
    if (typeof input.keyPath === 'string') next.keyPath = input.keyPath.trim()
    if (typeof input.remoteCwd === 'string') next.remoteCwd = input.remoteCwd.trim()
    if (input.resetHostKey === true) next.hostFingerprint = ''
    if (!next.name) next.name = `${next.user || 'user'}@${next.host || 'host'}`
    if (!next.host) throw new Error('host is required')
    if (!next.user) throw new Error('user is required')
    if (next.auth === 'key' && !next.keyPath) throw new Error('keyPath is required when auth is "key"')

    // Keep names unique so `connect <name>` stays unambiguous.
    const duplicate = this.store.connections.find((item) => item.id !== next.id && item.name === next.name)
    if (duplicate) {
      let suffix = 2
      while (this.store.connections.some((item) => item.id !== next.id && item.name === `${next.name} (${suffix})`)) {
        suffix += 1
      }
      next.name = `${next.name} (${suffix})`
    }

    if (input.password !== undefined) await this.setSecret(next, 'password', input.password)
    else if (input.clearPassword === true) await this.setSecret(next, 'password', null)
    if (input.passphrase !== undefined) await this.setSecret(next, 'passphrase', input.passphrase)
    else if (input.clearPassphrase === true) await this.setSecret(next, 'passphrase', null)

    if (next.auth === 'password' && !next.passwordRef) {
      throw new Error('this connection uses password auth but no password is stored; pass password when saving it')
    }

    // Any change to an open connection must reconnect with the new settings.
    if (!creating && this.live.has(next.id)) await this.disconnect(next.id)

    if (creating) this.store.connections.push(next)
    else this.store.connections = this.store.connections.map((item) => (item.id === next.id ? next : item))
    if (!this.store.defaultId || this.store.defaultId === next.id) this.store.defaultId = next.id
    this.store.save()
    return this.sanitize(next)
  }

  async remove(reference) {
    const profile = this.requireProfile(reference)
    await this.disconnect(profile.id)
    await this.setSecret(profile, 'password', null)
    await this.setSecret(profile, 'passphrase', null)
    this.store.connections = this.store.connections.filter((item) => item.id !== profile.id)
    if (this.store.defaultId === profile.id) this.store.defaultId = this.store.connections[0]?.id ?? null
    this.store.save()
    return this.sanitize(profile)
  }

  async setDefault(reference) {
    const profile = this.requireProfile(reference)
    this.store.defaultId = profile.id
    this.store.save()
    return this.sanitize(profile)
  }

  // -- connection lifecycle -------------------------------------------------

  isConnected(reference) {
    const profile = this.profileOf(reference)
    return profile ? this.live.has(profile.id) : false
  }

  async connect(reference, options = {}) {
    const profile = this.requireProfile(reference ?? options.id ?? options.name)
    const activate = () => {
      if (this.store.defaultId !== profile.id) {
        this.store.defaultId = profile.id
        this.store.save()
      }
    }
    if (this.live.has(profile.id)) {
      activate()
      return this.sanitize(profile)
    }
    const pending = this.pending.get(profile.id)
    if (pending) {
      await pending
      activate()
      return this.sanitize(profile)
    }
    const promise = this.openConnection(profile, options)
    this.pending.set(profile.id, promise)
    try {
      await promise
    } finally {
      this.pending.delete(profile.id)
    }
    activate()
    return this.sanitize(profile)
  }

  async openConnection(profile, options = {}) {
    const client = new Client()
    let observedFingerprint = ''
    let observedHash = ''
    // Keyboard-interactive servers reuse the stored password as the answer.
    const password = await this.secret(profile, 'password')
    const auth = {
      host: profile.host,
      port: profile.port,
      username: profile.user,
      readyTimeout: 20_000,
      keepaliveInterval: 15_000,
      keepaliveCountMax: 3,
      hostHash: 'sha256',
      tryKeyboard: true,
      hostVerifier: (hash) => {
        observedHash = String(hash)
        observedFingerprint = canonicalHostFingerprint(hash)
        if (!profile.hostFingerprint) return true
        return profile.hostFingerprint === observedFingerprint
          || profile.hostFingerprint === observedHash
          || options.allowHostKeyChange === true
      },
    }
    if (profile.auth === 'password') {
      if (!password) throw new Error(`no password stored for "${profile.name}"; save the password again`)
      auth.password = password
    } else {
      const keyFile = expandHome(profile.keyPath)
      try {
        auth.privateKey = await fsp.readFile(keyFile)
      } catch (error) {
        throw new Error(`cannot read private key "${keyFile}": ${errorMessage(error)}`)
      }
      const passphrase = await this.secret(profile, 'passphrase')
      if (passphrase) auth.passphrase = passphrase
    }

    try {
      await new Promise((resolve, reject) => {
        let settled = false
        const finish = (error) => {
          if (settled) return
          settled = true
          if (error) reject(error)
          else resolve(undefined)
        }
        client.once('ready', () => finish())
        client.once('error', (error) => finish(error))
        client.on('keyboard-interactive', (_name, _instructions, _language, prompts, done) => {
          try {
            done(prompts.map(() => password ?? ''))
          } catch {
            // the server closed the keyboard-interactive exchange
          }
        })
        client.on('close', () => {
          if (!settled) finish(new Error('SSH connection closed before it became ready'))
          this.live.delete(profile.id)
        })
        try {
          client.connect(auth)
        } catch (error) {
          finish(error)
        }
      })
    } catch (error) {
      try {
        client.end()
      } catch {
        // already closed
      }
      throw connectionError(error, profile)
    }

    const entry = { client, homeDir: undefined }
    client.on('error', (error) => {
      this.ctx.logger?.warn(`[ssh-link] connection ${profile.name} error: ${errorMessage(error)}`)
    })
    client.on('close', () => {
      this.live.delete(profile.id)
      this.rgAvailable.delete(profile.id)
    })
    this.live.set(profile.id, entry)

    if (observedFingerprint && observedFingerprint !== profile.hostFingerprint) {
      profile.hostFingerprint = observedFingerprint
      this.store.save()
    }
    // Resolve the remote home once so relative paths and the default cwd work.
    try {
      const sftp = await this.getSftp(entry)
      entry.homeDir = await this.realpath(sftp, '.')
    } catch (error) {
      await this.disconnect(profile.id)
      throw new Error(`connected to ${profile.user}@${profile.host}, but SFTP is unavailable: ${errorMessage(error)}`)
    }
  }

  async disconnect(reference) {
    const profile = this.profileOf(reference)
    if (!profile) return
    const entry = this.live.get(profile.id)
    if (!entry) return
    this.live.delete(profile.id)
    try {
      entry.sftp?.end()
    } catch {
      // ignore
    }
    try {
      entry.client.end()
    } catch {
      // already closed
    }
  }

  async dispose() {
    await Promise.all([...this.live.keys()].map((id) => this.disconnect(id)))
  }

  async requireEntry(reference) {
    const profile = this.requireProfile(reference)
    if (!this.live.has(profile.id)) await this.connect(profile.id)
    const entry = this.live.get(profile.id)
    if (!entry) throw new Error(`SSH connection "${profile.name}" is not open`)
    return { profile, entry }
  }

  // -- SFTP primitives ------------------------------------------------------

  async getSftp(entry) {
    if (entry.sftp) return entry.sftp
    if (!entry.sftpPromise) {
      entry.sftpPromise = new Promise((resolve, reject) => {
        entry.client.sftp((error, sftp) => {
          if (error) reject(error)
          else {
            entry.sftp = sftp
            sftp.on('close', () => {
              entry.sftp = undefined
              entry.sftpPromise = undefined
            })
            resolve(sftp)
          }
        })
      })
    }
    return entry.sftpPromise
  }

  sftpCall(sftp, method, ...args) {
    return new Promise((resolve, reject) => {
      sftp[method](...args, (error, value) => (error ? reject(error) : resolve(value)))
    })
  }

  async realpath(sftp, remotePath) {
    try {
      return await this.sftpCall(sftp, 'realpath', remotePath)
    } catch {
      return remotePath.startsWith('/') ? remotePath : '/'
    }
  }

  remoteBase(profile, entry) {
    const home = entry.homeDir || '/'
    let base = profile.remoteCwd || home
    if (base === '~') base = home
    else if (base.startsWith('~/')) base = posixPath.join(home, base.slice(2))
    if (!base.startsWith('/')) base = posixPath.join(home, base)
    return posixPath.normalize(base)
  }

  async resolveRemotePath(profile, entry, input) {
    const value = String(input || '.')
    if (value === '~') return entry.homeDir || '/'
    if (value.startsWith('~/')) return posixPath.join(entry.homeDir || '/', value.slice(2))
    if (value.startsWith('/')) return posixPath.normalize(value)
    return posixPath.normalize(posixPath.join(this.remoteBase(profile, entry), value))
  }

  async ensureRemoteDir(sftp, directory) {
    const parts = posixPath.normalize(directory).split('/').filter(Boolean)
    let current = directory.startsWith('/') ? '/' : ''
    for (const part of parts) {
      current = current === '/' ? `/${part}` : current ? `${current}/${part}` : part
      try {
        await this.sftpCall(sftp, 'mkdir', current)
      } catch {
        try {
          const stat = await this.sftpCall(sftp, 'stat', current)
          if (!stat.isDirectory()) throw new Error(`remote path "${current}" is not a directory`)
        } catch (error) {
          throw new Error(`cannot create remote directory "${current}": ${errorMessage(error)}`)
        }
      }
    }
  }

  // -- command execution ----------------------------------------------------

  async exec(reference, command, options = {}) {
    const text = String(command ?? '')
    if (!text.trim()) throw new Error('command is required')
    const { profile, entry } = await this.requireEntry(reference)
    const cwd = options.cwd
      ? await this.resolveRemotePath(profile, entry, options.cwd)
      : profile.remoteCwd
        ? await this.resolveRemotePath(profile, entry, profile.remoteCwd)
        : entry.homeDir
    const full = cwd ? `cd -- ${shQuote(cwd)} && ${text}` : text
    const timeoutMs = clampInt(options.timeoutMs, DEFAULT_EXEC_TIMEOUT, 1_000, 3_600_000)
    const signal = options.signal

    return await new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(new Error('tool call aborted'))
      let stdout = ''
      let stderr = ''
      const stdoutDecoder = new StringDecoder('utf8')
      const stderrDecoder = new StringDecoder('utf8')
      let truncated = false
      let timedOut = false
      let settled = false
      let timer
      const cleanup = () => {
        clearTimeout(timer)
        signal?.removeEventListener?.('abort', onAbort)
      }
      const settle = (error, value) => {
        if (settled) return
        settled = true
        cleanup()
        if (error) reject(error)
        else resolve({ ...value, command: text, host: `${profile.user}@${profile.host}`, truncated })
      }
      const append = (current, chunk) => {
        const next = current + chunk
        if (next.length > MAX_EXEC_OUTPUT) {
          truncated = true
          return next.slice(0, MAX_EXEC_OUTPUT)
        }
        return next
      }
      const onAbort = () => {
        try {
          stream.signal?.('KILL')
        } catch {
          // ignore
        }
        try {
          stream.close()
        } catch {
          // ignore
        }
        settle(new Error('tool call aborted'))
      }
      let stream
      const onClose = (code, sig) => {
        stdout = append(stdout, stdoutDecoder.end())
        stderr = append(stderr, stderrDecoder.end())
        settle(undefined, { stdout, stderr, code: code ?? null, signal: sig ?? null, timedOut })
      }
      try {
        entry.client.exec(full, {}, (error, nextStream) => {
          if (error) return settle(error)
          stream = nextStream
          stream.on('data', (chunk) => { stdout = append(stdout, stdoutDecoder.write(chunk)) })
          stream.stderr.on('data', (chunk) => { stderr = append(stderr, stderrDecoder.write(chunk)) })
          stream.on('close', onClose)
          stream.on('error', (streamError) => settle(streamError))
          signal?.addEventListener?.('abort', onAbort, { once: true })
          timer = setTimeout(() => {
            timedOut = true
            try {
              stream.signal?.('KILL')
            } catch {
              // ignore
            }
            try {
              stream.close()
            } catch {
              // ignore
            }
            settle(undefined, { stdout, stderr, code: null, signal: 'TIMEOUT', timedOut: true })
          }, timeoutMs)
        })
      } catch (error) {
        settle(error)
      }
    })
  }

  formatExec(result) {
    const parts = [`${result.host}$ ${result.command}`]
    if (result.stdout) parts.push(result.stdout.replace(/\s+$/, ''))
    if (result.stderr) parts.push(`--- stderr ---\n${result.stderr.replace(/\s+$/, '')}`)
    if (!result.stdout && !result.stderr) parts.push('(no output)')
    if (result.truncated) parts.push(`(output truncated at ${MAX_EXEC_OUTPUT} characters)`)
    if (result.timedOut) parts.push('(command timed out on the remote host)')
    else if (result.signal && result.signal !== 'TIMEOUT') parts.push(`(terminated by signal ${result.signal})`)
    else if (typeof result.code === 'number' && result.code !== 0) parts.push(`exit code: ${result.code}`)
    return parts.join('\n\n')
  }

  // -- file primitives ------------------------------------------------------

  async read(reference, filePath, options = {}) {
    const { profile, entry } = await this.requireEntry(reference)
    const remotePath = await this.resolveRemotePath(profile, entry, filePath)
    const sftp = await this.getSftp(entry)
    const offset = clampInt(options.offset, 1, 1, 1_000_000_000)
    const limit = clampInt(options.limit, DEFAULT_READ_LINES, 1, 100_000)
    const lines = []
    let currentLine = ''
    let lineNumber = 0
    let totalLines = 0
    let outputBytes = 0
    let scannedBytes = 0
    let truncatedByBytes = false
    let scanLimited = false
    const consume = () => {
      lineNumber += 1
      totalLines = lineNumber
      if (truncatedByBytes || lineNumber < offset || lines.length >= limit) {
        currentLine = ''
        return
      }
      const raw = currentLine.endsWith('\r') ? currentLine.slice(0, -1) : currentLine
      const value = raw.length > MAX_LINE_LENGTH
        ? `${raw.slice(0, MAX_LINE_LENGTH)}... (line truncated to ${MAX_LINE_LENGTH} chars)`
        : raw
      const bytes = Buffer.byteLength(value, 'utf8') + (lines.length > 0 ? 1 : 0)
      if (outputBytes + bytes > MAX_READ_OUTPUT) {
        truncatedByBytes = true
      } else {
        outputBytes += bytes
        lines.push({ number: lineNumber, text: value })
      }
      currentLine = ''
    }

    let stream
    const decoder = new StringDecoder('utf8')
    try {
      stream = sftp.createReadStream(remotePath)
    } catch (error) {
      throw new Error(`cannot read "${remotePath}": ${errorMessage(error)}`)
    }
    try {
      for await (const chunk of stream) {
        if (options.signal?.aborted) throw new Error('tool call aborted')
        scannedBytes += chunk.length
        if (scannedBytes > MAX_READ_SCAN) {
          scanLimited = true
          break
        }
        const text = decoder.write(chunk)
        let start = 0
        let newline = text.indexOf('\n', start)
        while (newline !== -1) {
          const segment = text.slice(start, newline)
          currentLine += segment
          consume()
          start = newline + 1
          newline = text.indexOf('\n', start)
        }
        const rest = text.slice(start)
        if (rest) currentLine += rest
      }
    } catch (error) {
      if (error?.code === 2 || /No such file/i.test(errorMessage(error))) {
        throw new Error(`cannot read "${remotePath}": not found`)
      }
      throw new Error(`cannot read "${remotePath}": ${errorMessage(error)}`)
    } finally {
      try {
        stream.destroy()
      } catch {
        // ignore
      }
    }
    if (!scanLimited) currentLine += decoder.end()
    if (currentLine.length > 0) consume()
    if (offset > totalLines && !(totalLines === 0 && offset === 1)) {
      throw new Error(`offset ${offset} is out of range for "${remotePath}" (${totalLines} lines)`)
    }

    const endLine = lines.at(-1)?.number ?? Math.max(0, offset - 1)
    let footer
    if (scanLimited) footer = `(Output capped: scanned the first ${MAX_READ_SCAN} bytes of ${remotePath}.)`
    else if (truncatedByBytes) footer = `(Output capped. Showing lines ${offset}-${endLine}. Use offset=${endLine + 1} to continue.)`
    else if (endLine < totalLines) footer = `(Showing lines ${offset}-${endLine} of ${totalLines}. Use offset=${endLine + 1} to continue.)`
    else footer = `(End of file - total ${totalLines} lines)`
    const body = lines.length > 0 ? `${lines.map((line) => `${line.number}: ${line.text}`).join('\n')}\n\n${footer}` : footer
    return `<path>${remotePath}</path>\n<type>file</type>\n<content>\n${body}\n</content>`
  }

  async write(reference, filePath, content, options = {}) {
    const { profile, entry } = await this.requireEntry(reference)
    const text = String(content ?? '')
    if (text.length > MAX_FILE_BYTES) throw new Error(`content is too large (${text.length} bytes; limit ${MAX_FILE_BYTES})`)
    const remotePath = await this.resolveRemotePath(profile, entry, filePath)
    const sftp = await this.getSftp(entry)
    const parent = posixPath.dirname(remotePath)
    if (parent && parent !== '.' && parent !== '/') await this.ensureRemoteDir(sftp, parent)
    try {
      await this.sftpCall(sftp, 'writeFile', remotePath, Buffer.from(text, 'utf8'))
    } catch (error) {
      throw new Error(`cannot write "${remotePath}": ${errorMessage(error)}`)
    }
    return `Wrote ${Buffer.byteLength(text, 'utf8')} bytes to ${remotePath} on ${profile.user}@${profile.host}.`
  }

  async edit(reference, filePath, oldString, newString, options = {}) {
    const { profile, entry } = await this.requireEntry(reference)
    if (!oldString) throw new Error('old_string must be a non-empty string')
    if (oldString === newString) throw new Error('old_string and new_string must differ')
    const remotePath = await this.resolveRemotePath(profile, entry, filePath)
    const sftp = await this.getSftp(entry)
    let buffer
    try {
      const stat = await this.sftpCall(sftp, 'stat', remotePath)
      if (stat.size > MAX_FILE_BYTES) throw new Error(`file is too large (${stat.size} bytes; limit ${MAX_FILE_BYTES})`)
      buffer = await this.sftpCall(sftp, 'readFile', remotePath)
    } catch (error) {
      throw new Error(`cannot read "${remotePath}": ${errorMessage(error)}`)
    }
    if (buffer.includes(0)) throw new Error(`"${remotePath}" looks binary; refusing to edit it as text`)
    const text = buffer.toString('utf8')
    const count = text.split(oldString).length - 1
    if (count === 0) throw new Error(`old_string was not found in "${remotePath}"`)
    if (count > 1 && options.replaceAll !== true) {
      throw new Error(`old_string appears ${count} times in "${remotePath}"; pass replace_all=true or include more context`)
    }
    const next = options.replaceAll === true
      ? text.split(oldString).join(newString)
      : `${text.slice(0, text.indexOf(oldString))}${newString}${text.slice(text.indexOf(oldString) + oldString.length)}`
    try {
      await this.sftpCall(sftp, 'writeFile', remotePath, Buffer.from(next, 'utf8'))
    } catch (error) {
      throw new Error(`cannot write "${remotePath}": ${errorMessage(error)}`)
    }
    return `Updated ${remotePath} on ${profile.user}@${profile.host} (${count} replacement${count === 1 ? '' : 's'}).`
  }

  async glob(reference, pattern, searchPath) {
    if (!pattern) throw new Error('pattern is required')
    const { profile, entry } = await this.requireEntry(reference)
    const root = await this.resolveRemotePath(profile, entry, searchPath || '.')
    const result = await this.exec(profile.id, `cd -- ${shQuote(root)} && find . -type f -print`, {
      timeoutMs: 60_000,
      cwd: undefined,
    })
    if (result.code !== 0) throw new Error(`remote find failed: ${result.stderr || result.stdout || 'unknown error'}`)
    const all = result.stdout.split('\n').filter(Boolean).map((line) => line.replace(/^\.\//, ''))
    const matched = all.filter((file) => matchesGlob(pattern, file)).sort()
    const shown = matched.slice(0, MAX_GLOB_FILES)
    const header = `Found ${matched.length} file${matched.length === 1 ? '' : 's'} matching ${pattern} under ${root} on ${profile.user}@${profile.host}.`
    const lines = [header, ...shown.map((file) => posixPath.join(root, file))]
    if (matched.length > shown.length) lines.push(`(Showing the first ${MAX_GLOB_FILES}; narrow the pattern or path.)`)
    if (result.truncated) lines.push('(Remote find output was truncated; results may be incomplete.)')
    return lines.join('\n')
  }

  async commandExists(reference, command) {
    const result = await this.exec(reference, `command -v ${shQuote(command)} >/dev/null 2>&1`, { timeoutMs: 15_000 })
    return result.code === 0
  }

  async grep(reference, pattern, searchPath, include) {
    if (!pattern) throw new Error('pattern is required')
    const { profile, entry } = await this.requireEntry(reference)
    const target = await this.resolveRemotePath(profile, entry, searchPath || '.')
    if (!this.rgAvailable.has(profile.id)) {
      this.rgAvailable.set(profile.id, await this.commandExists(profile.id, 'rg'))
    }
    let command
    if (this.rgAvailable.get(profile.id)) {
      command = `rg --line-number --no-heading --color never --max-count ${MAX_GREP_LINES}`
      if (include) command += ` --glob ${shQuote(include)}`
      command += ` -e ${shQuote(pattern)} -- ${shQuote(target)}`
    } else {
      command = `grep -rnI --color=never --exclude-dir=.git`
      if (include) command += ` --include=${shQuote(include)}`
      command += ` -e ${shQuote(pattern)} -- ${shQuote(target)}`
    }
    const result = await this.exec(profile.id, command, { timeoutMs: 120_000, cwd: undefined })
    if (result.code === 1) return `No matches for ${pattern} under ${target} on ${profile.user}@${profile.host}.`
    if (result.code !== 0) throw new Error(`remote search failed: ${result.stderr || result.stdout || 'unknown error'}`)
    const lines = result.stdout.replace(/\s+$/, '').split('\n')
    const shown = lines.slice(0, MAX_GREP_LINES)
    if (result.truncated || shown.length < lines.length) {
      shown.push(`(Output capped at ${MAX_GREP_LINES} matches; narrow the search.)`)
    }
    return shown.join('\n')
  }
}

// ---------------------------------------------------------------------------
// tool definitions (raw definitions: this package has no dsh-tools dependency)
// ---------------------------------------------------------------------------

function textTool(options) {
  const required = options.required ?? []
  return {
    name: options.name,
    description: options.description,
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: options.properties,
      ...(required.length > 0 ? { required } : {}),
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args, exec) {
      const input = args && typeof args === 'object' && !Array.isArray(args) ? args : {}
      for (const key of required) {
        if (input[key] === undefined || input[key] === null || input[key] === '') {
          throw new Error(`${key} is required`)
        }
      }
      for (const [key, spec] of Object.entries(options.properties)) {
        const value = input[key]
        if (value === undefined || value === null) continue
        if (spec?.type === 'string' && typeof value !== 'string') throw new Error(`${key} must be a string`)
        if (spec?.type === 'number' && typeof value !== 'number') throw new Error(`${key} must be a number`)
        if (spec?.type === 'boolean' && typeof value !== 'boolean') throw new Error(`${key} must be a boolean`)
        if (spec?.enum && !spec.enum.includes(value)) throw new Error(`${key} must be one of ${spec.enum.join(', ')}`)
      }
      return await options.run(input, exec)
    },
  }
}

function buildTools(manager) {
  const connectionProperty = {
    type: 'string',
    description: 'Saved connection name or id. Omit to use the active/default connection.',
  }

  return [
    textTool({
      name: 'ssh_connection',
      description:
        'Manage saved SSH targets for remote work. Actions: list (default) shows saved connections and which is connected; ' +
        'add creates one; update changes an existing one by id or name; remove deletes it; ' +
        'connect opens a connection and makes it active; disconnect closes it; default selects the active target.',
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'status', 'add', 'update', 'remove', 'connect', 'disconnect', 'default'],
          description: 'Operation to perform; defaults to list.',
        },
        id: { type: 'string', description: 'Connection id for update/remove/connect/disconnect/default.' },
        name: { type: 'string', description: 'Connection name; may identify a target instead of id.' },
        host: { type: 'string', description: 'Remote host name or IP address.' },
        port: { type: 'number', description: 'SSH port (default 22).' },
        user: { type: 'string', description: 'Remote login user.' },
        auth: { type: 'string', enum: ['password', 'key'], description: 'Authentication method.' },
        keyPath: { type: 'string', description: 'Local path to a private key file when auth is "key".' },
        password: { type: 'string', description: 'Password to store in the DSH credential store. Visible in session logs; prefer Settings → SSH 连接.' },
        clearPassword: { type: 'boolean', description: 'Forget the stored password.' },
        passphrase: { type: 'string', description: 'Private-key passphrase to store in the DSH credential store. Visible in session logs; prefer Settings → SSH 连接.' },
        clearPassphrase: { type: 'boolean', description: 'Forget the stored key passphrase.' },
        remoteCwd: { type: 'string', description: 'Remote working directory for relative paths (default: home).' },
        allowHostKeyChange: { type: 'boolean', description: 'Accept a changed host key when connecting; only after confirming the server was rebuilt.' },
        resetHostKey: { type: 'boolean', description: 'Forget the pinned host key when updating a target.' },
      },
      async run(input) {
        const action = input.action || 'list'
        switch (action) {
          case 'list':
          case 'status': {
            const state = await manager.describeAll()
            const lines = state.connections.length > 0
              ? state.connections.map((item) => `${item.id === state.defaultId ? '*' : ' '} ${formatProfile(item)}`)
              : ['(no saved SSH connections)']
            return `SSH connections (${state.connections.length}):\n${lines.join('\n')}\n\n* = active connection`
          }
          case 'add':
          case 'update': {
            const profile = await manager.upsert({
              ...input,
              ...(action === 'add'
                ? { id: undefined, createOnly: true, requireExisting: false }
                : { createOnly: false, requireExisting: true }),
            })
            return `${action === 'add' ? 'Saved' : 'Updated'} SSH connection "${profile.name}" [${profile.id}] → ${profile.user}@${profile.host}:${profile.port}`
          }
          case 'remove': {
            const profile = await manager.remove(input.id || input.name)
            return `Removed SSH connection "${profile.name}" [${profile.id}].`
          }
          case 'connect': {
            const profile = await manager.connect(input.id || input.name, {
              allowHostKeyChange: input.allowHostKeyChange === true,
            })
            return `Connected to "${profile.name}" (${profile.user}@${profile.host}:${profile.port}). Remote tools now default to this target.`
          }
          case 'disconnect': {
            const profile = manager.requireProfile(input.id || input.name)
            await manager.disconnect(profile.id)
            return `Disconnected "${profile.name}".`
          }
          case 'default': {
            const profile = await manager.setDefault(input.id || input.name)
            return `"${profile.name}" is now the active SSH target.`
          }
          default:
            throw new Error(`unknown action "${action}"`)
        }
      },
    }),

    textTool({
      name: 'ssh_exec',
      description:
        'Run a command on the remote SSH host (POSIX shell). Returns stdout, stderr, and the exit code.',
      required: ['command'],
      properties: {
        command: { type: 'string', description: 'Shell command to run on the remote host.' },
        connection: connectionProperty,
        cwd: { type: 'string', description: 'Remote directory to run in; default is the connection working directory.' },
        timeoutMs: { type: 'number', description: 'Timeout in milliseconds (default 120000, max 3600000).' },
      },
      async run(input, exec) {
        const result = await manager.exec(input.connection, input.command, {
          cwd: input.cwd,
          timeoutMs: input.timeoutMs,
          signal: exec?.signal,
        })
        return manager.formatExec(result)
      },
    }),

    textTool({
      name: 'ssh_read',
      description:
        'Read a text file on the remote SSH host. Returns line-numbered content and a footer explaining how to continue when the result is capped.',
      required: ['path'],
      properties: {
        path: { type: 'string', description: 'Remote file path (absolute, ~/..., or relative to the connection working directory).' },
        offset: { type: 'number', description: '1-based first line to return (default 1).' },
        limit: { type: 'number', description: 'Maximum lines to return (default 2000).' },
        connection: connectionProperty,
      },
      async run(input, exec) {
        return await manager.read(input.connection, input.path, {
          offset: input.offset,
          limit: input.limit,
          signal: exec?.signal,
        })
      },
    }),

    textTool({
      name: 'ssh_write',
      description:
        'Create or fully replace a UTF-8 text file on the remote SSH host. Parent directories are created as needed.',
      required: ['path', 'content'],
      properties: {
        path: { type: 'string', description: 'Remote file path; absolute, ~/..., or relative to the connection working directory.' },
        content: { type: 'string', description: 'Full UTF-8 content to write.' },
        connection: connectionProperty,
      },
      async run(input) {
        return await manager.write(input.connection, input.path, input.content)
      },
    }),

    textTool({
      name: 'ssh_edit',
      description:
        'Replace a literal string in a remote text file. By default old_string must appear exactly once.',
      required: ['path', 'old_string', 'new_string'],
      properties: {
        path: { type: 'string', description: 'Remote file path; absolute, ~/..., or relative to the connection working directory.' },
        old_string: { type: 'string', description: 'Literal text to replace.' },
        new_string: { type: 'string', description: 'Replacement text; empty deletes the match.' },
        replace_all: { type: 'boolean', description: 'Replace every occurrence (default false).' },
        connection: connectionProperty,
      },
      async run(input) {
        return await manager.edit(input.connection, input.path, input.old_string, input.new_string, {
          replaceAll: input.replace_all === true,
        })
      },
    }),

    textTool({
      name: 'ssh_glob',
      description:
        'Find files on the remote SSH host by glob pattern (supports **, *, ?, {a,b}, [abc]). Returns absolute remote paths.',
      required: ['pattern'],
      properties: {
        pattern: { type: 'string', description: 'Glob pattern, e.g. "**/*.ts" or "src/*.js".' },
        path: { type: 'string', description: 'Remote directory to search; absolute, ~/..., or relative to the connection working directory.' },
        connection: connectionProperty,
      },
      async run(input) {
        return await manager.glob(input.connection, input.pattern, input.path)
      },
    }),

    textTool({
      name: 'ssh_grep',
      description:
        'Search remote file contents with a regular expression. Returns file:line: text matches.',
      required: ['pattern'],
      properties: {
        pattern: { type: 'string', description: 'Regular expression to search for.' },
        path: { type: 'string', description: 'Remote file or directory to search; absolute, ~/..., or relative to the connection working directory.' },
        include: { type: 'string', description: 'Only search files matching this glob, e.g. "*.ts".' },
        connection: connectionProperty,
      },
      async run(input) {
        return await manager.grep(input.connection, input.pattern, input.path, input.include)
      },
    }),
  ]
}

// ---------------------------------------------------------------------------
// HTTP bridge for the Settings panel
// ---------------------------------------------------------------------------

const MAX_BODY_BYTES = 1_000_000

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('request body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8')
      if (!text.trim()) return resolve({})
      try {
        const value = JSON.parse(text)
        if (!value || typeof value !== 'object' || Array.isArray(value)) return reject(new Error('body must be a JSON object'))
        resolve(value)
      } catch {
        reject(new Error('body must be valid JSON'))
      }
    })
    req.on('error', reject)
  })
}

function sendJson(response, status, value) {
  const body = `${JSON.stringify(value)}\n`
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  })
  response.end(body)
}

function assertTrustedBrowserRequest(ctx, request) {
  if (request.headers['x-ssh-link'] !== '1') {
    throw Object.assign(new Error('missing x-ssh-link request header'), { status: 403 })
  }
  const origin = request.headers.origin
  if (origin) {
    let parsed
    try {
      parsed = new URL(origin)
    } catch {
      throw Object.assign(new Error('malformed Origin header'), { status: 403 })
    }
    if (parsed.host !== request.headers.host) {
      throw Object.assign(new Error('cross-origin request refused'), { status: 403 })
    }
    if (parsed.protocol !== ctx.webServer.protocol) {
      throw Object.assign(new Error('origin protocol mismatch'), { status: 403 })
    }
  }
}

function createApiHandler(ctx, manager) {
  const api = async (action, body) => {
    switch (action) {
      case 'status':
        return await manager.describeAll()
      case 'save': {
        const input = body.profile ?? body
        return { profile: await manager.upsert({ ...input, createOnly: !input.id }) }
      }
      case 'remove':
        return { profile: await manager.remove(body.id || body.name) }
      case 'connect':
        return { profile: await manager.connect(body.id || body.name, { allowHostKeyChange: body.allowHostKeyChange === true }) }
      case 'disconnect': {
        const profile = manager.requireProfile(body.id || body.name)
        await manager.disconnect(profile.id)
        return { profile: manager.sanitize(profile) }
      }
      case 'default':
        return { profile: await manager.setDefault(body.id || body.name) }
      case 'exec': {
        const result = await manager.exec(body.id || body.name, body.command, {
          cwd: body.cwd,
          timeoutMs: body.timeoutMs,
        })
        return { output: manager.formatExec(result), code: result.code, timedOut: result.timedOut }
      }
      default:
        throw new Error(`unknown action "${action}"`)
    }
  }

  return async (request, response) => {
    try {
      if (request.method === 'GET') {
        sendJson(response, 200, { ok: true, ...(await api('status', {})) })
        return
      }
      if (request.method !== 'POST') {
        sendJson(response, 405, { ok: false, error: 'method not allowed' })
        return
      }
      assertTrustedBrowserRequest(ctx, request)
      const body = await readJsonBody(request)
      const action = typeof body.action === 'string' ? body.action : 'status'
      const result = await api(action, body)
      sendJson(response, 200, { ok: true, ...result })
    } catch (error) {
      const status = error?.status === 403 ? 403 : 200
      sendJson(response, status, { ok: false, error: errorMessage(error) })
    }
  }
}

// ---------------------------------------------------------------------------
// plugin entry
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `## SSH remote targets

This deployment can operate on remote servers over SSH through the \`ssh_*\` tools. When the user asks to inspect, run, or modify something on a remote host:

1. Call \`ssh_connection\` with action \`list\` to see saved targets, then \`connect\` (by name or id) to open one. The same list is in Settings → SSH 连接.
2. Use \`ssh_exec\`, \`ssh_read\`, \`ssh_write\`, \`ssh_edit\`, \`ssh_glob\`, and \`ssh_grep\` for remote work. Local \`read\`, \`write\`, \`edit\`, \`glob\`, \`grep\`, and shell tools act on the machine running DSH; do not use them for remote paths.
3. Paths resolve on the remote host: relative paths use the connection's working directory; \`~\` and absolute paths work. Each tool accepts an optional \`connection\` name or id and defaults to the active target, opening it on demand.
4. Prefer \`ssh_glob\`/\`ssh_grep\` to locate remote files before reading. A non-zero exit code is a command failure, not a successful edit.`

export function apply(ctx) {
  const manager = new SshManager(ctx)
  const tools = buildTools(manager)

  ctx.effect(() => () => manager.dispose(), 'ssh-link.dispose')
  ctx.effect(() => {
    const disposers = []
    for (const definition of tools) disposers.push(ctx.tools.register(definition))
    disposers.push(ctx.systemPrompt.section({
      name: 'ssh-link:remote-targets',
      order: 120,
      text: SYSTEM_PROMPT,
    }))
    return () => {
      for (const dispose of disposers.reverse()) {
        try {
          dispose()
        } catch {
          // the owning context may already be gone
        }
      }
    }
  }, 'ssh-link.tools')
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: API_PATH,
    handler: createApiHandler(ctx, manager),
  }), 'ssh-link.http')

  ctx.logger?.info(`ssh-link ready: ${manager.store.connections.length} saved SSH connection(s)`)
}

// Exported for the repository's test harness only; not part of the plugin API.
export const __test = { SshManager, globToRegExp, shQuote, ProfileStore }