import { jest } from '@jest/globals'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'fs/promises'
import { existsSync } from 'fs'
import os, { tmpdir } from 'os'
import path from 'path'
import { autoUpdateAgentSkills } from '../../../../src/lib/agent-skills/auto-update.js'
import { syncSkills } from '../../../../src/lib/agent-skills/engine.js'

const managedMd = (v) => `---
name: sls-test
description: d
metadata:
  managed-by: serverless-framework
  version: "${v}"
---
body v${v}
`
// Every env var isCICDEnvironment() looks at — the guard must see a clean
// environment even when this suite itself runs in CI (GITHUB_ACTIONS etc.).
const CI_ENV_VARS = [
  'CI',
  'CONTINUOUS_INTEGRATION',
  'BUILD_ID',
  'BUILD_NUMBER',
  'TEAMCITY_VERSION',
  'TRAVIS',
  'CIRCLECI',
  'JENKINS_URL',
  'GITLAB_CI',
  'GITHUB_ACTIONS',
  'BITBUCKET_BUILD_NUMBER',
  'BUILDKITE',
  'NOW_BUILDER',
  'APPVEYOR',
]

let svc, home, savedCiEnv
beforeEach(async () => {
  svc = await mkdtemp(path.join(tmpdir(), 'svc-'))
  home = await mkdtemp(path.join(tmpdir(), 'home-'))
  await writeFile(path.join(svc, 'serverless.yml'), 'service: t\n')
  savedCiEnv = {}
  for (const name of CI_ENV_VARS) {
    savedCiEnv[name] = process.env[name]
    delete process.env[name]
  }
})
afterEach(async () => {
  await rm(svc, { recursive: true, force: true })
  await rm(home, { recursive: true, force: true })
  for (const name of CI_ENV_VARS) {
    if (savedCiEnv[name] === undefined) delete process.env[name]
    else process.env[name] = savedCiEnv[name]
  }
})
const claudeSkills = () => path.join(svc, '.claude', 'skills')
const args = (over = {}) => ({
  command: ['deploy'],
  configFilePath: path.join(svc, 'serverless.yml'),
  homeDir: home,
  // test seam: inject bundled skills so tests don't depend on repo skills/
  getBundled: async () => [
    { name: 'sls-test', version: 2, files: { 'SKILL.md': managedMd(2) } },
  ],
  ...over,
})

// --- user scope ---------------------------------------------------------
const scopedMd = (name, v, scope) => `---
name: ${name}
description: d
metadata:
  managed-by: serverless-framework
  version: "${v}"
  scope: ${scope}
---
body ${name} v${v}
`
const scoped = (name, v, scope) => ({
  name,
  version: v,
  scope,
  files: { 'SKILL.md': scopedMd(name, v, scope) },
})
const scopedArgs = (over = {}) =>
  args({
    getBundled: async () => [
      scoped('sls-gateway', 2, 'user'),
      scoped('sls-project', 2, 'project'),
    ],
    ...over,
  })
const homeClaudeSkills = () => path.join(home, '.claude', 'skills')
const homeAgentsSkills = () => path.join(home, '.agents', 'skills')
const read = (p) => readFile(p, 'utf8')
// Seed a managed v1 gateway in ~/.claude/skills and leave ~/.agents empty, so
// both home dirs are candidates but only one has our skills (the opt-in gate).
const seedHome = async () => {
  await syncSkills({
    bundledSkills: [scoped('sls-gateway', 1, 'user')],
    targetDirs: [homeClaudeSkills()],
  })
  await mkdir(path.join(home, '.agents'), { recursive: true })
}

it('converges user-scope skills in home dirs that already have managed skills', async () => {
  await seedHome()
  await autoUpdateAgentSkills(scopedArgs())
  expect(
    await read(path.join(homeClaudeSkills(), 'sls-gateway', 'SKILL.md')),
  ).toContain('body sls-gateway v2')
  // ~/.agents/skills has no managed skills — auto-update never bootstraps.
  expect(existsSync(path.join(homeAgentsSkills(), 'sls-gateway'))).toBe(false)
})

it('runs the user half even without a service config', async () => {
  await seedHome()
  await autoUpdateAgentSkills(
    scopedArgs({ command: ['print'], configFilePath: undefined }),
  )
  expect(
    await read(path.join(homeClaudeSkills(), 'sls-gateway', 'SKILL.md')),
  ).toContain('body sls-gateway v2')
})

it('never writes user-scope skills into project dirs', async () => {
  await seedHome()
  await syncSkills({
    bundledSkills: [scoped('sls-project', 1, 'project')],
    targetDirs: [claudeSkills()],
  })
  await autoUpdateAgentSkills(scopedArgs())
  expect(
    await read(path.join(claudeSkills(), 'sls-project', 'SKILL.md')),
  ).toContain('body sls-project v2')
  expect(existsSync(path.join(claudeSkills(), 'sls-gateway'))).toBe(false)
  // ...and no project skill leaks into the home dirs.
  expect(existsSync(path.join(homeClaudeSkills(), 'sls-project'))).toBe(false)
})

it('does nothing when no managed skills present (opt-in gate)', async () => {
  await autoUpdateAgentSkills(args())
  await expect(
    readFile(path.join(claudeSkills(), 'sls-test', 'SKILL.md'), 'utf8'),
  ).rejects.toThrow()
})

it('converges present dir to newer bundled version', async () => {
  await syncSkills({
    bundledSkills: [
      { name: 'sls-test', version: 1, files: { 'SKILL.md': managedMd(1) } },
    ],
    targetDirs: [claudeSkills()],
  })
  await autoUpdateAgentSkills(args())
  expect(
    await readFile(path.join(claudeSkills(), 'sls-test', 'SKILL.md'), 'utf8'),
  ).toContain('body v2')
})

it('skipped in CI', async () => {
  await syncSkills({
    bundledSkills: [
      { name: 'sls-test', version: 1, files: { 'SKILL.md': managedMd(1) } },
    ],
    targetDirs: [claudeSkills()],
  })
  process.env.CI = 'true'
  await autoUpdateAgentSkills(args())
  expect(
    await readFile(path.join(claudeSkills(), 'sls-test', 'SKILL.md'), 'utf8'),
  ).toContain('body v1')
})

it('skipped entirely for the agent command; no config skips only the project half', async () => {
  await seedHome()
  await syncSkills({
    bundledSkills: [scoped('sls-project', 1, 'project')],
    targetDirs: [claudeSkills()],
  })
  const gatewayMd = path.join(homeClaudeSkills(), 'sls-gateway', 'SKILL.md')
  const projectMd = path.join(claudeSkills(), 'sls-project', 'SKILL.md')

  // `agent` short-circuits before either half runs.
  await autoUpdateAgentSkills(
    scopedArgs({ command: ['agent', 'skills', 'install'] }),
  )
  expect(await read(gatewayMd)).toContain('body sls-gateway v1')
  expect(await read(projectMd)).toContain('body sls-project v1')

  // No config: the project half is skipped, the user half still converges.
  await autoUpdateAgentSkills(scopedArgs({ configFilePath: undefined }))
  expect(await read(projectMd)).toContain('body sls-project v1')
  expect(await read(gatewayMd)).toContain('body sls-gateway v2')
})

it('treats an empty homeDir as no home (never writes relative paths)', async () => {
  // path.join('', '.claude/skills') is RELATIVE, so an empty home would make
  // the hook converge the CURRENT WORKING DIRECTORY. Seed cwd/.claude/skills
  // with a managed skill so a relative resolution would definitely bite (the
  // opt-in gate would pass), then prove it is left untouched.
  const cwd = await mkdtemp(path.join(tmpdir(), 'cwd-'))
  const cwdSkill = path.join(
    cwd,
    '.claude',
    'skills',
    'sls-gateway',
    'SKILL.md',
  )
  await syncSkills({
    bundledSkills: [scoped('sls-gateway', 1, 'user')],
    targetDirs: [path.join(cwd, '.claude', 'skills')],
  })
  const originalCwd = process.cwd()
  try {
    process.chdir(cwd)
    await autoUpdateAgentSkills(
      scopedArgs({ configFilePath: undefined, homeDir: '' }),
    )
  } finally {
    process.chdir(originalCwd)
  }
  expect(await read(cwdSkill)).toContain('body sls-gateway v1')
  expect(existsSync(path.join(cwd, '.agents', 'skills'))).toBe(false)
  await rm(cwd, { recursive: true, force: true })
})

it('never throws when os.homedir() fails and homeDir is not injected', async () => {
  await syncSkills({
    bundledSkills: [
      { name: 'sls-test', version: 1, files: { 'SKILL.md': managedMd(1) } },
    ],
    targetDirs: [claudeSkills()],
  })
  const spy = jest.spyOn(os, 'homedir').mockImplementation(() => {
    throw new Error('no resolvable home directory')
  })
  try {
    // Note: homeDir intentionally omitted, so the hook must fall back to
    // os.homedir() — the seam this regression guards.
    await expect(
      autoUpdateAgentSkills({
        command: ['deploy'],
        configFilePath: path.join(svc, 'serverless.yml'),
      }),
    ).resolves.toBeUndefined()
  } finally {
    spy.mockRestore()
  }
})

it('no-ops quickly when none of our skills are installed anywhere', async () => {
  // The hook runs on every framework command, so the no-op path must stay
  // cheap. Worst realistic case: the user has a populated ~/.claude/skills
  // full of OTHER people's skills, so hasManagedSkills has to readdir the
  // dir and read every SKILL.md before concluding "not ours".
  const emptyHome = await mkdtemp(path.join(tmpdir(), 'empty-home-'))
  const foreign = path.join(emptyHome, '.claude', 'skills')
  for (let i = 0; i < 25; i++) {
    await mkdir(path.join(foreign, `other-skill-${i}`), { recursive: true })
    await writeFile(
      path.join(foreign, `other-skill-${i}`, 'SKILL.md'),
      `---\nname: other-skill-${i}\ndescription: d\n---\nbody\n`,
    )
  }
  try {
    const start = performance.now()
    await autoUpdateAgentSkills(
      scopedArgs({ configFilePath: undefined, homeDir: emptyHome }),
    )
    // A generous bound: it catches a network call or a framework load on
    // this path, not disk jitter on a busy (or Windows) CI runner.
    expect(performance.now() - start).toBeLessThan(1000)
    // Nothing of ours was there, so nothing was written.
    expect(existsSync(path.join(foreign, 'sls-gateway'))).toBe(false)
  } finally {
    await rm(emptyHome, { recursive: true, force: true })
  }
})

it('never throws even when sync explodes', async () => {
  await syncSkills({
    bundledSkills: [
      { name: 'sls-test', version: 1, files: { 'SKILL.md': managedMd(1) } },
    ],
    targetDirs: [claudeSkills()],
  })
  await expect(
    autoUpdateAgentSkills(
      args({
        getBundled: async () => {
          throw new Error('boom')
        },
      }),
    ),
  ).resolves.toBeUndefined()
})
