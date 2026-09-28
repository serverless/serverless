# CLI lifecycle and troubleshooting

## Contents

- Commands
- Authentication and credentials
- Troubleshooting

The commands below run non-interactively from a service directory. Add `--stage`
and `--region` to target explicitly; add `--verbose` for resource-level
detail.

If `serverless` is not on the PATH because a global install is not possible
(for example the npm global prefix is read-only), run every command as
`npx serverless <command>` instead, including the commands the CLI's own
messages suggest. Do not install with `sudo`.

## Commands

| Command                              | What it does                                                            |
| ------------------------------------ | ----------------------------------------------------------------------- |
| `serverless package`                 | Build and package without deploying (needs sign-in and AWS credentials) |
| `serverless deploy`                  | Deploy the whole service (build, package, CloudFormation update)        |
| `serverless deploy function -f NAME` | Fast redeploy of one function's code and configuration                  |
| `serverless info`                    | Show endpoints, functions, and stack outputs of the deployed service    |
| `serverless invoke -f NAME`          | Invoke a deployed function (`--data '{"k":"v"}'` for a payload)         |
| `serverless invoke local -f NAME`    | Run the handler locally without deploying                               |
| `serverless logs -f NAME`            | Fetch a function's CloudWatch logs (`--tail` to follow)                 |
| `serverless dev`                     | Dev Mode: routes invocations of the deployed service to local code      |
| `serverless remove`                  | Delete the service's stack and resources                                |

## Authentication and credentials

- Every command needs sign-in (`serverless login`) or a License Key except
  `agent setup`, `agent docs` and `agent skills`, and
  `serverless <command> --help` for the Framework's own commands. If the user
  is at the keyboard, run
  `serverless login`: in a terminal it offers browser sign-in or a license
  key; without one, or with `--org`, it
  prints a sign-in URL, then waits up to 10 minutes for the user to open it
  and finish (run it in the background and pass them the URL), then reports
  `✔ Signed in as <user> (org "<org>")`. The URL is single-use and expires
  with the wait, so for unattended runs ask for a key instead:
  `SERVERLESS_ACCESS_KEY` (a Dashboard Access Key, created at
  https://app.serverless.com/settings/accessKeys) or `SERVERLESS_LICENSE_KEY`
  (create one at https://app.serverless.com/settings/licenseKeys). Already
  signed in, `serverless login` says so in one line and exits.
- A service deploys to the org given by `--org`, else by `org:` in its
  `serverless.yml`, else to the user's default org. When `serverless login`
  lists several orgs and the user hasn't said which one this service belongs
  to, ask, then write
  `org: <name>` at the top of `serverless.yml` rather than changing the
  default; it stays with the project, so teammates and CI deploy to the same
  org. `serverless login --org <name>` changes the default without a new
  sign-in. An Access Key belongs to one org, so none of this applies with
  `SERVERLESS_ACCESS_KEY`.
- AWS credentials come from the `aws` resolver named in `provider.resolver`
  (or, when `provider.profile` is not set, the service's only `type: aws`
  resolver) when there is one; otherwise from `--aws-profile`, else
  `provider.profile` in `serverless.yml`, else the
  standard chain: `AWS_PROFILE`, `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`,
  or shared config files. A Serverless Dashboard Provider for the org, when
  one is set up, comes first unless the resolver sets `dashboard: false`;
  `agent setup` cannot check it. When no profile is named, environment keys
  win over the shared files, so stale exported keys hide a profile the user signs
  in to later. A resolver ignores `--aws-profile`. To switch its profile for
  one run without editing it, write the resolver's `profile` as
  `${param:awsProfile}`, with the team's default in the stage's `params:`, and
  run with `--param "awsProfile=<name>"`. `serverless agent setup` checks the
  credentials a deploy would use, the way a deploy does, and prints the AWS
  account and region. It checks one stage and lists the stages whose resolver
  uses other credentials as `other stages, not checked`; add
  `--stage <stage>` to check one before working on it. It doesn't check a
  `${param:awsProfile}` profile; check that with `serverless package` and the
  same `--param`. For per-stage
  accounts, resolvers, and Dashboard providers:
  `serverless agent docs providers/aws/guide/credentials`.
- AWS rejects the credentials (`rejected by AWS` in `agent setup`,
  `Failed to resolve AWS account ID` from other commands)? The message names
  where they came from and the fix. For environment keys, ask the user to
  replace or unset them; for a profile, hand them the sign-in command it
  names.
- Deploying from CI/CD (GitHub Actions, GitLab CI, CircleCI): the pipeline
  signs in with `SERVERLESS_ACCESS_KEY` or `SERVERLESS_LICENSE_KEY` from a
  secret, and takes AWS credentials preferably from an IAM role it assumes
  through OIDC, so no AWS keys are stored. The user creates the key, the IAM
  role and the secrets; hand them the steps. Setup and a GitHub Actions
  workflow: `serverless agent docs guides/dashboard/cicd/running-in-your-own-cicd`.
- No AWS credentials yet? The user signs in themselves; both commands need a
  terminal and refuse to run without one, so hand them over instead of
  running them. `serverless login aws` signs in through the AWS Console in
  a browser (no AWS CLI needed) and writes a profile; add `--aws-profile`
  and `--region` to choose them. `serverless login aws sso` is the variant
  for organizations on IAM Identity Center and uses the profile from
  `aws configure sso`. Afterwards, re-run `serverless agent setup` to
  confirm the `aws credentials:` line.

## Troubleshooting

- For full logs and readable stack traces of any command, re-run it with
  `--debug`.
- The CLI's installed releases and cached metadata live in `~/.serverless`.
- `serverless agent setup` re-checks authentication, AWS credentials, and
  service presence, and prints a fix for anything missing.
- `serverless agent inspect` shows what is actually deployed, to compare with
  `serverless.yml` when the two seem to differ.
- For any command's flags or behavior, read its reference page:
  `serverless agent docs providers/aws/cli-reference/<command>`, with spaces
  in `<command>` written as hyphens, e.g. `deploy-function` (index:
  `serverless agent docs`).
