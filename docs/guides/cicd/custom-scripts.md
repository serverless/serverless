<!--
title: Serverless Dashboard - CI/CD Custom Scripts
menuText: Custom Scripts
menuOrder: 3
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://serverless.com/framework/docs/guides/cicd/custom-scripts/)

<!-- DOCS-SITE-LINK:END -->

# Custom scripts

Serverless Framework Pro runs three primary operations on your repository when you have CI/CD configured: (1) install NPM packages via `npm install`, (2) run tests, if present, with `npm test`, and (3) deploy your service using `sls deploy`. You can run custom scripts before or after each of these steps if you need to customize the pipeline further.

To run custom scripts before & after NPM install and running tests, use the lifecycle hooks built into `scripts` of your `package.json` file. The `preinstall`, `postinstall`, `pretest`, and `posttest`, scripts are run automatically at each of these steps.

To run custom scripts before or after deployment, you can use the [serverless-plugin-scripts](https://github.com/mvila/serverless-plugin-scripts) plugin to run the scripts at various points of the `serverless deploy` lifecycle, including before deployment and on finalize.

**Before npm install**

To run a script before `npm install`, set the script in `preinstall` in your `package.json`.

```json
{
  "name": "demo-serverless",
  "version": "1.0.0",
  "scripts": {
    "preinstall": "<your script>"
  }
}
```

**After npm install**

To run a script after `npm install`, set the script in `postinstall` in your `package.json`.

```json
{
  "name": "demo-serverless",
  "version": "1.0.0",
  "scripts": {
    "postinstall": "<your script>"
  }
}
```

**Before npm test**

To run a script before `npm test`, set the script in `pretest` in your `package.json`.

```json
{
  "name": "demo-serverless",
  "version": "1.0.0",
  "scripts": {
    "pretest": "<your script>"
  }
}
```

**After npm test**

To run a script after `npm test`, set the script in `posttest` in your `package.json`.

```json
{
  "name": "demo-serverless",
  "version": "1.0.0",
  "scripts": {
    "posttest": "<your script>"
  }
}
```

**Before serverless deploy**

To run a script before `serverless deploy` starts the deployment add this to your `serverless.yml`.

```yaml
plugins:
  - serverless-plugin-scripts
custom:
  scripts:
    hooks:
      'before:deploy:deploy': <your script>
```

**After serverless deploy**

To run a script after `serverless deploy` completes a deployment add this to your `serverless.yml`.

```yaml
plugins:
  - serverless-plugin-scripts
custom:
  scripts:
    hooks:
      'deploy:finalize': <your script>
```

## Additional lifecycle hooks

NPM provide additional lifecycle hooks you can run as well, additional documentation can be found here, [https://docs.npmjs.com/misc/scripts](https://docs.npmjs.com/misc/scripts).

Serverless Framework provides additional lifecycle hooks as “serverless deploy” is running, you can find more information about additional hooks in the [serverless-plugin-scripts](https://github.com/mvila/serverless-plugin-scripts) docs.
