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

- **`lambda:RunMicrovm`** — plus `Get`/`List`/`Suspend`/`Resume`/`Terminate`
  actions on the equivalent resources if the launcher also manages
  instances after launch.
- **`iam:PassRole`** on the execution role passed as `executionRoleArn`.
- **`lambda:PassNetworkConnector`** on **each** connector ARN passed in
  `ingressNetworkConnectors`/`egressNetworkConnectors` — this is a
  per-connector grant, not implied by `RunMicrovm`. A missing grant surfaces
  as an `AccessDeniedException` naming the specific action and connector
  ARN it was denied on; add that exact ARN to the `PassNetworkConnector`
  resource list.

Minimal IAM statement shape:

```yaml
- Effect: Allow
  Action: lambda:RunMicrovm
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

## Worker patterns

The MicroVM instance launched by `RunMicrovm` runs your worker artifact. In
every pattern, implement the `run` hook the same way: the platform holds
all inbound endpoint traffic until this hook responds `200`, and delivers
the launch's `runHookPayload` in the hook's request body — read the
per-instance data out of it there, acknowledge quickly (return `200`
immediately), and do the actual work asynchronously after responding.

What happens *after* the work differs. Pick a pattern by asking: **will
this instance be needed again, and is its in-memory/disk state worth
keeping?** While suspended, full memory + disk state is preserved and
compute billing stops — you pay only snapshot storage — so suspension is
the tool for "yes"; exit/terminate is the tool for "no".

### One-shot worker — exit when done

For a worker that handles exactly one unit of work and never needs its
state again:

1. Do the outbound work the instance exists for.
2. **Exit the process.** A process exit terminates the instance
   immediately, regardless of idle policy.

Don't lean on the idle policy here — it cuts both ways for an
outbound-only worker. The idle timer only sees *inbound* endpoint traffic,
so it never fires on its own **and** it can fire against you: an instance
busy with outbound work still looks idle and is suspended mid-work once
`maxIdleDurationSeconds` elapses. Omit `idlePolicy` from the launch call
to turn automatic suspension off entirely, or set
`maxIdleDurationSeconds` above the longest unit of work.
`maximumDurationInSeconds` is the backstop for a worker that never exits
cleanly.

### Session worker — suspend on idle, auto-resume on traffic

For an instance that serves *inbound* requests with gaps between them
(agent sessions, notebooks/REPLs, per-user dev environments, sessionful
game or simulation servers), suspension is the point of MicroVMs — don't
exit between requests:

- Launch with `idlePolicy: { autoResumeEnabled: true, ... }`. After
  `maxIdleDurationSeconds` without inbound traffic the instance suspends;
  the next inbound request resumes it automatically — the platform holds
  that request during the resume and delivers it once the app is back
  (`502` only if the resume itself fails). Warm state — installed
  dependencies, caches, the user's session — survives, so resume is
  near-instant compared to a fresh `RunMicrovm` + image boot.
- Treat `suspendedDurationSeconds` as the session-retention window: how
  long a user can stay away before the instance terminates and its state
  is gone for good.
- Implement the `suspend` hook (flush pending writes, close connections
  that must not survive the boundary) and the `resume` hook (refresh
  credentials, re-establish connections) — mechanics in
  `references/platform.md`.

### Orchestrated worker — explicit suspend/resume

When your control plane knows the activity boundaries better than the idle
timer does — an agent waiting on human approval, a worker paused between
queue drains — drive the lifecycle directly:

```bash
aws lambda-microvms suspend-microvm --microvm-identifier <id>  # state kept, compute billing stops
aws lambda-microvms resume-microvm  --microvm-identifier <id>  # continues exactly where it left off
```

This works even for outbound-only workers whose idle timer never fires:
the launcher suspends the instance when a unit of work completes and
resumes it when the next arrives — keeping expensive state (cloned repo,
warm model, installed deps) without paying for idle compute or
re-launching from the image. The call must come from **outside** the
instance — there is no self-suspend from inside a MicroVM (and a VM that
froze itself could never receive the API response). Requires
`lambda:SuspendMicrovm` / `lambda:ResumeMicrovm` on the orchestrator (see
Caller IAM above).

Across all patterns, `maximumDurationInSeconds` (max 28,800 s = 8 h,
counted across `RUNNING` **and** `SUSPENDED`) is the hard ceiling — after
that the instance terminates regardless of activity.

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
- **`ConflictException` from `RunMicrovm`** — the `clientToken` was reused
  with parameters that don't match the original call. Either replay the
  identical request or mint a fresh token.
- **Readiness after `RunMicrovm`** — don't poll `get-microvm` waiting for a
  ready state; its state is eventually consistent and can lag. Instead
  determine readiness by attempting an authenticated request against the
  instance with retry/backoff.
- **Interactive debugging** — to shell into a launcher-started worker,
  include `SHELL_INGRESS` in `ingressNetworkConnectors` at launch;
  connectors are fixed at launch and can't be added later. See
  `references/commands.md`.

## Full example

`https://github.com/serverless/examples/tree/v4/sandboxes/self-hosted-webhook`
is a complete, deployable instance of this pattern: an incoming webhook
triggers a launcher Lambda, which calls `RunMicrovm` to start one worker
MicroVM per session. Use it as the starting scaffold instead of assembling
the launcher from scratch.
