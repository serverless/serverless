<!--
title: CLI Reference
description: Every serverless command for AWS, with links to each command's options, and how the CLI behaves in CI, for AI agents and with colors.
short_title: CLI Reference
menuText: CLI Reference
layout: Doc
keywords:
  [
    'Serverless Framework CLI',
    'serverless commands',
    'CLI reference',
    'non-interactive',
    'CI',
    'AI agents',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/cli-reference/)

<!-- DOCS-SITE-LINK:END -->

# CLI Reference

The `serverless` command (alias `sls`) deploys, runs and inspects Serverless Framework services on AWS. Each page in this section covers one command: what it changes, its options, and how to run it in CI or from an AI coding agent. Run `serverless <command> --help` for the options of the installed version.

## Commands to deploy and remove a service

- [serverless deploy](./deploy.md): deploy the whole service with CloudFormation.
- [serverless deploy function](./deploy-function.md): update one function's code or configuration without CloudFormation.
- [serverless package](./package.md): build the deployment artifacts and template without deploying.
- [serverless remove](./remove.md): delete the service's stack and its deployment artifacts.
- [serverless deploy list](./deploy-list.md): list stored deployments and function versions.
- [serverless rollback](./rollback.md): redeploy an earlier stored deployment.
- [serverless rollback function](./rollback-function.md): restore a function's code from an earlier version.
- [serverless prune](./prune.md): delete old Lambda function, layer and sandbox image versions.

## Commands to develop and test functions

- [serverless dev](./dev.md): run your functions and web apps on your machine against real AWS events.
- [serverless invoke](./invoke.md): invoke a deployed Lambda function.
- [serverless invoke local](./invoke-local.md): emulate an invocation on your machine.
- [serverless logs](./logs.md): print a function's logs.
- [serverless metrics](./metrics.md): print a function's metrics.

## Commands to inspect a service

- [serverless info](./info.md): show the deployed service's endpoints, functions and outputs.
- [serverless print](./print.md): print `serverless.yml` with variables resolved.
- [serverless diff](./diff.md): compare the local template with the deployed stack.

## Commands to sign in

- [serverless login](./login.md): sign in to the Serverless Framework Dashboard or save a License Key.
- [serverless login aws](./login-aws.md): get AWS credentials from your AWS Console sign-in.
- [serverless login aws sso](./login-aws-sso.md): sign in to AWS IAM Identity Center.

## Commands to manage plugins

- [serverless plugin install](./plugin-install.md): install a plugin and add it to `serverless.yml`.
- [serverless plugin uninstall](./plugin-uninstall.md): uninstall a plugin and remove it from `serverless.yml`.

## Commands for billing

- [serverless usage](./usage.md): show the org's Instance Credit usage and export the billable instances.
- [serverless reconcile](./reconcile.md): reconcile the org's billable instances with the stacks in your AWS account.

## Commands for AI coding agents

- [serverless agent setup](./agent-setup.md): install the Agent Skills and report the environment's status.
- [serverless agent docs](./agent-docs.md): print the documentation bundled with the CLI.
- [serverless agent skills install](./agent-skills-install.md): install the Agent Skills into a service.
- [serverless agent skills list and read](./agent-skills-read.md): list the bundled Agent Skills or print one.
- [serverless agent inspect](./agent-inspect.md): read the live AWS configuration of a deployed service's resources.

## Non-interactive use: CI and AI agents

The CLI adapts when no one is at a terminal: in CI (the `CI` environment variable is set, with any value), when standard input or standard output is not a terminal (piped or redirected), and when an AI coding agent runs it.

- No animated spinner; progress messages are shown as plain lines with `--verbose`.
- Sign-in prompts are skipped. A command that needs a sign-in stops with a message that names the keys to set instead (`SERVERLESS_ACCESS_KEY` or `SERVERLESS_LICENSE_KEY`).
- `serverless login` prints the sign-in URL for you to open, except in CI, where it stops and names the keys to set. For this check, CI is any of `CI`, `CONTINUOUS_INTEGRATION`, `BUILD_ID`, `BUILD_NUMBER`, `TEAMCITY_VERSION`, `TRAVIS`, `CIRCLECI`, `JENKINS_URL`, `GITLAB_CI`, `GITHUB_ACTIONS`, `BITBUCKET_BUILD_NUMBER`, `BUILDKITE`, `NOW_BUILDER` or `APPVEYOR` being set; see [serverless login in non-interactive shells](./login.md#non-interactive-shells) and [in CI](./login.md#sign-in-from-ci).
- [`serverless login aws`](./login-aws.md), [`serverless login aws sso`](./login-aws-sso.md) and `serverless logout` need a terminal and stop with an error without one.

AI coding agents (Claude Code, Codex, Cursor, GitHub Copilot, Gemini CLI and others) are detected from the environment variables they set; any other tool can identify itself by setting `AI_AGENT`. They get this behavior even when they run commands in a terminal, and color codes are turned off. Set `FORCE_COLOR=1` to keep colors.

`serverless dev` prints a first line for AI agents that points to `serverless dev --detach`; see [Using Dev Mode from an AI agent](../guide/dev-mode.md#using-dev-mode-from-an-ai-agent).

Set `SLS_INTERACTIVE_SETUP_ENABLE` to any non-empty value when you are at a terminal and the CLI treats the run as non-interactive, for example because it takes you for an AI agent. Every command then runs as it does for a person: prompts come back, the spinner animates when standard error is a terminal, a run taken for an AI agent keeps its colors and no longer gets the AI agent line of `serverless dev`, and the [Dev Mode keys](./dev.md#keys) work wherever standard input is a terminal. It takes precedence over AI agent detection, over `CI`, and over standard input or output that is not a terminal. A terminal that reports a width of zero columns, as some CI systems and agent harnesses create, still counts as non-interactive. `NO_COLOR` and `FORCE_COLOR` still decide colors (see [Colors](#colors)).

## Colors

The CLI colors its output when the terminal supports it. Set [`NO_COLOR`](https://no-color.org) to any non-empty value to turn color codes off, in a terminal too. `FORCE_COLOR` takes precedence over `NO_COLOR` and over AI agent detection: when it is set, its value decides. `FORCE_COLOR=0` or `FORCE_COLOR=false` turns color codes off; `FORCE_COLOR=1`, or an empty value, turns them on.
