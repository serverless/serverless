# Troubleshooting

Match the symptom (error string, observed behavior, or CLI output) to a row
below, apply its fix, then verify against real evidence — a passing deploy,
a 200 from the endpoint, a log line, or a specific field in a
`get-microvm`/`get-microvm-image` response. Don't declare a fix worked
without that evidence.

## Deploy-time

| Symptom | Cause | Fix |
|---|---|---|
| `unrecognized property 'memory'` (or `subnets`, `securityGroups`, …) at validation | The `sandboxes` schema rejects unknown keys; its property names differ from the `functions` block | Use `minimumMemory`, `vpc.subnetIds`, `vpc.securityGroupIds` — full surface in `references/config.md` |
| `Availability zone use1-az3 is not available for compute type MicroVm` (`InvalidParameterValueException` at connector creation) | That AZ doesn't support MicroVMs; AWS publishes no list | Use subnets in different AZs; match by AZ *ID* (`use1-az3`), not letter (`us-east-1c`) — letters map differently per account |
| `NotStabilized` on the MicrovmImage during deploy (esp. `hooks` + `vpc` together) | Image-build window timeout, often transient | Run `aws lambda-microvms list-microvm-image-builds --image-identifier <image-arn> --image-version <version> --query 'items[].[architecture,buildState,stateReason]' --output table` — `stateReason` names the failure: `CONTAINER_BUILD_FAILED` (reproduce with a local `docker build`; build logs are in `/aws/lambda-microvms/<image-name>`), `DISK_STORAGE_FULL` (trim image layers), `INTERNAL_PLATFORM_ERROR` (retry). If `stateReason` is empty, it's the transient hooks+VPC timeout — retry the deploy and confirm the `ready` hook answers 200 quickly on the hooks port |
| Deploy fails: log group already exists | A log group named `/aws/lambda-microvms/<image-name>` exists outside the stack | Delete or rename that log group |

## Runtime

| Symptom | Cause | Fix |
|---|---|---|
| Instance goes TERMINATED seconds after launch | `run` hook returned non-2xx, or the container's main process exited | `aws lambda-microvms get-microvm` → `stateReason`; check container logs; ack the run hook with 200 fast |
| Instance suspends while "busy" | Idle counts inbound endpoint traffic only — outbound work doesn't reset it | Exit the process when done, or raise `maxIdleDurationSeconds` / rely on `maximumDurationInSeconds` |
| `AccessDenied` from AWS calls inside the sandbox | Execution role lacks the permission | Add a least-privilege statement to `sandboxes.<name>.iam.executionRole.statements`; reproduce pre-deploy with dev-mode IAM emulation |
| `AccessDeniedException` naming `PassNetworkConnector` or `PassRole` at RunMicrovm | Caller IAM missing the pass grant for the named resource | Grant `lambda:PassNetworkConnector` per connector ARN / `iam:PassRole` for the execution role |
| 403 from the instance endpoint | Missing/expired token, or port outside the token's `allowedPorts` | Mint a fresh token with the right port scope; send it in `X-aws-proxy-auth` |
| 502 from the instance endpoint | App not listening, crashed, resume failed (suspended + `autoResumeEnabled: false`), or an auto-resume that exhausted its retries. A 502 in the first seconds after launch can also be normal — instance state is eventually consistent while the snapshot restores | If it's the first few seconds after launch, retry with backoff rather than polling `get-microvm`. Otherwise check container logs / instance state; resume or relaunch |
| 429 from the instance endpoint | Per-instance RPS/connection cap | Larger `minimumMemory` (caps scale with size) or spread across instances |
| Every instance has the same ID / UUID / token | The value was generated at image-build time and is captured in the shared snapshot | Generate per-instance state in the `run` hook or per-call from a CSPRNG — see `references/platform.md` (Snapshot uniqueness) |
| A suspended instance doesn't auto-resume on traffic | `autoResumeEnabled` wasn't set at launch, the instance already TERMINATED (auto-resume never revives a terminated instance), or a slow `resume` hook exceeded its timeout | Check `get-microvm` state + `stateReason`; set `autoResumeEnabled: true`; give `resume` an explicit timeout |

## Logs

| Symptom | Cause | Fix |
|---|---|---|
| `serverless logs --sandbox` prints nothing | Default window is the last 10 minutes | `--startTime 30m` |

## Last resort: shell into the instance

When logs aren't enough to explain the behavior, launch the instance with
the `SHELL_INGRESS` connector and use `create-microvm-shell-auth-token` to
get an interactive shell inside it — see `references/commands.md` (Shell
access).

See `references/config.md` for the full property surface, `references/dev-mode.md`
for the local dev loop and IAM emulation, and `references/platform.md` for the
instance lifecycle state machine.
