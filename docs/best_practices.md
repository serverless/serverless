# Code optimization

When using services (like DynamoDB) make sure to initialize outside of your lambda code. Ex: module initializer (for Node), or to a static constructor (for Java).  Here is an example for [nodejs](https://gist.github.com/paulspringett/ec6d3df65e977342d6ea).  If you initiate a connection to DDB inside the Lambda function, that code will run on every invoke,

It is also very important to keep your codebase as small as possible and your code path lean as possible.  See [why optimize code before deployment](./FAQ.md#why-optimize-code-before-deployment) for more info.

# Security

You can read the AWS best security practices @ [security center](http://aws.amazon.com/security/?nc1=h_l3_cc).  Here are a few that we recommend w/r/t JAWS.

*  **Don't give `AdministratorAccess` to AWS API keys**: While the quick start guide says to create an administrative user with `AdministratorAccess` permissions, it only does this to get you going faster.  As stated this should not be done in a production environment.  Our recommendation is to give your users with API access key [`PowerUserAccess`](http://stackoverflow.com/questions/27911704/amazon-web-services-developer-user-permissions) at a maximum.  The fallout is you will not be able to execute a cloudformation json file from the command line that creates any IAM resources.  This should be done from the AWS CloudFront UI, behind a user that has 2FA enabled and a secure password.  All the JAWS tooling has a `-d, --dont-exe-cf` option that will simply update your CloudFormation file, which can then be executed in the UI.

# Project names

We recommend using camelCase for project names.  JAWS uses CloudFormation heavily and they tokenize resources names with `-`.
