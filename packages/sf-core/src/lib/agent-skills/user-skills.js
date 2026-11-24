/**
 * Converge skills one at a time, so a skill Claude Code already loads from an
 * installed plugin is not written to a `.claude/skills` dir a second time
 * (see resolveUserSkillTargetDirs and resolveProjectSkillTargetDirs). Shared
 * by `agent setup`, `agent skills install` and the automatic update, which
 * report the outcome each in its own format.
 */
import { syncSkills } from './engine.js'
import {
  DIR_MAP,
  resolveProjectSkillTargetDirs,
  resolveUserSkillTargetDirs,
} from './resolve-targets.js'
import { findClaudePluginSkill } from './plugin-skills.js'

/**
 * Sync each skill into the dirs `resolve(skill)` returns.
 * @returns {Promise<{report: {changes: Array, skipped: Array}, dirs: string[], pluginCopies: Array}>}
 */
const syncEachSkill = async ({ skills, resolve, copyLabel = {} }) => {
  const report = { changes: [], skipped: [] }
  const dirs = []
  const pluginCopies = []
  for (const skill of skills) {
    const target = await resolve(skill)
    const skillReport = await syncSkills({
      bundledSkills: [skill],
      targetDirs: target.dirs,
    })
    report.changes.push(...skillReport.changes)
    report.skipped.push(...skillReport.skipped)
    for (const dir of target.dirs) if (!dirs.includes(dir)) dirs.push(dir)
    if (target.plugin)
      pluginCopies.push({ skill: skill.name, ...target.plugin, ...copyLabel })
  }
  return { report, dirs, pluginCopies }
}

/**
 * Converge the user-scope skills into the home skills dirs.
 *
 * @returns {Promise<{
 *   report: {changes: Array, skipped: Array},
 *   dirs: string[],
 *   pluginCopies: Array<{skill: string, version: number, alsoInstalled: boolean, older?: boolean, id?: string}>
 * }>} `dirs` are the home dirs written to or checked, in resolution order;
 *   `pluginCopies` name the skills a Claude Code plugin provides
 */
export const syncUserSkills = ({ userSkills, homeDir, dirFlags }) =>
  syncEachSkill({
    skills: userSkills,
    resolve: (skill) =>
      resolveUserSkillTargetDirs({ homeDir, dirFlags, skill }),
  })

/**
 * Converge the project-scope skills into `targetDirs` of a service, leaving a
 * skill out of the service's `.claude/skills` when a Claude Code plugin
 * provides it. `pluginCopies` entries carry the dir to name in the report and
 * `shared: true`, since teammates without the plugin may use the copy there.
 */
export const syncProjectSkills = ({
  projectSkills,
  targetDirs,
  serviceDir,
  homeDir,
  dirFlags,
  findPluginSkill = findClaudePluginSkill, // test seam
}) =>
  syncEachSkill({
    skills: projectSkills,
    resolve: (skill) =>
      resolveProjectSkillTargetDirs({
        targetDirs,
        serviceDir,
        homeDir,
        dirFlags,
        skill,
        findPluginSkill,
      }),
    copyLabel: { dir: DIR_MAP.claude, shared: true },
  })

/**
 * One report line for a skill that a Claude Code plugin provides. `dir` is
 * the skills dir to name (the user's by default); `shared` marks a project
 * dir, whose copy teammates without the plugin may use.
 */
export const pluginCopyNote = ({
  skill,
  alsoInstalled,
  older,
  id,
  dir = `~/${DIR_MAP.claude}`,
  shared = false,
}) => {
  const unlessShared = shared
    ? ', unless teammates without the plugin use it'
    : ''
  if (older) {
    const update = id ? `run "claude plugin update ${id}"` : 'update the plugin'
    return `${skill}: Claude Code lists it twice, from an installed plugin and from ${dir}, and the plugin's copy is older — to keep one, ${update}, then delete ${dir}/${skill}${unlessShared}`
  }
  return alsoInstalled
    ? `${skill}: Claude Code lists it twice, from an installed plugin and from ${dir} — to keep one, delete ${dir}/${skill}${unlessShared}`
    : `${skill}: Claude Code loads it from an installed plugin, so it is not installed in ${dir}${
        shared
          ? ' — teammates without the plugin get it from "serverless agent setup"'
          : ''
      }`
}
