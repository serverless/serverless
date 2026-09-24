/**
 * `serverless agent skills install` — install/refresh bundled Agent Skills.
 * Project-scope skills go into the service directory; user-scope skills (the
 * gateway) go into the home-rooted agent dirs. Outside a service only the
 * user-scope skills install. Idempotent: re-running = update.
 */
import os from 'os'
import path from 'path'
import { log } from '@serverless/util'
import { getBundledSkills } from '../../agent-skills/manifest.js'
import {
  assertValidDirFlags,
  resolveTargetDirs,
  resolveUserTargetDirs,
} from '../../agent-skills/resolve-targets.js'
import { syncSkills } from '../../agent-skills/engine.js'

/**
 * Render a path for display. path.relative/path.join hand back backslashes on
 * Windows, and every line that prints one of these also appends a literal "/"
 * (or sits beside one), so an un-normalized value renders mixed separators.
 * Display paths are slash-separated on every platform.
 */
export const toDisplayPath = (relativePath) =>
  relativePath.split(path.sep).join('/')

/**
 * Normalize the repeatable `--dir` flag.
 * It may arrive as an array, a single string, or (when the CLI re-serializes
 * argv internally) a comma-joined string like "claude,agents". Valid values
 * never contain commas, so a comma is unambiguously a delimiter.
 * Shared with `agent setup`, which honors the same flag.
 * @returns {string[]|undefined} undefined when the flag was not given
 */
export const normalizeDirFlags = (dir) =>
  dir === undefined
    ? undefined
    : (Array.isArray(dir) ? dir : [dir])
        .flatMap((value) => String(value).split(','))
        .map((value) => value.trim())
        .filter(Boolean)

export default async function agentSkillsInstall({
  configFilePath,
  options,
  // Resolved below, not as a default param: os.homedir() can throw (e.g. a
  // minimal container with no resolvable home), and a default param is
  // evaluated before any try -- which would fail the whole command instead of
  // degrading to "user-level install skipped".
  homeDir,
  getBundled = getBundledSkills, // test seam
}) {
  const logger = log.get('core:agent-skills')
  // No serverless.yml here: install the user-level skills only.
  const serviceDir = configFilePath ? path.dirname(configFilePath) : undefined
  const dirFlags = normalizeDirFlags(options.dir)
  // Validated here too, so a bad --dir fails even when neither half runs.
  assertValidDirFlags(dirFlags)

  // A falsy home (throw, or HOME='' in a minimal container) must disable every
  // home-rooted path: path.join('', '.claude/skills') is RELATIVE, which would
  // write the gateway into the current working directory.
  let home
  try {
    home = homeDir ?? os.homedir()
  } catch {
    home = undefined
  }

  const bundledSkills = await getBundled()

  // Nothing bundled → nothing to write; skip the Target/target-dir noise
  // (it would announce dirs we never touched) and just say so.
  if (!bundledSkills.length) {
    logger.notice('No skills are bundled with this CLI version.')
    return { changes: [], skipped: [] }
  }

  // The gateway must never land in a repo's skills dir, and project skills
  // must never land in the user's home dirs.
  const userSkills = bundledSkills.filter((s) => s.scope === 'user')
  const projectSkills = bundledSkills.filter((s) => s.scope !== 'user')

  let report = { changes: [], skipped: [] }
  if (serviceDir) {
    // --dir narrows both halves: these project dirs and the user dirs below.
    const targetDirs = await resolveTargetDirs({
      mode: 'install',
      dirFlags,
      serviceDir,
      homeDir: home,
    })
    report = await syncSkills({ bundledSkills: projectSkills, targetDirs })

    for (const dir of targetDirs) {
      logger.notice(`Target: ${toDisplayPath(path.relative(serviceDir, dir))}`)
    }
    for (const c of report.changes) {
      const rel = toDisplayPath(path.relative(serviceDir, c.dir))
      logger.notice(
        c.action === 'added'
          ? `  + ${c.skill} v${c.toVersion} (${rel})`
          : `  ↑ ${c.skill} v${c.fromVersion} → v${c.toVersion} (${rel})`,
      )
    }
    for (const s of report.skipped.filter((s) => s.reason === 'ejected')) {
      logger.notice(
        `  · ${s.skill}: customized by you (no managed-by) — skipped`,
      )
    }
  }

  if (userSkills.length) {
    if (!home) {
      logger.notice(
        'skills: user-level install skipped (no home directory available in this environment)',
      )
    } else {
      const userDirs = await resolveUserTargetDirs({ homeDir: home, dirFlags })
      const userReport = await syncSkills({
        bundledSkills: userSkills,
        targetDirs: userDirs,
      })
      for (const c of userReport.changes) {
        const rel = `~/${toDisplayPath(path.relative(home, c.dir))}`
        logger.notice(
          c.action === 'added'
            ? `  + ${c.skill} v${c.toVersion} (user: ${rel})`
            : `  ↑ ${c.skill} v${c.fromVersion} → v${c.toVersion} (user: ${rel})`,
        )
      }
      for (const s of userReport.skipped.filter(
        (s) => s.reason === 'ejected',
      )) {
        logger.notice(
          `  · ${s.skill}: customized by you (no managed-by) — skipped`,
        )
      }
    }
  }

  if (!serviceDir && projectSkills.length) {
    logger.notice(
      'project skills: no serverless.yml in this directory; run this command in a service directory to install them there',
    )
  }

  logger.notice(
    'Skills auto-update when you use a newer CLI. To customize a skill, remove its metadata.managed-by line. To uninstall, delete the skill folders.',
  )
  // The returned report describes the project-dir sync (the command's contract
  // since it shipped); user-scope changes are reported on the console above.
  return report
}
