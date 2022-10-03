<!--
title: Serverless Framework - AWS Lambda Events - CloudFront
menuText: CloudFront
menuOrder: 16
description:  Setting up CloudFront with AWS Lambda@Edge via the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/events/cloudfront)

<!-- DOCS-SITE-LINK:END -->

# CloudFront

[Amazon CloudFront](https://aws.amazon.com/cloudfront) is a content delivery network (CDN) service that allows Lambda functions to be executed at edge locations.

Distribution configuration contains origins and behaviors which are used to define how to cache and deliver content from other services.

Origin is the endpoint definition of the service that is delivered, e.g. S3 bucket or a website.

Behavior defines how the Amazon CloudFront acts when the request hits the service. That is where Lambda@Edge functions are also defined.

Lambda@Edge has four options when the Lambda function is triggered

- `viewer-request`, when the CloudFront first receives the request from the client
- `origin-request`, before the request to the origin service
- `origin-response`, when CloudFront receives the response from the origin service
- `viewer-response`, before the response returned to the client

**NOTE:** Deployments and removals can take up to 30 minutes due to the CloudFront CDN propagation.

**IMPORTANT:** Due to current [Lambda@Edge limitations](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-edge-delete-replicas.html) it's necessary to set the `DeletionPolicy` to `Retain` for AWS Lambda functions which use the `cloudFront` event. The Serverless Framework will do this automatically for you. However bear in mind that **you have to delete those AWS Lambda functions manually** once you've removed the service via `serverless remove`.

**MEMORY AND TIMEOUT LIMITS:** According to [AWS Limits on Lambda@Edge](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cloudfront-limits.html#limits-lambda-at-edge) the limits for viewer-request and viewer-response are 128MB memory and 5 seconds timeout and for origin-request and origin-response are 3008MB memory and 30 seconds timeout.

**RUNTIME LIMITS:** According to [AWS Requirements on Lambda@Edge](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-requirements-limits.html) the runtimes supported by Lambda@Edge functions are: `Python 3.9`, `Python 3.8`, `Python 3.7`, `Node.js 16.x`, `Node.js 14.x`, `Node.js 12.x`, `Node.js 10.x`.

## Simple event definition

This will enable your Lambda@Edge function to be called by a CloudFront.

```yaml
functions:
  myLambdaAtEdge:
    handler: myLambdaAtEdge.handler
    events:
      - cloudFront:
          eventType: viewer-response
          origin: s3://bucketname.s3.amazonaws.com/files
```

Example handler function that returns timestamp in the response headers. More examples can be found from [AWS documentation](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-examples.html).

```javascript
// index.handler
'use strict';

module.exports.handler = (event, context, callback) => {
  const response = event.Records[0].cf.response;
  const headers = response.headers;

  headers['x-serverless-time'] = [{ key: 'x-serverless-time', value: Date.now().toString() }];

  return callback(null, response);
};
```

For more specific setup, origin can be a object, which uses CloudFormation yaml syntax.
The `DomainName` and `CustomOriginConfig` or `S3OriginConfig` are required, for more details about origin setup visit [AWS documentation](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-cloudfront-distribution-origin.html).

```yaml
functions:
  myLambdaAtEdge:
    handler: myLambdaAtEdge.handler
    events:
      - cloudFront:
          eventType: viewer-response
          pathPattern: /docs*
          origin:
            DomainName: serverless.com
            OriginPath: /framework
            CustomOriginConfig:
              OriginProtocolPolicy: match-viewer
```

One of the CloudFront requirements is to include an empty `pathPattern` in the setup.
If there is no behavior with an empty `pathPattern` in the serverless configuration, serverless will create an additional behavior with an empty `pathPattern` pointing to the defined origin.
If there are more than one different origins, it needs to be defined as a default using `isDefaultOrigin` flag.

```yaml
functions:
  myLambdaAtEdge:
    handler: myLambdaAtEdge.handler
    events:
      - cloudFront:
          eventType: viewer-response
          pathPattern: /files*
          isDefaultOrigin: true
          origin: s3://bucketname.s3.amazonaws.com/files
  mySecondLambdaAtEdge:
    handler: mySecondLambdaAtEdge.handler
    events:
      - cloudFront:
          eventType: viewer-response
          pathPattern: /docs*
          origin:
            DomainName: serverless.com
            OriginPath: /framework
            CustomOriginConfig:
              OriginProtocolPolicy: match-viewer
```

To define functions to each event type, the same origin joins the functions to the same behavior.

```yaml
functions:
  myLambdaAtEdgeViewerRequest:
    handler: myLambdaAtEdgeViewerRequest.handler
    events:
      - cloudFront:
          eventType: viewer-request
          origin: ${self:custom.origins.myWebsiteOrigin}
  myLambdaAtEdgeViewerResponse:
    handler: myLambdaAtEdgeViewerResponse.handler
    events:
      - cloudFront:
          eventType: viewer-response
          origin: ${self:custom.origins.myWebsiteOrigin}

custom:
  origins:
    myWebsiteOrigin:
      DomainName: serverless.com
      OriginPath: /framework
      CustomOriginConfig:
        OriginProtocolPolicy: match-viewer
```

To use the same function in multiple behaviors, add multiple events into same function.

```yaml
functions:
  myLambdaAtEdge:
    handler: myLambdaAtEdge.handler
    events:
      - cloudFront:
          eventType: viewer-response
          includeBody: true
          origin: s3://bucketname.s3.amazonaws.com/files
      - cloudFront:
          eventType: viewer-response
          pathPattern: /docs*
          origin:
            DomainName: serverless.com
            OriginPath: /framework
            CustomOriginConfig:
              OriginProtocolPolicy: match-viewer
```

### Cache Behavior configuration

The default values for behaviors as generated by the serverless are

```yaml
ViewerProtocolPolicy: allow-all
```

For more specific behavior setup, behavior object can be set, which uses CloudFormation yaml syntax.
More information about behavior setup visit [AWS documentation](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-cloudfront-distribution-cachebehavior.html).

```yaml
functions:
  myLambdaAtEdge:
    handler: myLambdaAtEdge.handler
    events:
      - cloudFront:
          eventType: viewer-response
          origin: s3://bucketname.s3.amazonaws.com/files
          behavior:
            ViewerProtocolPolicy: https-only
            AllowedMethods:
              - 'GET'
              - 'HEAD'
              - 'OPTIONS'
              - 'PUT'
              - 'PATCH'
              - 'POST'
              - 'DELETE'
            CachedMethods:
              - 'GET'
              - 'HEAD'
              - 'OPTIONS'
```

### Cache Policy configuration

For more specific cache behavior setup, you can use CloudFront Cache Policy.
Use provider level `cloudFront.cachePolicies` property to define your policies, which uses CloudFormation yaml syntax. For more information about behavior setup visit [AWS documentation](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-cloudfront-cachepolicy.html).

You can then reference your policy within your event using its name.

```yml
provider:
  cloudFront:
    cachePolicies:
      myCachePolicy:
        MinTTL: 0
        MaxTTL: 86000
        DefaultTTL: 3600
        ...

functions:
  myLambdaAtEdge:
    handler: myLambdaAtEdge.handler
    events:
      - cloudFront:
          eventType: viewer-response
          origin: s3://bucketname.s3.amazonaws.com/files
          cachePolicy:
            name: myCachePolicy
```

This configuration will create a Cache Policy named `servicename-stage-myCachePolicy`.

You can reference [AWS Managed Policies](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-cache-policies.html#managed-cache-policies-list) using an `id` property instead of `name`

```yml
functions:
  myLambdaAtEdge:
    handler: myLambdaAtEdge.handler
    events:
      - cloudFront:
          eventType: viewer-response
          origin: s3://bucketname.s3.amazonaws.com/files
          cachePolicy:
            id: 658327ea-f89d-4fab-a63d-7e88639e58f6 # references AWS Managed Policy named Managed-CachingOptimized
```

It is also possible to reference policies with `behavior.CachePolicyId` property. When both `cachePolicy.id` and `behavior.CachePolicyId` are specified, setting from `cachePolicy.id` will be used. Similarily, when `cachePolicy.name` and `behavior.CachePolicyId` are specified, setting from `cachePolicy.name` will be used.

```yml
functions:
  myLambdaAtEdge:
    handler: myLambdaAtEdge.handler
    events:
      - cloudFront:
          eventType: viewer-response
          origin: s3://bucketname.s3.amazonaws.com/files
          behavior:
            CachePolicyId: 658327ea-f89d-4fab-a63d-7e88639e58f6 # references AWS Managed Policy named Managed-CachingOptimized
```

### CloudFront Distribution configurations

Amazon CloudFront distribution configurations can be set in the resources block of the serverless.yml, by defining `CloudFrontDistribution`.

```yaml
resources:
  Resources:
    CloudFrontDistribution:
      Type: AWS::CloudFront::Distribution
      Properties:
        DistributionConfig:
          PriceClass: PriceClass_100
          Aliases:
            - mysite.example.com
          ViewerCertificate:
            AcmCertificateArn: arn:aws:acm:us-east-1:000000000000:certificate/eb96757c-c78e-4843-bb17-2f09747b6f0d
            SslSupportMethod: sni-only
```

## Current gotchas

CloudFront behaviors have to have unique path pattern that catches the request.

So following setup **is not valid** because it assumes that behaviors for both events have an empty path pattern.

```yaml
functions:
  myLambdaAtEdge:
    handler: myLambdaAtEdge.handler
    events:
      - cloudFront:
          eventType: viewer-request
          origin: s3://bucketname.s3.amazonaws.com/files
      - cloudFront:
          eventType: viewer-request
          origin: s3://bucketname.s3.amazonaws.com/other
```
