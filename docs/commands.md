# JAWS: CLI Commands

All commands support the -h/--help option to see full usage and examples

### Project Commands

Commands that deal with JAWS projects

* ##### `$ jaws project create`

  * Makes a new JAWS project by generating scaffolding in the current working directory.  The new command by default creates resources (like IAM roles) in AWS via CloudFormation.
    * Walks the user through the following prompts asking for their AWS credentials/profile and their project specifications
    * Creates a CloudFormation Stack for the user’s first stage, which creates an IAM Group and a staged IAM Role for that IAM Group
    * Creates all project scaffolding in current working directory
    * Creates an AWS API Gateway REST API for the project
    * Creates environment var file in the s3 bucket for the initial stage and region. [Why S3?](./FAQ.md#why-do-you-use-an-s3-bucket-to-store-env-vars)

### Module Commands

Commands that interact with [aws modules](./aws_modules.md) (awsm)

* ##### `$ jaws module create`

 * Creates one or both of the following in the `aws_modules` folder. Default is to create both:
  * A lambda function in the `aws_modules` folder with basic scaffolding.
  * An API gateway configuration
  
* ##### aws module installation and update
  
  * We leverage the most popualar package manager for the runtime and utilize a post-install hook to JAWS stuff.  For example in nodejs: `npm install awsm-images --save`. See [awsm-org](./aws_modules.md) for more info.
 
### Region Commands

* ##### `$ jaws region create`

  * Creates new region in existing project.  By default executes CloudFormation to make one stage in new region.

### Stage Commands

* ##### `$ jaws stage create`

  * Creates a new stage in existing region.  By default executes CloudFormation to make new stage.

### Dash Commands

Deploy your lambdas and endpoints using the JAWS dashboard.

* ##### `$ jaws dash`

 * Interactive dashboard used to get an overview of your project and deploy resources

### ENV Commands

Modeled after Heroku's environment variable commands, these commands manage environment variable files for all stages and regions.  There is a reserved stage `local` which stores the env var file in `.env`.  Otherwise they are stored is s3 at `s3://<jaws.json:stages[stage][region].jawsBucket>/JAWS/<projectName>/<stage>/envVars/.env`

* ##### `$ jaws env list <stage> <region>`

 * List all env vars for given stage and region (or all regions for stage). Will display env vars that each jaws-module uses and indicate env vars that are not yet set.

* ##### `$ jaws env get <stage> <region> <key>`

 * Get the value for a specific key in stage and region (or all regions for stage).

* ##### `$ jaws env set <stage> <region> <key> <val>`

 * Set the value for a specific key in stage and region (or all regions for stage)..

* ##### `$ jaws env unset <stage> <region> <key>`

 * Unset the value for a specific key in stage and region (or all regions for stage)..

### Tag Commands

depricated per https://github.com/jaws-framework/JAWS/issues/164

### Deploy Commands

Non-interactive way (dash alternative) to deploy lambda|endpoint|resources from lambda CWD.

* ##### `$ jaws deploy <type> [stage] [region]`

 * Deploys lambda|endpoint|resources 

### Run Commands

Way to test your lambda locally.  We highly recommend pushing your logic out of handler code, and utlize the runtimes testing framework (like mocha for nodejs).

* ##### `$ jaws run`

 * Must be run within a lambda dir.  Executes the `event.json` in CWD.


