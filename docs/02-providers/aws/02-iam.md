<!--
title: IAM Role configuration
menuText: IAM Role configuration
layout: Doc
-->

# Adding custom IAM role statements
If you want to give permission to your functions to access certain resources on your AWS account, you can add custom IAM role statements to your service by adding the statements in the `iamRoleStatements` array in the `provider` object. As those statements will be merged into the CloudFormation template you can use Join, Ref or any other CloudFormation method or feature. You're also able to either use YAML for defining the statement (including the methods) or use embedded JSON if you prefer it. Here's an example that uses all of the above:

```yml
# serverless.yml

service: new-service
provider:
  name: aws
  iamRoleStatements:
      -  Effect: "Allow"
         Action:
           - "s3:ListBucket"
         Resource: { "Fn::Join" : ["", ["arn:aws:s3:::", { "Ref" : "ServerlessDeploymentBucket"} ] ] }
      -  Effect: "Allow"
         Action:
           - "s3:PutObject"
         Resource:
           Fn::Join:
             - ""
             - - "arn:aws:s3:::"
               - "Ref" : "ServerlessDeploymentBucket"
```

On deployment, all these statements will be added to the IAM role that is assumed by your lambda functions.

# Using existing IAM role
If you want to use an existing IAM role, you can add your IAM role ARN in the `iamRoleARN`. For example:

```yml
# serverless.yml

service: new-service
provider:
  name: aws
  iamRoleARN: arn:aws:iam::YourAccountNumber:role/YourIamRole
```

# Explicitly creating LogGroups Resources
By default, the framework does not create LogGroups for your Lambdas. However this behavior will be deprecated soon and we'll be adding CloudFormation LogGroups resources as part of the stack. This makes it easy to clean up your log groups in the case you remove your service, and make the lambda IAM permissions much more specific and secure.

To opt in for this feature now to avoid breaking changes later, add the following to your provider config in `serverless.yml`:

```yml
provider:
  cfLogs: true
```
If you get a CloudFormation error saying that log group already exists, you have to remove it first from AWS console, then deploy, otherwise for new services this should work out of the box.

