<!--
title: Serverless Framework - AWS Lambda Events - CloudFront
menuText: CloudFront
menuOrder: 13
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
* `viewer-request`, when the CloudFront first receives the request from the client
* `origin-request`, before the request to the origin service
* `origin-response`, when CloudFront receives the request from the origin service
* `viewer-response`, before the response returned to the client

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

  headers['x-serverless-time'] = [
      { key: 'x-serverless-time', value: Date.now().toString() },
  ];

  return callback(null, response);
};
```

For more specific setup, origin can be a object, which uses CloudFromation yaml syntax.

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
