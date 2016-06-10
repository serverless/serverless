# awsRemove

This plugin removes the service from AWS.

## How it works

`awsRemove` hooks into the [`remove:remove`](/docs/plugins/core/remove.md) lifecycle. The first thing the plugin does
is that it removes all the content in the core S3 bucket (which is used to e.g. store the zipped code of the
lambda functions) so that the removal won't fail due to still available data in the bucket.

Next up it starts the removal process by utilizing the CloudFormation `deleteStack` API functionality.
The stack removal process is checked every 5 seconds. The stack is successfully create if a `DELETE_COMPLETE` stack
status is returned.
