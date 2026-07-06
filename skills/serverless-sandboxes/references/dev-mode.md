# Dev mode and driving the emulator

`serverless dev --sandbox <name>` builds the sandbox's image locally and
starts an SDK-compatible MicroVMs API emulator on your machine — the endpoint
it prints (default `http://127.0.0.1:9100`, override with `--port`) speaks
the same `RunMicrovm` / `CreateMicrovmAuthToken` / `SuspendMicrovm` /
`ResumeMicrovm` / `TerminateMicrovm` calls as the real Lambda MicroVMs
control plane. It watches the artifact directory and
rebuilds automatically on change, and each instance you launch runs as a
local Docker container rather than a real Firecracker VM.

`s3://` artifacts are not supported in dev — the command needs local source
(a directory containing a `Dockerfile`) to build and rebuild against. Point
`artifact` at a local directory before running `dev`; see `references/config.md`
for the `artifact` property.

## IAM emulation

When the sandbox is deployed, `dev` assumes the sandbox's real execution role
and runs the container under it, so an `AccessDenied` your instance code
would hit in production surfaces locally too, before you ever deploy. If role
assumption fails for any reason, `dev` falls back and prints:

```
IAM emulation unavailable for "<name>" (<reason>); the sandbox will run with your ambient AWS credentials. Use --no-assume-role to silence this.
```

Pass `--no-assume-role` to skip the assumption attempt entirely and run the
container with your local/ambient AWS credentials on purpose — useful when
the sandbox isn't deployed yet (no role to assume) or when you deliberately
want your own identity instead of the sandbox's.

## Driving it as an agent

Run `dev` piped to a background process — never attached and blocking — then
drive the emulator with the AWS CLI or SDK exactly as you would the real
MicroVMs API.

1. Start piped in the background:

   ```bash
   serverless dev --sandbox app > dev.log 2>&1 &
   ```

2. Wait for this exact line in `dev.log` before doing anything else:

   ```
   MicroVMs API ready — Ctrl-C to stop
   ```

   If the ready line never appears, the build failed — check the piped log
   for the error.

3. Point the AWS CLI/SDK at the printed endpoint:

   ```bash
   export AWS_ENDPOINT_URL_LAMBDA_MICROVMS=http://127.0.0.1:9100
   ```

   (or pass `--endpoint-url` on each `aws` call instead of exporting it).

4. Launch an instance — the emulator maps any image identifier to the one
   local sandbox you're running `dev` against, so `local` works as a
   placeholder:

   ```bash
   aws lambda-microvms run-microvm --image-identifier local --idle-policy maxIdleDurationSeconds=300,suspendedDurationSeconds=60,autoResumeEnabled=false
   ```

   Returns `{microvmId, state: RUNNING, endpoint}`.

5. Mint an auth token for the endpoint. `--expiration-in-minutes` is
   required by the CLI; `--allowed-ports` accepts a specific port list, or
   `{"allPorts":{}}`, or `{"range":{"startPort":…,"endPort":…}}`:

   ```bash
   aws lambda-microvms create-microvm-auth-token --microvm-identifier <id> --expiration-in-minutes 5 --allowed-ports '[{"port":8080}]' \
     --query 'authToken."X-aws-proxy-auth"' --output text
   ```

   The response shape is `{"authToken":{"X-aws-proxy-auth":"<token>"}}`. Extract the token value with the `--query` and `--output text` flags shown above; guessing a different field name (e.g., `--query token`) returns nothing useful and fails silently — the subsequent request then fails with `403 Request missing authentication` instead of showing you the extraction error.

6. Call the instance through its endpoint, presenting the token:

   ```bash
   curl -H "X-aws-proxy-auth: <token>" <endpoint>/path
   ```

   The endpoint enforces auth exactly like production — omit the header and
   you get back `403 Request missing authentication`.

7. Tear the instance down when done:

   ```bash
   aws lambda-microvms terminate-microvm --microvm-identifier <id>
   ```

## Suspend and resume in dev

The emulator implements the full suspend/resume lifecycle, so the session
and orchestrated worker patterns (see `references/control-plane.md`) can be
exercised locally before touching AWS:

- **Explicit APIs** — `suspend-microvm` flips the instance to `SUSPENDED`
  and pauses its Docker container (`docker ps` shows `(Paused)` — processes
  frozen in place, the local analog of the production memory snapshot);
  `resume-microvm` unpauses it back to `RUNNING` with state intact.
- **Idle policy is enforced** — with no inbound traffic for
  `maxIdleDurationSeconds` the instance auto-suspends, and after a further
  `suspendedDurationSeconds` it auto-terminates (`get-microvm` reports
  `TERMINATED`), same two-gate sequence as production. Omitting
  `--idle-policy` disables both gates (the instance just runs) — the right
  launch shape for testing a one-shot worker.
- **Auto-resume** — with `autoResumeEnabled: true`, an authenticated
  request to a `SUSPENDED` instance's endpoint is held while the instance
  resumes, then served normally; the caller sees latency, not an error.
- **`suspend`/`resume` hooks** — delivered only if declared under `hooks`
  in `serverless.yml`, matching production's opt-in contract. A sandbox
  that declares only `ready`/`run` sees no hook traffic on suspend/resume.

One fidelity caveat: a paused container's processes are frozen but the
image state lives in the running container, not a real snapshot — so
timing-sensitive code (timers firing late, wall-clock jumps after resume)
behaves _approximately_ like production, and resume latency is near-zero
locally where production pays a snapshot restore. Local emulation also
doesn't reproduce snapshot semantics on the network and entropy side:
outbound TCP connections are **not** killed on run/resume the way a real
snapshot restore would sever them, and there's no entropy-reseed behavior to
exercise. Validate any snapshot-sensitive behavior — connection handling
across suspend/resume, fresh randomness after resume — against a deployed
sandbox, not just `dev`.

## Stopping the dev process

Once you are done with the emulator, stop the backgrounded `dev` process by sending it SIGTERM with `kill <pid>`, then wait a few seconds for it to shut down the emulator and stop the sandbox containers. If the process remains alive after a few seconds, force-kill it with `kill -9 <pid>` — but then manually verify cleanup with `docker ps` to ensure no stray containers are left running.

## Reading the piped output

The interactive progress animation `dev` shows in a real terminal is
terminal-only — it does not appear in a pipe. The informational lines below
always reach a pipe (and hence `dev.log`), so parse for these markers rather
than the animation:

- Launch: `→ RunMicrovm <short> · <endpoint> · terminates after <N>s idle`
- Container logs: `─ <short> …` (one line per line of container stdout/stderr)
- Per-request access log: `← <short> <status> <METHOD> <path>`
- Rebuild triggered by a source change: `↻ <file> changed — rebuilding…`
- Explicit suspend/resume: `⏸ SuspendMicrovm <short>` / `▶ ResumeMicrovm <short>`
- Idle-policy transitions: `⏸ <short> suspended (idle)`, `▶ <short> resumed (traffic)`, `✕ <short> terminated (idle)`
- Explicit termination: `✕ TerminateMicrovm <short>`

`<short>` is a stable, color-coded short form of the microvm ID that ties a
launch line to its container-log lines and access-log lines, so you can
follow one instance's story through an interleaved log even when several
instances are running at once.

## Hooks in dev

The emulator delivers every hook a deployed sandbox gets — `ready` and
`run`, plus `suspend`/`resume`/`terminate` when declared — and enforces the
same gate production does: a non-2xx response from `run` terminates the
instance immediately, with a `stateReason` explaining which hook failed and
what status it returned. Build your hook handlers
against this loop the same way you would against a real deploy — a hook bug
that would fail in production fails here too, before you spend a deploy
cycle finding out. See `references/config.md` for the full `hooks` schema
(timeouts, the build-time vs. runtime hook groups, the 200-fast/503-retry
contract for `ready`).
