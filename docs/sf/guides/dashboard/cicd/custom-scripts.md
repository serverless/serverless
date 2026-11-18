<!--
title: Custom Scripts in Serverless CI/CD
description: Run your own commands before or after the install, test and deploy steps of a Serverless CI/CD build, with npm scripts and deploy lifecycle hooks.
short_title: Custom Scripts
keywords:
  [
    'Serverless Framework',
    'Serverless CI/CD',
    'Custom scripts',
    'npm lifecycle scripts',
    'serverless-plugin-scripts',
    'Lifecycle hooks',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/dashboard/cicd/custom-scripts)

<!-- DOCS-SITE-LINK:END -->

# Custom scripts in Serverless CI/CD

A [Serverless CI/CD](./README.md) build runs three steps on your repository: it installs npm packages with `npm install`, runs the configured test command (`npm test` by default), and deploys the service with `serverless deploy`. To run your own commands around these steps, use npm lifecycle scripts in `package.json` for the install and test steps, and Framework lifecycle hooks in `serverless.yml` for the deploy step.

| To run a command                         | Set                                               |
| ---------------------------------------- | ------------------------------------------------- |
| Before `npm install`                     | `scripts.preinstall` in `package.json`            |
| After `npm install`                      | `scripts.postinstall` in `package.json`           |
| Before `npm test`                        | `scripts.pretest` in `package.json`               |
| After `npm test`                         | `scripts.posttest` in `package.json`              |
| After packaging, before the stack update | a `before:deploy:deploy` hook in `serverless.yml` |
| After `serverless deploy` finishes       | a `deploy:finalize` hook in `serverless.yml`      |

## Run commands around the install and test steps

npm runs the lifecycle scripts of the `package.json` in the service directory: `preinstall` and `postinstall` around the install, `pretest` and `posttest` around `npm test`. For example, to generate code after the install and seed test data before the tests:

```json
{
  "name": "my-service",
  "version": "1.0.0",
  "scripts": {
    "postinstall": "node scripts/generate.mjs",
    "pretest": "node scripts/seed-test-data.mjs",
    "test": "node --test"
  }
}
```

npm runs `pretest` and `posttest` only when it runs the `test` script, with `npm test` or `npm run test`. When the service's CI/CD settings set a test command that doesn't run the `test` script, put the extra commands in that command instead. npm documents every lifecycle script in [npm scripts](https://docs.npmjs.com/cli/using-npm/scripts).

## Run commands around the deploy step

The community plugin [serverless-plugin-scripts](https://github.com/mvila/serverless-plugin-scripts) runs shell commands at Framework lifecycle events. Its README marks it as in maintenance mode. Install it in the service directory, so the build's `npm install` restores it:

```bash
npm install --save-dev serverless-plugin-scripts
```

Then add the plugin and the hooks to `serverless.yml`. This example runs a script after the service is packaged and before the stack is updated, and another after the deploy completes:

```yaml
plugins:
  - serverless-plugin-scripts

custom:
  scripts:
    hooks:
      'before:deploy:deploy': node scripts/check-config.mjs
      'deploy:finalize': node scripts/smoke-test.mjs
```

`serverless deploy` has two lifecycle events, `deploy` and `finalize`, and the plugin accepts `before:` and `after:` hooks on each. Unless `--package` or `package.path` is set, the Framework packages the service in its own `before:deploy:deploy` hook, which runs before a plugin's hook on the same event. Each command runs in the directory where `serverless` was started. A command that exits with a non-zero code ends `serverless deploy` with an error: in a `before:deploy:deploy` hook the stack isn't updated, and in a `deploy:finalize` hook the stack is already updated. The hooks run on every `serverless deploy`, from Serverless CI/CD or from your own machine.

## Related

- [Run tests in Serverless CI/CD](./running-tests.md): the test step and its command.
- [Plugins](../../plugins/README.md): install and configure Framework plugins.
- [Serverless CI/CD](./README.md): what each build runs.
