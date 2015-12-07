![Serverless Application Framework AWS Lambda API Gateway](img/serverless_readme_header.jpg)

Serverless V0 (BETA)
=================================

The Serverless Application Framework Powered By Amazon Web Services - [serverless.com](http://www.serverless.com)

This is under heavy development.  Please test only with this version for the next week while we fix bugs.

##Differences From JAWS:

* **One Set Of Lambdas Per Region:**  JAWS created a separate CloudFormation stack of Lambdas for each stage/region.  Serverless creates one set of Lambdas in each region and use Lambda aliases for each of your Project Stages.
* **AWS-Approved Workflow:**  The new workflow includes Lambda versioning and aliasing support.  Every time you deploy a Lambda it is versioned and aliased to your target stage.  This prevents trampling and allows large teams to work on one set of Lambdas per region without trampling eachother.
* **Lambdas No Longer Deploy Via CloudFormation:**  We no longer use CloudFormation to deploy your Lambdas.  It is too slow and it lacks versioning and aliasing support which our new workflow relies on.  Lambda Function names are also much neater now.
* **1 REST API With Your Project's Stages:**  JAWS created a separate REST API on API Gateway for each of your Project stages.  Now, your project just has one REST API and your Project's Stages are added as stages on that REST API.
* **No More 'jaws-core-js' Module:** We still give you ENV Variable support, but without needing to install the jaws-core-module.
* **Function Deploy Code, Endpoint or Both:** Endpoints are considered an attribute of Functions and the new commands reflect that.  You can use "function deploy code", "function deploy endpoint", or "function deploy both".
* **Multiple Endpoints Per Lambda Support:** Reduce Lambda boilerplate significantly by adding multiple Endpoints to a single Lambda function.  We recommend creating 1 Lambda function for your resource (Users, Images, etc.) and creating Endpoints for each Method used for that resource.  Then use the Lambda to determine the Method and route it to the correct logic in your Module's 'lib' folder.
