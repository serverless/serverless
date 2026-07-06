<!--
title: 'Agent Skills'
description: 'Install and manage Serverless Framework Agent Skills — instruction files that teach AI coding agents like Claude Code, Codex, and Cursor how to work with your service.'
short_title: Agent Skills
keywords:
  [
    'Serverless Framework',
    'Agent Skills',
    'AI agents',
    'Claude Code',
    'Codex',
    'Cursor',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/agent-skills)

<!-- DOCS-SITE-LINK:END -->

# Agent Skills

The Serverless Framework ships [Agent Skills](https://agentskills.io) — instruction
files that teach AI coding agents (Claude Code, Codex, Cursor, and any agent
supporting the open standard) how to work with your service.

## Install

Run in your service directory (where `serverless.yml` lives):

    serverless agent skills install

Skills are written to:

- `.claude/skills/` — read by Claude Code (and Cursor)
- `.agents/skills/` — the open Agent Skills standard directory, read by Codex,
  Cursor, and other standard-compliant agents

The command detects which agent directories you or your team already use (in the
service and in your home directory) and writes only those; with no signal it
creates both. To choose explicitly:

    serverless agent skills install --dir claude
    serverless agent skills install --dir agents
    serverless agent skills install --dir claude --dir agents

`--dir` is repeatable and also accepts a comma-separated list
(`--dir claude,agents`).

We recommend committing the installed skills so your whole team's agents (and
newly onboarded teammates) benefit.

## Automatic updates

Once installed, skills refresh automatically: whenever you run any `serverless`
command with a newer CLI that bundles newer skills, installed skills are
silently upgraded (a one-line notice is printed). Notes:

- Updates only ever move forward — an older CLI never downgrades skills a
  teammate's newer CLI installed.
- Auto-update is skipped in CI environments.
- New skills added in newer CLI versions are installed into directories that
  already contain Framework-managed skills.

## Customizing a skill

Framework-managed skills are overwritten on update. To take ownership of a
skill and keep your edits, delete the `managed-by` line from its frontmatter:

    metadata:
      managed-by: serverless-framework   # ← delete this line to take ownership

The Framework never touches that skill again — it is yours.

## Uninstalling

Delete the skill folders (or the whole `.claude/skills` / `.agents/skills`
directory). As long as the other directory still contains Framework-managed
skills, a deleted directory is not recreated — not even by re-running
`install`. To fully remove: delete all Framework-managed skill folders from
both directories.

## More agent tooling

Once an agent is set up to work with your service, [`serverless agent
inspect`](../providers/aws/cli-reference/agent-inspect.md) gives it the live
AWS configuration of your deployed resources in a single read-only call —
useful when an agent needs to debug or reason about what's actually running,
not just the `serverless.yml` source.
