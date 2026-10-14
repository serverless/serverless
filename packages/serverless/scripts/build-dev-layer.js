#!/usr/bin/env node
// Builds the Dev Mode layer zips (one per Lambda architecture) from dev-mode-bridge/.
// Needs Go (the version in dev-mode-bridge/go.mod). Runs on Linux, macOS and Windows: no make,
// no shell. Output: lib/plugins/aws/dev/layer/dist/serverless-dev-<arch>.zip
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ARCHITECTURES,
  layerArtifactPath,
} from '../lib/plugins/aws/dev/attach/naming.js'

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
)
const bridgeDir = path.resolve(packageRoot, '../../dev-mode-bridge')
const GOARCH = { x86_64: 'amd64', arm64: 'arm64' }
// The bridge's bytes must depend on its source only: -buildvcs=false keeps the commit, commit time
// and dirty-tree flag out of the binary (-s -w do not strip them), and the microarchitecture
// levels are pinned to Go's defaults so a caller's GOAMD64/GOARM64 cannot change the output.
const BUILD_ARGS = [
  'build',
  '-trimpath',
  '-buildvcs=false',
  '-ldflags=-s -w -buildid=',
]
// build-layer runs on this machine, whatever GOOS/GOARCH the caller has set.
const { GOOS: _goos, GOARCH: _goarch, ...hostEnv } = process.env

console.log(
  `Building ${ARCHITECTURES.length} Dev Mode layer zips (~30 s with a cold Go cache)`,
)
const tmp = mkdtempSync(path.join(os.tmpdir(), 'sls-dev-layer-'))
try {
  ARCHITECTURES.forEach((arch, index) => {
    const bridge = path.join(tmp, arch, 'sls-dev-bridge')
    execFileSync('go', [...BUILD_ARGS, '-o', bridge, './cmd/sls-dev-bridge'], {
      cwd: bridgeDir,
      stdio: 'inherit',
      env: {
        ...process.env,
        CGO_ENABLED: '0',
        GOOS: 'linux',
        GOARCH: GOARCH[arch],
        GOAMD64: 'v1',
        GOARM64: 'v8.0',
      },
    })
    const out = layerArtifactPath(arch)
    mkdirSync(path.dirname(out), { recursive: true })
    execFileSync(
      'go',
      [
        'run',
        './cmd/build-layer',
        '-bridge',
        bridge,
        '-wrapper',
        path.join('layer', 'sls-dev-wrapper'),
        '-notices',
        path.join('layer', 'sls-dev-THIRD_PARTY_NOTICES'),
        '-out',
        out,
      ],
      { cwd: bridgeDir, stdio: 'inherit', env: hostEnv },
    )
    console.log(
      `[${index + 1}/${ARCHITECTURES.length}] ${path.relative(process.cwd(), out)}`,
    )
  })
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
