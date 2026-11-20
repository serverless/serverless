<!--
title: Agent Skills
description: Install the Serverless Framework Agent Skills with the CLI or as an agent plugin, so Claude Code, Codex, Cursor and other AI agents work with your service.
short_title: Agent Skills
keywords:
  [
    'Serverless Framework',
    'Agent Skills',
    'AI coding agents',
    'Claude Code',
    'Codex',
    'Cursor',
    'agent plugin',
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

The user-level skill is also available as an [agent plugin](#install-the-agent-plugin) for Claude Code, Codex, GitHub Copilot CLI and Gemini CLI.

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
- `.agents/skills/`, the open Agent Skills directory, read by Codex, Cursor, Gemini CLI, GitHub Copilot CLI and other agents that follow the standard.

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

## Install the agent plugin

The user-level `serverless-framework` skill is also published as an agent plugin in [serverless/agent-plugins](https://github.com/serverless/agent-plugins), for agents that install plugins: Claude Code, Codex, GitHub Copilot CLI and Gemini CLI. The plugin carries this one skill and works with Serverless Framework CLI v4. Project skills come from `serverless agent setup` in each service, with or without the plugin. A new plugin version follows each Framework release that changes the skill.

### Install the plugin in Claude Code

Add the plugin's repository as a plugin marketplace, then install the plugin from it:

```bash
claude plugin marketplace add serverless/agent-plugins
```

```bash
claude plugin install serverless@serverless
```

Claude Code doesn't update plugins from this marketplace on its own. To get each new version of the skill when it's released, run `/plugin` in Claude Code, open the **Marketplaces** tab, select **serverless**, and turn auto-update on. To update by hand, then start a new Claude Code session to load the new version:

```bash
claude plugin update serverless@serverless
```

### Install the plugin in Codex

Add the plugin's repository as a plugin marketplace, then install the plugin from it:

```bash
codex plugin marketplace add serverless/agent-plugins
```

```bash
codex plugin add serverless@serverless
```

### Install the plugin in GitHub Copilot CLI

Add the plugin's repository as a plugin marketplace, then install the plugin from it:

```bash
copilot plugin marketplace add serverless/agent-plugins
```

```bash
copilot plugin install serverless@serverless
```

### Install the plugin in Gemini CLI

Gemini CLI installs the plugin as an extension:

```bash
gemini extensions install https://github.com/serverless/agent-plugins
```

### Install the skill in other agents

For any agent that reads Agent Skills, this command copies the skill into the skill directories of the agents it finds on your machine:

```bash
npx skills add serverless/agent-plugins
```

The CLI treats that copy as its own: `serverless agent setup` and automatic updates keep it current.

### The user-level skill and Claude Code plugins

Claude Code lists a skill from an installed plugin and a skill of the same name in `~/.claude/skills` as two skills. When a Claude Code plugin that is installed and turned on for your user already provides the user-level `serverless-framework` skill at the same or a newer version, `serverless agent setup` and `serverless agent skills install` therefore don't add a copy to `~/.claude/skills`:

- When `~/.claude/skills` holds no copy of the skill, the commands leave that directory out and print this line. They still install the skill in `~/.agents/skills` when the home-directory signals select that directory.

  ```text
  serverless-framework: Claude Code loads it from an installed plugin, so it is not installed in ~/.claude/skills
  ```

- When `~/.claude/skills` already holds a Framework-managed copy, the commands keep that copy up to date and print this line:

  ```text
  serverless-framework: Claude Code lists it twice, from an installed plugin and from ~/.claude/skills — to keep one, delete ~/.claude/skills/serverless-framework
  ```

When the plugin's copy is older than the one the CLI bundles, the commands install the bundled version in `~/.claude/skills` and print a line that names the plugin to update, for example:

```text
serverless-framework: Claude Code lists it twice, from an installed plugin and from ~/.claude/skills, and the plugin's copy is older — to keep one, run "claude plugin update serverless@serverless", then delete ~/.claude/skills/serverless-framework
```

When the plugin is turned on in your claude.ai account, claude.ai keeps it up to date, so the line says "update the plugin" in place of a command. If the line still appears after the update, the plugin doesn't have the CLI's skill version yet: keep both copies until a later plugin version catches up.

The commands install the skill in `~/.claude/skills` as usual, with no line about the plugin, in these cases:

- You pass `--dir claude`.
- `~/.claude/skills` holds a copy you customized. Claude Code then lists your copy and the plugin's.
- The plugin is installed for one project only, or is turned off.

After you uninstall or turn off the plugin, run `serverless agent setup` again, in any directory, to install the skill in `~/.claude/skills`. Project skills are installed the same way with or without a plugin.

### The user-level skill and other agents' plugins

Codex lists a skill from an installed plugin and a skill of the same name in `~/.agents/skills` as two skills. `serverless agent setup` and `serverless agent skills install` still install the user-level skill in `~/.agents/skills`, because Gemini CLI, GitHub Copilot CLI, Cursor and other agents read that directory too. To keep one copy in Codex, turn the CLI's copy off in `~/.codex/config.toml`, where `HOME_DIR` is the absolute path of your home directory:

```toml
[[skills.config]]
path = "HOME_DIR/.agents/skills/serverless-framework/SKILL.md"
enabled = false
```

New Codex sessions then load only the plugin's copy. Other agents still load the copy in `~/.agents/skills`, and the CLI keeps it up to date.

Gemini CLI and GitHub Copilot CLI list the skill once: the copy in `~/.agents/skills` takes the place of the plugin's copy.

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
- A user-level skill directory you delete (for example `~/.claude/skills`) isn't created again by automatic updates. `agent setup` and `agent skills install` without `--dir` choose the user-level directories by the home-directory signals alone, so they create `~/.claude/skills` again while `~/.claude` exists, even when `~/.agents/skills` still holds Framework-managed skills. The exception is a skill that an installed Claude Code plugin provides ([The user-level skill and Claude Code plugins](#the-user-level-skill-and-claude-code-plugins)). To install only into `~/.agents/skills`, pass `--dir agents`.
- A single skill folder you delete from a directory that still holds other Framework-managed skills is installed again by the next update or `agent skills install`. To keep one skill out, take ownership of it instead ([Customizing a skill](#customizing-a-skill)).

## Dev Mode for coding agents

`serverless dev` runs a deployed stage's real invocations on your machine. An agent starts it with `serverless dev --detach`, follows it with `serverless dev wait`, `serverless dev requests` and `serverless dev replay`, and ends it with `serverless dev stop`, which restores the functions; each of these commands prints one JSON result with `--json`. The [Dev Mode guide](../providers/aws/guide/dev-mode.md#using-dev-mode-from-an-ai-agent) describes the loop, the exit codes and the files, and the bundled `serverless-dev-mode` skill teaches it:

```bash
serverless agent skills read serverless-dev-mode
```

## Related pages

- [`serverless agent setup`](../providers/aws/cli-reference/agent-setup.md): install the skills and check the environment in one command.
- [`serverless agent skills install`](../providers/aws/cli-reference/agent-skills-install.md): the install command's options and output.
- [serverless/agent-plugins](https://github.com/serverless/agent-plugins): the agent plugin's source and releases.
- [`serverless agent inspect`](../providers/aws/cli-reference/agent-inspect.md): give an agent the live AWS configuration of the deployed resources in one read-only call.
