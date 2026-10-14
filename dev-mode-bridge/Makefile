# Convenience targets for Go contributors. CI and releases call
# `npm run build:devmode:layer -w @serverless/framework`, which also runs on Windows.
.PHONY: test vuln notices layers

test:
	go vet ./...
	go test -race ./...

vuln:
	go run golang.org/x/vuln/cmd/govulncheck@v1.8.0 ./...

notices:
	go run ./cmd/notices -out layer/sls-dev-THIRD_PARTY_NOTICES

layers:
	node ../packages/serverless/scripts/build-dev-layer.js
