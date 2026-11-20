<!--
title: serverless agent skills install
description: Install or update the Serverless Framework Agent Skills in a service directory and your home directory, so AI coding agents load them.
short_title: agent skills install
keywords:
  [
    'serverless agent skills install',
    'Agent Skills',
    'AI coding agents',
    'Claude Code skills',
    'Codex',
    'Cursor',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/cli-reference/agent-skills-install)

<!-- DOCS-SITE-LINK:END -->

# serverless agent skills install

`serverless agent skills install` writes the [Agent Skills](../../../guides/agent-skills.md) bundled with the Serverless Framework CLI to disk: the project skills into the service directory, and the user-level `serverless-framework` skill into your home directory. Skills are instruction files that AI coding agents (Claude Code, Codex, Cursor and other agents that read the [open Agent Skills format](https://agentskills.io)) load when a task involves their feature. Use it to install or refresh skills only; [`serverless agent setup`](./agent-setup.md) installs the same skills and also reports whether sign-in and AWS credentials are ready.

```bash
serverless agent skills install
```

Run it in the service directory, where `serverless.yml` is. Anywhere else, `serverless agent skills install` installs only the user-level skill.

## Options

`serverless agent skills install` accepts this option:

| Option  | Alias | Value                                               | Default  | Required | Description                                                                                                                                           |
| ------- | ----- | --------------------------------------------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--dir` |       | `claude` or `agents`; repeatable or comma-separated | detected | No       | Write only to these skill directories, for the project skills and the user-level skill: `claude` is `.claude/skills/`, `agents` is `.agents/skills/`. |

Any other `--dir` value exits 1 with `Unknown --dir value "<value>". Valid values: claude, agents`. `serverless agent skills install` also accepts `--config` (`-c`), `--debug` and `--help` (`-h`).

## Files serverless agent skills install writes

Each skill is a folder named after the skill, with its `SKILL.md` and reference files, inside a skills directory:

- **Project skills** go into `.claude/skills/` and `.agents/skills/` in the service directory (at a [Compose](../../../guides/compose.md) root, beside `serverless-compose.yml`). Without `--dir`, the first rule that matches picks the directories:
  1. the skills directories that already hold Framework-managed skills;
  2. else, the service's `.claude/` and `.agents/` directories that exist;
  3. else, the agents found in your home directory: `~/.claude` selects `.claude/skills/`; `~/.agents`, `~/.codex` or `~/.cursor` select `.agents/skills/`;
  4. else, both.
- **The user-level `serverless-framework` skill** goes into `~/.claude/skills/` and `~/.agents/skills/`: with `--dir`, the directories it names; without it, those of the agents found in your home directory (the markers in rule 3), or both when none is found. When the environment has no home directory, the user-level install is skipped and the output says so. When an installed Claude Code plugin already provides the skill at the bundled version or newer, the command doesn't add a copy to `~/.claude/skills/`, unless you pass `--dir claude`; see [The user-level skill and Claude Code plugins](../../../guides/agent-skills.md#the-user-level-skill-and-claude-code-plugins).

Commit the project skills so teammates' agents get them. `serverless deploy` and `serverless package` leave `.claude/skills/serverless-*` and `.agents/skills/serverless-*` out of the function package.

## Re-running and customized skills

`serverless agent skills install` is safe to re-run. For each skill and directory, it:

- installs the skill when its folder is missing;
- updates the skill when the bundled version is newer than the installed `metadata.version`;
- leaves the skill as it is when it is up to date;
- skips the skill when its `SKILL.md` has no `metadata.managed-by: serverless-framework` line, which marks a skill you customized.

It never deletes files and never installs an older version. Newer CLI versions also update the managed skills they find on their own; see [Automatic updates](../../../guides/agent-skills.md#automatic-updates). To uninstall, delete the skill folders.

## Output of serverless agent skills install

`serverless agent skills install` writes its report to standard error: each project directory, then one line per skill it added (`+`) or updated (`↑`), and one per customized skill it skipped. User-level lines name the directory with `user:`. A first run in a service:

```text
Target: .claude/skills
  + serverless-dev-mode v2 (.claude/skills)
  + serverless-mcp v4 (.claude/skills)
  + serverless-sandboxes v6 (.claude/skills)
  + serverless-upgrade v1 (.claude/skills)
  + serverless-framework v5 (user: ~/.claude/skills)
Skills auto-update when you use a newer CLI. To customize a skill, remove its metadata.managed-by line. To uninstall, delete the skill folders.
```

Outside a service directory, the report adds `project skills: no serverless.yml in this directory; run this command in a service directory to install them there`. A CLI version that bundles no skills prints `No skills are bundled with this CLI version.` and writes nothing. A line that starts with `· serverless-framework: Claude Code` reports a copy of the skill that an installed Claude Code plugin provides ([The user-level skill and Claude Code plugins](../../../guides/agent-skills.md#the-user-level-skill-and-claude-code-plugins)).

## Non-interactive use

`serverless agent skills install` never prompts and needs no sign-in, so it runs the same in CI and under an AI agent. It exits 0 when it finishes. It exits 1 for an invalid `--dir` value, and before it runs when the service's configuration file can't be loaded, for example a `serverless.yml` that doesn't parse (`CONFIGURATION_PARSE_ERROR`).

## Examples

### Install into the detected agent directories

```bash
serverless agent skills install
```

### Install only for Claude Code

```bash
serverless agent skills install --dir claude
```

### Install into both skill directories

```bash
serverless agent skills install --dir claude,agents
```

## Related commands

- [`serverless agent setup`](./agent-setup.md): install the skills and report the environment status.
- [`serverless agent skills list and read`](./agent-skills-read.md): see a bundled skill without installing it.
- [Agent Skills](../../../guides/agent-skills.md): how agents load the skills, and how to customize one.
