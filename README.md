![JAWS stack javascript aws node.js express auroradb dynamodb lambda](https://github.com/servant-app/JAWS/blob/master/site/public/img/jaws_logo_javascript_aws.png)

JAWS: The Javascript + AWS Stack
=================================

**Under-Construction!  Go for a swim while we finish this.  The water is nice...**

=================================


![JAWS stack diagram javascript aws node.js express auroradb dynamodb lambda](https://github.com/servant-app/JAWS/blob/master/site/public/img/jaws_diagram_javascript_aws.png)

Starring
=================================

**Javascript:**
- Node.js
- Express.js
- HTML5 Boilerplate – *Insert the javascript front-end framework du-jour here.*

**AWS Services:**
- DynamoDB - *NOSQL data storage for data that changes shape.*
- Lambda - *Build worker tasks that you can spawn and scale infinitely.*
- API Gateway - *Traditional Relational data storage at Aurora's incredible speed.*
- API Gateway - *Traditional Relational data storage at Aurora's incredible speed.*

Set-Up
=================================

#### AWS Set-Up

* [Create an AWS account](http://aws.amazon.com/,), if you don't have one already
* Create an IAM user

#### Creating New API Routes/Lambda Functions

* Copy and paste the `api/template` folder somewhere in the `api` folder and rename it.
* To require the `lib` into your Lambda functions, we recommend creating an [npm link](https://egghead.io/lessons/node-js-using-npm-link-to-use-node-modules-that-are-in-progress).  Cd into your lib folder, run `npm link`, then cd into your lambda function's folder and run `npm link jaws-lib`.

Resources
=================================
*  [List Of AWS Tips](https://wblinks.com/notes/aws-tips-i-wish-id-known-before-i-started/)
* [Amazon Monthly Cost Estimate Calculator](http://calculator.s3.amazonaws.com/index.html)
* [Set-Up AWS Billing Alerts](http://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/monitor-charges.html)
