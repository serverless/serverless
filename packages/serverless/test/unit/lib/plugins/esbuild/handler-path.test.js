/**
 * Serverless `handler` strings are `path/to/file.exportName` — the file lives
 * at `path/to/file.{ts,js,...}` and exports a function named `exportName`.
 *
 * The buggy derivation stripped the FIRST occurrence of `.{exportName}`
 * anywhere in the handler string (`handler.replace(`.${functionName}`, '')`).
 * When a directory or file segment earlier in the path happens to contain
 * the literal substring `.{exportName}` (e.g. a folder mirroring the handler
 * name, `items.get/index.get`), the first occurrence is not the real suffix,
 * so the derived path is wrong and the plugin looks for a file that doesn't
 * exist. It must strip the LAST occurrence instead (mirrors the community
 * serverless-esbuild plugin's deliberate `lastIndexOf` fix).
 *
 * Note: a handler like `handler.handler` (file and export sharing a name)
 * does NOT reproduce the bug — with only one occurrence of `.handler` in the
 * string, first-occurrence and last-occurrence replacement coincide. The
 * divergence only appears when the pattern occurs twice with unrelated
 * content between the two occurrences, as constructed below.
 */

import { jest } from '@jest/globals'
import fs from 'fs'
import os from 'os'
import path from 'path'

const Esbuild = (await import('../../../../../lib/plugins/esbuild/index.js'))
  .default

const createdServiceDirs = []

function makeServiceDir() {
  const serviceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sls-esbuild-'))
  createdServiceDirs.push(serviceDir)
  // Directory name mirrors the export name ("items.get"), so the buggy
  // first-occurrence replace strips the wrong ".get" from the handler string.
  const nestedDir = path.join(serviceDir, 'handlers', 'items.get')
  fs.mkdirSync(nestedDir, { recursive: true })
  fs.writeFileSync(
    path.join(nestedDir, 'index.ts'),
    'export const get = async () => ({ statusCode: 200 })\n',
  )
  return serviceDir
}

function makePlugin(serviceDir) {
  const serverless = {
    serviceDir,
    config: { serviceDir },
    service: { service: 'my-service' },
  }
  return new Esbuild(serverless, {})
}

const HANDLER = 'handlers/items.get/index.get'

describe('esbuild handler export-suffix stripping', () => {
  jest.setTimeout(30_000)

  afterEach(() => {
    while (createdServiceDirs.length > 0) {
      fs.rmSync(createdServiceDirs.pop(), { recursive: true, force: true })
    }
  })

  test('_extensionForFunction finds the file when a path segment collides with the export name', async () => {
    const serviceDir = makeServiceDir()
    const plugin = makePlugin(serviceDir)

    const extension = await plugin._extensionForFunction(HANDLER)

    expect(extension).toBe('.ts')
  })

  test('WillEsBuildRun detects the typescript handler when a path segment collides with the export name', () => {
    const serviceDir = makeServiceDir()

    const configFile = {
      provider: { runtime: 'nodejs18.x' },
      functions: {
        hello: { handler: HANDLER },
      },
    }

    expect(Esbuild.WillEsBuildRun(configFile, serviceDir, 'handler')).toBe(true)
  })
})
