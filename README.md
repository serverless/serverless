![JAWS stack javascript aws node.js express auroradb dynamodb lambda](https://github.com/jaws-stack/JAWS/blob/v1.0/jaws_v1_logo.png)

JAWS: The Server-less Stack
=================================

[![Gitter](https://badges.gitter.im/Join%20Chat.svg)](https://gitter.im/jaws-stack/JAWS?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge)

## Goals:

 - **Use No Servers:** Never deal with scaling/deploying/maintaining/monitoring servers again.
 - **Isolated Components:** The JAWS back-end is comprised entirely of AWS Lambda Functions.  You can develop/update/configure each separately without affecting any other part of your application.  Your app never goes down...  only individual API routes can go down.
 - **Scale Infinitely:**  A back-end comprised of Lambda functions comes with a ton of concurrency and you can easily enable multi-region redundancy.
 - **Be Cheap As Possible:**  Lambda functions run only when they are called, and you only pay for when they are run.
 - **Enable all supported Lambda runtimes** While first release is `nodejs` only, we plan on adding supoport for all languages. This means each lambda in your JAWS project can be coded in the lang that best suites the problem.
 - **Integrate with AWS API Gateway** No more clicking around the API Gateway UI.  Keep your config next to your code.
 - **Multi-region and multi-stage:** supported out of the box. Driven by [CloudFormation](https://aws.amazon.com/cloudformation/).

## Architecture

TODO: Austen do ur magic here...

## Quick Start

This guide provides the path of least resistence to get up and going quick.  It is **not** the most secure way to do things.  Check out the [best practices](https://github.com/jaws-stack/JAWS/wiki/v1:best-practices) guide in our  [wiki](https://github.com/jaws-stack/JAWS/wiki).

### Install

These 3 steps will only have to be done once across all your JAWS projects in an AWS account:
*  [Setup an AWS account and create an administrative user](https://github.com/jaws-stack/JAWS/wiki/v1:-AWS-Account-setup)
*  Create S3 bucket that will hold your enviornment variable files. [Why?](https://github.com/jaws-stack/JAWS/wiki/FAQ#why-do-you-use-an-s3-bucket-to-store-env-vars)
*  ```npm install jaws-stack -g```

### Hit the ground running

*  Create a new project in your current working directory:

  ```jaws new project```
*  Generate a lambda function skeletion and corresponding API gateway endpoint config:
  
  ```cd <proj-name>; jaws generate```
* Write your code in `back/lambdas/<funcName>/index.js` then install node modules:

  ```cd <your-proj-name>/back; npm install```
* Deploy your lambda:

  ```cd back/lambdas/<funcName>; jaws deploy lambda```

* Optionally deploy your API gateway:
  * Configure `jaws.json` [`endpoint`](./docs/jaws-json.md) attribute in `<funcName>` dir
  * ```cd back/lambdas/<funcName>; jaws deploy api```

* Smile ;)

## Best practices & FAQ

Check out the [best practices](https://github.com/jaws-stack/JAWS/wiki/v1:best-practices) and [FAQ](https://github.com/jaws-stack/JAWS/wiki/FAQ) pages on our [wiki](https://github.com/jaws-stack/JAWS/wiki)




