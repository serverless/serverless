<!--
title: Serverless Compose
description: Deploy several Serverless Framework services together with Serverless Compose, in dependency order, sharing outputs and parameters between them.
short_title: Compose
keywords:
  [
    'Serverless Framework',
    'Serverless Compose',
    'serverless-compose.yml',
    'multiple services',
    'monorepo',
    'service dependencies',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/compose)

<!-- DOCS-SITE-LINK:END -->

# Serverless Compose

Serverless Compose deploys several services of one repository (a monorepo) with one command. A `serverless-compose.yml` file at the repository root lists the services; Compose runs a command on all of them, in parallel where it can and in dependency order where one service uses another's outputs. Use it when a project has several `serverless.yml` services that are deployed together, such as an API and the queue or database it reads. Services can be Serverless Framework services or AWS SAM and AWS CloudFormation projects.

Given two services in their own directories:

```text
my-app/
  serverless-compose.yml
  service-a/
    serverless.yml
  service-b/
    serverless.yml
```

List them in `serverless-compose.yml`, each with its directory relative to the file:

```yaml
# serverless-compose.yml
services:
  service-a:
    path: service-a

  service-b:
    path: service-b
```

Then run `serverless deploy` in the directory that contains `serverless-compose.yml`, instead of running it in each service:

```bash
serverless deploy
```

```text
✔ service-a
    output1: ...

✔ service-b
    output1: ...

Results: 2 services succeeded, 0 failed, 0 skipped, 2 total    Time: 38s
```

## The serverless-compose.yml file

The CLI uses Compose when the current directory contains a `serverless-compose` file in any of these formats: `serverless-compose.yml`, `.yaml`, `.json`, `.toml`, `.js`, `.mjs`, `.cjs` or `.ts`. In a directory that also contains a `serverless.yml`, the Compose file takes precedence. To use a file with another name, pass `--config <file>`; the file must have a `services` key.

Compose reads these keys of `serverless-compose.yml`:

| Key                         | Type             | Description                                                                                                                                                               |
| --------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `services`                  | Object           | Required. One entry per service. The entry's key is the service's name in Compose commands and references; it doesn't have to match `service` in `serverless.yml`.        |
| `services.<name>.path`      | String           | Required. The service's directory, relative to the directory of `serverless-compose.yml`.                                                                                 |
| `services.<name>.params`    | Object           | Parameters passed to this service, read in its configuration as `${param:<key>}`. See [Pass parameters to one service](#pass-parameters-to-one-service).                  |
| `services.<name>.dependsOn` | String or list   | Services to deploy before this one. See [Explicit dependencies](#explicit-dependencies).                                                                                  |
| `stages.<stage>.params`     | Object           | Parameters passed to every service, per stage, with `default` for all stages. See [Stage parameters for all services](#stage-parameters-for-all-services).                |
| `stages.<stage>.resolvers`  | Object           | Variable resolvers, including named `service` resolvers. See [Referencing a service deployed to a different stage](#referencing-a-service-deployed-to-a-different-stage). |
| `state`                     | String or object | Where Compose stores service outputs. See [State](./state.md).                                                                                                            |
| `frameworkVersion`          | String           | The Framework version range for the whole Compose run. See [Pinning to a specific version](../getting-started.md#pinning-to-a-specific-version).                          |
| `org`                       | String           | The Serverless Framework org the Compose run signs in to, and that services without their own `org` use for Dashboard features.                                           |
| `licenseKey`                | String           | A License Key for the Compose run. See [License Keys](./license-keys.md).                                                                                                 |

Compose doesn't load plugins, and other `serverless.yml` keys have no effect in `serverless-compose.yml`. Variables in it can use sources such as `${env:...}`, `${opt:...}`, `${ssm:...}` and `${param:...}`, plus the `service` source described in [Service dependencies and variables](#service-dependencies-and-variables); variable sources that plugins add aren't available.

## Service dependencies and variables

The `service` variable source passes an output of one service to another and makes Compose deploy them in order. A reference has the form `${service:<service-name>.<OutputKey>}`. Available in v4.42.0 and later.

In this `serverless-compose.yml`, `service-b` receives the `QueueUrl` output of `service-a` as the parameter `queueUrl`:

```yaml
# serverless-compose.yml
services:
  service-a:
    path: service-a

  service-b:
    path: service-b
    params:
      queueUrl: ${service:service-a.QueueUrl}
```

The reference does three things:

1. **Reads an output.** A service's outputs are its CloudFormation stack outputs. `service-a` exposes `QueueUrl` under `resources.Outputs`:

   ```yaml
   # service-a/serverless.yml
   resources:
     Resources:
       MyQueue:
         Type: AWS::SQS::Queue
     Outputs:
       QueueUrl:
         Value: !Ref MyQueue
   ```

2. **Orders the deploy.** `serverless deploy` deploys `service-a` first, then `service-b`.
3. **Passes a parameter.** `service-b` reads the value as a [parameter](./parameters.md):

   ```yaml
   # service-b/serverless.yml
   provider:
     environment:
       SERVICE_A_QUEUE_URL: ${param:queueUrl}
   ```

Use service references to share API URLs, queue URLs, table names and other outputs without hardcoding resource names.

With `serverless package` and `serverless print`, service references read the outputs stored by the last `deploy`, `info` or `remove` of the referenced service (see [Shared state](#shared-state-for-service-outputs)). `package` needs the referenced services to be deployed. `print` shows `NOT_AVAILABLE_IN_PRINT_COMMAND` for a value that doesn't exist yet; a failure to read the state (credentials, network) still stops `print`.

### Service names in references

The service name in a reference is the service's key under `services`, used as declared: dots, hyphens, underscores and other characters included. The output key is the name of a CloudFormation output, which contains no dot, so the last dot separates the two. A referenced service name can't contain the variable syntax's delimiters (`:`, `,`, `}` and quotes), and can't itself come from another service reference, because Compose needs it to order the services.

The shorter form `${service-a.QueueUrl}`, without `service:`, also works for service names and output keys made of letters, digits and hyphens. A single value can't mix the two forms; write every reference in it with `${service:...}`. A mixed value is rejected before any service is deployed.

### Build larger values from service references

A service reference can be part of a larger string, so a connection URL can be assembled in the Compose parameter:

```yaml
# serverless-compose.yml
stages:
  default:
    params:
      dbName: orders-db

services:
  orders-db:
    path: orders-db

  api:
    path: api
    params:
      databaseUrl: postgres://${service:orders-db.Host}:5432/orders
```

Service references nest like any other variable: other variables can appear inside the reference (`${service:${param:dbName}.Host}`, with the `dbName` parameter declared under `stages`), and a reference can sit inside another variable (`${env:${service:orders-db.EnvName}}`). In `print`, a reference nested in another variable receives `NOT_AVAILABLE_IN_PRINT_COMMAND` when its state isn't available, so the enclosing variable might not resolve; give the enclosing variable a fallback (`${env:${service:orders-db.EnvName}, 'n/a'}`) if `print` must work before the first deploy.

### Fallback values for service references

A service reference accepts a fallback like any other variable: `${service:orders-db.Host, 'localhost'}` uses `localhost` when `orders-db` has no deployed state yet or has no `Host` output. In `print`, an unavailable reference still shows `NOT_AVAILABLE_IN_PRINT_COMMAND` rather than the fallback. The fallback doesn't change the deploy order: `orders-db` still deploys before the service that references it. A reference to a service that isn't in `serverless-compose.yml`, or one that isn't of the form `<service-name>.<OutputKey>`, is an error even with a fallback.

## Referencing a service deployed to a different stage

`${service:<service-name>.<OutputKey>}` reads the referenced service's outputs at the stage of the current run, and deploys that service first. That fits services that share one lifecycle.

Stateful services (databases, queues, topics) often have their own lifecycle: they are deployed once to a shared, long-lived stage, while the application services around them are deployed to per-developer stages. A named `service` resolver lets an application service read a shared service's outputs from a fixed stage. Available in v4.42.0 and later.

Declare the resolver under `stages.<stage>.resolvers.<name>` in `serverless-compose.yml`, and reference it as `${<name>:<service-name>.<OutputKey>}`:

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

- `shared` is a `service` resolver pinned to the stage in the `dataStage` parameter. `${shared:orders-db.TopicArn}` reads the `TopicArn` output of `orders-db` as deployed to that stage: runs of stage `prod` read `orders-db` in `prod`, all other stages read it in `dev`.
- The resolver's `stage` is optional; without it, the resolver reads the current run's stage, like `${service:...}`. It accepts a fixed string or a variable that resolves before the services are ordered, such as `${param:...}` or `${opt:...}`, but not a service reference.
- The referenced service must have been deployed to that stage with the Framework; the values come from the [State](./state.md) store.

The consuming service reads the value as an ordinary parameter, whichever stage it came from:

```yaml
# api/serverless.yml
provider:
  environment:
    ORDERS_TOPIC_ARN: ${param:ordersTopicArn}
```

### Deploy order across stages

A `service` reference orders the deploy only when the stage it reads is the stage of the current run. One `serverless-compose.yml` then serves two workflows:

- **Deploy the whole project** with `serverless deploy --stage dev`. `dataStage` is also `dev`, so `${shared:...}` reads the run's stage: `orders-db` deploys before `api`, without `dependsOn`.
- **Deploy the application to a personal stage** with `serverless deploy --service=api --stage alice`. `dataStage` is still `dev`, so the reference reads another stage: `orders-db` isn't deployed, and its `dev` outputs are passed to `api`.

`${service:...}` always reads the run's stage, so it always deploys the referenced service first.

### Options of the service resolver

A named `service` resolver accepts these options:

| Option  | Required | Type   | Default           | Description                                                     |
| ------- | -------- | ------ | ----------------- | --------------------------------------------------------------- |
| `type`  | Yes      | String | No default        | Must be `service`.                                              |
| `stage` | No       | String | Current run stage | The stage whose outputs are read. A fixed string or a variable. |

The `service` resolver is available in `serverless-compose.yml` only; a `type: service` resolver in a service's own `serverless.yml` is rejected. To read the outputs of a CloudFormation stack outside the Compose project, use the [`cf` variable source](./variables/aws/cf-stack.md).

### Errors from service references

- `serverless print` shows the value of a `service` reference when the referenced service is deployed at the stage the reference reads, and `NOT_AVAILABLE_IN_PRINT_COMMAND` otherwise, so it works on a project that hasn't been deployed yet.
- `serverless remove` doesn't need the referenced values.
- The error messages name the fix: an unknown service name lists the valid names, a missing output lists the outputs the service has, and a pinned stage that hasn't been deployed is named. Outside `print`, a reference that can't be resolved stops the run.

## Explicit dependencies

To deploy one service before another without passing a value between them, set `dependsOn` to a service name or a list of names:

```yaml
# serverless-compose.yml
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

A `dependsOn` entry that names a service missing from `services` stops the command with `The service "<name>" referenced in "dependsOn" of "<service>" does not exist`. Dependencies that form a cycle stop it with `Your template has circular dependencies:` followed by the cycle.

## Run a command on all services

In the directory that contains `serverless-compose.yml`, these commands run on every service:

- `serverless deploy` deploys the services.
- `serverless info` shows each service's information.
- `serverless remove` removes the services, a service before the services it depends on.
- `serverless print` prints each service's resolved configuration.
- `serverless package` packages the services.

Compose runs the services in waves: each wave runs, in parallel, the services whose dependencies have finished. When a service fails, the services in the same wave finish, the later waves are skipped, and the command exits with code 1.

Options such as `--stage`, `--region` and `--aws-profile` apply to every service. Each service otherwise uses its own `serverless.yml`: its region, its AWS credentials (`provider.profile`, resolvers or a Dashboard [Provider](./dashboard/providers.md)) and its `frameworkVersion` check.

## Run a command on one service

To run any command on one service, including plugin commands, name the service with `--service` or put its name before the command:

```bash
serverless deploy --service=service-a
```

```bash
serverless service-a deploy
```

```bash
serverless service-a logs --function=index
```

```bash
serverless service-a offline
```

The command runs on that service only. Outputs of services it depends on are read from the [shared state](#shared-state-for-service-outputs), so those services must have been deployed, or the references need a fallback.

`serverless service-a deploy` in the Compose directory and `serverless deploy` in `service-a`'s directory differ in the parameters the service receives. Parameters from `serverless-compose.yml` (`services.<name>.params` and `stages.<stage>.params`) are passed only when the command runs through Compose. Parameters from the service's own `serverless.yml`, `--param` or the Dashboard resolve either way. If the service uses Compose parameters, run its commands from the Compose directory.

## Run a command on a subset of services

To run `deploy`, `remove`, `info`, `print` or `package` on several services, pass a comma-separated list to `--service`:

```bash
serverless deploy --service=service-a,service-d
```

The command runs on exactly the services you name, ordered among themselves by their dependencies (`dependsOn` and service references). Services you don't name are neither deployed nor removed. Their outputs are still read from the [shared state](#shared-state-for-service-outputs) when a named service references them, so a subset can depend on services that are already deployed.

Use a subset when services have different lifecycles, for example to deploy the application services to a preview stage and leave a shared service in place:

```bash
serverless deploy --service=service-a,service-d --stage my-feature
```

Other commands run on one service at a time and stop with an error when given a list. When the shared service lives in a fixed stage rather than the one you deploy to, pin the reference with a named `service` resolver; see [Referencing a service deployed to a different stage](#referencing-a-service-deployed-to-a-different-stage).

## Stage parameters for all services

To give every service the same parameters per stage, set them under `stages` in `serverless-compose.yml`. `default` applies to all stages:

```yaml
# serverless-compose.yml
stages:
  dev:
    params:
      STRIPE_API_KEY: ${ssm:/my-app/dev/stripe-api-key}
  prod:
    params:
      STRIPE_API_KEY: ${ssm:/my-app/prod/stripe-api-key}

services:
  service-a:
    path: service-a
  service-b:
    path: service-b
```

Each service reads the value for the stage it is deployed to:

```yaml
# service-a/serverless.yml and service-b/serverless.yml
functions:
  hello:
    handler: handler.hello
    environment:
      STRIPE_API_KEY: ${param:STRIPE_API_KEY}
```

Parameters passed by Compose are the last source a service checks: a parameter of the same name in the service's own `serverless.yml`, in `--param` or in the Dashboard wins. See [Parameters](./parameters.md#inheritance-and-overriding).

## Pass parameters to one service

To pass parameters to one service only, set them in that service's `params`. A key in `services.<name>.params` overrides a `stages` parameter of the same name for that service:

```yaml
# serverless-compose.yml
services:
  service-a:
    path: service-a
    params:
      user: ${env:USER}
      description: 'A description passed to service-a'
```

```yaml
# service-a/serverless.yml
functions:
  hello:
    handler: handler.hello
    environment:
      USER: ${param:user}
      DESCRIPTION: ${param:description}
```

## Shared state for service outputs

Compose stores each service's outputs in a shared State store, an Amazon S3 bucket, so that service references and single-service commands read them on any machine. `deploy`, `info` and `remove` update a service's stored outputs; `remove` clears them. Compose reads and writes the State with the AWS credentials of the Compose project. For the bucket, its permissions and a custom bucket, see [State](./state.md).

## Remove services

**Warning:** `serverless remove` deletes each service's CloudFormation stack and the resources in it, including stateful resources, unless they have a `DeletionPolicy` of `Retain`.

To remove the whole project, run `serverless remove` in the directory that contains `serverless-compose.yml`. Compose runs [`serverless remove`](../providers/aws/cli-reference/remove.md) for each service, removing a service before the services it depends on.

To remove one service from the project:

1. Check that no other service references it with a service reference or `dependsOn`; those services would stop resolving its outputs.
2. Run `serverless <service-name> remove`, once for each stage you deployed it to.
3. Delete the service's entry from `serverless-compose.yml`.

A service you delete from `serverless-compose.yml` without running step 2 stays deployed in your AWS account.

## Deploy services to different regions

Each service deploys to the region in its own `serverless.yml` (`provider.region`), so services in one Compose project can deploy to different regions, for example `frontend` to `us-east-1` and `backend` to `eu-west-3`. `--region` on a Compose command applies to every service.

Compose deploys each service entry once per run. To deploy the same service to several regions, run a command per region (`serverless deploy --region eu-west-3`): two entries that point at the same `path` would build into the same `.serverless/` directory in parallel and overwrite each other's package.

## Related

- [Parameters](./parameters.md): every source of `${param:...}` values and their precedence.
- [State](./state.md): where Compose stores service outputs.
- [Variables](./variables/README.md): the variable sources available in `serverless-compose.yml` and `serverless.yml`.
- [AWS SAM and CloudFormation](./sam.md): SAM and CloudFormation projects in Compose.
