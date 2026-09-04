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

const readManifest = async () =>
  JSON.parse(await readFile(manifestPath, 'utf8'))

// Seeds the baseline through the real hashing path, so no digest is hardcoded.
const seed = async () => {
  expect(
    (await lintSkills({ skillsDir: dir, manifestPath, update: true })).ok,
  ).toBe(true)
  return readManifest()
}

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
  const seeded = await seed()
  await writeFile(path.join(dir, 'sls-test', 'SKILL.md'), md(2, 'CHANGED body'))
  const res = await lintSkills({ skillsDir: dir, manifestPath, update: true })
  expect(res.ok).toBe(true)
  // --update has to actually rewrite the bumped-version baseline: it is the
  // documented remedy for the stale-baseline failure below, so an ok result
  // that wrote nothing would leave that state unfixable.
  const manifest = await readManifest()
  expect(manifest['sls-test'].version).toBe(2)
  expect(manifest['sls-test'].hash).not.toBe(seeded['sls-test'].hash)
  expect((await lintSkills({ skillsDir: dir, manifestPath })).ok).toBe(true)
})

it('fails when the manifest baseline is stale for a bumped version', async () => {
  await seed()
  await writeFile(path.join(dir, 'sls-test', 'SKILL.md'), md(2, 'CHANGED body'))
  const res = await lintSkills({ skillsDir: dir, manifestPath })
  expect(res.ok).toBe(false)
  expect(res.errors).toEqual([
    'Skill "sls-test": manifest baseline is stale for version 2 — run `node packages/sf-core/scripts/lint-skills.js --update` and commit skills/manifest.json',
  ])
})

it('fails when metadata.version goes backwards', async () => {
  await writeFile(path.join(dir, 'sls-test', 'SKILL.md'), md(3))
  await seed()
  await writeFile(path.join(dir, 'sls-test', 'SKILL.md'), md(2))
  const res = await lintSkills({ skillsDir: dir, manifestPath })
  expect(res.ok).toBe(false)
  expect(res.errors).toContain(
    'Skill "sls-test": metadata.version went backwards (3 → 2)',
  )
})

it('fails when a skill is absent from the manifest', async () => {
  const res = await lintSkills({ skillsDir: dir, manifestPath })
  expect(res.ok).toBe(false)
  expect(res.errors[0]).toMatch(/not in manifest/)
})

it('--update leaves the manifest untouched when there are errors', async () => {
  const seeded = await seed()
  await writeFile(path.join(dir, 'sls-test', 'SKILL.md'), md(1, 'CHANGED body'))
  const res = await lintSkills({ skillsDir: dir, manifestPath, update: true })
  expect(res.ok).toBe(false)
  expect(await readManifest()).toEqual(seeded)
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
