<!--
title: CloudFront Lambda@Edge Events
description: 'Run Lambda@Edge functions on CloudFront requests and responses with the cloudFront event: event types, origins, path patterns and cache policies.'
short_title: CloudFront (Lambda@Edge)
keywords:
  [
    'Serverless Framework',
    'Lambda@Edge',
    'CloudFront Lambda trigger',
    'CloudFront cache behavior',
    'CloudFront cache policy',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/events/cloudfront)

<!-- DOCS-SITE-LINK:END -->

# CloudFront Lambda@Edge Events

The `cloudFront` event runs a Lambda function as a Lambda@Edge function: CloudFront invokes it at its edge locations when it receives a viewer request, forwards a request to the origin, receives the origin's response, or returns a response to the viewer. The Framework creates one Amazon CloudFront distribution for the service, with an origin and a cache behavior for each `cloudFront` event, and associates the function's published version with the behavior.

Lambda@Edge functions must be deployed to `us-east-1`. This `serverless.yml` adds a response header to every object served from an S3 bucket:

```yaml
# serverless.yml
service: my-service

provider:
  name: aws
  runtime: nodejs24.x
  region: us-east-1

functions:
  addHeader:
    handler: handler.addHeader
    events:
      - cloudFront:
          eventType: viewer-response
          origin: s3://amzn-s3-demo-bucket.s3.amazonaws.com/files
```

The handler receives the CloudFront event in `event.Records[0].cf` and returns the response to send:

```javascript
// handler.mjs
export const addHeader = async (event) => {
  const response = event.Records[0].cf.response
  response.headers['x-serverless-time'] = [
    { key: 'x-serverless-time', value: Date.now().toString() },
  ]
  return response
}
```

After `serverless deploy`, the stack outputs `CloudFrontDistribution` (the distribution ID) and `CloudFrontDistributionDomainName` (the `*.cloudfront.net` domain that serves the content). CloudFront replicates the function to its edge locations, so deploys and removals of a service with a `cloudFront` event take longer than for other services. For the event structure and more handler examples, see [Lambda@Edge example functions](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-examples.html).

## cloudFront event options

The `cloudFront` event accepts these keys:

| Key               | Type                                                                       | Default                           | Description                                                                                       |
| ----------------- | -------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------- |
| `eventType`       | `viewer-request`, `origin-request`, `origin-response` or `viewer-response` | Required                          | When CloudFront invokes the function                                                              |
| `origin`          | URL string or origin object                                                | Required                          | The origin the behavior forwards requests to                                                      |
| `pathPattern`     | string                                                                     | No pattern: the default behavior  | The request paths the behavior matches, such as `/images/*`                                       |
| `isDefaultOrigin` | boolean                                                                    | `false`                           | Makes this event's origin the target of the default behavior when the service has several origins |
| `includeBody`     | boolean                                                                    | Not set                           | Exposes the request body to the function                                                          |
| `behavior`        | object                                                                     | `ViewerProtocolPolicy: allow-all` | Cache behavior settings, in CloudFormation syntax                                                 |
| `cachePolicy`     | object with `id` or `name`                                                 | Managed `CachingOptimized` policy | The cache policy for the behavior                                                                 |

## Event types

The `cloudFront` event's `eventType` sets the point in the request flow where CloudFront invokes the function:

- `viewer-request`: after CloudFront receives a request from a viewer, before it checks its cache.
- `origin-request`: before CloudFront forwards a request to the origin, on a cache miss.
- `origin-response`: after CloudFront receives the response from the origin.
- `viewer-response`: before CloudFront returns the response to the viewer.

Each behavior runs at most one function per event type. To run functions at several points for the same requests, give their events the same `origin` and `pathPattern`; the Framework joins them into one behavior:

```yaml
functions:
  rewriteRequest:
    handler: handler.rewriteRequest
    events:
      - cloudFront:
          eventType: viewer-request
          origin: https://example.com/framework
  addHeader:
    handler: handler.addHeader
    events:
      - cloudFront:
          eventType: viewer-response
          origin: https://example.com/framework
```

For what each event type can read and change, see [CloudFront events that can trigger a Lambda@Edge function](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-cloudfront-trigger-events.html).

## Origins

The `cloudFront` event's `origin` takes a URL string or an origin object. In a URL string, the scheme selects the origin type and the path becomes the origin path:

- `s3://amzn-s3-demo-bucket.s3.amazonaws.com/files`: an S3 origin for the bucket, with origin path `/files`.
- `https://example.com/framework`, or any other scheme: a custom origin with `OriginProtocolPolicy: match-viewer`.

For other origin settings, use an origin object in CloudFormation syntax. `DomainName` is required, together with exactly one of `CustomOriginConfig` or `S3OriginConfig`:

```yaml
functions:
  addHeader:
    handler: handler.addHeader
    events:
      - cloudFront:
          eventType: viewer-response
          pathPattern: /docs*
          origin:
            DomainName: example.com
            OriginPath: /framework
            CustomOriginConfig:
              OriginProtocolPolicy: https-only
```

The origin object accepts these properties:

- `DomainName`: required; a string or a CloudFormation intrinsic function.
- `CustomOriginConfig`: `OriginProtocolPolicy` (required: `http-only`, `match-viewer` or `https-only`), `HTTPPort` and `HTTPSPort` (0–65535), `OriginKeepaliveTimeout` and `OriginReadTimeout` (1–60 seconds), `OriginSSLProtocols` (a list of `SSLv3`, `TLSv1`, `TLSv1.1`, `TLSv1.2`).
- `S3OriginConfig`: optional `OriginAccessIdentity` (`origin-access-identity/cloudfront/ID`).
- `OriginAccessControlId`, `OriginPath`, `OriginCustomHeaders` (a list of `HeaderName` and `HeaderValue`), `ConnectionAttempts` (1–3) and `ConnectionTimeout` (1–10 seconds).

Events with an equal origin share it in the distribution. See [AWS::CloudFront::Distribution Origin](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-properties-cloudfront-distribution-origin.html).

## Path patterns and the default behavior

A CloudFront distribution needs a default behavior, which has no path pattern. The `cloudFront` event without `pathPattern` defines it. When no event omits `pathPattern`, the Framework adds a default behavior that forwards to the service's origin, with the settings of the first behavior and no function.

When the events use more than one origin, set `isDefaultOrigin: true` on one event to choose the default behavior's origin:

```yaml
functions:
  files:
    handler: handler.files
    events:
      - cloudFront:
          eventType: viewer-response
          pathPattern: /files*
          isDefaultOrigin: true
          origin: s3://amzn-s3-demo-bucket.s3.amazonaws.com/files
  docs:
    handler: handler.docs
    events:
      - cloudFront:
          eventType: viewer-response
          pathPattern: /docs*
          origin: https://example.com/framework
```

The `cloudFront` event's `pathPattern` accepts letters, digits, `_ . * ? $ / ~ " ' @ : + -` and `&amp;`. Every behavior needs a unique path pattern, so two events with different origins and no `pathPattern` stop packaging (see [Troubleshooting CloudFront events](#troubleshooting-cloudfront-events)). For the pattern syntax, see [Path pattern](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DownloadDistValuesCacheBehavior.html#DownloadDistValuesPathPattern).

To use one function in several behaviors, add an event for each behavior:

```yaml
functions:
  addHeader:
    handler: handler.addHeader
    events:
      - cloudFront:
          eventType: viewer-response
          origin: s3://amzn-s3-demo-bucket.s3.amazonaws.com/files
      - cloudFront:
          eventType: viewer-response
          pathPattern: /docs*
          origin: https://example.com/framework
```

## Cache behavior configuration

The `cloudFront` event's `behavior` sets the CloudFront cache behavior for the event's path pattern, in CloudFormation syntax. Without `behavior`, the Framework uses `ViewerProtocolPolicy: allow-all`. This example redirects HTTP to HTTPS and allows all HTTP methods:

```yaml
functions:
  addHeader:
    handler: handler.addHeader
    events:
      - cloudFront:
          eventType: viewer-response
          origin: s3://amzn-s3-demo-bucket.s3.amazonaws.com/files
          behavior:
            ViewerProtocolPolicy: redirect-to-https
            AllowedMethods:
              - GET
              - HEAD
              - OPTIONS
              - PUT
              - PATCH
              - POST
              - DELETE
            CachedMethods:
              - GET
              - HEAD
              - OPTIONS
```

The `behavior` object accepts these properties:

- `ViewerProtocolPolicy`: `allow-all`, `redirect-to-https` or `https-only`.
- `AllowedMethods`: `[GET, HEAD]`, `[GET, HEAD, OPTIONS]` or all seven methods. `CachedMethods`: `[GET, HEAD]` or `[GET, HEAD, OPTIONS]`.
- `CachePolicyId`, `OriginRequestPolicyId`, `ResponseHeadersPolicyId`, `FieldLevelEncryptionId`: policy and configuration IDs.
- `Compress`, `SmoothStreaming`: booleans.
- `TrustedKeyGroups`, `TrustedSigners`: lists for signed URLs and cookies.
- `ForwardedValues`, `MinTTL`, `MaxTTL`, `DefaultTTL`: legacy cache settings, used instead of a cache policy.

See [AWS::CloudFront::Distribution CacheBehavior](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-properties-cloudfront-distribution-cachebehavior.html).

## Cache policies

The Framework attaches the AWS managed `CachingOptimized` cache policy (`658327ea-f89d-4fab-a63d-7e88639e58f6`) to each behavior unless the event sets `cachePolicy`, or its `behavior` sets `CachePolicyId`, `ForwardedValues`, `MinTTL`, `MaxTTL` or `DefaultTTL`.

To attach another managed or existing cache policy, set the `cloudFront` event's `cachePolicy.id`:

```yaml
functions:
  addHeader:
    handler: handler.addHeader
    events:
      - cloudFront:
          eventType: viewer-response
          origin: s3://amzn-s3-demo-bucket.s3.amazonaws.com/files
          cachePolicy:
            id: 4135ea2d-6df8-44a3-9df3-4b5a84be39ad # Managed-CachingDisabled
```

To create a cache policy in the service, define it under `provider.cloudFront.cachePolicies` and reference it by key with `cachePolicy.name`. The Framework creates an `AWS::CloudFront::CachePolicy` named `<service>-<stage>-<key>`:

```yaml
provider:
  name: aws
  runtime: nodejs24.x
  region: us-east-1
  cloudFront:
    cachePolicies:
      shortLived:
        MinTTL: 0
        DefaultTTL: 60
        MaxTTL: 3600
        ParametersInCacheKeyAndForwardedToOrigin:
          CookiesConfig:
            CookieBehavior: none
          EnableAcceptEncodingGzip: true
          HeadersConfig:
            HeaderBehavior: whitelist
            Headers:
              - authorization
          QueryStringsConfig:
            QueryStringBehavior: all

functions:
  addHeader:
    handler: handler.addHeader
    events:
      - cloudFront:
          eventType: viewer-response
          origin: s3://amzn-s3-demo-bucket.s3.amazonaws.com/files
          cachePolicy:
            name: shortLived
```

- Each policy takes the CloudFormation `CachePolicyConfig` properties except `Name`. `MinTTL`, `DefaultTTL`, `MaxTTL` and `ParametersInCacheKeyAndForwardedToOrigin` are required; inside it, `CookiesConfig`, `EnableAcceptEncodingGzip`, `HeadersConfig` and `QueryStringsConfig` are required. `Comment` and `EnableAcceptEncodingBrotli` are optional.
- `CookieBehavior` and `QueryStringBehavior` accept `none`, `whitelist`, `allExcept` or `all`; `HeaderBehavior` accepts `none` or `whitelist`.
- `cachePolicy` takes either `id` or `name`. `cachePolicy` wins over `behavior.CachePolicyId` when both are set.
- A policy under `provider.cloudFront.cachePolicies` that no event references is still created, and the Framework prints a warning.

See [Use managed cache policies](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-cache-policies.html) and [CachePolicyConfig](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-properties-cloudfront-cachepolicy-cachepolicyconfig.html).

## Request body access

To read or replace the request body in a `viewer-request` or `origin-request` function, set the `cloudFront` event's `includeBody: true`:

```yaml
functions:
  inspectBody:
    handler: handler.inspectBody
    events:
      - cloudFront:
          eventType: origin-request
          includeBody: true
          origin: https://example.com/framework
```

CloudFront passes the body base64-encoded and truncates it at 40 KB for viewer requests and 1 MB for origin requests. See [Restrictions on the request body with the include body option](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-at-edge-function-restrictions.html#lambda-at-edge-restrictions-request-body).

## Distribution settings

The Framework names the distribution resource `CloudFrontDistribution`. To set distribution properties that the `cloudFront` event doesn't cover, such as a custom domain or a price class, extend the resource under `resources`:

```yaml
resources:
  Resources:
    CloudFrontDistribution:
      Type: AWS::CloudFront::Distribution
      Properties:
        DistributionConfig:
          PriceClass: PriceClass_100
          Aliases:
            - www.example.com
          ViewerCertificate:
            AcmCertificateArn: arn:aws:acm:us-east-1:123456789012:certificate/eb96757c-c78e-4843-bb17-2f09747b6f0d
            SslSupportMethod: sni-only
```

The Framework merges these properties into the distribution it generates. For more about extending generated resources, see [Override AWS CloudFormation resources](../guide/resources.md#override-aws-cloudformation-resource).

## Lambda@Edge function requirements

Functions with a `cloudFront` event follow the Lambda@Edge rules, and the Framework applies some of them:

- **Region**: the service must deploy to `us-east-1`.
- **Memory and timeout**: for `viewer-request` and `viewer-response` events, the Framework accepts a function `memorySize` of at most 128 MB and a `timeout` of at most 5 seconds; for `origin-request` and `origin-response` events, at most 10,240 MB and 30 seconds. When the function doesn't set `memorySize` or `timeout`, the Framework sets 128 MB and 5 seconds; `provider.memorySize` and `provider.timeout` don't apply to these functions.
- **Versions**: the Framework publishes a numbered version of each function and associates that version with the distribution.
- **Removed settings**: the Framework removes the VPC configuration and environment variables from these functions, because Lambda@Edge doesn't support them.
- **Other unsupported features**: layers, the `arm64` architecture, X-Ray tracing, provisioned concurrency, dead-letter queues and container images. Keep these out of functions with a `cloudFront` event.
- **Size**: at most 50 MB compressed, including libraries.
- **Runtimes**: the latest Node.js and Python runtimes.

See [Restrictions on Lambda@Edge](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-at-edge-function-restrictions.html) and [Quotas on Lambda@Edge](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cloudfront-limits.html#limits-lambda-at-edge).

## IAM permissions for Lambda@Edge

For a `cloudFront` event, the Framework adds to the default execution role:

- `edgelambda.amazonaws.com` as a trusted principal, next to `lambda.amazonaws.com`.
- `logs:CreateLogGroup`, `logs:CreateLogStream`, `logs:PutLogEvents` and `logs:TagResource` on log groups in all Regions, because Lambda@Edge writes logs in the Region closest to where the function runs.

It also adds a `lambda:InvokeFunction` permission for `edgelambda.amazonaws.com`, limited to the distribution, on each function version. When the functions use a custom `role`, add the trust relationship and the log permissions to that role; see [Set up IAM permissions and roles for Lambda@Edge](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-edge-permissions.html).

## Remove a service with Lambda@Edge functions

AWS deletes a Lambda@Edge function only after CloudFront has deleted its replicas, which takes a few hours after the distribution is removed. The Framework therefore sets `DeletionPolicy: Retain` on every function with a `cloudFront` event. `serverless remove` deletes the distribution and the rest of the stack, keeps those functions, and prints:

```text
Don't forget to manually remove your Lambda@Edge functions once the CloudFront distribution removal is successfully propagated!
```

After CloudFront has removed the replicas, delete the functions in the Lambda console or with `aws lambda delete-function`. See [Delete Lambda@Edge functions and replicas](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-edge-delete-replicas.html).

## Troubleshooting CloudFront events

### `Found more than one behavior with the same PathPattern`

This happens when two `cloudFront` events have the same `pathPattern`, or none, but different origins. Each behavior needs a unique path pattern. Give one of the events a `pathPattern`:

```yaml
functions:
  addHeader:
    handler: handler.addHeader
    events:
      - cloudFront:
          eventType: viewer-request
          origin: s3://amzn-s3-demo-bucket.s3.amazonaws.com/files
      - cloudFront:
          eventType: viewer-request
          pathPattern: /other*
          origin: s3://amzn-s3-demo-bucket.s3.amazonaws.com/other
```

### `Found more than one origin but none of the cloudfront event has "isDefaultOrigin" defined`

This happens when every `cloudFront` event has a `pathPattern` and the events use more than one origin. Set `isDefaultOrigin: true` on the event whose origin should serve the default behavior. Setting it on events with different origins stops packaging with `Found more than one cloudfront event with "isDefaultOrigin" defined`.

### `The event type of a function association must be unique in the cache behavior`

This happens when two events with the same `origin` and `pathPattern` use the same `eventType`. A behavior runs one function per event type: change the `eventType` or the `pathPattern` of one event.

### `CloudFront associated functions have to be deployed to the us-east-1 region.`

This happens when the service deploys to another Region. Set `provider.region: us-east-1`, or deploy with `--region us-east-1`. Keep functions that must run in another Region in a separate service.

## Related

- [Lambda@Edge in the CloudFront Developer Guide](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-at-the-edge.html)
- [CloudFront settings in the serverless.yml reference](../guide/serverless.yml.md#cloudfront)
- [AWS Lambda functions](../guide/functions.md)
