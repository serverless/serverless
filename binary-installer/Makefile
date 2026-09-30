BINARY_NAME=serverless
VERSION=$(shell git describe --tags --always --dirty)
PLATFORMS=darwin linux windows
ARCHITECTURES=amd64 arm64
LDFLAGS=-ldflags="-s -w"
BUILD_FLAGS=-trimpath $(LDFLAGS)

.PHONY: all clean build-all build-prod build-canary test test-e2e

all: clean build-all

clean:
	@rm -rf dist/

build-all: build-prod build-canary

build-prod:
	@echo "Building production binaries..."
	@for platform in $(PLATFORMS); do \
		for arch in $(ARCHITECTURES); do \
			if [ "$$arch" = "arm64" ] && [ "$$platform" = "windows" ]; then \
				continue; \
			fi; \
			echo "Building $$platform/$$arch..."; \
			mkdir -p dist/prod; \
			CGO_ENABLED=0 GOOS=$$platform GOARCH=$$arch go build $(BUILD_FLAGS) -o dist/prod/$(BINARY_NAME)-$$platform-$$arch .; \
		done; \
	done

build-canary:
	@echo "Building canary-enabled binaries..."
	@for platform in $(PLATFORMS); do \
		for arch in $(ARCHITECTURES); do \
			if [ "$$arch" = "arm64" ] && [ "$$platform" = "windows" ]; then \
				continue; \
			fi; \
			echo "Building $$platform/$$arch..."; \
			mkdir -p dist/canary; \
			CGO_ENABLED=0 GOOS=$$platform GOARCH=$$arch go build $(BUILD_FLAGS) -tags=canary -o dist/canary/$(BINARY_NAME)-$$platform-$$arch .; \
		done; \
	done

test:
	@go test ./...

# Builds the launcher and runs it end to end against the real install host;
# needs network access plus node and npm on PATH.
test-e2e:
	@go test -tags e2e ./e2e/ -v -count=1 -timeout 45m
