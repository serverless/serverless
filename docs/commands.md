# JAWS CLI Commands

### jaws new

Creates a new project, new stage in existing project, or a new region in an existing stage as well as ENV var file in the JAWS S3 bucket for the region.  The new command by default creates resources (like IAM roles) in AWS via CloudFormation.

##### type `project`

This makes a new JAWS project by creating the file structure in the [project layout](./README.md#project-layout) section to the current working directory.

1.  Walks the user through the following prompts asking for their AWS credentials/profile and their project specifications
1.  Creates a CloudFormation Stack for the user’s first stage, which creates an IAM Group and a staged IAM Role for that IAM Group
1.  Creates all project scaffolding in current working directory
1.  Creates an AWS API Gateway REST API for the project
1.  Creates environment var file in the s3 bucket (created if DNE) for the initial stage. [Why s3?](https://github.com/jaws-framework/JAWS/wiki/FAQ#why-do-you-use-an-s3-bucket-to-store-env-vars)

##### type `region`

Creates new region in existing project.  By default executes CloudFormation to make one stage in new region.

##### type `stage`

Creates a new stage in existing region.  By default executes CloudFormation to make new stage.

### jaws module

This command manages [JAWS AWS Modules](https://github.com/awsm-org/awsm).

##### sub-command `install`

Download and installs an awsm from github to the `back/aws_modules` dir.  By default installs module dependencies (if any)

##### sub-command `update`

Updates an existing awsm in the `back/aws_modules` dir. By default installs module dependencies (if any)

##### sub-command `create`

Creates one or both of the following in the `back/aws_modules` folder. Default is to create both:

* A lambda function in the `back/aws_modules` folder with basic scaffolding.
* An API gateway configuration

### jaws dash

Interactive dashboard used to get an overview of your project and deploy resources

### jaws env

Manages environment variable files for all stages.  There is a reserved stage `local` which stores the env var file in `back/.env`.  Otherwise they are stored is s3 at `s3://<proj jaws.json:envVarBucket.name>/JAWS/envVars/<projectName>/<stage>`

Supported operations:

* `list`: List all env vars for given stage. Will display env vars that each jaws-module uses AND indicates env vars that are not yet set.
* `get`: get the value for a specific key
* `set`: set value for key
* `unset`: remove a specific key

When code is deployed via `jaws deploy` or `jaws dash` the env var file is downloaded from s3 and put in the root of the zip file named `.env`.  This exactly replicates the code layout of local development, as the root of the zip starts at the `back` dir.

### jaws tag

Non-interactive way (dash alternative) to indicate which (or all) labmda|api changes to deploy when the `jaws deploy` command is run.

### jaws deploy

Non-interactive way (dash alternative) to deploy lambda|api resources that have been `jaws tag`.  If `jaws deploy` is run from a lambda dir (has `lambda` attr defined in its `jaws.json`) it will automatically tag and then deploy.

When deploying a Lambda function to AWS, JAWS will:

*  Check the Runtime specified in the current lambda’s jaws.json (dir running JAWS cli from) and perform a corresponding build pipeline.  Optionally optimize the code for performance in Lambda (browserify & uglifyjs2).  See the [lambda attributes](./jaws-json.md#lambda-attributes) for optimization options. [Why optimize?](https://github.com/jaws-framework/JAWS/wiki/FAQ#why-optimize-code-before-deployment)
*  Create or update lambda using this naming convention: `STAGE_-_PROJECTNAME_-_FUNCTIONNAME`.  For example: `prod_-_MyApp_-_usersSignup`
* Upload the file as a buffer directly to AWS.

### jaws log

This command fetches logs from AWS Cloudformation for the lambda function in a given region & stage.

This command is not implemented yet. Looking for help from community. Need a way to stream the logs "real time" like heroku logs.



