# How to run, organize and write tests?

As framework deals with significant technical debt baggage many of currently configured tests do not
resemble practise we want to follow in newly introduced tests.

Please follow this document as the only guideline, it also provides links to tests that serve as a good example to replicate

## Unit tests

Tests are configured with [Mocha](https://mochajs.org/) test framework, and can be run with following command

```
npm test
```

All new tests should be configured with help of [runServerless](./utils/run-serverless.js) util - it's the only way to test functionality against completely intialized `serverless` instance, and it's the only scenario that reflects real world usage.

Check documentation of `runServerless` at [@serverless/test/docs/run-serverless](https://github.com/serverless/test/blob/master/docs/run-serverless.md#run-serverless)

### Existing test examples:

- [Run against config passed inline](https://github.com/serverless/serverless/blob/73107822945a878abbdebe2309e8e9d87cc2858a/lib/plugins/aws/package/lib/generateCoreTemplate.test.js#L11-L14)
- [Run against preprepared fixture](https://github.com/serverless/serverless/blob/73107822945a878abbdebe2309e8e9d87cc2858a/lib/plugins/aws/package/compile/functions/index.test.js#L2629-L2632)
  - Fixtures can be [extended](https://github.com/serverless/serverless/blob/4c2a52d1bf8fdb15683c09a8db800aa0e5842950/lib/plugins/aws/package/compile/events/httpApi/index.test.js#L119) on spot. Whenever possible it's better to extend existing fixture (e.g. basic `function`) instead of creating new one (check [ALB health check tests](https://github.com/serverless/serverless/blob/04d463f4e438d02fef958fce34677a06645fee82/lib/plugins/aws/package/compile/events/alb/lib/healthCheck.test.js) for good example on such approach)
  - If needed introduce new test fixtures at [tests/fixtures](./fixtures)

Example of test files fully backed by `runServerless`:

- [lib/plugins/aws/package/compile/events/httpApi/index.test.js](https://github.com/serverless/serverless/blob/master/lib/plugins/aws/package/compile/events/httpApi/index.test.js)

If we're about to add new tests to an existing test file with tests written old way, then best is to create another `describe` block for new tests at the bottom (as it's done [here](https://github.com/serverless/serverless/blob/73107822945a878abbdebe2309e8e9d87cc2858a/lib/plugins/aws/package/compile/functions/index.test.js#L2624))

_Note: PR's which rewrite existing tests into new method are very welcome! (but, ideally each PR should cover single test file rewrite)_

### Coverage

We aim for a (near) 100% test coverage, so make sure your tests cover as much of your code as possible.

During development, you can easily check coverage by running `npm run coverage`, then opening the `index.html` file inside the `coverage` directory.

## AWS Integration tests

Run via:

```
AWS_ACCESS_KEY_ID=XXX AWS_SECRET_ACCESS_KEY=xxx npm run integration-test-run-all
```

_Note: Home folder is mocked for test run, therefore relying on `AWS_PROFILE` won't work. _ and _secret key_, need to be configured directly into env variables\_

Ideally any feature that integrates with AWS functionality should be backed by integration test.

Check existing set of AWS integration tests at [tests/integration-all](./integration-all)

## Testing templates

If you add a new template or want to test a template after changing it you can run the template integration tests. Make sure you have `docker` and `docker-compose` installed as they are required. The `docker` containers we're using through compose are automatically including your `$HOME/.aws` folder so you can deploy to AWS.

To run all integration tests run:

```
./tests/templates/test-all-templates
```

To run only a specific integration test run:

```
tests/templates/integration-test-template TEMPLATE_NAME BUILD_COMMAND
```

so for example:

```
tests/templates/integration-test-template aws-java-maven mvn package
```

If you add a new template make sure to add it to the `test-all-templates` file and configure the `docker-compose.yml` file for your template.
