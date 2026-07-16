/**
 * Detection ladder for which skills dirs to write, highest precedence first:
 * --dir override > managed presence > service agent dirs > home detection > both.
 * Auto mode uses ONLY managed presence (the opt-in gate) — never bootstraps.
 */
import { stat } from 'fs/promises'
import path from 'path'
import { hasManagedSkills } from './engine.js'

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

export const resolveTargetDirs = async ({
  mode,
  dirFlags,
  serviceDir,
  homeDir,
}) => {
  // 1. Explicit --dir (install only): exact targets, creates them.
  if (mode === 'install' && dirFlags?.length) {
    for (const flag of dirFlags) {
      if (!DIR_MAP[flag])
        throw new Error(
          `Unknown --dir value "${flag}". Valid values: ${Object.keys(DIR_MAP).join(', ')}`,
        )
    }
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

  // 4. Home-dir detection (what does this developer run?).
  const homeDetected = []
  for (const [marker, key] of Object.entries(HOME_MARKERS)) {
    if (await dirExists(path.join(homeDir, marker))) homeDetected.push(key)
  }
  if (homeDetected.length) return toAbs(serviceDir, homeDetected)

  // 5. Safe default: both.
  return toAbs(serviceDir, Object.keys(DIR_MAP))
}
