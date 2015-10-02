# Code optimization

When using services (like DynamoDB) make sure to initialize outside of your lambda code. Ex: module initializer (for Node), or to a static constructor (for Java).  Here is an example for [nodejs](https://gist.github.com/paulspringett/ec6d3df65e977342d6ea).  If you initiate a connection to DDB inside the Lambda function, that code will run on every invoke,

It is also very important to keep your codebase as small as possible and your code path lean as possible.  See [why optimize code before deployment](https://github.com/jaws-framework/JAWS/wiki/FAQ#why-optimize-code-before-deployment) for more info.

# Security

You can read the AWS best security practices @ [security center](http://aws.amazon.com/security/?nc1=h_l3_cc).  Here are a few that we recommend w/r/t JAWS.

*  **Don't give `AdministratorAccess` to AWS API keys**: While the quick start guide says to create an administrative user with `AdministratorAccess` permissions, it only does this to get you going faster.  As stated this should not be done in a production environment.  Our recommendation is to give your users with API access key [`PowerUserAccess`](http://stackoverflow.com/questions/27911704/amazon-web-services-developer-user-permissions) at a maximum.  The fallout is you will not be able to execute a cloudformation json file from the command line that creates any IAM resources.  This should be done from the AWS CloudFront UI, behind a user that has 2FA enabled and a secure password.  All the JAWS tooling has a `-d, --dont-exe-cf` option that will simply update your `jaws-cf.json` file, which can then be executed in the UI.

This leads us to Cloud formation segmentation...

# Cloud formation segmentation

To get you up and going quick JAWS provides one cloud formation file (`jaws-cf.json`).  In a real environment we recommend making one CloudFormation JSON file (CFJ) for your data model resources (S3,DynamoDB,SQS etc) and another CFJ for your lambda and api gateway resources.

Not only does this further isolate who can control what parts of your business, but it also facilitates any stage of application code to consume any stage of data model resources.

For example, you could have a 'staging' API gateway and Lambda environment that points at your 'prod' data model, as a way to do a quick sanity test before rolling your Lambda/Gateway code live.  This design pattern also helps facilitate cross development between engineers in your organization.

All the JAWS tooling has a `-d, --dont-exe-cf` option that will simply update your `jaws-cf.json` file.  You can then look at a diff of the changes and choose to include them in your app and data model CFJ files, which then are executed by putting them into the AWS CF UI - by an admin with priv. to do so, and who has 2FA on.  See security section above for more details.

# Project names

We recommend using camelCase for project names.  JAWS uses CloudFormation heavily and they tokenize resources names with `-`.
