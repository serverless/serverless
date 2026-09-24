/**
 * Post-command auto-update: silently converge already-installed managed
 * skills to the bundled set — user-scope skills in the home dirs, project
 * skills in the service dirs, each only where our skills already live.
 * Guards: never in CI, never for the `agent` command itself, no service
 * config skips the project half, and NEVER throws — a skills problem must
 * not break the user's actual command.
 */
import os from 'os'
import path from 'path'
import { log, isCICDEnvironment } from '@serverless/util'
import { getBundledSkills } from './manifest.js'
import { resolveTargetDirs, resolveUserTargetDirs } from './resolve-targets.js'
import { hasManagedSkills, syncSkills } from './engine.js'

export const autoUpdateAgentSkills = async ({
  command,
  configFilePath,
  // Resolved inside the try below, not as a default param: os.homedir() can
  // throw (e.g. a minimal container with no resolvable home), and a default
  // param is evaluated before the try is entered -- which would defeat the
  // "never throws" guarantee this hook depends on.
  homeDir,
  getBundled = getBundledSkills, // test seam
}) => {
  const logger = log.get('core:agent-skills:auto-update')
  try {
    if (command?.[0] === 'agent') return
    if (isCICDEnvironment()) return

    const bundledSkills = await getBundled()
    if (!bundledSkills.length) return
    // A falsy home (HOME='' in a minimal container) must disable every
    // home-rooted path: path.join('', '.claude/skills') is RELATIVE, which
    // would write skills into the current working directory.
    const home = homeDir ?? os.homedir()
    const changes = []

    // User half: converge only where our managed skills already live — never
    // bootstraps a home dir, and never runs on project skills.
    const userSkills = bundledSkills.filter((s) => s.scope === 'user')
    if (home && userSkills.length) {
      const candidates = await resolveUserTargetDirs({ homeDir: home })
      const targets = []
      for (const dir of candidates) {
        if (await hasManagedSkills(dir)) targets.push(dir)
      }
      if (targets.length) {
        const userReport = await syncSkills({
          bundledSkills: userSkills,
          targetDirs: targets,
        })
        changes.push(...userReport.changes)
      }
    }

    // Project half: unchanged opt-in gate, now scope-filtered.
    if (configFilePath) {
      const serviceDir = path.dirname(configFilePath)
      const targetDirs = await resolveTargetDirs({
        mode: 'auto',
        serviceDir,
        homeDir: home,
      })
      if (targetDirs.length) {
        const projectSkills = bundledSkills.filter((s) => s.scope !== 'user')
        const projectReport = await syncSkills({
          bundledSkills: projectSkills,
          targetDirs,
        })
        changes.push(...projectReport.changes)
      }
    }

    if (changes.length) {
      const summary = changes
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
