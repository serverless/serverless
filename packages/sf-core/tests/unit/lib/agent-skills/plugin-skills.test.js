import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { findClaudePluginSkill } from '../../../../src/lib/agent-skills/plugin-skills.js'

const skillMd = ({ version = 3, managed = true } = {}) => `---
name: sls-gateway
description: d
metadata:${managed ? '\n  managed-by: serverless-framework' : ''}
  version: "${version}"
---
`

let home
beforeEach(async () => {
  home = await mkdtemp(path.join(tmpdir(), 'home-'))
})
afterEach(async () => {
  await rm(home, { recursive: true, force: true })
})

const pluginsDir = () => path.join(home, '.claude', 'plugins')
// Claude Code keeps a marketplace plugin in cache/<marketplace>/<plugin>/<version>/.
const cacheDir = (marketplace, plugin, version) =>
  path.join(pluginsDir(), 'cache', marketplace, plugin, version)
// A plugin synced from a claude.ai account sits in synced/<account>/<plugin>/.
const syncedDir = (account, plugin) =>
  path.join(pluginsDir(), 'synced', account, plugin)
const seedSkill = async (pluginDir, md = skillMd()) => {
  const dir = path.join(pluginDir, 'skills', 'sls-gateway')
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, 'SKILL.md'), md)
}
const seedManifest = async (pluginDir, manifest) => {
  await mkdir(path.join(pluginDir, '.claude-plugin'), { recursive: true })
  await writeFile(
    path.join(pluginDir, '.claude-plugin', 'plugin.json'),
    JSON.stringify(manifest),
  )
}
// `claude plugin install` at user scope turns the plugin on in the user settings.
const writeSettings = async (enabledPlugins) => {
  await mkdir(path.join(home, '.claude'), { recursive: true })
  await writeFile(
    path.join(home, '.claude', 'settings.json'),
    JSON.stringify({ enabledPlugins }),
  )
}
const find = () =>
  findClaudePluginSkill({ homeDir: home, skillName: 'sls-gateway' })

it('finds nothing in a home without Claude Code plugins', async () => {
  expect(await find()).toBeUndefined()
})

it('finds nothing without a home directory', async () => {
  expect(
    await findClaudePluginSkill({
      homeDir: undefined,
      skillName: 'sls-gateway',
    }),
  ).toBeUndefined()
})

describe('a plugin installed from a marketplace', () => {
  it('provides the skill when the user settings turn it on', async () => {
    await seedSkill(cacheDir('acme', 'tools', '1.2.0'))
    await writeSettings({ 'tools@acme': true })
    expect(await find()).toEqual({ version: 3, id: 'tools@acme' })
  })

  it('does not count when only a project turns it on', async () => {
    // A project- or local-scope install shares the cache folder, and is turned
    // on in that project's settings, not in the user settings.
    await seedSkill(cacheDir('acme', 'tools', '1.2.0'))
    await writeSettings({})
    expect(await find()).toBeUndefined()
  })

  it('does not count when the user settings turn it off', async () => {
    await seedSkill(cacheDir('acme', 'tools', '1.2.0'))
    await writeSettings({ 'tools@acme': false })
    expect(await find()).toBeUndefined()
  })

  it('does not count without user settings, or with settings that are not JSON', async () => {
    await seedSkill(cacheDir('acme', 'tools', '1.2.0'))
    expect(await find()).toBeUndefined()
    await writeFile(path.join(home, '.claude', 'settings.json'), '{ not json')
    expect(await find()).toBeUndefined()
  })

  it('does not count a version Claude Code marked as no longer in use', async () => {
    // Claude Code leaves an uninstalled or replaced version on disk for a
    // while, with an `.orphaned_at` file in it.
    const dir = cacheDir('acme', 'tools', '1.2.0')
    await seedSkill(dir)
    await writeFile(path.join(dir, '.orphaned_at'), '1795103875411')
    await writeSettings({ 'tools@acme': true })
    expect(await find()).toBeUndefined()
  })

  it('reports the highest version among several copies', async () => {
    await seedSkill(cacheDir('acme', 'tools', '1.2.0'), skillMd({ version: 2 }))
    await seedSkill(cacheDir('acme', 'tools', '1.3.0'), skillMd({ version: 4 }))
    await seedSkill(syncedDir('account-1', 'tools'), skillMd({ version: 3 }))
    await writeSettings({ 'tools@acme': true })
    expect(await find()).toEqual({ version: 4, id: 'tools@acme' })
  })

  it('reads past a file where a plugin folder is expected', async () => {
    await mkdir(path.join(pluginsDir(), 'cache'), { recursive: true })
    await writeFile(path.join(pluginsDir(), 'cache', 'not-a-folder'), '')
    await seedSkill(cacheDir('acme', 'tools', '1.2.0'))
    await writeSettings({ 'tools@acme': true })
    expect(await find()).toEqual({ version: 3, id: 'tools@acme' })
  })
})

describe('a plugin synced from a claude.ai account', () => {
  it('does not count when the user settings turn plugin syncing off', async () => {
    // Claude Code hides the synced plugins it already downloaded when
    // `syncClaudeAiPlugins` is false.
    await seedSkill(syncedDir('account-1', 'tools'))
    await mkdir(path.join(home, '.claude'), { recursive: true })
    await writeFile(
      path.join(home, '.claude', 'settings.json'),
      JSON.stringify({ syncClaudeAiPlugins: false }),
    )
    expect(await find()).toBeUndefined()
  })

  it('does not count when the user settings are not readable JSON', async () => {
    // Unreadable settings could turn the plugin off, so they count as no
    // plugin copy, as an unreadable plugin folder does.
    await seedSkill(syncedDir('account-1', 'tools'))
    await mkdir(path.join(home, '.claude'), { recursive: true })
    await writeFile(path.join(home, '.claude', 'settings.json'), '{ not json')
    expect(await find()).toBeUndefined()
  })

  it('provides the skill without an entry in the user settings', async () => {
    await seedSkill(syncedDir('account-1', 'tools'))
    // A synced plugin is updated from claude.ai, so it has no id to update.
    expect(await find()).toStrictEqual({ version: 3 })
  })

  it('does not count when the user settings turn it off', async () => {
    // Claude Code names a synced plugin `<manifest name>@synced`, whatever its
    // folder is called.
    const dir = syncedDir('account-1', '6ba53849-2ee0')
    await seedSkill(dir)
    await seedManifest(dir, { name: 'tools' })
    await writeSettings({ 'tools@synced': false })
    expect(await find()).toBeUndefined()
  })

  it('is named after its folder when it has no readable manifest', async () => {
    await seedSkill(syncedDir('account-1', 'tools'))
    await writeSettings({ 'tools@synced': false })
    expect(await find()).toBeUndefined()
  })

  it('counts when the settings turn off a marketplace plugin of the same name', async () => {
    await seedSkill(syncedDir('account-1', 'tools'))
    await writeSettings({ 'tools@acme': false })
    expect(await find()).toEqual({ version: 3 })
  })

  it('does not count when its manifest is off by default and nothing turns it on', async () => {
    const dir = syncedDir('account-1', 'tools')
    await seedSkill(dir)
    await seedManifest(dir, { name: 'tools', defaultEnabled: false })
    expect(await find()).toBeUndefined()
    await writeSettings({ 'tools@synced': true })
    expect(await find()).toEqual({ version: 3 })
  })
})

describe('the skill inside a plugin', () => {
  it('does not count without the managed-by marker', async () => {
    await seedSkill(
      syncedDir('account-1', 'tools'),
      skillMd({ managed: false }),
    )
    expect(await find()).toBeUndefined()
  })

  it('does not count under another name', async () => {
    const other = path.join(syncedDir('account-1', 'tools'), 'skills', 'other')
    await mkdir(other, { recursive: true })
    await writeFile(path.join(other, 'SKILL.md'), skillMd())
    expect(await find()).toBeUndefined()
  })

  it('does not count without frontmatter', async () => {
    await seedSkill(syncedDir('account-1', 'tools'), 'no frontmatter\n')
    expect(await find()).toBeUndefined()
  })
})
