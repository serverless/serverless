/**
 * `serverless agent skills list` and `serverless agent skills read` — show the
 * Agent Skills bundled with this CLI without installing them. Content comes
 * from the manifest embedded in the bundle (getBundledSkills), so it always
 * matches the installed CLI version; nothing is written to disk.
 */
import { ServerlessError, writeText } from '@serverless/util'
import { getBundledSkills } from '../../agent-skills/manifest.js'
import { parseFrontmatter } from '../../agent-skills/read-skills.js'

const NONE_BUNDLED = 'No skills are bundled with this CLI version.'

const describe = (skill) => {
  const fm = parseFrontmatter(skill.files['SKILL.md'])
  return String(fm?.description ?? '')
    .replace(/\s+/g, ' ')
    .trim()
}

const names = (skills) => skills.map((s) => s.name).join(', ')

export async function agentSkillsList({
  getBundled = getBundledSkills,
  write = writeText,
} = {}) {
  const skills = await getBundled()
  if (!skills.length) {
    write(`${NONE_BUNDLED}\n`)
    return { skills: 0 }
  }
  const nameWidth = Math.max(...skills.map((s) => s.name.length))
  const versionWidth = Math.max(...skills.map((s) => `v${s.version}`.length))
  const scopeWidth = Math.max(
    ...skills.map((s) => (s.scope ?? 'project').length),
  )
  const lines = skills.map(
    (s) =>
      `${s.name.padEnd(nameWidth)}  ${`v${s.version}`.padEnd(versionWidth)}  ${(s.scope ?? 'project').padEnd(scopeWidth)}  ${describe(s)}`,
  )
  write(`${lines.join('\n')}\n`)
  return { skills: skills.length }
}

export async function agentSkillsRead({
  name,
  file = 'SKILL.md',
  getBundled = getBundledSkills,
  write = writeText,
} = {}) {
  const skills = await getBundled()
  if (!skills.length) {
    throw new ServerlessError(NONE_BUNDLED, 'AGENT_SKILL_NOT_FOUND', {
      stack: false,
    })
  }
  if (!name) {
    throw new ServerlessError(
      `Specify a skill to read: serverless agent skills read <name> [file]. Bundled skills: ${names(skills)}`,
      'AGENT_SKILL_NAME_REQUIRED',
      { stack: false },
    )
  }
  const skill = skills.find((s) => s.name === name)
  if (!skill) {
    throw new ServerlessError(
      `Unknown skill "${name}". Bundled skills: ${names(skills)}`,
      'AGENT_SKILL_NOT_FOUND',
      { stack: false },
    )
  }
  const wanted = String(file).replace(/\\/g, '/')
  const files = Object.keys(skill.files).sort((a, b) =>
    a === 'SKILL.md' ? -1 : b === 'SKILL.md' ? 1 : a.localeCompare(b),
  )
  // hasOwn, not `in`: `files` is a plain object literal, so `in` would accept
  // inherited keys ("toString", "constructor") and then hand back a function
  // instead of file content.
  if (!Object.hasOwn(skill.files, wanted)) {
    throw new ServerlessError(
      `"${file}" is not part of ${name}. Files: ${files.join(', ')}`,
      'AGENT_SKILL_FILE_NOT_FOUND',
      { stack: false },
    )
  }
  const others = files.filter((f) => f !== wanted)
  let out = skill.files[wanted].replace(/\s*$/, '\n')
  if (others.length) {
    out += `\nfiles: ${others.join(', ')} — read one with: serverless agent skills read ${name} <file>\n`
  }
  write(out)
  return { skill: name, file: wanted }
}
