import { mkdtemp, mkdir, writeFile, readFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { lintSkills } from '../../../../scripts/lint-skills.js'

const md = (v, body = 'body') => `---
name: sls-test
description: d
metadata:
  managed-by: serverless-framework
  version: "${v}"
---
${body}
`
let dir, manifestPath
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'skills-'))
  manifestPath = path.join(dir, 'manifest.json')
  await writeFile(manifestPath, '{}')
  await mkdir(path.join(dir, 'sls-test'))
  await writeFile(path.join(dir, 'sls-test', 'SKILL.md'), md(1))
})
afterEach(async () => rm(dir, { recursive: true, force: true }))

it('--update records version+hash; then passes clean', async () => {
  expect(
    (await lintSkills({ skillsDir: dir, manifestPath, update: true })).ok,
  ).toBe(true)
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  expect(manifest['sls-test'].version).toBe(1)
  expect((await lintSkills({ skillsDir: dir, manifestPath })).ok).toBe(true)
})

it('fails when content changes without version bump', async () => {
  await lintSkills({ skillsDir: dir, manifestPath, update: true })
  await writeFile(path.join(dir, 'sls-test', 'SKILL.md'), md(1, 'CHANGED body'))
  const res = await lintSkills({ skillsDir: dir, manifestPath })
  expect(res.ok).toBe(false)
  expect(res.errors[0]).toMatch(/bump metadata\.version/i)
})

it('passes when content change comes with version bump (after --update)', async () => {
  await lintSkills({ skillsDir: dir, manifestPath, update: true })
  await writeFile(path.join(dir, 'sls-test', 'SKILL.md'), md(2, 'CHANGED body'))
  const res = await lintSkills({ skillsDir: dir, manifestPath, update: true })
  expect(res.ok).toBe(true)
})

it('fails on contract violation (missing managed-by)', async () => {
  await writeFile(
    path.join(dir, 'sls-test', 'SKILL.md'),
    '---\nname: sls-test\ndescription: d\n---\nbody',
  )
  const res = await lintSkills({ skillsDir: dir, manifestPath })
  expect(res.ok).toBe(false)
  expect(res.errors[0]).toMatch(/managed-by/)
})
