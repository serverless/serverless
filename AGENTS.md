# AGENTS.md

Instructions for AI coding agents working on the Serverless Framework repository.

## Project Overview

This is the **Serverless Framework** monorepo - a command-line tool for deploying serverless applications to AWS Lambda and other managed cloud services. The framework uses YAML configuration to deploy code and cloud infrastructure.

**Tech Stack:**
- Node.js 24+ (ES Modules)
- Go (for binary installer)
- npm workspaces for package management
- Jest for testing
- ESLint + Prettier for code quality

## Repository Structure

```
/workspace
├── packages/                    # npm workspaces
│   ├── sf-core/                # Main CLI framework (primary package)
│   ├── serverless/             # Serverless Framework package
│   ├── engine/                 # Container framework engine (SCF)
│   ├── mcp/                    # MCP server for AI IDEs
│   ├── util/                   # Shared utilities
│   └── standards/              # ESLint and Prettier configs
├── binary-installer/           # Go-based binary installer
├── docs/                       # Documentation
└── release-scripts/            # Release automation
```

### Key Packages

- **`packages/sf-core`**: The Serverless Framework CLI that wraps the serverless package. Most development happens here.
- **`packages/serverless`**: Core Serverless Framework functionality and AWS provider implementation.
- **`packages/engine`**: Serverless Container Framework for deploying containers to AWS Lambda/ECS.
- **`packages/mcp`**: Model Context Protocol server for AI-powered IDEs (Cursor, Windsurf).

## Development Setup

```bash
# Install dependencies (uses npm workspaces)
npm install

# Run the framework locally on a test project
cd /path/to/your/test-project
node /path/to/serverless/packages/sf-core/bin/sf-core.js deploy
```

## Code Style

### Formatting Rules

- **No semicolons** - Prettier removes them
- **Single quotes** for strings
- **2-space indentation**
- **LF line endings**
- **ES Modules** - use `import`/`export`, not `require()`

### Linting Commands

```bash
# Check formatting
npm run prettier

# Fix formatting
npm run prettier:fix

# Run ESLint
npm run lint

# Fix lint issues
npm run lint:fix
```

### Code Guidelines

- Prefer native JavaScript over lodash
- Use async/await for asynchronous code
- Always run `npm run prettier:fix` and `npm run lint:fix` before committing

## Testing

### Unit Tests (Run Locally)

```bash
# Run unit tests for sf-core
npm run test:unit -w @serverlessinc/sf-core

# Run unit tests for serverless package
npm run test:unit -w @serverless/framework

# Run both
npm run test
```

### Integration Tests (CI Only)

Integration tests require AWS credentials and Serverless Dashboard access. They run automatically in CI when you submit a PR.

```bash
# Full test suite (requires AWS setup)
npm test -w @serverlessinc/sf-core

# Resolver tests
npm run test:resolvers -w @serverlessinc/sf-core
```

### Engine Tests

```bash
# Run engine unit tests
npm test -w @serverless/engine
```

## CI Pipeline

The CI runs on pull requests targeting `main`. Jobs include:

1. **Lint**: ESLint + Prettier checks
2. **Test: Engine**: Unit tests for the container engine
3. **Test: Framework**: Unit and integration tests for sf-core and serverless

All CI jobs use Node.js 24.x.

## Common Tasks

### Adding a New Feature

1. Create feature branch from `main`
2. Make changes in the appropriate package under `packages/`
3. Add/update tests in the corresponding `tests/` directory
4. Run `npm run lint:fix && npm run prettier:fix`
5. Run unit tests: `npm run test:unit -w @serverlessinc/sf-core`
6. Commit and push

### Modifying CLI Commands

CLI commands are in `packages/sf-core/src/`. Look for command handlers and add corresponding tests in `packages/sf-core/tests/`.

### Working with the Binary Installer

The binary installer is a separate Go project in `binary-installer/`.

```bash
cd binary-installer
go test ./...
make build
```

## Important Files

- `packages/sf-core/bin/sf-core.js` - CLI entry point
- `packages/sf-core/src/` - Core framework source
- `packages/sf-core/tests/` - Test suites
- `packages/standards/src/eslint.js` - ESLint configuration
- `packages/standards/src/prettier.js` - Prettier configuration

## Do's and Don'ts

### Do

- Run linting and formatting before committing
- Write unit tests for new functionality
- Use async/await for async operations
- Keep commits focused and descriptive
- Check existing tests for patterns to follow

### Don't

- Don't use semicolons (Prettier removes them)
- Don't use `require()` - this is an ES Modules project
- Don't add lodash dependencies - prefer native JS
- Don't skip the lint/format step
- Don't modify integration tests without understanding the AWS setup they require

## Getting Help

- Check existing code for patterns
- Review `CONTRIBUTING.md` for contribution guidelines
- Look at recent PRs for examples of changes
- The `docs/` directory contains user-facing documentation
