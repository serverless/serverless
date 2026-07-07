/**
 * Shared reader for bundled Agent Skills. Used at BUILD time by esbuild.js
 * (embedding into __SF_SKILLS_MANIFEST__) and at RUNTIME as the source-run
 * fallback — one function, so the two paths cannot drift.
 */
import { readdir, readFile, stat } from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import yaml from 'js-yaml'

/** Parse YAML frontmatter between leading --- markers. Null if absent/bad. */
export const parseFrontmatter = (content) => {
  if (typeof content !== 'string' || !content.startsWith('---')) return null
  const end = content.indexOf('\n---', 3)
  if (end === -1) return null
  try {
    // JSON_SCHEMA: installed SKILL.md files are untrusted input (cloned
    // repos may contain arbitrary skills) — restrict parsing to plain data
    // (strings/numbers/objects), no custom/typed YAML tags.
    const parsed = yaml.load(content.slice(3, end + 1), {
      schema: yaml.JSON_SCHEMA,
    })
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

const readFilesRecursively = async (dir, base = dir, out = {}) => {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) await readFilesRecursively(full, base, out)
    else if (entry.isFile())
      out[path.relative(base, full).split(path.sep).join('/')] = await readFile(
        full,
        'utf8',
      )
  }
  return out
}

/**
 * @returns {Promise<Array<{name: string, version: number, files: Record<string,string>}>>}
 */
export const readSkillsFromDir = async (dirPath, { strict = false } = {}) => {
  const dir = dirPath instanceof URL ? fileURLToPath(dirPath) : String(dirPath)
  const skills = []
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const skillDir = path.join(dir, entry.name)
    const skillMdPath = path.join(skillDir, 'SKILL.md')
    try {
      await stat(skillMdPath)
    } catch {
      if (strict) throw new Error(`Skill "${entry.name}" is missing SKILL.md`)
      continue
    }
    const files = await readFilesRecursively(skillDir)
    const fm = parseFrontmatter(files['SKILL.md'])
    if (strict) {
      if (!fm) throw new Error(`Skill "${entry.name}": invalid frontmatter`)
      if (fm.name !== entry.name)
        throw new Error(
          `Skill frontmatter name "${fm.name}" must equal directory name "${entry.name}"`,
        )
      if (!fm.description)
        throw new Error(`Skill "${entry.name}": description is required`)
      if (fm.metadata?.['managed-by'] !== 'serverless-framework')
        throw new Error(
          `Skill "${entry.name}": metadata.managed-by must be "serverless-framework"`,
        )
      if (!/^\d+$/.test(String(fm.metadata?.version ?? '')))
        throw new Error(
          `Skill "${entry.name}": metadata.version must be an integer string`,
        )
    }
    skills.push({
      name: entry.name,
      version: parseInt(fm?.metadata?.version, 10) || 0,
      files,
    })
  }
  return skills.sort((a, b) => a.name.localeCompare(b.name))
}
