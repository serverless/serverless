/**
 * Detection ladder for which skills dirs to write, highest precedence first:
 * --dir override > managed presence > service agent dirs > home detection > both.
 * Auto mode uses ONLY managed presence (the opt-in gate) — never bootstraps.
 */
import { stat } from 'fs/promises'
import path from 'path'
import { ServerlessError, ServerlessErrorCodes } from '@serverless/util'
import { hasManagedSkills, readInstalledMeta } from './engine.js'
import { findClaudePluginSkill } from './plugin-skills.js'

export const DIR_MAP = { claude: '.claude/skills', agents: '.agents/skills' }

// Home markers → DIR_MAP key. ~/.agents is direct standard usage; ~/.codex
// and ~/.cursor indicate apps that read .agents/skills.
const HOME_MARKERS = {
  '.claude': 'claude',
  '.agents': 'agents',
  '.codex': 'agents',
  '.cursor': 'agents',
}

const dirExists = async (p) => {
  try {
    return (await stat(p)).isDirectory()
  } catch {
    return false
  }
}

const toAbs = (serviceDir, keys) =>
  [...new Set(keys)].map((k) => path.join(serviceDir, ...DIR_MAP[k].split('/')))

/**
 * Reject unknown `--dir` values. Split out of resolveTargetDirs so callers that
 * may never reach the project half (`agent setup` outside a service directory)
 * still fail on a bad flag instead of silently ignoring it.
 */
export const assertValidDirFlags = (dirFlags) => {
  for (const flag of dirFlags ?? []) {
    if (!DIR_MAP[flag])
      throw new ServerlessError(
        `Unknown --dir value "${flag}". Valid values: ${Object.keys(DIR_MAP).join(', ')}`,
        ServerlessErrorCodes.general.INVALID_CLI_INPUT,
        { stack: false },
      )
  }
}

export const resolveTargetDirs = async ({
  mode,
  dirFlags,
  serviceDir,
  homeDir,
}) => {
  // 1. Explicit --dir (install only): exact targets, creates them.
  if (mode === 'install' && dirFlags?.length) {
    assertValidDirFlags(dirFlags)
    return toAbs(serviceDir, dirFlags)
  }

  // 2. Managed presence: converge exactly where our skills already live.
  const withManaged = []
  for (const key of Object.keys(DIR_MAP)) {
    const abs = toAbs(serviceDir, [key])[0]
    if (await hasManagedSkills(abs)) withManaged.push(key)
  }
  if (withManaged.length) return toAbs(serviceDir, withManaged)
  if (mode === 'auto') return [] // opt-in gate: auto never bootstraps

  // 3. Service-level agent dirs (the team's revealed preference).
  const serviceDetected = []
  for (const [marker, key] of [
    ['.claude', 'claude'],
    ['.agents', 'agents'],
  ]) {
    if (await dirExists(path.join(serviceDir, marker)))
      serviceDetected.push(key)
  }
  if (serviceDetected.length) return toAbs(serviceDir, serviceDetected)

  // 4. Home-dir detection (what does this developer run?). Callers may pass no
  // homeDir when it could not be resolved — then this rung simply has nothing
  // to detect and we fall through to the safe default.
  const homeDetected = []
  for (const [marker, key] of homeDir ? Object.entries(HOME_MARKERS) : []) {
    if (await dirExists(path.join(homeDir, marker))) homeDetected.push(key)
  }
  if (homeDetected.length) return toAbs(serviceDir, homeDetected)

  // 5. Safe default: both.
  return toAbs(serviceDir, Object.keys(DIR_MAP))
}

/**
 * User-scope targets: the `--dir` dirs when given, else home-rooted skills
 * dirs for detected agents.
 */
export const resolveUserTargetDirs = async ({ homeDir, dirFlags }) => {
  if (dirFlags?.length) {
    assertValidDirFlags(dirFlags)
    return toAbs(homeDir, dirFlags)
  }
  const detected = []
  for (const [marker, key] of Object.entries(HOME_MARKERS)) {
    if (await dirExists(path.join(homeDir, marker))) detected.push(key)
  }
  const keys = detected.length ? [...new Set(detected)] : Object.keys(DIR_MAP)
  return keys.map((k) => path.join(homeDir, ...DIR_MAP[k].split('/')))
}

/**
 * User-scope targets for ONE skill: the dirs resolveUserTargetDirs picks,
 * leaving out `~/.claude/skills` when a Claude Code plugin already provides the
 * skill (withoutPluginCopy has the rules). Explicit `--dir` targets are kept
 * as they are, with no plugin note.
 *
 * @returns {Promise<{dirs: string[], plugin?: {version: number, alsoInstalled: boolean, older?: boolean, id?: string}}>}
 */
export const resolveUserSkillTargetDirs = async ({
  homeDir,
  dirFlags,
  skill,
  findPluginSkill = findClaudePluginSkill, // test seam
}) => {
  const dirs = await resolveUserTargetDirs({ homeDir, dirFlags })
  if (dirFlags?.length) return { dirs }
  return withoutPluginCopy({
    dirs,
    claudeDir: path.join(homeDir, ...DIR_MAP.claude.split('/')),
    skill,
    findPlugin: () => findPluginSkill({ homeDir, skillName: skill.name }),
  })
}

/**
 * Project-scope targets for ONE skill: `targetDirs` (from resolveTargetDirs)
 * with the same plugin rules as resolveUserSkillTargetDirs, applied to the
 * service's `.claude/skills`. Only a plugin that Claude Code loads for the
 * user, and that the project's settings don't turn off, counts. A copy already
 * in the service stays a target, so a copy teammates committed keeps getting
 * updates.
 *
 * @returns {Promise<{dirs: string[], plugin?: {version: number, alsoInstalled: boolean, older?: boolean, id?: string}}>}
 */
export const resolveProjectSkillTargetDirs = async ({
  targetDirs,
  serviceDir,
  homeDir,
  dirFlags,
  skill,
  findPluginSkill = findClaudePluginSkill, // test seam
}) => {
  if (dirFlags?.length || !homeDir) return { dirs: targetDirs }
  return withoutPluginCopy({
    dirs: targetDirs,
    claudeDir: path.join(serviceDir, ...DIR_MAP.claude.split('/')),
    skill,
    findPlugin: () =>
      findPluginSkill({
        homeDir,
        skillName: skill.name,
        projectDir: serviceDir,
      }),
  })
}

/**
 * Claude Code lists a plugin's skill and a skill of the same name in a skills
 * dir it reads side by side. So when a plugin provides `skill` at the bundled
 * version or newer:
 *  - nothing in `claudeDir` yet: that dir is left out. No other dir takes its
 *    place: creating `.agents` here would change which dirs later runs pick;
 *  - a managed copy is already there: it stays a target (this CLI never
 *    deletes), and `alsoInstalled` lets the caller say that it is listed twice.
 * When the plugin's copy is older, `claudeDir` stays a target so the bundled
 * version is installed, and `older` lets the caller say that it is listed
 * twice and that the plugin needs an update (`id` names it for
 * `claude plugin update` when it has one). A copy the user customized leaves
 * the dirs as they are, with no plugin note, and so does a `claudeDir` that
 * isn't a target.
 */
const withoutPluginCopy = async ({ dirs, claudeDir, skill, findPlugin }) => {
  if (!dirs.includes(claudeDir)) return { dirs }
  const installed = await readInstalledMeta(path.join(claudeDir, skill.name))
  if (installed.present && !installed.managed) return { dirs }
  const plugin = await findPlugin()
  if (!plugin) return { dirs }
  if (plugin.version < skill.version)
    return {
      dirs,
      plugin: {
        version: plugin.version,
        alsoInstalled: true,
        older: true,
        ...(plugin.id && { id: plugin.id }),
      },
    }
  if (installed.present)
    return { dirs, plugin: { version: plugin.version, alsoInstalled: true } }
  return {
    dirs: dirs.filter((dir) => dir !== claudeDir),
    plugin: { version: plugin.version, alsoInstalled: false },
  }
}
