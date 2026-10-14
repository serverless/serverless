# Convenience targets for Go contributors. CI and releases call
# `npm run build:devmode:layer -w @serverless/framework`, which also runs on Windows.
.PHONY: test vuln notices layers

test:
	go vet ./...
	go test -race ./...

vuln:
	go run golang.org/x/vuln/cmd/govulncheck@v1.8.0 ./...

# Prints the third-party notices the layer build generates and ships.
notices:
	go run ./cmd/notices -out /dev/stdout

layers:
	node ../packages/serverless/scripts/build-dev-layer.js
