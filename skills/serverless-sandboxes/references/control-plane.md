# Launching MicroVMs from your own code

This page covers the **control-plane pattern**: your own code (a Lambda, a
container, a CI job) reacting to an event by launching a MicroVM instance
directly against the AWS SDK, rather than through the framework CLI.

## When to use this vs. `invoke --sandbox`

`serverless invoke --sandbox <name>` is a one-off request/response call: it
launches a fresh instance, sends one HTTP request, waits for the response,
and terminates the instance — good for smoke-testing or synchronous
one-shot work (see `references/commands.md`).

Reach for the control-plane pattern instead when you need **one isolated
instance per event, session, tenant, or job**, launched from code you own:
a webhook handler that spins up a dedicated worker per incoming session, a
queue consumer that isolates each message in its own VM, a CI step that
launches one sandbox per build. The generic shape is:

```
event → launcher (your code) → RunMicrovm → per-instance worker MicroVM
```

The launcher is a normal piece of compute (typically a small Lambda) that
holds no state about the instances it launches beyond what it needs to call
`RunMicrovm`. It reads the target image and role from the sandbox's stack
outputs (see `references/commands.md` → `serverless info --json`), and
passes anything instance-specific through `runHookPayload`.

## Launcher call shape

The launcher uses the JS SDK's `@aws-sdk/client-lambda-microvms` package,
`RunMicrovmCommand`:

```js
import {
  LambdaMicrovmsClient,
  RunMicrovmCommand,
} from '@aws-sdk/client-lambda-microvms'

const microvms = new LambdaMicrovmsClient({ region })

const r = await microvms.send(
  new RunMicrovmCommand({
    imageIdentifier, // <Name>ImageIdentifier stack output
    executionRoleArn, // <Name>ExecutionRoleArn stack output
    runHookPayload: JSON.stringify(perInstanceData), // ≤16 KB, see below
    maximumDurationInSeconds, // hard ceiling, 1–28,800
    idlePolicy: {
      maxIdleDurationSeconds,
      suspendedDurationSeconds,
      autoResumeEnabled,
    },
    ingressNetworkConnectors: [ingressConnectorArn],
    egressNetworkConnectors: [egressConnectorArn],
    clientToken, // idempotency — see below
  }),
)
// r.microvmId — the launched instance's identifier
```

Field by field:

- **`imageIdentifier`** — the image ARN. Read it from the sandbox's
  `<Name>ImageIdentifier` stack output rather than hard-coding it; it
  changes on every image rebuild.
- **`executionRoleArn`** — the IAM role the instance runs as. Read it from
  the `<Name>ExecutionRoleArn` stack output.
- **`idlePolicy`** — all three fields (`maxIdleDurationSeconds`,
  `suspendedDurationSeconds`, `autoResumeEnabled`) — same contract as the
  sandbox-level idle policy. See `references/platform.md` for the full
  state machine; for a launcher-called instance, note that idle is driven
  entirely by inbound traffic at the instance's endpoint, not by whatever
  the worker is doing internally.
- **`maximumDurationInSeconds`** — hard ceiling on total `RUNNING` +
  `SUSPENDED` time, independent of the idle policy. Set it to bound a
  worker that might otherwise run forever on a stuck job.
- **`ingressNetworkConnectors`** / **`egressNetworkConnectors`** — arrays of
  managed connector ARNs, of the form
  `arn:aws:lambda:<region>:aws:network-connector:aws-network-connector:<NAME>`
  (e.g. `HTTP_INGRESS`, `INTERNET_EGRESS`). Attach only what the worker
  needs — an HTTP-only ingress connector is tighter than an all-ports one.
- **`runHookPayload`** — a JSON string, capped at 16 KB, and it is **the
  only per-instance data channel**. Baked-in `environment` variables (see
  `references/config.md`) are fixed at image build time and identical
  across every instance of that image version — there is no per-launch
  environment override. Anything that must differ instance-to-instance (a
  session ID, a tenant identifier, a one-time token) has to travel through
  this payload and be read out of the `run` hook's request body on the
  worker side. See `references/platform.md` for the hooks contract in
  full.
- **`clientToken`** — supply one. It is the idempotency key for the launch
  call: without it, a duplicate delivery of the triggering event (a retried
  webhook, a re-delivered queue message) calls `RunMicrovm` twice and
  launches two VMs for what should be one logical event. Derive it
  deterministically from the event (e.g. the session or message ID) so
  retries collapse onto the same launch.

## Caller IAM

The principal calling `RunMicrovm` (the launcher's execution role) needs:

- **`lambda:RunMicroVm`** (note the capitalization — the IAM action is
  `RunMicroVm`, not `RunMicrovm`, even though the API operation and SDK
  command are `RunMicrovm`) — plus `Get`/`List`/`Suspend`/`Resume`/`Terminate`
  actions on the equivalent resources if the launcher also manages
  instances after launch.
- **`iam:PassRole`** on the execution role passed as `executionRoleArn`.
- **`lambda:PassNetworkConnector`** on **each** connector ARN passed in
  `ingressNetworkConnectors`/`egressNetworkConnectors` — this is a
  per-connector grant, not implied by `RunMicroVm`. A missing grant surfaces
  as an `AccessDeniedException` naming the specific action and connector
  ARN it was denied on; add that exact ARN to the `PassNetworkConnector`
  resource list.

Minimal IAM statement shape:

```yaml
- Effect: Allow
  Action: lambda:RunMicroVm
  Resource: '*'
- Effect: Allow
  Action: iam:PassRole
  Resource: <executionRoleArn>
- Effect: Allow
  Action: lambda:PassNetworkConnector
  Resource:
    - arn:aws:lambda:<region>:aws:network-connector:aws-network-connector:HTTP_INGRESS
    - arn:aws:lambda:<region>:aws:network-connector:aws-network-connector:INTERNET_EGRESS
```

## Worker pattern

The MicroVM instance launched by `RunMicrovm` runs your worker artifact.
For a per-event, per-session pattern:

1. Implement the `run` hook. The platform holds all inbound endpoint
   traffic until this hook responds `200`, and delivers the launch's
   `runHookPayload` in the hook's request body — read the per-instance data
   out of it there. Acknowledge quickly (return `200` immediately) and do
   the actual work asynchronously after responding, rather than blocking
   the hook response on it.
2. Do the outbound work the instance exists for.
3. **Exit the process when the work is done.** A process exit terminates
   the instance immediately, regardless of idle policy — for a worker that
   only ever makes outbound calls, this is simpler and cheaper than tuning
   idle-policy timers, because the idle timer only ever sees *inbound*
   endpoint traffic and will not fire on its own for an outbound-only
   worker. Fall back on `maximumDurationInSeconds` as the backstop for a
   worker that never exits cleanly.

## Operational notes

- **`RunMicrovm` quota** — 5 TPS by default (see `references/platform.md`
  for the full quota table). A launcher fed by a bursty event source
  (webhook floods, batch queue drains) should queue launches client-side or
  request a quota increase rather than assume every call succeeds inline.
- **Transient `NotStabilized`** — a `RunMicrovm` call can fail transiently
  with `NotStabilized` while the service is still settling a prior state
  change. Retry with backoff; treat it as retryable, not a hard failure.
- **Unexpected termination** — if an instance the launcher launched ends up
  `TERMINATED` sooner than expected, call `get-microvm` and read
  `stateReason` — it names which hook failed or which limit was hit, rather
  than leaving you to guess (see `references/commands.md`).

## Full example

`https://github.com/serverless/examples/tree/v4/sandboxes/self-hosted-webhook`
is a complete, deployable instance of this pattern: an incoming webhook
triggers a launcher Lambda, which calls `RunMicrovm` to start one worker
MicroVM per session. Use it as the starting scaffold instead of assembling
the launcher from scratch.
