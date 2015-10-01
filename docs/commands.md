# JAWS: CLI Commands

### New Commands

Create a project, a project region or a project stage using the `new` commands.

* ##### `$ jaws project create`
  * Makes a new JAWS project by generating scaffolding in the current working directory.  The new command by default creates resources (like IAM roles) in AWS via CloudFormation.
    * Walks the user through the following prompts asking for their AWS credentials/profile and their project specifications
    * Creates a CloudFormation Stack for the user’s first stage, which creates an IAM Group and a staged IAM Role for that IAM Group
    * Creates all project scaffolding in current working directory
    * Creates an AWS API Gateway REST API for the project
    * Creates environment var file in the s3 bucket (created if DNE) for the initial stage. [Why S3?](https://github.com/jaws-framework/JAWS/wiki/FAQ#why-do-you-use-an-s3-bucket-to-store-env-vars)

* ##### `$ jaws region create`

  * Creates new region in existing project.  By default executes CloudFormation to make one stage in new region.

* ##### `$ jaws stage create`

  * Creates a new stage in existing region.  By default executes CloudFormation to make new stage.

### Module Commands

* ##### `$ jaws module create`

 * Creates one or both of the following in the `aws_modules` folder. Default is to create both:
  * A lambda function in the `aws_modules` folder with basic scaffolding.
  * An API gateway configuration

* ##### `$ jaws module install`

 * Download and installs an awsm from github to the `aws_modules` dir.  By default installs module dependencies (if any)

* ##### `$ jaws module update`

 * Updates an existing awsm in the `aws_modules` dir. By default installs module dependencies (if any)

### Dash Commands

Deploy your lambdas and endpoints using the JAWS dashboard.

* ##### `$ jaws dash`

 * Interactive dashboard used to get an overview of your project and deploy resources

### ENV Commands

Modeled after Heroku's environment variable commands, these commands manage environment variable files for all stages.  There is a reserved stage `local` which stores the env var file in `.env`.  Otherwise they are stored is s3 at `s3://<projjaws.json:envVarBucket.name>/JAWS/envVars/<projectName>/<stage>`

* ##### `$ jaws env list`

 * List all env vars for given stage. Will display env vars that each jaws-module uses and indicate env vars that are not yet set.

* ##### `$ jaws env get`

 * Get the value for a specific key.

* ##### `$ jaws env set`

 * Set the value for a specific key.

* ##### `$ jaws env unset`

 * Unset the value for a specific key.

### Tag Commands

Non-interactive way (dash alternative) to indicate which (or all) labmda|endpoint changes to deploy when the `jaws deploy` command is run.

* ##### `$ jaws tag <type>`

 * Takes `lambda | endpoint` as type
 * Tags current workign directory for deployment.

### Deploy Commands

Non-interactive way (dash alternative) to deploy lambda|endpoint resources that have been `jaws tag`.  If `jaws deploy` is run from a lambda dir (has `lambda` attr defined in its `jaws.json`) it will automatically tag and then deploy.

* ##### `$ jaws deploy`

 * Deploys tagged resources 




