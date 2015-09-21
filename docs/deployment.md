# JAWS: Deployment

Every JAWS application can have multiple stages and multiple regions within each stage.  JAWS relies heavily on AWS Cloudformation to keep track of all of the AWS resources your application requires in each stage/region.  This way, you can easily provision/replicate your AWS resources at once, and roll back to previous deployments, for every stage/region your application uses.

![jaws framework deployment diagram](img/jaws_deployment_diagram.png)

## Lambda Deployment Process:

*  Check the Runtime specified in the current lambda’s jaws.json (dir running JAWS cli from) and perform a corresponding build pipeline.  Optionally optimize the code for performance in Lambda (browserify & uglifyjs2).  See the [lambda attributes](./project_structure.md#lambda-attributes) for optimization options. [Why optimize?](https://github.com/jaws-framework/JAWS/wiki/FAQ#why-optimize-code-before-deployment)
*  Create or update lambda using this naming convention: `STAGE_-_PROJECTNAME_-_FUNCTIONNAME`.  For example: `prod_-_MyApp_-_usersSignup`
*  Upload the file as a buffer directly to AWS.

## Endpoint/API Gateway Deployment Process:



