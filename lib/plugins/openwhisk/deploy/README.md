# Deploy

This plugin (re)deploys the service to OpenWhisk.

## How it works

`Deploy` starts by hooking into the
[`deploy:initializeResources`](/lib/plugins/deploy) lifecycle.  It fetches the
user credentials for the OpenWhisk service being used, storing them under
`serverless.service.defaults`. 

### User Credentials 

The plugin attempts to parse configuration settings from the `.wskprops` file in the user's home directory. These
settings can be set manually using the following environment parameters.

- **OW_AUTH** - Authentication key for OpenWhisk provider.
- **OW_APIHOST** - API endpoint for OpenWhisk provider.
- **OW_NAMESPACE** - User namespace for OpenWhisk resources.

If both the properties file and environment parameters are missing one of these
values, an error will be thrown. 

**Note:** Other plugins (e.g. the `Compile Functions` plugin) use these
`defaults` property when compiling resource definitions and using the OpenWhisk
APIs.

### Deploying Functions, Triggers, Rules and Feeds

Next up it hooks into the [`deploy:deploy`](/lib/plugins/deploy) lifecycle and deploys the
previously created resource definitions for Actions, Triggers, Feeds and Rules
using the OpenWhisk APIs.

Resources are deployed in the following order:

- **Actions**
- **Triggers**
- **Feeds**
- **Rules**

Failure to deploy a single resource at any stage will cause the entire
deployment to halt with the error message from the failed deployment.
