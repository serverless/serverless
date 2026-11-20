/**
 * Framework-managed skills that an agent already loads from an installed
 * plugin. A plugin keeps its skills in the agent's own plugin folders, outside
 * the skills dirs this CLI writes, so a skill installed there and here is
 * listed twice by the agent.
 *
 * Claude Code only: its skills dir (`~/.claude/skills`) is the one it reads,
 * while `~/.agents/skills` serves several agents at once and cannot be left
 * out for one of them.
 *
 * Everything here is read-only and never throws: an unreadable or reshaped
 * plugin folder means "no plugin copy", which is how the CLI behaved before it
 * looked.
 */
import { readdir, readFile, stat } from 'fs/promises'
import path from 'path'
import { MANAGED_BY } from './engine.js'
import { parseFrontmatter } from './read-skills.js'

const subdirsOf = async (dir) => {
  try {
    return (await readdir(dir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(dir, entry.name))
  } catch {
    return []
  }
}

const exists = async (filePath) => {
  try {
    await stat(filePath)
    return true
  } catch {
    return false
  }
}

/**
 * `enabledPlugins` from the user settings: plugin id → true/false. Project and
 * local settings are not read: they hold for one project, and the user-level
 * skill is for all of them.
 */
const userEnabledPlugins = async (claudeDir) => {
  try {
    const settings = JSON.parse(
      await readFile(path.join(claudeDir, 'settings.json'), 'utf8'),
    )
    const enabled = settings?.enabledPlugins
    return enabled && typeof enabled === 'object' ? enabled : {}
  } catch {
    return {}
  }
}

/** The managed version of `skillName` in a plugin folder, if it holds one. */
const managedVersionIn = async (pluginDir, skillName) => {
  let content
  try {
    content = await readFile(
      path.join(pluginDir, 'skills', skillName, 'SKILL.md'),
      'utf8',
    )
  } catch {
    return undefined
  }
  const frontmatter = parseFrontmatter(content)
  if (frontmatter?.metadata?.['managed-by'] !== MANAGED_BY) return undefined
  return parseInt(frontmatter.metadata.version, 10) || 0
}

/** The manifest of a plugin folder, `{}` when it has none that reads. */
const manifestOf = async (pluginDir) => {
  try {
    const manifest = JSON.parse(
      await readFile(
        path.join(pluginDir, '.claude-plugin', 'plugin.json'),
        'utf8',
      ),
    )
    return manifest && typeof manifest === 'object' ? manifest : {}
  } catch {
    return {}
  }
}

/**
 * The plugin folders Claude Code loads for this user in every project, each
 * as `{dir, id}`; `id` is what `claude plugin update` takes, and is left out
 * for a synced plugin, which claude.ai updates:
 *  - `plugins/cache/<marketplace>/<plugin>/<version>/` holds a plugin
 *    installed from a marketplace, id `<plugin>@<marketplace>`, whatever its
 *    scope. Only one the user settings turn on counts: a plugin installed for
 *    one project is turned on in that project's settings instead. A version
 *    Claude Code no longer uses (uninstalled or replaced) stays on disk for a
 *    while with an `.orphaned_at` file in it.
 *  - `plugins/synced/<account>/<plugin>/` holds a plugin turned on for the
 *    user's claude.ai account, id `<name>@synced`, where the name comes from
 *    the manifest (the folder is often an id). It loads unless the user
 *    settings turn it off, or its manifest is off by default and the settings
 *    don't turn it on.
 */
const claudePluginDirs = async (claudeDir) => {
  const pluginsDir = path.join(claudeDir, 'plugins')
  const enabled = await userEnabledPlugins(claudeDir)
  const dirs = []
  for (const marketplaceDir of await subdirsOf(
    path.join(pluginsDir, 'cache'),
  )) {
    for (const pluginDir of await subdirsOf(marketplaceDir)) {
      const id = `${path.basename(pluginDir)}@${path.basename(marketplaceDir)}`
      if (enabled[id] !== true) continue
      for (const versionDir of await subdirsOf(pluginDir)) {
        if (await exists(path.join(versionDir, '.orphaned_at'))) continue
        dirs.push({ dir: versionDir, id })
      }
    }
  }
  for (const accountDir of await subdirsOf(path.join(pluginsDir, 'synced'))) {
    for (const pluginDir of await subdirsOf(accountDir)) {
      const manifest = await manifestOf(pluginDir)
      const name =
        typeof manifest.name === 'string' && manifest.name
          ? manifest.name
          : path.basename(pluginDir)
      const setting = enabled[`${name}@synced`]
      if (setting === false) continue
      if (manifest.defaultEnabled === false && setting !== true) continue
      dirs.push({ dir: pluginDir })
    }
  }
  return dirs
}

/**
 * @returns {Promise<{version: number, id?: string}|undefined>} the newest
 *   Framework-managed copy of `skillName` among the plugins Claude Code loads
 *   for this user, with the id of the plugin that holds it when it has one
 */
export const findClaudePluginSkill = async ({ homeDir, skillName }) => {
  if (!homeDir) return undefined
  let newest
  for (const { dir, id } of await claudePluginDirs(
    path.join(homeDir, '.claude'),
  )) {
    const version = await managedVersionIn(dir, skillName)
    if (version !== undefined && (!newest || version > newest.version))
      newest = id ? { version, id } : { version }
  }
  return newest
}
