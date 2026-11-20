/**
 * Converge the user-scope skills into the home skills dirs. Shared by
 * `agent setup` and `agent skills install`, which report the outcome each in
 * its own format.
 *
 * Targets are resolved per skill, because a skill Claude Code already loads
 * from an installed plugin is not written to `~/.claude/skills` a second time
 * (see resolveUserSkillTargetDirs).
 */
import { syncSkills } from './engine.js'
import { DIR_MAP, resolveUserSkillTargetDirs } from './resolve-targets.js'

/**
 * @returns {Promise<{
 *   report: {changes: Array, skipped: Array},
 *   dirs: string[],
 *   pluginCopies: Array<{skill: string, version: number, alsoInstalled: boolean, older?: boolean, id?: string}>
 * }>} `dirs` are the home dirs written to or checked, in resolution order;
 *   `pluginCopies` name the skills a Claude Code plugin provides
 */
export const syncUserSkills = async ({ userSkills, homeDir, dirFlags }) => {
  const report = { changes: [], skipped: [] }
  const dirs = []
  const pluginCopies = []
  for (const skill of userSkills) {
    const target = await resolveUserSkillTargetDirs({
      homeDir,
      dirFlags,
      skill,
    })
    const skillReport = await syncSkills({
      bundledSkills: [skill],
      targetDirs: target.dirs,
    })
    report.changes.push(...skillReport.changes)
    report.skipped.push(...skillReport.skipped)
    for (const dir of target.dirs) if (!dirs.includes(dir)) dirs.push(dir)
    if (target.plugin)
      pluginCopies.push({ skill: skill.name, ...target.plugin })
  }
  return { report, dirs, pluginCopies }
}

/** One report line for a skill that a Claude Code plugin provides. */
export const pluginCopyNote = ({ skill, alsoInstalled, older, id }) => {
  const claudeDir = `~/${DIR_MAP.claude}`
  if (older) {
    const update = id ? `run "claude plugin update ${id}"` : 'update the plugin'
    return `${skill}: Claude Code lists it twice, from an installed plugin and from ${claudeDir}, and the plugin's copy is older — to keep one, ${update}, then delete ${claudeDir}/${skill}`
  }
  return alsoInstalled
    ? `${skill}: Claude Code lists it twice, from an installed plugin and from ${claudeDir} — to keep one, delete ${claudeDir}/${skill}`
    : `${skill}: Claude Code loads it from an installed plugin, so it is not installed in ${claudeDir}`
}
