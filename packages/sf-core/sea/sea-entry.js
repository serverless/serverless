// =============================================================================
// sea-entry.js — Prepended as banner to the ESM SEA bundle
// =============================================================================
//
// Extracts support files next to the binary and sets ESBUILD_BINARY_PATH.
// import.meta.url resolves to the binary's location, so __dirname from
// injects-shim.js points to the binary's directory — all existing path
// resolution works unchanged with no overrides needed.

import { createRequire as __seaCreateRequire } from 'node:module'
import { fileURLToPath as __seaFileURLToPath } from 'node:url'
import { dirname as __seaDirname, join as __seaJoin } from 'node:path'
import {
  existsSync as __seaExists,
  mkdirSync as __seaMkdir,
  writeFileSync as __seaWrite,
  chmodSync as __seaChmod,
} from 'node:fs'

;(function seaInit() {
  let sea
  try {
    sea = __seaCreateRequire(import.meta.url)('node:sea')
  } catch {
    return
  }
  if (!sea.isSea()) return

  // Binary location — import.meta.url points here in ESM SEA
  const binaryPath = __seaFileURLToPath(import.meta.url)
  const binaryDir = __seaDirname(binaryPath)
  // Package root is one level up (binary is at .../package/dist/sf-core-sea)
  const packageDir = __seaDirname(binaryDir)

  // --- Extract esbuild binary ---
  const esbuildPath = __seaJoin(packageDir, 'bin', 'esbuild')
  if (!__seaExists(esbuildPath)) {
    __seaMkdir(__seaDirname(esbuildPath), { recursive: true })
    __seaWrite(esbuildPath, Buffer.from(sea.getRawAsset('esbuild-bin')))
    __seaChmod(esbuildPath, 0o755)
  }
  process.env.ESBUILD_BINARY_PATH = esbuildPath

  // --- Extract support files ---
  // Asset targets use "dist/" and "lib/" prefixes. Files under "dist/" go into
  // the binary's directory (whatever it's named). Files under "lib/", "docs/"
  // etc. go into the package root alongside the binary's parent directory.
  const marker = __seaJoin(packageDir, '.sea-extracted')
  if (!__seaExists(marker)) {
    const manifest = JSON.parse(sea.getAsset('asset-manifest.json', 'utf8'))
    for (const entry of manifest) {
      let targetPath
      if (entry.target.startsWith('dist/')) {
        // dist/* files go next to the binary (binaryDir may be "dist/" or "dist-sea/")
        targetPath = __seaJoin(binaryDir, entry.target.slice('dist/'.length))
      } else {
        // lib/*, docs/* etc. go into the package root
        targetPath = __seaJoin(packageDir, entry.target)
      }
      __seaMkdir(__seaDirname(targetPath), { recursive: true })
      __seaWrite(targetPath, Buffer.from(sea.getRawAsset(entry.assetKey)))
      if (entry.executable) __seaChmod(targetPath, 0o755)
    }
    __seaWrite(marker, new Date().toISOString())
  }
})()
// --- End of SEA init. Bundled sf-core code follows. ---
