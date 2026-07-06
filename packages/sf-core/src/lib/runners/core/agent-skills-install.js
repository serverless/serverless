/**
 * `serverless agent skills install` — install/refresh bundled Agent Skills
 * in the service directory. Idempotent: re-running = update.
 */
import os from 'os'
import path from 'path'
import { log } from '@serverless/util'
import { getBundledSkills } from '../../agent-skills/manifest.js'
import { resolveTargetDirs } from '../../agent-skills/resolve-targets.js'
import { syncSkills } from '../../agent-skills/engine.js'

export default async function agentSkillsInstall({
  configFilePath,
  options,
  homeDir = os.homedir(),
}) {
  const logger = log.get('core:agent-skills')
  const serviceDir = path.dirname(configFilePath)
  // Repeatable --dir may arrive as an array, a single string, or (when the
  // CLI re-serializes argv internally) a comma-joined string like
  // "claude,agents". Valid values never contain commas, so a comma is
  // unambiguously a delimiter.
  const dirFlags =
    options.dir === undefined
      ? undefined
      : (Array.isArray(options.dir) ? options.dir : [options.dir])
          .flatMap((value) => String(value).split(','))
          .map((value) => value.trim())
          .filter(Boolean)

  const targetDirs = await resolveTargetDirs({
    mode: 'install',
    dirFlags,
    serviceDir,
    homeDir,
  })
  const bundledSkills = await getBundledSkills()
  const report = await syncSkills({ bundledSkills, targetDirs })

  for (const dir of targetDirs) {
    logger.notice(`Target: ${path.relative(serviceDir, dir)}`)
  }
  for (const c of report.changes) {
    const rel = path.relative(serviceDir, c.dir)
    logger.notice(
      c.action === 'added'
        ? `  + ${c.skill} v${c.toVersion} (${rel})`
        : `  ↑ ${c.skill} v${c.fromVersion} → v${c.toVersion} (${rel})`,
    )
  }
  for (const s of report.skipped.filter((s) => s.reason === 'ejected')) {
    logger.notice(`  · ${s.skill}: customized by you (no managed-by) — skipped`)
  }
  if (!bundledSkills.length) {
    logger.notice('No skills are bundled with this CLI version.')
  } else {
    logger.notice(
      'Skills auto-update when you use a newer CLI. To customize a skill, remove its metadata.managed-by line. To uninstall, delete the skill folders.',
    )
  }
  return report
}
