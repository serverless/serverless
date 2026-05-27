<!--
title: Serverless Framework Commands - AWS Lambda - Diff
description: Show the difference between the local CloudFormation template and the deployed stack.
short_title: Commands - Diff
keywords:
  [
    'Serverless',
    'Framework',
    'AWS',
    'Lambda',
    'Diff',
    'CloudFormation',
    'Deployment Preview',
    'Change Review',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/cli-reference/diff)

<!-- DOCS-SITE-LINK:END -->

# AWS - Diff

The `sls diff` command shows the difference between the CloudFormation template generated from your current configuration and the stack currently deployed in AWS. It is useful for reviewing changes before running `sls deploy`, especially in CI / PR-review workflows.

```bash
serverless diff
```

Two orthogonal signals are surfaced:

1. **Function Code changes** — per-function comparison of the locally-packaged zip against each Lambda's `CodeSha256` in AWS. Tells you which functions will have their code redeployed.
2. **CloudFormation template diff** — a structured diff of resources, IAM statements, security groups, parameters, outputs, and other top-level template sections. Tells you what CloudFormation will change.

By default, the service is packaged first so the local template reflects the current configuration on disk. If you already have a packaged artifact directory (for example, from a previous CI step), pass `--package <path>` to use it directly and skip repackaging.

## Options

- `--stage` or `-s` The service stage to diff against. Defaults to the stage from `serverless.yml` or `dev`.
- `--region` or `-r` The service region to diff against.
- `--aws-profile` The AWS profile to use.
- `--stack` CloudFormation stack name override.
- `--package` or `-p` Path to an existing package directory to diff against. Skips the auto-package step when set.
- `--json` Output the diff in JSON format. Suitable for CI consumption.

## Provided lifecycle events

- `diff:diff`

## Examples

### No changes against the deployed stack

```text
Packaging "my-service" for stage "dev" (us-east-1)
No function code changes
No infrastructure changes against the deployed stack
✔ Service packaged (2s)
```

### Configuration-only change

You bumped a Lambda's memory but did not edit any handler files:

```text
Function Code
(no entries — handler bytes are unchanged)

Resources
[~] AWS::Lambda::Function HelloLambdaFunction
 └─ [~] MemorySize
     ├─ [-] 1024
     └─ [+] 2048

Resources: 1 to create, 1 to update, 1 to remove
```

The `Function Code` section is empty (or absent) because no handler files changed. The structured diff shows the property change and the matching Lambda Version churn that CloudFormation will perform.

### Code-only change

You edited a handler but did not touch the service configuration:

```text
Function Code
[~] hello
[~] goodbye

Resources
[-] AWS::Lambda::Version HelloLambdaVersion3rde2gUOpvd… orphan
[-] AWS::Lambda::Version GoodbyeLambdaVersion3o1zjawHn… orphan
[+] AWS::Lambda::Version HelloLambdaVersionymnhJ7QiGZ…
[+] AWS::Lambda::Version GoodbyeLambdaVersionui2HS54XZ…

Resources: 2 to create, 0 to update, 2 to remove
```

Both functions appear under `Function Code` because they share a single zip under default packaging. Services using `package.individually: true` see per-function granularity.

### Replacement (resource will be destroyed and recreated)

```text
[~] AWS::Lambda::Function HelloLambdaFunction replace
 ├─ [~] FunctionName (requires replacement)
 │   ├─ [-] my-service-dev-hello
 │   └─ [+] hello-renamed
 ├─ [~] Code
 └─ [~] MemorySize
     ├─ [-] 256
     └─ [+] 1024
```

The `replace` marker on the resource header and `(requires replacement)` on the offending property make destroy-and-recreate operations unmistakable.

### IAM changes (security-relevant)

```text
IAM Statement Changes
┌───┬────────────────────────────────────┬────────┬──────────────┬───────────────────────────────┬───────────┐
│   │ Resource                           │ Effect │ Action       │ Principal                     │ Condition │
├───┼────────────────────────────────────┼────────┼──────────────┼───────────────────────────────┼───────────┤
│ + │ arn:aws:s3:::my-bucket/*           │ Allow  │ s3:GetObject │ AWS:${IamRoleLambdaExecution} │           │
└───┴────────────────────────────────────┴────────┴──────────────┴───────────────────────────────┴───────────┘
```

A dedicated IAM table appears whenever IAM or Security Group changes are part of the diff — useful for security review.

### Stack does not exist yet (first deploy)

```text
Stack "my-service-dev" does not exist yet — treating all resources as new.
Function Code
[+] hello
[+] goodbye

Resources
[+] AWS::Logs::LogGroup HelloLogGroup
[+] AWS::IAM::Role IamRoleLambdaExecution
[+] AWS::Lambda::Function HelloLambdaFunction
...

Resources: 7 to create, 0 to update, 0 to remove
```

### JSON output

```bash
serverless diff --json
```

```json
{
  "code": {
    "changed": ["hello"],
    "new": ["welcome"]
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

The `code` field reports per-function code changes:

- `changed` — functions whose deployed `CodeSha256` differs from the local zip hash.
- `new` — functions present locally but not in the deployed stack.

Functions not listed in either array are unchanged (or are container-image functions / `package.disable: true`, which are excluded since they have no comparable zip artifact). If a function's remote configuration cannot be read — typically a missing `lambda:GetFunction` permission, or a Lambda missing in AWS despite being present in the deployed CloudFormation template — the diff fails fast with a clear error rather than producing a partial-state report.

The `summary` field aggregates CloudFormation resource changes by type. The `resources` array lists each changed resource with its CloudFormation logical ID and resource type.

### Diffing an existing package directory

When the artifact directory already exists — for example, packaged in an earlier CI step — pass it explicitly to skip the auto-package step:

```bash
serverless diff --package ./.serverless
```

This reads the CloudFormation template and zip artifacts from the given directory rather than regenerating them.

## Exit code

`sls diff` exits `0` unless an unrecoverable error occurs (for example, AWS credentials are missing or the local template could not be read). Differences against the deployed stack do not cause a non-zero exit code — the command is informational.

## Behavior notes

- The structured diff applies the same template normalization the framework uses internally to decide whether a deploy is necessary, so artifact-key churn that the framework considers meaningless does not appear in the diff.
- The `Function Code` section is the truthful "did handler code change?" signal — it compares zip hashes against AWS Lambda's `CodeSha256`. It is independent of the template-level diff below it.
- Custom configuration filenames (`--config my-service.yml`) are supported.
