<!--
title: 'Serverless Framework Deployment Bucket'
description: 'Learn how to manage the Deployment Bucket in Serverless Framework.'
short_title: Serverless Framework Deployment Bucket
keywords:
  [
    'Serverless Framework',
    'Deployment Bucket',
    'S3 bucket',
    'deployment artifacts',
    'deployment storage',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/deployment-bucket/)

<!-- DOCS-SITE-LINK:END -->

# Serverless Framework Deployment Bucket

The Serverless Framework simplifies deploying services by managing deployment artifacts and resources efficiently.
A key component of this process is the **Deployment Bucket**, which serves as a storage mechanism for Lambda function code, CloudFormation templates,
and other resources required for service deployment, service rollback, and efficient parameter retrieval.
This guide outlines the purpose, behavior, and management of the Deployment Bucket in Serverless Framework.

### Key Features of the Deployment Bucket:

- **Per-Region Bucket**: Deployment buckets are created and managed per AWS region, ensuring that resources are stored in compliance with AWS's regional requirements for services like Lambda.
- **Shared Across Services**: For each region, the Deployment Bucket is shared across services within the same AWS account, optimizing resource management and reducing duplication.

## Managing Deployment Buckets

### Automatic Bucket Creation

When deploying a service for the first time, the Serverless Framework will automatically create a Deployment Bucket if one does not already exist in the region.
This bucket will be used for storing all future deployment artifacts for services within that region and account.

The name of the automatically created bucket follows a specific naming convention:

- It starts with a predefined prefix (`serverless-framework-deployments`).
- It includes the AWS region where the service is being deployed.
- A unique identifier (UUID) is appended to ensure bucket name uniqueness across accounts (as required by AWS).

For example, a Deployment Bucket created for the `us-east-1` region might be named:
`serverless-framework-deployments-us-east-1-abc1234567890`

Additionally, the Deployment Bucket that is automatically created will have versioning enabled by default.

#### SSM Parameter Storage

The name and region of the Deployment Bucket are stored in the AWS SSM Parameter Store under the key `/serverless-framework/deployment/s3-bucket`.
The value of this parameter is a JSON object with the following structure:

```json
{
  "bucketName": "<bucket-name>",
  "bucketRegion": "<bucket-region>"
}
```

This allows the Framework to track the bucket used for deployments, ensuring consistency across services and regions.
If the specified bucket doesn't exist, it will be automatically created by the Serverless Framework during deployment.

### Custom Bucket Configuration

In some cases, you may want to use a custom bucket instead of the default Deployment Bucket.
Custom buckets are particularly useful when you need more control over access policies, bucket properties,
or if you want to centralize deployment artifacts across multiple AWS accounts.
The Serverless Framework allows for this level of customization through configuration options in the `serverless.yml` file.

```yaml
provider:
  deploymentBucket:
    name: custom-deployment-bucket
```

This configuration ensures that the Serverless Framework will use the specified custom bucket instead of creating a new one.
To learn more about custom bucket configuration, refer to the [documentation](https://www.serverless.com/framework/docs/providers/aws/guide/serverless.yml#deployment-bucket).

## Deployment Bucket Behavior

### 1. **Deploying a New Service**:

When deploying a new service, the Serverless Framework will automatically check
for the existence of the Deployment Bucket in the specified AWS region. If no
bucket exists, it will create one. This bucket will then be used to store
deployment packages for the service, ensuring that all deployment artifacts are
stored in the correct region.

### 2. **Deploying an Existing Service Without Compose**:

For existing services deployed before Serverless Framework v4, a separate
Deployment Bucket was created per service by default. The Serverless Framework
does not change this behavior, and it continues to use the Deployment Bucket
that was created during the initial deployment (as specified in the
CloudFormation stack or YAML configuration). This ensures consistency in
deployment processes and prevents disruption to existing setups.

### 3. **Deploying with Compose**:

When deploying with [Compose](./compose), the Serverless Framework uses a shared
Deployment Bucket by default for all services, including existing ones. This
simplifies management by consolidating deployment artifacts into a single bucket
per region. However, if a custom Deployment Bucket is specified in the `provider.deploymentBucket`
field in the `serverless.yml` file, the Framework will use that bucket instead
of the shared one (see [Custom Bucket Configuration](#custom-bucket-configuration)).

## Regional Constraints and Compliance

Since AWS services like Lambda require deployment artifacts to be stored in the same region where the service is running, the Deployment Bucket is region-specific. When deploying services across multiple regions, the Serverless Framework will create and use a separate Deployment Bucket for each region. This ensures compliance with AWS's best practices for regional data storage and guarantees that your deployment artifacts are always available in the correct region.

## Migration to Centralized Deployment Buckets

The Serverless Framework supports the transition of services to a centralized Deployment Bucket model.
When deploying services with Compose, the Framework automatically uses a shared Deployment Bucket for all services within the same region.
This simplifies management and reduces the number of buckets needed for deployment artifacts
and reduces the complexity of managing multiple deployment artifacts across different services and environments.
To learn more about Compose, refer to the [Compose documentation](./compose).

## Code Storage Mode (Self-Managed Lambda Code Storage)

By default, Lambda copies your deployment package into Lambda-managed storage
(`copy` mode). With self-managed S3 code storage, Lambda runs your functions
and layers directly from the deployment bucket instead — your code no longer
counts against the Lambda code storage quota, and deployments activate
faster. See the
[AWS documentation](https://docs.aws.amazon.com/lambda/latest/dg/configuration-self-managed-storage.html)
for platform details.

Enable it with a single setting:

```yaml
provider:
  deploymentBucket:
    codeStorageMode: reference # default: copy
```

The Framework handles the AWS requirements automatically:

- Each deployment pins every function and layer to the exact S3 object
  version that was uploaded, so later uploads to the same keys never
  affect what runs.
- On the Framework-managed deployment bucket, the required bucket policy
  (Lambda service read access, scoped to your account) is added
  automatically. The bucket is already versioned.
- If your service uses the in-stack deployment bucket (see [Deploying an
  Existing Service Without Compose](#2-deploying-an-existing-service-without-compose)
  above), enable `deploymentBucket.versioning: true` — reference mode
  requires a versioned bucket, and packaging reports an error if versioning
  is not enabled. The Framework adds the required Lambda read access to the
  bucket policy it already manages in your stack (with `skipPolicySetup`,
  managing that statement is up to you).
- If you bring your own bucket (`deploymentBucket.name`), versioning must be
  enabled or the deployment stops with an error. The bucket policy is also
  checked: if the bucket has no policy at all, the deployment stops with an
  error that includes the exact statement to add; if a policy exists but
  does not appear to grant the Lambda service read access, a warning with
  that statement is printed instead. Either way, your bucket configuration
  is never modified.
- Rollbacks are reference-aware: `serverless rollback` and
  `serverless rollback function` restore functions from their pinned S3
  objects. `serverless deploy function` is a development-cycle command that
  bypasses CloudFormation; it updates the function with Lambda-managed
  storage, and the function returns to reference mode on the next
  `serverless deploy` (see the note about out-of-band code updates below).

### Artifact retention in reference mode

In reference mode, deployment artifacts back your live Lambda versions, so
the automatic post-deploy cleanup of old deployments is disabled —
deployments are retained until you retire the versions that use them. With
the default `versionFunctions: true`, each deployment publishes a new
function version that keeps its artifact in use, so the deployment bucket
listing and `serverless deploy list` grow over time until those versions are
pruned. `prune` is the retention lever in reference mode.

Retirement is handled by the `prune` command: it deletes old function and
layer versions, and with `--includeArtifacts` it also marks deployment
artifacts that no longer back any surviving version. Artifacts that still
back a version — including versions kept for aliases or older versions still
in use — are always retained. Use `--dryRun` to preview. The sweep is not
limited to reference mode; it also runs in the default copy mode, which is
useful for retiring artifact directories left behind by earlier reference-mode
deployments after switching back.

If you publish function versions or layers and have confirmed that versions
beyond a certain age are no longer used (no aliases point at them, and no
consumers invoke them by qualified ARN), you can automate retention:

```yaml
custom:
  prune:
    automatic: true
    number: 10
    includeLayers: true
    includeArtifacts: true
```

On a versioned bucket — which the Framework-managed bucket always is, and
which reference mode requires — the `--includeArtifacts` sweep only writes S3
delete markers: it hides the matched artifacts and destroys nothing. (On an
unversioned custom bucket, where the sweep can also run in copy mode, those
deletions are permanent, matching how the automatic post-deploy cleanup
behaves there.) Actual storage is reclaimed by an S3
lifecycle rule that expires noncurrent object versions (for example,
`NoncurrentVersionExpiration`, optionally with `ExpiredObjectDeleteMarker` to
clean up the leftover markers afterward). This pairs safely with the sweep:
a pinned artifact stays the current version of its key, so a
noncurrent-version rule never touches an artifact that still backs a live
version. See the
[S3 lifecycle documentation](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lifecycle-mgmt.html)
for rule syntax.

When reclaiming storage yourself, delete markers (what the sweep writes) are
the safe operation; avoid hard-deleting individual object versions or
overwriting existing objects under the deployment prefix. Removing the specific object version that a live function
is pinned to does not fail right away — invocations can keep succeeding for a
while, and the function still reports `Active` — but the function stops
working, with no advance signal, once Lambda next refreshes the code from its
source. Let the lifecycle rule reclaim noncurrent versions instead.

### Switching back to copy mode

If you remove `codeStorageMode: reference` (or set it to `copy`), new
deployments return to Lambda-managed storage — but function versions
published while reference mode was active continue to run their code
directly from the deployment bucket, and the regular artifact cleanup
becomes active again. Before switching back, retire old reference-mode
versions with `serverless prune`, or keep them in mind when managing the
bucket. The Framework prints a reminder on the next deploy after switching
back — it reads the previous deployment's recorded storage mode to decide
whether to show it. Because that reminder is produced during change
detection, `serverless deploy --force` skips it.

### Notes

- Reference mode applies to zip-packaged functions and layers. Container
  image functions continue to use Amazon ECR.
- The Lambda console code editor is not available for reference-mode
  functions (AWS limitation).
- `serverless package` output is finalized during `serverless deploy`, when
  the uploaded artifacts' S3 object versions are known.
- `serverless deploy` always restates the storage mode. If a function's code
  is updated without specifying the storage mode — for example
  `aws lambda update-function-code`, a console upload, or
  `serverless deploy function` — that function returns to Lambda-managed
  storage, and the next `serverless deploy` restores reference mode. A deploy
  that reports no changes does not run, so the mode switch persists until a
  deploy actually runs (`serverless deploy --force` deploys unconditionally).
- Service rollbacks are more dependable in reference mode: each deployment
  pins its functions and layers to exact S3 object versions, so rolling back
  to an earlier deployment restores exactly the code that deployment ran.

## Cleanup and Maintenance

When a service is removed using the `serverless remove` command, the deployment artifacts stored in the Deployment Bucket are also cleaned up.
However, the bucket itself is not automatically deleted because it may contain resources shared across multiple services.
If you want to remove the bucket entirely, this must be done manually through the AWS console or AWS CLI.
