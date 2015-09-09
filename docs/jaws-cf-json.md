This is the JAWS [CloudFormation](https://aws.amazon.com/cloudformation/) file.

JAWS [plug-in modules](./jaws-json.md#jaws-plug-in-module) can merge data into this file by implementing the [`cfExtensions`](docs/jaws-json.md#cfextensions-attributes) attribute in the `jaws.json`.


The following CloudFormation Parameters are standardized JAWS project variables that all cfExtensions statements should utilize via `Ref`.  Note: `aa` is used so they show up at top of CloudFormation web UI:

* `aaHostedZone`
* `aaStage`
* `aaProject Name`
* `aaDataModelStage`
* `aaNotficationEmail`
* `aaDefaultDynamoRWThroughput`

The following are CloudFormation Resource names that JAWS module creators can `Ref` in their CF Templates:

* `IamRoleLambda`
* `IamRoleApiGateway`
