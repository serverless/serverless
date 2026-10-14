<!--
title: Serverless Framework Commands - AWS Lambda - Dev
description: The dev command runs the code on your machine for real invocations of your deployed AWS Lambda functions, and its subcommands control and inspect that session.
short_title: Commands - Dev
keywords:
  [
    'Serverless',
    'Framework',
    'AWS',
    'Lambda',
    'Dev',
    'Local Development',
    'Serverless CLI',
    'AWS Lambda Testing',
    'AWS IoT Core',
    'AI agents',
    'Python',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/cli-reference/dev)

<!-- DOCS-SITE-LINK:END -->

# AWS - Dev

`serverless dev` attaches the Node.js and Python functions of a deployed stage to your machine, so their real invocations run the code in your working copy, with no emulation and no redeploy. Its subcommands report on the session, wait for its events, list and replay the invocations it ran, stop it, and restore functions a session left behind. The [Dev Mode guide](../guide/dev-mode.md) explains how it works, the runtimes, security and limits; this page is the reference for each command, its options, exit codes and `--json` results, the [error codes](#errors), the [permissions](#permissions) and the [formats of the session's files](#files).

## Usage

```bash
serverless dev                       # the default stage, in this terminal
serverless dev --stage alice         # your personal stage
serverless dev --detach --json       # in the background, for scripts and AI agents
serverless dev --dry-run             # the checks and the changes, with nothing changed
```

## Options

| Option                      | Description                                                                                                                                                                                                                                        |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--stage`, `-s`             | The stage to attach. Dev Mode refuses `prod` and `production` (`stage_protected`).                                                                                                                                                                 |
| `--region`, `-r`            | The region of the stage.                                                                                                                                                                                                                           |
| `--aws-profile`             | The AWS profile to use.                                                                                                                                                                                                                            |
| `--function`, `-f`          | Attach only this function (repeatable); the others run their deployed code.                                                                                                                                                                        |
| `--skip-function`           | Keep this function on its deployed code (repeatable).                                                                                                                                                                                              |
| `--take-over`               | Also attach functions another live session holds, including another session of yours in a different terminal.                                                                                                                                      |
| `--approve`                 | Show the changes and ask for confirmation before changing any function. Needs an interactive terminal; on a stage that was never deployed, it asks twice (before the deployment and before attaching). Declining changes nothing more and exits 0. |
| `--on-exit keep\|remove`    | Instead of restoring on exit: `keep` leaves the functions in Dev Mode (exit 0, or 3 when some function could not be attached); `remove` restores them and then removes the service, with confirmation.                                             |
| `--detailed`                | Print each invocation's event and response.                                                                                                                                                                                                        |
| `--detach`                  | Start the session in the background and return once it is ready (at most 100 seconds). [`serverless dev stop`](#dev-stop) ends it. See [Detached sessions](#detached-sessions).                                                                    |
| `--idle-timeout <duration>` | With `--detach` only: stop and restore after this long without activity, such as `30m` or `2h` (default `60m`). `0` turns it off; any other value under a minute is refused.                                                                       |
| `--json`                    | With `--detach` or `--dry-run` only: print one JSON result on standard output, human text on standard error. `--json`, `--json=true` and `--json=1` turn it on; `--json=false` and `--json=0` leave it off.                                        |
| `--dry-run`                 | Run the read-only checks and print the changes a session would make, changing nothing. See [Dry-run results](#dry-run-results).                                                                                                                    |
| `--no-keys`                 | Turn off the single-key commands in a terminal (see [Keys](#keys)).                                                                                                                                                                                |

Durations (`--idle-timeout`, and `--timeout` on `dev wait` and `dev stop`): `100` or `100s` (seconds), `5m`, `1h`.

A foreground `serverless dev --json` is refused with:

```text
--json works with --detach or --dry-run; a running session writes its events to .serverless/dev/session.ndjson.
```

`serverless dev` also runs other kinds of sessions, with their own options:

| Option               | Description                                                                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--mode`, `-m`       | `functions` (default), `agents` (AI agents on Amazon Bedrock AgentCore) or `sandboxes` (AWS Lambda MicroVMs). Detected from the service when left out. |
| `--agent`, `-a`      | The agent to run in the agents mode (default: the first runtime agent). See [Agents Dev Mode](../guide/agents/dev.md).                                 |
| `--sandbox`          | The sandbox to run in the sandboxes mode. See [Sandboxes](#sandboxes-lambda-microvms).                                                                 |
| `--port`, `-p`       | The local port: the agent container (agents, default 8080) or the MicroVMs control plane (sandboxes, default 9100).                                    |
| `--[no-]assume-role` | Sandboxes: run the container as the sandbox's execution role (default), or with your own AWS credentials.                                              |

`--detach`, `--dry-run` and `--idle-timeout` work only in the functions mode.

## Exit codes

| Code  | Meaning                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0`   | Success. `serverless dev`: the session ended and restored its functions, or kept them with `--on-exit keep` (when every function was attached); also a forced exit during a stage's first deployment, when nothing was attached yet. `--detach`: the session is ready, or was already running. `--dry-run`: every check passed.                                                                                                                      |
| `1`   | An error, a failing `--dry-run` check, or something a person has to act on (`--json` results say which with `status` and `user_action_required`). A `serverless dev` that exits 1 leaves no function attached.                                                                                                                                                                                                                                       |
| `3`   | Incomplete: some function could not be attached (`attach_incomplete`) or restored (`restore_incomplete`). A second Ctrl+C that exits without waiting exits 3 when it leaves functions attached, and names them (0 when it leaves none, and 0 during a stage's first deployment). Run `serverless dev restore --stage <stage> --region <region>` with the session's stage and region, and `--aws-profile <name>` if the session was started with one. |
| `124` | Out of time (`--detach`, `dev wait`, `dev stop`, `dev replay`): the session may still be running.                                                                                                                                                                                                                                                                                                                                                    |

**Signals.** The first Ctrl+C, `q`, or one stop signal (SIGINT, SIGTERM or SIGHUP) restores the functions and prints the progress; any other stop signal within 500 ms of the first counts as the same stop. A second Ctrl+C (or SIGTERM) after that exits at once and names the functions it left attached, with the exit codes above. A hang-up (SIGHUP) starts a restore but never forces an exit. A Ctrl+C, SIGTERM or hang-up before a session's first change in AWS (while it checks AWS or waits at its `--approve` question) ends it at once, with `session.ended` saying nothing was restored. A stop ends with one of these lines, followed only by details about individual functions: `Dev Mode off …`; `Restore incomplete · …` when a function could not be restored; `Left N functions in Dev Mode (--on-exit keep).` when you asked to keep them; or `Exiting without waiting. Not restored: …` after a forced exit.

**Option combinations.** These are refused with exit 1 (`DEV_MODE_INVALID_OPTION_COMBINATION`): `--json` without `--detach` or `--dry-run`, `--detach` with `--dry-run`, `--detach` with `--on-exit remove`, `--idle-timeout` without `--detach`, and `--detach`, `--dry-run` or `--idle-timeout` in the agents or sandboxes modes.

## Keys

In an interactive terminal, a running session takes these keys, in lower or upper case. They are off in CI, under an AI agent, when standard input or output is not a terminal, in a terminal that reports a width of zero columns, and with `--no-keys`. The start-up line is then `Press Ctrl+C to restore your functions and exit.` With [`SLS_INTERACTIVE_SETUP_ENABLE`](README.md#non-interactive-use-ci-and-ai-agents) set, they are on wherever standard input is a terminal, except in a zero-width terminal or with `--no-keys`.

| Key        | Action                                                                                                                                                                                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `h` or `?` | Show the keys, on one line.                                                                                                                                                                                                                            |
| `r`        | Rebuild and restart the handler processes now (repeated presses make one rebuild).                                                                                                                                                                     |
| `v`        | Show or hide details: each invocation's full label, event and response.                                                                                                                                                                                |
| `s`        | Show the session in two lines: its state, service, stage, functions and invocation counts, then the functions with a warm handler process and the last invocation. Then the function table, when some function runs its deployed code or has a reason. |
| `q`        | Restore your functions and exit, like the first Ctrl+C.                                                                                                                                                                                                |

Ctrl+C works as without keys: the first restores and exits, a second exits without waiting.

## `dev status`

```bash
serverless dev status [--json]
```

Shows whether Dev Mode is on in this service directory: the session, its functions and their modes, the invocation counts, how long ago the last invocation was, and the endpoints. The endpoints come as `serverless deploy` and `serverless info` print them: every endpoint under `endpoint:` (one) or `endpoints:`, then the [MCP servers](../guide/mcp.md) under `mcp:`. It reads the session's files and asks the running session; it makes no AWS call. It reports Dev Mode sessions for functions and MCP servers: a `serverless dev` session for [sandboxes](../guide/sandboxes.md#local-development-serverless-dev) is not shown here. With no session, it reports state `off` (or `failed` when the last start failed) and exits 0. When the last session ended without its final record, or ended without restoring every function (its message says how many), the result comes with `serverless dev restore --stage <stage> --region <region>` as the next step, as `dev stop` and `dev wait` give it.

`--json` fields: `state` (`starting`, `on`, `stopping`, `off` or `failed`), `session_id`, `pid`, `owner`, `service`, `stage`, `region`, `detached`, `started_at`, `ready_at`, `idle_timeout_s`, `invocations` (`total`, `errors`), `last_invocation` (`request_id`, `function`, `outcome`, `ts`), `functions` (`name`, `mode`, `reason`, `why`, `notes`; each `reason`, such as `timeout_too_short` or `handler_not_in_service`, is listed in [Functions and modes](../guide/dev-mode.md#functions-and-modes); a function the session lost while it ran has the `function.lost` state as its `reason`, and its `mode` changes as that section describes), `endpoints` (`method`, `url`, `function`, and `mcp: true` on an MCP server's entry, whose `method` is `ANY`) and `cursor`, the last record's.

```text
Dev Mode on · session s_8aa6ea24e76c · pid 2824 · stage alice · us-east-1 · detached

Function  Mode  Why
node      dev
python    dev
crm       dev

1 invocation · last: node b2958894 ok, 12 s ago

endpoint: POST - https://<api-id>.execute-api.us-east-1.amazonaws.com/node
mcp: crm → https://<rest-api-id>.execute-api.us-east-1.amazonaws.com/alice/crm/mcp
```

## `dev wait`

```bash
serverless dev wait --for ready|invocation|reload|ended [--function <name>] [--after <cursor>] [--timeout <duration>] [--json]
```

Waits until the session in this directory reaches a point, then prints that event record and its cursor.

| Option             | Description                                                                                                                                                             |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--for`            | `ready` (the session is on), `invocation` (the end of the next invocation, whatever its outcome), `reload` (the end of the next reload) or `ended` (the session's end). |
| `--function`, `-f` | Only an invocation or reload of this function (repeatable). A name that is not in `serverless.yml` is refused at once.                                                  |
| `--after`          | Only records after this cursor (from a `--json` result), including ones written before the command started.                                                             |
| `--timeout`        | How long to wait: `100s` by default, at most `1h` (see [Durations](#options)).                                                                                          |
| `--json`           | Print one JSON result: `event` (the matched record) and `cursor` (its cursor, so `--after` it continues right after it).                                                |

- `ready` returns the `session.ready` record at once when the session is already on; on a start that failed, it returns the `session.failed` record with status `error`.
- `invocation` and `reload` wait for the next `invocation.end` or `reload.end` after now, or after `--after`. An invocation matches on its end, whatever its outcome.
- `ended` returns the terminal record — `session.failed` for a failed start, otherwise `session.ended` — and exits with that end's code: 0 for a clean end, 1 for an error, 3 for `restore_incomplete` or `attach_incomplete`. With no session running, it returns the last session's end when the log has one, else `session_not_running`.
- With `--after`, a matching record already in the log is returned even if the session has ended since; `ready` and `ended` return the earlier record when that state is already reached.
- A wait that ends because the session ended is `session_ended`, with the `session.ended` record as `event`.
- An open wait keeps a detached session from stopping for being idle, except `--for ended`.

Exit codes:

- `0` — a match.
- `1` — `session_ended` (the session ended first), `session_not_running` (no session here), `cursor_from_other_session`, `invalid_cursor`, `invalid_option_value` and the CLI's other errors.
- `3` — the session's process is gone without its end record, or `--for ended` after an incomplete end (`restore_incomplete`, next step `serverless dev restore --stage <stage> --region <region>`).
- `124` — nothing matched in time. The result has a `next` command that keeps waiting from the last record seen:

```json
{
  "v": 1,
  "status": "timeout",
  "reason": "timeout",
  "message": "Nothing matched within 100s; the session is still running.",
  "next": [
    {
      "command": "serverless dev wait --for invocation --function node --after s_8aa6ea24e76c:8",
      "when": "to keep waiting without missing an event"
    }
  ],
  "cursor": "s_8aa6ea24e76c:8"
}
```

A matched invocation:

```json
{
  "v": 1,
  "status": "ok",
  "cursor": "s_8aa6ea24e76c:8",
  "event": {
    "v": 1,
    "seq": 8,
    "ts": "2026-10-05T18:57:33.225Z",
    "session_id": "s_8aa6ea24e76c",
    "type": "invocation.end",
    "function": "node",
    "request_id": "b2958894-3f70-4e81-be92-10429418a3ee",
    "source": "caller",
    "outcome": "ok",
    "duration_ms": 3,
    "file": ".serverless/dev/invocations/node/1791226653-b2958894-3f70-4e81-be92-10429418a3ee.json"
  }
}
```

A session file whose session does not answer (its process is gone, or its control endpoint does not answer within 2 seconds, asked twice 250 ms apart) counts as not running: the result is `restore_incomplete`, with the restore as the next step. What a suggested restore carries is under [The result](#the-result).

## `dev stop`

```bash
serverless dev stop [--keep] [--timeout <duration>] [--json]
```

Stops the session running in this service directory, started with `--detach` or running in another terminal, and restores its functions. It reaches the session through the session's control endpoint, the same way on every platform and without a signal, then waits for `session.ended` and prints the restore.

| Option      | Description                                                                                                                   |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `--keep`    | Leave the functions in Dev Mode, like `--on-exit keep`.                                                                       |
| `--timeout` | How long to wait for the restore (default `7m`; see [Durations](#options)).                                                   |
| `--json`    | Print one JSON result: `restore` (`restored`, `unchanged`, `skipped`, `missing`, `failed`), `kept`, `exit_code` and `cursor`. |

Exit codes:

- `0` — the session ended and restored its functions (or kept them with `--keep`), or there is no session here.
- `3` — `restore_incomplete` (next step `serverless dev restore --stage <stage> --region <region>`): a function could not be restored, or the session's process is gone without its end record. Also `attach_incomplete`: the session restored everything but could not attach some function at its start.
- `1` — the session ended with an error (the result has the error's reason), or `stop_failed` when the session did not take the stop. `exit_code` is `null` in the result when the stop failed or timed out.
- `124` — the restore is still running after `--timeout`.

How it reaches a session that is starting, or one without a control endpoint:

- A session whose control endpoint does not answer within 2 seconds (asked twice, 250 ms apart) counts as gone: nothing is signalled, and the result says to run the restore.
- A session that is still starting is given up to 30 seconds (or `--timeout`) to open its control endpoint; then, on Linux and macOS only, it gets SIGTERM, which it handles like a first Ctrl+C. When `--timeout` runs out first, the result is `timeout` (exit 124) and nothing was asked of it. A session waiting at its `--approve` prompt stops after the person answers.
- A session file without a control endpoint counts as starting only while its `state` is `starting`, for one minute after its `started_at`. Any other such file names no process `dev stop` can identify: nothing is signalled, and the result is `restore_incomplete` (exit 3, with the restore as the next step).
- A session in a terminal whose control endpoint could not open (`control_unavailable`; a session started with `--detach` never runs without one) is not signalled either while its process runs: the result is `stop_failed` (exit 1), and the message says to stop it with Ctrl+C in its terminal.

In a terminal, a spinner shows the wait; then the session's result, without the time the restore took (`Dev Mode off · nothing to restore` when the session restored no function, because it had none attached or something else restored them first):

```text
✔ Dev Mode off · 4 functions restored
```

With `--json`:

```json
{
  "v": 1,
  "status": "ok",
  "message": "Dev Mode off · 4 functions restored.",
  "cursor": "s_beefdbcb3e94:12",
  "restore": {
    "restored": 4,
    "unchanged": 0,
    "skipped": 0,
    "missing": 0,
    "failed": 0
  },
  "kept": false,
  "exit_code": 0
}
```

## `dev requests`

```bash
serverless dev requests [--function <name>] [--limit <n>] [--json]
```

Lists the latest invocations Dev Mode ran on your machine, newest first, with the file that holds each one's event, response or error, and log lines. It reads `.serverless/dev/invocations`, so it also works after the session ended. The list holds every stage run from the service's directory, and each row names its stage (empty for invocations recorded before files named it).

| Option             | Description                                                                                                                                                                             |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--function`, `-f` | Only this function (repeatable).                                                                                                                                                        |
| `--limit`          | How many to list: `20` by default, at most 500.                                                                                                                                         |
| `--json`           | Print one JSON result: `requests` (`ts`, `function`, `stage` (`null` for an invocation recorded before files named it), `request_id`, `outcome`, `duration_ms`, `status_code`, `file`). |

```text
When                    Function  Stage  Request   Outcome  Status  Duration  File
less than a minute ago  node      alice  2c5f38df  ok               2 ms      .serverless/dev/invocations/node/1791193547-2c5f38df-5238-4e00-9d0b-3287d2e003b2.json
```

Exit 0, or 1 for an invalid `--limit` (`invalid_option_value`).

## `dev replay`

```bash
serverless dev replay <requestId> [--json]
```

Runs a recorded invocation again on your machine through the running session: the same function and event, with a new request id and deadline, and the latest role credentials the session received for that function. Those come with the function's latest invocation, so they can be another key holder's (see [Residual cases](../guide/dev-mode.md#residual-cases)). No caller receives the result. The id is the full request id, which matches exactly at any length, or a unique prefix of at least 8 characters, as `dev requests` lists them; a shorter or shared prefix is `ambiguous_request_id`.

- It needs a running session (else `session_not_running`), and the function needs one real invocation through AWS in that session first, which brings its role credentials.
- Replays have real effects, like any invocation.
- The replay uses the raw event the session kept in memory (the last 50 invocations per function). Once the session no longer holds it, the redacted copy from the invocation file is replayed, with `"note": "replayed_redacted_event"`: headers such as `Authorization` are then sent as `[redacted]`. A whole number in a JSON event beyond JavaScript's safe range (above 9,007,199,254,740,991) is kept rounded in the file, so such a replay sends the rounded number.
- One replay runs at a time; one asked for while another runs is refused at once. A replay that cannot run (the session is starting or stopping, the function is not in Dev Mode, no credentials of its role have arrived yet, all 24 handler processes are busy) exits 1 at once.
- An invocation recorded on another stage than the running session's is not replayed (`stage_mismatch`): it would run with that session's configuration and role. One session runs per directory, so the result's `next` has three steps, run in order: `dev stop` for this session, `dev --detach` for the recorded stage (with the session's region and `--aws-profile`), and the replay there. Before that replay, the function needs one real invocation through AWS on that stage, which brings the new session its role's credentials; no step invokes it for you, since an invocation has real effects.
- The replay's invocation file carries `replay_of` (the original request id) and `source: "replay"`.
- `--json` fields: `request_id` (the replay's), `replay_of`, `function`, `outcome`, `status_code`, `duration_ms`, `response`, `response_omitted` (`true` when the response is over 64 KB; the invocation file has it), `error`, `file` and `note` (`replayed_redacted_event`, as above).

```text
Replayed 2c5f38df on node as 3b3bc1c2 (no caller received it): ok · 2 ms
.serverless/dev/invocations/node/1791193559-3b3bc1c2-b335-4480-a3b3-7bf50c9cb245.json
```

Exit codes:

- `0` — the replay ran, whatever its outcome.
- `1` — `invocation_not_found`, `ambiguous_request_id`, `stage_mismatch`, `invalid_option_value` (no id), `session_not_running`, or a replay the session refused.
- `124` — still running after the function's timeout plus 30 seconds.

## `dev restore`

```bash
serverless dev restore [--function <name>] [--json]
```

Removes the Dev Mode configuration from the functions of a stage: what a session that did not exit cleanly, or one with `--on-exit keep`, left on them, whoever attached it. It restores the stage `--stage` names, else the service's default stage, with the default credentials unless `--aws-profile` is given, so pass the stage, region and profile the session ran on. It refuses with `session_running` only while a live session of this directory runs on the same stage and region; stop that session with `serverless dev stop` instead, which restores its functions. A `next` step of `dev stop`, `dev wait` or `dev status` can be this command; run it with `--json`, like every `next` step.

| Option             | Description                                                                                                                                    |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `--function`, `-f` | Restore only this function (repeatable).                                                                                                       |
| `--json`           | Print one JSON result: `restore` (`restored`, `unchanged`, `skipped`, `missing`, `failed`, counted as `dev stop` counts them) and `exit_code`. |

- Exit 0 when every function with Dev Mode configuration was restored, and when no function had any.
- Exit 3 (`restore_incomplete`) when some function could not be restored, for example when AWS throttled the update or refused `lambda:UpdateFunctionConfiguration` for it. The message names each one and why. `next` restores only those functions again, with one `--function` each and the `--stage`, `--region`, `--aws-profile` and `--config` the command ran with; when the message says access was denied, that permission is needed first.
- Exit 1 for `session_running` (`next`: `serverless dev stop`, or the restore to run after Ctrl+C in the session's terminal when no command can reach it), `permission_denied` (`lambda:GetFunction` is missing, so the functions cannot be read), `credentials_expired`, and the CLI's other errors. These change nothing; the result counts nothing.

The result has no `cursor`: `dev restore` works outside any session's event log. `exit_code` is the exit code the command ends with.

```json
{
  "v": 1,
  "status": "error",
  "reason": "restore_incomplete",
  "message": "1 function not restored: my-service-alice-worker (Rate exceeded).",
  "next": [
    {
      "command": "serverless dev restore --stage alice --region eu-west-1 --function worker",
      "when": "to try again the functions that were not restored"
    }
  ],
  "restore": {
    "restored": 1,
    "unchanged": 0,
    "skipped": 0,
    "missing": 0,
    "failed": 1
  },
  "exit_code": 3
}
```

## `dev setup`

```bash
serverless dev setup [--permissions-boundary <arn>] [--path <path>]
```

Creates the IAM role Dev Mode uses in an AWS account and region, for accounts where developers cannot create IAM roles. An administrator runs it once per region. See [`dev setup` for accounts without IAM role creation](../guide/dev-mode.md#dev-setup-for-accounts-without-iam-role-creation) in the guide for what the role is and how its trust policy is checked.

| Option                   | Description                                                            |
| ------------------------ | ---------------------------------------------------------------------- |
| `--permissions-boundary` | The ARN of a permissions boundary policy to attach to the role.        |
| `--path`                 | The IAM path of the role, such as `/serverless/` (default `/`).        |
| `--region`, `-r`         | Outside a service directory: the region to set up.                     |
| `--aws-profile`          | Outside a service directory: the AWS profile whose credentials to use. |

A permissions boundary given with `--permissions-boundary` must allow what the role's own policy grants, on these resources (`<region>` and `<account-id>` are the role's):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "iot:Connect",
      "Resource": "arn:aws:iot:<region>:<account-id>:client/sls-dev-*"
    },
    {
      "Effect": "Allow",
      "Action": "iot:Publish",
      "Resource": "arn:aws:iot:<region>:<account-id>:topic/sls-dev/*/up"
    },
    {
      "Effect": "Allow",
      "Action": "iot:Subscribe",
      "Resource": [
        "arn:aws:iot:<region>:<account-id>:topicfilter/sls-dev/*/down/*",
        "arn:aws:iot:<region>:<account-id>:topicfilter/sls-dev/*/gone"
      ]
    },
    {
      "Effect": "Allow",
      "Action": "iot:Receive",
      "Resource": [
        "arn:aws:iot:<region>:<account-id>:topic/sls-dev/*/down/*",
        "arn:aws:iot:<region>:<account-id>:topic/sls-dev/*/gone"
      ]
    },
    {
      "Effect": "Allow",
      "Action": "iot:SendDirectMessage",
      "Resource": "arn:aws:iot:<region>:<account-id>:client/sls-dev-*-cli"
    }
  ]
}
```

The role's own policy narrows these further: it denies `iot:Connect` with a client id that ends in `-cli`, and allows `iot:SendDirectMessage` only on topics `sls-dev/*/ping`.

Outside a service directory, `dev setup` runs without a service and without signing in first. It takes the AWS credentials of `--aws-profile`, or of the default chain, and the region from `--region`, `AWS_REGION`, `AWS_DEFAULT_REGION` or the AWS profile, in that order, else `us-east-1`. It prints the region it uses and where it came from first (or the profile or default form):

```text
Region eu-west-1, from --region.
```

It fails with `DEV_SETUP_AWS_CREDENTIALS_MISSING` when no AWS credentials load: pass `--aws-profile`, or sign in with `serverless login aws`. The message says what is missing (a profile without usable credentials, a profile whose SSO session expired, or no credentials at all) and how to set it up, in the words other commands use when they find no AWS credentials (another profile is named with `--aws-profile`, as there is no `provider.profile` outside a service). Inside a service directory, it uses the service's region and credentials. At the root of a Compose project, run it in a service's directory instead.

## Detached sessions

`serverless dev --detach` starts the session as a background process and returns once it is ready, at most after 100 seconds (then `timeout`, exit 124, while the session goes on starting). Its output goes to `.serverless/dev/session.log`. Each detached start first writes to a temporary log of its own, which becomes `session.log` once that session holds the directory; until then, the previous session's `session.log` is still there. If `--detach` stops waiting while the session is still starting, the result's `log_file` names the temporary file; a start that could not spawn its process has no `log_file`.

`serverless dev --detach --json` returns the session and its functions:

```json
{
  "v": 1,
  "status": "ok",
  "cursor": "s_8aa6ea24e76c:6",
  "session_id": "s_8aa6ea24e76c",
  "pid": 2824,
  "state": "on",
  "log_file": ".serverless/dev/session.log",
  "events_file": ".serverless/dev/session.ndjson",
  "functions": [
    { "name": "node", "mode": "dev" },
    { "name": "python", "mode": "dev" }
  ]
}
```

- **A second start.** Running it again with the same stage, region and functions returns the same session with `"already_running": true` and exit code 0, as long as that session answers; a session that is already stopping answers `session_running`. The running session keeps the settings it started with: when the new start gives another `--idle-timeout`, or `--take-over` or `--on-exit`, the result's `message` says that they apply only to a new session, which `serverless dev stop` and a new start give.
- **Idle timeout.** A detached session stops and restores its functions after 60 minutes without activity. `--idle-timeout <duration>` (such as `30m` or `2h`) changes it, `0` turns it off, and any other value under one minute is refused. Activity is an invocation starting or ending, a reload, a watched file change, a request from `dev status`, `dev requests` or `dev replay`, and an open `dev wait` (except `--for ended`). A session with an invocation running is never idle.
- **`--approve` with `--detach`** asks for confirmation before the session starts, when a person is at an interactive terminal; otherwise it returns `approval_needs_terminal` and changes nothing. A declined confirmation returns `status: "ok"`, `state: "off"` and the message `Nothing was changed.`, with exit code 0.
- **`--on-exit keep`** applies when the session stops, by `dev stop` or at the idle timeout. `--on-exit remove` is refused with `--detach` (`invalid_option_combination`): removing the service asks for confirmation at a terminal, which a background session does not have.

## `serverless invoke` during a session

When the session in this directory ran a `serverless invoke` call on your working copy, `invoke` adds one line on standard error, and with `--log` the log lines from your machine; standard output and exit codes are unchanged:

```text
Dev Mode: handled by your working copy · request b2958894 · .serverless/dev/invocations/node/1791226653-b2958894-3f70-4e81-be92-10429418a3ee.json
```

`invoke` can wait up to 2 seconds for the invocation file and then add nothing, for example when the session is stopping or restoring, or when the call ran the deployed code.

## Machine-readable output

`--json` prints one JSON result on standard output and the human text on standard error, for `dev status`, `dev wait`, `dev stop`, `dev requests`, `dev replay`, `serverless dev --detach` and `serverless dev --dry-run`. When `--json` is the option being refused (for example `serverless dev --json` without `--detach`), the refusal is still printed as JSON on standard output, with reason `invalid_option_combination`.

Paths and commands that Dev Mode prints, in its lines and in `--json` results, are written as they work from the directory the command runs in. A service run with `--config sub/serverless.yml` from its parent directory gets paths starting with `sub/` and suggested commands carrying `--config sub/serverless.yml`. From a [Compose](../../../guides/compose.md) root, they name the service and its folder: `serverless <service> dev wait`, `serverless <service> dev stop`, `<service>/.serverless/dev/session.log`; with `--json`, the `next` commands and every path in a result (`log_file`, `events_file`, a request's or invocation's `file`) are written the same way. The event records and invocation files on disk keep paths relative to the service's directory.

### The result

Every `--json` result is one JSON object with these fields, plus the command's own fields at the top level:

```json
{
  "v": 1,
  "status": "error",
  "reason": "session_running",
  "message": "Another Dev Mode session is running here (stage alice, pid 2824). Stop it first with \"serverless dev stop\".",
  "next": [
    {
      "command": "serverless dev stop",
      "when": "to end the running session"
    }
  ]
}
```

- `v` is the format version (`1`). `status` sets the exit code: `ok` → 0; `error` → 1, or 3 when `reason` is `restore_incomplete` or `attach_incomplete`; `action_required` → 1; `timeout` → 124. Exit code 124 means the command ran out of time: the session may still be running.
- `reason` is a code from the table below; `message` is one sentence for a person; `next` lists commands that usually come next; `cursor` is a position in the event log (see [Cursors](#cursors)).
- A restore in `next` or in `message` names the session's stage and region, and `--aws-profile <name>` when the session was started with one (`serverless dev restore --stage alice --region us-east-1`), because `serverless dev restore` on its own restores the service's default stage with the default credentials. When the session's start is no longer in its event log, the plain command comes; add the session's stage and region to it.
- `action_required` comes with `"user_action_required": true`: a person has to act (sign in, refresh credentials, grant a permission, confirm). **When `user_action_required` is true, do not run `next`: show `message` and `next` to the person.**

### Reasons

| Reason                       | Status            | Meaning, and what to do                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `already_running`            | `ok`              | `--dry-run`'s passing `session` check: a session with this scope runs here. (`--detach` returns the field `already_running: true`, with no reason.)                                                                                                                                                                                                                  |
| `session_running`            | `error`           | Another session runs here, or `dev restore` met one on its stage. Stop it, or use its scope.                                                                                                                                                                                                                                                                         |
| `session_not_running`        | `error`           | No session here (`dev wait`, `dev replay`). Start one with `serverless dev --detach`.                                                                                                                                                                                                                                                                                |
| `session_ended`              | `error`           | The session ended before what `dev wait` waited for. `event` is its `session.ended` record.                                                                                                                                                                                                                                                                          |
| `cursor_from_other_session`  | `error`           | The `--after` cursor is another session's. Take one from `serverless dev status --json`.                                                                                                                                                                                                                                                                             |
| `invalid_cursor`             | `error`           | The `--after` value is not a cursor.                                                                                                                                                                                                                                                                                                                                 |
| `invalid_option_value`       | `error`           | A bad duration, `--for` or `--limit`, or `dev replay` without an id. Fix the value.                                                                                                                                                                                                                                                                                  |
| `invalid_option_combination` | `error`           | Options that do not go together (see [Exit codes](#exit-codes)).                                                                                                                                                                                                                                                                                                     |
| `timeout`                    | `timeout`         | Out of time; the session may still be running. Run `next` to keep waiting.                                                                                                                                                                                                                                                                                           |
| `invocation_not_found`       | `error`           | No recorded invocation has that id. Pick one from `serverless dev requests`.                                                                                                                                                                                                                                                                                         |
| `ambiguous_request_id`       | `error`           | The prefix matches several requests or is under 8 characters. Pass more of the id.                                                                                                                                                                                                                                                                                   |
| `stage_mismatch`             | `error`           | `dev replay` of an invocation recorded on another stage than the running session's. `next` has three steps, run in order: `dev stop` for this session, `dev --detach` for the recorded stage, and the replay there, which runs once the function has been invoked through AWS on that stage (a new session gets its role's credentials only from a real invocation). |
| `restore_incomplete`         | `error`, exit 3   | A function was not restored, or the session ended without its end record. Run the restore in `next`.                                                                                                                                                                                                                                                                 |
| `attach_incomplete`          | `error`, exit 3   | Some function could not be attached. Read the function table.                                                                                                                                                                                                                                                                                                        |
| `stop_failed`                | `error`           | The session did not take the stop. Read `message`, then try again.                                                                                                                                                                                                                                                                                                   |
| `detach_failed`              | `error`           | The background session ended before it was ready. Read `.serverless/dev/session.log`.                                                                                                                                                                                                                                                                                |
| `control_unavailable`        | `error`           | A session started with `--detach` could not open its local control endpoint, so it did not start. Run `serverless dev` in a terminal, or allow listening on `127.0.0.1`.                                                                                                                                                                                             |
| `approval_needs_terminal`    | `action_required` | `--approve` without a terminal; nothing changed. Ask the person, or drop `--approve`.                                                                                                                                                                                                                                                                                |
| `stage_protected`            | `error`           | `prod` or `production`. Use a personal or development stage.                                                                                                                                                                                                                                                                                                         |
| `region_no_broker`           | `error`           | The region has no AWS IoT Core. Use a stage in another region.                                                                                                                                                                                                                                                                                                       |
| `signin_required`            | `action_required` | Not signed in to Serverless Framework. Ask the person to sign in.                                                                                                                                                                                                                                                                                                    |
| `aws_credentials_missing`    | `action_required` | No AWS credentials loaded. Ask the person to configure them.                                                                                                                                                                                                                                                                                                         |
| `credentials_expired`        | `action_required` | AWS rejected the credentials. Ask the person to sign in again; `message` names where the credentials come from and how.                                                                                                                                                                                                                                              |
| `permission_denied`          | `action_required` | An AWS permission is missing; `message` names it. Ask for it to be granted.                                                                                                                                                                                                                                                                                          |
| `network_blocked`            | `action_required` | Your machine cannot reach AWS or AWS IoT Core. Ask for the host to be allowed. When `message` says the AWS IoT Core endpoint cannot be resolved yet (the account's first use of AWS IoT Core in the region), run the command again in a few minutes instead.                                                                                                         |
| `broker_missing`             | `action_required` | The IAM role does not exist yet. In `--dry-run`: informational, the first session creates it.                                                                                                                                                                                                                                                                        |
| `layers_missing`             | `error`           | The CLI's layer files are missing. In `--dry-run`: informational, the session publishes them.                                                                                                                                                                                                                                                                        |
| `nothing_to_attach`          | `error`           | No function can run in Dev Mode. Read each function's reason.                                                                                                                                                                                                                                                                                                        |
| `error`                      | `error`           | Any other error. Read `message`.                                                                                                                                                                                                                                                                                                                                     |

`replayed_redacted_event` is a note, not a reason: see [`dev replay`](#dev-replay). The reasons a function is `deployed` or `skipped` are in [Functions and modes](../guide/dev-mode.md#functions-and-modes); the CLI error codes behind each reason are under [Errors](#errors).

### Cursors

A cursor is `<session_id>:<seq>`, the position of a record in the session's event log. `--after <cursor>` is exclusive: it matches records after that one, including records written before the command started. A `dev wait` result's `cursor` is the matched record's, so waiting `--after` it again continues right after that record and misses nothing. `dev status` and `dev stop` results carry the cursor of the last record. A cursor of another session is refused with `cursor_from_other_session`; a malformed one with `invalid_cursor`. Always use cursors rather than counting records: a record that could not be written still takes its number.

### Dry-run results

`serverless dev --dry-run --json` runs the checks and builds the plan without changing anything:

- `plan` holds `changes` (one per function, with `fields` as codes: `layers`, `environment`, `exec_wrapper`), `account_setup` and `first_deploy`. It is `null` only when the plan cannot be built, and a failing check in `preflight` says why.
- `functions` lists each function's `name`, `mode`, `reason`, `why` and `notes`.
- `preflight` lists the checks (`stage`, `signin`, `session`, `aws_identity`, `iot_endpoint`, `iot_connect`, `broker_role`, `stack`, `functions`, `layers`), each with `check`, `ok` and, where it applies, `reason`, `message` and `host`. A failing check has `"user_action_required": true` exactly when its reason is one a person must act on (`action_required` in the reason table).
- On a stage that was never deployed, the dry run covers the deployment only: it skips the layer check, and the plan says that the first session deploys the stage first.

## Errors

Each row is a CLI error code and the `reason` it has in `--json` results.

| Code                                  | Reason                       | Cause, and fix                                                                                                                                                                                                                                                                                                  |
| ------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AUTH_REQUIRED`                       | `signin_required`            | Not signed in; no JSON is printed. Run `serverless login`, or set a license key.                                                                                                                                                                                                                                |
| `AWS_CREDENTIALS_MISSING`             | `aws_credentials_missing`    | No AWS credentials found. Configure them (see [AWS Credentials](../guide/credentials.md)).                                                                                                                                                                                                                      |
| `AWS_CREDENTIALS_NOT_FOUND`           | `aws_credentials_missing`    | The profile's credentials were not found. Check the profile, or pass `--aws-profile`.                                                                                                                                                                                                                           |
| `AWS_CREDENTIALS_EXPIRED`             | `credentials_expired`        | The credentials expired. Sign in again with `serverless login aws --aws-profile <name>`, or `serverless login aws sso` for an SSO profile.                                                                                                                                                                      |
| `DEV_MODE_APPROVE_NEEDS_TERMINAL`     | `approval_needs_terminal`    | `--approve` needs an interactive terminal; nothing changed. Run it in one, or without `--approve`.                                                                                                                                                                                                              |
| `DEV_MODE_AWS_CREDENTIALS_INVALID`    | `credentials_expired`        | AWS rejected the credentials Dev Mode used. The message names where they come from (a Serverless Dashboard Provider, an `aws` resolver in `serverless.yml`, an AWS profile or keys in the environment, as `serverless deploy` does) and what to do.                                                             |
| `DEV_MODE_AWS_IDENTITY_UNKNOWN`       | `aws_credentials_missing`    | The account of the credentials is unknown. Check them with `aws sts get-caller-identity`.                                                                                                                                                                                                                       |
| `DEV_MODE_AWS_UNREACHABLE`            | `network_blocked`            | AWS cannot be reached in the region. Check the network, DNS and proxy settings.                                                                                                                                                                                                                                 |
| `DEV_MODE_BROKER_BOUNDARY_INVALID`    | `error`                      | IAM refused `--permissions-boundary`. Pass the ARN of an existing managed policy.                                                                                                                                                                                                                               |
| `DEV_MODE_BROKER_CREATE_DENIED`       | `permission_denied`          | You cannot create or update the IAM role. An administrator runs `serverless dev setup` once in the region.                                                                                                                                                                                                      |
| `DEV_MODE_BROKER_FOREIGN`             | `error`                      | A role with the Dev Mode role's name was not created by Dev Mode. Rename or delete it.                                                                                                                                                                                                                          |
| `DEV_MODE_BROKER_MODIFIED`            | `error`                      | The role's trust policy was changed. Delete the role and run `serverless dev setup` again.                                                                                                                                                                                                                      |
| `DEV_MODE_BROKER_READ_DENIED`         | `permission_denied`          | `iam:GetRole` on the role was denied (at start and in `--dry-run`), or `iam:GetRolePolicy` was denied where Dev Mode must read the role's permission policy before it writes one (`serverless dev setup` on an existing role). Allow it. A session without `iam:GetRolePolicy` takes the policy to be in place. |
| `DEV_MODE_BROKER_UNAVAILABLE`         | `error`                      | Someone else was creating the role at the same moment. Run `serverless dev` again.                                                                                                                                                                                                                              |
| `DEV_MODE_CONFIG_FILE_UNREADABLE`     | `error`                      | The service configuration file could not be read. Check the file.                                                                                                                                                                                                                                               |
| `DEV_MODE_IDENTITY_ACCESS_DENIED`     | `permission_denied`          | `sts:GetCallerIdentity` was denied. Allow it.                                                                                                                                                                                                                                                                   |
| `DEV_MODE_IOT_ACCESS_DENIED`          | `permission_denied`          | `iot:DescribeEndpoint` was denied. Allow it.                                                                                                                                                                                                                                                                    |
| `DEV_MODE_IOT_CONNECT_DENIED`         | `permission_denied`          | AWS IoT Core refused your machine (see below).                                                                                                                                                                                                                                                                  |
| `DEV_MODE_IOT_UNREACHABLE`            | `network_blocked`            | AWS IoT Core cannot be reached. Check the network and `HTTPS_PROXY`. In a region where the account has never used AWS IoT Core, its new endpoint's host name can take a few minutes to resolve: the session waits up to 2 minutes, then says to run the command again in a few minutes.                         |
| `DEV_MODE_LAYER_ACCESS_DENIED`        | `permission_denied`          | Listing or publishing the `serverless-dev-*` layers was denied. Allow it.                                                                                                                                                                                                                                       |
| `DEV_MODE_LAYER_MISSING`              | `layers_missing`             | The CLI installation lacks its Dev Mode layer files. Reinstall the Serverless Framework.                                                                                                                                                                                                                        |
| `DEV_MODE_LOCAL_COMMAND_NO_AWS`       | `error`                      | A plugin of the service asked for AWS credentials during `dev status`, `dev stop`, `dev wait`, `dev requests` or `dev replay`, which read only the local session and use no AWS credentials. The plugin has to skip its AWS calls for these commands: tell its author.                                          |
| `DEV_MODE_LOCAL_RUNTIME_FAILED`       | `error`                      | The runtime that runs handlers on your machine could not start. Read the message.                                                                                                                                                                                                                               |
| `DEV_MODE_NOTHING_TO_ATTACH`          | `nothing_to_attach`          | No function can run in Dev Mode. The function table says why for each.                                                                                                                                                                                                                                          |
| `DEV_MODE_REGION_NO_BROKER`           | `region_no_broker`           | The region has no AWS IoT Core. Use a stage in another region.                                                                                                                                                                                                                                                  |
| `DEV_MODE_STACK_ACCESS_DENIED`        | `permission_denied`          | `cloudformation:DescribeStacks` was denied. Allow it on the stage's stack.                                                                                                                                                                                                                                      |
| `DEV_MODE_STAGE_PROTECTED`            | `stage_protected`            | Dev Mode does not run on `prod` or `production`. Use a personal stage.                                                                                                                                                                                                                                          |
| `DEV_MODE_UNKNOWN_FUNCTION`           | `error`                      | A function name is not in `serverless.yml`. Use the function's key.                                                                                                                                                                                                                                             |
| `DEV_MODE_UPDATE_TIMEOUT`             | `error`                      | A configuration update did not finish in time. Check the function, then run the command again.                                                                                                                                                                                                                  |
| `DEV_MODE_CONTROL_UNAVAILABLE`        | `control_unavailable`        | A session started with `--detach` could not open its local control endpoint. Run `serverless dev` in a terminal.                                                                                                                                                                                                |
| `DEV_MODE_RECORD_UNAVAILABLE`         | `error`                      | A `--detach` session could not write its record: `--detach` answers `detach_failed`, with the message in its log tail.                                                                                                                                                                                          |
| `DEV_MODE_SESSION_RUNNING`            | `session_running`            | Another session runs here. Stop it with `serverless dev stop`, or use its stage and functions.                                                                                                                                                                                                                  |
| `DEV_MODE_INVALID_OPTION_COMBINATION` | `invalid_option_combination` | Options that do not go together (see [Exit codes](#exit-codes)). Drop one.                                                                                                                                                                                                                                      |
| `DEV_MODE_INVALID_DURATION`           | `invalid_option_value`       | `--timeout` or `--idle-timeout` is not a duration such as `100` or `100s` (seconds), `5m` or `1h`, or is out of range.                                                                                                                                                                                          |
| `DEV_MODE_INVALID_WAIT_FOR`           | `invalid_option_value`       | `dev wait --for` is not `ready`, `invocation`, `reload` or `ended`.                                                                                                                                                                                                                                             |
| `DEV_MODE_INVALID_LIMIT`              | `invalid_option_value`       | `dev requests --limit` is not a whole number from 1 to 500.                                                                                                                                                                                                                                                     |
| `INVALID_DEV_MODE_OPTION`             | `error`                      | `--mode` is not `functions`, `agents` or `sandboxes`.                                                                                                                                                                                                                                                           |
| `INVALID_DEV_ON_EXIT_OPTION`          | `error`                      | `--on-exit` is not `keep` or `remove`.                                                                                                                                                                                                                                                                          |
| `DEV_RESTORE_ACCESS_DENIED`           | `permission_denied`          | `dev restore` cannot read or update the functions. Allow `lambda:GetFunction` and `lambda:UpdateFunctionConfiguration`.                                                                                                                                                                                         |
| `DEV_SETUP_ACCESS_DENIED`             | `permission_denied`          | `dev setup` cannot create the role, or read or write its permission policy. Run it with an administrator's credentials.                                                                                                                                                                                         |
| `DEV_SETUP_AWS_CREDENTIALS_MISSING`   | `aws_credentials_missing`    | `dev setup` outside a service loaded no credentials. Pass `--aws-profile`, or sign in with `serverless login aws`.                                                                                                                                                                                              |
| `DEV_SETUP_CONCURRENT`                | `error`                      | Someone else was creating the role at the same moment. Run `serverless dev setup` again.                                                                                                                                                                                                                        |
| `DEV_SETUP_INVALID_PATH`              | `error`                      | `--path` does not start and end with `/`. Pass a path such as `/serverless/`.                                                                                                                                                                                                                                   |
| `DEV_SETUP_PATH_MISMATCH`             | `error`                      | The role exists with another IAM path. Delete it, then run `serverless dev setup --path` again.                                                                                                                                                                                                                 |

`DEV_MODE_IOT_CONNECT_DENIED` has two causes, and its message says which. AWS IoT Core refused the signed connection (HTTP 403): the credentials expired or are invalid, or this machine's clock is more than 5 minutes off; refresh the credentials and check the clock. Or it refused the connection or the subscription: your credentials need `iot:Connect` on client `sls-dev-*`, and `iot:Subscribe`, `iot:Receive` and `iot:Publish` on topics `sls-dev/*`.

## Permissions

Developers need these permissions in the stage's account and region (replace the placeholders):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DevModeFunctions",
      "Effect": "Allow",
      "Action": ["lambda:GetFunction", "lambda:UpdateFunctionConfiguration"],
      "Resource": "arn:aws:lambda:<region>:<account-id>:function:<service>-<stage>-*"
    },
    {
      "Sid": "DevModeLayers",
      "Effect": "Allow",
      "Action": ["lambda:PublishLayerVersion", "lambda:GetLayerVersion"],
      "Resource": [
        "arn:aws:lambda:<region>:<account-id>:layer:serverless-dev-*",
        "arn:aws:lambda:<region>:<account-id>:layer:serverless-dev-*:*"
      ]
    },
    {
      "Sid": "DevModeReads",
      "Effect": "Allow",
      "Action": [
        "lambda:ListLayerVersions",
        "iot:DescribeEndpoint",
        "sts:GetCallerIdentity"
      ],
      "Resource": "*"
    },
    {
      "Sid": "DevModeStack",
      "Effect": "Allow",
      "Action": "cloudformation:DescribeStacks",
      "Resource": "arn:aws:cloudformation:<region>:<account-id>:stack/<service>-<stage>/*"
    },
    {
      "Sid": "DevModeBrokerRole",
      "Effect": "Allow",
      "Action": [
        "iam:GetRole",
        "iam:GetRolePolicy",
        "iam:CreateRole",
        "iam:PutRolePolicy",
        "iam:PutRolePermissionsBoundary"
      ],
      "Resource": "arn:aws:iam::<account-id>:role/*serverless-dev-broker-*"
    },
    {
      "Sid": "DevModeIotConnect",
      "Effect": "Allow",
      "Action": ["iot:Connect", "iot:SendDirectMessage"],
      "Resource": "arn:aws:iot:<region>:<account-id>:client/sls-dev-*"
    },
    {
      "Sid": "DevModeIotSubscribe",
      "Effect": "Allow",
      "Action": "iot:Subscribe",
      "Resource": "arn:aws:iot:<region>:<account-id>:topicfilter/sls-dev/*"
    },
    {
      "Sid": "DevModeIotMessages",
      "Effect": "Allow",
      "Action": ["iot:Receive", "iot:Publish"],
      "Resource": "arn:aws:iot:<region>:<account-id>:topic/sls-dev/*"
    },
    {
      "Sid": "DevModePayloadObjects",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:DeleteObjectVersion"
      ],
      "Resource": "arn:aws:s3:::<deployment-bucket>/serverless-dev-mode/*"
    },
    {
      "Sid": "DevModePayloadListing",
      "Effect": "Allow",
      "Action": ["s3:ListBucketVersions", "s3:ListBucket"],
      "Resource": "arn:aws:s3:::<deployment-bucket>"
    }
  ]
}
```

- The function and stack resources above assume the default names (`<service>-<stage>-<function>` and `<service>-<stage>`); adjust them for custom names.
- `iam:CreateRole` and `iam:PutRolePolicy` are needed once per account and region, by whoever starts the first session, to create the IAM role; `iam:PutRolePermissionsBoundary` only with `serverless dev setup --permissions-boundary`. If developers cannot create IAM roles, an administrator runs [`serverless dev setup`](#dev-setup) once and developers need only `iam:GetRole`. `iam:GetRolePolicy` is optional for a session (without it, the role's policy is taken to be in place). `serverless dev setup` on an existing role needs it, because it never replaces a policy that a newer version of Dev Mode wrote. `iam:PutRolePolicy` also puts the policy back when it is missing, older or changed. A role created with `dev setup --path` has that path in its ARN (`arn:aws:iam::<account-id>:role/serverless/serverless-dev-broker-<region>` for `--path /serverless/`); the `*` after `role/` in the policy above covers the role under any path.
- The AWS IoT Core permissions are required: a denial fails the start with `DEV_MODE_IOT_CONNECT_DENIED`, which names them. `iot:SendDirectMessage` is optional: without it, Dev Mode cannot check whether another developer's session is still live, so their functions stay with them and a warning says so.
- `<deployment-bucket>` is the bucket `serverless deploy` uses for the stage: `provider.deploymentBucket.name` when the service sets one, the `ServerlessDeploymentBucket` resource of the stage's stack when it has one, else the bucket named in the SSM parameter `/serverless-framework/deployment/s3-bucket` (see [Deployment Bucket](../../../guides/deployment-bucket#ssm-parameter-storage)).
- The S3 permissions are optional: without them, payloads above one message are not relayed (see [Limits and known differences](../guide/dev-mode.md#limits-and-known-differences)), and the session prints why. `s3:ListBucket` is used when `s3:ListBucketVersions` is denied. A deployment bucket encrypted with an AWS KMS key also needs `kms:GenerateDataKey` and `kms:Decrypt` on that key.
- A service whose `provider.httpApi.id` names an existing HTTP API also uses `apigateway:GET` on that API (and `cloudformation:ListExports` for an `Fn::ImportValue`), as `serverless info` does, to list its endpoints. Both are optional: without them, those endpoints are not listed.
- The first session of a never-deployed stage deploys it, which needs your usual deploy permissions.
- Dev Mode never passes a role to a function, so it needs no `iam:PassRole`.

## Files

A session keeps its record in `.serverless/dev/` in the service directory. On Linux and macOS, a session creates that folder and the folders under it readable by their owner only (mode 0700), and tightens a folder an earlier session left wider when it next writes in it:

| File                                                                      | Content                                                                                                 |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `.serverless/dev/session.json`                                            | The running session (below). Mode 0600; removed after `Dev Mode off`.                                   |
| `.serverless/dev/control.token`                                           | The token of the session's control endpoint. Mode 0600; removed with `session.json`.                    |
| `.serverless/dev/session.lock`                                            | Held for a moment while a start or a session changes `session.json`.                                    |
| `.serverless/dev/session.ndjson`                                          | The event records of the current or last session.                                                       |
| `.serverless/dev/session.<session_id>.ndjson`                             | The records of an earlier session, renamed when the next one starts; the last five are kept.            |
| `.serverless/dev/session.log`                                             | The output of a session started with `--detach`. Mode 0600.                                             |
| `.serverless/dev/invocations/<function>/<unix seconds>-<request id>.json` | One file per invocation (below). Characters outside `A-Z a-z 0-9 . _ -` in the function key become `_`. |

All these formats are versioned (`"v": 1`): fields may be added in later versions, and none is renamed or removed. Readers ignore fields they do not know. `serverless package`, `serverless deploy` and `serverless deploy function` keep `.serverless/dev/` when they empty `.serverless/`. When to delete the record is under [The files Dev Mode writes](../guide/dev-mode.md#the-files-dev-mode-writes) in the guide.

Dev Mode writes, reads and removes these files only in real directories. When `.serverless`, `.serverless/dev` or a directory under it is a symbolic link (or a Windows junction), the session keeps no record there, says so in one warning line, and never follows the link; `--detach` refuses the link before it starts a session.

Invocation files redact credentials:

- the headers `Authorization`, `Proxy-Authorization`, `Cookie`, `Set-Cookie`, `X-Api-Key` and `X-Amz-Security-Token`, matched in any case;
- the `X-Amzn-Oidc-Accesstoken`, `X-Amzn-Oidc-Data` and `X-Amzn-Oidc-Identity` headers an Application Load Balancer with OIDC or Amazon Cognito authentication forwards, matched in any case;
- HTTP API cookies, an API key in a REST API event's request context, a TOKEN authorizer's token and an HTTP API Lambda authorizer's identity source.

Query strings, bodies and handler log lines are kept as they are. Dev Mode keeps the last 500 invocation files per function and at most 200 MB in all, removing the oldest first.

### `session.json`

Of a session that is on:

```json
{
  "v": 1,
  "session_id": "s_8aa6ea24e76c",
  "pid": 2824,
  "state": "on",
  "service": "my-service",
  "stage": "alice",
  "region": "us-east-1",
  "owner": "alice@laptop",
  "selection": {
    "only": [],
    "skip": []
  },
  "detached": true,
  "idle_timeout_s": 3600,
  "started_at": "2026-10-05T18:57:03.321Z",
  "ready_at": "2026-10-05T18:57:25.699Z",
  "cli_version": "4.x.y",
  "events_file": "session.ndjson",
  "log_file": "session.log",
  "control": {
    "url": "http://127.0.0.1:62221",
    "token_file": "control.token"
  }
}
```

- `state` is `starting`, `on` or `stopping`. While `state` is `starting`, `ready_at` is `null` and `control` can be `null` for a moment, until the control endpoint listens. A reader treats such a file whose `pid` is alive as a live session that is still starting, for at most one minute after `started_at`. Past that minute, or in any other state, a file without `control` is stale.
- `control_unavailable` is `true` when a session in a terminal could not open its control endpoint (`control` stays `null`): no command can reach that session. A session started with `--detach` never runs without its endpoint: it ends its start with `control_unavailable` and `--detach` answers `detach_failed`. While its `pid` is alive, a new start refuses with `session_running` and `dev stop` signals nothing; stop it with Ctrl+C in its terminal, then run `serverless dev restore --stage <stage> --region <region>` with its stage and region if it left functions in Dev Mode.
- `selection` holds the `--function` (`only`) and `--skip-function` (`skip`) names, sorted. Two starts are the same session when `stage`, `region` and `selection` are equal.
- `log_file` is `"session.log"` for a detached session, else `null`; `idle_timeout_s` is `null` when there is no idle timeout.
- `aws_profile` is present only when the session was started with `--aws-profile`; it holds that profile's name, and the restores the session's commands suggest carry it.
- A session whose control endpoint does not answer within 2 seconds, asked twice 250 ms apart, counts as not running (see [`dev stop`](#dev-stop)).

### Event records

`session.ndjson` holds one JSON object per line, at most 4,096 bytes. Each has `v`, `seq` (1, 2, … within the session), `ts`, `session_id`, `type` and the type's fields. A string that would make a record too long is cut, and the record gets `"truncated": true`. URLs are written as `<url>`. No handler log line and no event or response body is ever written here.

| `type`                      | Fields                                                                                                                                                                                               |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `session.starting`          | `service`, `stage`, `region`, `aws_profile` (only when started with `--aws-profile`), `owner`, `pid`, `detached`, `selection`                                                                        |
| `function.mode`             | `function`, `mode`, `reason`, `why`, `notes` (note codes): one per function once attached                                                                                                            |
| `session.ready`             | `functions` (`dev`, `deployed`, `skipped` counts), `ready_ms`, `attach_ms`                                                                                                                           |
| `session.failed`            | `reason`, `message`, `exit_code`: the start ended before the session was ready                                                                                                                       |
| `invocation.start`          | `function`, `request_id`, `label`, `new_worker`, `source` (`caller` or `replay`)                                                                                                                     |
| `invocation.end`            | `function`, `request_id`, `source`, `outcome` (`ok`, `error`, `timeout`, `worker_exited`), `status_code`, `error_type`, `duration_ms`, `file` (`null` when the invocation file could not be written) |
| `invocation.passed_through` | `function`, `count`, `reason` (`late`, `paced`, `refused`, `clock_off`, `offline`, `worker_limit`), `at_least`                                                                                       |
| `reload.start`              | `files` (a count), `functions`                                                                                                                                                                       |
| `reload.end`                | `ok`, `functions`, `ms`, `error` (one line)                                                                                                                                                          |
| `connection.lost`           | `reason` (one line)                                                                                                                                                                                  |
| `connection.restored`       | `offline_ms`                                                                                                                                                                                         |
| `credentials.expired`       | —                                                                                                                                                                                                    |
| `credentials.refreshed`     | —                                                                                                                                                                                                    |
| `function.lost`             | `function`, `state` (see [Functions and modes](../guide/dev-mode.md#functions-and-modes))                                                                                                            |
| `session.stopping`          | `trigger` (`signal`, `stop_command`, `idle_timeout`, `hotkey`, `error`), `signal`                                                                                                                    |
| `session.ended`             | `exit_code`, `restore` (`restored`, `unchanged`, `skipped`, `missing`, `failed`), `kept`: always the last record                                                                                     |

- Fields that do not apply to a record are left out (a `dev` function's `function.mode` has no `reason`; an `invocation.end` without an HTTP status has no `status_code`).
- `label` names the event: `aws:apigateway:v2:post:/orders` (HTTP API, either payload format), `aws:apigateway:v1:get:/orders` (REST API), `aws:alb:get:/orders` (Application Load Balancer), `aws:lambda-url:post:/` (function URL), `aws:sqs:<queue>:<message id>`, `aws:s3:<bucket>:<event name>`, `aws:eventbridge:<source>:<detail-type>`, `aws:schedule:<rule>`, `mcp tools/call <tool>` for an MCP server, `direct invoke`, and others in that style. The terminal shortens a resource name in a label, while the records keep the full label. The name loses the stack's name in front of it. It then loses a last part shaped like the suffix CloudFormation generates: 12 or 13 letters and digits, with at least one capital and one digit, after a name of letters and digits. So `my-service-alice-JobsQueue-i0PzaO617EMJ` shows as `JobsQueue`.
- `invocation.passed_through` counts invocations that ran the deployed code instead: `late` (they reached this machine too late), `paced` (above the rate Dev Mode relays, or refused by AWS IoT Core's rate limits), `refused` (AWS IoT Core refused this machine's acceptance), `clock_off` (this machine's clock moved), `worker_limit` (all 24 handler processes on this machine were busy), and `offline`, which means the session could not be reached. `offline` has two sources: the session itself, for an acceptance it could not send (an exact count), and the functions' bridges, which report the invocations they ran while the session could not be reached once it is back (`"at_least": true`).
- A session that ends before it was ready without failing (a declined `--approve`, a stop during the start) writes `session.ended` with no `session.ready` or `session.failed`.

### Invocation files

An invocation file of an HTTP API request (header values and bodies shortened):

```json
{
  "v": 1,
  "request_id": "b2958894-3f70-4e81-be92-10429418a3ee",
  "function": "node",
  "stage": "alice",
  "source": "caller",
  "label": "aws:apigateway:v2:post:/node",
  "started_at": "2026-10-05T18:57:33.153Z",
  "duration_ms": 3,
  "init_ms": 72,
  "deployed_timeout_s": 10,
  "outcome": "ok",
  "status_code": null,
  "caller_received": null,
  "error": null,
  "logs": {
    "lines": ["<a line your handler logged>"],
    "truncated": false
  },
  "event": {
    "version": "2.0",
    "routeKey": "POST /node",
    "rawPath": "/node",
    "rawQueryString": "view=summary&page=2",
    "cookies": ["[redacted]"],
    "headers": {
      "authorization": "[redacted]",
      "content-type": "application/json",
      "host": "<api-id>.execute-api.us-east-1.amazonaws.com",
      "x-api-key": "[redacted]"
    },
    "queryStringParameters": {
      "page": "2",
      "view": "summary"
    },
    "requestContext": {
      "http": {
        "method": "POST",
        "path": "/node"
      },
      "stage": "$default"
    },
    "body": "<the request body>",
    "isBase64Encoded": false
  },
  "event_encoding": "json",
  "event_truncated": false,
  "event_bytes": 1047,
  "response": {
    "<field>": "<value>"
  },
  "response_truncated": false,
  "response_bytes": 139,
  "context": {
    "function_name": "my-service-alice-node",
    "memory_mb": 1024,
    "deadline_ms": 1791226662589
  },
  "redacted": [
    "event.headers.authorization",
    "event.headers.x-api-key",
    "event.cookies"
  ]
}
```

- `event` holds parsed JSON when the event is JSON, else its bytes as `{ "base64": "…" }`; `response` holds parsed JSON when the response is JSON, else text, else `{ "base64": "…" }`. `event_encoding` is `base64` when `event` is that `{ "base64": "…" }` form (the event was not JSON) and `json` otherwise; `serverless dev replay` decodes base64 only when it says so, and treats a file without it as JSON. A body over 1 MB is cut, with `event_truncated` or `response_truncated` set; `event_bytes` and `response_bytes` keep the full size. A streamed response's `response_bytes` includes the stream's HTTP prelude.
- `stage` is the stage of the session that ran the invocation: a service directory keeps the invocations of every stage run from it.
- `outcome` is `ok`, `error`, `timeout` or `worker_exited`; `status_code` is the HTTP status when the response sets one; `error` holds `type`, `message` and `stack`; `caller_received` is the `Caller received:` text for an error.
- `logs.lines` keeps at most 1,000 lines or 256 KB (262,144 bytes), and holds the lines written before the invocation ended. A line finished after that shows under the invocation in the terminal but is in no file.
- `redacted` lists what was replaced (the list above). The function's environment, its credentials and the session key are never written.
- A replay's file also has `replay_of` and `"source": "replay"`. A `dev replay` result leaves out a response over 64 KB (65,536 bytes), with `"response_omitted": true`; the file has it.

### Dev builds

A dev build of TypeScript or bundled JavaScript writes to `.serverless/build/`, staging each build in `.serverless/build-dev-staging-<build id>-<n>/` (a new one for each build) and moving it in once every function built. A session's first dev build empties `.serverless/build/` first, keeping only the lockfiles, and writes there the `package.json` the deployed artifact has, as a deploy build does. That file decides how Node.js loads the build's `.js` files; with `bundle: false` the build ends with a copy of the service's own, which has the same `type`, `imports` and `exports`. Unlike a deploy build, it installs no dependencies: it also removes the `node_modules` a deploy installed there, so code in the build resolves its dependencies from the service directory, and the next deploy installs them again. Each later dev build removes the files the one before it moved in and it no longer has, such as the output of a deleted source file or a removed `package.patterns` file. A build that fails changes nothing.

## Examples

Start a session on your personal stage:

```bash
serverless dev --stage alice
```

Attach only two functions, in another region:

```bash
serverless dev --stage alice --region us-east-2 --function api --function worker
```

Keep a function on its deployed code, and take over functions from another session:

```bash
serverless dev --stage alice --skip-function report --take-over
```

Check everything first, changing nothing:

```bash
serverless dev --stage alice --dry-run
```

Leave the functions in Dev Mode on exit, and restore them later:

```bash
serverless dev --stage alice --on-exit keep
serverless dev restore --stage alice
```

The loop an AI agent runs:

```bash
serverless dev --detach --json
serverless dev status --json
serverless dev wait --for invocation --after <cursor> --json
serverless dev requests --json
serverless dev replay <requestId> --json
serverless dev stop --timeout 100s --json
```

## Sandboxes (Lambda MicroVMs)

For [sandboxes](../guide/sandboxes.md), `serverless dev --sandbox <name>` (or `--mode sandboxes`) runs the sandbox locally as a Docker container — a different mechanism from the functions session described above. It builds the sandbox's `Dockerfile` and starts a local, SDK-compatible AWS Lambda MicroVMs control plane that launches instances as Docker containers on demand, streams their logs, and hot-reloads on file changes. The commands, the requirements (a Docker daemon, a local `artifact` directory), the execution-role emulation behind `--[no-]assume-role` and the control-plane port are described under [Local development](../guide/sandboxes.md#local-development-serverless-dev) in the sandboxes guide.

## MCP servers

`serverless dev` serves the [MCP servers](../guide/mcp.md) declared under your service's `mcp` property the same way it serves your functions; the [Dev Mode section of the MCP guide](../guide/mcp.md#dev-mode) describes the behavior, from access control and `state` keys to streaming and payload size. The session prints each server's URL under `mcp:` after the ready line, a single server on that line and several on one line each, as [`dev status`](#dev-status) does. It logs each request with its JSON-RPC method and the tool, prompt or resource it targets, with the local run time on the reply line. MCP servers stream their responses, so each reply line also gives the time to the first byte and the number of chunks. A JSON-RPC error carried inside a `200` response is called out on the reply line, since the status code alone would hide it:

```text
→ λ crm ── mcp tools/list · 1f0c2a9e
← λ crm (200) 1.2s · cold start 310ms · first byte 1.1s, 1 chunk · 1f0c2a9e
→ λ crm ── mcp tools/call get_weather · 7b44e0d1
← λ crm (200) 640ms · first byte 615ms, 1 chunk · 7b44e0d1
→ λ crm ── mcp tools/call noSuchTool · c3a9d5f2
← λ crm (200) ── error -32602: Tool noSuchTool not found 158ms · first byte 151ms, 1 chunk · c3a9d5f2
```

Only JSON-RPC-level errors get that callout. A failure inside a tool — arguments its input schema rejects, for example — is an MCP tool result carrying `isError: true` inside a `200` response. It is logged as a plain `(200)` line, and the reason appears in the result the client receives. Anything your server logs appears between the two lines, and `--detailed` additionally prints, for every request, the complete API Gateway event and the response: its status code, headers and body.
