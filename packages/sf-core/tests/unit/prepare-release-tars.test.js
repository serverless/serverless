import { execFileSync, spawnSync } from 'child_process'
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs'
import os from 'os'
import path from 'path'
import url from 'url'

// prepareReleaseTars.sh publishes a release: it uploads the archive, then the
// files that point launchers at it, then records and tags the release. These
// tests run the real script with stand-in commands and check two promises: a
// failed step stops the run before anything that depends on it, and a run can
// be repeated after a failure without failing on what the first run did.
// The script runs only on Linux in the release workflow.
const itPosix = process.platform === 'win32' ? it.skip : it

const scriptPath = path.resolve(
  path.dirname(url.fileURLToPath(import.meta.url)),
  '../../prepareReleaseTars.sh',
)

// One stand-in for aws, node, npm and git: records each call, fails the call
// that matches $FAIL, and answers the few questions the script asks.
const STAND_IN = `#!/bin/bash
name=$(basename "$0"); line="$name $*"
if [ "$name" = git ] && [ "$1" = rev-parse ] && [ "$2" = --short ]; then echo abc1234; exit 0; fi
if [ "$name" = git ] && [ "$1" = rev-parse ]; then [ -n "$TAG_EXISTS" ]; exit $?; fi
if [ -n "$FAIL" ] && [[ "$line" == *"$FAIL"* ]]; then echo "$line -> failed" >> "$CALLS"; exit 1; fi
echo "$line" >> "$CALLS"
if [ "$name" = aws ] && [[ "$line" == *"cp s3://"* ]]; then echo '{}' > ./releases.json; fi
exit 0
`
const PACK = `echo "pack" >> "$CALLS"
mkdir -p pkg/package && echo '{}' > pkg/package/package.json
tar czf "serverlessinc-framework-alpha-$STUB_VERSION.tgz" -C pkg package
`
const VERIFY = `echo "verify-release-package" >> "$CALLS"
[ "$FAIL" = verify-release-package ] && exit 1
exit 0
`

let dir
beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'prepare-release-tars-'))
  const core = path.join(dir, 'packages/sf-core')
  mkdirSync(path.join(core, 'scripts'), { recursive: true })
  mkdirSync(path.join(dir, 'packages/framework-dist'))
  mkdirSync(path.join(dir, 'bin'))
  copyFileSync(scriptPath, path.join(core, 'prepareReleaseTars.sh'))
  writeFileSync(path.join(core, 'package.json'), '{"version":"9.9.9"}')
  writeFileSync(path.join(core, 'scripts/pack-framework-dist.sh'), PACK)
  writeFileSync(path.join(core, 'scripts/verify-release-package.sh'), VERIFY)
  for (const name of ['aws', 'node', 'npm', 'git']) {
    const file = path.join(dir, 'bin', name)
    writeFileSync(file, STAND_IN)
    chmodSync(file, 0o755)
  }
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const run = ({ canary = false, fail = '', tagExists = false } = {}) => {
  const calls = path.join(dir, 'calls.log')
  writeFileSync(calls, '')
  const jq = execFileSync('bash', ['-c', 'command -v jq']).toString().trim()
  const result = spawnSync('bash', ['prepareReleaseTars.sh'], {
    cwd: path.join(dir, 'packages/sf-core'),
    env: {
      PATH: `${path.join(dir, 'bin')}:${path.dirname(jq)}:/usr/bin:/bin`,
      CALLS: calls,
      IS_CANARY: String(canary),
      FAIL: fail,
      TAG_EXISTS: tagExists ? '1' : '',
      STUB_VERSION: canary ? 'abc1234' : '9.9.9',
    },
  })
  return {
    status: result.status,
    calls: readFileSync(calls, 'utf8').trim().split('\n'),
  }
}

const STABLE_CALLS = [
  'aws s3 cp s3://install.serverless.com/releases.json ./',
  'node updateReleasesJson.cjs',
  'node prepareDistributionTarballs.js',
  'pack',
  'verify-release-package',
  'aws s3 cp ./serverlessinc-framework-alpha-9.9.9.tgz s3://install.serverless.com/archives/serverless-9.9.9.tgz',
  'aws s3 cp ./releases.json s3://install.serverless.com/releases.json',
  'npm run -w=@serverlessinc/release-scripts publish:release 9.9.9',
  'npm run -w=@serverlessinc/release-scripts publish:release-metadata 9.9.9',
  'git tag sf-core-installer@9.9.9',
  'git push origin sf-core-installer@9.9.9',
]

describe('prepareReleaseTars.sh', () => {
  itPosix('publishes a stable release in order', () => {
    expect(run()).toEqual({ status: 0, calls: STABLE_CALLS })
  })

  itPosix('publishes a canary release without recording or tagging it', () => {
    expect(run({ canary: true })).toEqual({
      status: 0,
      calls: [
        'aws s3 cp s3://install.serverless-dev.com/releases.json ./',
        'node updateReleasesJson.cjs',
        'node prepareDistributionTarballs.js',
        'pack',
        'verify-release-package',
        'aws s3 cp ./serverlessinc-framework-alpha-abc1234.tgz s3://install.serverless-dev.com/archives/canary-abc1234.tgz',
        'aws s3 cp ./serverlessinc-framework-alpha-abc1234.tgz s3://install.serverless-dev.com/archives/canary.tgz',
        'aws s3 cp ./releases.json s3://install.serverless-dev.com/releases.json',
      ],
    })
  })

  // Each step that can fail, by a text unique to its call. The run must stop
  // at that call: nothing after it may run.
  const steps = [
    ['reading releases.json', 'cp s3://install.serverless.com/releases.json'],
    ['updating releases.json', 'updateReleasesJson'],
    ['preparing the tarballs', 'prepareDistributionTarballs'],
    ['verifying the package', 'verify-release-package'],
    ['uploading the archive', 'archives/serverless-9.9.9.tgz'],
    ['uploading releases.json', 'cp ./releases.json'],
    ['recording the release', 'publish:release 9.9.9'],
    ['publishing versions.json', 'publish:release-metadata'],
    ['tagging', 'git tag'],
  ]
  for (const [name, fail] of steps) {
    itPosix(`stops when ${name} fails`, () => {
      const { status, calls } = run({ fail })
      expect(status).not.toBe(0)
      const failed = calls.findIndex((call) => call.includes(fail))
      expect(failed).toBeGreaterThanOrEqual(0)
      expect(calls.slice(failed + 1)).toEqual([])
    })
  }

  itPosix('repeats a run whose tag already exists without failing', () => {
    expect(run({ tagExists: true })).toEqual({
      status: 0,
      calls: STABLE_CALLS.filter((call) => !call.startsWith('git tag')),
    })
  })
})
