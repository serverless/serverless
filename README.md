![JAWS stack javascript aws node.js express auroradb dynamodb lambda](img/jaws_framework_logo_animated_xl.gif)

JAWS V1 (BETA)
=================================

JAWS is an open-source framework for building serverless applications (web, mobile, IoT) using Amazon Web Services' Lambda, API Gateway, and more.  Lambda's event-driven model offers tremendous cost savings and colossal horizontal scaling ability.  Now, JAWS helps you build and maintain entire applications built on Lambda.

<a class="frame" href="https://gitter.im/jaws-framework/JAWS?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge" target="_blank"><img src="img/jaws_gitter_chatroom.png" align="left" width="300"></a>

<br/><br/>

<a href="http://github.us11.list-manage1.com/subscribe?u=b4fad36768cab222f88338995&id=5f8407dded" target="_blank"><img src="img/jaws_email_list.png" align="left" width="300"></a>

<br/><br/>

<a href="https://www.livecoding.tv/jaws/" target="_blank"><img src="img/jaws_livecoding_channel.png" align="left" width="300"></a>

<br/><br/>

<a href="https://docs.google.com/document/d/1SeTgtsQc620vcwgGMZ4F2yuWVf-A3JmpTn1VT8pKYsA/edit?usp=sharing" target="_blank"><img src="img/jaws_roadmap.png" align="left" width="300"></a>

<br/><br/><br/>

## Overview:

![anatomy of a jaws deployment on aws](img/jaws_deployment_diagram.png)


## Quick Start

The guide below gets you started quickly.  Later, check out the [best practices](https://github.com/jaws-framework/JAWS/wiki/Best-practices) guide in our  [wiki](https://github.com/jaws-framework/JAWS/wiki) for tips on security and more.

*  **[Setup an AWS account and create an administrative user](https://github.com/jaws-framework/JAWS/wiki/v1:-AWS-Account-setup)**

*  ```$ npm install jaws-framework -g```

*  ```$ jaws new project```

 **Note:** we recommend camelCase for project names. [Why?](https://github.com/jaws-framework/JAWS/wiki/Best-practices#project-names)

*  ```$ cd <new-project-name>```

*  ```$ jaws module create users get```

* ```$ jaws dash```

This will create a new jaws project, create a lambda function  and endpoint (and install [jaws-core-js awsm](https://github.com/jaws-framework/jaws-core-js)), which you can immediately deploy via
`jaws dash`.  After deployment is complete, you will be given a url.  In the above example, you can access your
deployed lambda at `your_url/users/list`.

## Where do I go from here?

We're currently working on our [docs](./docs/), [wiki](https://github.com/jaws-framework/JAWS/wiki), [best practices](https://github.com/jaws-framework/JAWS/wiki/Best-practices) and [FAQ](https://github.com/jaws-framework/JAWS/wiki/FAQ) pages.

Once you become familiar with JAWS, you can read about [JAWS AWSM: Amazon Web Services Modules](https://github.com/awsm-org/awsm) to start contributing awsm's to the community.

## How can I help?

Please check out the **[JAWS V1 Google Document](https://docs.google.com/document/d/1SeTgtsQc620vcwgGMZ4F2yuWVf-A3JmpTn1VT8pKYsA/edit#)** and our [CONTRIBUTING.md](./CONTRIBUTING.md) for coding and PR guidelines.
