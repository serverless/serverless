![JAWS stack javascript aws node.js express auroradb dynamodb lambda](img/jaws_framework_logo_animated_xl.gif)

JAWS V1 (BETA)
=================================

**Status 9/21:** We've just released JAWS V1 BETA.  Please test, submit bug fixes and let us know what you think!  We'll be working through the week to improve our documentation and fix bugs.  Check out our Road Map below to see what's next.

JAWS is a 100% free and open-source framework for building serverless applications (web, mobile, IoT) using Amazon Web Services' Lambda, API Gateway, and more.  Lambda's event-driven model offers tremendous cost savings and colossal horizontal scaling ability.  Now, JAWS helps you build and maintain entire event-driven/serverless applications using Lambda.

<a class="frame" href="https://gitter.im/jaws-framework/JAWS?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge" target="_blank"><img src="img/jaws_gitter_chatroom.png" align="left" width="300"></a>

<br/><br/>

<a href="http://github.us11.list-manage1.com/subscribe?u=b4fad36768cab222f88338995&id=5f8407dded" target="_blank"><img src="img/jaws_email_list.png" align="left" width="300"></a>

<br/><br/>

<a href="https://www.livecoding.tv/jaws/" target="_blank"><img src="img/jaws_livecoding_channel.png" align="left" width="300"></a>

<br/><br/>

<a href="https://docs.google.com/document/d/1SeTgtsQc620vcwgGMZ4F2yuWVf-A3JmpTn1VT8pKYsA/edit?usp=sharing" target="_blank"><img src="img/jaws_roadmap.png" align="left" width="300"></a>

<br/><br/>

<a href="http://teespring.com/jaws_og" target="_blank"><img src="img/jaws_shirts.png" align="left" width="300"></a>

<br/><br/><br/>

## Quick Start

*  **[Setup an AWS account and create an administrative user](https://github.com/jaws-framework/JAWS/wiki/v1:-AWS-Account-setup)**

*  ```$ npm install jaws-framework -g```

*  ```$ jaws new project```

 **Note:** We recommend camelCase for project names. [Why?](https://github.com/jaws-framework/JAWS/wiki/Best-practices#project-names)

*  ```$ cd <new-project-name>```

*  ```$ jaws module create users list```

* ```$ jaws dash```

This will create a new jaws project, create a lambda function with an API Gateway endpoint, which you can immediately deploy via
`jaws dash`.  After deployment is complete, you will be given a url.  In the above example, you can access your
deployed lambda at `your_url/users/list`.

## Overview:

JAWS is an application framework for building serverless web, mobile and IoT applications.  JAWS comes in the form of a command line interface that provides structure, automation and optimization to help you build and maintain your serverless app.

JAWS uses AWS services exclusively, since it relies on AWS's Lambda service to provide event-driven compute resources, and many AWS services integrate nicely with Lambda.  A JAWS app can be simply a group of lambda functions to accomplish some tasks, or an entire back-end comprised of hundreds of lambda functions.

In JAWS V1, we made a strong effort to make not just a groundbreaking serverless framework, but the best framework for building applications with AWS in general (that is also serverless!).  As a result, JAWS V1 incorporates years of AWS expertise into its tooling, giving you best practices out-of-the-box.

## Documentation

During the week of 9/21 we will be finishing up our [docs](./docs/), [wiki](https://github.com/jaws-framework/JAWS/wiki), [best practices](https://github.com/jaws-framework/JAWS/wiki/Best-practices) and [FAQ](https://github.com/jaws-framework/JAWS/wiki/FAQ) pages.

* **[Commands List](docs/commands.md)**
* **[Project Structure](docs/project_structure.md)**
* **[Deployment](docs/deployment.md)**
* **[AWSM: AWS-Modules](docs/aws_modules.md)**

Once you become familiar with JAWS, you can read about [JAWS AWSM: Amazon Web Services Modules](https://github.com/awsm-org/awsm) to start contributing awsm's to the community.
