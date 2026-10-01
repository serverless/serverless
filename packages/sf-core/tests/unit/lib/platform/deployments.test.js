import { execFileSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { addCommonDeploymentData } from '../../../../src/lib/platform/deployments.js'

const git = (args, env = {}) =>
  execFileSync(
    'git',
    [
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.com',
      '-c',
      'commit.gpgsign=false',
      ...args,
    ],
    { env: { ...process.env, ...env }, stdio: 'pipe' },
  )

const collectVcs = async () => {
  let vcs
  await addCommonDeploymentData({
    command: ['deploy'],
    deploymentInstance: {
      set: (data) => {
        if (data.vcs) vcs = data.vcs
      },
    },
  })
  return vcs
}

describe('addCommonDeploymentData VCS data', () => {
  const envKeys = ['GIT_DIR', 'GIT_WORK_TREE', 'SERVERLESS_CI_CD']
  let tmpDir
  let originalCwd
  let originalEnv

  beforeEach(() => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'sf-core-vcs-')),
    )
    originalCwd = process.cwd()
    originalEnv = Object.fromEntries(envKeys.map((k) => [k, process.env[k]]))
    for (const key of envKeys) delete process.env[key]
  })

  afterEach(() => {
    process.chdir(originalCwd)
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('reads branch, origin and commit from the enclosing repository', async () => {
    const repo = path.join(tmpDir, 'repo')
    fs.mkdirSync(path.join(repo, 'service'), { recursive: true })
    git(['init', '-q', '-b', 'main', repo])
    git(['-C', repo, 'commit', '-q', '--allow-empty', '-m', 'Initial commit'])
    git(['-C', repo, 'remote', 'add', 'origin', 'https://example.com/app.git'])
    git(['-C', repo, 'config', 'branch.main.remote', 'origin'])
    process.chdir(path.join(repo, 'service'))

    const vcs = await collectVcs()

    expect(vcs).toEqual({
      type: 'git',
      branch: 'main',
      originUrl: 'https://example.com/app.git',
      commit: expect.stringMatching(/^[0-9a-f]{40}$/),
      commitMessage: 'Initial commit',
      committerEmail: 'test@example.com',
      relativePath: 'service/',
    })
  })

  it('reads the repository selected by GIT_DIR and GIT_WORK_TREE', async () => {
    const gitDir = path.join(tmpDir, 'git-dir')
    const workTree = path.join(tmpDir, 'work-tree')
    fs.mkdirSync(path.join(workTree, 'service'), { recursive: true })
    const env = { GIT_DIR: gitDir, GIT_WORK_TREE: workTree }
    git(['init', '-q', '-b', 'main'], env)
    git(['commit', '-q', '--allow-empty', '-m', 'Initial commit'], env)
    Object.assign(process.env, env)
    process.chdir(path.join(workTree, 'service'))

    const vcs = await collectVcs()

    expect(vcs).toMatchObject({
      type: 'git',
      branch: 'main',
      commitMessage: 'Initial commit',
      relativePath: 'service/',
    })
  })

  it('reports no VCS outside a repository', async () => {
    process.chdir(tmpDir)

    expect(await collectVcs()).toEqual({ type: null })
  })
})
