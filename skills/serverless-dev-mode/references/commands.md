# Dev Mode commands

Every command, flag, `--json` field and exit code of the functions mode of
`serverless dev`. The prose reference is
`serverless agent docs providers/aws/cli-reference/dev`.

## Contents

- Common to every command
- `serverless dev`
- `serverless dev --dry-run`
- `dev status`
- `dev wait`
- `dev requests`
- `dev replay`
- `dev stop`
- `dev restore`
- `dev setup`
- `serverless invoke` during a session
- Keys

## Common to every command

- Run them in the service directory (in a Compose project:
  `serverless <service> dev …` from the root, or `serverless dev …` in the
  service's directory). Paths in results (`log_file`, `events_file`,
  `file`) and `next` commands work from where the command runs: from a
  Compose root they name the service and its folder, and with
  `--config sub/serverless.yml` from a parent directory the paths start with
  `sub/` and the commands carry the `--config`. `--stage`/`-s`, `--region`/`-r` and `--aws-profile`
  work on each.
- Each needs the Serverless sign-in, except `dev setup` outside a service
  directory. `dev status`, `dev wait`, `dev stop`, `dev requests` and
  `dev replay` make no AWS call of their own (no AWS credentials, no account
  or stack lookup), but still sign in and resolve the service's variables.
- `--json`, `--json=true` and `--json=1` turn JSON on; `--json=false` and
  `--json=0` leave it off. With it, stdout holds exactly one JSON result.
- Durations: `100` or `100s` (seconds), `5m`, `1h`.

## `serverless dev`

```bash
serverless dev --detach --json --stage <your stage> [--function <f>]... [--idle-timeout 60m]
```

| Option                      | Effect                                                                                                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--detach`                  | Start in the background; return once ready (at most 100 s). `dev stop` ends it.                                                                                                 |
| `--json`                    | With `--detach` or `--dry-run` only.                                                                                                                                            |
| `--function`, `-f`          | Attach only these functions (repeatable); the others run the deployed code.                                                                                                     |
| `--skip-function`           | Keep these functions on the deployed code (repeatable).                                                                                                                         |
| `--take-over`               | Also attach functions another live session holds (a teammate's, or another of yours).                                                                                           |
| `--idle-timeout <duration>` | With `--detach` only: stop after this long without activity (default `60m`; `0` turns it off; other values under `1m` refused).                                                 |
| `--approve`                 | Show the changes and ask first. Needs a person at a terminal, else `approval_needs_terminal` and nothing changes.                                                               |
| `--on-exit keep\|remove`    | On stop, `keep` leaves the functions in Dev Mode (exit 0, or 3 when some function could not be attached); `remove` restores them, then removes the service (with confirmation). |
| `--dry-run`                 | Run the read-only checks and show the plan; change nothing.                                                                                                                     |
| `--detailed`                | Print each invocation's event and response (a person's terminal).                                                                                                               |
| `--no-keys`                 | Turn off the single-key commands in a terminal.                                                                                                                                 |

Refused with `invalid_option_combination` (exit 1): `--json` without
`--detach` or `--dry-run`; `--detach` with `--dry-run`; `--detach` with
`--on-exit remove`; `--idle-timeout` without `--detach`; `--detach`, `--dry-run` or `--idle-timeout` with
`--mode agents` or `--mode sandboxes`. A stage that was never deployed is
deployed first.

Activity that keeps a detached session from stopping itself: invocations,
reloads, `dev status`, `dev requests`, `dev replay` and an open `dev wait`
(except `--for ended`).

`--detach --json` result fields: `cursor`, `session_id`, `pid`, `state`
(`on`), `log_file` (`.serverless/dev/session.log`), `events_file`,
`functions` (`name`, `mode`, `reason`, `why`, `notes`), and
`"already_running": true` when the same stage, region and selection was
already running here. That session keeps its own settings: another
`--idle-timeout`, or `--take-over` or `--on-exit`, gets a `message` saying so;
to use them, `dev stop` it and start again.

| Exit  | When                                                                                                                                                            |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0`   | Ready, or already running.                                                                                                                                      |
| `1`   | The start failed (its own `reason`), `session_running`, `detach_failed` (read `log_file`), an action a person must take.                                        |
| `3`   | The start ended with `restore_incomplete` or `attach_incomplete`.                                                                                               |
| `124` | Still starting after 100 s (a first deploy, a slow network): it goes on in the background. `next`: `serverless dev wait --for ready`, or `serverless dev stop`. |

## `serverless dev --dry-run`

`serverless dev --dry-run --json` changes nothing. Fields: `plan`
(`changes` per function with `fields`: `layers`, `environment`,
`exec_wrapper`; `account_setup`; `first_deploy`; `null` when it cannot be
built), `functions` (as above) and `preflight` (each with `check`, `ok`, and
where it applies `reason`, `message`, `host`, `user_action_required`). Checks:
`stage`, `signin`, `session`, `aws_identity`, `iot_endpoint`, `iot_connect`,
`broker_role`, `stack`, `functions`, `layers`. `broker_missing` and
`layers_missing` are informational here: the first session creates them. On a
stage never deployed, it covers the deployment only. Exit 0 when every check
passes, else 1.

## `dev status`

```bash
serverless dev status --json
```

Fields: `state` (`starting`, `on`, `stopping`, `off`, `failed`),
`session_id`, `pid`, `owner`, `service`, `stage`, `region`, `detached`,
`started_at`, `ready_at`, `idle_timeout_s`, `invocations` (`total`,
`errors`), `last_invocation` (`request_id`, `function`, `outcome`, `ts`),
`functions` (`name`, `mode`, `reason`, `why`, `notes`), `endpoints`
(`method`, `url`, `function`; HTTP endpoints first, then each MCP server with
`mcp: true` and `method` `ANY`) and `cursor` (the last record's). No session:
`off` (or `failed` after a failed start), exit 0, with
`serverless dev restore --stage <stage> --region <region>` in `next` when the
last session ended without its final record or without restoring every
function (the message says how many), as `dev stop` and `dev wait` give it.
A restore in `next` names the
session's stage and region, and `--aws-profile` when the session was started
with one: plain `serverless dev restore` restores the default stage with the
default credentials. When the session's start is no longer in its event log,
`next` has the plain command: add the stage and region yourself.

## `dev wait`

```bash
serverless dev wait --for ready|invocation|reload|ended [--function <f>]... [--after <cursor>] [--timeout 100s] --json
```

- `ready`: returns at once when the session is on; after a failed start,
  the `session.failed` record with status `error`.
- `invocation`, `reload`: the next `invocation.end` / `reload.end` after now,
  or after `--after`. With `--after`, a match already in the log is returned
  even if the session ended since.
- `ended`: the terminal record (`session.failed`, else `session.ended`),
  with that end's exit code: 0 clean, 1 error, 3 `restore_incomplete` or
  `attach_incomplete`. With no session, the last session's end if the log
  has one, else `session_not_running`.
- `--function` (repeatable) narrows `invocation` and `reload`; a name not in
  `serverless.yml` is refused at once (exit 1).
- `--timeout`: default `100s`, at most `1h`.

Fields: `event` (the matched record) and `cursor` (its cursor). Exit 0 a
match; 1 `session_ended` (with the `session.ended` record as `event`),
`session_not_running`, `cursor_from_other_session`, `invalid_cursor`,
`invalid_option_value` and other errors; 3 when the session's process is
gone without its end record (`restore_incomplete`, next step
`serverless dev restore --stage <stage> --region <region>`); 124 `timeout`, whose `next` keeps waiting from the
last record seen.

## `dev requests`

```bash
serverless dev requests [--function <f>]... [--limit 20] --json
```

Reads `.serverless/dev/invocations`, so it also works after the session
ended. It lists every stage run from the service directory. Fields:
`requests`, newest first, each with `ts`, `function`, `stage` (`null` for a
file recorded before files named it), `request_id`, `outcome`,
`duration_ms`, `status_code`, `file`. `--limit`:
1–500 (default 20). Exit 0, or 1 for a bad `--limit`
(`invalid_option_value`).

## `dev replay`

```bash
serverless dev replay <requestId> --json
```

Runs a recorded invocation again on this machine through the running
session: same function and event, a new request id and deadline, the
latest role credentials the session holds for the function. No caller gets
the result; its effects are real. The id is the full request id or a unique
prefix of at least 8 characters. The session keeps the raw event of the last
50 invocations per function; any other replays from its redacted file
(`"note": "replayed_redacted_event"`), so credentials such as `Authorization`
arrive as `[redacted]`.

Fields: `request_id` (the replay's), `replay_of`, `function`, `outcome`,
`status_code`, `duration_ms`, `response`, `response_omitted` (`true` over
64 KiB; the file has it), `error`, `file`, `note`
(`replayed_redacted_event`). One replay runs at a time. Exit 0 when it ran,
whatever its outcome; 1 at once for `invocation_not_found`,
`ambiguous_request_id`, `stage_mismatch` (recorded on another stage: run its three `next` steps
in order, stop, start that stage with `--detach`, replay; the replay needs
one real invocation of the function on that stage first, which has real
effects, so ask before invoking),
`invalid_option_value` (no id),
`session_not_running`, or a replay the session refused (starting, stopping,
function not in Dev Mode, no credentials of its role yet, all 24 handler
processes busy); 124 when still
running after the function's timeout plus 30 s.

## `dev stop`

```bash
serverless dev stop [--keep] [--timeout 7m] --json
```

Reaches the session through its control endpoint (no signal), waits for its
end and reports the restore (`--timeout` default `7m`). Fields: `restore`
(`restored`, `unchanged`, `skipped`, `missing`, `failed`), `kept`,
`exit_code` (`null` when the stop failed or timed out), `cursor`. `--keep`
leaves the functions in Dev Mode.

| Exit  | When                                                                                                                                                                  |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0`   | Restored (or kept with `--keep`), or no session here.                                                                                                                 |
| `1`   | The session ended with an error (its reason), or `stop_failed`.                                                                                                       |
| `3`   | `restore_incomplete` (next step `serverless dev restore --stage <stage> --region <region>`), also when the process is gone; `attach_incomplete` after a full restore. |
| `124` | Still restoring after `--timeout`; or a session still starting did not open its endpoint in time.                                                                     |

A session still starting gets up to 30 s (or `--timeout`) to open its
control endpoint; then, on Linux and macOS, SIGTERM, handled like Ctrl+C. A
session file without an endpoint counts as starting only for one minute after
its start; any other is never signalled (`restore_incomplete`, exit 3). A
running session that could not open its endpoint (`control_unavailable`) gets
`stop_failed` (exit 1): ask the person to press Ctrl+C in its terminal. A
`--detach` session never runs without its endpoint: it ends as `detach_failed`.

## `dev restore`

```bash
serverless dev restore [--stage <s>] [--region <r>] [--function <f>]... --json
```

Removes Dev Mode's configuration from the stage's functions (a killed
session, or `--on-exit keep`). It restores the stage `--stage` names, else
the service's default stage: pass the session's stage and region, as the
restore in a `next` step does. Fields: `restore` (`restored`, `unchanged`,
`skipped`, `missing`, `failed`, counted as `dev stop` counts them) and
`exit_code` (this command's own exit code, never `null`). No `cursor`: it
works outside any event log. The next
`serverless dev`, `deploy`, `remove`, `deploy function` or
`rollback --timestamp` restores them too.

| Exit | When                                                                                                                                                                                                                                                                 |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0`  | Every function with Dev Mode configuration restored, or none had any.                                                                                                                                                                                                |
| `1`  | `session_running` (a live session of this directory runs on the same stage and region: stop that one), `permission_denied` (no `lambda:GetFunction`), `credentials_expired`, and the CLI's other errors (`error`, such as an unknown `--function`); nothing changed. |
| `3`  | `restore_incomplete`: the message names each function not restored and why; `next` restores only those (one `--function` each). Access denied in the message (no `lambda:UpdateFunctionConfiguration`) needs the person to grant it before `next` can work.          |

## `dev setup`

```bash
serverless dev setup [--permissions-boundary <arn>] [--path /serverless/] [--region <r>] [--aws-profile <p>]
```

For an administrator, once per account and region, where developers cannot
create IAM roles: creates the role `serverless-dev-broker-<region>`. Outside
a service directory it needs no sign-in, takes the region from `--region`,
`AWS_REGION`, `AWS_DEFAULT_REGION` or the profile (else `us-east-1`) and
prints it first (`Region eu-west-1, from --region.`); without credentials it
fails with `DEV_SETUP_AWS_CREDENTIALS_MISSING`. Inside a service it uses the
service's region and credentials.

## `serverless invoke` during a session

When the session in this directory ran the call, `invoke` adds
`Dev Mode: handled by your working copy · request <id> · <file>` on stderr
(with `--log`, also the log lines from this machine); stdout and the exit
code are unchanged. It waits up to 2 s for the file and adds nothing when the
deployed code answered or the session was stopping.

## Keys

For a person at a terminal only (off in CI, under an AI agent, and with
`--no-keys`): `h`/`?` keys, `r` rebuild, `v` show events, `s` status, `q`
restore and exit (like the first Ctrl+C; a second Ctrl+C exits at once,
exit 3 if it left functions attached).
