BINARY_NAME=serverless
VERSION=$(shell git describe --tags --always --dirty)
PLATFORMS=darwin linux windows
ARCHITECTURES=amd64 arm64
LDFLAGS=-ldflags="-s -w"

.PHONY: all clean build-all build-prod build-canary test

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
			CGO_ENABLED=0 GOOS=$$platform GOARCH=$$arch go build $(LDFLAGS) -o dist/prod/$(BINARY_NAME)-$$platform-$$arch .; \
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
			CGO_ENABLED=0 GOOS=$$platform GOARCH=$$arch go build $(LDFLAGS) -tags=canary -o dist/canary/$(BINARY_NAME)-$$platform-$$arch .; \
		done; \
	done

test:
	@go test ./...
