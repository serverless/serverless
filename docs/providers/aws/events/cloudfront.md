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

## Simple event definition

This will enable your Lambda@Edge function to be called by a CloudFront.

```yaml
functions:
  myLambdaAtEdge:
    handler: myLambdaAtEdge.handler
    events:
      - cloudFront:
          eventType: viewer-request
          origin: s3://bucketname.s3.amazonaws.com/files
```

For more specific setup, origin can be a object, which uses CloudFromation yaml syntax.

```yaml
functions:
  myLambdaAtEdge:
    handler: myLambdaAtEdge.handler
    events:
      - cloudFront:
          eventType: viewer-request
          pathPattern: '/docs*'
          origin:
            DomainName: serverless.com
            OriginPath: /framework
            CustomOriginConfig:
              OriginProtocolPolicy: match-viewer
```

To define functions to each event type, same origin joins the functions to same behavior.

```yaml
functions:
  myLambdaAtEdgeViewerRequest:
    handler: myLambdaAtEdgeViewerRequest.handler
    events:
      - cloudFront:
          eventType: viewer-request
          origin: s3://bucketname.s3.amazonaws.com/files
  myLambdaAtEdgeViewerResponse:
    handler: myLambdaAtEdgeViewerResponse.handler
    events:
      - cloudFront:
          eventType: viewer-response
          origin: s3://bucketname.s3.amazonaws.com/files
```


Add same function to multiple behaviors
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

## Current gotchas
