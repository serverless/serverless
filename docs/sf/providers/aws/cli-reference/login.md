<!--
title: Serverless Framework Commands - Login
description: Login to the serverless platform.
short_title: Commands - Login
keywords:
  [
    'Serverless',
    'Framework',
    'login',
    'Serverless Framework Dashboard',
    'authentication',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/cli-reference/login)

<!-- DOCS-SITE-LINK:END -->

# Login

The `login` command logs users into the Serverless Framework Dashboard.

It will create a new Serverless Framework Org if one doesn't already exist.

```bash
serverless login
```

## Options

- `--org` The org to use as your default. With an existing session, it switches
  the default without signing in again; without one, the sign-in sets it. The
  command never prompts when `--org` is given: even in a terminal, it prints
  the sign-in URL for you to open instead of opening the browser. It fails with the list of your
  orgs if you don't belong to the org you name. See
  [Choosing an org](#choosing-an-org).

## Non-interactive shells

When `serverless login` runs without a terminal — from an AI coding agent, a
script, or CI — it cannot show a menu or open a browser. Instead it prints the
Dashboard sign-in URL and waits for the sign-in to complete (up to 10 minutes):

```text
Sign in to the Serverless Framework Dashboard by opening this URL in a browser:
https://app.serverless.com?client=cli&transactionId=...

Waiting for the sign-in to complete (up to 10 minutes)
✔ Signed in as jane (org "acme")
```

Open the URL in any browser, sign in, and the command finishes with the
session saved, exactly as the interactive flow would. In CI, where no one can
open the URL, the command fails right away and names the keys to set instead. If you belong to several
orgs, the success line names the default and lists the others; see
[Choosing an org](#choosing-an-org).

If you are already signed in, the command checks that sign-in the way every
other command does, then prints `✔ Already signed in as <user> (org "<org>")`
and exits 0. The same goes for a License Key saved on this machine, in
`serverless.yml`, or in the `/serverless-framework/license-key` SSM parameter.
If that check fails (for example, a revoked session or an invalid License
Key), the command exits 1 with the error, like any other command. To skip the browser entirely, set `SERVERLESS_ACCESS_KEY`
(an [Access Key](https://app.serverless.com/settings/accessKeys)) or
`SERVERLESS_LICENSE_KEY` (a [License Key](../../../guides/license-keys.md)) in the environment;
the command then reports which one is in use.

## What works without signing in

Every command needs you to be signed in or to use a key, except:

- `serverless agent setup`, `serverless agent docs` and
  `serverless agent skills`;
- `--help` (or `-h`) on the Framework's own commands, for example
  `serverless deploy --help`. Help for commands added by a service's plugins
  is shown once you sign in.

## Choosing an org

A command runs against the org given by `--org`, else by `org` in the
service's `serverless.yml`, else by your default org. Setting `org` in
`serverless.yml` is the most reliable choice: it travels with the project, so
teammates and CI deploy to the same org.

```yaml
org: my-org
service: my-service
```

If you belong to several orgs and have no default yet, signing in without a
terminal picks the oldest org you own and says so, listing your orgs:

```text
✔ Signed in as jane (org "acme") — set as your default; you belong to 3 orgs: acme, beta, gamma. For a service in another org, add "org: <name>" to its serverless.yml; to change the default, run "serverless login --org <name>".
```

To change the default, run `serverless login --org <name>`:

```text
✔ Signed in as jane (org "beta"), now your default org
```

An [Access Key](https://app.serverless.com/settings/accessKeys) set in
`SERVERLESS_ACCESS_KEY` belongs to a single org, so `--org` doesn't apply when
one is set.
