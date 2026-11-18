<!--
title: Getting Started
description: Install the Serverless Framework CLI, create a service from a template, deploy it to AWS Lambda, invoke it and remove it.
short_title: Getting Started
keywords:
  [
    'Serverless Framework',
    'getting started',
    'install Serverless Framework',
    'deploy AWS Lambda',
    'serverless deploy',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/getting-started)

<!-- DOCS-SITE-LINK:END -->

# Getting started

This guide installs the Serverless Framework CLI, creates a service from a template, deploys it to AWS Lambda, calls it and removes it. You need [Node.js](https://nodejs.org) 18 or later with `npm`, an AWS account, and a terminal.

Install the CLI:

```bash
npm i -g serverless
```

In an empty directory, run the onboarding command. It asks you to pick a template (choose **AWS / Node.js / HTTP API** or **AWS / Python / HTTP API**), name the service, sign in or enter a License Key, and set up AWS credentials:

```bash
serverless
```

Deploy the new service from its directory (here named `my-service`):

```bash
cd my-service
serverless deploy
```

The output ends with the function and its HTTP endpoint:

```text
✔ Service deployed to stack my-service-dev (52s)

endpoint: GET - https://abc123def4.execute-api.us-east-1.amazonaws.com/
functions:
  hello: my-service-dev-hello (1.2 kB)
```

Call the function, then remove the service when you're done:

```bash
serverless invoke -f hello
```

```bash
serverless remove
```

The rest of this page explains each step, how to run it without prompts (CI and AI agents), and what to do next.

## Install the Serverless Framework

The Serverless Framework CLI needs [Node.js](https://nodejs.org) 18 or later with `npm` on your `PATH`. Before it runs a Framework v4 release, the CLI checks for both and stops when `node` or `npm` is missing or Node.js is older than 18.

To install the CLI globally, run:

```bash
npm i -g serverless
```

To check the installation, print the version:

```bash
serverless --version
```

On first use, the CLI downloads the Framework release into `~/.serverless/releases/<version>` (`%USERPROFILE%\.serverless\releases\<version>` on Windows).

With npm 12 and later, npm blocks packages' install scripts unless you allow them, and prints an `npm warn install-scripts` line naming `serverless`. The installation is complete either way: the CLI downloads its binary the first time you run `serverless`. To download it during `npm install` instead, allow the script:

```bash
npm i -g --allow-scripts=serverless serverless
```

### For AI coding agents

If you work through an AI coding agent (Claude Code, Codex, Cursor, or any agent that can run terminal commands), paste this prompt into it instead of running the commands yourself:

```text
Set up the Serverless Framework for me so I can build and deploy to AWS from this machine. Do everything you can yourself; hand me only the steps that need my account or my browser.
1. Install it with `npm i -g serverless`.
2. Run `serverless agent setup`. It installs the serverless-framework Agent Skill and prints an environment report.
3. Read the serverless-framework skill's SKILL.md and follow it.
4. Finish with a short report: what's ready, what still needs me, and what you suggest doing next here.
```

The prompt changes these things on your machine:

- It installs the Serverless Framework CLI and downloads the release into `~/.serverless/releases`.
- It writes the `serverless-framework` [Agent Skill](guides/agent-skills.md) into `~/.claude/skills` and/or `~/.agents/skills`, whichever your agents use. Inside a project, it also writes project skills into `.claude/skills` and `.agents/skills`.
- Nothing else: `serverless agent setup` asks no questions, needs no sign-in and is safe to re-run.

To check that it worked: `serverless --version` prints the Framework version, the `environment:` report shows `auth:` and `aws credentials:` lines (failing lines name their fix), and your agent lists a `serverless-framework` skill in its next session. See [`agent setup`](providers/aws/cli-reference/agent-setup.md) and [`agent docs`](providers/aws/cli-reference/agent-docs.md).

### Installing behind a proxy or firewall

During installation, the Serverless Framework CLI downloads its binary from `install.serverless.com`. When it runs, it connects to these hosts over HTTPS (port 443):

- `install.serverless.com`: downloads of the CLI binary and Framework releases, and version checks for automatic updates.
- `core.serverless.com`: License Key validation, authentication and usage reporting.
- `api.serverless.com`: signing in through the browser, for example with `serverless login`.
- `github.com`: downloading the template that the `serverless` onboarding command creates a new service from.

If your network restricts outbound traffic, allow these hosts. `npm install` itself needs access to your npm registry as usual.

To use a proxy, set the standard `HTTPS_PROXY` environment variable (and `NO_PROXY` for hosts that must be reached directly). The CLI uses these both while installing and every time it runs. During `npm install`, proxy settings from your npm configuration (`https-proxy`, `proxy` and `noproxy` in `.npmrc`) also apply to the binary download when no proxy environment variables are set.

If your proxy inspects TLS traffic with a corporate certificate, point `NODE_EXTRA_CA_CERTS` at your CA bundle in PEM format. The CLI trusts it for all of its connections.

When the binary download is blocked during installation, `npm install` still completes, with a warning that names the network error, and the CLI downloads its binary the first time you run `serverless`. In CI, set the proxy variables for the job that runs `serverless`, not only for the step that installs it.

## Create a service

A service is one `serverless.yml` file and the AWS resources it deploys: Lambda functions, the events that trigger them (HTTP endpoints, queues, schedules) and other resources such as DynamoDB tables. A service can hold a whole application or one part of it; start with one service and split it when you need to. For more, see [Services](./providers/aws/guide/services.md).

To create a service interactively, run `serverless` with no command in an empty directory:

```bash
serverless
```

The onboarding command walks you through these steps:

1. **Select a template.** The templates come from the [serverless/examples](https://github.com/serverless/examples) repository:

   ```text
   ? Select A Template: …
   ❯ AWS / Node.js / HTTP API
     AWS / Node.js / Express API
     AWS / Node.js / Express API with DynamoDB
     AWS / Node.js / Scheduled Task
     AWS / Node.js / Simple Function
     AWS / Python / HTTP API
     AWS / Python / Flask API
     AWS / Python / Flask API with DynamoDB
     AWS / Python / Scheduled Task
     AWS / Python / Simple Function
     AWS / Compose / Serverless + Cloudformation + SAM
   ```

2. **Name your project.** The name must start with a letter and contain only letters, numbers and hyphens (up to 101 characters); use lowercase. The template is downloaded into a new directory with that name, in the current working directory, and the name becomes `service` in `serverless.yml`. Keep it short: the Framework adds it to the name of each AWS resource it creates, and some AWS resource names have length limits. If a folder with that name already exists, the command stops with `A folder named "<path>" already exists.`
3. **Sign in**, if you aren't signed in yet. Choose **Login/Register** to sign in to the Serverless Framework Dashboard in your browser, or enter a License Key. See [Sign in](#sign-in).
4. **Add the service to an App** (Dashboard sign-in only). Create or select an App, or skip. See [Apps and the Dashboard](#apps-and-the-dashboard).
5. **Set up AWS credentials**, when none are found. See [Set up AWS credentials](#set-up-aws-credentials).

The command then prints the next steps: `cd` into the directory, install dependencies when the template uses Node.js or Python (`npm install` or `pip install`), and run `serverless deploy`. Each template's `README.md` lists its exact install commands. For example, the Python Flask templates install their `serverless-wsgi` plugin with `npm install`, and `serverless deploy` bundles the packages listed in `requirements.txt`.

The onboarding command edits `serverless.yml` (or `serverless.yaml`): it adds an `org` line when no line contains `org:`, adds the `app` line you choose when you signed in with a Dashboard account and no line starts with `app:`, and removes every line that contains `frameworkVersion:`. Run in a directory that already has a `serverless.yml` or `serverless.yaml`, the command skips the template steps and makes the same edits to that file; in a directory with `serverless-compose.yml` or `serverless-compose.yaml`, it only adds `org` there. Configuration files in other formats, such as `serverless.ts`, aren't edited.

### Create a service without prompts

The onboarding command asks questions in the terminal. In CI, from an AI agent or whenever you prefer to write the files yourself, create the service directory with a `serverless.yml` and a handler, then [sign in](#sign-in) and [deploy](#deploy-a-service).

This `serverless.yml` deploys one Node.js function behind an HTTP API endpoint:

```yaml
# serverless.yml
service: my-service
frameworkVersion: '4'

provider:
  name: aws
  runtime: nodejs24.x
  region: us-east-1

functions:
  hello:
    handler: handler.hello
    events:
      - httpApi:
          path: /
          method: get
```

The handler, in `handler.mjs` next to `serverless.yml`:

```javascript
export const hello = async () => {
  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'Hello from my-service' }),
  }
}
```

`handler: handler.hello` points at the `hello` export of `handler.mjs`. For Python, set `runtime: python3.14` and put the handler in `handler.py`:

```python
import json


def hello(event, context):
    return {"statusCode": 200, "body": json.dumps({"message": "Hello from my-service"})}
```

## Sign in

The Serverless Framework v4 CLI runs service commands only when you are signed in or provide a key. The onboarding command asks you to sign in; outside of it, run:

```bash
serverless login
```

`serverless login` opens the [Serverless Framework Dashboard](https://app.serverless.com) in your browser to register or sign in, then saves the session in `~/.serverlessrc`. Without a terminal (an AI agent, a script), it prints the sign-in URL and waits up to 10 minutes for you to finish signing in.

For CI and other unattended runs, set one of these environment variables instead of signing in. The CLI reads the key on each command and doesn't save it:

- `SERVERLESS_ACCESS_KEY`: an Access Key, created in the Dashboard under [Settings > Access Keys](https://app.serverless.com/settings/accessKeys).
- `SERVERLESS_LICENSE_KEY`: a License Key, created under [Settings > License Keys](https://app.serverless.com/settings/licenseKeys). See [License Keys](./guides/license-keys.md).

With a key, `org` in `serverless.yml` is optional; when `org` is set, it must be the org the key belongs to. When the CLI can't prompt (for example, stdin or stdout isn't a terminal, the `CI` environment variable is set, or an AI agent runs it) and finds no key and no saved session, a service command such as `serverless deploy` stops with an error that starts with `You must sign in or use a License Key with Serverless Framework V.4 and later versions` and names these options.

The CLI is free for individual developers and for organizations with up to $2 million in annual revenue; see [Upgrading to v4](./guides/upgrading-v4.md#pricing) and the [pricing page](https://www.serverless.com/pricing).

## Apps and the Dashboard

An App groups services in the Serverless Framework Dashboard. Setting `app` in `serverless.yml` turns on Dashboard features for the service: deployment tracking, sharing outputs and [parameters](./guides/parameters.md) between services, [Providers](./guides/dashboard/providers.md) for AWS credentials, and metrics, traces and logs.

```yaml
# serverless.yml
org: myorg
app: my-app
service: my-service
```

Apps are optional: to use the CLI without the Dashboard, leave `app` out. A service that sets `app` can't be used with a License Key.

When you sign in with a Dashboard account, the onboarding command offers to create an App or select an existing one. New App names use lowercase letters, numbers and hyphens and start with a letter. You can also create Apps in the Dashboard.

## Set up AWS credentials

The Framework deploys with the AWS credentials it finds: from `--aws-profile`, `provider.profile`, or the AWS SDK's default chain (environment variables, `~/.aws/credentials`, `~/.aws/config`, AWS IAM Identity Center). To use a named profile, pass `--aws-profile my-profile` or set `AWS_PROFILE=my-profile`. A service command such as `serverless deploy` takes only the credentials from the profile, not its region; see [Deploy a service](#deploy-a-service) for how the region is chosen. When the onboarding command finds none and your organization has no default Dashboard Provider, it offers to set them up:

```text
No valid AWS Credentials were found in your environment variables or on your machine. Serverless Framework needs these to access your AWS account and deploy resources to it. Choose an option below to set up AWS Credentials.

❯ Sign in with AWS Console (Recommended)
  Save AWS Credentials in a Local Profile
  Skip & Set Later (AWS SSO, ENV Vars)
```

- **Create AWS IAM Role (Easy & Recommended)** appears at the top of the list when you signed in with a Dashboard account (not a License Key). It creates an IAM role in your AWS account with an AWS CloudFormation stack and stores it in the Dashboard as a [Provider](./guides/dashboard/providers.md), so your team can share it and no credentials stay on your machine.
- **Sign in with AWS Console** runs `serverless login aws`: browser-based sign-in that saves short-lived credentials in an AWS profile.
- **Save AWS Credentials in a Local Profile** saves an access key pair in the `default` profile of `~/.aws/credentials`.
- **Skip & Set Later** leaves credentials to you. For AWS IAM Identity Center (AWS SSO), configure a profile with `aws configure sso` and sign in with `serverless login aws sso`.

For all the ways to provide credentials, see [AWS Credentials](./providers/aws/guide/credentials.md).

## Deploy a service

To deploy, run `serverless deploy` in the directory that contains `serverless.yml`:

```bash
serverless deploy
```

`serverless deploy` packages your code, then creates or updates the service's AWS CloudFormation stack. Without other settings it deploys stage `dev` to `us-east-1`, or to the region in `AWS_REGION`. To deploy another stage or region, pass `--stage` and `--region`, or set `provider.stage` and `provider.region`. The output lists the endpoints and functions.

Each command works out the stage, region and AWS credentials on its own. When you deploy with `--stage`, `--region` or `--aws-profile`, pass the same options to `serverless info`, `invoke`, `logs` and `remove`, or set the values in `serverless.yml` once. For more, see [Deploying](./providers/aws/guide/deploying.md).

To deploy a code or configuration change to one function in seconds, without a CloudFormation update, run `serverless deploy function` with the function's name in `serverless.yml`:

```bash
serverless deploy function -f hello
```

`serverless deploy function` doesn't deploy changes to events or `resources`, and leaves the function's environment as it is when an `environment` value is a CloudFormation reference such as `!Ref`; deploy those changes with `serverless deploy`. For more, see the [`deploy function` command](./providers/aws/cli-reference/deploy-function.md).

## Invoke a function

To call a deployed function, open its HTTP endpoint from the `serverless deploy` output (`serverless info` prints it again), or invoke the function directly:

```bash
serverless invoke -f hello
```

To also print the function's logs, add `--log`:

```bash
serverless invoke -f hello --log
```

For more, see the [`invoke` command](./providers/aws/cli-reference/invoke.md).

To stream a function's logs from Amazon CloudWatch to your terminal, run `serverless logs` with `-t` (tail) in a separate terminal:

```bash
serverless logs -f hello -t
```

## Develop with Dev Mode

Dev Mode runs your deployed Node.js and Python functions on your machine. Run it in the service directory:

```bash
serverless dev
```

Dev Mode attaches the functions of the deployed stage to your machine, with no deployment. Real invocations of those functions (API requests, queue messages, direct invokes) then run the code on your machine, with the function's own environment and IAM role, and the result goes back to the caller. Your edits apply on the next invocation, and logs and errors show in the terminal. Press Ctrl+C to end the session: Dev Mode restores your functions to their deployed configuration.

Use Dev Mode on development and personal stages only; it refuses the `prod` and `production` stages. For more, see the [Dev Mode guide](./providers/aws/guide/dev-mode.md) and the [`serverless dev` reference](./providers/aws/cli-reference/dev.md).

## Run functions locally

To run a function's handler on your machine without AWS, use `serverless invoke local`. Pass an event with `--data`:

```bash
serverless invoke local -f hello --data '{"a":"bar"}'
```

For more, see the [`invoke local` command](./providers/aws/cli-reference/invoke-local.md). To emulate API Gateway locally, the community [serverless-offline](https://github.com/dherault/serverless-offline) plugin adds a `serverless offline` command. Local emulation differs from the AWS environment, so test against a deployed stage, or with Dev Mode, before you release.

## Use plugins

Plugins add commands and features to the Framework. Browse them in the [plugins registry](https://www.serverless.com/plugins), for example [serverless-offline](https://github.com/dherault/serverless-offline) and [serverless-step-functions](https://github.com/serverless-operations/serverless-step-functions). For how to install and configure plugins, see [Plugins](./guides/plugins/README.md).

Some formerly popular plugins are built into the Framework: [custom domains](./providers/aws/guide/domains.md) replace serverless-domain-manager, and [Python support](./providers/aws/guide/python.md) replaces serverless-python-requirements. The [upgrade guide](./guides/upgrading-v4.md#plugins) lists the others.

## Remove a service

**Warning:** `serverless remove` deletes the service's CloudFormation stack and the resources in it, including stateful resources such as DynamoDB tables, unless they have a `DeletionPolicy` of `Retain`. It doesn't ask for confirmation.

To remove a service from one stage and region, run:

```bash
serverless remove
```

The command also deletes the service's deployment artifacts. The region's shared deployment bucket stays. When `org`, `app` and `service` are set, the Dashboard records the removal. For more, see the [`remove` command](./providers/aws/cli-reference/remove.md).

## Update Serverless Framework

The Serverless Framework CLI checks for a new release every 24 hours and updates itself. To update now, run:

```bash
serverless update
```

To check for a new release before a single command, set the `SERVERLESS_FRAMEWORK_FORCE_UPDATE` environment variable to any value:

```bash
SERVERLESS_FRAMEWORK_FORCE_UPDATE=true serverless deploy
```

To reinstall a release from scratch, delete its folder, `~/.serverless/releases/<version>` (`%USERPROFILE%\.serverless\releases\<version>` on Windows), and run any `serverless` command. The release is downloaded again. Do this when every command fails with an error that points inside that folder, for example:

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'esbuild' imported from /home/me/.serverless/releases/4.43.0/package/dist/sf-core.js
Error: Cannot find module '/home/me/.serverless/releases/4.43.0/package/dist/sf-core.js'
SyntaxError: Unexpected end of input
```

An install by an earlier version of the `serverless` installer that was interrupted, or that ran at the same time as another `serverless` command, can leave such a folder behind. `serverless update` does not replace a release folder that already exists.

## Pinning to a specific version

To control which Framework version runs a service, set `frameworkVersion` in `serverless.yml` to a semver range:

```yaml
# serverless.yml
service: my-service
frameworkVersion: '4'
```

- Without `frameworkVersion`, the CLI runs the latest release and checks for a newer one every 24 hours.
- With `frameworkVersion`, the CLI runs the highest release that matches the range and checks every 24 hours for a newer match. For example, `'~4.17.0'` runs the latest `4.17.x` and `'4'` runs the latest `4.x`.

The CLI reads `frameworkVersion` from the configuration file in the current working directory, or the one `--config` names: `serverless.yml` in a service, `serverless-compose.yml` in a Compose project. It reads the value only when it is a string, so quote it (`frameworkVersion: '4'`): an unquoted number such as `frameworkVersion: 4` doesn't pin the version, and the CLI runs the latest release.

Pin a major or minor range rather than an exact patch version, so you receive patch releases with bug and security fixes.

### Flagged versions

Serverless, Inc. flags releases found to contain regressions, security issues or other issues that affect stability. When `frameworkVersion` is exactly a flagged version, the CLI still runs it and prints a warning that recommends a more recent version. A range that resolves to a flagged version gets no warning. These versions are flagged:

- `4.1.8`
- `4.1.13` to `4.1.15`
- `4.1.24`
- `4.3.0`
- `4.4.15`, `4.4.20` and `4.4.21`
- `4.5.0`

Versions older than `4.0.4`, and versions `4.0.6`, `4.0.18` and `4.0.31`, can't be installed.

## Next steps

- [Services](./providers/aws/guide/services.md): how a service, its stages and its `serverless.yml` fit together.
- [Events](./providers/aws/guide/events.md): the AWS events that can trigger your functions.
- [serverless.yml reference](./providers/aws/guide/serverless.yml.md): every `serverless.yml` property.
- [Examples](https://github.com/serverless/examples): complete services to start from.
