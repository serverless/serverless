import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import path from 'node:path'
import url from 'node:url'

globalThis.require = createRequire(import.meta.url)
globalThis.__filename = url.fileURLToPath(import.meta.url)
globalThis.__dirname = path.dirname(__filename)

if (!process.env.ESBUILD_BINARY_PATH) {
  const platform = `${process.platform}-${process.arch}`
  const map = {
    'darwin-arm64': '@esbuild/darwin-arm64/bin/esbuild',
    'darwin-x64': '@esbuild/darwin-x64/bin/esbuild',
    'linux-arm64': '@esbuild/linux-arm64/bin/esbuild',
    'linux-x64': '@esbuild/linux-x64/bin/esbuild',
    'win32-x64': '@esbuild/win32-x64/esbuild.exe',
  }
  if (map[platform]) {
    const p = path.join(__dirname, 'node_modules', map[platform])
    if (existsSync(p)) process.env.ESBUILD_BINARY_PATH = p
  }
}
