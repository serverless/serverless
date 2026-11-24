/**
 * Framework-managed skills that an agent already loads from an installed
 * plugin. A plugin keeps its skills in the agent's own plugin folders, outside
 * the skills dirs this CLI writes, so a skill installed there and here is
 * listed twice by the agent.
 *
 * Claude Code only: its skills dirs (`~/.claude/skills`, and `.claude/skills`
 * in a service) are the ones it reads, while `.agents/skills` serves several
 * agents at once and cannot be left out for one of them.
 *
 * Everything here is read-only and never throws: an unreadable or reshaped
 * plugin folder means "no plugin copy", which is how the CLI behaved before it
 * looked.
 */
import { readdir, readFile, realpath, stat } from 'fs/promises'
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
 * The plugin settings from the user settings: `enabled` maps a plugin id to
 * true/false, and `syncOff` is true when `syncClaudeAiPlugins` is false, which
 * hides the synced plugins. Only the user settings turn a plugin on for every
 * project; project and local settings can only turn it off for a project skill
 * (projectPluginOverrides). A missing file
 * means no settings; a file that can't be read or parsed returns undefined,
 * since it could turn any plugin off.
 */
const userPluginSettings = async (claudeDir) => {
  let content
  try {
    content = await readFile(path.join(claudeDir, 'settings.json'), 'utf8')
  } catch (error) {
    return error?.code === 'ENOENT'
      ? { enabled: {}, syncOff: false }
      : undefined
  }
  let settings
  try {
    settings = JSON.parse(content)
  } catch {
    return undefined
  }
  const enabled = settings?.enabledPlugins
  return {
    enabled: enabled && typeof enabled === 'object' ? enabled : {},
    syncOff: settings?.syncClaudeAiPlugins === false,
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
 *    settings turn it or plugin syncing (`syncClaudeAiPlugins`) off, or its
 *    manifest is off by default and the settings don't turn it on.
 * User settings that can't be read count as no plugins at all.
 */
const claudePluginDirs = async (claudeDir) => {
  const pluginsDir = path.join(claudeDir, 'plugins')
  const settings = await userPluginSettings(claudeDir)
  if (!settings) return []
  const { enabled, syncOff } = settings
  const dirs = []
  for (const marketplaceDir of await subdirsOf(
    path.join(pluginsDir, 'cache'),
  )) {
    for (const pluginDir of await subdirsOf(marketplaceDir)) {
      const id = `${path.basename(pluginDir)}@${path.basename(marketplaceDir)}`
      if (enabled[id] !== true) continue
      for (const versionDir of await subdirsOf(pluginDir)) {
        if (await exists(path.join(versionDir, '.orphaned_at'))) continue
        dirs.push({ dir: versionDir, id, key: id, synced: false })
      }
    }
  }
  if (syncOff) return dirs
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
      dirs.push({ dir: pluginDir, key: `${name}@synced`, synced: true })
    }
  }
  return dirs
}

/**
 * What the project and local settings of `projectDir` and every folder above
 * it turn off: `disabled` holds the `enabledPlugins` keys set to false, and
 * `syncOff` is true when one sets `syncClaudeAiPlugins` to false. Claude Code
 * reads these files in the folder it runs in, which may be the service or a
 * folder above it (the root of a monorepo), so a setting in any of them
 * counts. Settings that turn a plugin on are not collected: they hold only
 * when Claude Code runs in that folder. A file that exists but can't be read
 * or parsed returns undefined, since it could turn any plugin off.
 */
const projectPluginOverrides = async (projectDir) => {
  const disabled = new Set()
  let syncOff = false
  // Claude Code runs in the physical folder, so a path through a symlink is
  // resolved first; one that can't be resolved counts as unreadable.
  let current
  try {
    current = await realpath(projectDir)
  } catch {
    return undefined
  }
  for (;;) {
    for (const file of ['settings.json', 'settings.local.json']) {
      let content
      try {
        content = await readFile(path.join(current, '.claude', file), 'utf8')
      } catch (error) {
        if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') continue
        return undefined
      }
      let settings
      try {
        settings = JSON.parse(content)
      } catch {
        return undefined
      }
      const enabled = settings?.enabledPlugins
      if (enabled && typeof enabled === 'object')
        for (const [key, value] of Object.entries(enabled))
          if (value === false) disabled.add(key)
      if (settings?.syncClaudeAiPlugins === false) syncOff = true
    }
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }
  return { disabled, syncOff }
}

/**
 * @param {object} args
 * @param {string} [args.projectDir] the service a project skill is for: a
 *   plugin its project or local settings turn off doesn't count there
 * @returns {Promise<{version: number, id?: string}|undefined>} the newest
 *   Framework-managed copy of `skillName` among the plugins Claude Code loads
 *   for this user (and in `projectDir`, when given), with the id of the plugin
 *   that holds it when it has one
 */
export const findClaudePluginSkill = async ({
  homeDir,
  skillName,
  projectDir,
}) => {
  if (!homeDir) return undefined
  let overrides
  if (projectDir) {
    overrides = await projectPluginOverrides(projectDir)
    if (!overrides) return undefined
  }
  let newest
  for (const { dir, id, key, synced } of await claudePluginDirs(
    path.join(homeDir, '.claude'),
  )) {
    if (overrides?.disabled.has(key) || (synced && overrides?.syncOff)) continue
    const version = await managedVersionIn(dir, skillName)
    if (version !== undefined && (!newest || version > newest.version))
      newest = id ? { version, id } : { version }
  }
  return newest
}
