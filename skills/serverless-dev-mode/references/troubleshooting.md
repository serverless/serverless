# Dev Mode troubleshooting

Symptom first. A result with a `reason`: see the reason table in
[records.md](records.md). Every CLI error code with its reason is in the
reference's Errors section:
`serverless agent docs providers/aws/cli-reference/dev`.

## Contents

- Starting
- While a session runs
- Stopping and restoring
- Handlers on this machine

## Starting

### Exit 1, nothing on stdout, a sign-in error on stderr

**Cause:** not signed in to the Serverless Framework. The sign-in check runs
before Dev Mode, so there is no JSON result.

**Fix:** rule 1 of the skill.

### `permission_denied` naming an action (`iam:CreateRole`, `iot:Connect`, `lambda:UpdateFunctionConfiguration`, …)

**Cause:** the person's AWS identity lacks a Dev Mode permission. A denied
`iam:CreateRole` means they cannot create the IAM role
(`DEV_MODE_BROKER_CREATE_DENIED`).

**Fix:** show the message to the person. For the IAM role, an administrator
runs `serverless dev setup` once in the region; for anything else, the
permission is granted (the reference's Permissions section lists the full
policy: `serverless agent docs providers/aws/cli-reference/dev`).

### `DEV_MODE_IOT_CONNECT_DENIED` (reason `permission_denied` under `--json`)

**Cause:** AWS IoT Core refused this machine: the credentials expired or are
invalid, the clock is more than 5 minutes off, or the identity lacks
`iot:Connect` on client `sls-dev-*` or `iot:Subscribe`, `iot:Receive`,
`iot:Publish` on topics `sls-dev/*`. The message says which.

**Fix:** refresh the credentials and check the clock, or ask for the
permissions.

### `network_blocked` with a `host`

**Cause:** a sandboxed harness or proxy blocks outbound HTTPS. A session
needs the stage region's AWS endpoints (Lambda, STS, IAM, CloudFormation,
S3), the account's AWS IoT Core endpoint
(`<prefix>-ats.iot.<region>.amazonaws.com`), `api.serverless.com` and
`core.serverless.com`.

**Fix:** ask the person to allow the host. `serverless dev --dry-run --json`
checks the connection to AWS IoT Core (`iot_connect`) and names it.

When `message` says the AWS IoT Core endpoint cannot be resolved yet, the
account has never used AWS IoT Core in that region: AWS created the endpoint
when the session looked it up, and its host name can take a few minutes to
resolve (the session already waited 2 minutes). Run the command again in a few
minutes before asking for anything.

## While a session runs

### A function shows `deployed` or `skipped`

**Cause:** its `reason` ([records.md](records.md)), for example
`timeout_too_short`, `local_runtime_missing` or `custom_aws_endpoints`.

**Fix:** per the reason. A function whose runtime shows
`(Dev Mode support planned)` keeps running the deployed code.
`handler_not_in_service`: the function deploys from a prebuilt
`package.artifact` whose handler is not in the service directory (built
elsewhere); it runs here only once its source is in the service.

### Callers get `Runtime.DevModeDisconnected`

**Cause:** the session stopped answering after it accepted the invocation
(the CLI was killed, the machine slept, the network dropped), no result
arrived before the deadline, or the function lost its connection. The
invocation was not run again.

**Fix:** `serverless dev status --json`; start a session again if it is
off.

### A large request or result fails with `Runtime.DevModeRelayFailed`, or runs the deployed code

**Cause:** payloads that do not fit in one AWS IoT Core message (126 KiB,
Dev Mode's header included) travel through the deployment bucket,
and the session printed
`Payloads above 126 KB cannot be relayed in this session: <reason>` (an
SSE-C bucket, missing S3 permissions, or a bucket in another region).

**Fix:** per the reason; the reference's Permissions section lists the S3
permissions (`serverless agent docs providers/aws/cli-reference/dev`).

### A function in a VPC never runs here (`vpc_egress_required`)

**Cause:** it has no route to AWS IoT Core, STS and S3.

**Fix:** a NAT gateway or interface VPC endpoints for them; until then it
runs the deployed code.

### The first request of each session runs the deployed code, or every request does

**Cause:** this machine's clock is ahead of AWS's, or moved by more than a
minute during the session.

**Fix:** set the clock automatically, then start the session again.

### A line `N invocations ran the deployed code …` or `At least N invocations …`

**Cause:** a burst above about 20 per second, invocations that reached this
machine late, AWS IoT Core limits, or a time when the session could not be
reached (sleep, offline, new execution environments connecting).

**Fix:** none needed for a burst; otherwise check the network and the clock.

### A saved edit has no effect

**Cause:** the save came within the session's first scan (at most 5 s after
it is on), the build failed (the session keeps the last good build and
prints the error), or the edit was to `serverless.yml` (configuration needs
`serverless deploy`).

**Fix:** save again after `ready`; read `reload.end`'s `error`; or stop,
deploy and start again.

## Stopping and restoring

### Functions are still in Dev Mode after the session process was killed or the machine shut down

**Cause:** a session process that ends before its restore finishes (SIGKILL,
a second Ctrl+C or stop signal, a shutdown) leaves the functions it had not
restored in Dev Mode. SIGINT, SIGTERM and SIGHUP start the restore.

**Fix:** `serverless dev restore --stage <stage> --region <region> --json` with the session's stage and region, and `--aws-profile <name>` if the session was started with one (or the next
`serverless dev`, `deploy` or `remove`). Until then the functions run the
deployed code.

### `dev stop`, `dev wait` or `dev status` says to run `serverless dev restore`

**Cause:** the session's process is gone without its end record, or its
control endpoint did not answer within 2 s.

**Fix:** run the restore in `next` with `--json`; it names the session's stage and region,
and `--aws-profile` when the session had one. A plain `serverless dev restore` there means the
session's start is no longer on record: add its stage and region.

## Handlers on this machine

### A Python handler fails with `Runtime.ImportModuleError` here while the deployed code works

**Cause:** dependencies built for Lambda's Linux (for example by a Docker
build) do not import on macOS or Windows.

**Fix:** create `.venv` in the service directory and install the
requirements there for this machine.

### The handler cannot find AWS credentials in `AWS_ACCESS_KEY_ID`

**Cause:** handlers get the function's role through the credentials
endpoint, as in Lambda; key variables are unset.

**Fix:** use the AWS SDK's default credential chain.
