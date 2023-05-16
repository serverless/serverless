<!--
title: Serverless Framework - Spotinst Functions Guide - IAM Role Configuration
menuText: IAM Role
menuOrder: 11
description: How to configure IAM roles for AWS services
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/spotinst/guide/iam-roles)

<!-- DOCS-SITE-LINK:END -->

# Spotinst Functions - IAM roles

Functions sometimes rely on outside services from Amazon such as S3, and accessing these resources often requires authorization using IAM. Spotinst Functions can be configured with the relevant permissions with the inclusion of IAM role information in the serverless.yml file. See [Amazon's documentation][amazon-docs-url] for more information on IAM roles.

## Requirements

- You will need to create an IAM role on your AWS account and attach policies with the relevant permissions.
- A spotinst role will be generated and linked with your AWS role
- Only one Spotinst role per function.
- Multiple functions can be associated with the same Spotinst role.

## YML

```yaml
functions:
  example:
    runtime: nodejs8.3
    handler: handler.main
    memory: 128
    timeout: 30
    access: private
    iamRoleConfig:
      roleId: ${role-id}
```

## Parameters

- roleId: the role created on the console
  - ex : sfr-5ea76784

For more information on how to set up IAM roles, check out our documentation [here][spotinst-help-center]

[amazon-docs-url]: https://aws.amazon.com/iam/?sc_channel=PS&sc_campaign=acquisition_US&sc_publisher=google&sc_medium=iam_b&sc_content=amazon_iam_e&sc_detail=amazon%20iam&sc_category=iam&sc_segment=208382128687&sc_matchtype=e&sc_country=US&s_kwcid=AL!4422!3!208382128687!e!!g!!amazon%20iam&ef_id=WoypCQAABVVgCzd0:20180220230233:s
[spotinst-help-center]: https://help.spotinst.com/hc/en-us/articles/360000317585?flash_digest=59d5566c556b5d4def591c69a62a56b6c1e16c61
