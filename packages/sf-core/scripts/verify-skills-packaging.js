// packages/sf-core/scripts/verify-skills-packaging.js
/**
 * Proves the define-embedded skills manifest works end-to-end in the packed
 * CLI: builds a temp service, runs `agent skills install` using the packed
 * bundle, and asserts the packed CLI installs EXACTLY the skills that ship in
 * source `skills/` — so packaging can neither drop a bundled skill nor
 * conjure one. Handles the zero-skills case (nothing bundled): the command
 * must still run cleanly and install nothing. Run AFTER pack (see test:build).
 * Usage: node verify-skills-packaging.js <path-to-packed-sf-core.js>
 */
import { mkdtemp, writeFile, stat } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { spawnSync } from 'child_process'
import { readSkillsFromDir } from '../src/lib/agent-skills/read-skills.js'

const packedCli = process.argv[2]
if (!packedCli) {
  console.error('Usage: node verify-skills-packaging.js <packed sf-core.js>')
  process.exit(1)
}

// The source-of-truth skill set the packed bundle should have embedded.
const expected = await readSkillsFromDir(
  new URL('../../../skills/', import.meta.url),
)

const svc = await mkdtemp(path.join(tmpdir(), 'skills-verify-'))
await writeFile(
  path.join(svc, 'serverless.yml'),
  'service: skills-verify\nprovider:\n  name: aws\n',
)
const run = spawnSync(
  process.execPath,
  [path.resolve(packedCli), 'agent', 'skills', 'install'],
  // timeout: a hung child must fail the build, not block it forever.
  { cwd: svc, encoding: 'utf8', timeout: 120000 },
)
// Combine stdout + stderr: progress/notices (incl. "No skills are bundled")
// are logged to stderr to keep stdout pure, so the assertions below must see
// both streams.
const output = `${run.stdout || ''}${run.stderr || ''}`
process.stdout.write(output)
// A spawn-level failure (bad packedCli path/ENOENT, timeout, maxBuffer
// overflow) sets `run.error` and leaves `run.status` null — surface the real
// cause instead of a misleading "exited null".
if (run.error) {
  throw new Error(
    `packed CLI \`agent skills install\` failed to run: ${run.error.message}\n${output}`,
  )
}
if (run.status !== 0) {
  throw new Error(
    `packed CLI \`agent skills install\` exited ${run.status}\n${output}`,
  )
}

const exists = async (p) => {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}

if (expected.length === 0) {
  // Nothing is bundled: the command must run cleanly (execFileSync above would
  // have thrown on a non-zero exit) and materialize no skill. Assert both that
  // it said so and that it wrote nothing, so a broken embed that silently
  // dropped skills can't masquerade as "intentionally empty".
  if (!/No skills are bundled/i.test(output)) {
    throw new Error(
      'zero bundled skills: expected the "No skills are bundled" notice, got:\n' +
        output,
    )
  }
  // With nothing to install, don't announce target dirs we never touched.
  if (/Target:/.test(output)) {
    throw new Error(
      'zero bundled skills but the command printed a "Target:" line — should stay silent about target dirs when nothing is installed',
    )
  }
  for (const dir of ['.claude/skills', '.agents/skills']) {
    if (await exists(path.join(svc, dir))) {
      throw new Error(
        `zero bundled skills but the packed CLI created ${dir} — embed likely broken`,
      )
    }
  }
  console.log(
    '✓ packed CLI bundles zero skills and installs nothing (as expected)',
  )
} else {
  for (const skill of expected) {
    const installed = path.join(
      svc,
      '.claude',
      'skills',
      skill.name,
      'SKILL.md',
    )
    if (!(await exists(installed))) {
      throw new Error(
        `packed CLI did not install bundled skill "${skill.name}" (${installed} missing) — embed likely broken`,
      )
    }
  }
  console.log(
    `✓ packed CLI installed all ${expected.length} bundled skill(s): ${expected
      .map((s) => s.name)
      .join(', ')}`,
  )
}
