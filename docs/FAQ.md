## Why do you use an S3 bucket to store env vars?

You never want to store your service keys / credentials in version control.  IAM policies for S3 allow for fine grain access control.  You only give access to the bucket that contains env vars to people with authority to deploy code.  See the [`jaws env`](./commands.md#env-commands) command for more information

## Why optimize code before deployment?

The smaller the size of code, the quicker your container gets up and running.  The less code in the execution path, the quicker your runtime VM returns a result.  Both of these statements verified by AWS Lambda engineers.  See [this issue](https://github.com/aws/aws-sdk-js/issues/696) for an in depth background.

## Can the lambda functions in the lambdas folder use multiple languages?
Yes, one lambda can use the “nodejs” runtime and another can use “java8”.  When the JAWS-cli’s deploy command is used, the JAWS-cli checks the Runtime of the lambda specified in jaws.json and puts it through a build pipeline designed for that Runtime in particular.

## What types of jaws-modules can I publish?
Any type.  A jaws-module can be a simple lambda function, a group of lambda functions.

