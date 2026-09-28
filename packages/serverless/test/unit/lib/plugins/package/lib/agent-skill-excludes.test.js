import { afterAll, describe, expect, it } from '@jest/globals'
import fs from 'fs'
import os from 'os'
import path from 'path'
import packageService from '../../../../../../lib/plugins/package/lib/package-service.js'
import { AGENT_SKILL_EXCLUDES } from '../../../../../../lib/plugins/package/lib/agent-skill-excludes.js'
import { sweepProjectFiles } from '../../../../../../lib/plugins/esbuild/project-sweep.js'

// `serverless agent setup` installs the Framework's own skills into a service
// (.claude/skills/serverless-*, .agents/skills/serverless-*). They are for the
// developer's coding agent, never for the function, so packaging leaves them
// out by default -- in classic packaging and in the esbuild project sweep --
// while a skill the service ships on purpose (an agent running in Lambda)
// stays in, and package.patterns can still re-include anything.
const dirs = []
afterAll(() => {
  for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true })
})

const makeService = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sls-agent-skills-'))
  dirs.push(dir)
  const write = (rel) => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
    fs.writeFileSync(path.join(dir, rel), 'x\n')
  }
  write('handler.mjs')
  write('.claude/skills/serverless-mcp/SKILL.md')
  write('.claude/skills/serverless-mcp/references/tools.md')
  write('.agents/skills/serverless-sandboxes/SKILL.md')
  write('.claude/skills/my-agent-skill/SKILL.md')
  write('.claude/settings.json')
  return dir
}

const classic = (serviceDir, include = []) =>
  packageService.resolveFilePathsFromPatterns.call(
    { serverless: { serviceDir, config: { serviceDir } } },
    {
      exclude: packageService.defaultExcludes,
      include,
      devDependencyExcludeSet: new Set(),
    },
  )

describe('Framework-installed agent skills are not packaged', () => {
  it('classic packaging leaves them out and keeps everything else', async () => {
    const files = await classic(makeService())
    expect(files.sort()).toEqual(
      [
        '.claude/settings.json',
        '.claude/skills/my-agent-skill/SKILL.md',
        'handler.mjs',
      ].sort(),
    )
  })

  it('classic packaging: package.patterns can re-include them', async () => {
    const files = await classic(makeService(), [
      '.claude/skills/serverless-mcp/**',
    ])
    expect(files).toEqual(
      expect.arrayContaining([
        '.claude/skills/serverless-mcp/SKILL.md',
        '.claude/skills/serverless-mcp/references/tools.md',
      ]),
    )
    expect(files).not.toContain('.agents/skills/serverless-sandboxes/SKILL.md')
  })

  it('the esbuild project sweep leaves them out the same way', async () => {
    const files = await sweepProjectFiles({
      serviceDir: makeService(),
      additionalExclusions: AGENT_SKILL_EXCLUDES,
    })
    expect(files.sort()).toEqual(
      [
        '.claude/settings.json',
        '.claude/skills/my-agent-skill/SKILL.md',
        'handler.mjs',
      ].sort(),
    )
  })

  it('classic defaultExcludes carries the agent-skill excludes', () => {
    expect(packageService.defaultExcludes).toEqual(
      expect.arrayContaining(AGENT_SKILL_EXCLUDES),
    )
  })
})
