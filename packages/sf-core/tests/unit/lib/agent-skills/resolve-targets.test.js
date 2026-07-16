import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { resolveTargetDirs } from '../../../../src/lib/agent-skills/resolve-targets.js'

const MANAGED = `---
name: sls-test
description: d
metadata:
  managed-by: serverless-framework
  version: "1"
---
`
let svc, home
beforeEach(async () => {
  svc = await mkdtemp(path.join(tmpdir(), 'svc-'))
  home = await mkdtemp(path.join(tmpdir(), 'home-'))
})
afterEach(async () => {
  await rm(svc, { recursive: true, force: true })
  await rm(home, { recursive: true, force: true })
})
const claude = () => path.join(svc, '.claude', 'skills')
const agents = () => path.join(svc, '.agents', 'skills')
const seedManaged = async (dir) => {
  await mkdir(path.join(dir, 'sls-test'), { recursive: true })
  await writeFile(path.join(dir, 'sls-test', 'SKILL.md'), MANAGED)
}
const resolve = (mode, dirFlags) =>
  resolveTargetDirs({ mode, dirFlags, serviceDir: svc, homeDir: home })

it('--dir override wins over everything', async () => {
  await seedManaged(claude())
  expect(await resolve('install', ['agents'])).toEqual([agents()])
})
it('unknown --dir value throws', async () => {
  await expect(resolve('install', ['cursor'])).rejects.toThrow(
    /claude.*agents/i,
  )
})
it('managed presence beats service-dir and home detection', async () => {
  await seedManaged(claude())
  await mkdir(path.join(svc, '.agents'), { recursive: true }) // exists but no managed skills
  await mkdir(path.join(home, '.codex'), { recursive: true })
  expect(await resolve('install')).toEqual([claude()])
})
it('service agent dirs detected when no managed skills', async () => {
  await mkdir(path.join(svc, '.claude'), { recursive: true }) // just settings, no skills
  expect(await resolve('install')).toEqual([claude()])
})
it('home detection: ~/.codex and ~/.cursor map to agents; ~/.claude to claude; deduped', async () => {
  await mkdir(path.join(home, '.codex'))
  await mkdir(path.join(home, '.cursor'))
  await mkdir(path.join(home, '.claude'))
  expect((await resolve('install')).sort()).toEqual([agents(), claude()].sort())
})
it('~/.agents detected (direct standard usage)', async () => {
  await mkdir(path.join(home, '.agents'))
  expect(await resolve('install')).toEqual([agents()])
})
it('nothing anywhere → install bootstraps both', async () => {
  expect((await resolve('install')).sort()).toEqual([agents(), claude()].sort())
})
it('auto mode: only managed-presence dirs; nothing → empty (never bootstraps)', async () => {
  expect(await resolve('auto')).toEqual([])
  await seedManaged(agents())
  expect(await resolve('auto')).toEqual([agents()])
})
it('deleted-dir choice sticks across re-install (managed in one dir only)', async () => {
  await seedManaged(claude()) // user deleted .agents copy earlier
  expect(await resolve('install')).toEqual([claude()])
})
