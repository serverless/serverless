/**
 * The sync engine: converge target skills dirs to the bundled skill set.
 * Pure of policy — callers decide WHICH dirs (see resolve-targets.js).
 * Invariants: never delete; only overwrite files whose SKILL.md carries
 * metadata.managed-by: serverless-framework AND a lower version.
 */
import { mkdir, readdir, readFile, rename, writeFile } from 'fs/promises'
import path from 'path'
import { parseFrontmatter } from './read-skills.js'

export const MANAGED_BY = 'serverless-framework'

const readInstalledMeta = async (skillDir) => {
  let content
  try {
    content = await readFile(path.join(skillDir, 'SKILL.md'), 'utf8')
  } catch {
    return { present: false }
  }
  const fm = parseFrontmatter(content)
  const managed = fm?.metadata?.['managed-by'] === MANAGED_BY
  const version = parseInt(fm?.metadata?.version, 10) || 0
  return { present: true, managed, version }
}

/** True when the dir contains at least one skill we manage. */
export const hasManagedSkills = async (skillsDir) => {
  let entries
  try {
    entries = await readdir(skillsDir, { withFileTypes: true })
  } catch {
    return false
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const meta = await readInstalledMeta(path.join(skillsDir, entry.name))
    if (meta.present && meta.managed) return true
  }
  return false
}

const writeFileAtomic = async (filePath, content) => {
  await mkdir(path.dirname(filePath), { recursive: true })
  const tmp = `${filePath}.tmp-sf`
  await writeFile(tmp, content, 'utf8')
  await rename(tmp, filePath)
}

const writeSkill = async (skillsDir, skill) => {
  for (const [relPath, content] of Object.entries(skill.files)) {
    await writeFileAtomic(
      path.join(skillsDir, skill.name, ...relPath.split('/')),
      content,
    )
  }
}

/**
 * @param {Object} p
 * @param {Array<{name: string, version: number, files: Record<string,string>}>} p.bundledSkills
 * @param {string[]} p.targetDirs absolute paths of `<agent>/skills` dirs
 * @returns {Promise<{changes: Array, skipped: Array}>}
 */
export const syncSkills = async ({ bundledSkills, targetDirs }) => {
  const changes = []
  const skipped = []
  for (const dir of targetDirs) {
    for (const skill of bundledSkills) {
      const meta = await readInstalledMeta(path.join(dir, skill.name))
      try {
        if (!meta.present) {
          await writeSkill(dir, skill)
          changes.push({
            skill: skill.name,
            dir,
            action: 'added',
            toVersion: skill.version,
          })
        } else if (!meta.managed) {
          skipped.push({ skill: skill.name, dir, reason: 'ejected' })
        } else if (skill.version > meta.version) {
          await writeSkill(dir, skill)
          changes.push({
            skill: skill.name,
            dir,
            action: 'upgraded',
            fromVersion: meta.version,
            toVersion: skill.version,
          })
        } else {
          skipped.push({ skill: skill.name, dir, reason: 'up-to-date' })
        }
      } catch {
        skipped.push({ skill: skill.name, dir, reason: 'unwritable' })
      }
    }
  }
  return { changes, skipped }
}
