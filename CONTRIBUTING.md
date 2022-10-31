# Contributing Guidelines

We are always looking to promote good contributors to be maintainers and provide them a front-row seat to serverless innovation.

If you would like to be a maintainer for the [Serverless Framework](https://github.com/serverless/serverless) or any of our plugins, please get started with making code contributions and engaging with open issues/PRs. Also, please reach out to any of [Serverless organization](https://github.com/serverless) members to express your interest.

We'd love to collaborate closely with amazing developers as we drive the development of this open technology into the future.

Welcome, and thanks in advance for your help!

# How to contribute to Serverless

## Setup

First, the preferred node version for development is v14; While v12 is supported on the client-side, developing in v12 can be unexpectedly tricky (see: [11250](https://github.com/serverless/serverless/pull/11250)).

Then, to begin development fork repository and run `npm install` in its root folder.

## Getting started

A good first step is to search for open [issues](https://github.com/serverless/serverless/issues). Issues are labeled, and some good issues to start with are labeled: [good first issue](https://github.com/serverless/serverless/labels/good%20first%20issue) and [help wanted](https://github.com/serverless/serverless/labels/help%20wanted).

## When you propose a new feature or bug fix

Please make sure there is an open issue discussing your contribution before jumping into a Pull Request!
There are just a few situations (listed below) in which it is fine to submit PR without a corresponding issue:

- Documentation update
- Obvious bug fix
- Maintenance improvement

In all other cases please check if there's an open an issue discussing the given proposal, if there is not, create an issue respecting all its template remarks.

In non-trivial cases please propose and let us review an implementation spec (in the corresponding issue) before jumping into implementation.

Do not submit draft PRs. Submit only finalized work which is ready for merge. If you have any doubts related to implementation work please discuss in the corresponding issue.

Once a PR has been reviewed and some changes are suggested, please ensure to **re-request review** after all new changes are pushed. It's the best and quietest way to inform maintainers that your work is ready to be checked again.

## When you want to work on an existing issue

**Note:** Please write a quick comment in the corresponding issue and ask if the feature is still relevant and that you want to jump into the implementation.

Check out our [help wanted](https://github.com/serverless/serverless/labels/help%20wanted) or [good first issue](https://github.com/serverless/serverless/labels/good%20first%20issue) labels to find issues we want to move forward with your help.

We will do our best to respond/review/merge your PR according to priority. We hope that you stay engaged with us during this period to ensure QA. Please note that the PR will be closed if there hasn't been any activity for a long time (~ 30 days) to keep us focused and keep the repo clean.

## Reviewing Pull Requests

Another really useful way to contribute to Serverless is to review other people's Pull Requests. Having feedback from multiple people is helpful and reduces the overall time to make a final decision about the Pull Request.

## Writing / improving documentation

Our documentation lives on GitHub in the [docs](docs) directory. Do you see a typo or other ways to improve it? Feel free to edit it and submit a Pull Request!

## Providing support

The easiest thing you can do to help us move forward and make an impact on our progress is to simply provide support to other people having difficulties with their Serverless projects.

You can do that by replying to [issues on GitHub](https://github.com/serverless/serverless/issues), chatting with other community members in [our Community Slack](https://www.serverless.com/slack), or helping with questions in [our Forum](http://forum.serverless.com), or [GitHub Discussions](https://github.com/serverless/serverless/discussions).

---

# Code Style

We aim for a clean, consistent code style. We're using [Prettier](https://prettier.io/) to confirm one code formatting style and [ESlint](https://eslint.org/) helps us to stay away from obvious issues that can be picked via static analysis.

Ideally, you should have Prettier and ESlint integrated into your code editor, which will help you not think about specific rules and be sure you submit the code that follows guidelines.

## Verifying prettier formatting

```
npm run prettier-check
```

## Verifying linting style

```
npm run lint
```

## Other guidelines

- Minimize [lodash](https://lodash.com/) usage - resort to it, only if given part of logic cannot be expressed easily with native language constructs
- When writing asynchronous code, ensure to take advantage of [async functions](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/async_function) and native `Promise` API. Do not rely on [Bluebird](http://bluebirdjs.com) even though still large parts of old code rely on it. We're looking forward to drop this dependency in the near future.

### Configuring deprecations

Ideally, all breaking changes should be first (before being shipped with next major) communicated with deprecation logs.

Deprecation log can be configured with the following steps:

1. Write a deprecation log with help of `serverless._logDeprecation` util.

This log should be written only if deprecated functionality is used. If applicable (to a given case) the deprecation log should be reported, after service configuration is fully resolved, but before any command logic is run. This can be achieved by attaching to the `initialize` hook ([example](https://github.com/serverless/serverless/blob/134db21ed27874ae64db1c8964523b5b5ae6c2bf/lib/plugins/aws/package/compile/events/cloudFront.js#L197-L222)).

`serverless._logDeprecation` accepts two arguments:

- `code` (e.g. `DEPRECATED_FEATURE_NAME`). Created to identify the log programmatically. This is also used to construct a link on the documentation page.
- `message` Deprecation message to be displayed to the user.

2. Document introduced deprecations at `docs/deprecations.md`. New deprecation should be listed as **first** and follow the format of other documented deprecations.

Example PRs with configured deprecations:

- [Change of default `runtime`](https://github.com/serverless/serverless/pull/9416)
- [Extending non-existent resources](https://github.com/serverless/serverless/pull/8266)
- [Deprecate `deploy -f`](https://github.com/serverless/serverless/pull/10346)

### Service configuration validation

All newly introduced configuration properties should be covered by proper changes to configuration schema. For more details about configuration validation, please see [docs/configuration-validation](./docs/configuration-validation.md).

# Testing

See [test/README](test/README.md)

# Our Code of Conduct

Finally, to make sure you have a pleasant experience while being in our welcoming community, please read our [code of conduct](CODE_OF_CONDUCT.md). It outlines our core values and beliefs and will make working together a happier experience.

Thanks again for being a contributor to the Serverless Community :tada:!

Cheers,

The :zap: [Serverless](http://www.serverless.com) Team
