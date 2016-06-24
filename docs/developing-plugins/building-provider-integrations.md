# Building provider integrations

Integrating different Infrastructure providers happens through the standard plugin setup. Infrastructure provider
plugins should bind to specific lifecycle events of the `deploy` command to compile the function and their events
to provider specific resources.

## Deployment lifecycles

Let's take a look at the [core `deploy` plugin](/lib/plugins/deploy) and the different lifecycle hooks it provides.

The following lifecycles events are run in order once the user types `serverless deploy` and hits enter:

- `deploy:initializeResources`
- `deploy:createProviderStacks`
- `deploy:compileFunctions`
- `deploy:compileEvents`
- `deploy:deploy`

You, as a plugin developer can hook into those lifecycles to compile and deploy functions and events on your providers
infrastructure.

Let's take a closer look at each lifecycle event to understand what its purpose is and what it should be used for.

### `deploy:initializeResources`

This lifecycle should be used to load the basic resources the provider needs into memory (e.g. parse a basic resource
template skeleton such as a CloudFormation template).

### `deploy:createProviderStacks`

The purpose of the `deploy:createProviderStacks` lifecycle is to take the basic resource template which was created in
the previous lifecycle and deploy the rough skeleton on the cloud providers infrastructure (without any functions
or events).

### `deploy:compileFunctions`

Next up the functions inside the [`serverless.yaml`](../understanding-serverless/serverless-yaml.md) file should be
compiled to provider specific resources and stored into memory.

### `deploy:compileEvents`

After that the events which are defined in the [`serverless.yaml`](../understanding-serverless/serverless-yaml.md)
file on a per function basis should be compiled to provider specific resources and also stored into memory.

### `deploy:deploy`

The final lifecycle is the `deploy:deploy` lifecycle which should be used to deploy the previously compiled function and
event resources to the providers infrastructure.

## Amazon Web Services provider integration

Curious how this works for the Amazon Web Services (AWS) provider integration?
Here are the steps in detail the AWS plugins take to compile and deploy the service on the AWS infrastructure.

### The steps in detail

1. The `serverless.yaml` and `serverless.env.yaml` files are loaded into memory
2. A default AWS CloudFormation template is loaded (`deploy:initializeResources`)
3. The CloudFormation template is deployed to AWS (`deploy:createProviderStacks`)
4. The functions of the `serverless.yaml` file are compiled to lambda resources and stored into memory
(`deploy:compileFunctions`)
5. Each functions events are compiled into CloudFormation resources and stored into memory (`deploy:compileEvents`)
6. The compiled function and event resources are attached to the core CloudFormation template and the updated
CloudFormation template get's redeployed (`deploy:deploy`)

### The code

You may also take a closer look at the corresponding plugin code to get a deeper knowledge about what's going on
behind the scenes.

The full AWS integration can be found in [`lib/plugins/aws`](/lib/plugins/aws).
