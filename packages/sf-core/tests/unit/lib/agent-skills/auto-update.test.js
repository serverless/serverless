import { jest } from '@jest/globals'
import { mkdtemp, writeFile, readFile, rm } from 'fs/promises'
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

it('skipped for the agent command itself and when no config', async () => {
  await syncSkills({
    bundledSkills: [
      { name: 'sls-test', version: 1, files: { 'SKILL.md': managedMd(1) } },
    ],
    targetDirs: [claudeSkills()],
  })
  await autoUpdateAgentSkills(args({ command: ['agent', 'skills', 'install'] }))
  await autoUpdateAgentSkills(args({ configFilePath: undefined }))
  expect(
    await readFile(path.join(claudeSkills(), 'sls-test', 'SKILL.md'), 'utf8'),
  ).toContain('body v1')
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
