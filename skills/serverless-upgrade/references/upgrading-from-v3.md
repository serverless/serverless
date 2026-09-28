# Upgrading from v3 or earlier — what to know

v4 is designed to be near-drop-in for AWS services. These are the differences
to be aware of and the things to set up when a service comes from v3 or
earlier. Full guide: `serverless agent docs guides/upgrading-v4`.

## Authentication

The v4 CLI signs in before it runs a service command, including local ones
like `serverless print` and `serverless package`, which deploy nothing and
change no infrastructure. `package` also needs AWS credentials.

If the CLI reports "You must sign in or use a License Key…", the message
names the ways forward. With the user at the keyboard, run `serverless login`:
without a terminal it prints a sign-in URL for them to open and waits for the
sign-in to finish. For CI and other unattended runs, use a key instead:
`SERVERLESS_ACCESS_KEY`, or a License Key through the `SERVERLESS_LICENSE_KEY`
environment variable, the `licenseKey` config key, or an AWS SSM Parameter
lookup (preferred for large orgs). The `serverless-framework` skill covers
sign-in and AWS credentials in detail. Then continue: signing in is a
one-time setup step of the upgrade itself, never a reason to skip
verification.

## Licensing

For licensing and pricing questions, point the user to the upgrade guide
linked above rather than restating terms.

## `.env` is auto-loaded

v3 needed `useDotenv: true`; v4 loads `.env` and `.env.<stage>` automatically.
Set `useDotenv: false` to opt out, or give it a path or array of paths to load
extra files. Removing `useDotenv: true` also removes the rule that keeps
`.env*` files out of the deployment package, so in the same edit add `'!.env*'`
to `package.patterns`; otherwise local secrets ship inside the Lambda zip, and
only the zip file-list check in verification.md shows it. See
plugin-replacements.md for removing `serverless-dotenv-plugin`.

## AWS-focused

v4 deploys to AWS. A service for another provider is out of this skill's
scope — flag it to the user.

## A local `serverless` install

v3 projects often list `serverless` in `devDependencies`. A v4 CLI then
hands every command in that project to the local v1–v3 copy: the v4 `agent`
commands answer "command not found", and a `frameworkVersion` of `'4'` is
refused by the v3 that reads it. npm scripts (`npm start`, `npm run deploy`)
run the project's copy too, from `node_modules/.bin`, whatever is installed
globally.

A plugin can also bring v3 back: when its `peerDependencies` allow only
`serverless` v3 (serverless-offline 13 declares `^3`), npm installs v3 into
the project even though `package.json` does not list it.

To upgrade:

- remove the `serverless` dependency (`npm uninstall serverless`);
- move each plugin that stays to a major whose `peerDependencies` allow
  `serverless` 4 (plugin-replacements.md);
- check that `npm ls serverless` lists no copy below 4.

## Version pinning and updates

The Framework keeps itself current by updating daily by default. A
`frameworkVersion` major pin keeps the service on v4; an exact version gives
reproducible builds — formats and guidance in modern-config.md.

## CloudFormation deploy mode defaults to `direct`

Since v4, deploys use `direct` mode (faster) rather than v3's change-set
flow. This changes deploy behavior, not the packaged template, so it does not
affect the equivalence gate — mention it if the user relied on change-set
review. To keep change-set deploys, read
`serverless agent docs providers/aws/guide/deploying` (Deployment method).

## Compose state lives in us-east-1

Serverless Compose stores its state and outputs in SSM + S3 in `us-east-1` by
default (the bucket is customizable). Relevant only for multi-service Compose
projects.
