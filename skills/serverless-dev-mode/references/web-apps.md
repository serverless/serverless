# Web apps in Dev Mode

How a session runs a service's `webApps`, what an agent reads about them, and
what goes wrong. The prose guide is
`serverless agent docs providers/aws/guide/dev-mode` (section Web Apps).

## Contents

- What a session does
- Starting the server
- Modes, reasons and notes
- `--local-only`
- Request records
- Stopping and restoring
- Permissions and the IAM role
- Troubleshooting

## What a session does

Per web app, the session creates a copy of the revision the `main` endpoint
serves (the clone) with the Dev Mode endpoint `sls-dev-fallback` on it, then
a dev revision running the Framework's web bridge with the deployed role and
environment, and moves all of `main`'s traffic to the dev revision. Each
request to the real URL (or a custom domain in front of it) reaches this
machine over AWS IoT Core, goes to the local server and streams back. A
request this machine does not take within about 3 s (up to about 6 s while a
new execution environment connects) runs the deployed code through
`sls-dev-fallback`: callers always get an answer. Request bodies over
64 KiB, and response bodies past their first 64 KiB, travel through the
deployment bucket; `text/event-stream` responses stay inline, in order.

The local server gets the deployed revision's environment variables,
`AWS_REGION`, `PORT` and `HOSTNAME=127.0.0.1` (plus
`AWS_LAMBDA_HTTP_ENDPOINT=127.0.0.1:<port>` for a `package.artifact` web app
started from its `entry`), and the execution role's
credentials through a loopback credentials endpoint (never the developer's own
keys; the SDK's default chain finds them). `Host` is the server's own
address; the real host is in `X-Forwarded-Host`, `-Proto` and `-For`.

## Starting the server

1. `webApps.<app>.dev.command`: a command line run in the shell from the
   service directory, like an npm script (`node_modules/.bin` on `PATH`),
   with `PORT` and `HOSTNAME` set. A command that ignores `PORT` takes it as
   an argument: `vite --port $PORT`; one that ignores `HOSTNAME` takes the
   host: `next dev --hostname 127.0.0.1` (without it `next dev` listens on
   every interface).
2. Else `entry`, when it is a source file in the service directory: run with
   the CLI's Node.js (TypeScript through tsx), restarted on any file save. The
   esbuild build does not run, so esbuild aliases and `define` apply only
   through `dev.command`. Each restart writes `reload.start`/`reload.end` with
   `web_apps` (`ok`: it listens again): after an edit, wait with
   `dev wait --for reload --web-app <app> --after <cursor> --json` (with
   functions in the session too, always name the app). `ok: false` (the
   server did not listen again) comes after the 30 s ready timeout. A
   `dev.command` server reloads its own code and writes no reload record.

An `entry` under `.next/`, `.output/`, `dist/`, `build/` or `.serverless/`,
or a web app with `build: false`, without `dev.command`: `build_output_entry`.

A server not listening within 30 s gets `local_server_down` and its real URL
runs the deployed code until it listens (tried every second). A server that
exits is restarted after 1 s, doubling to 30 s. Its output, each line after
`web <app> │`, goes to the
session's terminal, or `.serverless/dev/session.log` when detached.

Each request that runs on this machine prints one line there when it ends:
`← web <app> ── GET /path (200) 21ms[ · local|replay] · <id>`; one still
running after 1 s also prints `→ web <app> ── GET /path · <id>` then.
`(deployed code)` in place of the status: a
relayed request the server did not take ran the deployed code (reason after
`──`); `(not run)`: a request to the local URL or a replay while the server was down;
`✕`: failed. Requests that went to `sls-dev-fallback` without reaching this
machine print nothing, and neither do real-URL requests that arrive while the
server is not listening: the session refuses them and the deployed code
answers, with no request file. Read results from `dev wait --for request`
and the request files,
not from these lines.

## Modes, reasons and notes

`dev` (real URL reaches this machine), `local` (`--local-only`), `deployed`,
`skipped`. In `dev status --json` and `--detach --json`: `web_apps` with
`name`, `mode`, `reason`, `why`, `notes`, `url` (real URL), `local_url`.

| Reason                   | Mode       | Meaning, and what helps                                                                                      |
| ------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------ |
| `not_selected`           | `deployed` | Left out by `--web-app` or `--skip-web-app`.                                                                 |
| `not_deployed`           | `skipped`  | Not deployed yet: `serverless deploy`.                                                                       |
| `build_output_entry`     | `deployed` | `entry` is a build output: set `dev.command`.                                                                |
| `owned_by_other_session` | `skipped`  | Another live session holds it: `--take-over` takes it.                                                       |
| `revision_quota`         | `deployed` | The web function is near AWS's 50 revisions; Dev Mode needs 2 (1 with `--local-only`).                       |
| `endpoint_quota`         | `deployed` | The web function has AWS's 10 endpoints; Dev Mode needs 1.                                                   |
| `lambda_web_denied`      | `deployed` | The credentials may not read its web function; the person grants the actions the warning names.              |
| `broker_update_denied`   | `deployed` | The IAM role's trust does not list web functions yet: an administrator runs `serverless dev setup --region`. |
| `attach_failed`          | `deployed` | `attach failed: <message>`; the session runs on and ends with exit 3.                                        |
| `not_attached`           | `deployed` | The session stopped while it attached it.                                                                    |

Notes: `local_server_down` (above), `no_role_credentials` (`--local-only`
without the permission below), `reattached`, `taken_over`. `web_app.lost`
states: `detached` (`main` or `sls-dev-local` no longer serves the session's
revision, as after a deploy from elsewhere), `taken_over` (with `owner`),
`taken_over_by_you` (another session of yours), `function_deleted`.

## `--local-only`

`--local-only <app>` runs the server on its local URL only: `main` is not
touched, the real URL keeps the deployed code. The session creates a dev
revision and the IAM-auth endpoint `sls-dev-local`, and calls it once at
start (every 30 min after) with the developer's credentials to get the role's
credentials; that needs `lambda:InvokeWebFunctionEndpoint` on
`sls-dev-local`, else the server runs without them (`no_role_credentials`).
Any other request to `sls-dev-local` gets a 503 and never reaches the machine.
Use it when callers of the real URL must keep the deployed code.

## Request records

Every request to a web app running here: one file under
`.serverless/dev/requests/<app>/<unix s>-<request id>.json`, plus
`request.start` and `request.end` in `session.ndjson`. Shared limits with
invocation files: 500 per web app, 200 MB in all.

- `source`: `relay` (real URL), `local` (local URL), `replay`.
- `outcome`: `answered`, `failed` (`reason` says why), `not_run` (did not run
  here; through the real URL, the deployed code answered). `status_code` is
  `null` for `not_run`.
- `request` (`method`, `path`, `headers`, `body`, `body_encoding` `text` or
  `base64`, `body_truncated`, `body_bytes`, `body_captured`) and `response`
  (`status_code`, `headers`, body fields; `null` without an answer). Bodies
  are kept up to 1 MiB, unredacted.
- Redacted: the invocation files' header list plus `x-amz-date`, and the
  signed-URL query values `X-Amz-Signature`, `X-Amz-Credential`,
  `X-Amz-Security-Token`, and `access_token`, `id_token`, `refresh_token`,
  `token`, `client_secret` (an OAuth `code` is kept); `redacted` names each.
- `dev requests --json` rows have `kind`: `invocation`, or `request` with
  `web_app`, `stage`, `request_id`, `source`, `method`, `path`, `outcome`,
  `status_code`, `duration_ms`, `file`.
- `dev wait --for request [--web-app <app>]` matches the next `request.end`;
  `dev wait --for reload --web-app <app>` the next restart of that app's
  server. `--web-app` goes with `--for request` or `--for reload` only;
  `--function` never with `request` (`invalid_option_combination`).
- `dev replay <request id>` sends the file's request to the local server
  again; no caller gets the answer, effects are real. Fields: `kind`
  (`request`), `request_id`, `replay_of`, `web_app`, `method`, `path`,
  `outcome`, `status_code`, `duration_ms`, `outcome_reason`, `response` or
  `response_omitted`, `file`, `note` (`redacted_values_omitted`) and
  `omitted`. Refusals (exit 1): `request_body_truncated`,
  `request_body_not_captured`, `web_app_not_local`, `stage_mismatch`.

## Stopping and restoring

Every stop moves `main` back and deletes Dev Mode's revisions and endpoints. A
`main` split between two revisions comes back on the heavier one at 100%.
`--on-exit keep` and `dev stop --keep` keep attached web apps (the real URL
then serves the deployed code through the fallback). `serverless deploy` and
`rollback --timestamp` restore web apps a session left, found from AWS alone;
`serverless remove` deletes them with the web function. After a killed
session: `serverless dev restore --stage <s> --region <r> --json`, or
`--web-app <app>` for one. `dev restore --json` adds `web_apps` counts.

## Permissions and the IAM role

On the web functions: List/Get/Create/Update/Delete of endpoints, and
List/Get/Create/Delete of revisions; `iam:PassRole` on each web app's
execution role; `s3:GetObject` and `s3:GetObjectVersion` on the deployment
bucket's objects. The first web-app session on a role an earlier Framework
created needs `iam:UpdateAssumeRolePolicy` (or an administrator's
`serverless dev setup --region <r>`); without it: `DEV_MODE_BROKER_UPDATE_DENIED`
(`permission_denied`: show it to the person). Earlier Framework versions then
stop with `DEV_MODE_BROKER_MODIFIED` on that role: the team upgrades
together. Full policy: `serverless agent docs providers/aws/cli-reference/dev`.

## Troubleshooting

- **Real URL serves the deployed code:** read the web app's row (`reason`,
  notes). `local_server_down`: the server does not listen on `PORT`; read its
  output, fix the command. A VPC web app needs outbound access to AWS IoT
  Core, STS and S3 from its network.
- **No hot reload on the real URL:** expected; refresh, or use the local URL.
  WebSocket handshakes there (a dev server's hot reload client) get HTTP 426
  from the web function and never reach the machine.
- **403 from the local URL:** a host other than `127.0.0.1`, `localhost`,
  `[::1]` (a LAN address, a tunnel): use the real URL from other devices.
- **`DEV_MODE_WEB_APP_ENVIRONMENT_TOO_LARGE`:** the deployed variables plus
  Dev Mode's exceed Lambda's 32 KB per revision: remove variables, deploy.
- **`DEV_MODE_REVISION_*` / `DEV_MODE_ENDPOINT_*`:** AWS Lambda could not
  activate a Dev Mode revision or endpoint, or not within 60 s; the message
  says what to check. Run the start again.
