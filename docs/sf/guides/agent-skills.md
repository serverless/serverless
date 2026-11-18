<!--
title: Agent Skills
description: Install the Serverless Framework Agent Skills that teach Claude Code, Codex, Cursor and other AI coding agents to work with your service.
short_title: Agent Skills
keywords:
  [
    'Serverless Framework',
    'Agent Skills',
    'AI coding agents',
    'Claude Code',
    'Codex',
    'Cursor',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/agent-skills)

<!-- DOCS-SITE-LINK:END -->

# Agent Skills

The Serverless Framework CLI ships [Agent Skills](https://agentskills.io): instruction files that teach AI coding agents, such as Claude Code, Codex, Cursor and other agents that read the open Agent Skills format, how to build, deploy and debug Serverless Framework services. Install them once, and the agent loads the matching skill when a task needs it; the CLI keeps the installed skills up to date.

To install the skills and check that your environment is ready for an agent, run this in your service directory:

```bash
serverless agent setup
```

[`serverless agent setup`](../providers/aws/cli-reference/agent-setup.md) installs the user-level `serverless-framework` skill into your home directory, installs the project skills when it runs in a service directory, and reports whether authentication, AWS credentials and the service are ready, with a fix for anything missing. It needs no Serverless sign-in.

## Bundled skills

The CLI bundles these skills; `serverless agent skills list` names the ones your CLI version ships:

| Skill                  | Scope      | What it teaches                                                               |
| ---------------------- | ---------- | ----------------------------------------------------------------------------- |
| `serverless-framework` | User-level | Building, deploying and operating services with `serverless.yml` and the CLI  |
| `serverless-dev-mode`  | Project    | Running a Dev Mode session (`serverless dev`) and reading what it recorded    |
| `serverless-mcp`       | Project    | Hosting MCP servers on AWS Lambda with the `mcp` block                        |
| `serverless-sandboxes` | Project    | Running isolated workloads with the `sandboxes` feature (AWS Lambda MicroVMs) |
| `serverless-upgrade`   | Project    | Upgrading services from v1, v2 or v3 to v4                                    |

A user-level skill goes into your home directory and works in every project. Project skills go into a service directory, where you can commit them for your team.

## Install Agent Skills

To install the skills without the environment report, run this in your service directory, the directory that holds `serverless.yml`:

```bash
serverless agent skills install
```

Outside a service directory, the command installs only the user-level skill and says that project skills need a service directory. The command needs no Serverless sign-in, and re-running it updates the skills.

The skills are written to one or both of these directories, in the service for project skills and in your home directory (`~/`) for the user-level skill:

- `.claude/skills/`, read by Claude Code.
- `.agents/skills/`, the open Agent Skills directory, read by Codex, Cursor and other agents that follow the standard.

Without `--dir`, the command picks the project directories in this order:

1. The directories that already hold skills the Framework manages.
2. The `.claude` and `.agents` directories that exist in the service.
3. The agents your home directory shows: `~/.claude` selects `.claude/skills`; `~/.agents`, `~/.codex` or `~/.cursor` selects `.agents/skills`.
4. Both directories.

The user-level skill goes to `~/.claude/skills` and `~/.agents/skills` by the same home-directory signals, or to both when there are none. To choose the directories, pass `--dir` with `claude`, `agents` or both; it applies to the project and the user-level directories:

```bash
serverless agent skills install --dir claude --dir agents
```

`--dir` is repeatable and also accepts a comma-separated list (`--dir claude,agents`). Another value stops the command with `Unknown --dir value`.

Commit the installed project skills, so your team's agents and new teammates get them too.

## Automatic updates

After a `serverless` command succeeds, the CLI updates installed skills to the versions it bundles, and prints a one-line notice that starts with `Serverless agent skills updated:`. It updates the user-level skill wherever the command runs, and project skills when the command runs in the service. Automatic updates follow these rules:

- An update writes a skill only when the bundled version is newer, so an older CLI never downgrades skills that a teammate's newer CLI installed.
- An update writes only into directories that already hold Framework-managed skills. There it also adds skills that a newer CLI bundles for the first time.
- Updates are skipped in CI (detected from environment variables such as `CI` or `GITHUB_ACTIONS`), after a failed command, and for `--help`, `--version` and the `agent` commands. `agent setup` and `agent skills install` update skills themselves; `agent docs` and `agent skills list`/`read` never write any.
- A skill you took ownership of ([Customizing a skill](#customizing-a-skill)) is never updated.

## Read a skill without installing it

The CLI prints any bundled skill on demand, so an agent working in a project without installed skills can still read it:

```bash
serverless agent skills list
serverless agent skills read serverless-sandboxes
serverless agent skills read serverless-sandboxes references/config.md
```

[`serverless agent docs`](../providers/aws/cli-reference/agent-docs.md) does the same for the documentation: it prints the page index or any page that ships with the installed CLI. See [`serverless agent skills read`](../providers/aws/cli-reference/agent-skills-read.md) for the options.

## Customizing a skill

The CLI overwrites Framework-managed skills when it updates them. To keep your edits to a skill, take ownership of it by deleting the `managed-by` line from the frontmatter of its `SKILL.md`:

```yaml
metadata:
  managed-by: serverless-framework # delete this line to take ownership
```

The CLI never changes that skill again, and `agent skills install` reports it as customized by you.

## Uninstall Agent Skills

To remove the skills, delete all Framework-managed skill folders from both skill directories, in the service and in your home directory.

- A whole project skill directory you delete from the service (for example `.claude/skills`) isn't created again while the other directory still holds Framework-managed skills, not even by `agent skills install` without `--dir`.
- A user-level skill directory you delete (for example `~/.claude/skills`) isn't created again by automatic updates. `agent setup` and `agent skills install` without `--dir` choose the user-level directories by the home-directory signals alone, so they create `~/.claude/skills` again while `~/.claude` exists, even when `~/.agents/skills` still holds Framework-managed skills. To install only into `~/.agents/skills`, pass `--dir agents`.
- A single skill folder you delete from a directory that still holds other Framework-managed skills is installed again by the next update or `agent skills install`. To keep one skill out, take ownership of it instead ([Customizing a skill](#customizing-a-skill)).

## Dev Mode for coding agents

`serverless dev` runs a deployed stage's real invocations on your machine. An agent starts it with `serverless dev --detach`, follows it with `serverless dev wait`, `serverless dev requests` and `serverless dev replay`, and ends it with `serverless dev stop`, which restores the functions; each of these commands prints one JSON result with `--json`. The [Dev Mode guide](../providers/aws/guide/dev-mode.md#using-dev-mode-from-an-ai-agent) describes the loop, the exit codes and the files, and the bundled `serverless-dev-mode` skill teaches it:

```bash
serverless agent skills read serverless-dev-mode
```

## Related pages

- [`serverless agent setup`](../providers/aws/cli-reference/agent-setup.md): install the skills and check the environment in one command.
- [`serverless agent skills install`](../providers/aws/cli-reference/agent-skills-install.md): the install command's options and output.
- [`serverless agent inspect`](../providers/aws/cli-reference/agent-inspect.md): give an agent the live AWS configuration of the deployed resources in one read-only call.
