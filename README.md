![JAWS stack javascript aws node.js express auroradb dynamodb lambda](https://github.com/servant-app/JAWS/blob/master/site/public/img/jaws_logo_javascript_aws.png)

JAWS: The Javascript + AWS Stack
=================================

This stack uses new tools from Amazon Web Services to completely redefine how to build massively scalable (and cheap) web applications.  

#### [Follow the "Installation Guide" in the Wiki to get started! ](https://github.com/servant-app/JAWS/wiki/JAWS-Installation)

  
  

##### The Goals Of JAWS Are:

 - **Use No Servers:** Never deal with scaling/deploying/maintaing/monitoring servers again.
 -  **Isolated Components:** The JAWS back-end is comprised entirely of AWS Lambda Functions.  You can develop/update/configure each separately without affecting any other part of your application.  Your app never goes down...  only individual API routes can go down.
 - **Scale Infinitely:**  A back-end comprised of Lambda functions comes with a ton of concurrency and you can easily enable multi-region redundancy.
 - **Be Cheap As Possible:**  Lambda functions run only when they are called, and you only pay for when they are run.


## Architecture

![JAWS stack diagram javascript aws node.js express auroradb dynamodb lambda](https://github.com/servant-app/JAWS/blob/master/site/public/img/jaws_diagram_javascript_aws.png)

#### API
There are no servers included in this stack.  The entire back-end is comprised of Lambda functions which are organized in the `api` folder.  Each of your API URLs points to one of these Lambda functions.  This way, the code for each API Route is completely isolated, enabling you to develop/update/configure/deploy/maintain code for specific API urls at any time without affecting any other part of your application(!!!).  Think of each Lambda function as a "Controller", in traditional MVC structure.

You can either use the AWS Management Console's API Gateway User Interface to create your API, or define your API in the `api_swagger.json` file and deploy instantly via AWS's Swagger Import Tool (Recommended).

#### Lib
The `lib` folder/module contains re-useable code you can use across all of your Lambda functions, which can be thought of as your "Models".  It's an npm module that can be required into your Lambda functions, like any other.

Since Lambda can be slow to initialize on cold-starts (after ~5 mins of inactivity), this module is designed so that you do not have to `require` all of its code, but instead you can require in only the code that your Lambda function needs.  For example:

    // This only loads code needed for the User Model
    var ModelUser = require('jaws-lib').models.User;
    
While developing, make sure you create an [npm sym-link](https://egghead.io/lessons/node-js-using-npm-link-to-use-node-modules-that-are-in-progress) between this module and all of your Lambda functions.  This way, all of the changes in the `lib` folder will be instantly available in every one of your Lambda functions when you run/test them locally.  Check out the wiki for instructions.


#### CLI
This stack comes with its own command line interface to help you test your API Lambda Functions locally and deploy them.  The commands are:
	
**Run A Lambda Function Locally**

Make sure you are in the root folder of your Lambda function (api/users/signup) and enter this:

    $ jaws run

**Deploy A Lambda Function**

Make sure you are in the root folder of your Lambda function (api/users/signup) and enter this:

    $ jaws deploy

**Start A Local Server**

Make sure you are in the`site` folder of the JAWS app and enter this:

    $ jaws server


#### Site 
Your website/client-side application.  These assets can be uploaded and served from S3 for super fast response times.


## Roadmap
* Incorporate the AWS API Gateway Swagger Import Tool
* Write the swagger.json for the current API functions
* Add Swagger import commands to the CLI
* Add on to the `site` to use the API Routes, after they are deployed
* Write a JAWS CLI command to build and deploy site assets
* Write more API examples

## Starring

**Javascript:**
- Node.js (in AWS Lambda functions)
- jQuery (in your front-end site)

**AWS Services:**
- DynamoDB - *Managed, NOSQL data storage*
- Lambda - *Build worker tasks that you can spawn and scale infinitely.*
- API Gateway - *Launch an API with urls pointing to your Lambda functions*
- S3 - *Host static assets for your site here*

**Other:**
- JSON Web Tokens



## Other
*  [List Of AWS Tips](https://wblinks.com/notes/aws-tips-i-wish-id-known-before-i-started/)
* [Amazon Monthly Cost Estimate Calculator](http://calculator.s3.amazonaws.com/index.html)
* [Set-Up AWS Billing Alerts](http://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/monitor-charges.html)
