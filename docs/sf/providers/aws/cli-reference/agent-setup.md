<!--
title: Serverless Framework Commands - Agent Setup
description: Set up AI agent integrations — install the Serverless Framework Agent Skills and get an environment status report with actionable fixes.
short_title: Commands - Agent Setup
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

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/cli-reference/agent-setup)

<!-- DOCS-SITE-LINK:END -->

# Agent Setup

Set up AI coding agents to work with the Serverless Framework, and check that
your environment is ready to deploy:

```bash
serverless agent setup
```

The command works anywhere — no `serverless.yml` required, no sign-in
required — and never prompts, so agents can run it too. It is idempotent:
re-running updates what is already installed.

## What it does

**Installs Agent Skills.** The `serverless-framework` skill is installed at
the user level — into `~/.claude/skills` and/or `~/.agents/skills`, matching
the agent directories detected on your machine — so any agent on the machine
understands the Framework in every project. Inside a service directory, the
project-specific skills are installed as well — the same set as
[`agent skills install`](agent-skills-install.md) — into `.claude/skills` and
`.agents/skills`. Each one loads only when a task involves its feature, such
as adding an MCP server to the service, so they are installed whether or not
the service uses the feature yet. Commit them so teammates' agents get them;
deployments leave them out of the function package (re-include them with
[`package.patterns`](../guide/packaging.md) if a function needs them).
Installed skills update automatically as the CLI updates; skills you
customize are never overwritten.

**Reports environment status.** Each line is a check, and failing checks
carry their fix:

```text
skills:
  serverless-framework v1 (user) — installed in ~/.claude/skills, ~/.agents/skills

environment:
  service: no serverless.yml in this directory — create one (see the serverless-framework skill), then run "serverless agent setup" again there to install the project skills; or run "serverless" in an interactive terminal to scaffold a project
  auth: not signed in — if the user is at the keyboard, run "serverless login" (without a terminal it prints a sign-in URL for them to open and waits up to 10 minutes); for unattended runs, set SERVERLESS_ACCESS_KEY (create one at https://app.serverless.com/settings/accessKeys) or SERVERLESS_LICENSE_KEY (create one at https://app.serverless.com/settings/licenseKeys)
  aws credentials: profile "default" — account 123456789012, region us-east-1

docs: read ~/.claude/skills/serverless-framework/SKILL.md now; new sessions load it automatically. "serverless agent docs" prints the documentation on demand
```

Nothing prompts. Serverless authentication and service presence are
checked locally, in the order the CLI signs in: an Access Key in the
environment, your signed-in session, a License Key in the environment, a
`licenseKey` in `serverless.yml`, then a License Key saved on this machine. The AWS
check finds credentials the way a deploy does and makes the same AWS STS
account lookup, so the line shows the account and region a deploy would use.
If AWS rejects the credentials, the line quotes AWS and names where the
credentials came from and how to fix them. Inside a service it uses the
credentials a deploy would. When the service deploys through an `aws`
[resolver](../guide/credentials.md#using-resolvers-to-specify-deployment-credentials) (the one named in `provider.resolver`, or
the service's only `type: aws` resolver), it uses that resolver's profile,
keys and region. Otherwise it uses `--aws-profile`, else `provider.profile`
in `serverless.yml`, then `AWS_PROFILE`. Two cases are reported without that
check:

- a `provider.profile`, or an `aws` resolver setting, written as a variable
  (for example `${param:awsProfile}`), because `agent setup` reads
  `serverless.yml` without resolving variables. Run `serverless package` to
  check it.
- AWS credentials supplied by a [Serverless Dashboard Provider](../../../guides/dashboard/providers.md).
  When no local credentials are found and you are signed in or use an access
  key, the line says a deploy may use that provider instead, unless the `aws`
  resolver sets `dashboard: false`.

The check covers one stage: `--stage`, else `provider.stage`, else `dev`.
The `service:` line names it. Stages under `stages:` whose `aws` resolver
supplies other credentials are listed after the AWS line, without being
checked:

```text
  other stages, not checked: "staging" (resolver "aws-account", profile "staging-account") — check one with "serverless agent setup --stage <name>"
```

Run `serverless agent setup --stage <stage>` to check one of them. A stage that
picks its profile through a variable is not listed, since `agent setup` does
not resolve variables.

If AWS does not answer within 15 seconds, the line says the credentials were
not verified, which points to the network rather than the credentials,
instead of waiting.

## Options

- `--stage <name>` — the stage whose AWS credentials to check, as with
  `deploy`.
- `--aws-profile <name>` — the AWS profile to check, as with `deploy`. An
  `aws` resolver in `serverless.yml` supplies its own credentials, so the flag
  does not apply there.
- `--dir claude|agents` — write skills only to the given directories, for
  both the user-level and the project skills: `claude` (`.claude/skills` —
  Claude Code) or `agents` (`.agents/skills` — the open Agent Skills
  standard). Repeatable, and accepts a comma-separated list.

Global flags like `--debug` apply.
