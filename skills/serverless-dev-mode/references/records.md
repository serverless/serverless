# Dev Mode records, reasons and modes

What a session writes to `.serverless/dev/`, and every code an agent meets in
its results. All formats carry `"v": 1`: fields may be added in later
versions, none is renamed or removed, and readers ignore fields they do not
know.

## Contents

- Files
- `session.json`
- Event records (`session.ndjson`)
- Cursors
- Invocation files
- Redaction
- Result reasons
- Function modes, reasons, notes and lost states

## Files

| File                                                      | Content                                                                                    |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `session.json`                                            | The running session. Mode 0600; removed after the session ends.                            |
| `control.token`                                           | The token of the session's local control endpoint. Mode 0600; removed with `session.json`. |
| `session.lock`                                            | Held for a moment while `session.json` is checked and changed; never read it.              |
| `session.ndjson`                                          | The event records of the current or last session.                                          |
| `session.<session_id>.ndjson`                             | An earlier session's records; the last five are kept.                                      |
| `session.log`                                             | The output of a session started with `--detach`. Mode 0600.                                |
| `invocations/<function>/<unix seconds>-<request id>.json` | One file per invocation; the last 500 per function and 200 MB in all are kept.             |

Characters outside `A-Z a-z 0-9 . _ -` in a function key become `_` in the
path. Keep `.serverless/` out of version control.

## `session.json`

Fields: `v`, `session_id`, `pid`, `state` (`starting`, `on`, `stopping`),
`service`, `stage`, `region`, `aws_profile` (only when started with
`--aws-profile`), `owner`, `selection` (`only`, `skip`: the
sorted `--function` and `--skip-function` names), `detached`,
`idle_timeout_s` (`null` without an idle timeout), `started_at`, `ready_at`
(`null` while starting), `cli_version`, `events_file`, `log_file`
(`"session.log"` when detached, else `null`) and `control` (`url`,
`token_file`).

- `control` is `null` while `state` is `starting`, until the control
  endpoint listens: a file whose `pid` is alive is a live session still
  starting, for at most one minute after `started_at`. Past that, or in any
  other state, a file without `control` is stale.
- `control_unavailable: true`: a session in a terminal could not open its control
  endpoint, so no command reaches it. While its `pid` is alive, a new start
  refuses with `session_running`; only Ctrl+C in its terminal stops it. A
  `--detach` session never runs without its endpoint (`detach_failed`).
- Two starts are the same session when `stage`, `region` and `selection` are
  equal.
- A session whose control endpoint does not answer within 2 s, asked twice
  250 ms apart, counts as not running.

Prefer `serverless dev status --json` to reading this file.

## Event records (`session.ndjson`)

One JSON object per line, at most 4,096 bytes, each with `v`, `seq`, `ts`,
`session_id`, `type` and the type's fields. A string that would make a record
too long is cut and the record gets `"truncated": true`. No handler log line
and no event or response body is written here. Fields that do not apply are
left out.

| `type`                      | Fields                                                                                                           |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `session.starting`          | `service`, `stage`, `region`, `aws_profile` (with `--aws-profile`), `owner`, `pid`, `detached`, `selection`      |
| `function.mode`             | `function`, `mode`, `reason`, `why`, `notes`: one per function once attached                                     |
| `session.ready`             | `functions` (`dev`, `deployed`, `skipped` counts), `ready_ms`, `attach_ms`                                       |
| `session.failed`            | `reason`, `message`, `exit_code`: the start ended before the session was ready                                   |
| `invocation.start`          | `function`, `request_id`, `label`, `new_worker`, `source` (`caller`, `replay`)                                   |
| `invocation.end`            | `function`, `request_id`, `source`, `outcome`, `status_code`, `error_type`, `duration_ms`, `file`                |
| `invocation.passed_through` | `function`, `count`, `reason` (`late`, `paced`, `refused`, `clock_off`, `offline`, `worker_limit`), `at_least`   |
| `reload.start`              | `files` (a count), `functions`                                                                                   |
| `reload.end`                | `ok`, `functions`, `ms`, `error` (one line)                                                                      |
| `connection.lost`           | `reason`                                                                                                         |
| `connection.restored`       | `offline_ms`                                                                                                     |
| `credentials.expired`       | —                                                                                                                |
| `credentials.refreshed`     | —                                                                                                                |
| `function.lost`             | `function`, `state` (below)                                                                                      |
| `session.stopping`          | `trigger` (`signal`, `stop_command`, `idle_timeout`, `hotkey`, `error`), `signal`                                |
| `session.ended`             | `exit_code`, `restore` (`restored`, `unchanged`, `skipped`, `missing`, `failed`), `kept`: always the last record |

- `outcome`: `ok`, `error`, `timeout`, `worker_exited`. `file` is `null` when
  the invocation file could not be written.
- `label` names the event: `aws:apigateway:v2:post:/orders` (HTTP API),
  `aws:apigateway:v1:get:/orders` (REST API), `aws:alb:get:/orders`
  (Application Load Balancer), `aws:lambda-url:post:/`,
  `aws:sqs:<queue>:<message id>`, `aws:s3:<bucket>:<event name>`,
  `aws:eventbridge:<source>:<detail-type>`, `aws:schedule:<rule>`,
  `mcp tools/call <tool>`, `direct invoke`, and others in that style.
- `invocation.passed_through` counts invocations the deployed code answered:
  `late` (reached this machine too late), `paced` (above about 20 per second,
  or AWS IoT Core rate limits), `refused` (AWS IoT Core refused the
  acceptance), `clock_off` (this machine's clock moved), `worker_limit` (all
  24 handler processes on this machine were busy), `offline` (the session
  could not be reached). `offline` comes from the session itself (an
  exact count) and from the functions once the session is back
  (`"at_least": true`).
- A session that ends before it was ready without failing (a declined
  `--approve`, a stop during the start) writes `session.ended` with no
  `session.ready` or `session.failed`.

## Cursors

A cursor is `<session_id>:<seq>`. `--after <cursor>` matches records after
that one, including records written before the command started. A
`dev wait` result's `cursor` is the matched record's; `dev status` and
`dev stop` carry the last record's. Use cursors, never record counts: a
record that could not be written still takes its `seq`.

## Invocation files

An HTTP API request (fields and values shortened):

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
  "logs": { "lines": ["<a line the handler logged>"], "truncated": false },
  "event": {
    "routeKey": "POST /node",
    "rawQueryString": "view=summary&page=2",
    "cookies": ["[redacted]"],
    "headers": {
      "authorization": "[redacted]",
      "content-type": "application/json",
      "x-api-key": "[redacted]"
    },
    "body": "{\"item\":\"book\",\"quantity\":2}",
    "isBase64Encoded": false
  },
  "event_encoding": "json",
  "event_truncated": false,
  "event_bytes": 1047,
  "response": { "<field>": "<value>" },
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

- `event` holds parsed JSON when the event is JSON, else its bytes as
  `{ "base64": "…" }`; `response` holds parsed JSON, else text, else
  `{ "base64": "…" }`. `event_encoding` is `base64` when `event` is that form
  (an event that was not JSON) and `json` otherwise; replay decodes base64
  only when it says so (a file without it is JSON). A body over 1 MB is cut (`event_truncated`,
  `response_truncated`); `event_bytes` and `response_bytes` keep the full
  size (a stream's includes its HTTP prelude).
- `outcome`: `ok`, `error`, `timeout`, `worker_exited`. `status_code` is the
  HTTP status when the response sets one. `error` holds `type`, `message`,
  `stack`. `caller_received` says what the caller got for an error, for
  example `500 Internal Server Error (API Gateway HTTP API)`, or for SQS that
  the message goes back to the queue.
- `logs.lines` keeps at most 1,000 lines or 256 KiB, written before the
  invocation ended.
- A replay's file has `replay_of` (the original request id) and
  `"source": "replay"`.

## Redaction

Replaced with `[redacted]` and listed in `redacted`: the headers
`Authorization`, `Proxy-Authorization`, `Cookie`, `Set-Cookie`, `X-Api-Key`,
`X-Amz-Security-Token`, and the `X-Amzn-Oidc-Accesstoken`, `X-Amzn-Oidc-Data`
and `X-Amzn-Oidc-Identity` headers of an Application Load Balancer with OIDC
or Amazon Cognito authentication (any case), HTTP API cookies, a REST API event's
API key in its request context, a TOKEN authorizer's token and an HTTP API
Lambda authorizer's identity source. Query strings, bodies and handler log
lines are kept as they are. The function's environment, its credentials and
the session key are never written.

## Result reasons

`action_required` reasons carry `"user_action_required": true`: show
`message` and `next` to the person and do not run `next`.

| Reason                       | Status            | What to do                                                                                                                                                                                                                                          |
| ---------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `signin_required`            | `action_required` | Ask the person to sign in (rule 1 of the skill).                                                                                                                                                                                                    |
| `aws_credentials_missing`    | `action_required` | Ask the person to configure AWS credentials (or `--aws-profile`).                                                                                                                                                                                   |
| `credentials_expired`        | `action_required` | Ask the person to sign in again; `message` names the source and the command (for example `serverless login aws sso` in an interactive terminal).                                                                                                    |
| `permission_denied`          | `action_required` | `message` names the permission; ask for it to be granted.                                                                                                                                                                                           |
| `network_blocked`            | `action_required` | This machine cannot reach AWS or AWS IoT Core; ask for the host to be allowed. When `message` says the AWS IoT Core endpoint cannot be resolved yet, run the command again in a few minutes instead (see [troubleshooting.md](troubleshooting.md)). |
| `broker_missing`             | `action_required` | The IAM role is missing. In `--dry-run`, informational.                                                                                                                                                                                             |
| `approval_needs_terminal`    | `action_required` | `--approve` without a terminal; nothing changed. Ask the person, or drop `--approve`.                                                                                                                                                               |
| `session_running`            | `error`           | Another session runs here. Use its stage and functions, or `serverless dev stop` it.                                                                                                                                                                |
| `session_not_running`        | `error`           | No session here. Start one with `serverless dev --detach --json --stage <your stage>`.                                                                                                                                                              |
| `session_ended`              | `error`           | The session ended before what `dev wait` waited for; `event` is its `session.ended` record.                                                                                                                                                         |
| `cursor_from_other_session`  | `error`           | The cursor is another session's: a new one started, or another service's. Take a cursor from `serverless dev status --json`.                                                                                                                        |
| `invalid_cursor`             | `error`           | The `--after` value is not a cursor.                                                                                                                                                                                                                |
| `invalid_option_value`       | `error`           | A bad duration, `--for` or `--limit`, or `dev replay` without an id. Fix the value.                                                                                                                                                                 |
| `invalid_option_combination` | `error`           | Options that do not go together ([commands.md](commands.md)). Drop one.                                                                                                                                                                             |
| `timeout`                    | `timeout`         | Out of time; the session may still be running. Run `next`.                                                                                                                                                                                          |
| `invocation_not_found`       | `error`           | No recorded invocation has that id. Pick one from `serverless dev requests --json`.                                                                                                                                                                 |
| `ambiguous_request_id`       | `error`           | The prefix matches several requests or is under 8 characters. Pass more of the id.                                                                                                                                                                  |
| `stage_mismatch`             | `error`           | The invocation ran on another stage than the running session's. Run the three `next` steps in order: stop, start that stage, replay; the replay needs one real invocation of the function on that stage first (ask before invoking).                |
| `restore_incomplete`         | `error`, exit 3   | A function was not restored, or the session ended without its end record. Run the restore in `next`.                                                                                                                                                |
| `attach_incomplete`          | `error`, exit 3   | Some function could not be attached. Read its `why`.                                                                                                                                                                                                |
| `stop_failed`                | `error`           | The session did not take the stop. Read `message`, then try again.                                                                                                                                                                                  |
| `detach_failed`              | `error`           | The background session ended before it was ready. Read `log_file`.                                                                                                                                                                                  |
| `control_unavailable`        | `error`           | A `--detach` session could not open its control endpoint and did not start: run it in a terminal.                                                                                                                                                   |
| `stage_protected`            | `error`           | `prod` or `production`. Use your personal stage (rule 8 of the skill).                                                                                                                                                                              |
| `region_no_broker`           | `error`           | The region has no AWS IoT Core. Use a stage in another region.                                                                                                                                                                                      |
| `layers_missing`             | `error`           | The CLI's layer files are missing: reinstall the Framework. In `--dry-run`, informational.                                                                                                                                                          |
| `nothing_to_attach`          | `error`           | No function can run in Dev Mode. Read each function's `reason`.                                                                                                                                                                                     |
| `error`                      | `error`           | Anything else, for example an unknown `--function` name. Read `message`.                                                                                                                                                                            |

`--dry-run`'s `session` check passes with reason `already_running` when a
session with the same scope runs here. `replayed_redacted_event` is a `note`
of `dev replay`, not a reason.

## Function modes, reasons, notes and lost states

Modes: `dev` (runs here), `deployed` (the deployed code answers), `skipped`
(not attached and not changed). `deployed` and `skipped` always carry a
`reason` and a `why` text.

| Reason                   | Mode                    | Meaning, and what helps                                                                                                                                                  |
| ------------------------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `not_selected`           | `deployed`              | Left out by `--function` or `--skip-function`.                                                                                                                           |
| `not_deployed`           | `skipped`               | In `serverless.yml`, not in AWS: `serverless deploy`.                                                                                                                    |
| `legacy_shim`            | `skipped`               | Set up by an earlier version of Dev Mode: one `serverless deploy`.                                                                                                       |
| `runtime_not_supported`  | `deployed`              | For example `Ruby runtime (Dev Mode support planned)`; Java and .NET likewise.                                                                                           |
| `os_only_runtime`        | `deployed`              | `OS-only runtime provided.al2023 (Dev Mode support planned)`.                                                                                                            |
| `container_image`        | `deployed`              | `container image (Dev Mode support planned)`.                                                                                                                            |
| `edge_function`          | `deployed`              | `Lambda@Edge (not supported)`.                                                                                                                                           |
| `alias_targeted`         | `deployed`              | Provisioned concurrency, SnapStart or durable function (Dev Mode support planned).                                                                                       |
| `managed_instances`      | `deployed`              | `Managed Instances (Dev Mode support planned)`.                                                                                                                          |
| `local_runtime_missing`  | `deployed`              | No usable Python or Node.js here ([runtimes.md](runtimes.md)).                                                                                                           |
| `handler_not_in_service` | `deployed`              | Deployed from `package.artifact`, and its handler file is not in the service directory: it runs here only from source in the service.                                    |
| `timeout_too_short`      | `deployed`              | Timeout of 2 s or less.                                                                                                                                                  |
| `no_free_layer_slot`     | `deployed`              | Already uses 5 layers.                                                                                                                                                   |
| `custom_aws_endpoints`   | `deployed`              | Sets `AWS_USE_FIPS_ENDPOINT=true`, `AWS_ENDPOINT_URL`, `AWS_ENDPOINT_URL_STS`, `AWS_ENDPOINT_URL_IOT_DATA_PLANE` or `AWS_CA_BUNDLE`.                                     |
| `env_too_large`          | `deployed`              | Its variables plus Dev Mode's would exceed 4 KB.                                                                                                                         |
| `env_unreadable`         | `deployed`              | Variables encrypted with a KMS key you cannot decrypt (needs `kms:Decrypt`).                                                                                             |
| `reserved_variable`      | `deployed`              | The function already sets an `SLS_DEV_*` name Dev Mode or its wrapper uses: rename it.                                                                                   |
| `layer_name_taken`       | `deployed`              | A layer named `serverless-dev-x86_64` or `serverless-dev-arm64` without Dev Mode's settings, not one Dev Mode published: remove it, or publish yours under another name. |
| `owned_by_other_session` | `skipped`               | Another live session holds it: `--take-over` takes it.                                                                                                                   |
| `package_too_large`      | `deployed`              | Code and layers would exceed 250 MB unzipped.                                                                                                                            |
| `code_signing_enforced`  | `deployed`              | Code signing is enforced; the Dev Mode layer is not signed.                                                                                                              |
| `attach_rejected`        | `deployed`              | Lambda refused the update; `why` gives Lambda's reason.                                                                                                                  |
| `attach_failed`          | `deployed`              | `attach failed: <message>`; the session runs on and ends with exit 3.                                                                                                    |
| `not_attached`           | `skipped` or `deployed` | Not attached, or the session stopped while attaching.                                                                                                                    |

Notes on a `dev` function: `vpc_egress_required` (a VPC function needs a
route to AWS IoT Core, STS and S3), `reattached` (left in Dev Mode by an
earlier session of yours), `taken_over`. A restore can note
`original_wrapper_dropped` (an earlier exec wrapper's layer is gone, so the
wrapper was not put back).

`function.lost` states (the function left the session): `wrapper_replaced`
(something else set `AWS_LAMBDA_EXEC_WRAPPER`; it runs the deployed code),
`detached` (restored elsewhere), `taken_over` (another developer took it),
`taken_over_by_you` (another session of yours), `layer_missing` (it cannot
start until restored with `serverless dev restore --stage <stage> --region
<region>`), `function_deleted`, `env_unreadable`
(KMS access lost; restoring it needs that access back). The function's row
in `dev status` changes with it, the state as its `reason`: `taken_over` and
`taken_over_by_you` become `skipped`; `wrapper_replaced`, `detached` and
`function_deleted` become `deployed`; `layer_missing` and `env_unreadable`
stay `dev`.
