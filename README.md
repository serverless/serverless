![JAWS stack javascript aws node.js express auroradb dynamodb lambda](https://github.com/servant-app/JAWS/blob/master/site/public/img/jaws_logo_javascript_aws.png)

JAWS: The Javascript + AWS Stack
=================================

**Under-Construction!  Go for a swim while we finish this (the water is nice...), or contribute :)**

##Architecture

![JAWS stack diagram javascript aws node.js express auroradb dynamodb lambda](https://github.com/servant-app/JAWS/blob/master/site/public/img/jaws_diagram_javascript_aws.png)

####API
There are no servers are included in this stack(!!!).  The entire back-end is comprised of Lambda functions which are organized in the `api` folder.  Your API urls point to individual Lambda functions.  This way, the code for each API Route is completely isolated, enabling you to develop/update/configure/deploy/maintain that specific code at any time without affecting any other part of your application(!!!).  Think of each Lambda function as a "Controller", in traditional MVC structure.

You can either use the AWS Management Console's API Gateway User Interface to create your API, or define your API in the `api_swagger.json` file and deploy instantly via AWS's Swagger Import Tool (Recommended).

####Lib
In JAWS, the Lambda functions are the "Controllers", but the `lib` folder/module contains re-useable code you would like to use across all of your Lambda functions, which can be thought of as your "Models".

Since Lambda can be slow to initialize on cold-starts (after ~5 mins of inactivity), this module is designed so that you do not have to `require` all of its code, but instead you can require in only the code that your Lambda function needs.  For example:

    // This only loads code needed for the User Model
    var ModelUser = require('jaws-lib').models.User;
    
While developing, make sure you create an [npm sym-link](https://egghead.io/lessons/node-js-using-npm-link-to-use-node-modules-that-are-in-progress) between this module and all of your Lambda functions.  This way, all of the changes in the `lib` folder will be instantly available in every one of your Lambda functions when you run/test them locally.  Check out the wiki for instructions.


####CLI
This stack comes with its own command line interface to help you test your API Lambda Functions locally and deploy them.  The commands are as follows:
	
**Run A Lambda Function Locally**
Make sure you in the root folder of your Lambda function (api/users/signup) and enter this:

    $ jaws run

**Deploy A Lambda Function**
Make sure you in the root folder of your Lambda function (api/users/signup) and enter this:

    $ jaws deploy


####Site 
Your website/client-side application.  These assets are uploaded and served from S3 for super fast response times.


##Starring

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



##Resources
=================================
*  [List Of AWS Tips](https://wblinks.com/notes/aws-tips-i-wish-id-known-before-i-started/)
* [Amazon Monthly Cost Estimate Calculator](http://calculator.s3.amazonaws.com/index.html)
* [Set-Up AWS Billing Alerts](http://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/monitor-charges.html)
