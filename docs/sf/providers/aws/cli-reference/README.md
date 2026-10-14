<!--
title: Serverless - AWS Lambda - CLI Reference
menuText: CLI Reference
short_title: CLI Reference
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/cli-reference/)

<!-- DOCS-SITE-LINK:END -->

# Serverless CLI Reference for AWS

Welcome to the Serverless Framework CLI Reference for AWS. Please select a section on the left to get started.

## Non-interactive use: CI and AI agents

The CLI adapts when no one is at a terminal: in CI (the `CI` environment variable is set, with any value), when standard input or standard output is not a terminal (piped or redirected), and when an AI coding agent runs it.

- No animated spinner; progress messages are shown as plain lines with `--verbose`.
- Sign-in prompts are skipped. A command that needs a sign-in fails with a message that names the keys to set instead. `serverless login` prints the sign-in URL for you to open, except in CI, where it fails and names the keys to set; see [Login](login.md#non-interactive-shells). [`serverless login aws`](login-aws.md) and [`serverless login aws sso`](login-aws-sso.md) fail in these environments.

AI coding agents (Claude Code, Codex, Cursor, GitHub Copilot, Gemini CLI and others) are detected from the environment variables they set; any other tool can identify itself by setting `AI_AGENT`. They get this behavior even when they run commands in a terminal, and color codes are turned off. Set `FORCE_COLOR=1` to keep colors.

`serverless dev` prints a first line for AI agents that points to `serverless dev --detach`; see [Using Dev Mode from an AI agent](../guide/dev-mode.md#using-dev-mode-from-an-ai-agent).

Set `SLS_INTERACTIVE_SETUP_ENABLE` to any non-empty value when you are at a terminal and the CLI treats the run as non-interactive, for example because it takes you for an AI agent. Every command then runs as it does for a person: prompts come back, the spinner animates when standard error is a terminal, a run taken for an AI agent keeps its colors and no longer gets the AI agent line of `serverless dev`, and the [Dev Mode keys](dev.md#keys) work wherever standard input is a terminal. It takes precedence over AI agent detection, over `CI`, and over standard input or output that is not a terminal. A terminal that reports a width of zero columns, as some CI systems and agent harnesses create, still counts as non-interactive. `NO_COLOR` and `FORCE_COLOR` still decide colors (see [Colors](#colors)).

## Colors

The CLI colors its output when the terminal supports it. Set [`NO_COLOR`](https://no-color.org) to any non-empty value to turn color codes off, in a terminal too. `FORCE_COLOR` takes precedence over `NO_COLOR` and over AI agent detection: when it is set, its value decides. `FORCE_COLOR=0` or `FORCE_COLOR=false` turns color codes off; `FORCE_COLOR=1`, or an empty value, turns them on.

If you have questions, join the [Slack community](https://serverless.com/slack) or [post over on the forums](https://forum.serverless.com/)
