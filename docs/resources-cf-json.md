This is the JAWS [CloudFormation](https://aws.amazon.com/cloudformation/) resources file.  It contains things like the IAM roles for JAWS lambda functions and API Gateway endpoints.

[AWSM: Amazon Web Services Modules](https://github.com/awsm-org/awsm) can merge data into this file by implementing the
[`resources`,`LambdaIamPolicyDocumentStatements`,and `ApiGatewayIamPolicyDocumentStatements`](https://github.com/awsm-org/awsm/blob/master/README.md#configuration) attribute in the `awsm.json`.

The following CloudFormation Parameters are standardized JAWS project variables that all aws-module CloudFormation
templates should utilize via `Ref`.  Note: `aa` is used so they show up at top of CloudFormation web UI:

* `aaHostedZone`
* `aaStage`
* `aaProjectName`
* `aaDataModelStage` [what's this?](https://github.com/jaws-framework/JAWS/wiki/v1:best-practices#cloud-formation-segmentation)
* `aaNotficationEmail`
* `aaDefaultDynamoRWThroughput`

The following are CloudFormation Resource names that aws-module creators can `Ref` in their CF Templates:

* `IamRoleLambda`
* `IamRoleApiGateway`
