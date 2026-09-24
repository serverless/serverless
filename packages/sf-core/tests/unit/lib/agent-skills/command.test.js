import { jest } from '@jest/globals'
import { mkdtemp, mkdir, writeFile, readFile, rm, stat } from 'fs/promises'
import { existsSync } from 'fs'
import os, { tmpdir } from 'os'
import path from 'path'
import { log } from '@serverless/util'
import agentSkillsInstall from '../../../../src/lib/runners/core/agent-skills-install.js'
import agentSetup, {
  isInGitRepo,
} from '../../../../src/lib/runners/core/agent-setup.js'

let svc, home
beforeEach(async () => {
  svc = await mkdtemp(path.join(tmpdir(), 'svc-'))
  home = await mkdtemp(path.join(tmpdir(), 'home-'))
  await writeFile(path.join(svc, 'serverless.yml'), 'service: test\n')
  // Most services live in a repository; the no-repository note has its own tests.
  await mkdir(path.join(svc, '.git'))
})
afterEach(async () => {
  await rm(svc, { recursive: true, force: true })
  await rm(home, { recursive: true, force: true })
})

const managedMd = (name, scope) => `---
name: ${name}
description: d
metadata:
  managed-by: serverless-framework
  version: "1"
  scope: ${scope}
---
body of ${name}
`
const fixture = (name, scope) => ({
  name,
  version: 1,
  scope,
  files: { 'SKILL.md': managedMd(name, scope) },
})
// test seam: inject bundled skills so tests don't depend on repo skills/
const getBundled = async () => [
  fixture('sls-gateway', 'user'),
  fixture('sls-project', 'project'),
]
const skillMd = (root, dirKey, name) =>
  path.join(root, dirKey, 'skills', name, 'SKILL.md')

it('installs bundled skills into resolved dirs and returns report', async () => {
  const report = await agentSkillsInstall({
    configFilePath: path.join(svc, 'serverless.yml'),
    options: {},
    homeDir: home,
  })
  // Bundled set may be empty until content lands; report shape is the contract.
  expect(report).toHaveProperty('changes')
  expect(report).toHaveProperty('skipped')
})

it('respects --dir: writes only .agents', async () => {
  const report = await agentSkillsInstall({
    configFilePath: path.join(svc, 'serverless.yml'),
    options: { dir: ['agents'] },
    homeDir: home,
  })
  for (const c of report.changes) expect(c.dir).toContain('.agents')
  await expect(stat(path.join(svc, '.claude'))).rejects.toThrow()
})

it('splits a comma-joined --dir (repeatable flag re-serialized by the CLI)', async () => {
  // `--dir claude --dir agents` reaches the command as the single string
  // "claude,agents" after the CLI's internal argv round-trip. Unsplit, it
  // would be rejected as one unknown value.
  const report = await agentSkillsInstall({
    configFilePath: path.join(svc, 'serverless.yml'),
    options: { dir: 'claude,agents' },
    homeDir: home,
  })
  expect(report).toHaveProperty('changes')
  // Each split token is still validated individually.
  await expect(
    agentSkillsInstall({
      configFilePath: path.join(svc, 'serverless.yml'),
      options: { dir: 'claude,bogus' },
      homeDir: home,
    }),
  ).rejects.toMatchObject({
    message: expect.stringMatching(/Unknown --dir value "bogus"/),
    code: 'INVALID_CLI_INPUT',
  })
})

it('installs user-scoped skills to home dirs, not the service dir', async () => {
  await agentSkillsInstall({
    configFilePath: path.join(svc, 'serverless.yml'),
    options: {},
    homeDir: home,
    getBundled,
  })
  // Gateway (scope: user) converges into the home-rooted dirs only.
  expect(existsSync(skillMd(home, '.claude', 'sls-gateway'))).toBe(true)
  expect(existsSync(skillMd(home, '.agents', 'sls-gateway'))).toBe(true)
  expect(existsSync(skillMd(svc, '.claude', 'sls-gateway'))).toBe(false)
  expect(existsSync(skillMd(svc, '.agents', 'sls-gateway'))).toBe(false)
  // Project skill converges into the service dirs only.
  expect(existsSync(skillMd(svc, '.claude', 'sls-project'))).toBe(true)
  expect(existsSync(skillMd(svc, '.agents', 'sls-project'))).toBe(true)
  expect(existsSync(skillMd(home, '.claude', 'sls-project'))).toBe(false)
  expect(existsSync(skillMd(home, '.agents', 'sls-project'))).toBe(false)
})

it('narrows both the project and the user dirs with --dir', async () => {
  await agentSkillsInstall({
    configFilePath: path.join(svc, 'serverless.yml'),
    options: { dir: 'claude' },
    homeDir: home,
    getBundled,
  })
  expect(existsSync(skillMd(svc, '.claude', 'sls-project'))).toBe(true)
  expect(existsSync(path.join(svc, '.agents'))).toBe(false)
  expect(existsSync(skillMd(home, '.claude', 'sls-gateway'))).toBe(true)
  expect(existsSync(skillMd(home, '.agents', 'sls-gateway'))).toBe(false)
  expect(existsSync(skillMd(svc, '.claude', 'sls-gateway'))).toBe(false)
})

// The command's logger instance lives in a global namespace registry, so the
// one resolved here is the very one the module logs through.
const noticeSpy = () =>
  jest
    .spyOn(log.get('core:agent-skills'), 'notice')
    .mockImplementation(() => {})
const NO_HOME_NOTICE =
  'skills: user-level install skipped (no home directory available in this environment)'
// mockRestore() also resets the mock, so read the calls before restoring.
const noticedMessages = (spy) => spy.mock.calls.map(([message]) => message)

it('skips the user half (and says so) when the home directory cannot be resolved', async () => {
  const homeSpy = jest.spyOn(os, 'homedir').mockImplementation(() => {
    throw new Error('no resolvable home directory')
  })
  const notice = noticeSpy()
  let messages
  try {
    // homeDir intentionally omitted, so the command must fall back to
    // os.homedir() — the seam this guards.
    await agentSkillsInstall({
      configFilePath: path.join(svc, 'serverless.yml'),
      options: {},
      getBundled,
    })
  } finally {
    messages = noticedMessages(notice)
    notice.mockRestore()
    homeSpy.mockRestore()
  }
  expect(messages).toContain(NO_HOME_NOTICE)
  // The project half still ran.
  expect(existsSync(skillMd(svc, '.claude', 'sls-project'))).toBe(true)
  expect(existsSync(skillMd(svc, '.claude', 'sls-gateway'))).toBe(false)
})

it('treats an empty HOME like an unresolvable one (never writes relative paths)', async () => {
  // path.join('', '.claude/skills') is RELATIVE — a naive `undefined` check
  // would drop the gateway into the current working directory. Run from an
  // empty scratch cwd so any such write is both visible and contained.
  const cwd = await mkdtemp(path.join(tmpdir(), 'cwd-'))
  const originalCwd = process.cwd()
  const notice = noticeSpy()
  let messages
  try {
    process.chdir(cwd)
    await agentSkillsInstall({
      configFilePath: path.join(svc, 'serverless.yml'),
      options: {},
      homeDir: '',
      getBundled,
    })
  } finally {
    process.chdir(originalCwd)
    messages = noticedMessages(notice)
    notice.mockRestore()
  }
  expect(messages).toContain(NO_HOME_NOTICE)
  expect(existsSync(path.join(cwd, '.claude', 'skills'))).toBe(false)
  expect(existsSync(path.join(cwd, '.agents', 'skills'))).toBe(false)
  await rm(cwd, { recursive: true, force: true })
  // The project half still ran, and the gateway went nowhere.
  expect(existsSync(skillMd(svc, '.claude', 'sls-project'))).toBe(true)
  expect(existsSync(skillMd(svc, '.claude', 'sls-gateway'))).toBe(false)
})

it('outside a service installs the user-level skills only, and says so', async () => {
  // Run from an empty scratch cwd so a project write would be visible.
  const cwd = await mkdtemp(path.join(tmpdir(), 'cwd-'))
  const originalCwd = process.cwd()
  const notice = noticeSpy()
  let report, messages
  try {
    process.chdir(cwd)
    report = await agentSkillsInstall({
      configFilePath: undefined,
      options: {},
      homeDir: home,
      getBundled,
    })
  } finally {
    process.chdir(originalCwd)
    messages = noticedMessages(notice)
    notice.mockRestore()
  }
  expect(existsSync(skillMd(home, '.claude', 'sls-gateway'))).toBe(true)
  expect(existsSync(skillMd(home, '.claude', 'sls-project'))).toBe(false)
  expect(existsSync(path.join(cwd, '.claude'))).toBe(false)
  expect(existsSync(path.join(cwd, '.agents'))).toBe(false)
  await rm(cwd, { recursive: true, force: true })
  expect(report).toEqual({ changes: [], skipped: [] })
  expect(messages).toContain(
    'project skills: no serverless.yml in this directory; run this command in a service directory to install them there',
  )
})

it('rejects an unknown --dir value outside a service too', async () => {
  await expect(
    agentSkillsInstall({
      configFilePath: undefined,
      options: { dir: 'cursor' },
      homeDir: home,
      getBundled,
    }),
  ).rejects.toThrow(/claude.*agents/i)
})

it('rejects unknown --dir value', async () => {
  await expect(
    agentSkillsInstall({
      configFilePath: path.join(svc, 'serverless.yml'),
      options: { dir: 'cursor' },
      homeDir: home,
    }),
  ).rejects.toThrow(/claude.*agents/i)
})

// --- `serverless agent setup` --------------------------------------------
// The environment half is detection-only, but the real detectors read the
// machine's rc store and walk the AWS credential chain, so the tests inject
// stub detectors. Output is asserted through log.write, the single sink the
// command renders every section into.
const setupDeps = {
  getBundled,
  detectAuth: async () => ({ state: 'env-license' }),
  detectAws: async () => ({ state: 'profile', profile: 'dev' }),
}
const writeSpy = () => jest.spyOn(log, 'write').mockImplementation(() => {})
const written = (spy) => spy.mock.calls.map(([message]) => message).join('')

const runSetup = async (args) => {
  const write = writeSpy()
  let output, result
  try {
    result = await agentSetup({ ...setupDeps, ...args })
  } finally {
    output = written(write)
    write.mockRestore()
  }
  return { result, output }
}

// The closing pointer names the dir the gateway actually landed in, so it is
// built per-dir here exactly as the command builds it.
const docsLine = (dir) =>
  `docs: read ${dir}/serverless-framework/SKILL.md now; new sessions load it automatically. "serverless agent docs" prints the documentation on demand`
// A pristine fixture home has no agent markers, so resolveUserTargetDirs falls
// back to both dirs and `.claude` comes first.
const DOCS_LINE = docsLine('~/.claude/skills')
const PROJECT_SKILLS_NOTE =
  "project skills: each loads only when a task involves its feature, including adding it to this service; commit them so teammates' agents get them (deployments leave them out)"
// The dir-free head of the line: negatives assert on THIS, not on DOCS_LINE,
// so "no pointer at all" cannot be satisfied by printing a different dir's
// variant.
const DOCS_PREFIX = 'docs: read '

it('agent setup outside a project installs gateway only and reports service absent', async () => {
  const { result, output } = await runSetup({
    configFilePath: undefined,
    options: {},
    homeDir: home,
  })
  // The gateway (scope: user) converges into the home dirs...
  expect(existsSync(skillMd(home, '.claude', 'sls-gateway'))).toBe(true)
  expect(existsSync(skillMd(home, '.agents', 'sls-gateway'))).toBe(true)
  // ...and nothing project-scoped is written anywhere.
  expect(existsSync(skillMd(home, '.claude', 'sls-project'))).toBe(false)
  expect(existsSync(path.join(svc, '.claude'))).toBe(false)
  expect(existsSync(path.join(svc, '.agents'))).toBe(false)

  expect(result.service).toEqual({ present: false })
  expect(result.auth).toEqual({ state: 'env-license' })
  expect(result.aws).toEqual({ state: 'profile', profile: 'dev' })
  expect(result.skills).toEqual({ added: 2, upgraded: 0, skipped: 0 })

  expect(output).toContain('skills:')
  expect(output).toContain(
    'sls-gateway v1 (user) — installed in ~/.claude/skills, ~/.agents/skills',
  )
  expect(output).toContain('environment:')
  expect(output).toContain(
    'service: no serverless.yml in this directory — create one (see the serverless-framework skill), then run "serverless agent setup" again there to install the project skills; or run "serverless" in an interactive terminal to scaffold a project',
  )
  expect(output).toContain(
    'auth: using SERVERLESS_LICENSE_KEY from the environment',
  )
  expect(output).toContain('aws credentials: profile "dev"')
  expect(output).toContain(DOCS_LINE)
})

it('agent setup inside a project converges both scopes', async () => {
  const { result, output } = await runSetup({
    configFilePath: path.join(svc, 'serverless.yml'),
    options: {},
    homeDir: home,
  })
  expect(existsSync(skillMd(home, '.claude', 'sls-gateway'))).toBe(true)
  expect(existsSync(skillMd(home, '.agents', 'sls-gateway'))).toBe(true)
  expect(existsSync(skillMd(svc, '.claude', 'sls-project'))).toBe(true)
  expect(existsSync(skillMd(svc, '.agents', 'sls-project'))).toBe(true)
  // Scopes never cross.
  expect(existsSync(skillMd(svc, '.claude', 'sls-gateway'))).toBe(false)
  expect(existsSync(skillMd(home, '.claude', 'sls-project'))).toBe(false)

  expect(result.service).toEqual({
    present: true,
    configFileName: 'serverless.yml',
  })
  expect(result.skills).toEqual({ added: 4, upgraded: 0, skipped: 0 })
  expect(output).toContain(
    'sls-gateway v1 (user) — installed in ~/.claude/skills, ~/.agents/skills',
  )
  expect(output).toContain(
    'sls-project v1 (project) — installed in .claude/skills, .agents/skills',
  )
  expect(output).toContain(
    'service: serverless.yml found; AWS credentials checked for stage "dev"',
  )
  expect(output).toContain(PROJECT_SKILLS_NOTE)
  expect(output).toContain(DOCS_LINE)
})

it('agent setup is idempotent and reports already-current skills as up to date', async () => {
  const args = {
    configFilePath: path.join(svc, 'serverless.yml'),
    options: {},
    homeDir: home,
  }
  await runSetup(args)
  const { result, output } = await runSetup(args)
  expect(result.skills).toEqual({ added: 0, upgraded: 0, skipped: 4 })
  expect(output).toContain('sls-gateway v1 (user) — up to date')
  expect(output).toContain('sls-project v1 (project) — up to date')
  // Nothing new landed in the project, so there is nothing to explain.
  expect(output).not.toContain(PROJECT_SKILLS_NOTE)
})

it('agent setup hands the service config and options to the AWS check', async () => {
  const detectAws = jest.fn(async () => ({ state: 'env' }))
  const config = { service: 'svc', provider: { profile: 'prod' } }
  await runSetup({
    configFilePath: path.join(svc, 'serverless.yml'),
    config,
    options: { 'aws-profile': 'cli' },
    homeDir: home,
    detectAws,
  })
  expect(detectAws).toHaveBeenCalledWith({
    config,
    options: { 'aws-profile': 'cli' },
  })
})

it('agent setup names the stages that deploy with other AWS credentials, read from the file', async () => {
  // By the time agent setup runs, the run's config keeps only the current
  // stage and `default` (ResolverManager#pruneUnusedStages); the other
  // stages must come from the file itself.
  const aws = { type: 'aws' }
  const pruned = {
    stages: {
      default: { resolvers: { acct: { ...aws, profile: 'default' } } },
    },
  }
  const onDisk = {
    stages: {
      ...pruned.stages,
      staging: { resolvers: { acct: { ...aws, profile: 'staging-account' } } },
    },
  }
  const configFilePath = path.join(svc, 'serverless.yml')
  const readServiceConfig = jest.fn(async () => onDisk)
  const { result, output } = await runSetup({
    configFilePath,
    config: pruned,
    resolverManager: { stage: 'dev' },
    options: {},
    homeDir: home,
    readServiceConfig,
  })
  expect(readServiceConfig).toHaveBeenCalledWith(configFilePath)
  expect(result.otherStages).toEqual([
    { stage: 'staging', resolver: 'acct', profile: 'staging-account' },
  ])
  expect(output).toContain(
    'other stages, not checked: "staging" (resolver "acct", profile "staging-account") — check one with "serverless agent setup --stage <name>"',
  )
})

it('agent setup outside a project checks AWS without a service config', async () => {
  const detectAws = jest.fn(async () => ({ state: 'none' }))
  await runSetup({
    configFilePath: undefined,
    config: { provider: { profile: 'stale' } },
    options: {},
    homeDir: home,
    detectAws,
  })
  expect(detectAws).toHaveBeenCalledWith({ config: undefined, options: {} })
})

it('agent setup outside a project does not explain project skills', async () => {
  const { output } = await runSetup({
    configFilePath: undefined,
    options: {},
    homeDir: home,
  })
  expect(output).not.toContain(PROJECT_SKILLS_NOTE)
})

it('agent setup honors --dir for the project and the user skills', async () => {
  await runSetup({
    configFilePath: path.join(svc, 'serverless.yml'),
    options: { dir: 'claude' },
    homeDir: home,
  })
  expect(existsSync(skillMd(svc, '.claude', 'sls-project'))).toBe(true)
  expect(existsSync(path.join(svc, '.agents'))).toBe(false)
  expect(existsSync(skillMd(home, '.claude', 'sls-gateway'))).toBe(true)
  expect(existsSync(skillMd(home, '.agents', 'sls-gateway'))).toBe(false)
})

it('agent setup splits a comma-joined --dir like `agent skills install` does', async () => {
  await runSetup({
    configFilePath: path.join(svc, 'serverless.yml'),
    options: { dir: 'claude,agents' },
    homeDir: home,
  })
  expect(existsSync(skillMd(svc, '.claude', 'sls-project'))).toBe(true)
  expect(existsSync(skillMd(svc, '.agents', 'sls-project'))).toBe(true)
})

it('agent setup skips the user half (and says so) when the home directory cannot be resolved', async () => {
  const homeSpy = jest.spyOn(os, 'homedir').mockImplementation(() => {
    throw new Error('no resolvable home directory')
  })
  let output, result
  try {
    // homeDir intentionally omitted, so the command must fall back to
    // os.homedir() — the seam this guards.
    ;({ result, output } = await runSetup({
      configFilePath: path.join(svc, 'serverless.yml'),
      options: {},
    }))
  } finally {
    homeSpy.mockRestore()
  }
  // The string carries its own `skills: ` label, so it must stand alone rather
  // than nest inside the `skills:` section (which would double the label).
  expect(output.split('\n')).toContain(NO_HOME_NOTICE)
  expect(output).not.toContain(`  ${NO_HOME_NOTICE}`)
  // The project half still ran...
  expect(existsSync(skillMd(svc, '.claude', 'sls-project'))).toBe(true)
  expect(existsSync(skillMd(svc, '.claude', 'sls-gateway'))).toBe(false)
  // ...but the closing docs line is omitted: the gateway is NOT installed.
  // Asserted dir-free, so NO variant of the pointer may appear.
  expect(output).not.toContain(DOCS_PREFIX)
  expect(result.skills).toEqual({ added: 2, upgraded: 0, skipped: 0 })
})

it('agent setup treats an empty HOME like an unresolvable one (never writes relative paths)', async () => {
  // path.join('', '.claude/skills') is RELATIVE — a naive `undefined` check
  // would drop the gateway into the current working directory.
  const cwd = await mkdtemp(path.join(tmpdir(), 'cwd-'))
  const originalCwd = process.cwd()
  let output
  try {
    process.chdir(cwd)
    ;({ output } = await runSetup({
      configFilePath: undefined,
      options: {},
      homeDir: '',
    }))
  } finally {
    process.chdir(originalCwd)
  }
  expect(output).toContain(NO_HOME_NOTICE)
  expect(existsSync(path.join(cwd, '.claude', 'skills'))).toBe(false)
  expect(existsSync(path.join(cwd, '.agents', 'skills'))).toBe(false)
  await rm(cwd, { recursive: true, force: true })
})

it('agent setup reports an unwritable target dir instead of silently dropping it', async () => {
  // A FILE where the skills dir should be: mkdir -p fails with ENOTDIR, which
  // syncSkills records as reason 'unwritable'.
  await mkdir(path.join(svc, '.claude'), { recursive: true })
  await writeFile(path.join(svc, '.claude', 'skills'), 'not a directory')
  const { result, output } = await runSetup({
    configFilePath: path.join(svc, 'serverless.yml'),
    options: { dir: 'claude' },
    homeDir: home,
  })
  expect(output).toContain(
    'sls-project: target not writable — skipped (.claude/skills)',
  )
  expect(result.skills.skipped).toBe(1)
  expect(result.skills.added).toBe(1) // the user-scope gateway still landed
})

it.each(['serverless-compose.yml', 'serverless-compose.yaml'])(
  'agent setup names the compose config honestly at a Compose root (%s)',
  async (configFileName) => {
    // Project skills still install beside the compose file, but the report
    // must not claim a serverless.yml was found.
    await writeFile(path.join(svc, configFileName), 'services: {}\n')
    const { result, output } = await runSetup({
      configFilePath: path.join(svc, configFileName),
      options: {},
      homeDir: home,
    })
    expect(output).toContain(`service: ${configFileName} found`)
    expect(output).not.toContain('service: serverless.yml found')
    expect(result.service).toEqual({ present: true, configFileName })
    // Current behavior stands: project skills land beside the compose file.
    expect(existsSync(skillMd(svc, '.claude', 'sls-project'))).toBe(true)
  },
)

it('agent setup omits the docs line when every user dir was unwritable', async () => {
  // A FILE where each home skills dir should be: the gateway lands nowhere, so
  // claiming "the serverless-framework skill is installed" would be a lie.
  for (const dirKey of ['.claude', '.agents']) {
    await mkdir(path.join(home, dirKey), { recursive: true })
    await writeFile(path.join(home, dirKey, 'skills'), 'not a directory')
  }
  const { result, output } = await runSetup({
    configFilePath: undefined,
    options: {},
    homeDir: home,
  })
  expect(output).toContain(
    'sls-gateway: target not writable — skipped (~/.claude/skills)',
  )
  expect(output).toContain(
    'sls-gateway: target not writable — skipped (~/.agents/skills)',
  )
  // Dir-free: neither the ~/.claude nor the ~/.agents variant may be printed.
  expect(output).not.toContain(DOCS_PREFIX)
  expect(result.skills).toEqual({ added: 0, upgraded: 0, skipped: 2 })
})

it('agent setup still prints the docs line when the gateway is merely up to date', async () => {
  const args = { configFilePath: undefined, options: {}, homeDir: home }
  await runSetup(args)
  const { output } = await runSetup(args)
  expect(output).toContain('sls-gateway v1 (user) — up to date')
  expect(output).toContain(DOCS_LINE)
})

it('agent setup reports an ejected skill per dir even when it wrote elsewhere', async () => {
  // Customized (no managed-by) in ~/.claude, absent from ~/.agents: the user
  // must see BOTH the write and the skip, not just the write.
  const ejectedDir = path.join(home, '.claude', 'skills', 'sls-gateway')
  await mkdir(ejectedDir, { recursive: true })
  await writeFile(
    path.join(ejectedDir, 'SKILL.md'),
    '---\nname: sls-gateway\ndescription: mine now\n---\nhand-edited\n',
  )
  await mkdir(path.join(home, '.agents'), { recursive: true })
  const { output } = await runSetup({
    configFilePath: undefined,
    options: {},
    homeDir: home,
  })
  expect(output).toContain(
    'sls-gateway v1 (user) — installed in ~/.agents/skills',
  )
  expect(output).toContain(
    'sls-gateway: customized by you (no managed-by) — skipped (~/.claude/skills)',
  )
  // ...and the pointer names the dir the gateway actually landed in, skipping
  // the first (ejected) dir.
  expect(output).toContain(docsLine('~/.agents/skills'))
  // The customization is untouched.
  expect(await readFile(path.join(ejectedDir, 'SKILL.md'), 'utf8')).toContain(
    'hand-edited',
  )
})

it('agent setup names the only detected user dir in the docs line', async () => {
  // ~/.agents alone is detected, so the gateway lands there and nowhere else --
  // the pointer must say so rather than name a dir that was never written.
  await mkdir(path.join(home, '.agents'), { recursive: true })
  const { output } = await runSetup({
    configFilePath: undefined,
    options: {},
    homeDir: home,
  })
  expect(existsSync(skillMd(home, '.agents', 'sls-gateway'))).toBe(true)
  expect(existsSync(skillMd(home, '.claude', 'sls-gateway'))).toBe(false)
  expect(output).toContain(docsLine('~/.agents/skills'))
  expect(output).not.toContain(docsLine('~/.claude/skills'))
})

it('agent setup writes the sections in order: skills, environment, docs', async () => {
  const { output } = await runSetup({
    configFilePath: path.join(svc, 'serverless.yml'),
    options: {},
    homeDir: home,
  })
  const skillsAt = output.indexOf('skills:')
  const environmentAt = output.indexOf('environment:')
  const docsAt = output.indexOf(DOCS_LINE)
  expect(skillsAt).toBeGreaterThanOrEqual(0)
  expect(environmentAt).toBeGreaterThan(skillsAt)
  expect(docsAt).toBeGreaterThan(environmentAt)
  // The docs line is last: nothing follows it but the trailing newline.
  expect(output.slice(docsAt).trim()).toBe(DOCS_LINE)
})

it('agent setup validates --dir in bootstrap mode too', async () => {
  await expect(
    runSetup({
      configFilePath: undefined,
      options: { dir: 'cursor' },
      homeDir: home,
    }),
  ).rejects.toThrow(/Unknown --dir value "cursor"/)
})

it('agent setup applies --dir to the user skills outside a project', async () => {
  const { result } = await runSetup({
    configFilePath: undefined,
    options: { dir: 'claude' },
    homeDir: home,
  })
  expect(existsSync(skillMd(home, '.claude', 'sls-gateway'))).toBe(true)
  expect(existsSync(skillMd(home, '.agents', 'sls-gateway'))).toBe(false)
  expect(result.skills).toEqual({ added: 1, upgraded: 0, skipped: 0 })
})

it('agent setup exits normally when every environment check fails', async () => {
  const { result, output } = await runSetup({
    configFilePath: undefined,
    options: {},
    homeDir: home,
    detectAuth: async () => ({ state: 'none' }),
    detectAws: async () => ({ state: 'none' }),
  })
  // Checks are information, not errors: no throw, and the states round-trip.
  expect(result.auth).toEqual({ state: 'none' })
  expect(result.aws).toEqual({ state: 'none' })
  expect(output).toContain(
    'auth: not signed in — if the user is at the keyboard, run "serverless login" (without a terminal it prints a sign-in URL for them to open and waits up to 10 minutes); for unattended runs, set SERVERLESS_ACCESS_KEY (create one at https://app.serverless.com/settings/accessKeys) or SERVERLESS_LICENSE_KEY (create one at https://app.serverless.com/settings/licenseKeys)',
  )
  expect(output).toContain(
    'aws credentials: not found — set AWS_PROFILE or AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY, or run "serverless login aws" in an interactive terminal',
  )
})

describe('isInGitRepo', () => {
  it('finds a .git folder in the directory or above it', async () => {
    const nested = path.join(svc, 'services', 'api')
    await mkdir(nested, { recursive: true })
    expect(isInGitRepo(svc)).toBe(true)
    expect(isInGitRepo(nested)).toBe(true)
  })

  it('counts the .git file of a worktree or submodule', async () => {
    const worktree = await mkdtemp(path.join(tmpdir(), 'wt-'))
    try {
      await writeFile(path.join(worktree, '.git'), 'gitdir: /elsewhere\n')
      expect(isInGitRepo(worktree)).toBe(true)
    } finally {
      await rm(worktree, { recursive: true, force: true })
    }
  })

  it('is false with no .git up to the root', () => {
    expect(isInGitRepo(home)).toBe(false)
  })
})

it('agent setup outside a repository says to keep the project skills with the service', async () => {
  await rm(path.join(svc, '.git'), { recursive: true, force: true })
  const { output } = await runSetup({
    configFilePath: path.join(svc, 'serverless.yml'),
    options: {},
    homeDir: home,
  })
  expect(output).not.toContain(PROJECT_SKILLS_NOTE)
  expect(output).toContain(
    "keep them with the service's files, and commit them once it is under version control",
  )
})
