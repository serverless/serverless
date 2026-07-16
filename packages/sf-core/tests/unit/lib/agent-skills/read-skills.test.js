import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import {
  parseFrontmatter,
  readSkillsFromDir,
} from '../../../../src/lib/agent-skills/read-skills.js'

const SKILL_MD = `---
name: serverless-config
description: Test skill
metadata:
  managed-by: serverless-framework
  version: "3"
---
# Body
`

describe('parseFrontmatter', () => {
  it('parses valid frontmatter', () => {
    const fm = parseFrontmatter(SKILL_MD)
    expect(fm.name).toBe('serverless-config')
    expect(fm.metadata['managed-by']).toBe('serverless-framework')
    expect(fm.metadata.version).toBe('3')
  })
  it('returns null when no frontmatter', () => {
    expect(parseFrontmatter('# Just markdown')).toBeNull()
  })
  it('returns null on malformed YAML instead of throwing', () => {
    expect(parseFrontmatter('---\n: : :\nbad\n---\nbody')).toBeNull()
  })
})

describe('readSkillsFromDir', () => {
  let dir
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'skills-src-'))
  })
  afterEach(async () => rm(dir, { recursive: true, force: true }))

  it('reads skills with aux files, parses version as number', async () => {
    await mkdir(path.join(dir, 'serverless-config', 'references'), {
      recursive: true,
    })
    await writeFile(path.join(dir, 'serverless-config', 'SKILL.md'), SKILL_MD)
    await writeFile(
      path.join(dir, 'serverless-config', 'references', 'ex.md'),
      'aux',
    )
    const skills = await readSkillsFromDir(dir)
    expect(skills).toHaveLength(1)
    expect(skills[0].name).toBe('serverless-config')
    expect(skills[0].version).toBe(3)
    expect(Object.keys(skills[0].files).sort()).toEqual([
      'SKILL.md',
      'references/ex.md',
    ])
  })

  it('skips loose files and dirs without SKILL.md', async () => {
    await writeFile(path.join(dir, 'README.md'), 'not a skill')
    await mkdir(path.join(dir, 'empty-dir'))
    expect(await readSkillsFromDir(dir)).toEqual([])
  })

  it('strict mode throws when name mismatches dir', async () => {
    await mkdir(path.join(dir, 'wrong-name'))
    await writeFile(path.join(dir, 'wrong-name', 'SKILL.md'), SKILL_MD)
    await expect(readSkillsFromDir(dir, { strict: true })).rejects.toThrow(
      /name.*wrong-name/i,
    )
  })
})
