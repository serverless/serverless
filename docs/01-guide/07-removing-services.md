<!--
title: Removing Services
menuText: Removing Services
description: How to remove a deployed service
layout: Doc
-->

# Removing a service

The last step we want to introduce in this guide is how to remove the service.

Removal is done with the help of the `remove` command. Just run `serverless remove -v` to trigger the removal process. As in the deploy step we're also running in the `verbose` mode so you can see all details of the remove process.

Serverless will start the removal and informs you about it's process on the console. A success message is printed once the whole service is removed.

**Note:** The removal process will only remove the service on your providers infrastructure. The service directory will still remain on your local machine so you can still modify and (re)deploy it to another stage, region or provider later on.

## Conclusion

We've just removed the whole service from our provider with a simple `serverless remove` command.

## What's next?

You can either dive deeper into our [Advanced Guides](./README.md#advanced-guides) or read through the provider specific documentation we provide:

* [AWS Documentation](../02-providers/aws/README.md)

Have fun with building your Serverless services and if you have feedback on the please let us know in [our Forum](forum.serverless.com) or [open an Issue in our Github repository](https://github.com/serverless/serverless/issues/new) for any bugs you might encounter or if you have an idea for a new feature.
