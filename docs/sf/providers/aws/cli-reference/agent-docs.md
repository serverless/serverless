<!--
title: serverless agent docs
description: Print the Serverless Framework docs bundled with the installed CLI, as a page index or as markdown pages, for AI coding agents and offline reading.
short_title: agent docs
keywords:
  [
    'serverless agent docs',
    'Serverless Framework documentation offline',
    'AI coding agents',
    'Claude Code',
    'Codex',
    'Cursor',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/cli-reference/agent-docs)

<!-- DOCS-SITE-LINK:END -->

# serverless agent docs

`serverless agent docs` prints the Serverless Framework documentation that ships with the installed CLI: the page index, or the pages you name, as markdown on standard output. The pages match the CLI version you run and are read from the installation, so an AI coding agent can look up a key or a command mid-task without a browser. Use it to read the docs; use [`serverless agent skills read`](./agent-skills-read.md) to read a bundled Agent Skill, the task-focused instructions an agent loads for one feature.

```bash
serverless agent docs
```

The index lists every page with the path to pass back to the command. To print pages, name their paths:

```bash
serverless agent docs providers/aws/events/schedule
```

## Options

`serverless agent docs` takes page paths as positional arguments and has no options of its own:

| Argument  | Value                  | Default         | Required | Description                                                                                                      |
| --------- | ---------------------- | --------------- | -------- | ---------------------------------------------------------------------------------------------------------------- |
| `[paths]` | one or more page paths | none: the index | No       | Pages to print. Separate several with spaces or commas. Paths come from the index; the `.md` suffix is optional. |

`serverless agent docs` also accepts `--debug` and `--help` (`-h`).

## How serverless agent docs resolves a path

Paths are relative to the documentation root, with `/` separators, as the index prints them. For a path `p`, `serverless agent docs` prints the first file that exists of:

1. `p.md`
2. `p/README.md`, so a section path such as `guides/mcp` prints that section's overview page
3. `p` itself, when it ends in `.md`

A trailing `/` is ignored, and `\` counts as `/`.

## Output of serverless agent docs

Without paths, `serverless agent docs` prints the index. It starts with a header line, then each section of the docs menu with its pages: the path, the menu title (nested menu groups joined with `›`) and the page size rounded to kilobytes. Pages the menu leaves out come last, under `Other pages`. A trimmed index:

```text
Serverless Framework documentation. Read a page: serverless agent docs <path> [<path> ...]

Intro
  README                        Intro            ~5 KB
Get Started
  getting-started               Setup            ~20 KB
  guides/upgrading-v4           Upgrading To V4  ~16 KB
  providers/aws/guide/intro     Concepts         ~5 KB
```

With one path, `serverless agent docs` prints the page's markdown without its metadata comment and the docs-site link block. With several paths, each page follows a `## <path>` heading, and a `---` line separates the pages.

## Errors and exit codes

`serverless agent docs` exits 0 after printing. It checks every path before it prints anything, so a failed call prints nothing on standard output, exits 1 and writes one of these errors to standard error:

- `Page "<path>" not found. Pages under "<section>":` followed by the pages in the nearest section that exists, then `Run "serverless agent docs" for the full index.`
- `Invalid path "<path>" — paths are relative to the documentation root.` for an absolute path or one that contains `..`.

## Side effects and non-interactive use

`serverless agent docs` writes no files and never prompts, so it runs the same in a terminal, in CI and under an AI agent. It needs no `serverless.yml` and no sign-in, and runs in any directory, also one whose `serverless.yml` doesn't parse. Reading the pages needs no network. When you are signed in, or `SERVERLESS_ACCESS_KEY` is set, the CLI signs in quietly after printing to count the run; nothing prompts, and a failure there doesn't change the result.

## Examples

### Print the page index

```bash
serverless agent docs
```

### Print one page

```bash
serverless agent docs providers/aws/guide/functions
```

### Print several pages in one call

```bash
serverless agent docs guides/compose providers/aws/guide/functions
```

### Print a section's overview page

```bash
serverless agent docs guides/mcp
```

## Related commands

- [`serverless agent skills read`](./agent-skills-read.md): print a bundled Agent Skill without installing it.
- [`serverless agent setup`](./agent-setup.md): install the Agent Skills and check the environment.
- [Agent Skills](../../../guides/agent-skills.md): what the skills are and how agents load them.
