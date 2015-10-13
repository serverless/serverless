![JAWS stack javascript aws node.js express auroradb dynamodb lambda](img/jaws_framework_logo_animated_xl.gif)

JAWS V1 (BETA)
=================================

**Daily Status Reports are available in the Road Map at the link below.  Also, miss our breakout session @ RE:INVENT 2015? [Watch it here](https://www.youtube.com/watch?v=D_U6luQ6I90&feature=youtu.be)**

JAWS is a 100% free and open-source framework for building serverless applications (web, mobile, IoT) using Amazon Web Services' Lambda, API Gateway, and more.  Lambda's event-driven model offers tremendous cost savings and colossal horizontal scaling ability.  Now, JAWS helps you build and maintain entire event-driven/serverless applications using Lambda.

JAWS is being worked on full-time by [Austen Collins](https://twitter.com/austencollins) and [Ryan Pendergast](https://twitter.com/rynop).

**[Please consider donating to help keep us going :)](https://cash.me/$jawsframework)**

<a class="frame" href="https://gitter.im/jaws-framework/JAWS?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge" target="_blank"><img src="img/jaws_gitter_chatroom.png" align="left" width="300"></a>

<br/><br/>

<a href="http://github.us11.list-manage1.com/subscribe?u=b4fad36768cab222f88338995&id=5f8407dded" target="_blank"><img src="img/jaws_email_list.png" align="left" width="300"></a>

<br/><br/>

<a href="https://docs.google.com/document/d/1SeTgtsQc620vcwgGMZ4F2yuWVf-A3JmpTn1VT8pKYsA/edit?usp=sharing" target="_blank"><img src="img/jaws_roadmap.png" align="left" width="300"></a>

<br/><br/>

<a href="http://teespring.com/jaws_og" target="_blank"><img src="img/jaws_shirts.png" align="left" width="300"></a>

<br/><br/>

<a href="https://www.livecoding.tv/jaws/" target="_blank"><img src="img/jaws_livecoding_channel.png" align="left" width="300"></a>

<br/><br/>

<a href="http://stackoverflow.com/questions/tagged/jaws" target="_blank"><img src="img/jaws_stackoverflow_tag.png" align="left" width="300"></a>

<br/><br/><br/>

## Quick Start

*  **[Setup an AWS account and create an administrative user](./docs/account_setup.md)**

*  ```$ npm install jaws-framework -g```

*  ```$ jaws project create```

 **Note:** We recommend camelCase for project names. [Why?](./docs/best_practices.md#project-names)

*  ```$ cd <new-project-name>```

*  ```$ jaws module create greetings hello```

* ```$ jaws dash```

This will create a new jaws project, create a lambda function with an API Gateway endpoint, which you can immediately deploy via
`jaws dash`.  After deployment is complete, you will be given a url.  In the above example, you can access your
deployed lambda at `your_url/greetings/hello`.

## Overview:

JAWS is an application framework for building serverless web, mobile and IoT applications.  JAWS comes in the form of a command line interface that provides structure, automation and optimization to help you build and maintain your serverless app.

JAWS uses AWS services exclusively, since it relies on AWS's Lambda service to provide event-driven compute resources and many AWS services integrate nicely with Lambda.  A JAWS app can be simply a group of lambda functions to accomplish some tasks, or an entire back-end comprised of hundreds of lambda functions.

In JAWS V1, we made a strong effort to make not just a groundbreaking serverless framework, but the best framework for building applications with AWS in general (that is also serverless!).  As a result, JAWS V1 incorporates years of AWS expertise into its tooling, giving you best practices out-of-the-box.

## Documentation

During the week of 9/21 we will be finishing up our [docs](./docs/), [best practices](./docs/best_practices.md) and [FAQ](./docs/FAQ.md) pages.

* **[Commands List](docs/commands.md)**
* **[Project Structure](docs/project_structure.md)**
* **[Deployment](docs/deployment.md)**
* **[AWSM: AWS-Modules](docs/aws_modules.md)**

Once you become familiar with JAWS, you can read about [JAWS AWSM: Amazon Web Services Modules](https://github.com/awsm-org/awsm) to start contributing awsm's to the community.

## Events

* **9/24 - San Francisco, CA** @ the [Advanced AWS Meetup](http://www.meetup.com/AdvancedAWS/)
* **10/7 - Las Vegas, NV** A Breakout Session @ the AWS re:Invent Conference [watch video here](https://www.youtube.com/watch?v=D_U6luQ6I90&feature=youtu.be)
