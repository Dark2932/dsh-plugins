/**
 * Minimal, disposable SSH/SFTP server used only to exercise the ssh-link
 * plugin end to end without a real remote machine.
 *
 * It exposes a temporary directory as /home/tester, accepts one password
 * account, implements the SFTP operations the plugin uses (open/read/write/
 * close/stat/readdir/mkdir/rename/remove/realpath), and emulates the small
 * POSIX command subset the plugin sends (cd, find, grep, echo, pwd, cat).
 *
 * Usage: node test/ssh-server.mjs [--port 0] [--root <dir>]
 * Prints:  SSH_SERVER_READY <port> <root>
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { Server, utils } = require('ssh2')

const args = process.argv.slice(2)
function arg(name, fallback) {
  const index = args.indexOf(name)
  return index === -1 ? fallback : args[index + 1]
}

const PORT = Number(arg('--port', process.env.PORT || 0)) || 0
const USER = 'tester'
const PASSWORD = 'testpass'
const HOME = '/home/tester'
const ROOT = path.resolve(arg('--root', fs.mkdtempSync(path.join(os.tmpdir(), 'ssh-link-test-'))))
fs.mkdirSync(ROOT, { recursive: true })

// A deterministic fixture tree.
fs.mkdirSync(path.join(ROOT, 'src'), { recursive: true })
fs.writeFileSync(path.join(ROOT, 'src', 'a.ts'), 'export const alpha = 1\n// needle\nexport const beta = alpha + 1\n')
fs.writeFileSync(path.join(ROOT, 'src', 'b.js'), 'console.log("needle")\n')
fs.writeFileSync(path.join(ROOT, 'README.md'), '# Fixture\n\nA remote test file.\nOne more line.\n')
fs.writeFileSync(path.join(ROOT, 'multi.txt'), 'same\nsame\n')

const { privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
})

const STATUS = utils.sftp.STATUS_CODE
const OPEN_MODE = utils.sftp.OPEN_MODE

function fail(message) {
  console.error(`[test-ssh] ${message}`)
  process.exit(1)
}

function toLocal(remote) {
  let value = String(remote).replaceAll('\\', '/')
  if (value === HOME) value = '/'
  else if (value.startsWith(`${HOME}/`)) value = value.slice(HOME.length)
  if (!value.startsWith('/')) value = `/${value}`
  const local = path.resolve(ROOT, `.${value}`)
  if (local !== ROOT && !local.startsWith(ROOT + path.sep)) throw new Error(`path escapes root: ${remote}`)
  return local
}

function toRemote(local) {
  const relative = path.relative(ROOT, local).split(path.sep).join('/')
  return relative ? `${HOME}/${relative}` : HOME
}

function attrsOf(local) {
  const stat = fs.statSync(local)
  return {
    mode: stat.mode,
    size: stat.size,
    uid: 0,
    gid: 0,
    atime: Math.floor(stat.atimeMs / 1000),
    mtime: Math.floor(stat.mtimeMs / 1000),
  }
}

function listLocal(local) {
  return fs.readdirSync(local, { withFileTypes: true }).map((entry) => {
    const child = path.join(local, entry.name)
    return { filename: toRemote(child), longname: entry.name, attrs: attrsOf(child) }
  })
}

function parseCd(command) {
  let restCommand = command
  let cwd = null
  while (true) {
    const match = /^cd -- '((?:[^']|'\\'')*)' && ([\s\S]*)$/.exec(restCommand)
    if (!match) break
    cwd = match[1].replaceAll(`'\\''`, `'`)
    restCommand = match[2]
  }
  return { cwd, rest: restCommand }
}

function shellUnquote(value) {
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1).replaceAll(`'\\''`, `'`)
  return value
}

function runGrep(cwd, command) {
  let include = ''
  const includeMatch = /--include='([^']*)'/.exec(command)
  if (includeMatch) include = includeMatch[1]
  const patternMatch = / -e '((?:[^']|'\\'')*)' -- '([^']*)'$/.exec(command)
  if (!patternMatch) return { code: 2, stdout: '', stderr: 'bad grep arguments\n' }
  const pattern = patternMatch[1].replaceAll(`'\\''`, `'`)
  const target = patternMatch[2]
  let regexp
  try {
    regexp = new RegExp(pattern)
  } catch (error) {
    return { code: 2, stdout: '', stderr: `grep: ${error.message}\n` }
  }
  const targetLocal = toLocal(target)
  const files = []
  const walk = (local) => {
    const stat = fs.statSync(local)
    if (stat.isFile()) files.push(local)
    else if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(local, { withFileTypes: true })) {
        if (entry.name === '.git') continue
        const child = path.join(local, entry.name)
        if (entry.isDirectory()) walk(child)
        else if (entry.isFile()) files.push(child)
      }
    }
  }
  if (!fs.existsSync(targetLocal)) return { code: 2, stdout: '', stderr: `grep: ${target}: No such file or directory\n` }
  walk(targetLocal)
  const lines = []
  for (const file of files) {
    if (include) {
      const suffix = include.replace(/^\*/, '')
      if (!file.endsWith(suffix)) continue
    }
    const text = fs.readFileSync(file, 'utf8')
    text.split(/\r?\n/).forEach((line, index) => {
      if (regexp.test(line)) lines.push(`${toRemote(file)}:${index + 1}:${line}`)
    })
  }
  return { code: lines.length > 0 ? 0 : 1, stdout: lines.join('\n') + (lines.length ? '\n' : ''), stderr: '' }
}

function runCommand(raw) {
  const { cwd, rest } = parseCd(raw)
  const workingLocal = cwd ? toLocal(cwd) : toLocal(HOME)
  if (cwd && !fs.existsSync(workingLocal)) return { code: 1, stdout: '', stderr: `cd: ${cwd}: No such file or directory\n` }
  const command = rest.trim()
  if (command.startsWith('find . -type f -print')) {
    const out = []
    const walk = (local, relative) => {
      for (const entry of fs.readdirSync(local, { withFileTypes: true })) {
        const child = path.join(local, entry.name)
        const childRelative = relative ? `${relative}/${entry.name}` : entry.name
        if (entry.isDirectory()) walk(child, childRelative)
        else if (entry.isFile()) out.push(`./${childRelative}`)
      }
    }
    if (!fs.existsSync(workingLocal)) return { code: 1, stdout: '', stderr: 'find: no such directory\n' }
    walk(workingLocal, '')
    return { code: 0, stdout: out.sort().join('\n') + (out.length ? '\n' : ''), stderr: '' }
  }
  if (command.startsWith('command -v ')) {
    const name = shellUnquote(command.slice('command -v '.length).split(' ')[0])
    return name === 'grep' ? { code: 0, stdout: '/usr/bin/grep\n', stderr: '' } : { code: 1, stdout: '', stderr: '' }
  }
  if (command.startsWith('grep ')) return runGrep(workingLocal, command)
  if (command === 'pwd') return { code: 0, stdout: `${cwd || HOME}\n`, stderr: '' }
  if (command.startsWith('echo ')) return { code: 0, stdout: `${shellUnquote(command.slice(5))}\n`, stderr: '' }
  if (command.startsWith('printf ')) return { code: 0, stdout: shellUnquote(command.slice(7)), stderr: '' }
  if (command.startsWith('cat ')) {
    const target = shellUnquote(command.slice(4).trim())
    try {
      return { code: 0, stdout: fs.readFileSync(toLocal(path.isAbsolute(target) ? target : `${cwd || HOME}/${target}`), 'utf8'), stderr: '' }
    } catch {
      return { code: 1, stdout: '', stderr: `cat: ${target}: No such file\n` }
    }
  }
  if (command.startsWith('stat ')) {
    const target = shellUnquote(command.slice(5).trim())
    try {
      return { code: 0, stdout: `${JSON.stringify(attrsOf(toLocal(target)))}\n`, stderr: '' }
    } catch {
      return { code: 1, stdout: '', stderr: 'stat: no such file\n' }
    }
  }
  return { code: 127, stdout: '', stderr: `test-server: unsupported command: ${command}\n` }
}

const server = new Server({ hostKeys: [privateKey] }, (client) => {
  client.on('error', (error) => {
    console.error(`[test-ssh] client error: ${error.message}`)
  })
  client.on('authentication', (auth) => {
    // Test-only fixture: accept the password account and any public key.
    // A real host verifies the key and its signature.
    if (auth.method === 'password' && auth.username === USER && auth.password === PASSWORD) auth.accept()
    else if (auth.method === 'publickey' && auth.username === USER) auth.accept()
    else if (auth.method === 'none') auth.reject(['publickey', 'password'])
    else auth.reject(['publickey', 'password'])
  })
  client.on('ready', () => {
    client.on('session', (accept) => {
      const session = accept()
      session.on('exec', (acceptExec, _reject, info) => {
        const stream = acceptExec()
        let result
        try {
          result = runCommand(info.command)
        } catch (error) {
          result = { code: 1, stdout: '', stderr: `${error.message}\n` }
        }
        if (result.stderr) stream.stderr.write(result.stderr)
        if (result.stdout) stream.write(result.stdout)
        stream.exit(result.code)
        stream.end()
      })
      session.on('sftp', (acceptSftp) => {
        const sftp = acceptSftp()
        const files = new Map()
        const dirs = new Map()
        let nextHandle = 1

        sftp.on('OPEN', (reqid, filename, flags) => {
          let local
          try {
            local = toLocal(filename)
          } catch {
            return sftp.status(reqid, STATUS.PERMISSION_DENIED)
          }
          const wantsWrite = (flags & OPEN_MODE.WRITE) !== 0
          const truncate = (flags & OPEN_MODE.TRUNC) !== 0
          if (!fs.existsSync(local) && (flags & OPEN_MODE.CREAT) === 0) return sftp.status(reqid, STATUS.NO_SUCH_FILE)
          let buffer = Buffer.alloc(0)
          if (fs.existsSync(local) && fs.statSync(local).isFile() && !truncate) buffer = fs.readFileSync(local)
          const handle = `file:${nextHandle++}`
          files.set(handle, { local, buffer, dirty: false, writable: wantsWrite })
          sftp.handle(reqid, Buffer.from(handle))
        })

        sftp.on('READ', (reqid, rawHandle, offset, length) => {
          const entry = files.get(rawHandle.toString())
          if (!entry) return sftp.status(reqid, STATUS.FAILURE)
          if (offset >= entry.buffer.length) return sftp.status(reqid, STATUS.EOF)
          sftp.data(reqid, entry.buffer.subarray(offset, Math.min(entry.buffer.length, offset + length)))
        })

        sftp.on('WRITE', (reqid, rawHandle, offset, data) => {
          const entry = files.get(rawHandle.toString())
          if (!entry || !entry.writable) return sftp.status(reqid, STATUS.PERMISSION_DENIED)
          const end = offset + data.length
          if (end > entry.buffer.length) {
            const next = Buffer.alloc(end)
            entry.buffer.copy(next, 0)
            entry.buffer = next
          }
          data.copy(entry.buffer, offset)
          entry.dirty = true
          sftp.status(reqid, STATUS.OK)
        })

        sftp.on('CLOSE', (reqid, rawHandle) => {
          const key = rawHandle.toString()
          const entry = files.get(key)
          if (entry) {
            if (entry.dirty) {
              fs.mkdirSync(path.dirname(entry.local), { recursive: true })
              fs.writeFileSync(entry.local, entry.buffer)
            }
            files.delete(key)
          }
          dirs.delete(key)
          sftp.status(reqid, STATUS.OK)
        })

        sftp.on('FSTAT', (reqid, rawHandle) => {
          const entry = files.get(rawHandle.toString())
          if (!entry) return sftp.status(reqid, STATUS.FAILURE)
          try {
            sftp.attrs(reqid, attrsOf(entry.local))
          } catch {
            sftp.attrs(reqid, { mode: 0o100644, size: entry.buffer.length, uid: 0, gid: 0, atime: 0, mtime: Math.floor(Date.now() / 1000) })
          }
        })

        sftp.on('STAT', (reqid, filename) => {
          try {
            sftp.attrs(reqid, attrsOf(toLocal(filename)))
          } catch {
            sftp.status(reqid, STATUS.NO_SUCH_FILE)
          }
        })

        sftp.on('LSTAT', (reqid, filename) => {
          try {
            sftp.attrs(reqid, attrsOf(toLocal(filename)))
          } catch {
            sftp.status(reqid, STATUS.NO_SUCH_FILE)
          }
        })

        sftp.on('OPENDIR', (reqid, filename) => {
          let local
          try {
            local = toLocal(filename)
            if (!fs.statSync(local).isDirectory()) throw new Error('not a directory')
          } catch {
            return sftp.status(reqid, STATUS.NO_SUCH_FILE)
          }
          const handle = `dir:${nextHandle++}`
          dirs.set(handle, { local, sent: false })
          sftp.handle(reqid, Buffer.from(handle))
        })

        sftp.on('READDIR', (reqid, rawHandle) => {
          const entry = dirs.get(rawHandle.toString())
          if (!entry) return sftp.status(reqid, STATUS.FAILURE)
          if (entry.sent) return sftp.status(reqid, STATUS.EOF)
          entry.sent = true
          sftp.name(reqid, listLocal(entry.local))
        })

        sftp.on('REALPATH', (reqid, filename) => {
          let local
          try {
            local = toLocal(filename)
          } catch {
            return sftp.status(reqid, STATUS.NO_SUCH_FILE)
          }
          if (!fs.existsSync(local)) return sftp.status(reqid, STATUS.NO_SUCH_FILE)
          const remote = toRemote(local)
          sftp.name(reqid, [{ filename: remote, longname: remote, attrs: attrsOf(local) }])
        })

        sftp.on('MKDIR', (reqid, filename) => {
          try {
            fs.mkdirSync(toLocal(filename))
            sftp.status(reqid, STATUS.OK)
          } catch {
            sftp.status(reqid, STATUS.FAILURE)
          }
        })

        sftp.on('RENAME', (reqid, from, to) => {
          try {
            fs.renameSync(toLocal(from), toLocal(to))
            sftp.status(reqid, STATUS.OK)
          } catch {
            sftp.status(reqid, STATUS.FAILURE)
          }
        })

        sftp.on('REMOVE', (reqid, filename) => {
          try {
            fs.unlinkSync(toLocal(filename))
            sftp.status(reqid, STATUS.OK)
          } catch {
            sftp.status(reqid, STATUS.NO_SUCH_FILE)
          }
        })

        sftp.on('RMDIR', (reqid, filename) => {
          try {
            fs.rmdirSync(toLocal(filename))
            sftp.status(reqid, STATUS.OK)
          } catch {
            sftp.status(reqid, STATUS.FAILURE)
          }
        })
      })
    })
  })
})

server.on('error', fail)
server.listen(PORT, '127.0.0.1', () => {
  console.log(`SSH_SERVER_READY ${server.address().port} ${ROOT}`)
})

process.on('SIGTERM', () => server.close(() => process.exit(0)))
process.on('SIGINT', () => server.close(() => process.exit(0)))