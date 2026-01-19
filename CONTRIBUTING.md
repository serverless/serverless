# Contributing Guidelines

Welcome, and thanks in advance for your help!

## Prerequisites

- **Node.js 24 or greater** is required for development
- npm (comes with Node.js)

## Getting Started

1. Fork the repository on GitHub, then clone your fork:
   ```bash
   git clone https://github.com/<your-username>/serverless.git
   cd serverless
   npm install
   ```

2. Run the framework locally on a test project:
   ```bash
   cd /path/to/your/test-project
   node /path/to/serverless/packages/sf-core/bin/sf-core.js deploy
   ```

A good first step is to search for open [issues](https://github.com/takuhii/serverless-node-next/issues). Look for issues labeled [good first issue](https://github.com/takuhii/serverless-node-next/labels/good%20first%20issue) or [help wanted](https://github.com/takuhii/serverless-node-next/labels/help%20wanted).

## When You Propose a New Feature or Bug Fix

Please make sure there is an open issue discussing your contribution before jumping into a Pull Request. It's fine to submit a PR without an issue for:

- Documentation updates
- Obvious bug fixes
- Maintenance improvements

In non-trivial cases, please propose and let us review an implementation spec (in the corresponding issue) before jumping into implementation.

## When You Want to Work on an Existing Issue

Please write a quick comment in the corresponding issue and ask if the feature is still relevant and that you want to work on it.

We will do our best to respond/review/merge your PR according to priority. Please note that PRs will be closed if there hasn't been activity for ~30 days.

## Reviewing Pull Requests

Another useful way to contribute is to review other people's Pull Requests. Having feedback from multiple people is helpful and reduces the overall time to make a final decision.

## Writing / Improving Documentation

Our documentation lives in the [docs](docs) directory. See a typo or improvement? Feel free to submit a Pull Request!

## Providing Support

Help the community by:
- Replying to [issues on GitHub](https://github.com/takuhii/serverless-node-next/issues)
- Chatting in [our Community Slack](https://www.serverless.com/slack)
- Answering questions in [GitHub Discussions](https://github.com/takuhii/serverless-node-next/discussions)

---

## Code Style

We use [Prettier](https://prettier.io/) for formatting and [ESLint](https://eslint.org/) for static analysis.

```bash
# Check formatting
npm run prettier

# Fix formatting
npm run prettier:fix

# Run linting
npm run lint

# Fix lint issues
npm run lint:fix
```

### Other Guidelines

- Minimize [lodash](https://lodash.com/) usage - prefer native JavaScript constructs
- Use async/await and native Promise API for asynchronous code

---

## Testing

### Unit Tests

Unit tests run locally without external dependencies:

```bash
npm run test:unit -w @serverlessinc/sf-core
npm run test:unit -w serverless
```

### Integration Tests

Integration tests require AWS credentials and Dashboard access. They run automatically as part of the CI pipeline when you submit a pull request.

For more details, see [TESTING.md](TESTING.md).

---

## Code of Conduct

Please read our [code of conduct](CODE_OF_CONDUCT.md). It outlines our core values and will make working together a happier experience.

Thanks for being a contributor to the Serverless Community! :tada:

Cheers,
The :zap: [Serverless](http://www.serverless.com) Team
