# Dev mode and driving the emulator

`serverless dev --sandbox <name>` builds the sandbox's image locally and
starts an SDK-compatible MicroVMs API emulator on your machine — the endpoint
it prints (default `http://127.0.0.1:9100`, override with `--port`) speaks
the same `RunMicrovm` / `CreateMicrovmAuthToken` / `TerminateMicrovm` calls as
the real Lambda MicroVMs control plane. It watches the artifact directory and
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

## Driving it as an agent (the verified loop)

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
   aws lambda-microvms create-microvm-auth-token --microvm-identifier <id> --expiration-in-minutes 5 --allowed-ports '[{"port":8080}]'
   ```

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

## Reading the piped output

The interactive progress animation `dev` shows in a real terminal is
terminal-only — it does not appear in a pipe. The informational lines below
always reach a pipe (and hence `dev.log`), so parse for these markers rather
than the animation:

- Launch: `→ RunMicrovm <short> · <endpoint> · terminates after <N>s idle`
- Container logs: `─ <short> …` (one line per line of container stdout/stderr)
- Per-request access log: `← <short> <status> <METHOD> <path>`
- Rebuild triggered by a source change: `↻ <file> changed — rebuilding…`
- Explicit termination: `✕ TerminateMicrovm <short>`

`<short>` is a stable, color-coded short form of the microvm ID that ties a
launch line to its container-log lines and access-log lines, so you can
follow one instance's story through an interleaved log even when several
instances are running at once.

## Hooks in dev

The emulator delivers the same `ready` and `run` hooks a deployed sandbox
gets, and enforces the same gate production does: a non-2xx response from
`run` terminates the instance immediately, with a `stateReason` explaining
which hook failed and what status it returned. Build your hook handlers
against this loop the same way you would against a real deploy — a hook bug
that would fail in production fails here too, before you spend a deploy
cycle finding out. See `references/config.md` for the full `hooks` schema
(timeouts, the build-time vs. runtime hook groups, the 200-fast/503-retry
contract for `ready`).
