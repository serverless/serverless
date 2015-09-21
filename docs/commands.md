# JAWS CLI Commands

### JAWS New Commands

Create a project, a project region or a project stage using the `new` commands.

#### `jaws new project`

Makes a new JAWS project by generating scaffolding in the current working directory.  The new command by default creates resources (like IAM roles) in AWS via CloudFormation.

1.  Walks the user through the following prompts asking for their AWS credentials/profile and their project specifications
1.  Creates a CloudFormation Stack for the user’s first stage, which creates an IAM Group and a staged IAM Role for that IAM Group
1.  Creates all project scaffolding in current working directory
1.  Creates an AWS API Gateway REST API for the project
1.  Creates environment var file in the s3 bucket (created if DNE) for the initial stage. [Why s3?](https://github.com/jaws-framework/JAWS/wiki/FAQ#why-do-you-use-an-s3-bucket-to-store-env-vars)

#### `jaws new region`

Creates new region in existing project.  By default executes CloudFormation to make one stage in new region.

#### `jaws new stage`

Creates a new stage in existing region.  By default executes CloudFormation to make new stage.

### JAWS Module Commands

#### `jaws module create`

Creates one or both of the following in the `back/aws_modules` folder. Default is to create both:

* A lambda function in the `back/aws_modules` folder with basic scaffolding.
* An API gateway configuration

#### `jaws module install`

Download and installs an awsm from github to the `back/aws_modules` dir.  By default installs module dependencies (if any)

#### `jaws module update`

Updates an existing awsm in the `back/aws_modules` dir. By default installs module dependencies (if any)

### JAWS Dash

#### `jaws dash`

Interactive dashboard used to get an overview of your project and deploy resources

### JAWS ENV Commands

Modeled after Heroku's environment variable commands, these commands manage environment variable files for all stages.  There is a reserved stage `local` which stores the env var file in `back/.env`.  Otherwise they are stored is s3 at `s3://<projjaws.json:envVarBucket.name>/JAWS/envVars/<projectName>/<stage>`

#### `jaws env list`

List all env vars for given stage. Will display env vars that each jaws-module uses and indicate env vars that are not yet set.

#### `jaws env get`

Get the value for a specific key.

#### `jaws env set`

Set the value for a specific key.

#### `jaws env unset`

Unset the value for a specific key.

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



