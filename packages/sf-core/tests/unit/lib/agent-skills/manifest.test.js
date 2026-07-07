import { getBundledSkills } from '../../../../src/lib/agent-skills/manifest.js'

it('falls back to reading repo skills/ when no injected manifest (source run)', async () => {
  // In tests __SF_SKILLS_MANIFEST__ is undefined → fallback path.
  const skills = await getBundledSkills()
  expect(Array.isArray(skills)).toBe(true)
  for (const s of skills) {
    expect(typeof s.name).toBe('string')
    expect(typeof s.version).toBe('number')
    expect(s.files['SKILL.md']).toBeDefined()
  }
})
