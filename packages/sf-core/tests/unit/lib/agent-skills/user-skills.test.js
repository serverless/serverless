import { pluginCopyNote } from '../../../../src/lib/agent-skills/user-skills.js'

describe('pluginCopyNote', () => {
  it('names the update command of an older marketplace plugin', () => {
    expect(
      pluginCopyNote({
        skill: 'sls-gateway',
        alsoInstalled: true,
        older: true,
        id: 'tools@acme',
      }),
    ).toBe(
      'sls-gateway: Claude Code lists it twice, from an installed plugin and from ~/.claude/skills, and the plugin\'s copy is older — to keep one, run "claude plugin update tools@acme", then delete ~/.claude/skills/sls-gateway',
    )
  })

  it('says to update an older plugin that has no update command', () => {
    // A plugin synced from claude.ai is updated there.
    expect(
      pluginCopyNote({
        skill: 'sls-gateway',
        alsoInstalled: true,
        older: true,
      }),
    ).toBe(
      "sls-gateway: Claude Code lists it twice, from an installed plugin and from ~/.claude/skills, and the plugin's copy is older — to keep one, update the plugin, then delete ~/.claude/skills/sls-gateway",
    )
  })
})
