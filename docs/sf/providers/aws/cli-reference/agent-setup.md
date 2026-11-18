<!--
title: serverless agent setup
description: Install the Serverless Framework Agent Skills and get a report on sign-in, AWS credentials and the service, so an AI coding agent can deploy.
short_title: agent setup
keywords:
  [
    'serverless agent setup',
    'Agent Skills',
    'AI coding agents',
    'Claude Code',
    'Codex',
    'Cursor',
    'AWS credentials check',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/cli-reference/agent-setup)

<!-- DOCS-SITE-LINK:END -->

# serverless agent setup

`serverless agent setup` prepares a machine and a service for AI coding agents: it installs the [Agent Skills](../../../guides/agent-skills.md) bundled with the CLI, then reports whether a `serverless.yml` is here, whether the CLI is signed in, and which AWS account and region a deploy would use, with the fix for each check that fails. It changes nothing in AWS and never prompts. Use it as the first command on a new machine or in a new service; use [`serverless agent skills install`](./agent-skills-install.md) when you only want the skills.

```bash
serverless agent setup
```

The command works in any directory. Outside a service it installs only the user-level `serverless-framework` skill; run it again in the service directory to install the project skills there.

## Options

`serverless agent setup` accepts these options:

| Option          | Alias | Value                                               | Default                                               | Required | Description                                                                                                                                                                |
| --------------- | ----- | --------------------------------------------------- | ----------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--stage`       | `-s`  | string                                              | `provider.stage`, else `dev`                          | No       | The stage whose AWS credentials to check, as `serverless deploy` picks them.                                                                                               |
| `--region`      |       | string                                              | the `aws` resolver's `region`, else `provider.region` | No       | The region the AWS check calls AWS STS in.                                                                                                                                 |
| `--aws-profile` |       | string                                              | `provider.profile`, else `AWS_PROFILE`                | No       | The AWS profile to check. Ignored when an `aws` resolver in `serverless.yml` supplies the credentials.                                                                     |
| `--dir`         |       | `claude` or `agents`; repeatable or comma-separated | detected                                              | No       | Write the skills only to `.claude/skills` (`claude`, Claude Code) or `.agents/skills` (`agents`, the open Agent Skills format), for the user-level and the project skills. |

An invalid `--dir` value exits 1 with `Unknown --dir value "<value>". Valid values: claude, agents`. `serverless agent setup` also accepts `--config` (`-c`), `--debug` and `--help` (`-h`).

## Skills serverless agent setup installs

`serverless agent setup` writes the same files as [`serverless agent skills install`](./agent-skills-install.md#files-serverless-agent-skills-install-writes):

- The user-level `serverless-framework` skill, in every directory, into `~/.claude/skills` and `~/.agents/skills` for the agents found in your home directory (both when none is found), so any agent on the machine knows the Framework in every project.
- Inside a service directory, the project skills, into the service's `.claude/skills` and `.agents/skills` as `serverless agent skills install` picks them. Each one loads only when a task involves its feature, such as adding an MCP server to the service, so they are installed whether or not the service uses the feature yet.

Commit the project skills so teammates' agents get them. `serverless deploy` and `serverless package` leave them out of the function package; `package.patterns` can include them again (see [Packaging](../guide/packaging.md)). A skill is updated only when the bundled version is newer, and a skill whose `SKILL.md` has no `metadata.managed-by: serverless-framework` line is skipped as customized. Installed skills update as the CLI updates; see [Automatic updates](../../../guides/agent-skills.md#automatic-updates).

## Output of serverless agent setup

`serverless agent setup` writes its report to standard error, in three parts: `skills:`, `environment:` and a `docs:` line. Outside a service directory, signed out, with a default AWS profile:

```text
skills:
  serverless-framework v5 (user) — installed in ~/.claude/skills, ~/.agents/skills

environment:
  service: no serverless.yml in this directory — create one (see the serverless-framework skill), then run "serverless agent setup" again there to install the project skills; or run "serverless" in an interactive terminal to scaffold a project
  auth: not signed in — if the user is at the keyboard, run "serverless login" (without a terminal it prints a sign-in URL for them to open and waits up to 10 minutes); for unattended runs, set SERVERLESS_ACCESS_KEY (create one at https://app.serverless.com/settings/accessKeys) or SERVERLESS_LICENSE_KEY (create one at https://app.serverless.com/settings/licenseKeys)
  aws credentials: profile "default" — account 123456789012, region us-east-1

docs: read ~/.claude/skills/serverless-framework/SKILL.md now; new sessions load it automatically. "serverless agent docs" prints the documentation on demand
```

- **`skills:`** has one line per skill: `installed in` or `updated in` the directories it wrote, `up to date`, `customized by you (no managed-by) — skipped`, or `target not writable — skipped`. After a run that added project skills, a `project skills:` note says to commit them. Without a home directory, the line `skills: user-level install skipped (no home directory available in this environment)` replaces the user-level entry.
- **`service:`** reads `service: serverless.yml found; AWS credentials checked for stage "dev"` in a service directory, naming the configuration file and the stage the AWS check covered.
- **`docs:`** is printed only when the `serverless-framework` skill is on disk.

## Checks serverless agent setup runs

The sign-in and service checks are local. The sign-in check reports the first source the CLI would sign in with, in this order:

1. An Access Key in the environment: `SERVERLESS_ACCESS_KEY`, or `SERVERLESS_USER_ACCESS_KEY`.
2. Your signed-in session from `serverless login`.
3. A License Key in the environment: `SERVERLESS_LICENSE_KEY`, or `SERVERLESS_ORG_ACCESS_KEY`.
4. `licenseKey` in `serverless.yml`.
5. A License Key saved on this machine.

The AWS check finds credentials the way `serverless deploy` does and makes the same AWS STS account lookup, so the `aws credentials:` line shows the account and region a deploy would use. When AWS rejects the credentials, the line quotes AWS, names where the credentials came from, and gives the fix. Inside a service, the check uses:

- the `aws` [resolver](../guide/credentials.md#using-resolvers-to-specify-deployment-credentials) a deploy takes credentials from (the one named in `provider.resolver`, or the service's only `type: aws` resolver), with its profile, keys and region;
- otherwise `--aws-profile`, else `provider.profile`, else `AWS_PROFILE` and the rest of the AWS credential chain.

These cases are reported without the AWS call:

- A `provider.profile`, a region (`provider.region` or the resolver's `region`), or an `aws` resolver setting written as a variable, such as `${param:awsProfile}`: `serverless agent setup` reads `serverless.yml` without resolving variables. Run `serverless package` to check it.
- AWS credentials from a [Serverless Dashboard Provider](../../../guides/dashboard/providers.md). When you are signed in or use an Access Key, a deploy uses the org's provider instead of local credentials if one is set up, so the line says so: after the account and region when AWS accepts the local credentials, and after the fix when none are found. The note is left out when the `aws` resolver sets `dashboard: false`.

When AWS doesn't answer within 15 seconds, the line says the credentials were not verified, which points to the network rather than the credentials. When AWS can't be reached at all, it says `not verified: could not reach AWS (<error>)` and asks you to check the network or proxy.

### Stages the AWS check covers

The AWS check covers one stage: `--stage`, else `provider.stage`, else `dev`. Stages under `stages:` whose `aws` resolver supplies other credentials are listed after the AWS line, without being checked:

```text
  other stages, not checked: "staging" (resolver "aws-account", profile "staging-account") — check one with "serverless agent setup --stage <name>"
```

Run `serverless agent setup --stage <stage>` to check one of them. A stage that picks its profile through a variable isn't listed, since `serverless agent setup` doesn't resolve variables.

## Side effects and non-interactive use

`serverless agent setup` writes only the skill files, under the service directory and your home directory. It reads `serverless.yml` and `.serverlessrc` without changing them, makes one AWS STS call, and changes nothing in AWS. It never prompts and needs no sign-in, so it runs the same in a terminal, in CI and under an AI agent.

`serverless agent setup` exits 0 even when a check fails: the report lines say what needs fixing. It exits 1 for an invalid `--dir` value, and before it runs when the service's configuration file can't be loaded, for example a `serverless.yml` that doesn't parse (`CONFIGURATION_PARSE_ERROR`). It is safe to re-run: a re-run installs what is missing, updates older skills, and reports the environment again.

## Examples

### Set up a new machine

```bash
serverless agent setup
```

### Check the credentials of another stage

```bash
serverless agent setup --stage staging
```

### Install the skills only for Claude Code

```bash
serverless agent setup --dir claude
```

## Related commands

- [`serverless agent skills install`](./agent-skills-install.md): install or update the skills without the environment report.
- [`serverless agent docs`](./agent-docs.md): print the documentation bundled with the CLI.
- [`serverless login`](./login.md): sign in to the Serverless Framework.
