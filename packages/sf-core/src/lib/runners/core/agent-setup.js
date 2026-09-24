/**
 * `serverless agent setup` — the one-command bootstrap for AI agent work.
 *
 * Converges the bundled Agent Skills (user scope always; project scope only
 * inside a service directory) and then prints a read-only report of what an
 * agent needs to know about this environment. Unlike `agent skills install`
 * this command has NO service-config guard: running it in an empty directory
 * is the point — that is how a fresh machine gets the gateway skill.
 *
 * Every check is informational, and all are local except the AWS check,
 * which makes the same STS account lookup a deploy makes (behind a timeout).
 * Nothing here fails the command: a missing serverless.yml, an
 * unauthenticated CLI and absent or rejected AWS credentials are all
 * reported, and the process still exits 0.
 */
import { existsSync } from 'fs'
import os from 'os'
import path from 'path'
import { log, style } from '@serverless/util'
import readConfig from '@serverless/framework/lib/configuration/read.js'
import { getBundledSkills } from '../../agent-skills/manifest.js'
import {
  assertValidDirFlags,
  resolveTargetDirs,
  resolveUserTargetDirs,
} from '../../agent-skills/resolve-targets.js'
import { syncSkills } from '../../agent-skills/engine.js'
import { normalizeDirFlags, toDisplayPath } from './agent-skills-install.js'
import {
  detectServerlessAuth,
  detectAwsCredentials,
  otherStageAwsSources,
  renderEnvironmentReport,
} from './agent-env-report.js'

const NO_HOME_ENTRY =
  'skills: user-level install skipped (no home directory available in this environment)'

const docsLine = (gatewayDir) =>
  `docs: read ${gatewayDir}/serverless-framework/SKILL.md now; new sessions load it automatically. "serverless agent docs" prints the documentation on demand`

/**
 * Replicates the serviceOutputs rendering idiom (see
 * packages/serverless/lib/cli/write-service-outputs.js). Deliberately copied
 * rather than imported: that module lives in a different package.
 */
const writeSection = (section, entries) => {
  log.write(`${style.aside(`${section}:\n`)}  ${entries.join('\n  ')}\n`)
}

/**
 * One entry per skill+scope, with every dir it landed in on the same line, so
 * the report reads as a list of skills rather than a list of writes.
 *
 * The exceptions are the two per-DIR outcomes -- an unwritable target and an
 * ejected (user-customized) skill. Those differ from dir to dir, and a skill
 * that wrote successfully somewhere else must not hide them, so they are always
 * reported individually and name the dir they refer to.
 */
const renderSkillEntries = ({ report, skills, scope, relativize }) => {
  const versionOf = new Map(skills.map((skill) => [skill.name, skill.version]))
  const entries = []
  const dirsBySkill = new Map()
  const upgradedSkills = new Set()
  for (const change of report.changes) {
    if (!dirsBySkill.has(change.skill)) dirsBySkill.set(change.skill, [])
    dirsBySkill.get(change.skill).push(relativize(change.dir))
    if (change.action === 'upgraded') upgradedSkills.add(change.skill)
  }
  // The verb says what this run did, so a first run reads differently from a
  // re-run (`up to date` below): a skill that was missing anywhere reads as
  // installed, one that only moved forward reads as updated.
  for (const [skill, dirs] of dirsBySkill) {
    const verb = upgradedSkills.has(skill) ? 'updated in' : 'installed in'
    entries.push(
      `${skill} v${versionOf.get(skill)} (${scope}) — ${verb} ${dirs.join(', ')}`,
    )
  }
  const upToDate = new Set()
  for (const skip of report.skipped) {
    if (skip.reason === 'unwritable') {
      entries.push(
        `${skip.skill}: target not writable — skipped (${relativize(skip.dir)})`,
      )
    } else if (skip.reason === 'ejected') {
      entries.push(
        `${skip.skill}: customized by you (no managed-by) — skipped (${relativize(skip.dir)})`,
      )
    } else if (!dirsBySkill.has(skip.skill)) {
      // up-to-date is a non-event, so it is grouped per skill and suppressed
      // entirely when the same skill also changed somewhere.
      upToDate.add(skip.skill)
    }
  }
  for (const skill of upToDate) {
    entries.push(`${skill} v${versionOf.get(skill)} (${scope}) — up to date`)
  }
  return entries
}

/**
 * The first user dir (resolveUserTargetDirs order) where the gateway ended up
 * on disk -- added or upgraded this run, or already up to date. Undefined when
 * it landed in none of them (every target unwritable, or ejected everywhere):
 * an all-unwritable run must NOT claim "the serverless-framework skill is
 * installed", let alone name a path that does not hold it.
 */
const gatewayDirOf = ({ userReport, userDirs, gatewayName, relativize }) => {
  for (const dir of userDirs) {
    const written = userReport.changes.some(
      (change) => change.dir === dir && change.skill === gatewayName,
    )
    const current = userReport.skipped.some(
      (skip) =>
        skip.dir === dir &&
        skip.skill === gatewayName &&
        skip.reason === 'up-to-date',
    )
    if (written || current) return relativize(dir)
  }
  return undefined
}

const PROJECT_SKILLS_NOTE =
  "project skills: each loads only when a task involves its feature, including adding it to this service; commit them so teammates' agents get them (deployments leave them out)"
const PROJECT_SKILLS_NOTE_NO_REPO =
  "project skills: each loads only when a task involves its feature, including adding it to this service; keep them with the service's files, and commit them once it is under version control, so teammates' agents get them (deployments leave them out)"

/**
 * Whether `dir` is inside a git repository: a `.git` entry in it or any
 * directory above it. A worktree or submodule has a `.git` file, not a
 * folder, so any entry counts. Only the note's wording depends on this, so an
 * error keeps the default.
 */
export const isInGitRepo = (dir) => {
  try {
    let current = path.resolve(dir)
    for (;;) {
      if (existsSync(path.join(current, '.git'))) return true
      const parent = path.dirname(current)
      if (parent === current) return false
      current = parent
    }
  } catch {
    return true
  }
}

/** The gateway among the user-scope skills: by name, else the only one. */
const GATEWAY_NAME = 'serverless-framework'
const gatewayNameOf = (userSkills) =>
  (userSkills.find((skill) => skill.name === GATEWAY_NAME) ?? userSkills[0])
    .name

export default async function agentSetup({
  configFilePath,
  // The service's serverless.yml, unresolved: the AWS check reads the profile
  // a deploy would use from it.
  config,
  // The run's resolver manager: it has already picked the aws resolver a
  // deploy would take credentials from (setCredentialResolver).
  resolverManager,
  options = {},
  // Resolved below, not as a default param: os.homedir() can throw (e.g. a
  // minimal container with no resolvable home), and a default param is
  // evaluated before any try -- which would fail the whole command instead of
  // degrading to "user-level install skipped".
  homeDir,
  // Test seams.
  getBundled = getBundledSkills,
  detectAuth = detectServerlessAuth,
  detectAws = detectAwsCredentials,
  readServiceConfig = readConfig,
}) {
  const service = configFilePath
    ? { present: true, configFileName: path.basename(configFilePath) }
    : { present: false }
  const dirFlags = normalizeDirFlags(options.dir)
  // Validate up front, not inside resolveTargetDirs: the project half does not
  // run in bootstrap mode, so a bad `--dir` would otherwise pass unreported.
  assertValidDirFlags(dirFlags)

  // A falsy home (throw, or HOME='' in a minimal container) must disable every
  // home-rooted path: path.join('', '.claude/skills') is RELATIVE, which would
  // write the gateway into the current working directory.
  let home
  try {
    home = homeDir ?? os.homedir()
  } catch {
    home = undefined
  }

  const bundledSkills = await getBundled()
  const userSkills = bundledSkills.filter((s) => s.scope === 'user')
  const projectSkills = bundledSkills.filter((s) => s.scope !== 'user')

  const skillEntries = []
  const totals = { added: 0, upgraded: 0, skipped: 0 }
  const tally = (report) => {
    for (const change of report.changes) totals[change.action] += 1
    totals.skipped += report.skipped.length
  }

  // 1. User scope (the gateway). Always converged — this is what makes the
  //    command useful outside a project.
  let gatewayDir
  // The no-home string carries its own `skills: ` label, so it is written as a
  // standalone line rather than nested inside the `skills:` section.
  let noHomeSkip = false
  if (userSkills.length) {
    if (!home) {
      noHomeSkip = true
    } else {
      const userDirs = await resolveUserTargetDirs({ homeDir: home, dirFlags })
      const userReport = await syncSkills({
        bundledSkills: userSkills,
        targetDirs: userDirs,
      })
      tally(userReport)
      skillEntries.push(
        ...renderSkillEntries({
          report: userReport,
          skills: userSkills,
          scope: 'user',
          relativize: (dir) => `~/${toDisplayPath(path.relative(home, dir))}`,
        }),
      )
      gatewayDir = gatewayDirOf({
        userReport,
        userDirs,
        gatewayName: gatewayNameOf(userSkills),
        relativize: (dir) => `~/${toDisplayPath(path.relative(home, dir))}`,
      })
    }
  }

  // 2. Project scope, only inside a service directory. `--dir` narrows it the
  //    same way as `agent skills install` (and the user scope above).
  if (configFilePath && projectSkills.length) {
    const serviceDir = path.dirname(configFilePath)
    const targetDirs = await resolveTargetDirs({
      mode: 'install',
      dirFlags,
      serviceDir,
      homeDir: home,
    })
    const projectReport = await syncSkills({
      bundledSkills: projectSkills,
      targetDirs,
    })
    tally(projectReport)
    skillEntries.push(
      ...renderSkillEntries({
        report: projectReport,
        skills: projectSkills,
        scope: 'project',
        relativize: (dir) => toDisplayPath(path.relative(serviceDir, dir)),
      }),
    )
    // New files in someone's repo need a reason and a next step: say why
    // they are there (they load on demand, so a service without the feature
    // still gets help adding it) and that they are meant to be committed.
    // Not repeated on a re-run that changed nothing.
    if (projectReport.changes.length)
      skillEntries.push(
        isInGitRepo(serviceDir)
          ? PROJECT_SKILLS_NOTE
          : PROJECT_SKILLS_NOTE_NO_REPO,
      )
  }

  // 3. Environment checks. Both are local and independent, so run them
  //    together; neither ever rejects.
  const [auth, aws] = await Promise.all([
    detectAuth({ config: configFilePath ? config : undefined }),
    detectAws({
      config: configFilePath ? config : undefined,
      options,
      credentialResolver: configFilePath
        ? resolverManager?.getCredentialResolverConfig?.()
        : undefined,
    }),
  ])

  // In an interactive terminal log.write() suppresses its own trailing newline
  // (see writeStdErr's disableNewLine), so the blank line BETWEEN sections has
  // to be written explicitly -- the section helper's own `\n` only terminates
  // its last entry.
  if (noHomeSkip) {
    log.write(`${NO_HOME_ENTRY}\n`)
    log.blankLine()
  }
  if (skillEntries.length) {
    writeSection('skills', skillEntries)
    log.blankLine()
  }
  // The check covered one stage; name the stages that deploy with other AWS
  // credentials so they are not taken as checked too. Read from the file:
  // by now the run's config keeps only this stage and `default`
  // (ResolverManager#pruneUnusedStages).
  const stage = resolverManager?.stage ?? options.stage ?? 'dev'
  let otherStages = []
  if (configFilePath) {
    try {
      otherStages = otherStageAwsSources({
        config: await readServiceConfig(configFilePath),
        stage,
      })
    } catch {
      /* unreadable config: the service line already reports it */
    }
  }
  writeSection(
    'environment',
    renderEnvironmentReport({
      auth,
      aws,
      service,
      otherStages,
      stage: configFilePath ? stage : undefined,
    }),
  )
  // The pointer only makes sense once the gateway skill is actually on disk.
  if (gatewayDir) log.write(`\n${docsLine(gatewayDir)}\n`)

  return { skills: totals, auth, aws, service, otherStages }
}
