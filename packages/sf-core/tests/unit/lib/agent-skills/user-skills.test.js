import { mkdtemp, mkdir, readdir, rm } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import {
  pluginCopyNote,
  syncProjectSkills,
} from '../../../../src/lib/agent-skills/user-skills.js'

describe('pluginCopyNote', () => {
  it('names the update command of an older marketplace plugin', () => {
    expect(
      pluginCopyNote({
        skill: 'sls-gateway',
        alsoInstalled: true,
        older: true,
        id: 'tools@acme',
      }),
    ).toBe(
      'sls-gateway: Claude Code lists it twice, from an installed plugin and from ~/.claude/skills, and the plugin\'s copy is older — to keep one, run "claude plugin update tools@acme", then delete ~/.claude/skills/sls-gateway',
    )
  })

  it('says to update an older plugin that has no update command', () => {
    // A plugin synced from claude.ai is updated there.
    expect(
      pluginCopyNote({
        skill: 'sls-gateway',
        alsoInstalled: true,
        older: true,
      }),
    ).toBe(
      "sls-gateway: Claude Code lists it twice, from an installed plugin and from ~/.claude/skills, and the plugin's copy is older — to keep one, update the plugin, then delete ~/.claude/skills/sls-gateway",
    )
  })
})

describe('pluginCopyNote for a project skill', () => {
  const note = (copy) =>
    pluginCopyNote({
      skill: 'sls-feature',
      dir: '.claude/skills',
      shared: true,
      ...copy,
    })

  it('says the skill comes from the plugin', () => {
    expect(note({ alsoInstalled: false })).toBe(
      'sls-feature: Claude Code loads it from an installed plugin, so it is not installed in .claude/skills — teammates without the plugin get it from "serverless agent setup"',
    )
  })
  it('keeps the copy for teammates without the plugin', () => {
    expect(note({ alsoInstalled: true })).toBe(
      'sls-feature: Claude Code lists it twice, from an installed plugin and from .claude/skills — to keep one, delete .claude/skills/sls-feature, unless teammates without the plugin use it',
    )
  })
  it('names the update command of an older plugin', () => {
    expect(note({ alsoInstalled: true, older: true, id: 'tools@acme' })).toBe(
      'sls-feature: Claude Code lists it twice, from an installed plugin and from .claude/skills, and the plugin\'s copy is older — to keep one, run "claude plugin update tools@acme", then delete .claude/skills/sls-feature, unless teammates without the plugin use it',
    )
  })
})

describe('syncProjectSkills', () => {
  let svc, home
  beforeEach(async () => {
    svc = await mkdtemp(path.join(tmpdir(), 'svc-'))
    home = await mkdtemp(path.join(tmpdir(), 'home-'))
  })
  afterEach(async () => {
    await rm(svc, { recursive: true, force: true })
    await rm(home, { recursive: true, force: true })
  })
  const skill = (name) => ({
    name,
    version: 2,
    scope: 'project',
    files: {
      'SKILL.md': `---\nname: ${name}\ndescription: d\nmetadata:\n  managed-by: serverless-framework\n  version: "2"\n---\n`,
    },
  })
  const claude = () => path.join(svc, '.claude', 'skills')
  const agents = () => path.join(svc, '.agents', 'skills')
  const list = async (dir) => {
    try {
      return (await readdir(dir)).sort()
    } catch {
      return []
    }
  }

  it('writes a skill a plugin provides only to the other dirs, and names it', async () => {
    const findPluginSkill = async ({ skillName }) =>
      skillName === 'sls-a' ? { version: 2, id: 'tools@acme' } : undefined
    await mkdir(claude(), { recursive: true })
    const result = await syncProjectSkills({
      projectSkills: [skill('sls-a'), skill('sls-b')],
      targetDirs: [claude(), agents()],
      serviceDir: svc,
      homeDir: home,
      findPluginSkill,
    })
    expect(await list(claude())).toEqual(['sls-b'])
    expect(await list(agents())).toEqual(['sls-a', 'sls-b'])
    expect(result.pluginCopies).toEqual([
      {
        skill: 'sls-a',
        version: 2,
        alsoInstalled: false,
        dir: '.claude/skills',
        shared: true,
      },
    ])
    expect(result.report.changes.map((c) => [c.skill, c.dir])).toEqual([
      ['sls-a', agents()],
      ['sls-b', claude()],
      ['sls-b', agents()],
    ])
  })
})
