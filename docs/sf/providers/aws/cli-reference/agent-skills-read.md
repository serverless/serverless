<!--
title: Serverless Framework Commands - Agent Skills List and Read
description: List the Agent Skills bundled with the Serverless Framework CLI, and print one without installing it.
short_title: Commands - Agent Skills Read
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

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/cli-reference/agent-skills-read)

<!-- DOCS-SITE-LINK:END -->

# Agent Skills List and Read

The Serverless Framework CLI bundles [Agent Skills](../../../guides/agent-skills.md)
for its features. These two commands let an AI coding agent see and read
them without installing anything.

```bash
serverless agent skills list
```

Prints one line per bundled skill: name, version, scope (`user` skills are
installed into your home directory by [`agent setup`](agent-setup.md);
`project` skills into a service directory), and the skill's description.
Running `serverless agent skills` with no subcommand does the same.

```bash
serverless agent skills read serverless-sandboxes
serverless agent skills read serverless-sandboxes references/config.md
```

Prints the skill's `SKILL.md`, or one of its reference files, to standard
output. When the skill has other files, a closing line names them. Nothing is
written to disk — to install skills, use
[`agent skills install`](agent-skills-install.md) or
[`agent setup`](agent-setup.md).

Both commands work anywhere — no `serverless.yml`, no sign-in — and never
prompt. An unknown skill or file exits with status 1 and names the valid ones.

## Options

Global flags like `--debug` apply. There are no command-specific options.
