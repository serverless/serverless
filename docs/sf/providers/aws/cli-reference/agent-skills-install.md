<!--
title: Serverless Framework Commands - Agent Skills Install
description: Install Serverless Framework Agent Skills — instruction files that teach AI coding agents how to work with your service.
short_title: Commands - Agent Skills Install
keywords:
  [
    'Serverless',
    'Framework',
    'Agent Skills',
    'AI Agents',
    'Claude Code',
    'Codex',
    'Cursor',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/cli-reference/agent-skills-install)

<!-- DOCS-SITE-LINK:END -->

# Agent Skills Install

Install (or refresh) the Agent Skills bundled with the Serverless Framework
CLI into your service directory. Skills are instruction files that teach AI
coding agents — Claude Code, Codex, Cursor, and any agent supporting the
[open Agent Skills standard](https://agentskills.io) — how to work with your
service. The command is idempotent: re-running it updates already-installed
skills in place.

The set of bundled skills varies by CLI version. On a version that bundles
none yet, the command reports
`No skills are bundled with this CLI version.` and installs nothing.

```bash
serverless agent skills install
```

Run it in your service directory (where `serverless.yml` lives). By default
the command detects which agent directories you or your team already use and
writes only those; with no signal it creates both `.claude/skills/` and
`.agents/skills/`. See the [Agent Skills guide](../../../guides/agent-skills.md)
for the full behavior, automatic updates, and customization.

## Options

- `--dir` Target directory to install into: `claude` (`.claude/skills/`) or
  `agents` (`.agents/skills/`). Repeatable, and accepts a comma-separated
  list. Omit it to let the command detect the right targets.

## Examples

### Install into detected agent directories

```bash
serverless agent skills install
```

### Install only for Claude Code

```bash
serverless agent skills install --dir claude
```

### Install into both directories explicitly

```bash
serverless agent skills install --dir claude --dir agents
```

or equivalently:

```bash
serverless agent skills install --dir claude,agents
```
