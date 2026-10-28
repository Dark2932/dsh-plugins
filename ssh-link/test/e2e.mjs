/**
 * End-to-end check of the ssh-link host half against test/ssh-server.mjs.
 *
 * Usage: node test/e2e.mjs --port <port> --state <temp-dsh-home>
 * The state directory is disposable; the real profile is never touched.
 */
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
function arg(name, fallback) {
  const index = args.indexOf(name)
  return index === -1 ? fallback : args[index + 1]
}

const port = Number(arg('--port', '22999'))
const stateHome = path.resolve(arg('--state', fs.mkdtempSync(path.join(process.env.TEMP || '/tmp', 'ssh-link-state-'))))
fs.mkdirSync(stateHome, { recursive: true })
process.env.DSH_HOME = stateHome

const secrets = new Map()
const logs = []
const ctx = {
  logger: {
    info: (message) => logs.push(message),
    warn: (message) => logs.push(message),
  },
  credentials: {
    async set(ref, value) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(ref)) throw new Error(`bad credential ref ${ref}`)
      if (!value) throw new Error('empty credential')
      secrets.set(ref, String(value))
    },
    async resolve(ref) {
      return secrets.has(ref) ? { value: secrets.get(ref), source: 'test' } : undefined
    },
    async describe(ref) {
      return { configured: secrets.has(ref), writable: true }
    },
    async unset(ref) {
      secrets.delete(ref)
    },
  },
}

const { __test } = await import('../index.js')
const manager = new __test.SshManager(ctx)

try {
  const saved = await manager.upsert({
    name: 'fixture',
    host: '127.0.0.1',
    port,
    user: 'tester',
    auth: 'password',
    password: 'testpass',
    remoteCwd: '',
  })
  assert.equal(saved.connected, false)
  assert.equal(saved.hasPassword, true)
  assert.ok(saved.hostFingerprint === '', 'fingerprint is pinned only after connect')

  const connected = await manager.connect('fixture')
  assert.equal(connected.connected, true)
  assert.ok(connected.hostFingerprint.length > 0, 'host key pinned after connect')
  console.log('ok connect + host key pinning')

  const echo = await manager.exec('fixture', 'echo hello')
  assert.equal(echo.code, 0)
  assert.match(echo.stdout, /hello/)
  assert.match(manager.formatExec(echo), /hello/)
  console.log('ok ssh_exec')

  const readme = await manager.read('fixture', 'README.md')
  assert.match(readme, /<path>\/home\/tester\/README\.md<\/path>/)
  assert.match(readme, /1: # Fixture/)
  assert.match(readme, /End of file/)
  console.log('ok ssh_read')

  const offsetRead = await manager.read('fixture', 'README.md', { offset: 3, limit: 1 })
  assert.match(offsetRead, /3: A remote test file\./)
  assert.match(offsetRead, /Showing lines 3-3 of 4/)
  console.log('ok ssh_read offset/limit')

  await manager.write('fixture', 'src/new.txt', 'hello\nworld\n')
  const created = await manager.read('fixture', 'src/new.txt')
  assert.match(created, /2: world/)
  console.log('ok ssh_write + parent directory')

  await manager.edit('fixture', 'src/a.ts', 'needle', 'pin')
  const edited = await manager.read('fixture', 'src/a.ts')
  assert.match(edited, /pin/)
  assert.doesNotMatch(edited, /needle/)
  await assert.rejects(manager.edit('fixture', 'src/a.ts', 'same', 'x'), /not found/)
  await assert.rejects(manager.edit('fixture', 'multi.txt', 'same', 'x'), /appears 2 times/)
  await manager.edit('fixture', 'multi.txt', 'same', 'changed', { replaceAll: true })
  console.log('ok ssh_edit + uniqueness errors')

  await manager.write('fixture', 'unicode.txt', '你好，世界\n第二行\n')
  const unicode = await manager.read('fixture', 'unicode.txt')
  assert.match(unicode, /1: 你好，世界/)
  assert.match(unicode, /2: 第二行/)
  await manager.write('fixture', 'no-newline.txt', 'last line')
  const noNewline = await manager.read('fixture', 'no-newline.txt')
  assert.match(noNewline, /1: last line/)
  assert.match(noNewline, /total 1 lines/)
  await manager.write('fixture', 'crlf.txt', 'a\r\nb\r\n')
  const crlf = await manager.read('fixture', 'crlf.txt')
  assert.doesNotMatch(crlf, /\r/)
  assert.match(crlf, /2: b/)
  console.log('ok unicode + CRLF + file without trailing newline')

  await manager.upsert({
    name: 'cwd-fixture',
    host: '127.0.0.1',
    port,
    user: 'tester',
    auth: 'password',
    password: 'testpass',
    remoteCwd: '~/src',
  })
  await manager.connect('cwd-fixture')
  const cwdRead = await manager.read('cwd-fixture', 'a.ts')
  assert.match(cwdRead, /<path>\/home\/tester\/src\/a\.ts<\/path>/)
  const cwdPwd = await manager.exec('cwd-fixture', 'pwd')
  assert.match(cwdPwd.stdout, /\/home\/tester\/src/)
  await manager.remove('cwd-fixture')
  console.log('ok remoteCwd with ~ expansion')

  const found = await manager.glob('fixture', '**/*.ts')
  assert.match(found, /src\/a\.ts/)
  assert.doesNotMatch(found, /README\.md/)
  console.log('ok ssh_glob')

  const matches = await manager.grep('fixture', 'alpha')
  assert.match(matches, /src\/a\.ts:1:/)
  console.log('ok ssh_grep')

  await assert.rejects(manager.read('fixture', 'missing.txt'), /not found/)
  const failed = await manager.exec('fixture', 'stat /missing')
  assert.equal(failed.code, 1)
  assert.match(manager.formatExec(failed), /exit code: 1/)
  console.log('ok remote failure reporting')

  // Key authentication, including an encrypted private key.
  const keyFile = path.join(stateHome, 'id_rsa_test')
  const { privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs1', format: 'pem', cipher: 'aes-256-cbc', passphrase: 'keypass' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  })
  fs.writeFileSync(keyFile, privateKey, { mode: 0o600 })
  await manager.upsert({
    name: 'key-fixture',
    host: '127.0.0.1',
    port,
    user: 'tester',
    auth: 'key',
    keyPath: keyFile,
    passphrase: 'keypass',
  })
  await manager.connect('key-fixture')
  const keyEcho = await manager.exec('key-fixture', 'echo key-auth-ok')
  assert.match(keyEcho.stdout, /key-auth-ok/)
  await manager.disconnect('key-fixture')
  await manager.remove('key-fixture')
  console.log('ok private key auth with passphrase')

  // Host key mismatch: a second manager reading the same state, with a tampered pin.
  const stateFile = path.join(stateHome, 'ssh-link', 'connections.json')
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
  state.connections[0].hostFingerprint = 'deadbeef'
  fs.writeFileSync(stateFile, JSON.stringify(state))
  await manager.disconnect('fixture')
  const second = new __test.SshManager(ctx)
  await assert.rejects(second.connect('fixture'), /host key verification failed/)
  await second.connect('fixture', { allowHostKeyChange: true })
  assert.notEqual(second.profileOf('fixture').hostFingerprint, 'deadbeef')
  await second.dispose()
  console.log('ok host key change refusal + explicit override')

  // Restore the real fingerprint and verify auto-reconnect through a tool path.
  const third = new __test.SshManager(ctx)
  const execAfterReconnect = await third.exec('fixture', 'pwd')
  assert.equal(execAfterReconnect.code, 0)
  await third.dispose()
  console.log('ok reconnect on demand')

  await manager.dispose()
  await manager.remove('fixture')
  assert.equal(manager.store.connections.length, 0)
  assert.equal([...secrets.keys()].length, 0, 'removing a connection clears its stored secrets')
  console.log('ok disconnect + remove + credential cleanup')
  console.log('ALL E2E CHECKS PASSED')
} finally {
  await manager.dispose().catch(() => {})
}