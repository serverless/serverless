<!--
title: serverless diff
description: 'Preview what a deploy would change: compare the packaged CloudFormation template and function code with the deployed stack using serverless diff.'
short_title: diff
keywords:
  [
    'serverless diff',
    'Serverless Framework CLI',
    'CloudFormation diff',
    'deployment preview',
    'change review',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/cli-reference/diff)

<!-- DOCS-SITE-LINK:END -->

# serverless diff

`serverless diff` packages the service and compares the result with the deployed stack: which functions' code changed, and what CloudFormation would create, update, replace or remove, IAM changes included. It reads AWS and changes nothing there, so use it to review a change before [`serverless deploy`](./deploy.md), for example in a pull-request check. To see the resolved configuration rather than the template, use [`serverless print`](./print.md).

```bash
serverless diff
```

When the configuration and code match the deployed stack, the command prints:

```text
No function code changes
No infrastructure changes against the deployed stack
```

## Options

`serverless diff` accepts these options:

| Option          | Alias | Value          | Default                                         | Required | Description                                                                                                                              |
| --------------- | ----- | -------------- | ----------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `--package`     | `-p`  | directory path | Package into `package.path`, else `.serverless` | No       | Existing package directory to compare. Skips packaging.                                                                                  |
| `--json`        |       | boolean        | `false`                                         | No       | Print the result as one JSON object. See [JSON output](#json-output).                                                                    |
| `--stage`       | `-s`  | string         | `provider.stage`, else `dev`                    | No       | Stage whose deployed stack to compare with.                                                                                              |
| `--region`      | `-r`  | string         | `provider.region`, else `us-east-1`             | No       | AWS Region of that stack.                                                                                                                |
| `--aws-profile` |       | string         | `provider.profile`                              | No       | AWS profile whose credentials the command uses.                                                                                          |
| `--config`      | `-c`  | file path      | `serverless.yml`                                | No       | Service configuration file to use.                                                                                                       |
| `--stack`       |       | string         |                                                 | No       | For SAM and CloudFormation projects. `serverless diff` doesn't read it: it compares with `provider.stackName`, else `<service>-<stage>`. |

The command also accepts the options every command takes: `--param="key=value"` (repeatable), `--org`, `--app`, `--verbose`, `--debug` and `--help` (`-h`).

## What serverless diff compares

`serverless diff` reports two independent results:

1. **Function code.** For each function, the SHA-256 of the local zip is compared with the deployed Lambda function's `CodeSha256`. Functions deployed from a container `image` and functions with `package.disable: true` are left out. Functions packaged into the same zip are listed together when that zip changes; with `package.individually: true` each function is compared on its own. A service with [web apps](../guide/web-apps.md) also gets a web app code result, from the code location in each web app's revision in the local and deployed templates.
2. **CloudFormation template.** The packaged template is compared with the deployed stack's processed template, section by section: the template header, IAM statement and security group changes (in tables), parameters, metadata, mappings, conditions, resources, outputs and other sections. Before comparing, both templates go through the normalization the Framework uses to decide whether a deploy is needed, so changes in artifact S3 keys and in the generated API Gateway deployment ID don't show up.

The packaged template comes from `--package`, else from packaging the service first. When the stack does not exist, the command prints `Stack "my-service-dev" does not exist yet — treating all resources as new.` and lists every resource as new.

## Read the output

`serverless diff` prints the function code result first. `[+]` marks a function that the deployed stack doesn't have and `[~]` a function whose code changed; unchanged functions are not listed:

```text
Function Code
[+] welcome
[~] hello
```

A service with web apps also gets a `Web App Code` section, or `No web app code changes`. A web app's zip is named after its content, so changed code gives the web app's revision a new code location and the deploy creates a new revision. A JavaScript web app that isn't bundled is zipped with the service directory, so editing a shared file lists every such web app that includes it; set `package.patterns` on each web app to keep only its own files, as [Packaging](../guide/web-apps.md#packaging) describes.

The template diff follows, with resources marked `[+]` (create), `[-]` (remove) or `[~]` (update) and changed properties nested under each resource. An update that replaces the resource is marked `replace`, and the property that forces it `(requires replacement)`. IAM statement and security group changes also appear in tables of their own. A summary line ends the output:

```text
Resources: 1 to create, 2 to update, 1 to remove
```

## JSON output

With `--json`, `serverless diff` prints one JSON object on standard output and nothing else there:

```bash
serverless diff --json
```

```json
{
  "code": {
    "changed": ["hello"],
    "new": ["welcome"],
    "webApps": {
      "changed": ["api"],
      "new": []
    }
  },
  "summary": {
    "create": 4,
    "update": 0,
    "remove": 4
  },
  "resources": [
    {
      "logicalId": "WelcomeLambdaFunction",
      "changeType": "create",
      "resourceType": "AWS::Lambda::Function"
    },
    {
      "logicalId": "GoodbyeLambdaFunction",
      "changeType": "remove",
      "resourceType": "AWS::Lambda::Function"
    }
  ]
}
```

- `code.changed`: functions whose deployed `CodeSha256` differs from the local zip.
- `code.new`: functions the deployed stack doesn't have, or that are in the deployed template but not in Lambda.
- `code.webApps`: the same two lists for web apps, present only when the service defines `webApps`.
- `summary`: the number of resources CloudFormation would create, update and remove.
- `resources`: each changed resource, with its logical ID, `changeType` (`create`, `update` or `remove`) and resource type.

Functions in neither list are unchanged, or are image or `package.disable` functions.

## Side effects and CI use

- Without `--package`, `serverless diff` packages the service first, which writes the package directory as [`serverless package`](./package.md) does. In AWS it only reads: `cloudformation:GetTemplate` on the stack and `lambda:GetFunction` on each deployed function. It is safe to re-run.
- The exit code is `0` whether or not there are differences; it is non-zero only when the command can't finish, for example when credentials are missing, the packaged template can't be read, or `lambda:GetFunction` is denied. To fail a CI step on changes, read the JSON output. In this Bash step, `pipefail` keeps a failed `serverless diff` from passing when `jq` reads empty input:

  ```bash
  set -o pipefail
  serverless diff --json | jq -e '.summary.create + .summary.update + .summary.remove == 0 and (.code.changed + .code.new | length) == 0'
  ```

- The command does not prompt. The diff is printed without colors when `NO_COLOR` is set, when `FORCE_COLOR` is `0` or `false`, or when an AI agent runs the command.
- When `--package` points at a directory without the packaged template, the command stops with this error:

  ```text
  Packaged CloudFormation template not found at <path>. Run `serverless package` first, or pass `--package <path>` to point at an existing package directory.
  ```

## Provided lifecycle events

- `diff:diff`

## Examples

### Compare a stage with its deployed stack

```bash
serverless diff --stage prod --region eu-central-1
```

### Compare a package built in an earlier CI step

```bash
serverless package --stage prod --package ./artifacts
serverless diff --stage prod --package ./artifacts
```

### Use a custom configuration file

```bash
serverless diff --config serverless.prod.yml
```

## Related commands

- [`serverless package`](./package.md) builds the package that `serverless diff` compares.
- [`serverless deploy`](./deploy.md) applies the changes.
- [`serverless print`](./print.md) prints the resolved configuration.
