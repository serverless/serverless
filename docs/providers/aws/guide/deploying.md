<!--
title: Serverless Framework - Deploying to AWS
description: How to deploy your AWS Lambda functions and their required infrastructure
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/deploying)

<!-- DOCS-SITE-LINK:END -->

# Deploying to AWS

The Serverless Framework was designed to provision your AWS Lambda Functions, Events and infrastructure Resources safely and quickly. It does this via a couple of methods designed for different types of deployments.

## Deploy All

This is the main method for doing deployments with the Serverless Framework:

```bash
serverless deploy
```

Use this method when you have updated your Function, Event or Resource configuration in `serverless.yml` and you want to deploy that change (or multiple changes at the same time) to Amazon Web Services.

**Note:** You can always enforce a deployment using the `--force` option, or specify a different configuration file name with the the `--config` option.

### How It Works

The Serverless Framework translates all syntax in `serverless.yml` to a single AWS CloudFormation template. By depending on CloudFormation for deployments, users of the Serverless Framework get the safety and reliability of CloudFormation.

- An AWS CloudFormation template is created from your `serverless.yml`.
- If a Stack has not yet been created, then it is created with no resources except for an S3 Bucket, which will store zip files of your Function code.
- If you're using locally build ECR images, dedicated ECR repository is created for your service. You also will be logged to that repository via `docker login` if needed.
- The code of your Functions is then packaged into zip files.
- If you're using locally build ECR images, they are built and uploaded to ECR.
- Serverless fetches the hashes for all files of the previous deployment (if any) and compares them against the hashes of the local files.
- Serverless terminates the deployment process if all file hashes are the same.
- Zip files of your Functions' code are uploaded to your Code S3 Bucket.
- Any IAM Roles, Functions, Events and Resources are added to the AWS CloudFormation template.
- The CloudFormation Stack is updated with the new CloudFormation template.
- Each deployment publishes a new version for each function in your service.

### Deployment method

Since Serverless Framework v3, deployments are done using [CloudFormation change sets](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-changesets.html). It is possible to use [CloudFormation direct deployments](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-direct.html) instead.

Direct deployments **are faster** and have no downsides (unless you specifically use the generated change sets). They will become the default in Serverless Framework 4.

You are encouraged to enable direct deployments via the `deploymentMethod` option:

```
provider:
  name: aws
  deploymentMethod: direct
```

### Tips

- Use this in your CI/CD systems, as it is the safest method of deployment.
- You can print the progress during the deployment if you use `verbose` mode, like this:
  ```
  serverless deploy --verbose
  ```
- This method uses the AWS CloudFormation Stack Update method. CloudFormation is slow, so this method is slower. If you want to develop more quickly, use the `serverless deploy function` command (described below)

- This method defaults to `dev` stage and `us-east-1` region. You can change the default stage and region in your `serverless.yml` file by setting the `stage` and `region` properties inside a `provider` object as the following example shows:

  ```yml
  # serverless.yml

  service: service-name
  provider:
    name: aws
    stage: beta
    region: us-west-2
  ```

- You can also deploy to different stages and regions by passing in flags to the command:

  ```
  serverless deploy --stage production --region eu-central-1
  ```

- You can specify your own S3 bucket which should be used to store all the deployment artifacts.
  The `deploymentBucket` config which is nested under `provider` lets you e.g. set the `name` or the `serverSideEncryption` method for this bucket. If you don't provide your own bucket, Serverless
  will create a bucket which uses default AES256 encryption.

- You can specify your own S3 prefix which should be used to store all the deployment artifacts.
  The `deploymentPrefix` config which is nested under `provider` lets you set the prefix under which the deployment artifacts will be stored. If not specified, defaults to `serverless`.

- You can make uploading to S3 faster by adding `--aws-s3-accelerate`

- You can disable creation of default S3 bucket policy by setting `skipPolicySetup` under `deploymentBucket` config. It only applies to deployment bucket that is automatically created
  by the Serverless Framework.

- You can enable versioning for the deployment bucket by setting `versioning` under `deploymentBucket` config to `true`.

Check out the [deploy command docs](../cli-reference/deploy.md) for all details and options.

- For information on multi-region deployments, [checkout this article](https://serverless.com/blog/build-multiregion-multimaster-application-dynamodb-global-tables).

## Deploy Function

This deployment method does not touch your AWS CloudFormation Stack. Instead, it simply overwrites the zip file of the current function on AWS. This method is much faster, since it does not rely on CloudFormation.

```bash
serverless deploy function --function myFunction
```

-**Note:** You can always enforce a deployment using the `--force` option. -**Note:** You can use `--update-config` to change only Lambda configuration without deploying code.

### How It Works

- The Framework packages up the targeted AWS Lambda Function into a zip file.
- The Framework fetches the hash of the already uploaded function .zip file and compares it to the local .zip file hash.
- The Framework terminates if both hashes are the same.
- That zip file is uploaded to your S3 bucket using the same name as the previous function, which the CloudFormation stack is pointing to.

### Tips

- Use this when you are developing and want to test on AWS because it's much faster.
- During development, people will often run this command several times, as opposed to `serverless deploy` which is only run when larger infrastructure provisioning is required.

Check out the [deploy command docs](../cli-reference/deploy.md) for all details and options.

## Deploying a package

This deployment option takes a deployment directory that has already been created with `serverless package` and deploys it to the cloud provider. This allows you to easily integrate CI / CD workflows with the Serverless Framework.

```bash
serverless deploy --package path-to-package
```

### How It Works

- The argument to the `--package` flag is a directory that has been previously packaged by Serverless (with `serverless package`).
- The deploy process bypasses the package step and uses the existing package to deploy and update CloudFormation stacks.
