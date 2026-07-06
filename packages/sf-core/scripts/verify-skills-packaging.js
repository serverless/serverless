// packages/sf-core/scripts/verify-skills-packaging.js
/**
 * Proves the define-embedded skills manifest works end-to-end in the packed
 * CLI: builds a temp service, runs `agent skills install` using the packed
 * bundle, and asserts skills materialized. Run AFTER pack (see test:build).
 * Usage: node verify-skills-packaging.js <path-to-packed-sf-core.js>
 */
import { mkdtemp, writeFile, stat } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { execFileSync } from 'child_process'

const packedCli = process.argv[2]
if (!packedCli) {
  console.error('Usage: node verify-skills-packaging.js <packed sf-core.js>')
  process.exit(1)
}
const svc = await mkdtemp(path.join(tmpdir(), 'skills-verify-'))
await writeFile(
  path.join(svc, 'serverless.yml'),
  'service: skills-verify\nprovider:\n  name: aws\n',
)
execFileSync(
  process.execPath,
  [path.resolve(packedCli), 'agent', 'skills', 'install'],
  {
    cwd: svc,
    stdio: 'inherit',
  },
)
const installed = path.join(
  svc,
  '.claude',
  'skills',
  'serverless-framework-cli',
  'SKILL.md',
)
await stat(installed) // throws → non-zero exit if missing
console.log(`✓ packed CLI installed skills (${installed})`)
