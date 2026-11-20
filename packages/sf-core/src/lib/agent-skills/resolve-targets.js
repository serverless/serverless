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
 * User-scope targets for ONE skill, taking into account a copy Claude Code
 * already loads from an installed plugin. Claude Code lists a plugin's skill
 * and a skill of the same name in `~/.claude/skills` side by side, so when a
 * plugin provides this skill at the bundled version or newer:
 *  - nothing in `~/.claude/skills` yet: that dir is left out. No other dir
 *    takes its place: creating `~/.agents` here would change which dirs later
 *    runs pick, for project skills too;
 *  - a managed copy is already there: it stays a target (this CLI never
 *    deletes), and `alsoInstalled` lets the caller say that it is listed twice.
 * When the plugin's copy is older, `~/.claude/skills` stays a target so the
 * bundled version is installed, and `older` lets the caller say that it is
 * listed twice and that the plugin needs an update (`id` names it for
 * `claude plugin update` when it has one). A copy the user customized
 * and explicit `--dir` targets leave the dirs as resolveUserTargetDirs picks
 * them, with no plugin note.
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
  const claudeDir = path.join(homeDir, ...DIR_MAP.claude.split('/'))
  if (!dirs.includes(claudeDir)) return { dirs }
  const installed = await readInstalledMeta(path.join(claudeDir, skill.name))
  if (installed.present && !installed.managed) return { dirs }
  const plugin = await findPluginSkill({ homeDir, skillName: skill.name })
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
