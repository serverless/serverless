import {
  agentSkillsList,
  agentSkillsRead,
} from '../../../../../src/lib/runners/core/agent-skills-read.js'

const skillMd = (name, description, scope, version = '1') =>
  `---\nname: ${name}\ndescription: >-\n  ${description}\nmetadata:\n  managed-by: serverless-framework\n  version: '${version}'\n${scope ? `  scope: ${scope}\n` : ''}---\n\n# ${name}\n\nbody of ${name}\n`

// A `|-` literal block: YAML hands the description straight through, newline and
// extra indentation intact, so the runner's own whitespace collapsing is what
// has to flatten it.
const skillMdLiteralDescription = (name, block, scope, version = '1') =>
  `---\nname: ${name}\ndescription: |-\n${block}\nmetadata:\n  managed-by: serverless-framework\n  version: '${version}'\n${scope ? `  scope: ${scope}\n` : ''}---\n\n# ${name}\n\nbody of ${name}\n`

const bundled = [
  {
    name: 'serverless-framework',
    version: 1,
    scope: 'user',
    files: {
      'SKILL.md': skillMd(
        'serverless-framework',
        'Build, deploy, and operate applications on AWS.',
        'user',
      ),
      'references/cli.md': '# CLI\n',
      'references/agent-commands.md': '# Commands\n',
    },
  },
  {
    name: 'serverless-sandboxes',
    version: 1,
    scope: 'project',
    files: {
      'SKILL.md': skillMd(
        'serverless-sandboxes',
        'Build, run, and operate isolated compute\n  on AWS.',
      ),
      'references/config.md': '# Config\n',
    },
  },
]
const getBundled = async () => bundled
const listBundled = [
  {
    name: 'serverless-framework',
    version: 12,
    scope: 'user',
    files: {
      'SKILL.md': skillMd(
        'serverless-framework',
        'Build, deploy, and operate applications on AWS.',
        'user',
        '12',
      ),
    },
  },
  {
    name: 'serverless-mcp',
    version: 1,
    scope: 'project',
    files: {
      'SKILL.md': skillMdLiteralDescription(
        'serverless-mcp',
        '  Build, run, and operate\n    isolated compute on AWS.',
        'project',
      ),
    },
  },
]
const getListBundled = async () => listBundled
const capture = () => {
  const chunks = []
  return { write: (t) => chunks.push(t), text: () => chunks.join('') }
}

describe('agentSkillsList', () => {
  it('prints one aligned line per skill: name, version, scope, description', async () => {
    const out = capture()
    const result = await agentSkillsList({
      getBundled: getListBundled,
      write: out.write,
    })
    const lines = out.text().trimEnd().split('\n')
    expect(lines).toHaveLength(2)
    // Literal spacing, not \s+: the short name is padded out to the long one,
    // v1 to the width of v12, and user to the width of project.
    expect(lines[0]).toBe(
      'serverless-framework  v12  user     Build, deploy, and operate applications on AWS.',
    )
    expect(lines[1]).toBe(
      'serverless-mcp        v1   project  Build, run, and operate isolated compute on AWS.',
    )
    expect(result).toEqual({ skills: 2 })
  })
  it('collapses whitespace inside a description that YAML preserves', async () => {
    const out = capture()
    await agentSkillsList({ getBundled: getListBundled, write: out.write })
    // The fixture's literal block really does reach describe() as
    // 'Build, run, and operate\n  isolated compute on AWS.'
    expect(
      skillMdLiteralDescription(
        'serverless-mcp',
        '  Build, run, and operate\n    isolated compute on AWS.',
      ),
    ).toContain('description: |-\n  Build, run, and operate\n    isolated')
    expect(out.text()).toContain(
      'Build, run, and operate isolated compute on AWS.',
    )
    expect(out.text()).not.toContain('operate\n')
    expect(out.text()).not.toContain('operate  ')
  })
  it('says so when nothing is bundled', async () => {
    const out = capture()
    await agentSkillsList({ getBundled: async () => [], write: out.write })
    expect(out.text()).toBe('No skills are bundled with this CLI version.\n')
  })
})

describe('agentSkillsRead', () => {
  it('prints SKILL.md by default with a footer naming the other files', async () => {
    const out = capture()
    const result = await agentSkillsRead({
      name: 'serverless-framework',
      getBundled,
      write: out.write,
    })
    expect(out.text().startsWith('---\nname: serverless-framework')).toBe(true)
    expect(out.text().trimEnd().split('\n').pop()).toBe(
      'files: references/agent-commands.md, references/cli.md — read one with: serverless agent skills read serverless-framework <file>',
    )
    expect(result).toEqual({ skill: 'serverless-framework', file: 'SKILL.md' })
  })
  it('prints a named aux file, accepting backslash separators', async () => {
    const out = capture()
    await agentSkillsRead({
      name: 'serverless-sandboxes',
      file: 'references\\config.md',
      getBundled,
      write: out.write,
    })
    expect(out.text().startsWith('# Config')).toBe(true)
    expect(out.text()).toContain(
      'files: SKILL.md — read one with: serverless agent skills read serverless-sandboxes <file>',
    )
  })
  it('omits the footer when the skill has a single file', async () => {
    const out = capture()
    await agentSkillsRead({
      name: 'solo',
      getBundled: async () => [
        {
          name: 'solo',
          version: 1,
          scope: 'project',
          files: { 'SKILL.md': '# solo\n' },
        },
      ],
      write: out.write,
    })
    expect(out.text()).toBe('# solo\n')
  })
  it('rejects an inherited object key rather than printing a function', async () => {
    await expect(
      agentSkillsRead({
        name: 'solo',
        file: 'toString',
        getBundled: async () => [
          {
            name: 'solo',
            version: 1,
            scope: 'project',
            files: { 'SKILL.md': '# solo\n' },
          },
        ],
        write: () => {},
      }),
    ).rejects.toMatchObject({
      code: 'AGENT_SKILL_FILE_NOT_FOUND',
      message: '"toString" is not part of solo. Files: SKILL.md',
    })
  })
  it('requires a name', async () => {
    await expect(
      agentSkillsRead({ getBundled, write: () => {} }),
    ).rejects.toMatchObject({
      code: 'AGENT_SKILL_NAME_REQUIRED',
      message:
        'Specify a skill to read: serverless agent skills read <name> [file]. Bundled skills: serverless-framework, serverless-sandboxes',
    })
  })
  it('rejects an unknown skill', async () => {
    await expect(
      agentSkillsRead({ name: 'nope', getBundled, write: () => {} }),
    ).rejects.toMatchObject({
      code: 'AGENT_SKILL_NOT_FOUND',
      message:
        'Unknown skill "nope". Bundled skills: serverless-framework, serverless-sandboxes',
    })
  })
  it('rejects an unknown file and lists the real ones', async () => {
    await expect(
      agentSkillsRead({
        name: 'serverless-sandboxes',
        file: 'references/nope.md',
        getBundled,
        write: () => {},
      }),
    ).rejects.toMatchObject({
      code: 'AGENT_SKILL_FILE_NOT_FOUND',
      message:
        '"references/nope.md" is not part of serverless-sandboxes. Files: SKILL.md, references/config.md',
    })
  })
})
