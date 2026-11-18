<!--
title: serverless login
description: Sign in to the Serverless Framework Dashboard or save a License Key with serverless login, in a terminal, from an AI agent or a script, or in CI.
short_title: login
keywords:
  [
    'serverless login',
    'Serverless Framework CLI',
    'Serverless Framework Dashboard',
    'License Key',
    'Access Key',
    'SERVERLESS_ACCESS_KEY',
    'SERVERLESS_LICENSE_KEY',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/cli-reference/login)

<!-- DOCS-SITE-LINK:END -->

# serverless login

`serverless login` signs you in to the Serverless Framework Dashboard, or saves a License Key, so that the Framework's other commands can run. It saves the session or key in `~/.serverlessrc` on this machine and changes nothing in AWS. To sign in to AWS instead, use [`serverless login aws`](./login-aws.md) (AWS Console credentials) or [`serverless login aws sso`](./login-aws-sso.md) (IAM Identity Center).

```bash
serverless login
```

The command works inside or outside a service directory. In a terminal it shows a menu; without one (an AI agent, a script) it prints a sign-in URL for a person to open; in CI it stops and names the keys to set instead.

## Options

`serverless login` accepts this option:

| Option  | Alias | Value    | Default            | Required | Description                                                                                                                                                                                |
| ------- | ----- | -------- | ------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--org` |       | org name | Your saved default | No       | Org to make your default. With a session, it switches the default without signing in again; without one, the sign-in sets it. Never prompts: in a terminal too, it prints the sign-in URL. |

The command also accepts `--verbose`, `--debug` and `--help` (`-h`). `--org` fails with `You don't belong to an org named "<name>". Your orgs: ...` when you aren't a member of that org, and with an error when `SERVERLESS_ACCESS_KEY` or `SERVERLESS_LICENSE_KEY` is set, because such a key belongs to a single org.

## License Keys and Access Keys

The Framework signs in with one of these, in this order:

1. `SERVERLESS_ACCESS_KEY`: an [Access Key](https://app.serverless.com/settings/accessKeys) that a Dashboard user creates. It belongs to one org and suits CI.
2. A user session saved by `serverless login` in `~/.serverlessrc`.
3. `SERVERLESS_LICENSE_KEY`: a [License Key](../../../guides/license-keys.md) for an org, for CLI use without a Dashboard user.
4. `licenseKey` in `serverless.yml`, which accepts variables such as `${ssm:...}`.
5. A License Key saved by `serverless login` in `~/.serverlessrc`.
6. The `/serverless-framework/license-key` SSM parameter in the AWS account, read with the command's AWS credentials, when none of the others exists.

`serverless login` writes only the second and fifth, to `~/.serverlessrc` (or to `~/.config/.serverlessrc` when only that file exists). The keys in the environment and in `serverless.yml` need no login. With a user session, the first command that runs against an org also creates an Access Key for that org and saves it in the same file.

## Sign in from a terminal

In a terminal, `serverless login` prints a welcome line and, when no session or key exists yet, a menu:

- **Login/Register** opens the Dashboard sign-in in your browser and prints the URL. After you sign in, it saves the session and, when you belong to several orgs and have no default saved, asks which one to make your default.
- **Enter A License Key** asks for a License Key (input hidden), validates it and saves it. With License Keys for other orgs already saved, it asks whether to make this org the default.
- **Get A License** opens the Dashboard billing page.
- **Explain Licensing Basics** prints the licensing terms and shows the menu again.

When a session or key already exists, the command doesn't sign in again. To switch to another user, run `serverless logout` (it needs a terminal too), then `serverless login`.

The command doesn't create orgs. A user who belongs to no org gets `You are not a member of any Serverless Framework Orgs.` and creates one in the Dashboard.

## Non-interactive shells

When `serverless login` runs without a terminal (from an AI coding agent or a script) it can't show a menu or open a browser. It prints the Dashboard sign-in URL and waits up to 10 minutes for the sign-in:

```text
Sign in to the Serverless Framework Dashboard by opening this URL in a browser:
https://app.serverless.com?client=cli&transactionId=...

Waiting for the sign-in to complete (up to 10 minutes)
✔ Signed in as jane (org "acme")
```

Open the URL in any browser and sign in; the command then saves the session as the menu would. After 10 minutes it stops with `Sign-in was not completed within 10 minutes. Run "serverless login" again for a new URL.` If you belong to several orgs, the success line names the default and lists the others ([Choosing an org](#choosing-an-org)).

## Sign in from CI

In CI no one can open the sign-in URL, so `serverless login` stops right away and names the keys to set. For this check, CI is any of these environment variables being set: `CI`, `CONTINUOUS_INTEGRATION`, `BUILD_ID`, `BUILD_NUMBER`, `TEAMCITY_VERSION`, `TRAVIS`, `CIRCLECI`, `JENKINS_URL`, `GITLAB_CI`, `GITHUB_ACTIONS`, `BITBUCKET_BUILD_NUMBER`, `BUILDKITE`, `NOW_BUILDER` or `APPVEYOR`.

In a pipeline, don't run `serverless login`. Store an Access Key or License Key as a pipeline secret and expose it to the deploy step as the `SERVERLESS_ACCESS_KEY` or `SERVERLESS_LICENSE_KEY` environment variable. The Framework reads the key on every command and doesn't save it on the runner. The key belongs to one org, so use a key of the org the service deploys to ([Choosing an org](#choosing-an-org)).

`serverless login` provides no AWS credentials, and `serverless login aws` needs a terminal. Give the pipeline AWS credentials another way, such as the `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` environment variables or a resolver: see [which credentials a deploy uses](../guide/credentials.md#which-credentials-a-deploy-uses).

## Run serverless login again

Without `--org`, `serverless login` first checks the existing sign-in the way every other command does: a session, a key in the environment, a License Key saved on this machine, in `serverless.yml` or in the `/serverless-framework/license-key` SSM parameter. Without a terminal it then prints one of these lines and exits 0:

```text
✔ Already signed in as jane (org "acme")
✔ Using SERVERLESS_ACCESS_KEY from the environment
✔ Already using the License Key from the /serverless-framework/license-key SSM parameter
```

If that check fails (a revoked session, an invalid License Key), the command exits 1 with the error, like any other command. Re-running the command is safe: it never replaces a working session.

## What works without signing in

Every command needs a sign-in or a key, except:

- `serverless login`, `serverless login aws`, `serverless login aws sso` and `serverless logout`;
- `serverless plugin install` and `serverless plugin uninstall`;
- `serverless dev setup` run outside a service directory;
- `serverless agent setup`, `serverless agent docs` and `serverless agent skills`;
- `--help` (or `-h`) on the Framework's own commands, for example `serverless deploy --help`. Help for commands added by a service's plugins is shown once you sign in.

## Choosing an org

A command runs against the org given by `--org`, else by `org` in the service's `serverless.yml`, else by the `SERVERLESS_ORG_NAME` environment variable, else by your default org. Setting `org` in `serverless.yml` is the most reliable choice: it travels with the project, so teammates and CI deploy to the same org.

```yaml
# serverless.yml
org: my-org
service: my-service
```

When the Framework signs in with `SERVERLESS_ACCESS_KEY`, `SERVERLESS_LICENSE_KEY`, `licenseKey` or the SSM parameter, a command runs against that key's org. When `--org`, `org` or `SERVERLESS_ORG_NAME` names a different org, it stops with `The provided Access Key is not for the Org "<name>". Please provide an Access Key for the "<name>" Org.` (for a License Key, `The provided License Key is not for the Org "<name>". Please provide a License Key for the "<name>" Org.`).

If you belong to several orgs and have no default yet, signing in without a terminal picks the oldest org you own (or the oldest org, if you own none) and says so:

```text
✔ Signed in as jane (org "acme") — set as your default; you belong to 3 orgs: acme, beta, gamma. For a service in another org, add "org: <name>" to its serverless.yml; to change the default, run "serverless login --org <name>".
```

To change the default org of your user session, run `serverless login --org <name>`. The command saves the new default with the session; an `org` in `serverless.yml` still takes precedence over it. It prints:

```text
✔ Signed in as jane (org "beta"), now your default org
```

## Examples

### Sign in from a terminal

```bash
serverless login
```

### Make another org your default

```bash
serverless login --org my-org
```

## Related commands

- [`serverless login aws`](./login-aws.md) signs in to AWS with your AWS Console credentials.
- [`serverless login aws sso`](./login-aws-sso.md) signs in to AWS through IAM Identity Center.
- [Non-interactive use: CI and AI agents](./README.md#non-interactive-use-ci-and-ai-agents) describes how every command behaves without a terminal.
