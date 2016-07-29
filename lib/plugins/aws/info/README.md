# Info

This plugin displays information about the service.

## How it works

`Info` hooks into the [`info:info`](/lib/plugins/info) lifecycle. It will get the general information about the service and will query
CloudFormation for the Outputs of the stack. Outputs will include Lambda functions ARNs, endpoints and other resources.
