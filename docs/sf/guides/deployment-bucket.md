<!--
title: Deployment Bucket
description: How the Framework picks and creates the S3 bucket for deployment artifacts, use your own bucket, set Lambda code storage, and clean up.
short_title: Deployment Bucket
keywords:
  [
    'Serverless Framework',
    'deployment bucket',
    'S3 deployment bucket',
    'serverless-framework-deployments',
    'codeStorageMode',
    'Lambda self-managed code storage',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/deployment-bucket)

<!-- DOCS-SITE-LINK:END -->

# Deployment Bucket

The deployment bucket is the Amazon S3 bucket that `serverless deploy` uploads a service's artifacts to: the compiled CloudFormation template, the service state file, and the function and layer zip files that Lambda and CloudFormation read. The Framework picks the bucket on every deploy and creates one when needed, so most services need no configuration. Configure it when you want your own bucket, an in-stack bucket, encryption headers, or Lambda self-managed code storage.

To deploy to a bucket you already own, set its name under `provider.deploymentBucket`:

```yaml
# serverless.yml
service: my-service

provider:
  name: aws
  runtime: nodejs24.x
  region: us-east-1
  deploymentBucket:
    name: my-company-deployments-us-east-1
```

The bucket must already exist in the Region you deploy to. The Framework uploads artifacts to it and deletes old ones, and never creates the bucket or changes its configuration.

## Which bucket a deploy uses

On every `serverless deploy`, `serverless package`, `serverless remove` and the other commands that read artifacts, the Framework picks the bucket for the stage in this order:

1. `provider.deploymentBucket.name` (or `provider.deploymentBucket` set to a bucket name as a string): that bucket.
2. The stage's CloudFormation stack has a `ServerlessDeploymentBucket` resource, and the service is not deployed through [Serverless Compose](./compose.md): that in-stack bucket. Services first deployed with Serverless Framework v3 or earlier have one.
3. One of the legacy settings is on (`provider.enableLegacyDeploymentBucket: true`, the `--enable-legacy-deployment-bucket` option, or the `ENABLE_LEGACY_DEPLOYMENT_BUCKET` environment variable): an in-stack bucket. The stack keeps the bucket it has, or creates `ServerlessDeploymentBucket` on its first deploy, also within Compose.
4. Otherwise: the shared deployment bucket of the AWS account and Region.

Within Compose, a service whose stack holds a `ServerlessDeploymentBucket` resource uploads to the shared bucket instead, unless a legacy setting is on. The stack keeps the in-stack bucket resource.

Each bucket serves one Region: Lambda reads code from a bucket in its own Region, so a service deployed to several Regions uses a deployment bucket in each.

## Shared deployment bucket

The shared deployment bucket holds the artifacts of every service the Framework deploys to one AWS account and Region without a bucket of its own. The Framework creates it, with versioning enabled, on the first command that needs it, such as `serverless deploy` or `serverless package`, and names it `serverless-framework-deployments-<region>-<id>`, where `<id>` is the first 13 characters of a random UUID:

```text
serverless-framework-deployments-us-east-1-1b9d6bcd-bbfd
```

### SSM parameter storage

The Framework finds the shared deployment bucket through the SSM parameter `/serverless-framework/deployment/s3-bucket` in the Region being deployed to; each Region has its own parameter. The parameter is a `String` whose value is JSON:

```json
{
  "bucketName": "serverless-framework-deployments-us-east-1-1b9d6bcd-bbfd",
  "bucketRegion": "us-east-1"
}
```

On each command that uses the shared bucket, the Framework reads the parameter with the deployment credentials:

- When the parameter exists, the Framework uses the bucket it names. When that bucket no longer exists, the Framework creates it again, with versioning enabled, in the parameter's `bucketRegion`.
- When the parameter does not exist, the Framework writes it with a new bucket name, then creates the bucket. The write is create-only, so the Framework never overwrites the parameter: when several deploys start in the same Region at once, one creates the bucket and the others wait up to 60 seconds for it. A deploy that waits longer stops with `The S3 bucket "<bucket>" named in the SSM parameter "/serverless-framework/deployment/s3-bucket" was not ready within 60 seconds.`; run the command again.

The bucket the parameter names must be in the Region being deployed to; otherwise the deploy stops with `Deployment bucket is not in the same region as the lambda function`.

To delete the shared bucket for good, empty and delete it, then delete the parameter in that Region. Otherwise the next deploy creates the bucket again under the same name.

### Permissions for the shared deployment bucket

A command that uses the shared deployment bucket needs these IAM actions in the deployment credentials, besides the object permissions listed in [Permissions for a custom deployment bucket](#permissions-for-a-custom-deployment-bucket):

- `ssm:GetParameter` on `/serverless-framework/deployment/s3-bucket`, on every run.
- `s3:CreateBucket` on every run: the Framework calls it to recreate a missing bucket, and treats the "already owned by you" answer as success.
- `ssm:PutParameter` and `s3:PutBucketVersioning` when the Framework creates the parameter and the bucket. In `us-east-1`, `s3:PutBucketVersioning` is also needed on every run: there, S3 answers `CreateBucket` for a bucket you already own with success instead of an error ([CreateBucket](https://docs.aws.amazon.com/AmazonS3/latest/API/API_CreateBucket.html)), and the Framework then enables versioning again.
- `s3:GetBucketVersioning` while waiting for a bucket another deploy is creating.
- `s3:GetBucketPolicy` on every `serverless deploy` with `codeStorageMode: reference` or web apps, and `s3:PutBucketPolicy` when the bucket policy doesn't yet have the `ServerlessLambdaSelfManagedCodeAccess` statement, as on the first such deploy to the bucket ([Code storage mode](#code-storage-mode-self-managed-lambda-code-storage)).

When SSM or S3 denies one of the first three, the command stops with an error that starts with:

```text
Access denied when storing the parameter "/serverless-framework/deployment/s3-bucket". Please check your permissions and try again.
```

When `s3:GetBucketVersioning` is denied while waiting, the error starts with `Access denied when checking the S3 bucket "<bucket>" named in the SSM parameter "/serverless-framework/deployment/s3-bucket".`

To deploy without these permissions, name an existing bucket in `provider.deploymentBucket.name`. Creating the shared bucket and its parameter yourself removes the need for `ssm:PutParameter`, and outside `us-east-1` for `s3:PutBucketVersioning`, but every run still needs `ssm:GetParameter` and `s3:CreateBucket`.

### Use your own bucket as the shared deployment bucket

To have every service in a Region use a bucket you control without setting `provider.deploymentBucket` in each `serverless.yml`, create the bucket and the parameter before the first deploy:

```bash
aws s3api create-bucket --bucket my-company-deployments-us-east-1 --region us-east-1
aws s3api put-bucket-versioning --bucket my-company-deployments-us-east-1 \
  --versioning-configuration Status=Enabled
aws ssm put-parameter --region us-east-1 --type String \
  --name /serverless-framework/deployment/s3-bucket \
  --value '{"bucketName":"my-company-deployments-us-east-1","bucketRegion":"us-east-1"}'
```

Enable versioning on the bucket: the Framework treats the shared bucket as versioned, for example when it deletes artifacts on `serverless remove` and when Lambda reads code from it. Outside `us-east-1`, `create-bucket` also needs `--create-bucket-configuration LocationConstraint=<region>`.

## Custom deployment bucket

Set `provider.deploymentBucket.name` to deploy a service to a bucket you manage, for example to apply your own bucket policies or to keep artifacts of several AWS accounts in one place:

```yaml
provider:
  deploymentBucket:
    name: my-company-deployments-us-east-1
    serverSideEncryption: aws:kms
    sseKMSKeyId: arn:aws:kms:us-east-1:123456789012:key/1234abcd-12ab-34cd-56ef-1234567890ab
```

The Framework never creates a custom bucket or changes its versioning, policy or other settings. The in-stack bucket settings `blockPublicAccess`, `tags` and `skipPolicySetup` have no effect on it. `versioning: true` doesn't enable versioning on a custom bucket; it makes `serverless remove` delete every object version under the stage prefix ([Cleanup of old deployment artifacts](#cleanup-of-old-deployment-artifacts)). Before uploading, `serverless deploy` checks the bucket's Region:

- A bucket that can't be found or read stops the deploy with an error that starts with `Could not locate deployment bucket: "<bucket>".`
- A bucket in another Region stops the deploy with `Deployment bucket is not in the same region as the lambda function`.

`serverless deploy --aws-s3-accelerate` stops with an error when a custom bucket is set.

### Permissions for a custom deployment bucket

With `provider.deploymentBucket.name` set, the Framework doesn't read the SSM parameter or call `s3:CreateBucket`. The deployment credentials need these S3 actions on the custom bucket:

| Action                                            | Resource                       | Used by                                                                                                                                      |
| ------------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `s3:GetBucketLocation`                            | bucket                         | `serverless deploy`, to check the bucket's Region; when it is denied, the deploy stops with `Could not locate deployment bucket`             |
| `s3:ListBucket`                                   | bucket                         | Change detection, the cleanup after each deploy, `serverless remove`, `serverless deploy list`, `serverless rollback`                        |
| `s3:PutObject`                                    | objects under the stage prefix | Artifact uploads                                                                                                                             |
| `s3:GetObject`                                    | objects under the stage prefix | Change detection, which reads the last deployment's files, and `serverless rollback`                                                         |
| `s3:DeleteObject`                                 | objects under the stage prefix | The cleanup after each deploy, and `serverless remove`                                                                                       |
| `s3:ListBucketVersions`, `s3:DeleteObjectVersion` | bucket, objects                | `serverless remove` when `deploymentBucket.versioning: true` is set                                                                          |
| `s3:GetBucketVersioning`, `s3:GetBucketPolicy`    | bucket                         | `serverless deploy` with `codeStorageMode: reference` or web apps ([Code storage mode](#code-storage-mode-self-managed-lambda-code-storage)) |

The stage prefix is `<deploymentPrefix>/<service>/<stage>/`, `serverless/my-service/dev/` by default ([What the deployment bucket stores](#what-the-deployment-bucket-stores)). With `serverSideEncryption: aws:kms`, the credentials also need `kms:GenerateDataKey` and `kms:Decrypt` on the key: Amazon S3 requires `kms:GenerateDataKey` to upload and `kms:Decrypt` to download or to upload in parts, and the Framework does both ([SSE-KMS permissions](https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingKMSEncryption.html)). The KMS key must be in the bucket's Region.

This IAM policy grants a CI role the deployment bucket permissions for the service `my-service` in every stage. The role also needs the CloudFormation, Lambda and IAM permissions of the rest of the deploy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetBucketLocation", "s3:ListBucket"],
      "Resource": "arn:aws:s3:::my-company-deployments-us-east-1"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::my-company-deployments-us-east-1/serverless/my-service/*"
    },
    {
      "Effect": "Allow",
      "Action": ["kms:GenerateDataKey", "kms:Decrypt"],
      "Resource": "arn:aws:kms:us-east-1:123456789012:key/1234abcd-12ab-34cd-56ef-1234567890ab"
    }
  ]
}
```

## In-stack deployment bucket

An in-stack deployment bucket is the `ServerlessDeploymentBucket` resource in the service's own CloudFormation stack, with a `ServerlessDeploymentBucketPolicy` that denies requests not sent over HTTPS. The bucket uses SSE-S3 (`AES256`) default encryption. A service uses an in-stack bucket when its stack already has one, or when a legacy setting asks for it ([Which bucket a deploy uses](#which-bucket-a-deploy-uses)):

```yaml
provider:
  enableLegacyDeploymentBucket: true
  deploymentBucket:
    versioning: true
    blockPublicAccess: true
    tags:
      team: payments
```

These `provider.deploymentBucket` keys configure the in-stack bucket:

| Key                 | Type    | Default | Effect                                                                                                                             |
| ------------------- | ------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `versioning`        | boolean | `false` | Enables versioning on the bucket. On a custom bucket, `serverless remove` then deletes every object version under the stage prefix |
| `blockPublicAccess` | boolean | `false` | Turns on all four S3 Block Public Access settings                                                                                  |
| `tags`              | map     | none    | Tags the bucket                                                                                                                    |
| `skipPolicySetup`   | boolean | `false` | Leaves `ServerlessDeploymentBucketPolicy` out of the stack, so you manage the bucket policy                                        |

CloudFormation deletes an in-stack bucket with the stack on `serverless remove`, after the Framework empties it.

## Deployment bucket configuration reference

`provider.deploymentBucket` is a service-wide setting: it applies to every function, layer and artifact of the service. It accepts a bucket name as a string, or an object with these keys:

| Key                                                            | Type                    | Default                 | Applies to                     | Description                                                                                                                                                                                             |
| -------------------------------------------------------------- | ----------------------- | ----------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`                                                         | string                  | none                    | custom bucket                  | An existing bucket to deploy to                                                                                                                                                                         |
| `codeStorageMode`                                              | `copy` or `reference`   | `copy`                  | every bucket                   | Where Lambda keeps function and layer code ([Code storage mode](#code-storage-mode-self-managed-lambda-code-storage))                                                                                   |
| `maxPreviousDeploymentArtifacts`                               | integer, minimum `0`    | `5`                     | every bucket                   | Number of the stage's most recent deployment directories, the new one included, that the cleanup after each `copy`-mode deploy keeps; set `1` or more ([Cleanup](#cleanup-of-old-deployment-artifacts)) |
| `serverSideEncryption`                                         | `AES256` or `aws:kms`   | none                    | every bucket                   | Sent as `ServerSideEncryption` with every artifact upload                                                                                                                                               |
| `sseKMSKeyId`                                                  | string                  | none                    | every bucket                   | KMS key for `aws:kms` uploads                                                                                                                                                                           |
| `sseCustomerAlgorithim`, `sseCustomerKey`, `sseCustomerKeyMD5` | string                  | none                    | every bucket                   | SSE-C headers sent with every artifact upload (the key name `sseCustomerAlgorithim` is spelled this way)                                                                                                |
| `versioning`                                                   | boolean                 | `false`                 | in-stack bucket, custom bucket | Enables versioning on an in-stack bucket. On a custom bucket, makes `serverless remove` delete every object version under the stage prefix, without changing the bucket                                 |
| `blockPublicAccess`, `tags`, `skipPolicySetup`                 | see the preceding table | see the preceding table | in-stack bucket                | [In-stack deployment bucket](#in-stack-deployment-bucket) settings                                                                                                                                      |

`provider.deploymentPrefix` (string, default `serverless`) is the first segment of every artifact key. `provider.enableLegacyDeploymentBucket` (boolean) selects an in-stack bucket. The [`serverless.yml` reference](../providers/aws/guide/serverless.yml.md#deployment-bucket) lists the keys with the rest of `provider`.

## What the deployment bucket stores

The Framework keeps each service's objects under the service and stage, so many services can share one bucket:

| Key                                                                  | Contents                                                                                                  |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `<deploymentPrefix>/<service>/<stage>/<timestamp>-<date>/`           | One deployment: `compiled-cloudformation-template.json`, `serverless-state.json`, function and layer zips |
| `<deploymentPrefix>/<service>/<stage>/webapps/<name>-<sha256>.zip`   | Web app code, named by content ([Web app and sandbox artifacts](#web-app-and-sandbox-artifacts))          |
| `<deploymentPrefix>/<service>/<stage>/sandboxes/<name>-<sha256>.zip` | Sandbox code, named by content                                                                            |
| `serverless-dev-mode/<service>/<stage>/`                             | Payloads that [Dev Mode](../providers/aws/guide/dev-mode.md) relays through S3                            |

## Code storage mode (self-managed Lambda code storage)

By default (`codeStorageMode: copy`), Lambda copies each deployment package into Lambda-managed storage. With `codeStorageMode: reference`, Lambda runs functions and layers directly from the deployment bucket instead ([Lambda self-managed code storage](https://docs.aws.amazon.com/lambda/latest/dg/configuration-self-managed-storage.html)): the code doesn't count against the Lambda code storage quota, and deployments activate faster.

```yaml
provider:
  deploymentBucket:
    codeStorageMode: reference
```

`codeStorageMode` applies to every zip-packaged function and layer of the service; container image functions keep running from Amazon ECR. In reference mode, the Framework:

- Pins every function and layer to the exact S3 object version it uploaded, so later uploads to the same keys never change what runs.
- On the shared deployment bucket, adds a bucket policy statement with the `Sid` `ServerlessLambdaSelfManagedCodeAccess` that grants the Lambda service principal `s3:GetObject` and `s3:GetObjectVersion`, limited to your account with an `aws:SourceAccount` condition. The Framework adds it once and keeps the bucket's other statements.
- On an in-stack bucket, requires `deploymentBucket.versioning: true` and adds the same statement to `ServerlessDeploymentBucketPolicy`. Without `versioning: true`, packaging stops with an error. With `skipPolicySetup: true`, the Framework prints a warning and you add the statement to your own policy.
- On a custom bucket, checks the bucket and never changes it: an unversioned bucket stops the deploy with an error; a bucket without a policy stops the deploy with an error that includes the statement to add; a policy that doesn't appear to grant Lambda read access prints a warning with that statement. When the policy can't be read for another reason (for example, access denied), the policy check is skipped.

`serverless rollback` and `serverless rollback function` restore functions from their pinned S3 objects, so rolling back to an earlier deployment restores exactly the code that deployment ran.

### Artifact retention in reference mode

In reference mode, deployment artifacts back live Lambda versions, so the Framework skips the cleanup of old deployments after each deploy and prints `Skipping deployment artifact cleanup (codeStorageMode: reference)`. With the default `versionFunctions: true`, each deployment publishes function versions that keep its artifacts in use, so the bucket and `serverless deploy list` grow until those versions are retired.

The `serverless prune` command retires them ([Version Pruning](../providers/aws/guide/prune.md)): it deletes old function and layer versions, and with `--includeArtifacts` it also deletes the deployment artifacts that no surviving version uses. Artifacts that still back a version, including versions an alias points to, are kept. Add `--dryRun` to preview. The `--includeArtifacts` sweep runs in `copy` mode too, which retires deployment directories that earlier reference-mode deployments left behind.

To prune after every deploy, once you know that versions beyond a certain number are unused (no alias points at them, and nothing invokes them by qualified ARN), configure `custom.prune`:

```yaml
custom:
  prune:
    automatic: true
    number: 10
    includeLayers: true
    includeArtifacts: true
```

On a versioned bucket, which the shared bucket is and reference mode requires, the `--includeArtifacts` sweep only writes S3 delete markers: it hides the artifacts and destroys nothing. On an unversioned custom bucket in `copy` mode, the sweep deletes them permanently, as the cleanup after each deploy does. To reclaim storage on a versioned bucket, add an [S3 lifecycle rule](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lifecycle-mgmt.html) that expires noncurrent object versions (`NoncurrentVersionExpiration`, optionally with `ExpiredObjectDeleteMarker` to remove the leftover markers). A pinned artifact stays the current version of its key, so such a rule never touches an artifact a live version runs.

**Warning:** Don't hard-delete object versions or overwrite objects under the deployment prefix. Lambda keeps running a function whose pinned object version was deleted, and the function still reports `Active`, until Lambda next refreshes the code from S3; from then on, the function can't run.

### Switch back to copy mode

When you remove `codeStorageMode: reference` or set it to `copy`, new deployments use Lambda-managed storage again and the cleanup after each deploy resumes. Function versions published in reference mode keep running their code from the deployment bucket, so retire them with `serverless prune` first, or keep them in mind when you manage the bucket.

On the first deploy after the switch, the Framework prints a warning that starts with `This service previously deployed with "codeStorageMode: reference".` It reads the storage mode of the previous deployment during change detection, so `serverless deploy --force` skips the warning.

### Code updates outside `serverless deploy`

`serverless deploy` sets the storage mode of every function on each deployment. A code update that doesn't set it, such as `serverless deploy function`, `aws lambda update-function-code` or a console upload, moves that function to Lambda-managed storage until the next `serverless deploy` that runs. A deploy that reports `No changes to deploy` doesn't run; `serverless deploy --force` deploys anyway.

The Lambda console code editor isn't available for functions that use self-managed code storage. `serverless package` writes a template without S3 object versions; `serverless deploy` adds them after it uploads the artifacts.

## Web app and sandbox artifacts

[Web Apps](../providers/aws/guide/web-apps.md) and [Sandboxes](../providers/aws/guide/sandboxes.md) store their code in the deployment bucket under names derived from the content:

```text
serverless/<service>/<stage>/webapps/<name>-<sha256>.zip
serverless/<service>/<stage>/sandboxes/<name>-<sha256>.zip
```

The first segment is `provider.deploymentPrefix`. Because the name changes only when the content changes:

- `serverless deploy` uploads a zip only when no object with that name exists. The check needs `s3:GetObject`; when it is denied, the deploy uploads the zip anyway, which adds an object version and changes nothing deployed.
- A service whose code and configuration are unchanged gets `No changes to deploy`, also when it has no functions (only web apps, sandboxes, agents or `resources`), as long as its stack holds the last deploy. After a deploy that failed or rolled back, the next deploy runs even when nothing changed.
- Web app zips stay in place through the cleanup of old deployments and `serverless prune --includeArtifacts`, because Lambda runs web apps from them.
- Sandbox zips are read only when an image builds. After each deploy, in either `codeStorageMode`, the Framework deletes the sandbox zips that no remaining deployment uses, except those uploaded within the last hour, which a deploy in progress may still need; `serverless prune --includeArtifacts` applies the same rule after its sweep.

Lambda reads web app code directly from the bucket, so a service with web apps needs what `codeStorageMode: reference` needs, whatever `codeStorageMode` is set to: a versioned bucket that grants the Lambda service read access. The Framework sets that up on the shared bucket, checks a custom bucket at deploy without changing it, and requires `deploymentBucket.versioning: true` on an in-stack bucket.

## Cleanup of old deployment artifacts

After each successful `serverless deploy` in `copy` mode, the Framework lists the stage's deployment directories and deletes all but the most recent `maxPreviousDeploymentArtifacts` (default `5`), the one just deployed included. For example, `maxPreviousDeploymentArtifacts: 3` keeps the new deployment and the two before it. With `maxPreviousDeploymentArtifacts: 0`, the cleanup deletes every deployment directory of the stage, the one just deployed included. With `deploymentMethod: changesets`, a deploy whose change set has no changes deletes the artifacts it just uploaded instead, in either code storage mode. With the default `deploymentMethod: direct`, a deploy that CloudFormation reports as having no updates runs the cleanup described here. In reference mode, the cleanup of old deployments is skipped ([Artifact retention in reference mode](#artifact-retention-in-reference-mode)).

`serverless remove` deletes the stage's objects from the deployment bucket: the deployment directories, web app and sandbox zips, and Dev Mode payloads. On the shared bucket, it deletes every object version and delete marker under the stage's prefix. On a custom bucket, it deletes object versions only when `deploymentBucket.versioning: true` is set, and otherwise deletes the current objects, which leaves delete markers on a versioned bucket. CloudFormation then deletes an in-stack bucket with the stack. The Framework never deletes the shared bucket or a custom bucket, because other services may use them.

## Related pages

- [Deploying to AWS](../providers/aws/guide/deploying.md): what `serverless deploy` does with the artifacts.
- [Version Pruning](../providers/aws/guide/prune.md): retire old function versions and their artifacts.
- [Serverless Compose](./compose.md): deploy several services that share one deployment bucket.
- [State](./state.md): the separate S3 bucket where Compose keeps service outputs.
