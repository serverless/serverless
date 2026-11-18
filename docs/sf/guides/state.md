<!--
title: Compose State Storage
description: Where Serverless Compose stores service outputs between commands, the default S3 state bucket and its SSM parameter, and how to use your own bucket.
short_title: State
keywords:
  [
    'Serverless Framework',
    'Serverless Compose',
    'Compose state',
    'S3 state bucket',
    'serverless-framework-state',
    'service outputs',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/state)

<!-- DOCS-SITE-LINK:END -->

# Compose State Storage

[Serverless Compose](./compose.md) stores the outputs of each deployed service in an Amazon S3 state bucket, so another service can reference them (`${service-a.queueUrl}`) in a later command without redeploying the first one. Compose creates and finds the bucket by itself; configure state only to keep it in a bucket you choose.

The following `serverless-compose.yml` needs no state configuration: `service-b` reads `queueUrl` from the stored state of `service-a`.

```yaml
# serverless-compose.yml
services:
  service-a:
    path: service-a

  service-b:
    path: service-b
    params:
      queueUrl: ${service-a.queueUrl}
```

State applies to Compose projects only. A service deployed on its own with `serverless deploy` in its directory reads and writes no Compose state.

## What Compose state contains

Compose state holds, for each deployed service, the CloudFormation stack outputs of its last `deploy` or `info`, as JSON:

```json
{
  "outputs": {
    "queueUrl": "https://sqs.us-east-1.amazonaws.com/123456789012/service-a-dev-queue"
  }
}
```

Each service has one object in the state bucket, at `services/<runner type>/<stack ID>/state/state.json`. The runner type is `traditional` for a `serverless.yml` service and `cfn` for a [SAM or CloudFormation](./sam.md) service. The stack ID is the full CloudFormation stack ID with each `/` replaced by `_`, so each stage and Region of a service has its own state, and a service that is removed and deployed again gets a new state object.

## Commands that read and write Compose state

Compose writes a service's state after these commands, when it runs them on that service:

- `serverless deploy`: the stack outputs after the deploy.
- `serverless info`: the current stack outputs, which also refreshes stale state.
- `serverless remove`: an empty object (`{}`); see [State after `serverless remove`](#state-after-serverless-remove).

Compose reads state when a command needs another service's outputs and doesn't run on that service. For example, `serverless service-b deploy` reads the stored outputs of `service-a` instead of running a command on it. A service that has no stack yet has no state; a reference to it fails, or uses its fallback, as described in [Serverless Compose](./compose.md).

## Default state bucket

When `serverless-compose.yml` has no `state` key, Compose uses a default state bucket in the AWS account of the Compose project's credentials (`--aws-profile`, the AWS resolver in `serverless-compose.yml`, or the default AWS credential chain). Compose looks for the bucket in `us-east-1`, whichever Region the services deploy to:

1. Compose reads the SSM parameter `/serverless-framework/state/s3-bucket` in `us-east-1`. Its value is JSON with `bucketName` and `bucketRegion`.
2. When the parameter doesn't exist, Compose writes it with a new name, `serverless-framework-state-<uuid>`, and creates that bucket in `us-east-1` with versioning enabled. The write is create-only: when several commands start at once, one creates the bucket and the others wait up to 60 seconds for it. A command that waits longer stops with an error that starts with `The S3 bucket "<bucket>" named in the SSM parameter "/serverless-framework/state/s3-bucket" was not ready within 60 seconds.`; run it again.
3. When the parameter names a bucket that no longer exists, Compose creates it again with versioning enabled.

All Compose projects in an AWS account share this bucket. The deployment bucket that holds artifacts is a separate bucket ([Deployment Bucket](./deployment-bucket.md)).

### Permissions for the default state bucket

The Compose project's credentials need:

- `ssm:GetParameter` on `/serverless-framework/state/s3-bucket` in `us-east-1`, and `s3:CreateBucket`, on every run.
- `s3:PutBucketVersioning` on every run: the bucket is in `us-east-1`, where S3 answers `CreateBucket` for a bucket you already own with success ([CreateBucket](https://docs.aws.amazon.com/AmazonS3/latest/API/API_CreateBucket.html)), and Compose then enables versioning again.
- `ssm:PutParameter` when Compose creates the parameter.
- `s3:GetBucketVersioning` while waiting for a bucket another command is creating.
- `s3:GetObject` and `s3:PutObject` on the state bucket.

When SSM or S3 denies one of the calls that find or create the bucket (other than `s3:GetBucketVersioning` while waiting, which has its own `Access denied when checking the S3 bucket` message), the command stops with an error that starts with:

```text
Access denied when accessing /serverless-framework/state/s3-bucket SSM parameter and serverless-framework-state-... S3 bucket. Please check your permissions and try again.
```

The bucket name in the message is a newly generated one, even when the parameter already names a bucket. To run Compose without these permissions, [use your own state bucket](#use-your-own-state-bucket).

## Use your own state bucket

To keep Compose state in a bucket you manage, define an `s3` resolver for the bucket and name it in the top-level `state` key of `serverless-compose.yml`:

```yaml
# serverless-compose.yml
state: my-state-bucket

stages:
  default:
    resolvers:
      my-aws-account:
        type: aws
        region: us-east-1
        my-state-bucket:
          type: s3
          bucketName: my-company-compose-state
          region: us-east-1

services:
  service-a:
    path: service-a

  service-b:
    path: service-b
    params:
      queueUrl: ${service-a.queueUrl}
```

`state` accepts the resolver's name as a string (`state: my-state-bucket`) or as an object (`state: { resolver: my-state-bucket }`). The resolver sets:

| Key                    | Required | Description                                                                                            |
| ---------------------- | -------- | ------------------------------------------------------------------------------------------------------ |
| `type`                 | Yes      | `s3`; any other type stops the command with `Unsupported state resolver type`                          |
| `bucketName`           | Yes      | An existing bucket with versioning enabled                                                             |
| `region`               | No       | The bucket's Region. Default: `us-east-1`                                                              |
| `serverSideEncryption` | No       | Sent as the `ServerSideEncryption` header when Compose writes state, for example `AES256` or `aws:kms` |

Compose reads and writes state with the credentials of the `aws` resolver that contains the `s3` resolver (`my-aws-account` in the example). When that `aws` resolver sets its own `region`, state reads and writes use that Region, so keep both `region` values the same as the bucket's Region.

Before each Compose command, Compose checks that the bucket has versioning enabled. The check uses the Compose project's credentials (not the `aws` resolver's) and the `s3` resolver's `region` (`us-east-1` when unset), and needs `s3:GetBucketVersioning`. When the check can't read the bucket (access denied, or no such bucket), the command stops with an error that starts with `An error occurred while checking versioning for bucket "<bucket>"`. A bucket without versioning stops the command:

```text
State bucket "my-company-compose-state" is not versioned. Please enable versioning for the bucket if you want to use it as a state store.
```

Compose never creates a bucket you name in `state`, and it creates no SSM parameter for it. For more on resolvers, see [Variables](./variables/README.md) and [S3 Objects](./variables/aws/s3.md).

## State after `serverless remove`

When `serverless remove` removes a service through Compose, Compose replaces that service's state object with an empty object (`{}`). It doesn't delete the state object or the state bucket, and the versioned bucket keeps earlier versions of the state. To delete them, empty and delete the bucket yourself; for the default bucket, also delete the `/serverless-framework/state/s3-bucket` parameter in `us-east-1`, or the next Compose run creates the bucket again under the same name.

## Related pages

- [Serverless Compose](./compose.md): deploy several services together and pass outputs between them.
- [Deployment Bucket](./deployment-bucket.md): the S3 bucket that holds deployment artifacts.
- [S3 Objects](./variables/aws/s3.md): the `s3` resolver that a custom state bucket uses.
