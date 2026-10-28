import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import http from 'node:http'
import { isBuiltin } from 'node:module'
import net from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import AdmZip from 'adm-zip'
import {
  WEB_BRIDGE_ENTRY,
  WEB_BRIDGE_NOTICES,
} from '../../../../../../../lib/plugins/aws/dev/attach/naming.js'

const {
  OPTIONAL_MODULES,
  buildWebBridge,
  bundleWebBridge,
  bundledPackages,
  thirdPartyNotices,
  zipBundle,
} = await import('../../../../../../../scripts/build-dev-web-bridge.mjs')

const freePort = () =>
  new Promise((resolve) => {
    const server = net.createServer()
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })

const get = (port) =>
  new Promise((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port, path: '/' }, (response) => {
        response.resume()
        response.on('end', () => resolve(response.statusCode))
      })
      .on('error', reject)
  })

// The dev revision runs the zip alone on Node.js: the bundle must hold everything it imports.
describe('the web bridge build', () => {
  let dir
  let bundle

  beforeAll(async () => {
    // Outside the repository, so the bundle cannot find this repository's node_modules.
    dir = await mkdtemp(path.join(tmpdir(), 'sls-dev-web-bridge-'))
    bundle = await bundleWebBridge()
  }, 60_000)

  afterAll(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  test('leaves nothing for the runtime to resolve but Node builtins and the optional helpers of ws', () => {
    const [output] = Object.values(bundle.metafile.outputs)
    const unresolved = output.imports.filter(
      ({ external, path: name }) =>
        external && !isBuiltin(name) && !OPTIONAL_MODULES.includes(name),
    )
    expect(unresolved).toEqual([])
  })

  test('zips the bundle and its third-party notices at the root under the name the dev revision starts, the same bytes each time', async () => {
    const out = path.join(dir, 'a', 'bridge.zip')
    const again = path.join(dir, 'b', 'bridge.zip')
    await buildWebBridge({ out })
    await buildWebBridge({ out: again })
    const bytes = await readFile(out)
    expect(bytes.equals(await readFile(again))).toBe(true)
    const notices = await thirdPartyNotices(bundle.metafile)
    expect((await zipBundle(bundle.code, notices)).equals(bytes)).toBe(true)
    const entries = new AdmZip(bytes).getEntries()
    expect(entries.map((entry) => entry.entryName)).toEqual([
      WEB_BRIDGE_ENTRY,
      WEB_BRIDGE_NOTICES,
    ])
    expect(entries[0].getData().equals(bundle.code)).toBe(true)
    expect(entries[1].getData().toString()).toBe(notices)
  }, 60_000)

  test('the notices carry the licence of every npm package the bundle holds', async () => {
    const packages = bundledPackages(bundle.metafile)
    const names = packages.map(({ name }) => name)
    expect(names).toEqual(
      expect.arrayContaining(['mqtt', 'ws', '@aws-sdk/client-sts']),
    )
    expect(names.some((name) => name.startsWith('@smithy/'))).toBe(true)
    const notices = await thirdPartyNotices(bundle.metafile)
    for (const { name, version } of packages) {
      const section = notices.split(`\n== ${name} ${version} ==\n`)[1]
      expect(section).toBeDefined()
      expect(section.split('\n== ')[0]).toMatch(/^-- .+ --\n\s*\S/)
    }
    expect(notices).toContain('Permission is hereby granted')
    expect(notices).toContain('Apache License')
  }, 60_000)

  test('starts on its own, listens on AWS_LAMBDA_HTTP_ENDPOINT and stops on SIGTERM', async () => {
    const file = path.join(dir, WEB_BRIDGE_ENTRY)
    await writeFile(file, bundle.code)
    const port = await freePort()
    // No session and no fallback: every request is answered by the bridge itself.
    const child = spawn(process.execPath, [file], {
      cwd: dir,
      env: {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        AWS_LAMBDA_HTTP_ENDPOINT: `127.0.0.1:${port}`,
        AWS_REGION: 'us-east-1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    child.stdout.on('data', (chunk) => (output += chunk))
    child.stderr.on('data', (chunk) => (output += chunk))
    const exited = new Promise((resolve) => child.on('exit', resolve))
    try {
      for (let i = 0; i < 200 && !output.includes('listening'); i++) {
        await new Promise((resolve) => setTimeout(resolve, 25))
      }
      expect(output).toContain(`web bridge listening on 127.0.0.1:${port}`)
      expect(await get(port)).toBe(503)
    } finally {
      child.kill('SIGTERM')
    }
    // Windows has no SIGTERM: kill() ends the process there without a code.
    const code = await exited
    if (process.platform !== 'win32') expect(code).toBe(0)
  }, 60_000)
})
