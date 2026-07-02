---
name: serverless-sandboxes
description: >-
  Build, run, and operate isolated or ephemeral compute on AWS with the
  Serverless Framework `sandboxes` feature (AWS Lambda MicroVMs). Use whenever
  the user wants to execute untrusted or AI-generated code, run per-session,
  per-agent, or per-tenant isolated workloads, build a code-execution backend,
  or mentions Firecracker MicroVMs, the `sandboxes` block in serverless.yml,
  `serverless dev --sandbox`, `invoke --sandbox`, `logs --sandbox`, RunMicrovm,
  or AWS Lambda MicroVMs. Trigger even when the user names neither "Serverless
  Framework" nor "sandbox" but describes an isolated AWS execution environment.
---

# Serverless Framework Sandboxes (AWS Lambda MicroVMs)

A sandbox has two halves: an **image** and its **instances**. The image is
built once from a build context you upload — a local directory containing a
Dockerfile, or a pre-built `s3://` zip; the build happens in the cloud and
produces a Firecracker snapshot. Every
instance then boots — or resumes — from that same snapshot. Because all
instances share one snapshot, anything generated at build time (installed
packages, baked-in files, warmed caches) is common to every instance. Route
per-instance needs accordingly: data (session IDs, tenant IDs) arrives via
the `run` hook payload; secrets are fetched at runtime through the execution
role, never baked into the image; randomness is freshly generated after
launch (in the `run` hook, or per-call from a CSPRNG), not carried over from
build time. Instances are not reached directly — they sit behind an authenticated,
proxied HTTPS endpoint that the framework prints for you. Billing follows
state: you pay compute while an instance is RUNNING, and only snapshot-storage
rates while it is SUSPENDED.

## The loop

Before touching config, define a concrete success signal: an HTTP response
through the endpoint, a specific `invoke --sandbox` result, a specific log
line. "The YAML looks right" is not a success signal.

```
success signal → scaffold → dev inner loop → deploy → verify → clean up + report evidence
```

**Scaffold.** Start from a known-good example instead of synthesizing config
from scratch — adapting a working example is far more reliable than guessing
property shapes. The examples gallery is at
`https://github.com/serverless/examples/tree/v4/sandboxes` and has three
starting points: `minimal/` (the smallest possible config), `complete/` (a
full property showcase covering every option), and `self-hosted-webhook/`
(the control-plane pattern for launching MicroVMs from your own code). Copy
the one closest to your target and edit from there.

**Dev inner loop.** Run `serverless dev --sandbox <name>` piped to a
background process — do not run it attached and blocking. Watch its output
for `MicroVMs API ready — Ctrl-C to stop`; once that line appears, point your
AWS SDK or CLI calls at the endpoint it prints. Source edits after that are
picked up automatically and rebuild without restarting the command.

**Deploy.** A deploy triggers a real image build in AWS — it takes minutes,
not seconds. Let it run. The in-cloud build continues even if you kill the
CLI — retrying can't speed it up and may collide with the in-progress stack
update. Do not kill a slow-looking deploy and do not retry it out of
impatience.

**Verify, clean up, report.** Confirm the success signal you defined at the
start, then tear down scratch deployments and report the evidence you
gathered — not a description of the config you wrote.

## Rules

**Evidence, not vibes.** Never declare a sandbox "working" from reading the
YAML. Only trust an observed HTTP response, invoke result, or log line.

**Don't guess property names by analogy with `functions`.** The `sandboxes`
schema is its own shape and rejects unknown keys outright — a property that
exists on `functions` will not silently work here. Check
`references/config.md` before adding or renaming any key.

**Idle is not the same as CPU-idle.** The idle timer only resets on inbound
traffic to the endpoint; a process that is busy computing but receiving no
requests still gets suspended. Conversely, a worker that only makes outbound
calls and never listens for inbound traffic won't be kept alive by activity —
it relies on its own process exit to terminate immediately, or on
`maximumDurationInSeconds` as a hard cap.

**Rebuilds follow the artifact.** Changing the uploaded zip or Dockerfile
content triggers a new image build; deploying with no artifact change is
skipped as a no-op.

**Auth failures are not retry loops.** If a command fails on framework
authentication, propose that the user run `serverless login` interactively.
If it fails on AWS credentials, propose `serverless login aws` or
`serverless login aws sso`. Never loop retrying a failed auth call yourself.

**Cost discipline.** Suspended snapshots and old image versions still bill
storage even when nothing is running. Run `serverless remove` on scratch or
throwaway deployments once you're done verifying.

## Sandboxes or functions?

Use plain `functions` for request/response event handling — synchronous
invocations that take an event and return a response. Reach for `sandboxes`
when the workload is a long-lived, stateful session; runs arbitrary or
untrusted processes that need real VM-level isolation; or needs to hold a
WebSocket or SSE connection open rather than complete in one request/response
cycle.

## References

- `references/config.md` — read when writing or changing the `sandboxes`
  block in `serverless.yml`.
- `references/dev-mode.md` — read when doing local development or driving
  the sandbox emulator.
- `references/commands.md` — read for any CLI operation against sandboxes.
- `references/platform.md` — read for lifecycle, idle policy, endpoint and
  auth behavior, quotas, or pricing questions.
- `references/control-plane.md` — read when launching MicroVMs from your own
  code rather than the CLI.
- `references/troubleshooting.md` — read on any failure.
