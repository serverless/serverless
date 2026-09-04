/**
 * CI lint for /skills: enforces the frontmatter contract (via strict
 * readSkillsFromDir) and the anti-stale rules — content that no longer matches
 * its manifest baseline fails the build, whether metadata.version stayed the
 * same (bump it) or was bumped without regenerating the manifest (--update).
 * Usage: node packages/sf-core/scripts/lint-skills.js [--update]
 */
import { readFile, writeFile } from 'fs/promises'
import { createHash } from 'crypto'
import { fileURLToPath } from 'url'
import { readSkillsFromDir } from '../src/lib/agent-skills/read-skills.js'

const contentHash = (skill) =>
  createHash('sha256')
    .update(
      Object.keys(skill.files)
        .sort()
        .map((f) => `${f}\n${skill.files[f]}`)
        .join('\n\x00'),
    )
    .digest('hex')

export const lintSkills = async ({
  skillsDir,
  manifestPath,
  update = false,
}) => {
  const errors = []
  let skills
  try {
    skills = await readSkillsFromDir(skillsDir, { strict: true })
  } catch (error) {
    return { ok: false, errors: [error.message] }
  }
  let manifest = {}
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  } catch {
    /* first run */
  }
  const next = {}
  for (const skill of skills) {
    const hash = contentHash(skill)
    const prev = manifest[skill.name]
    if (prev && prev.hash !== hash && prev.version === skill.version) {
      errors.push(
        `Skill "${skill.name}": content changed but metadata.version is still "${skill.version}" — bump metadata.version and rerun with --update`,
      )
    }
    // A mismatch under a bumped version means the committed baseline was never
    // regenerated. Left passing it would also disarm the check above for the
    // next editor, whose unbumped edit would compare against the older version.
    // Only outside --update, which is the remedy for this state.
    if (
      prev &&
      prev.hash !== hash &&
      prev.version !== skill.version &&
      !update
    ) {
      errors.push(
        `Skill "${skill.name}": manifest baseline is stale for version ${skill.version} — run \`node packages/sf-core/scripts/lint-skills.js --update\` and commit skills/manifest.json`,
      )
    }
    if (prev && skill.version < prev.version) {
      errors.push(
        `Skill "${skill.name}": metadata.version went backwards (${prev.version} → ${skill.version})`,
      )
    }
    next[skill.name] = { version: skill.version, hash }
  }
  if (update && errors.length === 0) {
    await writeFile(manifestPath, `${JSON.stringify(next, null, 2)}\n`)
  } else if (!update) {
    for (const skill of skills) {
      if (!manifest[skill.name]) {
        errors.push(
          `Skill "${skill.name}" not in manifest — run with --update and commit skills/manifest.json`,
        )
      }
    }
  }
  return { ok: errors.length === 0, errors }
}

// CLI entry
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const update = process.argv.includes('--update')
  const root = new URL('../../../', import.meta.url)
  const { ok, errors } = await lintSkills({
    skillsDir: new URL('skills/', root),
    manifestPath: fileURLToPath(new URL('skills/manifest.json', root)),
    update,
  })
  for (const e of errors) console.error(`✗ ${e}`)
  if (!ok) process.exit(1)
  console.log(update ? 'skills/manifest.json updated' : 'skills lint OK')
}
