<!--
title: Serverless Framework Commands - Agent Docs
description: Print the Serverless Framework documentation that ships with the CLI — the page index or specific pages — for AI coding agents.
short_title: Commands - Agent Docs
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

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/cli-reference/agent-docs)

<!-- DOCS-SITE-LINK:END -->

# Agent Docs

Print the Serverless Framework documentation that ships with the installed
CLI. The pages match the version you are running and need no network, which
makes this the reliable way for an AI coding agent to look something up
mid-task.

```bash
serverless agent docs
```

Without arguments, the command prints the page index: every page grouped by
section, with the path to pass and an approximate size.

```bash
serverless agent docs providers/aws/events/schedule
serverless agent docs guides/compose providers/aws/guide/functions
```

With one or more paths from the index, it prints those pages as markdown.
Several pages are printed under `## <path>` headings. Paths are relative to
the documentation root; the `.md` extension is optional, and a section path
such as `guides/mcp` prints that section's overview page.

The command works anywhere — no `serverless.yml`, no sign-in — and never
prompts. Output goes to standard output; an unknown path exits with status 1
and lists the pages that exist next to it.

## Options

Global flags like `--debug` apply. There are no command-specific options.

## Related

- [`agent setup`](agent-setup.md) — install the Agent Skills and check the
  environment
- [`agent skills read`](agent-skills-read.md) — print a bundled skill without
  installing it
