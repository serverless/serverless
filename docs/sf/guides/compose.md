<!--
title: 'Composing Serverless Framework Services'
description: 'Learn how to deploy and orchestrate multiple services using Serverless Framework Compose. This guide covers setup, service dependencies, and global commands for efficient management of serverless applications.'
short_title: Composing Services
keywords:
  [
    'Serverless Framework',
    'composing services',
    'multiple services',
    'service dependencies',
    'global commands',
    'serverless-compose',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/compose)

<!-- DOCS-SITE-LINK:END -->

# Composing Serverless Framework services

Deploying multiple services in a monorepository is a very common pattern across larger teams. Serverless Framework Compose is meant to simplify deploying and orchestrating multiple services. It lets you:

- Deploy multiple services in parallel
- Deploy services in a specific order
- Deploy different types of services (ie. Traditional, SAM, or CloudFormation) together.
- Share outputs from one service to another
- Run commands across multiple services

## Setup

_Note: Compose, as documented here, is available in Serverless Framework **v4.3.1** or greater ([Upgrading guide](upgrading-v4.md)). Initial version was available in v3.15.0 but that is not covered in these docs._

Assuming you have an application containing multiple Serverless Framework services, for example:

```
my-app/
  service-a/
    src/
      ...
    serverless.yml
  service-b/
    src/
      ...
    serverless.yml
```

You can create a `serverless-compose.yml` file at the root of your monorepository.

In that file, you can reference existing Serverless Framework projects by their relative paths:

```yaml
# serverless-compose.yml
services:
  service-a:
    path: service-a

  service-b:
    path: service-b
```

_Note: JS/TS configuration files are also supported (`serverless-compose.{yml,ts,js,json}`)._

## Usage

To deploy all services, instead of running `serverless deploy` in each service, you can now deploy all services at once by running `serverless deploy` at the root:

```text
$ serverless deploy

Serverless ϟ Compose

Serverless Compose enables you to deploy multiple services in one command, in parallel, or ordered by dependencies.
Docs: https://www.serverless.com/framework/docs/guides/compose

✔ service-a
    output1: ...
    output2: ...

✔ service-b
    output1: ...
    output2: ...

Results: 2 services succeeded, 0 failed, 0 skipped, 2 total    Time: 38s
```

### Service dependencies and variables

Service variables let us order deployments and inject outputs from one service
into another. This is possible via the `service` resolver, using the
`${service:<service-name>.<OutputKey>}` syntax. For example:

```yaml
services:
  service-a:
    path: service-a

  service-b:
    path: service-b
    params:
      queueUrl: ${service:service-a.QueueUrl}
```

Let's break down the example above into 3 steps:

1. `${service:service-a.QueueUrl}` will resolve to the `QueueUrl` output of the `service-a` service.

   The outputs of a Serverless Framework service are resolved from its **CloudFormation outputs**. Here is how we can expose the `QueueUrl` output in the `service-a/serverless.yml` config:

   ```yaml
   # service-a/serverless.yml
   # ...

   resources:
     Resources:
       MyQueue:
         Type: AWS::SQS::Queue
         # ...
     Outputs:
       QueueUrl:
         Value: !Ref MyQueue
   ```

2. Because of the dependency introduced by the variable, `serverless deploy` will automatically **deploy `service-a` first, and then `service-b`.**

3. The value will be passed to `service-b` [as a parameter](parameters.md) named `queueUrl`. Parameters can be referenced in Serverless Framework configuration via the `${param:xxx}` syntax:

   ```yaml
   # service-b/serverless.yml
   provider:
     environment:
       # Here we inject the queue URL as a Lambda environment variable
       SERVICE_A_QUEUE_URL: ${param:queueUrl}
   ```

With `serverless package` and `serverless print`, cross-service values are read from the state of the last deployment: `package` requires the referenced services to be deployed, while `print` displays `NOT_AVAILABLE_IN_PRINT_COMMAND` for values that do not exist yet (a failure to read the state — credentials, network — still fails `print` like any other command).

Cross-service variables are a great way to share API URLs, queue URLs, database table names, and more, without having to hardcode resource names or use SSM.

The service name is the key of the service under `services` in the compose file, used as declared — dots, hyphens, underscores and other characters included (the output key is the name of the CloudFormation output, which never contains a dot, so the last dot separates the two). The only characters a referenced service name cannot contain are the variable syntax's own delimiters: `:`, `,`, `}` and quotes. The service name cannot itself come from another service reference — it must be known before the services are ordered.

The shorter `${service-a.QueueUrl}` form (without the `service:` prefix) is also supported for service names made of letters, digits, and hyphens. New configuration is best written with the `${service:...}` form shown above. A single value cannot mix the two forms — write every reference in it with `${service:...}`; a mixed value is rejected before any service is deployed.

#### Building larger values

A service reference can be part of a larger string, so a connection URL can be assembled directly in the compose parameter:

```yaml
# serverless-compose.yml
services:
  orders-db:
    path: orders-db

  api:
    path: api
    params:
      databaseUrl: postgres://${service:orders-db.Host}:5432/orders
```

Service references nest like any other variable: other variables can appear inside the reference (`${service:${opt:db}.Host}`), and a reference can sit inside another variable (`${env:${service:orders-db.EnvName}}`). In `print`, a reference nested inside another variable receives `NOT_AVAILABLE_IN_PRINT_COMMAND` when its state is not available, so the enclosing variable may not resolve; give it a fallback (`${env:${service:orders-db.EnvName}, 'n/a'}`) if `print` must succeed before the first deploy.

A service reference accepts a fallback like any other variable: `${service:orders-db.Host, 'localhost'}` uses `localhost` when `orders-db` has no deployed state yet or has no `Host` output (in `print`, an unavailable reference still renders `NOT_AVAILABLE_IN_PRINT_COMMAND` rather than the fallback). The fallback does not change deploy ordering — `orders-db` still deploys before the service that references it. Referencing a service that is not in the compose file, or writing a reference that is not of the form `<service-name>.<OutputKey>`, is an error even when a fallback is declared.

### Referencing a service deployed to a different stage

By default, `${service:<service-name>.<OutputKey>}` reads the target service's outputs **at the stage of the current run**, and deploys that service first. This is ideal when all of your services share a single lifecycle.

Stateful services — databases, queues, topics — often have a different lifecycle: they are deployed once to a shared, long-lived stage, while the stateless application services around them are deployed to per-developer personal stages. A **named `service` resolver instance** lets an application service read a shared service's outputs from a fixed stage.

A `service` resolver instance is declared under `stages.<stage>.resolvers.<name>`:

```yaml
# serverless-compose.yml
stages:
  default:
    params:
      dataStage: dev
    resolvers:
      shared:
        type: service
        stage: ${param:dataStage}
  prod:
    params:
      dataStage: prod

services:
  orders-db:
    path: orders-db

  api:
    path: api
    params:
      ordersTopicArn: ${shared:orders-db.TopicArn}
```

- `shared` is a `service` resolver instance pinned to the stage held in `dataStage`. `${shared:orders-db.TopicArn}` reads the `TopicArn` output of `orders-db` **as deployed to that stage**.
- The pinned `stage` is optional — omit it to read from the current run's stage (the same behavior as the built-in `${service:...}` form). It accepts a fixed string or a variable such as `${param:...}` or `${opt:...}` — not a service reference, because the stage decides deploy ordering and must be known before the services are ordered. Here `${param:dataStage}` makes `dev` runs read `orders-db@dev` and `prod` runs read `orders-db@prod`.
- Reading pinned outputs requires the target service to have been deployed to that stage through the Framework; the values come from the shared [State](./state) store.

Consumer services stay ordinary `${param:...}` readers — they don't need to know which stage the value came from:

```yaml
# api/serverless.yml
provider:
  environment:
    ORDERS_TOPIC_ARN: ${param:ordersTopicArn}
```

#### Deploy ordering across stages

A `service` reference adds a deploy-ordering edge **only when the stage it reads is the stage of the current run.** This is what lets a single compose file serve two workflows:

- **Bootstrap the whole graph** — `serverless deploy --stage dev`. Here `dataStage` is also `dev`, so `${shared:...}` resolves to the run stage: `orders-db` is deployed before `api` automatically, with no `dependsOn` needed.
- **Deploy app services to a personal stage** — `serverless deploy --service=api --stage alice`. `dataStage` is still `dev`, so the reference points at a different stage: `orders-db` is **not** deployed. Its `dev` outputs are read and injected into `api`, so the shared data service stays untouched while each developer iterates on the app in their own stage.

The built-in `${service:...}` form always reads the run stage, so it always deploys the referenced service first — as in the [Service dependencies and variables](#service-dependencies-and-variables) example above.

#### Configuration reference

| Option  | Required |  Type  | Default           | Description                                                     |
| ------- | :------: | :----: | ----------------- | --------------------------------------------------------------- |
| `type`  |   Yes    | String |                   | Must be `service`.                                              |
| `stage` |    No    | String | Current run stage | The stage whose outputs are read. A fixed string or a variable. |

The `service` resolver is available in `serverless-compose.yml` only. Declaring a `type: service` resolver in a service's own `serverless.yml` is rejected. To reference the outputs of a CloudFormation stack **outside** your Compose project, use the [`aws:cf` resolver](variables/aws/cf-stack.md).

#### Command behavior and errors

- `serverless print` shows the resolved value of a `service` reference when the referenced service is deployed at the stage the reference reads, and renders `NOT_AVAILABLE_IN_PRINT_COMMAND` otherwise. Values come from the state of the last deployment, and `print` never fails on a reference it cannot resolve — it is designed to work on projects that have not been deployed yet.
- `serverless remove` never needs these values.
- Errors point straight at the fix: an unknown service name lists the valid names; a missing output lists the outputs the service does expose; and when a pinned stage has not been deployed, the message names that stage. Outside `print`, an unresolvable reference fails the run rather than being silently substituted.

### Explicit dependencies

Alternatively, it is possible to specify **explicit dependencies** without variables via the `dependsOn` option. For example:

```yaml
services:
  service-a:
    path: service-a

  service-b:
    path: service-b
    dependsOn: service-a

  service-c:
    path: service-c

  service-d:
    path: service-d
    dependsOn:
      - service-a
      - service-c
```

As seen in the above example, it is possible to configure more than one dependency by providing `dependsOn` as a list.

### Global commands

On top of `serverless deploy`, the following commands can be run globally across all services:

- `serverless info` to view all services info
- `serverless remove` to remove all services
- `serverless print` to print all services configuration
- `serverless package` to package all services

### Service-specific commands

It is possible to run commands for a specific service only. For example to deploy only a specific service:

```bash
serverless deploy --service=service-a

# Shortcut alternative
serverless service-a deploy
```

Or tail logs of a single function:

```bash
serverless logs --service=service-a --function=index

# Shortcut alternative
serverless service-a logs --function=index
```

All Serverless Framework commands are supported **only via service-specific commands**, including custom commands from plugins, for example:

```bash
serverless service-a offline
```

### Running a command on a subset of services

`--service` also accepts a comma-separated list, to run a command on several named services at once:

```bash
serverless deploy --service=service-a,service-d
```

The command runs on **exactly** the services you name, ordered among themselves by their dependencies (`dependsOn` and `${service:...}` references) (so a dependency is deployed before the service that depends on it). Services you don't name are left untouched — they are neither deployed nor removed. Their outputs are still available for `${param:xxx}` resolution when a named service references them, so a subset can depend on services that are already deployed elsewhere.

This is useful when different services in the project have different lifecycles — for example, deploying the application services to a personal or preview stage while leaving a shared, long-lived service in place:

```bash
serverless deploy --service=service-a,service-d --stage my-feature
```

The same list works with `remove`, `info`, `print`, and `package`.

When the shared service lives in a fixed stage rather than the one you're deploying to, pin the reference with a named `service` resolver instead — see [Referencing a service deployed to a different stage](#referencing-a-service-deployed-to-a-different-stage).

### Service-specific commands when using parameters

The `serverless service-a deploy` command is the equivalent of running `serverless deploy` in service-a's directory. Both can be used.

However, if "service-a" uses `${param:xxx}` to reference parameters injected by `serverless-compose.yml`, then `serverless service-a deploy` must be used. Indeed, `${param:xxx}` cannot be resolved outside of Serverless Framework Compose.

In these cases, you must run all commands from the root: `serverless service-a deploy`.

## Shared State

With the introduction of shared [State](./state), collaboration across teams deploying multiple services has been significantly improved.
In earlier versions of Serverless Framework Compose, local state management was used, which had several limitations,
especially when multiple people or CI/CD systems deployed services independently.

### Key benefits of shared State:

- **Improved collaboration:** Outputs are always in sync, ensuring that different team members working on different services can collaborate seamlessly. When one person deploys a service, the outputs are immediately available and consistent for everyone else.
- **No need for output synchronization commands:** Previously, local state required manual commands like `serverless outputs`
  and `serverless refresh-outputs` to synchronize outputs across services.
  These commands have been deprecated because the shared State handles this automatically, keeping everything in sync in real time.

### Deprecated local state

The older versions of Compose relied on local state, which has now been deprecated and replaced by shared State.
This deprecation removes the need for manual refreshes, streamlining the deployment and orchestration
process across multiple services.

For more information about shared State, please refer to [the State documentation](./state).

## Configuration

All Variable Resolvers are supported in `serverless-compose.yml`. For example, you can use SSM Parameters, Secrets Manager, or custom variables.

For more information, see the [Variable Resolvers documentation](variables).

In addition, `serverless-compose.yml` provides the `service` resolver for wiring outputs between the services in your project — see [Service dependencies and variables](#service-dependencies-and-variables).

## Stage-specific configuration

You can specify stage-specific configurations using the `stages` block, similar to how it's done in `serverless.yml`. Your composed services can then reference those variables in their `serverless.yml` files using the `${param:<key>}` variable, without needing to explicitly pass them as parameters in `serverless-compose.yml`.

Here’s an example:

```yml
# serverless-compose.yml
stages:
  dev:
    params:
      STRIPE_API_KEY: 'stripe-api-dev-key'
  prod:
    params:
      STRIPE_API_KEY: 'stripe-api-prod-key'
services:
  service-a:
    path: service-a
  service-b:
    path: service-b
```

The `STRIPE_API_KEY` param will be resolved based on the stage you're deploying to and will automatically be available for both services to reference in their `serverless.yml` files:

```yml
# serverless.yml (for both service-a and service-b)
functions:
  hello:
    environment:
      STRIPE_API_KEY: ${param:STRIPE_API_KEY} # Resolves to "stripe-api-dev-key" in dev and "stripe-api-prod-key" in prod
```

## Passing params to indvidual services

The `stages` block mentioned earlier makes stage parameters available to all services. However, if you need to pass parameters to individual services that aren't outputs from other services, you can define them directly in the `params` section of the specific service:

```yml
services:
  service-a:
    path: service-a
    params:
      user: ${env:USER} # You can also use environment variables here, as shown above.
      description: 'This is a hard-coded description that you can pass to your service.'
```

In the serverless.yml file of service-a, you can reference these parameters like this:

```yml
# service-a/serverless.yml
functions:
  hello:
    environment:
      USER: ${param:user}
      DESCRIPTION: ${param:description}
```

### Differences with `serverless.yml`

The `serverless-compose.yml` and `serverless.yml` files have different syntaxes and features.

Unless documented here, expect `serverless.yml` features to not be supported in `serverless-compose.yml`.
For example, it is not possible to include plugins inside `serverless-compose.yml`.

You can [open feature requests](https://github.com/serverless/serverless) if you need features that aren't supported in `serverless-compose.yml`.

## Removing services

To delete the whole project (and all its services), run `serverless remove` in the same directory as `serverless-compose.yml`. This will run [`serverless remove`](../providers/aws/cli-reference/remove.md) in each service directory.

To delete only one service:

1. make sure no other service depends on it (else these services will be broken)
2. run `serverless <service-name> remove`
3. then remove the service from `serverless-compose.yml`

If you remove the service from `serverless-compose.yml` without doing step 1 first, the service will still be deployed in your AWS account.

Remember to do this for every stage you may have previously deployed.

## FAQ

### Multi-region deployments

> Is multi-region deployment possible via Compose?

It is possible to deploy different services to different regions. For example, deploy service `frontend` to us-east-1 and service `backend` to eu-west-3.

However, Compose currently does not support deploying _the same service_ to multiple regions. The reason is that each service is packaged in the `.serverless/` directory. If the same service was to be deployed in parallel to different regions, package artifacts would conflict and overwrite each others.
