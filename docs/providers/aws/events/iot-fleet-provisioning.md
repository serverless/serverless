<!--
title: Serverless Framework - AWS Lambda Events - IoT Fleet Provisioning
menuText: IoT Fleet Provisioning
menuOrder: 19
description:  Setting up AWS IoT Provisioning Template with AWS Lambda pre-validation hook via the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/events/iot-fleet-provisioning)

<!-- DOCS-SITE-LINK:END -->

# IoT Fleet Provisioning

## Simple event definition

This will create an [IoT Provisioning Template](https://docs.aws.amazon.com/iot/latest/developerguide/provision-template.html) with a [pre-provision hook](https://docs.aws.amazon.com/iot/latest/developerguide/pre-provisioning-hook.html) lambda. Both `templateBody` and `provisioningRoleArn` are required fields.

```yml
functions:
  smartHomeValidation:
    handler: smartHomeValidation.handler
    events:
      - iotFleetProvisioning:
          templateBody: ${file(template.json)}
          provisioningRoleArn: arn:aws:iam::12345678910:role/provisioning-role
```

[Example of template.json file](https://docs.amazonaws.cn/en_us/iot/latest/developerguide/provision-template.html#bulk-template-example)

## Enabling / Disabling

**Note:** IoT templates provisioned via `iotFleetProvisioning` events are enabled by default.

This will disable the template.

```yml
functions:
  smartHomeValidation:
    handler: smartHomeValidation.handler
    events:
      - iotFleetProvisioning:
          templateBody: ${file(template.json)}
          provisioningRoleArn: arn:aws:iam::12345678910:role/provisioning-role
          enabled: false
```

## Specify a template name

Created template name can be enforced using the `templateName` property.

```yml
functions:
  smartHomeValidation:
    handler: smartHomeValidation.handler
    events:
      - iotFleetProvisioning:
          templateName: SmartBulbTemplate
          templateBody: ${file(template.json)}
          provisioningRoleArn: arn:aws:iam::12345678910:role/provisioning-role
```
