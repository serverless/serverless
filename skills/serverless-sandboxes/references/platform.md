# The AWS Lambda MicroVMs platform

Sandboxes run on AWS Lambda MicroVMs — Firecracker-based microVMs managed by
a dedicated control plane (`aws lambda-microvms`) that sits alongside the
regular Lambda control plane. This page documents that underlying platform's
contracts and limits: facts about the AWS service itself, not the framework
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
on (the configured hooks port, default `9000` — see `config.md`): the platform calls
`POST /aws/lambda-microvms/runtime/v1/<hook>` and expects a fast response.
There are five hooks split across two lifecycle groups.

**Build-time (image) hooks** — run once, while the image is being built from
your artifact, before any instance boots from it:

- **`ready`** — the build gate. A non-2xx response, or a timeout, fails the
  image build outright. Respond `503` to mean "not ready yet, keep trying" —
  the platform retries until the hook's own timeout elapses. Timeout range
  **1–3600 seconds**, AWS default **60**.
- **`validate`** — runs after `ready` succeeds, against a fresh VM booted
  from the not-yet-finalized image. Use it for correctness checks and
  snapshot-profiling work (warming caches, exercising code paths you want
  captured in the snapshot) before the image is sealed. Timeout range
  **1–3600 seconds**, but the AWS default is only **1 second** — set an
  explicit `validate` timeout for any real validation work.

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

All runtime hooks share a timeout range of **1–60 seconds** and default to
**1 second** when you don't set one — tight enough that any runtime hook doing
real work should declare an explicit `timeout`.

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
Send `X-aws-proxy-force-h2: true` to force HTTP/2 to a plaintext HTTP/1.1
upstream.

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

Managed base image versions move through a deprecation lifecycle:
`AVAILABLE → DEPRECATED (60 days) → EXPIRING (30 days) → EXPIRED`. Once
`EXPIRED`, the version can no longer be used to build new images. AWS also
releases new managed base-image versions periodically, independent of that
deprecation clock — redeploying rebuilds against whatever is current, so
redeploying periodically is enough to keep your images up to date.

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

| Quota                               | Default                                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------------------------ |
| Account memory pool                 | 400 GB (1,024 GB in `us-east-1`, `us-east-2`, `us-west-2`, `ap-northeast-1`); burstable up to 4× |
| MicroVM images per account          | 100                                                                                              |
| Versions per image                  | 50                                                                                               |
| `RunMicrovm` TPS                    | 5/s                                                                                              |
| `ResumeMicrovm` TPS                 | 5/s                                                                                              |
| `SuspendMicrovm` TPS                | 2/s                                                                                              |
| `TerminateMicrovm` TPS              | 10/s                                                                                             |
| `GetMicrovm` TPS                    | 100/s                                                                                            |
| `CreateMicrovmAuthToken` TPS        | 50/s                                                                                             |
| Per-instance RPS                    | 40–160, scaling with instance size                                                               |
| Per-instance concurrent connections | 8–128, scaling with instance size                                                                |

Service Quotas entries for MicroVMs:

- `Rate of RunMicrovm API requests` = 5
- `Rate of ResumeMicrovm API requests` = 5
- `Rate of SuspendMicrovm API requests` = 2
- `Rate of TerminateMicrovm API requests` = 10
- `Rate of GetMicrovm API requests` = 100
- `Rate of CreateMicrovmAuthToken API requests` = 50
- `Number of MicroVM images` = 100, `Versions per MicroVM Image` = 50
- `RPS per 4 vCPU MicroVm` = 40, `RPS per 16 vCPU MicroVm` = 160
- `Concurrent connections per {1,2,4,8,16} vCPU MicroVM` = 8, 16, 32, 64, 128
- `Max Execution Duration of a MicroVM (in Hours)` = 8

The account memory pool may not appear as a named entry in `list-service-quotas`;
to confirm your account's current ceiling, check the Service Quotas console or ask AWS Support.

All of these are standard Service Quotas entries and adjustable through the
Service Quotas console or `aws service-quotas request-service-quota-increase`.

## Pricing model

Sandboxes bill by MicroVM instance state, mirroring the lifecycle above:

- **RUNNING** — per-second charge for the provisioned vCPU and memory.
  Active use above the instance's baseline vCPU (bursting, up to 4×) is
  billed additionally for the burst portion.
- **SUSPENDED** — no compute charge; billed only for snapshot storage.
- **Suspend / resume transitions** — each snapshot write (on suspend) and
  snapshot read (on resume) carries its own fee, independent of the
  RUNNING/SUSPENDED state charges.

This is the billing model, not a price list — rates vary by region and
change over time. See
[aws.amazon.com/lambda/pricing](https://aws.amazon.com/lambda/pricing/) for
current figures.

## Regions

At launch, AWS Lambda MicroVMs is available in: `us-east-1`, `us-east-2`,
`us-west-2`, `ap-northeast-1`, `eu-west-1`.

Availability is not uniform within a region — not every Availability Zone in
a supported region supports MicroVMs, and AWS does not publish a list of
which AZs do. Pick subnets by **AZ ID** (e.g. `use1-az3`), not by
AZ name, and be ready to move a subnet to a different AZ ID if a deploy
fails on a capacity or placement error — see `references/troubleshooting.md`
for the diagnostic flow.
