<!--
title: serverless agent skills list and read
description: List the Agent Skills bundled with the Serverless Framework CLI and print one skill's files to standard output, without installing anything.
short_title: agent skills list / read
keywords:
  [
    'serverless agent skills read',
    'serverless agent skills list',
    'Agent Skills',
    'AI coding agents',
    'Claude Code',
    'Codex',
    'Cursor',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/cli-reference/agent-skills-read)

<!-- DOCS-SITE-LINK:END -->

# serverless agent skills list and read

`serverless agent skills list` names the [Agent Skills](../../../guides/agent-skills.md) bundled with the installed Serverless Framework CLI, and `serverless agent skills read` prints one skill's `SKILL.md` or reference file to standard output. Both read the copy bundled with the CLI and write nothing, so an AI coding agent can use a skill's instructions in a session without installing it. To install the skills into a service directory and your home directory, use [`serverless agent skills install`](./agent-skills-install.md); to read the Framework docs, use [`serverless agent docs`](./agent-docs.md).

```bash
serverless agent skills read serverless-sandboxes
```

## serverless agent skills list

`serverless agent skills list` prints one line per bundled skill: the name, the version (`v<n>`), the scope and the description. `serverless agent skills` with no subcommand prints the same list.

```bash
serverless agent skills list
```

The scope says where an install puts the skill: `user` skills go into your home directory (`~/.claude/skills`, `~/.agents/skills`), `project` skills into the service directory. The list, with descriptions shortened:

```text
serverless-dev-mode   v2  project  Runs a deployed stage's Lambda invocations and web app requests locally ...
serverless-framework  v5  user     Builds, deploys, and operates applications on AWS with the Serverless Framework ...
serverless-mcp        v4  project  Hosts Model Context Protocol (MCP) servers on AWS Lambda ...
serverless-sandboxes  v6  project  Builds, runs, and operates isolated or ephemeral compute on AWS with the Serverless Framework `sandboxes` feature ...
serverless-upgrade    v1  project  Upgrades Serverless Framework services from v1, v2, or v3 to v4 ...
```

A CLI version that bundles no skills prints `No skills are bundled with this CLI version.` and exits 0.

## serverless agent skills read

`serverless agent skills read` prints a bundled skill's `SKILL.md`, or one of its other files, as it ships with the installed CLI version:

```bash
serverless agent skills read <name> [file]
```

| Argument | Value                                             | Default    | Required | Description                                                                          |
| -------- | ------------------------------------------------- | ---------- | -------- | ------------------------------------------------------------------------------------ |
| `name`   | skill name                                        | none       | Yes      | The skill to print, as `serverless agent skills list` names it.                      |
| `file`   | path in the skill, such as `references/config.md` | `SKILL.md` | No       | The file of the skill to print, relative to the skill's folder, with `/` separators. |

When the skill has other files, the output ends with a line that names them, as for `serverless agent skills read serverless-sandboxes`:

```text
files: references/commands.md, references/config.md, references/control-plane.md, references/dev-mode.md, references/platform.md, references/troubleshooting.md — read one with: serverless agent skills read serverless-sandboxes <file>
```

`serverless agent skills list` and `serverless agent skills read` have no options of their own; they accept `--debug` and `--help` (`-h`).

## Errors and exit codes

Both commands exit 0 after printing. `serverless agent skills read` exits 1 and writes the error to standard error, with nothing on standard output, when:

- no name is given: `Specify a skill to read: serverless agent skills read <name> [file]. Bundled skills: ...`
- the skill isn't bundled: `Unknown skill "<name>". Bundled skills: ...`
- the file isn't part of the skill: `"<file>" is not part of <name>. Files: ...`
- the CLI bundles no skills: `No skills are bundled with this CLI version.`

Another word after `serverless agent skills` exits 1 and names the `install`, `list` and `read` subcommands.

## Side effects and non-interactive use

`serverless agent skills list` and `serverless agent skills read` write no files and never prompt, so they run the same in a terminal, in CI and under an AI agent. They need no `serverless.yml` and no sign-in, and run in any directory, also one whose `serverless.yml` doesn't parse. The skills come from the installed CLI, so reading them needs no network. When you are signed in, or `SERVERLESS_ACCESS_KEY` is set, the CLI signs in quietly after printing to count the run; nothing prompts, and a failure there doesn't change the result.

## Examples

### List the bundled skills

```bash
serverless agent skills list
```

### Print a skill's instructions

```bash
serverless agent skills read serverless-framework
```

### Print one reference file of a skill

```bash
serverless agent skills read serverless-sandboxes references/config.md
```

## Related commands

- [`serverless agent skills install`](./agent-skills-install.md): install the skills so agents load them on their own.
- [`serverless agent setup`](./agent-setup.md): install the skills and check the environment in one command.
- [`serverless agent docs`](./agent-docs.md): print the documentation bundled with the CLI.
