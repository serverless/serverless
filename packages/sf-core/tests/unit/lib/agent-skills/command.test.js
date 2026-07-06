import { mkdtemp, mkdir, writeFile, rm, stat } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import agentSkillsInstall from '../../../../src/lib/runners/core/agent-skills-install.js'

let svc, home
beforeEach(async () => {
  svc = await mkdtemp(path.join(tmpdir(), 'svc-'))
  home = await mkdtemp(path.join(tmpdir(), 'home-'))
  await writeFile(path.join(svc, 'serverless.yml'), 'service: test\n')
})
afterEach(async () => {
  await rm(svc, { recursive: true, force: true })
  await rm(home, { recursive: true, force: true })
})

it('installs bundled skills into resolved dirs and returns report', async () => {
  const report = await agentSkillsInstall({
    configFilePath: path.join(svc, 'serverless.yml'),
    options: {},
    homeDir: home,
  })
  // Bundled set may be empty until content lands; report shape is the contract.
  expect(report).toHaveProperty('changes')
  expect(report).toHaveProperty('skipped')
})

it('respects --dir: writes only .agents', async () => {
  const report = await agentSkillsInstall({
    configFilePath: path.join(svc, 'serverless.yml'),
    options: { dir: ['agents'] },
    homeDir: home,
  })
  for (const c of report.changes) expect(c.dir).toContain('.agents')
  await expect(stat(path.join(svc, '.claude'))).rejects.toThrow()
})

it('splits a comma-joined --dir (repeatable flag re-serialized by the CLI)', async () => {
  // `--dir claude --dir agents` reaches the command as the single string
  // "claude,agents" after the CLI's internal argv round-trip. Unsplit, it
  // would be rejected as one unknown value.
  const report = await agentSkillsInstall({
    configFilePath: path.join(svc, 'serverless.yml'),
    options: { dir: 'claude,agents' },
    homeDir: home,
  })
  expect(report).toHaveProperty('changes')
  // Each split token is still validated individually.
  await expect(
    agentSkillsInstall({
      configFilePath: path.join(svc, 'serverless.yml'),
      options: { dir: 'claude,bogus' },
      homeDir: home,
    }),
  ).rejects.toThrow(/Unknown --dir value "bogus"/)
})

it('rejects unknown --dir value', async () => {
  await expect(
    agentSkillsInstall({
      configFilePath: path.join(svc, 'serverless.yml'),
      options: { dir: 'cursor' },
      homeDir: home,
    }),
  ).rejects.toThrow(/claude.*agents/i)
})
