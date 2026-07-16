import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import {
  syncSkills,
  hasManagedSkills,
} from '../../../../src/lib/agent-skills/engine.js'

const managedMd = (version) => `---
name: sls-test
description: d
metadata:
  managed-by: serverless-framework
  version: "${version}"
---
body v${version}
`
const bundled = (version) => [
  { name: 'sls-test', version, files: { 'SKILL.md': managedMd(version) } },
]

let dir, skillsDir
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'svc-'))
  skillsDir = path.join(dir, '.claude', 'skills')
})
afterEach(async () => rm(dir, { recursive: true, force: true }))

const installedMd = () =>
  readFile(path.join(skillsDir, 'sls-test', 'SKILL.md'), 'utf8')

describe('syncSkills decision matrix', () => {
  it('adds absent skill (creates dirs)', async () => {
    const report = await syncSkills({
      bundledSkills: bundled(1),
      targetDirs: [skillsDir],
    })
    expect(report.changes).toEqual([
      { skill: 'sls-test', dir: skillsDir, action: 'added', toVersion: 1 },
    ])
    expect(await installedMd()).toContain('body v1')
  })

  it('upgrades older managed skill', async () => {
    await syncSkills({ bundledSkills: bundled(1), targetDirs: [skillsDir] })
    const report = await syncSkills({
      bundledSkills: bundled(2),
      targetDirs: [skillsDir],
    })
    expect(report.changes[0]).toMatchObject({
      action: 'upgraded',
      fromVersion: 1,
      toVersion: 2,
    })
    expect(await installedMd()).toContain('body v2')
  })

  it('NEVER downgrades (ping-pong regression: old CLI vs newer installed)', async () => {
    await syncSkills({ bundledSkills: bundled(3), targetDirs: [skillsDir] })
    const report = await syncSkills({
      bundledSkills: bundled(2),
      targetDirs: [skillsDir],
    })
    expect(report.changes).toEqual([])
    expect(report.skipped[0].reason).toBe('up-to-date')
    expect(await installedMd()).toContain('body v3')
  })

  it('equal version untouched', async () => {
    await syncSkills({ bundledSkills: bundled(2), targetDirs: [skillsDir] })
    const report = await syncSkills({
      bundledSkills: bundled(2),
      targetDirs: [skillsDir],
    })
    expect(report.changes).toEqual([])
  })

  it('ejected skill (no managed-by) never touched', async () => {
    await mkdir(path.join(skillsDir, 'sls-test'), { recursive: true })
    await writeFile(
      path.join(skillsDir, 'sls-test', 'SKILL.md'),
      '---\nname: sls-test\ndescription: mine now\n---\ncustom',
    )
    const report = await syncSkills({
      bundledSkills: bundled(9),
      targetDirs: [skillsDir],
    })
    expect(report.skipped[0].reason).toBe('ejected')
    expect(await installedMd()).toContain('custom')
  })

  it('managed with garbage version treated as 0 → upgraded', async () => {
    await mkdir(path.join(skillsDir, 'sls-test'), { recursive: true })
    await writeFile(
      path.join(skillsDir, 'sls-test', 'SKILL.md'),
      '---\nname: sls-test\ndescription: d\nmetadata:\n  managed-by: serverless-framework\n  version: banana\n---\nold',
    )
    const report = await syncSkills({
      bundledSkills: bundled(1),
      targetDirs: [skillsDir],
    })
    expect(report.changes[0]).toMatchObject({
      action: 'upgraded',
      fromVersion: 0,
    })
  })

  it('malformed frontmatter treated as ejected, no crash', async () => {
    await mkdir(path.join(skillsDir, 'sls-test'), { recursive: true })
    await writeFile(
      path.join(skillsDir, 'sls-test', 'SKILL.md'),
      '---\n: : bad\n---\nx',
    )
    const report = await syncSkills({
      bundledSkills: bundled(1),
      targetDirs: [skillsDir],
    })
    expect(report.skipped[0].reason).toBe('ejected')
  })

  it('never deletes: stray user file inside our skill dir survives upgrade; dropped aux files remain', async () => {
    const withAux = [
      {
        name: 'sls-test',
        version: 1,
        files: { 'SKILL.md': managedMd(1), 'references/old.md': 'aux' },
      },
    ]
    await syncSkills({ bundledSkills: withAux, targetDirs: [skillsDir] })
    await writeFile(path.join(skillsDir, 'sls-test', 'NOTES.md'), 'user notes')
    await syncSkills({ bundledSkills: bundled(2), targetDirs: [skillsDir] }) // v2 drops the aux file
    const remaining = await readdir(path.join(skillsDir, 'sls-test'), {
      recursive: true,
    })
    expect(remaining).toEqual(expect.arrayContaining(['NOTES.md', 'SKILL.md']))
    expect(
      await readFile(
        path.join(skillsDir, 'sls-test', 'references', 'old.md'),
        'utf8',
      ),
    ).toBe('aux')
  })

  it('no tmp files left behind', async () => {
    await syncSkills({ bundledSkills: bundled(1), targetDirs: [skillsDir] })
    const all = await readdir(path.join(skillsDir, 'sls-test'), {
      recursive: true,
    })
    expect(all.filter((f) => f.includes('.tmp-sf'))).toEqual([])
  })
})

describe('hasManagedSkills', () => {
  it('false for missing dir, false for unmanaged content, true after sync', async () => {
    expect(await hasManagedSkills(skillsDir)).toBe(false)
    await mkdir(path.join(skillsDir, 'other'), { recursive: true })
    await writeFile(
      path.join(skillsDir, 'other', 'SKILL.md'),
      '---\nname: other\ndescription: x\n---\n',
    )
    expect(await hasManagedSkills(skillsDir)).toBe(false)
    await syncSkills({ bundledSkills: bundled(1), targetDirs: [skillsDir] })
    expect(await hasManagedSkills(skillsDir)).toBe(true)
  })
})
