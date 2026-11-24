import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import {
  resolveProjectSkillTargetDirs,
  resolveTargetDirs,
  resolveUserSkillTargetDirs,
  resolveUserTargetDirs,
} from '../../../../src/lib/agent-skills/resolve-targets.js'

const MANAGED = `---
name: sls-test
description: d
metadata:
  managed-by: serverless-framework
  version: "1"
---
`
let svc, home
beforeEach(async () => {
  svc = await mkdtemp(path.join(tmpdir(), 'svc-'))
  home = await mkdtemp(path.join(tmpdir(), 'home-'))
})
afterEach(async () => {
  await rm(svc, { recursive: true, force: true })
  await rm(home, { recursive: true, force: true })
})
const claude = () => path.join(svc, '.claude', 'skills')
const agents = () => path.join(svc, '.agents', 'skills')
const seedManaged = async (dir) => {
  await mkdir(path.join(dir, 'sls-test'), { recursive: true })
  await writeFile(path.join(dir, 'sls-test', 'SKILL.md'), MANAGED)
}
const resolve = (mode, dirFlags) =>
  resolveTargetDirs({ mode, dirFlags, serviceDir: svc, homeDir: home })

it('--dir override wins over everything', async () => {
  await seedManaged(claude())
  expect(await resolve('install', ['agents'])).toEqual([agents()])
})
it('unknown --dir value throws', async () => {
  await expect(resolve('install', ['cursor'])).rejects.toThrow(
    /claude.*agents/i,
  )
})
it('managed presence beats service-dir and home detection', async () => {
  await seedManaged(claude())
  await mkdir(path.join(svc, '.agents'), { recursive: true }) // exists but no managed skills
  await mkdir(path.join(home, '.codex'), { recursive: true })
  expect(await resolve('install')).toEqual([claude()])
})
it('service agent dirs detected when no managed skills', async () => {
  await mkdir(path.join(svc, '.claude'), { recursive: true }) // just settings, no skills
  expect(await resolve('install')).toEqual([claude()])
})
it('home detection: ~/.codex and ~/.cursor map to agents; ~/.claude to claude; deduped', async () => {
  await mkdir(path.join(home, '.codex'))
  await mkdir(path.join(home, '.cursor'))
  await mkdir(path.join(home, '.claude'))
  expect((await resolve('install')).sort()).toEqual([agents(), claude()].sort())
})
it('~/.agents detected (direct standard usage)', async () => {
  await mkdir(path.join(home, '.agents'))
  expect(await resolve('install')).toEqual([agents()])
})
it('nothing anywhere → install bootstraps both', async () => {
  expect((await resolve('install')).sort()).toEqual([agents(), claude()].sort())
})
it('auto mode: only managed-presence dirs; nothing → empty (never bootstraps)', async () => {
  expect(await resolve('auto')).toEqual([])
  await seedManaged(agents())
  expect(await resolve('auto')).toEqual([agents()])
})
it('deleted-dir choice sticks across re-install (managed in one dir only)', async () => {
  await seedManaged(claude()) // user deleted .agents copy earlier
  expect(await resolve('install')).toEqual([claude()])
})

describe('resolveUserTargetDirs', () => {
  const userClaude = () => path.join(home, '.claude', 'skills')
  const userAgents = () => path.join(home, '.agents', 'skills')

  it('maps ~/.claude to the claude dir and ~/.cursor to the agents dir', async () => {
    await mkdir(path.join(home, '.claude'))
    await mkdir(path.join(home, '.cursor'))
    const dirs = await resolveUserTargetDirs({ homeDir: home })
    expect(dirs.sort()).toEqual([userClaude(), userAgents()].sort())
  })
  it('maps ~/.codex and ~/.cursor to the agents dir only, deduped', async () => {
    await mkdir(path.join(home, '.codex'))
    await mkdir(path.join(home, '.cursor'))
    expect(await resolveUserTargetDirs({ homeDir: home })).toEqual([
      userAgents(),
    ])
  })
  it('falls back to both dirs when no markers exist', async () => {
    const dirs = await resolveUserTargetDirs({ homeDir: home })
    expect(dirs).toHaveLength(2)
    expect(dirs.sort()).toEqual([userClaude(), userAgents()].sort())
  })
  it('writes only the --dir targets, whatever the home markers say', async () => {
    await mkdir(path.join(home, '.claude'))
    await mkdir(path.join(home, '.agents'))
    expect(
      await resolveUserTargetDirs({ homeDir: home, dirFlags: ['claude'] }),
    ).toEqual([userClaude()])
    expect(
      await resolveUserTargetDirs({ homeDir: home, dirFlags: ['agents'] }),
    ).toEqual([userAgents()])
  })
})

describe('resolveUserSkillTargetDirs', () => {
  const userClaude = () => path.join(home, '.claude', 'skills')
  const userAgents = () => path.join(home, '.agents', 'skills')
  const skill = { name: 'sls-test', version: 2 }
  const pluginHas = (version, id) => async () => ({ version, id })
  const noPlugin = async () => undefined
  const resolveSkill = (findPluginSkill, dirFlags) =>
    resolveUserSkillTargetDirs({
      homeDir: home,
      dirFlags,
      skill,
      findPluginSkill,
    })

  it('returns the user dirs when no plugin provides the skill', async () => {
    await mkdir(path.join(home, '.claude'))
    expect(await resolveSkill(noPlugin)).toEqual({ dirs: [userClaude()] })
  })
  it('leaves the claude dir out when a Claude Code plugin provides the skill', async () => {
    await mkdir(path.join(home, '.claude'))
    expect(await resolveSkill(pluginHas(2))).toEqual({
      dirs: [],
      plugin: { version: 2, alsoInstalled: false },
    })
  })
  it('keeps the agents dir when it is a target too', async () => {
    await mkdir(path.join(home, '.claude'))
    await mkdir(path.join(home, '.codex'))
    expect(await resolveSkill(pluginHas(3))).toEqual({
      dirs: [userAgents()],
      plugin: { version: 3, alsoInstalled: false },
    })
  })
  it('installs into the claude dir when the plugin copy is older, and says it will be listed twice', async () => {
    await mkdir(path.join(home, '.claude'))
    expect(await resolveSkill(pluginHas(1))).toEqual({
      dirs: [userClaude()],
      plugin: { version: 1, alsoInstalled: true, older: true },
    })
  })
  it('passes on the id of an older plugin, so the caller can name the update command', async () => {
    await mkdir(path.join(home, '.claude'))
    expect(await resolveSkill(pluginHas(1, 'tools@acme'))).toEqual({
      dirs: [userClaude()],
      plugin: {
        version: 1,
        alsoInstalled: true,
        older: true,
        id: 'tools@acme',
      },
    })
  })
  it('updates a managed copy next to an older plugin copy, and says it is listed twice', async () => {
    await mkdir(path.join(home, '.claude'))
    await seedManaged(userClaude())
    expect(await resolveSkill(pluginHas(1))).toEqual({
      dirs: [userClaude()],
      plugin: { version: 1, alsoInstalled: true, older: true },
    })
  })
  it('keeps a managed copy that is already in the claude dir and says so', async () => {
    await mkdir(path.join(home, '.claude'))
    await seedManaged(userClaude())
    expect(await resolveSkill(pluginHas(2))).toEqual({
      dirs: [userClaude()],
      plugin: { version: 2, alsoInstalled: true },
    })
  })
  it('leaves a copy the user customized alone', async () => {
    await mkdir(path.join(userClaude(), 'sls-test'), { recursive: true })
    await writeFile(
      path.join(userClaude(), 'sls-test', 'SKILL.md'),
      '---\nname: sls-test\ndescription: mine\n---\n',
    )
    expect(await resolveSkill(pluginHas(2))).toEqual({ dirs: [userClaude()] })
  })
  it('writes exactly the --dir targets without looking at plugins', async () => {
    await mkdir(path.join(home, '.claude'))
    const findPluginSkill = async () => {
      throw new Error('must not be called')
    }
    expect(await resolveSkill(findPluginSkill, ['claude'])).toEqual({
      dirs: [userClaude()],
    })
  })
  it('does not look at plugins when the claude dir is not a target', async () => {
    await mkdir(path.join(home, '.codex'))
    const findPluginSkill = async () => {
      throw new Error('must not be called')
    }
    expect(await resolveSkill(findPluginSkill)).toEqual({
      dirs: [userAgents()],
    })
  })
})

describe('resolveProjectSkillTargetDirs', () => {
  const skill = { name: 'sls-test', version: 2 }
  const pluginHas = (version, id) => async () => ({ version, id })
  const noPlugin = async () => undefined
  const resolveSkill = (
    findPluginSkill,
    { targetDirs = [claude(), agents()], dirFlags, homeDir = home } = {},
  ) =>
    resolveProjectSkillTargetDirs({
      targetDirs,
      serviceDir: svc,
      homeDir,
      dirFlags,
      skill,
      findPluginSkill,
    })

  it('returns the project dirs when no plugin provides the skill', async () => {
    expect(await resolveSkill(noPlugin)).toEqual({
      dirs: [claude(), agents()],
    })
  })
  it('leaves the claude dir out when a Claude Code plugin provides the skill', async () => {
    expect(await resolveSkill(pluginHas(2))).toEqual({
      dirs: [agents()],
      plugin: { version: 2, alsoInstalled: false },
    })
  })
  it('asks about the plugins Claude Code loads in this service', async () => {
    const calls = []
    await resolveSkill(async (args) => {
      calls.push(args)
      return undefined
    })
    expect(calls).toEqual([
      { homeDir: home, skillName: 'sls-test', projectDir: svc },
    ])
  })
  it('keeps a managed copy that is already in the claude dir and says so', async () => {
    await seedManaged(claude())
    expect(await resolveSkill(pluginHas(2))).toEqual({
      dirs: [claude(), agents()],
      plugin: { version: 2, alsoInstalled: true },
    })
  })
  it('installs into the claude dir when the plugin copy is older, with the plugin id', async () => {
    expect(await resolveSkill(pluginHas(1, 'tools@acme'))).toEqual({
      dirs: [claude(), agents()],
      plugin: {
        version: 1,
        alsoInstalled: true,
        older: true,
        id: 'tools@acme',
      },
    })
  })
  it('leaves a copy the user customized alone', async () => {
    await mkdir(path.join(claude(), 'sls-test'), { recursive: true })
    await writeFile(
      path.join(claude(), 'sls-test', 'SKILL.md'),
      '---\nname: sls-test\ndescription: mine\n---\n',
    )
    expect(await resolveSkill(pluginHas(2))).toEqual({
      dirs: [claude(), agents()],
    })
  })
  it('writes exactly the --dir targets without looking at plugins', async () => {
    const findPluginSkill = async () => {
      throw new Error('must not be called')
    }
    expect(
      await resolveSkill(findPluginSkill, {
        targetDirs: [claude()],
        dirFlags: ['claude'],
      }),
    ).toEqual({ dirs: [claude()] })
  })
  it('does not look at plugins when the claude dir is not a target, or without a home', async () => {
    const findPluginSkill = async () => {
      throw new Error('must not be called')
    }
    expect(
      await resolveSkill(findPluginSkill, { targetDirs: [agents()] }),
    ).toEqual({ dirs: [agents()] })
    expect(await resolveSkill(findPluginSkill, { homeDir: null })).toEqual({
      dirs: [claude(), agents()],
    })
  })
})
