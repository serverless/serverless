This is the JAWS [CloudFormation](https://aws.amazon.com/cloudformation/) file.

AWS-Modules [aws-modules](./jaws-json.md#jaws-plug-in-module) can merge data into this file by implementing the
[`resources`](docs/jaws-json.md#cfextensions-attributes) attribute in the `awsm.json`.

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
