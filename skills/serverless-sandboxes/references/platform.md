# The AWS Lambda MicroVMs platform

## Contents

- Lifecycle
- Hooks contract
- Data plane
- Build model
- Quotas & limits
- Pricing model
- Regions

Sandboxes run on AWS Lambda MicroVMs — Firecracker-based microVMs managed by
a dedicated control plane (`aws lambda-microvms`) that sits alongside the
regular Lambda control plane. This page documents that underlying platform's
contracts and limits: facts about the AWS service itself, not the Framework
schema. See `references/config.md` for the `sandboxes:` block, and
`references/control-plane.md` for launching instances from your own code.

## Lifecycle

Every instance moves through one state machine:

```
PENDING → RUNNING → SUSPENDING → SUSPENDED → TERMINATING → TERMINATED
                 ↑___________________|
                 (autoResumeEnabled: SUSPENDED → RUNNING on inbound traffic)
```

**The idle timer counts seconds since the last inbound request at the
instance's endpoint — nothing else.** It is not CPU usage, not process
activity, not open connections in the other direction. An instance that is
busy grinding on a computation but receiving no inbound requests still
suspends on schedule. Symmetrically, an instance that only makes _outbound_
calls (a worker polling a queue, for example) is never kept alive by that
activity — it relies on its own process exiting to terminate immediately, or
on `maximumDurationInSeconds` as a hard backstop.

The two idle gates apply in sequence, both counted independently:

```
RUNNING ──(idle ≥ maxIdleDurationSeconds)──► SUSPENDED ──(elapsed ≥ suspendedDurationSeconds)──► TERMINATED
   │                                             │
   │ inbound request (any time)                  │ inbound request, if autoResumeEnabled
   └────────────── stays RUNNING ◄───────────────┘
```

- Gate 1 — `RUNNING → SUSPENDED`: fires once the instance has gone
  `maxIdleDurationSeconds` without an inbound request.
- Gate 2 — `SUSPENDED → TERMINATED`: fires once the instance has stayed
  suspended for `suspendedDurationSeconds`.

If `autoResumeEnabled` is set, an inbound request against a `SUSPENDED`
instance triggers a resume instead of a `403`/dead end. Lambda **holds the
inbound request open** while the resume runs — the caller sees latency, not
an error — and only fails it (`502`) if the resume itself fails.

Outside of idle, two more transitions terminate an instance immediately,
bypassing both gates:

- The container's main process exiting, at any point, ends the instance
  with an immediate `TERMINATED` — this is the same "outbound-only worker"
  case above: no listener means no idle-driven suspend, so _you_ must exit
  the process (or hit the duration ceiling) to stop paying.
- `maximumDurationInSeconds` — a hard ceiling on total time spent in
  `RUNNING` + `SUSPENDED` combined. Range **1–28,800** (28,800 s = 8 hours).
  This is an absolute cap independent of the idle policy; it fires even if
  the instance is actively serving traffic.

### Idle policy fields

| Field                      | Constraint                                                                                                                                                                                   |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `maxIdleDurationSeconds`   | 60–28,800                                                                                                                                                                                    |
| `suspendedDurationSeconds` | minimum 0                                                                                                                                                                                    |
| `autoResumeEnabled`        | boolean; controls whether a `SUSPENDED` instance auto-resumes on inbound traffic (vs. staying suspended until `suspend-microvm`/`resume-microvm` is called manually, or until it terminates) |

Setting `suspendedDurationSeconds: 0` skips the suspended window entirely —
the instance terminates immediately on suspend instead of waiting. Note that
`autoResumeEnabled` only revives a `SUSPENDED` instance; it never brings back
one that has already reached `TERMINATED`.

## Hooks contract

Your artifact serves hooks as plain HTTP endpoints on the port it listens
on (the configured hooks port, default `9000` — see `references/config.md`): the platform calls
`POST /aws/lambda-microvms/runtime/v1/<hook>` and expects a fast response.
There are five hooks split across two lifecycle groups.

**Build-time (image) hooks** — run once, while the image is being built from
your artifact, before any instance boots from it:

- **`ready`** — the build gate. A non-2xx response, or a timeout, fails the
  image build outright. Respond `503` to mean "not ready yet, keep trying" —
  the platform retries until the hook's own timeout elapses.
- **`validate`** — runs after `ready` succeeds, against a fresh VM booted
  from the not-yet-finalized image. Use it for correctness checks and
  snapshot-profiling work (warming caches, exercising code paths you want
  captured in the snapshot) before the image is sealed.

**Runtime (per-instance) hooks** — run against a specific instance as it
moves through its lifecycle:

- **`run`** — the launch gate. The platform holds all endpoint traffic to
  the instance until this hook returns `200`. A non-2xx response terminates
  the instance immediately, landing it in `TERMINATED` with a `stateReason`
  naming the failure. The request body is JSON:
  `{"microvmId": "...", "runHookPayload": "..."}`.
- **`resume`** — runs while the instance is still `SUSPENDED`, before it's
  handed back to `RUNNING` and inbound traffic resumes flowing.
- **`suspend`** — runs as the instance transitions into `SUSPENDED`.
- **`terminate`** — runs as the instance transitions into `TERMINATED`.

Answer every hook with a fast `200` and do heavy work after responding; the
timeouts and their tight defaults are in `references/config.md` (Hooks).

**`runHookPayload` (≤16 KB) is the only per-instance data channel.** Baked-in
`environment` variables (see `references/config.md`) are fixed at build time
and identical across every instance of a version — there is no equivalent of
a per-launch environment override. Anything that needs to differ
instance-to-instance (a session ID, a tenant identifier, a one-time secret)
has to travel through this payload and be read out of the `run` hook's
request body.

## Data plane

Every instance is reachable only through a proxied HTTPS endpoint — there is
no direct network path to the microVM:

```
https://<microvm-id>.lambda-microvm.<region>.on.aws
```

Every request to that endpoint must carry a token minted by
`CreateMicrovmAuthToken` in the `X-aws-proxy-auth` header. Tokens:

- Expire in at most **60 minutes** from creation.
- Are port-scoped at mint time: a single port (`{port}`), a range
  (`{range}`), or all ports (`{allPorts}`).

The proxy targets port `8080` on the instance by default; override per
request with the `X-aws-proxy-port` header (the port must be within the
token's allowed scope). The proxy is protocol-transparent for HTTP/2,
WebSockets (auth and port are passed via subprotocols rather than headers,
since browser WebSocket clients can't set arbitrary headers), gRPC, and
Server-Sent Events.

Proxy-level error statuses:

- **403** — bad or expired token, or a port outside the token's scope.
- **429** — throughput cap exceeded for the instance's size.
- **502** — the app isn't listening on the target port, or an auto-resume
  attempt failed.

Bandwidth scales with instance size: roughly **1 MB/s per 0.5 GB** of
configured memory as a baseline, up to a ceiling of **16 MB/s** per instance.
Saturating that ceiling shows up as increased latency, not errors — don't rely
on error rates alone to detect a bandwidth-constrained instance.

The `x-aws-proxy-*` header namespace is reserved for the proxy itself: any
such header you send is stripped before the request reaches your instance.
`X-aws-proxy-force-h2: true` forces HTTP/2 to a plaintext HTTP/1.1 upstream.

`get-microvm` state is eventually consistent — don't poll it to decide when
an instance is ready. Instead, attempt an authenticated request against the
endpoint and treat success as readiness. A `502` in the first few seconds
after launch is expected while the snapshot restores; retry rather than
treating it as a hard failure.

## Build model

An image build produces one Firecracker snapshot; every instance of that
image version boots — or resumes — from the same snapshot. That has one
important consequence: **anything baked in at build time (via `ready` /
`validate`, or written into the filesystem during the build) is shared by
every instance of that version.** Don't generate per-instance secrets,
session tokens, or identifiers during the build — they'd be identical across
every instance. Generate them in the `run` hook instead, once you have that
instance's `runHookPayload`.

### Snapshot uniqueness

Because every instance boots from the same snapshot, anything your code
generates while the image builds — UUIDs, PRNG seeds, tokens, fetched
secrets — is baked into that snapshot and comes out **identical across every
instance**, including instances resumed later from the same snapshot. Fix it
in one of these ways, in order of preference:

1. Generate the value at first use instead of at build time.
2. Generate it in the `run` hook — the one point that's guaranteed to run
   per-instance.
3. If you must read randomness elsewhere, read it per-call from a CSPRNG
   rather than seeding state once. In Node, use `crypto.randomUUID()` or
   `crypto.randomBytes()` — never a `Math.random()`-seeded generator.

AWS documents the kernel RNG as reseeded across snapshot resume, so per-call
reads (e.g. `/dev/urandom`, `crypto.randomBytes`) stay safe. But userspace
libraries don't automatically benefit from that reseeding unless they also
re-read from the kernel per call — only AWS's own default base
(`public.ecr.aws/lambda/microvms:al2023-minimal`) ships an OpenSSL build that
auto-reseeds on resume; other base images may not. For safe CSPRNGs in other
languages, see
[AWS's MicroVMs image docs](https://docs.aws.amazon.com/lambda/latest/dg/microvms-images.html).

Container base images:

- Default: `public.ecr.aws/lambda/microvms:al2023-minimal`.
- AWS-managed alternative: `arn:aws:lambda:<region>:aws:microvm-image:al2023-1`.

Managed base-image versions are deprecated and eventually expire, after which
they can no longer build new images. Redeploying rebuilds against the current
version, so redeploying periodically keeps your images up to date.

Rebuild trigger: **any** change to the artifact content — the zip or the
Dockerfile build context, even a change that produces byte-identical output
under a different reference — triggers a full image rebuild. Deploying with
no artifact change is a no-op.

All non-local outbound TCP connections are killed on `run` and on `resume`
alike — the platform doesn't preserve open sockets across either transition.
The AWS SDKs retry transparently through this, so calls to AWS services
generally just work; for other HTTP or database clients, make sure
reconnect/retry is configured rather than assuming a long-lived connection
survives a resume.

## Quotas & limits

Their defaults shape a design. These are adjustable Service Quotas; the
Service Quotas console shows your account's values:

- Control-plane rates: `RunMicrovm` and `ResumeMicrovm` 5/s,
  `SuspendMicrovm` 2/s, `TerminateMicrovm` 10/s, `GetMicrovm` 100/s,
  `CreateMicrovmAuthToken` 50/s, `CreateMicrovmShellAuthToken` 5/s.
  Launching many instances at once needs backoff.
- 100 images per account, 50 versions per image, and 5 concurrent image
  builds (10 in `us-east-1`, `us-east-2`, `us-west-2`, and `ap-northeast-1`).
- An account-wide memory pool: 400 GB, or 1,024 GB in `us-east-1`,
  `us-east-2`, `us-west-2`, and `ap-northeast-1`, burstable up to 4×. It may
  not appear in `list-service-quotas`; the Service Quotas console or AWS
  Support confirms your ceiling.

These are fixed limits that cannot be raised:

- Per instance, scaling with size: 40 requests per second at 4 vCPU and 160
  at 16 vCPU, and 8, 16, 32, 64, or 128 concurrent connections at 1, 2, 4,
  8, or 16 vCPU. A `429` from the endpoint is this cap.
- At most 8 hours per instance (`maximumDurationInSeconds`).

In the Service Quotas console they are named `Rate of RunMicrovm API requests`
(and the same for `ResumeMicrovm`, `SuspendMicrovm`, `TerminateMicrovm`,
`GetMicrovm` and `CreateMicrovmAuthToken`), `Number of MicroVM images`,
`Versions per MicroVM Image`, `RPS per 4 vCPU MicroVm`,
`RPS per 16 vCPU MicroVm`, `Concurrent connections per {1,2,4,8,16} vCPU MicroVM`,
and `Max Execution Duration of a MicroVM (in Hours)`. Raise the adjustable
ones there or with `aws service-quotas request-service-quota-increase`; the
per-instance caps and the 8-hour limit are listed there too but cannot be
raised.

## Pricing model

Billing follows instance state: a per-second charge for vCPU and memory while
an instance is RUNNING (bursting above its baseline vCPU is billed extra),
only snapshot storage while it is SUSPENDED, and a fee for each suspend and
each resume. For rates, see
[aws.amazon.com/lambda/pricing](https://aws.amazon.com/lambda/pricing/).

## Regions

AWS Lambda MicroVMs runs in a subset of AWS regions; check its regional
availability before choosing one.

Not every Availability Zone in a supported region supports MicroVMs; choose
subnets as `references/config.md` (VPC) describes.
