<!--
title: AWS Lambda Functions
description: 'Configure AWS Lambda functions in serverless.yml: handler, runtime, memory, URLs, container images, VPC, environment, logs, versions and async invocation.'
short_title: Functions
keywords:
  [
    'Serverless Framework',
    'AWS Lambda functions',
    'serverless.yml functions',
    'handler',
    'runtime',
    'Lambda function URL',
    'environment variables',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/functions)

<!-- DOCS-SITE-LINK:END -->

# AWS Lambda Functions

Each entry under `functions` in `serverless.yml` is an AWS Lambda function: an exported handler that Lambda calls once per event or request. This page lists the settings a function takes, where each one can be set (per function, or service-wide under `provider`), and what the Framework creates in AWS for it. To run a standard HTTP server such as Express, Fastify, Hono or Next.js instead, use a [web app](./web-apps.md) (see [Web apps or functions?](./web-apps.md#web-apps-or-functions)).

The smallest service with one function:

```yaml
# serverless.yml
service: my-service

provider:
  name: aws
  runtime: nodejs24.x

functions:
  hello:
    handler: handler.hello
```

```javascript
// handler.mjs
export const hello = async (event) => {
  return { message: 'Hello from Lambda' }
}
```

`handler` is the file path without its extension, a dot, and the exported function name: `handler.hello` runs the `hello` export of `handler.mjs` (or `handler.js`) next to `serverless.yml`. Run `serverless deploy` from the service directory to create the function; to trigger it from an AWS event source, add [events](./events.md).

## Configuration

The basic function settings, with their defaults:

```yaml
# serverless.yml
service: my-service

provider:
  name: aws
  runtime: nodejs24.x # default runtime for every function
  memorySize: 512 # MB, default 1024
  timeout: 10 # seconds, default 6
  architecture: arm64 # default x86_64

functions:
  hello:
    handler: handler.hello # required unless the function uses `image`
    name: ${sls:stage}-hello # deployed name, default <service>-<stage>-<function key>
    description: Says hello # up to 256 characters
    runtime: python3.14 # overrides provider.runtime
    memorySize: 1024 # overrides provider.memorySize
    timeout: 30 # overrides provider.timeout
```

| Key            | Type    | Default                                | Allowed values                           |
| -------------- | ------- | -------------------------------------- | ---------------------------------------- |
| `handler`      | string  | Required (unless `image`)              | `<file path without extension>.<export>` |
| `name`         | string  | `<service>-<stage>-<key>`              | Any valid Lambda function name           |
| `description`  | string  | None                                   | Up to 256 characters                     |
| `runtime`      | string  | `provider.runtime`, else `nodejs20.x`  | A Lambda runtime identifier              |
| `memorySize`   | integer | `provider.memorySize`, else 1024       | 128 to 10240 (MB)                        |
| `timeout`      | integer | `provider.timeout`, else 6             | 1 to 1800 (seconds)                      |
| `architecture` | string  | `provider.architecture`, else `x86_64` | `x86_64`, `arm64`                        |

For a setting that exists both on the function and under `provider`, the function's own value wins, and `provider` supplies the value for functions that don't set one. `environment`, `tags` and the `logs` keys are merged key by key instead (see [Environment variables](#environment-variables), [Tags](#tags) and [Log format and log levels](#log-format-and-log-levels)).

### Runtime

`provider.runtime` sets the runtime for every function, and a function's own `runtime` overrides it. When neither is set, the function uses `nodejs20.x`, a runtime AWS has deprecated, so set a runtime explicitly. Every [AWS Lambda managed runtime identifier](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html) is accepted, including the Amazon Linux 2023 Java runtimes `java8.al2023`, `java11.al2023` and `java17.al2023`.

When a function uses a runtime AWS has deprecated, `serverless package` and `serverless deploy` print a warning that names the functions, the deprecation date and the dates Lambda stops allowing new functions and updates on that runtime, with a link to the list of supported runtimes. The warning covers functions that get the default runtime too. Container image functions are not checked, because their runtime comes from the image.

### Memory size limits

`memorySize` accepts 128 to 10240 MB. A function with `capacityProvider` ([Lambda Managed Instances](./managed-instances.md)) defaults to 2048 MB instead of 1024, needs at least 2048 MB, and accepts up to 32768 MB; a value outside those ranges stops packaging with an error.

### Timeout limits

`timeout` accepts 1 to 1800 seconds (30 minutes), the maximum Lambda allows for most functions. Lambda allows up to 5400 seconds for Managed Instances functions invoked asynchronously or through most event source mappings ([Lambda quotas](https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html#function-configuration-deployment-and-execution)); the Framework's schema still warns above 1800. A caller can stop waiting sooner: an `http` or `httpApi` event answers the client within the API Gateway integration timeout, while the function keeps running until it returns or reaches its own `timeout`. A function with `capacityProvider` ([Lambda Managed Instances](./managed-instances.md)) is not stopped at its timeout: Lambda fails the invocation, but the code keeps running, so check the remaining time in the invocation context and stop before it reaches zero ([invoke timeouts](https://docs.aws.amazon.com/lambda/latest/dg/lambda-managed-instances-execution-environment.html#lambda-managed-instances-invoke-timeouts)).

### Functions in separate files

`functions` also takes a list, which lets you keep functions in separate files. Each file holds function entries keyed by name:

```yaml
# serverless.yml
functions:
  - ${file(./foo-functions.yml)}
  - ${file(./bar-functions.yml)}
```

```yaml
# foo-functions.yml
getFoo:
  handler: handler.getFoo
deleteFoo:
  handler: handler.deleteFoo
```

## Execution role permissions

Every Lambda function runs with an IAM execution role. By default, the Framework creates one role for the service and adds the permissions the function's own settings need (logs, event sources, VPC access, and the others named on this page). To let your code call other AWS services, add statements under `provider.iam.role.statements`:

```yaml
provider:
  name: aws
  iam:
    role:
      statements:
        - Effect: Allow
          Action:
            - dynamodb:GetItem
            - dynamodb:PutItem
          Resource:
            Fn::GetAtt: [UsersTable, Arn]

resources:
  Resources:
    UsersTable:
      Type: AWS::DynamoDB::Table
      Properties:
        BillingMode: PAY_PER_REQUEST
        AttributeDefinitions:
          - AttributeName: id
            AttributeType: S
        KeySchema:
          - AttributeName: id
            KeyType: HASH
```

Statements are copied into the CloudFormation template, so `Ref`, `Fn::GetAtt`, `Fn::Join` and other intrinsics work in `Resource`.

To use an existing role instead, set `provider.iam.role` to its ARN, or set `role` on a function. The Framework doesn't change a role you supply: it must already grant everything the function needs, including the permissions this page says the Framework adds. Per-function roles, custom roles and the full list of added permissions are in [IAM permissions for functions](./iam.md).

## Reserved concurrency

A function's `reservedConcurrency` sets its [reserved concurrency](https://docs.aws.amazon.com/lambda/latest/dg/configuration-concurrency.html): the maximum number of concurrent executions, set aside from the account's unreserved concurrency. It takes an integer of 0 or more, and `0` stops every invocation of the function. Without it, the function draws on the account's unreserved pool. The setting applies to the function as a whole, so changing it doesn't publish a new version.

```yaml
functions:
  worker:
    handler: handler.worker
    reservedConcurrency: 5
```

## Provisioned concurrency

A function's `provisionedConcurrency` keeps a number of execution environments initialized. Set it to an integer, or to an object with `executions` (required) and `alias` (default `provisioned`):

```yaml
functions:
  api:
    handler: handler.api
    provisionedConcurrency:
      executions: 3
      alias: live
```

The Framework publishes a version even when versioning is turned off, and creates an alias that holds the provisioned concurrency. The function's event sources and its function URL invoke that alias. `provisionedConcurrency` can't be combined with `snapStart`: packaging stops with an error.

## Lambda function URLs

A [Lambda function URL](https://docs.aws.amazon.com/lambda/latest/dg/configuration-function-urls.html) is an HTTPS endpoint for one function, without API Gateway. Set `url: true` on the function for a public URL without CORS:

```yaml
functions:
  api:
    handler: handler.api
    url: true
```

`serverless deploy` prints the URL, and the stack holds it in an output. Without `authorizer`, the URL accepts requests without AWS credentials, and the Framework adds the resource-based permissions a public URL needs. When the function has `snapStart`, `provisionedConcurrency` or `durableConfig`, the URL targets the alias those settings create.

The object form of `url` takes these keys:

| Key          | Type            | Default    | Allowed values                                                     |
| ------------ | --------------- | ---------- | ------------------------------------------------------------------ |
| `authorizer` | string          | None       | `aws_iam`                                                          |
| `cors`       | boolean, object | No CORS    | `true`, or an object (see [Function URL CORS](#function-url-cors)) |
| `invokeMode` | string          | `BUFFERED` | `BUFFERED`, `RESPONSE_STREAM`                                      |

### Function URL authorization

With `authorizer: aws_iam`, the URL accepts only requests signed with AWS credentials that allow both `lambda:InvokeFunctionUrl` and `lambda:InvokeFunction` on the function. A caller in another AWS account also needs both actions granted in the function's resource-based policy; see [Using the AWS_IAM auth type](https://docs.aws.amazon.com/lambda/latest/dg/urls-auth.html#urls-auth-iam).

```yaml
functions:
  api:
    handler: handler.api
    url:
      authorizer: aws_iam
```

### Function URL CORS

With `cors: true`, browsers on any origin can call the URL. The Framework sets these headers:

| Header                         | Value                                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------- |
| `Access-Control-Allow-Origin`  | `*`                                                                                         |
| `Access-Control-Allow-Headers` | `Content-Type, X-Amz-Date, Authorization, X-Api-Key, X-Amz-Security-Token, X-Amzn-Trace-Id` |
| `Access-Control-Allow-Methods` | `*`                                                                                         |

To change them, set `cors` to an object. Keys you leave out keep the defaults in the preceding table; set `allowedOrigins`, `allowedHeaders` or `allowedMethods` to `null` to remove that header.

```yaml
functions:
  api:
    handler: handler.api
    url:
      cors:
        allowedOrigins:
          - https://app.example.com
        allowedHeaders:
          - Content-Type
          - Authorization
        allowedMethods:
          - GET
        allowCredentials: true
        exposedResponseHeaders:
          - X-Request-Id
        maxAge: 6000 # seconds
```

| `cors` key               | Header                             | Constraint         |
| ------------------------ | ---------------------------------- | ------------------ |
| `allowedOrigins`         | `Access-Control-Allow-Origin`      | 1 to 100 items     |
| `allowedHeaders`         | `Access-Control-Allow-Headers`     | 1 to 100 items     |
| `allowedMethods`         | `Access-Control-Allow-Methods`     | 1 to 6 items       |
| `allowCredentials`       | `Access-Control-Allow-Credentials` | Boolean            |
| `exposedResponseHeaders` | `Access-Control-Expose-Headers`    | 1 to 100 items     |
| `maxAge`                 | `Access-Control-Max-Age`           | Integer, 0 or more |

### Function URL response streaming

`invokeMode: RESPONSE_STREAM` streams the response; the value is case-insensitive.

```yaml
functions:
  api:
    handler: handler.api
    url:
      invokeMode: RESPONSE_STREAM
```

## Referencing container image as a target

A function can run a [container image](https://docs.aws.amazon.com/lambda/latest/dg/images-create.html) instead of a zip package. Set `image` instead of `handler`: setting both, or neither, stops packaging with an error. `runtime` and `runtimeManagement` are ignored for image functions, because the image carries the runtime.

`image` takes one of three forms:

- The key of an image under `provider.ecr.images`.
- An existing ECR image URI: `<account>.dkr.ecr.<region>.amazonaws.com/<repository>@<digest>` or `<account>.dkr.ecr.<region>.amazonaws.com/<repository>:<tag>`.
- An object with `name` (a key under `provider.ecr.images`) or `uri`, plus the optional overrides `workingDirectory` (a string), `command` and `entryPoint` (lists of strings in exec form).

```yaml
provider:
  name: aws
  ecr:
    images:
      app:
        path: ./ # Docker build context holding the Dockerfile

functions:
  hello:
    image: app
  report:
    image:
      name: app
      command:
        - report.handler
  existing:
    image: 123456789012.dkr.ecr.us-east-1.amazonaws.com/my-repo@sha256:6bb600b4d6e1d7cf521097177dd0c4e9ea373edb91984a505333be8ac9455d38
```

### Image definitions under `provider.ecr.images`

Each entry under `provider.ecr.images` is either an object with `uri` (an existing image) or an object that the Framework builds with `docker build` and pushes:

| Key            | Type            | Description                                                                                                          |
| -------------- | --------------- | -------------------------------------------------------------------------------------------------------------------- |
| `path`         | string          | Docker build context, relative to the service directory.                                                             |
| `file`         | string          | Dockerfile relative to `path`. Default `Dockerfile`.                                                                 |
| `buildArgs`    | object          | Passed as `--build-arg KEY=value`.                                                                                   |
| `buildOptions` | list of strings | Extra options passed to `docker build`.                                                                              |
| `cacheFrom`    | list of strings | Passed as `--cache-from`.                                                                                            |
| `platform`     | string          | Passed as `--platform`, for example `linux/amd64` or `linux/arm64`. Without it, Docker builds for the local machine. |
| `provenance`   | string          | Passed as `--provenance`.                                                                                            |

An entry with `uri` can't also set `path`, `buildArgs`, `buildOptions`, `cacheFrom`, `platform` or `provenance`. Building needs Docker on the machine that runs `serverless deploy`.

Build the image for the function's `architecture` (`x86_64` unless set). On an arm64 machine, such as an Apple silicon Mac, set `platform: linux/amd64` for an `x86_64` function.

```yaml
provider:
  name: aws
  ecr:
    scanOnPush: true
    maxImages: 10
    images:
      app:
        path: ./app
        file: Dockerfile.prod
        buildArgs:
          STAGE: ${sls:stage}
        cacheFrom:
          - my-image:latest
        platform: linux/amd64
```

### The ECR repository for built images

The first deploy that builds an image with `path` creates an ECR repository named `serverless-<service>-<stage>` (lowercased) in the deployment account and Region; images referenced by `uri` need no repository. `serverless deploy` runs `docker login` against it when needed; depending on your Docker configuration, the login token may be stored unencrypted (see the credential store section of [`docker login`](https://docs.docker.com/reference/cli/docker/login/)). `serverless remove` deletes the repository.

- `provider.ecr.scanOnPush` (boolean, default `false`) turns on [image scanning](https://docs.aws.amazon.com/AmazonECR/latest/userguide/image-scanning.html). It applies only when the Framework creates the repository; changing it later doesn't update an existing repository.
- `provider.ecr.maxImages` (integer, 1 or more, no default) adds an ECR [lifecycle policy](https://docs.aws.amazon.com/AmazonECR/latest/userguide/LifecyclePolicies.html) that expires untagged, superseded images once their count passes the value. The current image of each `provider.ecr.images` entry stays tagged and is never expired. The policy is written each time an image is built while `maxImages` is set; removing `maxImages` leaves the policy on the repository. Older Lambda versions still reference older image digests, so pick a value that covers the versions you might roll back to. The deploying identity needs `ecr:PutLifecyclePolicy`.

Without `maxImages`, the repository keeps every pushed image.

## Instruction set architecture

Lambda functions run on x86_64 processors unless you choose [arm64](https://docs.aws.amazon.com/lambda/latest/dg/foundation-arch.html) (AWS Graviton). Set `architecture` under `provider` for every function, or on one function:

```yaml
provider:
  name: aws
  architecture: arm64

functions:
  legacy:
    handler: handler.legacy
    architecture: x86_64 # overrides provider.architecture
```

Native dependencies and container images must be built for the architecture the function runs on.

## Durable functions

[Lambda durable functions](https://docs.aws.amazon.com/lambda/latest/dg/durable-functions.html) coordinate multi-step work that can run for long periods. Turn one on with `durableConfig`:

```yaml
functions:
  orderWorkflow:
    handler: handler.main
    runtime: nodejs24.x
    durableConfig:
      executionTimeout: 3600 # required, seconds, 1 to 31622400 (366 days)
      retentionPeriodInDays: 14 # optional, 1 to 90; Lambda's default is 14
```

- Supported runtimes: Node.js 22 and later, Python 3.13 and later, Java 17 and later, .NET 8 and later, OS-only runtimes from `provided.al2023` (for example Go), and container images. Any other runtime stops packaging with an error. Node.js and Python runtimes include the durable execution SDK; for Java, .NET and Go, include it in your package (for Go, it is built into the `bootstrap` binary). See [supported runtimes](https://docs.aws.amazon.com/lambda/latest/dg/durable-supported-runtimes.html).
- Lambda rejects unqualified invocations of durable functions, so the Framework always versions the function and publishes an alias named `durable` (or uses the SnapStart or provisioned concurrency alias when the function has one). Event sources and the function URL invoke that alias. `versionFunction: false` on the same function stops packaging with an error.
- On the execution roles the Framework creates, it attaches the `AWSLambdaBasicDurableExecutionRolePolicy` managed policy. A role you supply needs those permissions too.
- Durability is fixed when Lambda creates the function: adding or removing `durableConfig` on a deployed function needs a new function name, or removing the function, deploying, and adding it back. Changing `executionTimeout` or `retentionPeriodInDays` updates the function in place.

A Go function runs on `provided.al2023` with a `bootstrap` binary that you build and zip before deploying:

```bash
GOOS=linux GOARCH=arm64 CGO_ENABLED=0 go build -tags lambda.norpc -o bootstrap main.go
mkdir -p bin && zip bin/orderWorkflow.zip bootstrap
```

```yaml
package:
  individually: true

functions:
  orderWorkflow:
    handler: bootstrap
    runtime: provided.al2023
    architecture: arm64
    package:
      artifact: bin/orderWorkflow.zip
    durableConfig:
      executionTimeout: 3600
```

To start a durable execution and read its ARN, see [invoking durable functions](../cli-reference/invoke.md#durable-functions).

## Runtime management

[Runtime management](https://docs.aws.amazon.com/lambda/latest/dg/runtimes-update.html) controls when Lambda moves a function to a new runtime version. Set `runtimeManagement` under `provider` for every function, or on one function:

- `auto` (Lambda's default): Lambda updates the runtime automatically.
- `onFunctionUpdate`: Lambda updates the runtime when you deploy a change to the function.
- `manual`: the function stays on the runtime version you name. Only the object form takes it, with `arn` set to the runtime version ARN.

```yaml
provider:
  name: aws
  runtimeManagement: onFunctionUpdate

functions:
  pinned:
    handler: handler.pinned
    runtimeManagement:
      mode: manual
      arn: arn:aws:lambda:us-east-1::runtime:RUNTIME_VERSION_ID
```

Replace `RUNTIME_VERSION_ID` with the runtime version from the function's Lambda console page or from `aws lambda get-runtime-management-config`. The object form also accepts `mode: auto` and `mode: onFunctionUpdate`. Container image functions ignore `runtimeManagement`.

## SnapStart

[Lambda SnapStart](https://docs.aws.amazon.com/lambda/latest/dg/snapstart.html) reduces cold-start latency: when a version is published, Lambda runs the initialization code once, snapshots the initialized environment, and restores later environments from the snapshot. Turn it on per function with `snapStart: true`, for zip packages and for container images:

```yaml
functions:
  api:
    handler: com.example.Handler
    runtime: java21
    snapStart: true
  inference:
    image: inference
    snapStart: true
```

### Supported runtimes and images

AWS supports SnapStart for Java 11 and later, Python 3.12 and later, and .NET 8 and later, as managed runtimes and as the matching AWS base images. Those functions need nothing beyond `snapStart: true`.

A container image on any other base (the AWS base images for Node.js, Ruby or `provided.al2023`, or a custom base) must declare that it is safe to snapshot, with this Dockerfile label or with the [SnapStart runtime hooks](https://docs.aws.amazon.com/lambda/latest/dg/snapstart-runtime-hooks-custom.html):

```dockerfile
LABEL com.amazonaws.lambda.feature.snapstart="Allow"
```

Before adding the label, make sure initialization doesn't create state that must be unique per environment, such as random seeds, unique IDs or cached credentials; see [Handling uniqueness](https://docs.aws.amazon.com/lambda/latest/dg/snapstart-uniqueness.html).

### SnapStart deploy error for images without the label

When an image has neither the label nor the hooks, publishing the version fails during deployment and the deploy output includes:

```text
Resource of type 'AWS::Lambda::Version' with identifier '...' did not stabilize. Status Reason is An error occurred during function initialization.
```

The same message appears when the function's own initialization code throws, so check the function's CloudWatch logs too. On a first deployment, the failed stack is rolled back together with its log group; to read the initialization logs, deploy once without `snapStart`.

### How invocations reach the snapshot

SnapStart applies to published versions only, never to `$LATEST`. When a deploy changes the function's code, image or configuration, the Framework publishes a version and points an alias named `snapstart` at it; a deploy that changes nothing keeps the current version. Every event source on the function invokes that alias. Invoking the unqualified function name, for example with `serverless invoke -f api`, runs a regular cold start; invoke the `snapstart` alias or a version number to exercise the snapshot.

### SnapStart limitations

AWS doesn't support SnapStart together with provisioned concurrency, Amazon EFS, S3 Files, or ephemeral storage above 512 MB. The Framework stops packaging when `snapStart` is combined with `provisionedConcurrency` or with `ephemeralStorageSize` above 512; AWS rejects the other combinations during deployment. SnapStart is not available in every AWS Region; see the [AWS SnapStart documentation](https://docs.aws.amazon.com/lambda/latest/dg/snapstart.html).

### Cost of retained versions

For every runtime except the Java managed runtimes, AWS charges for caching each published version's snapshot for as long as the version exists, plus a charge per restore; see [Lambda pricing](https://aws.amazon.com/lambda/pricing/). With versioning on (the default), each deploy that changes a SnapStart function keeps the previous version, and its snapshot. With `provider.versionFunctions: false` (or `versionFunction: false` on the function), the function is still versioned, and the superseded version is deleted on deploy. Deletion starts with the deploy after the one that applies the setting; versions kept before that stay until you delete them, for example with `aws lambda delete-function --function-name FUNCTION_NAME:VERSION`.

### SnapStart examples

- [Container image with SnapStart (Node.js)](https://github.com/serverless/examples/tree/v4/aws-node-container-snapstart)

## Recursive loop detection

Lambda [detects and stops recursive invocation loops](https://docs.aws.amazon.com/lambda/latest/dg/invocation-recursion.html) between supported AWS services. To let a function's loops run, set `recursiveLoop: allow`; `terminate` is Lambda's default. The value is case-insensitive.

```yaml
functions:
  hello:
    handler: handler.hello
    recursiveLoop: allow
```

## VPC configuration

To run functions in a [VPC](https://docs.aws.amazon.com/lambda/latest/dg/configuration-vpc.html), set `vpc` with `securityGroupIds` (up to 5) and `subnetIds` (up to 16), both required. Under `provider`, it applies to every function; a function's own `securityGroupIds` and `subnetIds` replace the provider's. `ipv6AllowedForDualStack` (boolean, default `false`) allows IPv6 outbound traffic on dual-stack subnets; a function that doesn't set it takes the provider value.

```yaml
provider:
  name: aws
  vpc:
    securityGroupIds:
      - sg-0123456789abcdef0
    subnetIds:
      - subnet-0123456789abcdef0
      - subnet-0fedcba9876543210

functions:
  users: # uses provider.vpc
    handler: handler.users
  reports: # its own VPC settings
    handler: handler.reports
    vpc:
      ipv6AllowedForDualStack: true
      securityGroupIds:
        - sg-0aaaaaaaaaaaaaaaa
      subnetIds:
        - subnet-0bbbbbbbbbbbbbbbb
  public: # no VPC
    handler: handler.public
    vpc: ~
```

- `vpc: ~` (null) on a function keeps it out of the provider VPC. The schema accepts only an object for a function's `vpc`, so use `~` rather than `false`.
- Functions with `capacityProvider` never get a VPC configuration of their own; the capacity provider sets their networking.
- To create network interfaces, a function in a VPC needs the AWS managed policy `AWSLambdaVPCAccessExecutionRole`. The Framework attaches it to the execution roles it creates. A role you supply through `provider.iam.role` or a function's `role` isn't changed: add the policy to its `ManagedPolicyArns`.
- A function in a VPC reaches the internet, and AWS services without a VPC endpoint, only through a NAT gateway: place the NAT gateway in a public subnet, and route internet-bound traffic from the function's private subnets to it. See [Enable internet access for VPC-connected Lambda functions](https://docs.aws.amazon.com/lambda/latest/dg/configuration-vpc-internet.html) and [VPC endpoints](https://docs.aws.amazon.com/vpc/latest/privatelink/create-interface-endpoint.html).

## Environment variables

`environment` sets [environment variables](https://docs.aws.amazon.com/lambda/latest/dg/configuration-envvars.html) on a function. `provider.environment` sets them for every function, and the two are merged key by key: a function gets every provider variable, and its own value wins for a key both set. [MCP servers](./mcp.md), [agents](./agents/README.md), [sandboxes](./sandboxes.md) and [web apps](./web-apps.md) inherit `provider.environment` the same way.

```yaml
provider:
  name: aws
  environment:
    SYSTEM_NAME: mySystem
    TABLE_NAME: tableName1

functions:
  hello: # SYSTEM_NAME=mySystem, TABLE_NAME=tableName1
    handler: handler.hello
  users: # SYSTEM_NAME=mySystem, TABLE_NAME=tableName2
    handler: handler.users
    environment:
      TABLE_NAME: tableName2
```

Variable names must match `^[A-Za-z_][a-zA-Z0-9_]*$`. Values are strings or CloudFormation intrinsics. To copy a value from your machine's environment at deploy time, use an [environment variable reference](../../../guides/variables/env-vars.md) such as `${env:TABLE_NAME}`. To encrypt the values with your own key, see [KMS keys](#kms-keys).

## Tags

`tags` adds tags to a function. `provider.tags` tags every function, and the two are merged key by key, with the function's value winning:

```yaml
provider:
  name: aws
  tags:
    team: payments
    environment: production

functions:
  hello: # team=payments, environment=production
    handler: handler.hello
  users: # team=accounts, environment=production
    handler: handler.users
    tags:
      team: accounts
```

## Lambda layers

`layers` attaches [Lambda layers](https://docs.aws.amazon.com/lambda/latest/dg/chapter-layers.html) to a function, as a list of layer version ARNs (Lambda allows at most 5 per function):

```yaml
functions:
  hello:
    handler: handler.hello
    layers:
      - arn:aws:lambda:us-east-1:123456789012:layer:shared-utils:3
```

`provider.layers` sets layers for every function. A function's own `layers` replaces `provider.layers` for that function; the two lists are not merged. To publish layers from the same service and reference them, see [AWS Lambda layers](./layers.md).

## Log group resources

The Framework creates a CloudWatch Logs log group named `/aws/lambda/<function name>` for each function, so `serverless remove` deletes it with the stack and the execution role can be scoped to it. It creates none for a function when:

- the function sets `disableLogs: true`, or
- `logs.logGroup` is set on the function, or `provider.logs.lambda.logGroup` is set; that log group is yours to manage.

`logRetentionInDays` on a function, or `provider.logRetentionInDays` for every function, sets the retention. Allowed values are the CloudWatch Logs retention periods: 1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, 2192, 2557, 2922, 3288 and 3653 days. Without it, the log group keeps logs indefinitely.

A CloudWatch Logs [account-level retention policy](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/Working-with-log-groups-and-streams.html#account-level-retention-policies) that covers the log group decides its retention instead of `logRetentionInDays`, whether the policy's period is shorter or longer, and also applies when `logRetentionInDays` isn't set. `serverless deploy` still sets `logRetentionInDays` on the log group without an error when a policy exists, so check for one with `aws logs describe-account-policies --policy-type RETENTION_POLICY`, run with the credentials and `--region` of the deploy. A new or changed policy takes effect 24 hours after you save it.

`logDataProtectionPolicy` on a function, or under `provider`, sets the log group's [data protection policy](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/mask-sensitive-log-data-start.html); `Name`, `Version` and `Statement` are required.

```yaml
functions:
  quiet:
    handler: handler.quiet
    disableLogs: true
  audited:
    handler: handler.audited
    logRetentionInDays: 14
    logDataProtectionPolicy:
      Name: data-protection-policy
      Version: '2021-06-01'
      Statement:
        - Sid: audit-policy
          DataIdentifier:
            - arn:aws:dataprotection::aws:data-identifier/EmailAddress
          Operation:
            Audit:
              FindingsDestination: {}
        - Sid: redact-policy
          DataIdentifier:
            - arn:aws:dataprotection::aws:data-identifier/EmailAddress
          Operation:
            Deidentify:
              MaskConfig: {}
```

### Log format and log levels

A function's `logs` object, or `provider.logs.lambda` for every function, sets Lambda's [advanced logging controls](https://docs.aws.amazon.com/lambda/latest/dg/monitoring-cloudwatchlogs-advanced.html). Each key set on the function wins over the same key under `provider.logs.lambda`.

| Key                   | Allowed values                                               | Notes                                                            |
| --------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------- |
| `logFormat`           | `JSON`, `Text`                                               | Lambda's default is `Text`.                                      |
| `applicationLogLevel` | `TRACE`, `DEBUG`, `INFO`, `WARN`, `ERROR`, `FATAL`, any case | Applied only when the effective `logFormat` is `JSON`.           |
| `systemLogLevel`      | `DEBUG`, `INFO`, `WARN`, any case                            | Applied only when the effective `logFormat` is `JSON`.           |
| `logGroup`            | An existing log group name                                   | The Framework then creates no log group for the function.        |
| `logGroupClass`       | `standard`, `infrequent_access`, any case                    | See [Infrequent Access log class](#infrequent-access-log-class). |

```yaml
functions:
  hello:
    handler: handler.hello
    logs:
      logFormat: JSON
      applicationLogLevel: INFO
      systemLogLevel: WARN
```

### Infrequent Access log class

`logs.logGroupClass` selects the CloudWatch Logs [log group class](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CloudWatch_Logs_Log_Classes.html): `standard` (default) or `infrequent_access`, in any case. Infrequent Access costs less per GB ingested and suits logs used for storage and on-demand troubleshooting rather than real-time queries or alarms. Set it on a function, or under `provider.logs.lambda` for every function; a function's value wins, so a function can opt back into `standard`.

```yaml
provider:
  name: aws
  logs:
    lambda:
      logGroupClass: infrequent_access

functions:
  archived:
    handler: handler.archived # infrequent_access from provider
  live:
    handler: handler.live
    logs:
      logGroupClass: standard
```

For a function with `infrequent_access`, the Framework:

- keeps creating the standard log group `/aws/lambda/<function name>`, so history there is preserved when you migrate an existing service;
- creates a second log group `/aws/lambda/<function name>-ia` with the Infrequent Access class and `DeletionPolicy: Retain`, so its data survives `serverless remove`;
- points the function's logging configuration at the `-ia` log group.

Behaviour to plan for:

- `serverless logs -f <function>` stops with the error `LOGS_INFREQUENT_ACCESS_NOT_SUPPORTED` for such a function; read its logs with CloudWatch Logs Insights.
- AWS doesn't change the class of an existing log group. When you remove `logGroupClass` and deploy, the stack stops managing the `-ia` log group, and `DeletionPolicy: Retain` keeps it and its logs in AWS.
- Turning `infrequent_access` back on for the same function then fails with `ResourceAlreadyExistsException`, because the retained log group still exists. Delete the retained log group (its history is lost), or [import it](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/resource-import.html) into the stack, before deploying.
- `logGroupClass` can't be combined with `logs.logGroup` or `provider.logs.lambda.logGroup`: packaging stops with `FUNCTION_LOG_GROUP_CLASS_CUSTOM_LOG_GROUP_CONFLICT`. Set the class on that log group yourself.

Review the [AWS log class comparison](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CloudWatch_Logs_Log_Classes.html) for the CloudWatch Logs features Infrequent Access doesn't offer.

## Versioning deployed functions

By default, the Framework publishes a new [function version](https://docs.aws.amazon.com/lambda/latest/dg/configuration-versions.html) on each deploy that changes the function's code or configuration; a deploy that changes neither keeps the current version. The stack gets a version resource and an output with the latest version for each function, and you can invoke a version by its qualified ARN, for example `arn:aws:lambda:us-east-1:123456789012:function:my-service-dev-hello:3`.

To stop publishing versions for every function, set `provider.versionFunctions: false`. To override the provider setting for one function, set `versionFunction` (singular) on it:

```yaml
provider:
  name: aws
  versionFunctions: false

functions:
  hello:
    handler: handler.hello
    versionFunction: true
```

- Functions with `snapStart`, `provisionedConcurrency` or `durableConfig` are always versioned. `durableConfig` with `versionFunction: false` stops packaging with an error.
- Superseded versions are kept: the Framework can't tell whether an older version is still invoked. Remove them with the [`prune`](./prune.md) command or `custom.prune.automatic`, which keep the number of versions you choose and every version an alias points to.
- The exception is a `snapStart` or `provisionedConcurrency` function with versioning turned off: it is still versioned, and its superseded version is deleted on deploy. For the snapshot cost of retained SnapStart versions, see [Cost of retained versions](#cost-of-retained-versions).

## Dead letter queue (DLQ)

Lambda [retries failed asynchronous invocations](https://docs.aws.amazon.com/lambda/latest/dg/invocation-async-error-handling.html) and can then send the event to a dead-letter queue. A function's `onError` sets that target to an existing SNS topic:

```yaml
functions:
  hello:
    handler: handler.hello
    onError: arn:aws:sns:us-east-1:123456789012:failed-events
```

- A plain-string `onError` must be an SNS topic ARN. A CloudFormation intrinsic (`Ref`, `Fn::GetAtt`, `Fn::ImportValue`, `Fn::Join`, `Fn::Sub` and others) is passed through as it is.
- For a plain-string ARN, the Framework adds `sns:Publish` on the topic to the execution role it creates. For an intrinsic, the shared role gets no permission, so add `sns:Publish` yourself; per-function roles get it in both cases. A role you supply is never changed.
- To send failed events to an SQS queue, use [`destinations.onFailure`](#destinations), which accepts SQS queues.

## KMS keys

Lambda encrypts environment variables at rest. To use your own [AWS KMS](https://aws.amazon.com/kms/) key, set `kmsKeyArn` under `provider` for every function, or on one function, which overrides the provider value:

```yaml
provider:
  name: aws
  kmsKeyArn: arn:aws:kms:us-east-1:123456789012:key/11111111-2222-3333-4444-555555555555
  environment:
    TABLE_NAME: tableName1

functions:
  hello: # uses its own key
    handler: handler.hello
    kmsKeyArn: arn:aws:kms:us-east-1:123456789012:key/66666666-7777-8888-9999-000000000000
  goodbye: # uses the provider key
    handler: handler.goodbye
```

When `kmsKeyArn` is a plain-string ARN, the Framework adds `kms:Decrypt` on the key to the execution role it creates. For a CloudFormation intrinsic, or a role you supply, add the permission yourself. To keep secrets out of environment variables, see AWS's guidance on [securing environment variables](https://docs.aws.amazon.com/lambda/latest/dg/configuration-envvars-encryption.html).

## AWS X-Ray tracing

`provider.tracing.lambda` turns on [AWS X-Ray tracing](https://docs.aws.amazon.com/lambda/latest/dg/services-xray.html) for every function. Both it and a function's `tracing` accept `Active`, `PassThrough` or a boolean, where `true` means `Active`. A function's `Active`, `PassThrough` or `true` overrides the provider setting, and its `false` keeps the provider setting. To stop Lambda from sampling one function's requests while the provider setting is on, set that function's `tracing` to `PassThrough`:

```yaml
provider:
  name: aws
  tracing:
    lambda: true

functions:
  hello:
    handler: handler.hello
    tracing: PassThrough
```

When tracing is on, the Framework adds `xray:PutTraceSegments` and `xray:PutTelemetryRecords` to the execution role it creates; a role you supply needs them too. For API Gateway tracing, see `provider.tracing.apiGateway` in the [REST API events](../events/apigateway.md) page.

## Asynchronous invocation

These settings apply when a function is invoked [asynchronously](https://docs.aws.amazon.com/lambda/latest/dg/invocation-async.html), for example by Amazon S3, Amazon SNS or EventBridge.

### Destinations

`destinations` sends the result of an asynchronous invocation to [a destination](https://docs.aws.amazon.com/lambda/latest/dg/invocation-async-retain-records.html): `onSuccess` and `onFailure` each take a target.

- A string that starts with `arn:` is the ARN of a Lambda function, SQS queue, SNS topic or EventBridge event bus.
- Any other string is the key of a function in this service.
- The object form takes `arn` and `type` (`function`, `sns`, `sqs` or `eventBus`); both are required. `arn` takes a CloudFormation intrinsic (`Ref`, `Fn::GetAtt`, `Fn::ImportValue`, `Fn::Join`, `Fn::Sub`, `Fn::Base64` or `Fn::ToJsonString`), and `type` tells the Framework which permission to add. For a plain ARN, use the string form.

```yaml
functions:
  asyncHello:
    handler: handler.asyncHello
    destinations:
      onSuccess: otherFunctionInService
      onFailure: arn:aws:sns:us-east-1:123456789012:failed-events
  asyncGoodbye:
    handler: handler.asyncGoodbye
    destinations:
      onFailure:
        type: sqs
        arn:
          Fn::GetAtt: [FailedEventsQueue, Arn]
```

The Framework adds the permission to reach the target (`lambda:InvokeFunction`, `sqs:SendMessage`, `sns:Publish` or `events:PutEvents`) to the execution role it creates. A role you supply through `provider.iam.role` or a function's `role` isn't changed.

### Maximum event age and maximum retry attempts

`maximumEventAge` (seconds, 60 to 21600) is how long Lambda keeps an event in the asynchronous queue. `maximumRetryAttempts` (0 to 2) is how many times Lambda retries after an error.

```yaml
functions:
  asyncHello:
    handler: handler.asyncHello
    maximumEventAge: 7200
    maximumRetryAttempts: 1
```

## File system configuration

`fileSystemConfig` mounts a file system in the function: [Amazon EFS](https://docs.aws.amazon.com/lambda/latest/dg/configuration-filesystem.html) or [Amazon S3 Files](https://docs.aws.amazon.com/lambda/latest/dg/configuration-filesystem-s3files.html). It takes:

- `arn` (required): the ARN of an existing EFS or S3 Files access point, or a CloudFormation `Fn::GetAtt`, `Fn::Join` or `Fn::ImportValue`.
- `localMountPath` (required): where to mount it, matching `/mnt/<name>`.
- `type`: `efs` or `s3files`. The Framework detects it from a plain-string ARN; a CloudFormation reference is treated as `efs` unless you set `type: s3files`.

The function needs a VPC (its own `vpc` or `provider.vpc`): without one, packaging stops with `LAMBDA_FILE_SYSTEM_CONFIG_MISSING_VPC`. `fileSystemConfig` can't be combined with `capacityProvider`.

```yaml
functions:
  efsReader:
    handler: handler.efsReader
    fileSystemConfig:
      localMountPath: /mnt/data
      arn: arn:aws:elasticfilesystem:us-east-1:123456789012:access-point/fsap-0d0d0d0d0d0d0d0d0
    vpc:
      securityGroupIds:
        - sg-0123456789abcdef0
      subnetIds:
        - subnet-0123456789abcdef0
  s3Reader:
    handler: handler.s3Reader
    fileSystemConfig:
      localMountPath: /mnt/s3data
      arn: !GetAtt MyS3FilesAccessPoint.AccessPointArn
      type: s3files
    vpc:
      securityGroupIds:
        - sg-0123456789abcdef0
      subnetIds:
        - subnet-0123456789abcdef0
```

The Framework adds the mount permissions to the execution role it creates: `elasticfilesystem:ClientMount` and `elasticfilesystem:ClientWrite` for EFS, `s3files:ClientMount` and `s3files:ClientWrite` for S3 Files. A role you supply needs them too. For the best S3 Files read performance on functions with 512 MB or more memory, also grant `s3:GetObject` and `s3:GetObjectVersion` on the bucket through `provider.iam.role.statements`.

## Ephemeral storage

Lambda gives each function 512 MB of [ephemeral storage](https://docs.aws.amazon.com/lambda/latest/dg/configuration-ephemeral-storage.html) in `/tmp`. To change it, set `ephemeralStorageSize` in MB, from 512 to 10240, or up to 32768 for [GPU functions](./managed-instances.md#run-functions-on-gpus):

```yaml
functions:
  imageProcessor:
    handler: handler.imageProcessor
    ephemeralStorageSize: 1024
```

## Tenant isolation

Lambda's [tenant isolation mode](https://docs.aws.amazon.com/lambda/latest/dg/tenant-isolation.html) runs separate execution environments for each tenant of a multi-tenant application. Set `tenancy.mode` to `per_tenant` (any case):

```yaml
functions:
  multiTenantFunction:
    handler: handler.handler
    tenancy:
      mode: per_tenant
```

Lambda reads the tenant ID from the `X-Amz-Tenant-Id` header of each invocation. AWS restricts mapping that header in HTTP APIs, so pass it through a [REST API](../events/apigateway.md) (`http` event) with a request parameter mapping. `X-Amz-Tenant-Id` is `required: false`, because API Gateway fills it from the mapping:

```yaml
functions:
  restApiFunction:
    handler: handler.handler
    tenancy:
      mode: per_tenant
    events:
      - http:
          path: /api/resource
          method: get
          request:
            parameters:
              headers:
                'My-Tenant-Id': true # the client sends this header
                'X-Amz-Tenant-Id':
                  required: false
                  mappedValue: 'method.request.header.My-Tenant-Id'
```

`mappedValue` can name any [API Gateway mapping source](https://docs.aws.amazon.com/apigateway/latest/developerguide/rest-api-parameter-mapping-sources.html): headers, query strings, path parameters or context variables. To take the tenant ID from a Lambda authorizer, return it in the authorizer's `context` and map `context.authorizer.tenantId`:

```yaml
functions:
  authorizedFunction:
    handler: handler.handler
    tenancy:
      mode: per_tenant
    events:
      - http:
          path: /api/resource
          method: get
          authorizer:
            name: tenantAuthorizer
            resultTtlInSeconds: 0
            identitySource: method.request.header.Authorization
          request:
            parameters:
              headers:
                'X-Amz-Tenant-Id':
                  required: false
                  mappedValue: 'context.authorizer.tenantId'
  tenantAuthorizer:
    handler: authorizer.handler
```

```javascript
// authorizer.mjs
export const handler = async (event) => {
  const tenantId = getTenantId(event.authorizationToken) // your token parsing

  return {
    principalId: 'user123',
    policyDocument: {
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'execute-api:Invoke',
          Effect: 'Allow',
          Resource: event.methodArn,
        },
      ],
    },
    context: { tenantId },
  }
}
```

See [Lambda authorizer output](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-lambda-authorizer-output.html) for the authorizer response format.

## CloudFormation condition and dependencies

A function's `condition` names a CloudFormation [condition](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/conditions-section-structure.html) that decides whether the function resource is created; define the condition under `resources.Conditions`. `dependsOn` takes a list of logical IDs the function resource depends on.

```yaml
functions:
  hello:
    handler: handler.hello
    condition: IsProduction
    dependsOn:
      - UsersTable

resources:
  Conditions:
    IsProduction:
      Fn::Equals: ['${sls:stage}', 'prod']
```

## Other function settings

These function keys are documented with the feature they belong to:

- `events`: the [event sources](./events.md) that invoke the function.
- `role` and `iam`: a custom execution role, or a [per-function IAM role](./iam.md#per-function-iam-roles).
- `package`: per-function [packaging](./packaging.md#packaging-functions-separately).
- `build`: `false` to exclude the function from the [esbuild build](./building.md).
- `capacityProvider`: run the function on [Lambda Managed Instances](./managed-instances.md).
- `httpApi.payload`: the default payload format of the function's [HTTP API events](../events/http-api.md).
- `awsKmsKeyArn`: deprecated; use `kmsKeyArn`.

## Lambda hashing algorithm migration

This section applies only to a service that still sets `provider.lambdaHashingVersion: 20200924`. The property is deprecated, and every package or deploy with that value prints a deprecation warning. Without it, the Framework computes version hashes with the current algorithm. Migrating changes every function's version hash, so plan two deploys per stage:

1. Run `serverless deploy --enforce-hash-update`. The flag sets a temporary description on every function, which forces a new version with the new hash.
2. Remove `provider.lambdaHashingVersion` from `serverless.yml`.
3. Run `serverless deploy` without the flag. The original descriptions come back.

This creates two extra versions per function. To avoid them, migrate in a deploy that changes every function's code anyway (for example a dependency upgrade, or a file added to every artifact), with `provider.lambdaHashingVersion` removed; or, for a stage you can recreate, run `serverless remove`, remove the property, and deploy again.

## Related pages

- [Events](./events.md): connect functions to AWS event sources.
- [IAM permissions for functions](./iam.md): execution roles and the permissions the Framework adds.
- [Packaging](./packaging.md) and [Building](./building.md): what goes into a function's artifact.
- [serverless.yml reference](./serverless.yml.md): every function key in one file.
