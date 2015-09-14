![JAWS stack javascript aws node.js express auroradb dynamodb lambda](https://github.com/jaws-stack/JAWS/blob/v1.0/jaws_v1_logo.png)

JAWS: The Server-less Framework V1 (BETA)
=================================

[![Gitter](https://badges.gitter.im/Join%20Chat.svg)](https://gitter.im/jaws-stack/JAWS?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge)

Welcome to JAWS V1 BETA.  Many things are broken.  Please provide fixes and feedback :)

| [![jaws installation guide](https://servant-assets.s3.amazonaws.com/img/jaws_square_installation_guide_2.png)](https://github.com/servant-app/JAWS/wiki/JAWS-Installation) | [![jaws email list](https://servant-assets.s3.amazonaws.com/img/jaws_square_email_list_1.png)](http://eepurl.com/bvz5Nj) | [![jaws v1 version 1 specifications](https://servant-assets.s3.amazonaws.com/img/jaws_square_v1_coming_soon_2.png)](https://docs.google.com/document/d/1SeTgtsQc620vcwgGMZ4F2yuWVf-A3JmpTn1VT8pKYsA/edit?usp=sharing)
| ------------- | ----------- | ----------- |

## Goals:

 - **No Servers:** The JAWS back-end is comprised entirely of AWS Lambda Functions.  You can develop/update/configure each separately without affecting any other part of your application.  Your app never goes down.  There is no app.  Only individual lambda functions can go down.
 - **Scale Infinitely:**  A back-end comprised of Lambda functions comes with a ton of concurrency.
 - **Be Cheap As Possible:**  Lambda functions run only when they are called, and you pay only when they are run.
 - **All Lambda Runtimes** While first release is `nodejs` only, we plan on adding supoport for all languages. This means each lambda in your JAWS project can be coded in the lang that best suites the problem.
 - **API Gateway Auto-Deploy** Creates your API endpoints for you on API Gateway.
 - **Multi-stage & Multi-Region:** Define stages for your project, and multiple regions with a stage. Driven by [CloudFormation](https://aws.amazon.com/cloudformation/).

## Architecture

Graphics coming soon...

## Quick Start

This guide gets you started quickly.  Later, check out the [best practices](https://github.com/jaws-stack/JAWS/wiki/v1:best-practices) guide in our  [wiki](https://github.com/jaws-stack/JAWS/wiki) for tips on security and more.

### Install

These 3 steps will only have to be done once across all your JAWS projects in an AWS account:
*  [Setup an AWS account and create an administrative user](https://github.com/jaws-framework/JAWS/wiki/v1:-AWS-Account-setup)
*  Create S3 bucket that will hold your enviornment variable files. [Why?](https://github.com/jaws-framework/JAWS/wiki/FAQ#why-do-you-use-an-s3-bucket-to-store-env-vars)
*  ```npm install jaws-framework -g```

### Hit the ground running

*  Create a new project in your current working directory:

  ```jaws new project```
*  Generate a lambda function skeletion and corresponding API gateway endpoint config:

  ```cd <proj-name>; jaws new action```

* Deploy generated lambda:

  ```TODO: do we put dash command here?```

* Optionally deploy your API gateway:
  * Configure `jaws.json` [`endpoint`](./docs/jaws-json.md) attribute in `<funcName>` dir
  * ```cd back/lambdas/<funcName>; jaws deploy api```

## Where do I go from here?

Check out our [docs](./docs/) and [wiki](https://github.com/jaws-stack/JAWS/wiki), especially the [best practices](https://github.com/jaws-stack/JAWS/wiki/v1:best-practices) and [FAQ](https://github.com/jaws-stack/JAWS/wiki/FAQ) pages

Once you become familar with JAWS, you can read the JAWS [plug-in module guide](./docs/plugin-module-guide.md) to start contributing JAWS modules to the community.

## How can I help?

Check out our [v1.1 roadmap doc](https://docs.google.com/document/d/1xbpEps-s4iMkjmAkYiyJYwY1BIzTY9LaLMy23AfMYoI/edit#heading=h.o8y2lvp71fab) for what we need help with.

Please check out our [CONTRIBUTING.md](./CONTRIBUTING.md) for coding and PR guidelines.

