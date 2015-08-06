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
There are no servers are included in this stack.  The entire back-end is comprised of Lambda functions which are organized in the `api` folder.  Each of your API URLs points to one of these Lambda functions.  This way, the code for each API Route is completely isolated, enabling you to develop/update/configure/deploy/maintain code for specific API urls at any time without affecting any other part of your application(!!!).  Think of each Lambda function as a "Controller", in traditional MVC structure.

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

Make sure you in the root folder of your Lambda function (api/users/signup) and enter this:

    $ jaws run

**Deploy A Lambda Function**

Make sure you in the root folder of your Lambda function (api/users/signup) and enter this:

    $ jaws deploy

**Start A Local Server**

Make sure you in the`site` folder of the JAWS app and enter this:

    $ jaws server


#### Site 
Your website/client-side application.  These assets can be uploaded and served from S3 for super fast response times.

## Install

This process will create all the resources (S3,DynamoDb tables etc), IAM roles, groups and perms via cloud formation.  It will allow you to create multiple stages (featuredev,test,staging,prod etc) very quickly and automatically inherit perms to a local development user.

### Setup AWS resources

1.  Create an IAM user with privileges to create/update lambda - or give user all priv with `AdministratorAccess` policy. Make an API key. Copy `cli/temp.adminenv` to `cli/.adminenv` and replace API key values.
1.  Create another IAM user for development called `dev-jaws`.  Make an API key. Copy `lib/temp.env` to `cli/.env` and replace API key values.
1.  Create an enviornment using Cloud Formation. Lets use the stage `test` for this example.
    1.  Create CF Stack called `test-jaws-data-model` and use the `aws/data-model-cf.json`.  Specify your domain name (used to create s3 bucket) and finish the wizard.
    1.  Create CF Stack called `test-jaws-api` and use the `aws/api-cf.json`.  Specify same domain and finish wizard
1.  Go to IAM, click on groups and search for `jaws`. Add this group to your `dev-jaws` user.  Now anytime perms for the test env are changed, your dev user gets those perms.
1.  Create an S3 bucket and folders to hold `ENV` files for you lambda stages.  Ex: `lambdadeploy.mydomain.com/jaws/env/`

### Setup local project

1.  run `npm install` from both `lib` and `cli` dirs
1.  Install the JAWS CLI: from `cli` dir run `npm install . -g` (may need sudo)
1.  Modify `cli/jaws.yml` to specify deploy s3 bucket and path you created.  Also setup IAM roles for each stage (right now you just have a test role)

### NPM link `lib` with your lambda functions

The `lib` folder is intended for code you want to share across all of your Lambda functions.  The `lib` folder is an npm module, which you can `require` into your Lambda functions.  While developing locally, you can `sym-link` the `lib` folder into your Lambda functions, so that all changes you make in the `lib` folder are instantly accessible in all of your lambda functions.

* [Watch this short and awesome tutorial on 'npm link'](https://egghead.io/lessons/node-js-using-npm-link-to-use-node-modules-that-are-in-progress)

* Run `npm link` in `lib` folder's root directory.  Make sure you know what the `lib` module is named in the `package.json`.  It's `jaws-lib` by default.

* In all of your Lambda functions root directories, run `npm link <lib module name>`.  

        npm link jaws-lib

* Now all changes in `lib` will work in across your lambda functions.

* Don't forget to do this for new lambda functions you create!


### Setup stage ENV vars

When you run `jaws deploy <stage>` it will go out and fetch `jaws.yml:jaws.deploy.envS3Location/<stage>` and put it into your deployment zip file under `lib/.env`.  This way your creds are not checked into SVN and they have tight ACLs managed by AWS.

1.  For each stage, make a copy of `lib/temp.env` and name it after the stage. So for this example copy `temp.env` to `test`. Replace ENV vars and add your own.
1.  Upload each stage env file to your `jaws.yml:jaws.deploy.envS3Location/<stage>` location. Make sure NOT to make the permissions public.  Only people you want running `jaws deploy` should have their IAM user setup to access this s3 dir.

## Roadmap
* Incorporate the AWS API Gateway Swagger Import Tool
* Write the swagger.json for the current API functions
* Add Swagger import commands to the CLI
* Add on to the `site` to use the API Routes, after they are deployed
* Write a JAWS CLI command to build and deploy site assets
* Write more API examples
* NPM Shrinkwrap
* Models that work more efficiently with DyanmoDB

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
* [List Of AWS Tips](https://wblinks.com/notes/aws-tips-i-wish-id-known-before-i-started/)
* [Amazon Monthly Cost Estimate Calculator](http://calculator.s3.amazonaws.com/index.html)
* [Set-Up AWS Billing Alerts](http://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/monitor-charges.html)
