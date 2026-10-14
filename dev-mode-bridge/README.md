# Dev Mode bridge

The Lambda-side half of `serverless dev`. `serverless dev` attaches a Lambda layer to a function
and sets `AWS_LAMBDA_EXEC_WRAPPER=/opt/sls-dev-wrapper`. The wrapper starts `sls-dev-bridge`, a
Lambda Runtime API proxy, then runs the function's original exec wrapper (if any) or its runtime
with `AWS_LAMBDA_RUNTIME_API` pointed at the bridge. When anything fails, the runtime talks to the
real Runtime API and the deployed code answers every invocation.

- `internal/protocol`: the sealed wire format shared with the CLI.
- `internal/awsauth`: the broker role's credentials (AWS STS AssumeRole with a session policy
  narrowed to one execution environment), the presigned AWS IoT Core WebSocket URL, and Direct
  Messaging liveness.
- `internal/mqttws`: the AWS IoT Core connection (MQTT 5 over WebSocket, QoS 1);
  `internal/mqttws/mqttwstest` is an in-process MQTT 5 broker for tests that behaves like AWS IoT
  Core where the bridge depends on it.
- `internal/bridge`: the proxy and the per-invocation `Router`.
- `cmd/sls-dev-bridge`: the binary the layer ships (static, linux/amd64 and linux/arm64).
- `cmd/build-layer`: writes a deterministic layer zip, and refuses a bridge that links a module
  missing from the notices.
- `cmd/notices`: writes the notices, the licences of Go and of every module the bridge links,
  which the layer ships (`/opt/sls-dev-THIRD_PARTY_NOTICES`). The layer build generates them on
  every build from `go.mod` and the module cache; `make notices` prints them.
- `layer/sls-dev-wrapper`: the exec wrapper (bash 4.2 or newer).

Dependencies: the AWS SDK for Go v2 (STS, SigV4 and the AWS IoT Core data plane), Eclipse Paho
for Go (`paho` and `packets`, MQTT 5) and coder/websocket. `make vuln` runs govulncheck. A
`go.mod` change needs nothing else: the next layer build ships the matching notices.

Test: `make test` (the wrapper tests need bash 4 or newer and curl, and skip without them; on
macOS set `SLS_DEV_TEST_BASH`. `SLS_DEV_TEST_REQUIRE_TOOLS=1` turns those skips, and the VCS-stamp
test's skip outside a repository checkout, into failures, as CI does).
Build the layer zips the CLI publishes: `npm run build:devmode:layer -w @serverless/framework`.
