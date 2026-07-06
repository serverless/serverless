/**
 * Post-command auto-update: silently converge already-installed managed
 * skills to the bundled set. Guards: never in CI, never for the `agent`
 * command itself, never without a service config, and NEVER throws —
 * a skills problem must not break the user's actual command.
 */
import os from 'os'
import path from 'path'
import { log, isCICDEnvironment } from '@serverless/util'
import { getBundledSkills } from './manifest.js'
import { resolveTargetDirs } from './resolve-targets.js'
import { syncSkills } from './engine.js'

export const autoUpdateAgentSkills = async ({
  command,
  configFilePath,
  homeDir = os.homedir(),
  getBundled = getBundledSkills, // test seam
}) => {
  const logger = log.get('core:agent-skills:auto-update')
  try {
    if (!configFilePath) return
    if (command?.[0] === 'agent') return
    if (isCICDEnvironment()) return

    const serviceDir = path.dirname(configFilePath)
    const targetDirs = await resolveTargetDirs({
      mode: 'auto',
      serviceDir,
      homeDir,
    })
    if (!targetDirs.length) return // opt-in gate

    const bundledSkills = await getBundled()
    if (!bundledSkills.length) return
    const report = await syncSkills({ bundledSkills, targetDirs })
    if (report.changes.length) {
      const summary = report.changes
        .map((c) =>
          c.action === 'added'
            ? `+${c.skill}`
            : `${c.skill} v${c.fromVersion}→v${c.toVersion}`,
        )
        .join(', ')
      logger.notice(`Serverless agent skills updated: ${summary}`)
    }
  } catch (error) {
    logger.debug('Agent skills auto-update failed:', error?.message || error)
  }
}
