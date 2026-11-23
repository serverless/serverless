<!--
title: serverless.yml Reference for AWS
short_title: serverless.yml Reference
description: The serverless.yml properties for AWS with type, default and allowed values, from provider and functions to events, layers and AI agents.
keywords:
  ['Serverless Framework', 'AWS Lambda', 'serverless.yml reference', 'AWS']
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/serverless.yml)

<!-- DOCS-SITE-LINK:END -->

# serverless.yml Reference for AWS

This page lists the properties of `serverless.yml`, the service configuration file of the Serverless Framework, for the `aws` provider; keys kept only for compatibility with earlier major versions are left out, apart from a few marked Deprecated. Each section is one annotated snippet: the comment above a key gives its type, default and allowed values. Use it to look up a key; to learn a feature, follow the link at the top of its section to the feature guide.

Snippets show alternative forms of a key after a comment marked `OR`. One form of each key is active and the others are commented out, so each snippet stays valid YAML. The Framework validates `serverless.yml` against the same schema this page follows; set [`configValidationMode`](#root-properties) to `error` to stop on unknown or misspelled keys.

The sections:

- [Root properties](#root-properties), [stages](#stages), [parameters](#parameters) and [dotenv files](#dotenv-files)
- [Provider](#provider): [general settings](#general-settings), [function defaults](#general-aws-lambda-settings), [deployment bucket](#deployment-bucket), [HTTP API](#api-gateway-v2-http-api), [REST API](#api-gateway-v1-rest-api), [ALB](#alb), [ECR](#docker-image-deployments-in-ecr), [CloudFront](#cloudfront), [IAM](#iam-permissions), [VPC](#vpc), [logs](#logs), [S3 buckets](#s3-buckets) and [capacity providers](#capacity-providers)
- [Package](#package), [functions](#aws-lambda-functions) and [events](#aws-lambda-events)
- [Layers](#function-layers), [sandboxes](#aws-lambda-microvms-sandboxes), [web apps](#web-apps-lambda-web-functions), [MCP servers](#mcp-servers), [AI agents](#ai-agents) and [AppSync](#appsync)
- [Built-in features configured under `custom`](#built-in-features-configured-under-custom) and [AWS resources](#aws-resources)

## Root properties

The top-level keys of `serverless.yml`; `service` and `provider` are required. See [Services](./services.md) for how a service is organized, [Building](./building.md) for the `build` options, [Configuration validation](../../../configuration-validation.md) for `configValidationMode` and [State](../../../guides/state.md) for `state`.

```yml
# serverless.yml

# Serverless Framework org (Dashboard organization). Optional; default: the org saved in ~/.serverlessrc at login.
# Lowercase letters and digits, 2-39 characters
org: myorg

# Dashboard app this service belongs to. Optional. Lowercase letters, digits and single hyphens, 2-39 characters
# With org and service also set, it enables Dashboard features such as deployment tracking, outputs, parameters and
# observability. These need a Dashboard login or Access Key; with a License Key, such a service stops with an error
app: my-app

# Required. Service name: a letter, then letters, digits and hyphens
service: my-service

# Serverless Framework version or range the installer runs for this service, such as '4', '4.44.0' or '>=4.4.0 <5.0.0'. Optional
# A quoted string: an unquoted number such as 4 doesn't pin the version. The installer reads it from the
# configuration file in the working directory, or the file --config names
frameworkVersion: '4'

# Serverless Framework License Key. Optional; the SERVERLESS_LICENSE_KEY environment variable also sets it
licenseKey: ${ssm:/path/to/serverless-framework-license-key}

# Plugins to load, by npm package name or ./local path. Optional
plugins:
  - serverless-plugin-a
# OR the object form, to load local plugins from another directory
# plugins:
#   # Directory to load local plugins from (default: .serverless_plugins in the service directory)
#   localPath: ./plugins
#   modules:
#     - serverless-plugin-a

# Free-form values to reference as ${self:custom.<key>}; plugins and built-in features read their settings here. Optional
custom:
  tableName: users

# esbuild settings for Node.js functions. Optional (see Building)
# Without build.esbuild, only functions whose handler is a TypeScript file are built; with it, every function
# with a Node.js runtime is built. build.esbuild: false turns building off; a function's build: false skips that function
build:
  esbuild:
    # Bundle the code and its dependencies into one file (default: true)
    bundle: true
    # Minify the bundle (default: false)
    minify: false
    # Source maps: true (default: linked maps and NODE_OPTIONS=--enable-source-maps on the functions), false,
    # or an object with type ('inline', 'linked' or 'external') and setNodeOptions (default: false)
    sourcemap: true
    # Packages kept out of the bundle and installed into the package's node_modules. Optional
    external:
      - sharp
    # Packages left out of the package entirely, such as ones a layer provides. Optional
    exclude:
      - my-layer-package
    # Other esbuild options, such as format or target, are passed to esbuild

# Values saved to the Serverless Framework Dashboard on deploy, which other services read with ${output:...}. Optional.
# Values can be strings, numbers, booleans, arrays or objects.
outputs:
  tableName: ${self:custom.tableName}

# State store of Serverless Compose: the name of an S3 resolver whose bucket stores the services' state.
# It takes effect at the top level of serverless-compose.yml (see State); serverless.yml accepts the key without reading it.
state: my-state-resolver
# OR the object form
# state:
#   resolver: my-state-resolver

# How configuration errors are reported: 'warn' (default), 'error' (stop the command) or 'off'
configValidationMode: error

# How deprecations are reported: 'warn:summary' (default, summarised at the end), 'warn' or 'error' (stop the command)
# The SLS_DEPRECATION_NOTIFICATION_MODE environment variable ('warn' or 'error') takes precedence.
deprecationNotificationMode: warn:summary

# Deprecation codes to silence, or '*' for all. Optional.
disabledDeprecations:
  - LAMBDA_HASHING_VERSION_PROPERTY
```

### Stages

Use the `stages` property to specify stage-specific configuration: `params`, `observability` and `resolvers`. Settings under a stage name apply to that stage; settings under `default` apply to every stage that doesn't set them. Stage names under `stages` use letters, digits and hyphens. See [Parameters](../../../guides/parameters.md) and [Observability](../../../guides/observability/README.md).

#### Stage parameters and observability

This snippet sets a parameter and the observability provider per stage:

```yml
# serverless.yml
service: billing
# Required when observability is a boolean
app: billing

stages:
  prod:
    # Observability for the prod stage: true (Dashboard), false (disabled), 'dashboard' or 'axiom'
    observability: true

    # Parameter values for the prod stage, referenced as ${param:<key>}
    params:
      stripe_api_key: ${env:PROD_STRIPE_API_KEY}

  default:
    # Turns observability off in every stage that doesn't set it
    observability: false

    # Parameter values for every stage that doesn't set them
    params:
      stripe_api_key: ${env:DEV_STRIPE_API_KEY}

  staging:
    # OR the object form; provider is required, dataset applies to axiom
    observability:
      provider: axiom
      dataset: my-custom-dataset
```

#### Stage resolvers

Configure [variable resolvers](../../../guides/variables/README.md#variable-resolvers) per stage under `stages.<stage>.resolvers`:

```yml
# serverless.yml

stages:
  default:
    resolvers:
      # Provider name, referenced as ${awsAccount1:...}
      awsAccount1:
        # Provider type: aws, terraform, vault or doppler
        type: aws
        # AWS profile for this provider. Optional
        profile: account1-profile
        # A region set here applies to every resolver of this provider and takes precedence over a nested resolver's region
        # A named resolver of this provider with its own settings, referenced as ${awsAccount1:euSsm:...}
        euSsm:
          type: ssm
          # Region for this resolver when the provider sets none (default: --region, provider.region, AWS_REGION, then us-east-1)
          region: eu-west-1

functions:
  hello:
    handler: handler.hello
    environment:
      SSM_VALUE: ${awsAccount1:euSsm:/path/to/param}
```

### Parameters

The top-level `params` property is deprecated: set parameters under `stages.<stage>.params` instead (see [Stages](#stages)). Both forms are read. For the same key, the highest-precedence value wins: a `--param` CLI option, then `stages.<stage>.params`, `params.<stage>`, `stages.default.params`, `params.default`, Dashboard parameters, and the `params` that `serverless-compose.yml` passes to the service. Learn more in the [Parameters documentation](../../../guides/parameters.md).

```yml
# serverless.yml

# Deprecated: use stages.<stage>.params. Values by stage name; "default" applies to every stage
params:
  default:
    domain: ${sls:stage}.myapi.com
  prod:
    domain: myapi.com
  dev:
    domain: dev.myapi.com

# ${param:domain} resolves to the value for the deployed stage
custom:
  domain: ${param:domain}
```

### Dotenv files

The Framework loads `.env` and `.env.${stage}` from the service directory automatically, and their values are available as [`${env:KEY}` variables](../../../guides/variables/env-vars.md) throughout `serverless.yml`. The `useDotenv` property loads additional `.env` files from outside the service directory, for example configuration shared across the services of a monorepo, or turns loading off:

```yml
# serverless.yml

# true (default): load the local .env files only
useDotenv: true
# OR false: load no .env files at all, local or custom
# useDotenv: false
# OR one file or directory, relative to the service directory
# useDotenv: ../shared
# OR a list of paths; for a key set in several files, the earlier entry wins
# useDotenv:
#   - ./overrides.env # a file
#   - ../ # a directory
```

The files each `useDotenv` value loads:

| Value             | What gets loaded                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------- |
| `true` or omitted | Local `<serviceDir>/.env.${stage}`, then `<serviceDir>/.env`                                      |
| `false`           | Nothing: local and custom `.env` loading is skipped                                               |
| File path         | The local files and that file; no `.${stage}` suffix is tried on a file path                      |
| Directory path    | The local files, then `<dir>/.env.${stage}` (when a stage is set) and `<dir>/.env`                |
| List of paths     | Each entry in order, as for a single file or directory path; earlier entries win for the same key |
| Missing path      | Skipped without an error, like a missing local `.env`                                             |

When `.env` files and the environment set the same key, the value comes from the first of these, in this order:

1. `process.env`, the environment the Framework runs in
2. Local `<serviceDir>/.env.${stage}`
3. Local `<serviceDir>/.env`
4. The `useDotenv` entries in list order (within a directory entry, `.env.${stage}` before `.env`)

Local files take precedence over `useDotenv` files, so `useDotenv` paths work as shared defaults that each service's own files override.

How `useDotenv` values are read:

- Paths are taken literally: variables such as `${opt:stage}` or `${self:…}` aren't resolved inside `useDotenv`, because it is read before variables. For stage-specific shared files, use the directory form, which tries `.env.${stage}`.
- `useDotenv` applies per service. In Serverless Compose, set it in each service's `serverless.yml`; at the top level of `serverless-compose.yml` it has no effect.
- `provider.stage` can't use `${env:…}` values from `.env` files, because the stage is resolved before `.env` files are loaded.
- `useDotenv` also changes classic packaging (functions that esbuild doesn't build): with `useDotenv` set to `true` or a path, the package leaves out the `.env*` files at the service root; with `useDotenv` omitted or `false`, those files are packaged unless a `package.patterns` entry such as `'!.env*'` excludes them. For functions that esbuild builds, see [Packaging patterns](./building.md#packaging-patterns).

## Provider

The `provider` block holds service-wide AWS settings: where and how the service deploys, defaults for every function, and the shared API, IAM, VPC and logging configuration.

### General settings

Deployment target, credentials, CloudFormation stack options, tracing and [custom domains](./domains.md). See [Deploying](./deploying.md) and [AWS credentials](./credentials.md):

```yml
# serverless.yml

provider:
  # Required. The only provider: aws
  name: aws
  # Stage to deploy, overridden by --stage (default: dev)
  stage: dev
  # Region to deploy to, overridden by --region (default: us-east-1)
  region: us-east-1
  # Local AWS profile for deployment credentials. Optional; not with resolver
  profile: production
  # OR the name of a resolver under stages.<stage>.resolvers that provides deployment credentials. Optional; not with profile
  # resolver: aws-account-1
  # CloudFormation stack name: letters, digits and hyphens, up to 128 (default: <service>-<stage>)
  stackName: custom-stack-name
  # Tags for functions, web apps, REST and HTTP APIs, and custom domains. Optional
  # WebSocket APIs get them only with websocket.useProviderTags: true (see the REST API section)
  tags:
    foo: bar
    baz: qux
  # Tags for the CloudFormation stack; CloudFormation propagates them to the stack's resources. Optional
  stackTags:
    key: value
  # How CloudFormation deploys: 'direct' (default) or 'changesets'
  deploymentMethod: direct
  # SNS topic ARNs, in the same Region, that receive the stack's events. Optional
  notificationArns:
    - 'arn:aws:sns:us-east-1:123456789012:mytopic'
  # CloudFormation stack parameters. Optional
  stackParameters:
    - ParameterKey: 'Keyname'
      ParameterValue: 'Value'
      # Reuse the value from the previous deployment instead of ParameterValue. Optional
      # UsePreviousValue: true
  # Keep resources created by a failed deployment instead of rolling back (default: false); for non-production stages
  disableRollback: true
  # CloudFormation rollback triggers: CloudWatch alarms watched during and after deployment. Optional
  rollbackConfiguration:
    MonitoringTimeInMinutes: 20
    RollbackTriggers:
      - Arn: arn:aws:cloudwatch:us-east-1:123456789012:alarm:health
        Type: AWS::CloudWatch::Alarm
      - Arn: arn:aws:cloudwatch:us-east-1:123456789012:alarm:latency
        Type: AWS::CloudWatch::Alarm
  # AWS X-Ray tracing. Optional
  tracing:
    # Trace the REST API (default: false); not with an external apiGateway.restApiId
    apiGateway: true
    # Trace functions: true (same as 'Active'), 'Active' or 'PassThrough'
    lambda: true
  # Kinesis stream event settings. Optional
  kinesis:
    # The only value: names consumers that stream events create with consumer: true <function><stream><service><stage>Consumer
    # (default: <function><stream>Consumer)
    consumerNamingMode: serviceSpecific
  # Custom domain for the service's API: certificate, Route 53 records and API mapping. Optional
  # domain: api.example.com
  # OR the object form
  domain:
    # Required. The domain name
    name: api.example.com
    # Base path of the API mapping, such as v1. Optional (default: none, the domain root)
    basePath: v1
    # 'http', 'rest' or 'websocket'. Default: the type of the API the service creates, or http when it creates none.
    # Set it when the service creates several API types or uses an existing API (restApiId, websocketApiId)
    apiType: http
    # 'regional' (default) or 'edge'; edge is for REST APIs only
    endpointType: regional
    # ACM certificate ARN (default: a matching certificate, requested if none exists and Route 53 hosts the domain)
    certificateArn: arn:aws:acm:us-east-1:123456789012:certificate/12345678-1234-1234-1234-123456789012
    # Domain name of an existing ACM certificate to use instead of matching name. Optional
    certificateName: my-certificate
    # Create Route 53 records (default: true); false for DNS outside Route 53
    createRoute53Record: true
    # Create IPv6 (AAAA) records (default: true); setting it to true explicitly also makes the domain dual-stack
    createRoute53IPv6Record: true
    # Route 53 hosted zone ID (default: detected)
    hostedZoneId: Z1PA6795UKMFR9
    # Look up only private (true) or only public (false) hosted zones (default: both)
    hostedZonePrivate: false
    # AWS profile and Region for Route 53 calls; the Region is also the Region of latency records
    # (default: the service's Region). Optional
    route53Profile: production
    route53Region: us-east-1
    # Route 53 alias record routing. Optional
    route53Params:
      # 'simple' (default), 'latency' or 'weighted'; latency and weighted need a regional endpoint
      routingPolicy: weighted
      # Record weight for weighted routing (default: 200)
      weight: 100
      # Record set identifier for latency and weighted routing (default: the API Gateway domain name)
      setIdentifier: api-primary
      # Route 53 health check ID for latency and weighted routing. Optional
      healthCheckId: 00000000-0000-0000-0000-000000000000
    # Create the alias records in both the public and the private hosted zone (default: false)
    # Ignored when hostedZoneId is set or hostedZonePrivate is true
    splitHorizonDns: false
    # TLS_1_0, TLS_1_2 (default) or an enhanced SecurityPolicy_* policy
    # API Gateway V2 domains (HTTP, WebSocket and REST with a multi-level basePath) take only TLS_1_2
    securityPolicy: TLS_1_2
    # Endpoint access mode: basic or strict. REST APIs with a single-level basePath only; needs a SecurityPolicy_* policy
    # accessMode: strict
    # S3 URI of the mutual TLS truststore; regional endpoints only. Optional
    tlsTruststoreUri: s3://bucket-name/truststore.pem
    # S3 object version of the truststore. Optional
    tlsTruststoreVersion: '1'
    # true (default) or false; also the strings 'true' and 'false'
    enabled: true
    # Find the existing API mapping to update by basePath instead of by API ID (default: false)
    allowPathMatching: false
    # On remove, keep the domain when other APIs still map to it (default: false)
    preserveExternalPathMappings: false
    # Create the domain on deploy and delete it on remove (default: true)
    # false: the domain and its DNS records must already exist; deploy and remove manage only the API mapping
    autoDomain: true
    # Seconds to wait for a new domain before deploying (default: 120)
    autoDomainWaitFor: '120'
    # API stage the mapping points to (default: the service stage)
    # HTTP APIs map the $default stage unless basePath and stage are both set
    # stage: dev
  # OR several domains, as names
  # domains:
  #   - api.example.com
  #   - api-v2.example.com
  # OR several domains, as objects with the domain keys
  # domains:
  #   - name: api.example.com
  #     apiType: http
  #     basePath: v1
  #   - name: websocket.example.com
  #     apiType: websocket
  # OR one entry per API type: http, rest or websocket keys, each holding the domain keys for that API
  # domains:
  #   - rest:
  #       name: api.example.com
  #       stage: dev
  #     websocket:
  #       name: websocket.example.com
  # OR web apps on a hostname through CloudFront (see Web Apps)
  # domains:
  #   # Name of a web app under webApps; the entry without basePath receives every other path
  #   - name: shop.example.com
  #     webApp: web
  #   # basePath routes /api and /api/* to the api web app; the path is forwarded unchanged
  #   - name: shop.example.com
  #     basePath: api
  #     webApp: api
```

### General AWS Lambda settings

Defaults for every function in the service; a function's own key overrides each one. See [Functions](./functions.md):

```yml
# serverless.yml

provider:
  # Lambda runtime of every function that doesn't set one (default: nodejs20.x)
  runtime: nodejs24.x
  # Runtime updates: 'auto' (AWS default) or 'onFunctionUpdate'; for 'manual', use the object form shown in the functions section
  runtimeManagement: auto
  # Memory in MB: 128-10240, or 2048-32768 for functions with a capacityProvider
  # (default: 1024, or 2048 for functions with a capacityProvider)
  memorySize: 512
  # Timeout in seconds, 1-1800 (default: 6)
  # API Gateway REST API integrations time out after 29 seconds by default; HTTP API integrations after 30 seconds at most
  timeout: 10
  # Environment variables of every function, merged with each function's environment. Optional
  environment:
    APP_ENV_VARIABLE: FOOBAR
  # Days to keep logs in the log groups the Framework creates: functions, web apps, API access logs and the
  # Framework's own functions (default: never expire). A function with disableLogs or a logs.lambda.logGroup has none.
  # Values: 1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, 2192, 2557, 2922, 3288 or 3653
  logRetentionInDays: 14
  # CloudWatch Logs data protection policy for function and web app log groups. Optional
  # Name, Version and Statement are required; see the AWS policy format for masking sensitive log data
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
  # KMS key ARN that encrypts the functions' environment variables. Optional
  kmsKeyArn: arn:aws:kms:us-east-1:123456789012:key/1234abcd-12ab-34cd-56ef-1234567890ab
  # Deprecated: no effect at the default '20201221'; '20200924' selects the legacy hashing of function versions
  lambdaHashingVersion: 20201221
  # Publish a function version on each deployment (default: true)
  versionFunctions: false
  # 'x86_64' (default) or 'arm64'
  architecture: x86_64
  # Lambda layer ARNs for every function that doesn't set its own layers. Optional
  layers:
    - arn:aws:lambda:us-east-1:123456789012:layer:my-layer:1
```

The data protection policy format is described in [Help protect sensitive log data with masking](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/mask-sensitive-log-data-start.html).

### Deployment bucket

The S3 bucket the Framework uploads deployment artifacts to. By default, services share one bucket per AWS account and Region that the Framework creates, and outside Serverless Compose a stack that already has its own bucket keeps using it; see [Deployment bucket](../../../guides/deployment-bucket.md):

```yaml
provider:
  # S3 key prefix of deployment artifacts (default: serverless)
  deploymentPrefix: serverless
  # An existing bucket's name (string form), or the object form. Optional
  deploymentBucket:
    # Name of an existing bucket to use instead of the shared one. Optional
    name: com.serverless.${self:provider.region}.deploys
    # Deployments whose artifacts are kept, the new one included; older ones are deleted after each deploy (default: 5)
    # With codeStorageMode: reference, deploy deletes none ("serverless prune --includeArtifacts" retires them)
    maxPreviousDeploymentArtifacts: 10
    # Lambda code storage: 'copy' (default, Lambda copies the code) or 'reference' (Lambda reads it from this bucket)
    codeStorageMode: reference
    # Server-side encryption of uploaded artifacts: AES256 or aws:kms
    serverSideEncryption: AES256
    # KMS key for aws:kms encryption
    sseKMSKeyId: arn:aws:kms:us-east-1:123456789012:key/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
    # Customer-provided encryption key settings (SSE-C)
    sseCustomerAlgorithim: AES256
    sseCustomerKey: string
    sseCustomerKeyMD5: md5sum
    # The following keys apply only to a bucket in the service's own stack (enableLegacyDeploymentBucket, or a stack that already has one)
    # Add an S3 public access block (default: false); the bucket isn't public either way
    blockPublicAccess: true
    # Leave out the bucket policy the Framework adds (default: false)
    skipPolicySetup: true
    # Turn on bucket versioning (default: false); required with codeStorageMode: reference
    versioning: true
    # Tags of the bucket
    tags:
      key1: value1
      key2: value2
  # Create a deployment bucket in the service's own stack instead of using the shared bucket (default: false)
  # Also set with the --enable-legacy-deployment-bucket deploy option or ENABLE_LEGACY_DEPLOYMENT_BUCKET=true
  enableLegacyDeploymentBucket: true
```

### API Gateway v2 HTTP API

The `provider.httpApi` settings configure the HTTP API (API Gateway v2) that [`httpApi` events](../events/http-api.md) create:

```yml
provider:
  httpApi:
    # ID of an existing HTTP API to attach routes to instead of creating one. Optional
    # With id set, cors, authorizers and provider.logs.httpApi aren't allowed
    # id: a1b2c3d4e5
    # API name (default: ${sls:stage}-${self:service})
    name: dev-my-service
    # Use ${self:service}-${sls:stage} as the default name instead (default: false)
    shouldStartNameWithService: false
    # Payload format version, quoted: '1.0' or '2.0' (default: '2.0')
    payload: '2.0'
    # Turn off the default execute-api endpoint, for example behind a custom domain (default: false)
    disableDefaultEndpoint: true
    # Detailed CloudWatch metrics (default: false)
    metrics: true
    # CORS with the defaults: all origins and the common request headers. Not with id
    # cors: true
    # OR CORS settings; omitted keys keep the defaults
    cors:
      allowedOrigins:
        - https://example.com
      allowedHeaders:
        - Content-Type
        - Authorization
      # default: the methods of the service's httpApi events
      allowedMethods:
        - GET
      allowCredentials: true
      exposedResponseHeaders:
        - Special-Response-Header
      # Seconds browsers cache the preflight response
      maxAge: 6000
    authorizers:
      # JWT authorizer, referenced by key from httpApi events
      someJwtAuthorizer:
        # 'jwt' (default) for JWT authorizers
        type: jwt
        # Authorizer name in API Gateway (default: the key)
        name: someJwtAuthorizer
        # Required. Where the token is read from
        identitySource: $request.header.Authorization
        # Required. Token issuer URL
        issuerUrl: https://cognito-idp.us-east-1.amazonaws.com/us-east-1_aBcDeFgHi
        # Required. Accepted audiences (client IDs)
        audience:
          - 1example23456789
      # Lambda request authorizer
      someCustomLambdaAuthorizer:
        # Required: 'request' for Lambda authorizers
        type: request
        # A function of this service; not with functionArn
        functionName: authorizerFunc
        # OR the ARN of a function outside the service; not with functionName
        # functionArn: arn:aws:lambda:us-east-1:123456789012:function:external-authorizer
        # Authorizer name in API Gateway (default: the key)
        name: customAuthorizerName
        # Seconds to cache results, 0 (no caching) to 3600; a value above 0 requires identitySource
        resultTtlInSeconds: 300
        # The function returns the simple response format (default: false)
        enableSimpleResponses: true
        # Payload version sent to the function: '1.0' or '2.0' (default: '2.0')
        payloadVersion: '2.0'
        # Request values that must be present, such as $request.header.Auth; also the cache key. Optional
        identitySource:
          - $request.header.Auth
          - $request.header.Authorization
        # true skips creating the permission API Gateway needs to invoke the function, for a function whose
        # invoke permission is managed outside this service (default: false)
        managedExternally: false
```

### API Gateway v1 REST API

These `provider` settings configure the REST API (API Gateway v1) that [`http` events](../events/apigateway.md) create and the WebSocket API that [`websocket` events](../events/websocket.md) create:

```yml
provider:
  # REST API name (default: ${sls:stage}-${self:service})
  apiName: custom-api-name
  # REST API endpoint type: EDGE (default), REGIONAL or PRIVATE
  endpointType: REGIONAL
  # VPC endpoint IDs of a PRIVATE REST API; only with endpointType PRIVATE
  # vpcEndpointIds:
  #   - vpce-0123456789abcdef0
  # WebSocket API name (default: ${sls:stage}-${self:service}-websockets)
  websocketsApiName: custom-websockets-api-name
  # WebSocket route selection expression (default: $request.body.action)
  websocketsApiRouteSelectionExpression: $request.body.route
  # WebSocket API description (default: Serverless Websockets)
  websocketsDescription: Custom Serverless Websockets
  websocket:
    # Apply provider.tags to the WebSocket API (default: false)
    useProviderTags: true
  # REST API settings. Optional
  apiGateway:
    # ID of an existing REST API to add this service's routes to instead of creating one. Optional
    # With restApiId set, provider.tracing.apiGateway and provider.logs.restApi aren't allowed
    # restApiId: a1b2c3d4e5
    # ID of the existing REST API's root (/) resource; required with restApiId
    # restApiRootResourceId: f6g7h8i9j0
    # Existing resources of that REST API that this service's paths extend, as path: resourceId
    # or a list of { path, resourceId }; list them so the stack doesn't create them again
    # restApiResources:
    #   '/users': k1l2m3n4o5
    #   '/users/create': p6q7r8s9t0
    # ID of an existing WebSocket API to add this service's routes to; the service stage must already exist on it. Optional
    # websocketApiId: u1v2w3x4y5
    # Default integration timeout in milliseconds of http events, 50 or more; an event's timeoutInMillis wins (default: 29000)
    timeoutInMillis: 29000
    # Turn off the default execute-api endpoint (default: false)
    disableDefaultEndpoint: true
    # Where API Gateway reads API keys: HEADER (default) or AUTHORIZER
    apiKeySourceType: HEADER
    # API keys of the REST API, added to the usage plan. Optional
    apiKeys:
      - name: myFirstKey
        # Optional: API Gateway generates a value when omitted; use a variable to keep it out of the file
        value: ${env:MY_API_KEY}
        description: myFirstKeyDescription
        customerId: myFirstKeyCustomerId
        # false disables the key without removing it (default: true)
        enabled: false
      # A string is the key name; API Gateway generates the value
      - ${sls:stage}-mySecondKey
    # Compress responses larger than this size in bytes, 0-10485760. Optional (default: no compression)
    minimumCompressionSize: 1024
    # REST API description. Optional
    description: Some description
    # Media types handled as binary. Optional
    binaryMediaTypes:
      - '*/*'
    # Detailed CloudWatch metrics (default: false)
    metrics: false
    # Use ${self:service}-${sls:stage} as the default REST API name instead of ${sls:stage}-${self:service} (default: false)
    shouldStartNameWithService: false
    # REST API stage name (default: the service stage)
    # stage: v1
    # Resource policy statements of the REST API. Optional
    resourcePolicy:
      - Effect: Allow
        Principal: '*'
        Action: execute-api:Invoke
        Resource:
          - execute-api:/*/*/*
        Condition:
          IpAddress:
            aws:SourceIp:
              - '123.123.123.123'
    # Usage plan of the API keys: quota and throttle. Optional
    usagePlan:
      quota:
        limit: 5000
        offset: 2
        # DAY, WEEK or MONTH
        period: MONTH
      throttle:
        burstLimit: 200
        rateLimit: 100
    # OR several usage plans, keyed by name; apiKeys then group keys by usage plan name
    # usagePlan:
    #   - free:
    #       quota:
    #         limit: 5000
    #         period: MONTH
    #   - paid:
    #       quota:
    #         limit: 50000
    #         period: MONTH
    request:
      # Request validation models that http events reference by key; applied to the application/json content type
      schemas:
        global-model:
          # Required. JSON Schema of the model
          schema: ${file(schema.json)}
          # Model name in API Gateway. Optional
          name: GlobalModel
          # Model description. Optional
          description: 'A global model that can be referenced in functions'
    endpoint:
      # TLS security policy of the REST API, such as SecurityPolicy_TLS13_1_3_2025_09 (REGIONAL, PRIVATE)
      # or SecurityPolicy_TLS13_2025_EDGE (EDGE). Optional
      securityPolicy: SecurityPolicy_TLS13_1_3_2025_09
      # Endpoint access mode with a SecurityPolicy_* policy: basic or strict. Optional
      accessMode: basic
      # Disable the default execute-api endpoint; takes precedence over apiGateway.disableDefaultEndpoint
      disable: false
```

### ALB

The `provider.alb` settings configure the target groups and authorizers of [Application Load Balancer events](../events/alb.md):

```yml
provider:
  alb:
    # Prefix of generated target group names, up to 16 characters. Optional
    targetGroupPrefix: my-prefix
    # Authorizers that alb events reference by key. Optional
    authorizers:
      myFirstAuth:
        # Required. 'cognito' or 'oidc'
        type: cognito
        # Required. Cognito user pool ARN
        userPoolArn: 'arn:aws:cognito-idp:us-east-1:123456789012:userpool/us-east-1_123412341'
        # Required. User pool app client ID
        userPoolClientId: '1h57kf5cpq17m0eml12EXAMPLE'
        # Required. User pool domain prefix
        userPoolDomain: your-test-domain
        # Unauthenticated requests: 'deny' (default, HTTP 401), 'allow' (forward) or 'authenticate' (redirect to the IdP)
        onUnauthenticatedRequest: deny
        # Up to 10 query parameters added to the redirect to the authorization endpoint; string values. Optional
        requestExtraParams:
          prompt: login
          redirect: 'false'
        # Scopes requested from the IdP, space-separated (default: openid)
        scope: 'openid email'
        # Session cookie name (default: AWSELBAuthSessionCookie)
        sessionCookieName: my-session-cookie
        # Session duration in seconds (default: 604800, 7 days)
        sessionTimeout: 7000
      mySecondAuth:
        type: oidc
        # Required. The IdP's authorization endpoint: a full https URL with domain and path
        authorizationEndpoint: 'https://idp.example.com/oauth2/authorize'
        # Required. OAuth client ID
        clientId: my-client-id
        # OAuth client secret: required for a new rule; omit it to keep the secret of an existing rule
        clientSecret: ${ssm:/my-service/oidc-client-secret}
        # Required. The IdP's issuer: a full https URL with domain and path
        issuer: 'https://idp.example.com'
        # Required. The IdP's token endpoint
        tokenEndpoint: 'https://idp.example.com/oauth2/token'
        # Required. The IdP's user info endpoint
        userInfoEndpoint: 'https://idp.example.com/oauth2/userinfo'
        # onUnauthenticatedRequest, requestExtraParams, scope, sessionCookieName and sessionTimeout as for cognito
        onUnauthenticatedRequest: 'deny'
        scope: openid email
        sessionTimeout: 7000
```

### Docker image deployments in ECR

The `provider.ecr` settings define container images for [functions deployed as container images](./functions.md#referencing-container-image-as-a-target): existing images in Amazon ECR, or images the Framework builds with Docker and pushes:

```yaml
provider:
  ecr:
    # Scan images for vulnerabilities on push (default: false)
    # Set when the Framework creates the repository; a later change isn't applied to an existing repository
    scanOnPush: true
    # Superseded (untagged) image versions to keep, through an ECR lifecycle policy. Optional (default: all)
    # Removing the key later leaves the lifecycle policy in place
    maxImages: 10
    # Required. Images by name (lowercase letters, digits, - and _), referenced by key in functions.<name>.image
    images:
      baseimage:
        # URI of an existing image in ECR
        uri: 123456789012.dkr.ecr.us-east-1.amazonaws.com/test-image@sha256:6bb600b4d6e1d7cf521097177d111111ea373edb91984a505333be8ac9455d38
      anotherimage:
        # OR build locally: Docker build context, required without uri
        path: ./image/
        # Dockerfile, relative to path (default: 'Dockerfile')
        file: Dockerfile.dev
        # docker build --build-arg values. Optional
        buildArgs:
          STAGE: ${sls:stage}
        # Extra docker build options. Optional
        buildOptions:
          [
            '--tag',
            'v1.0.0',
            '--add-host',
            'example.com:0.0.0.0',
            '--ssh',
            'default=/path/to/private/key/id_rsa',
          ]
        # docker build --cache-from images. Optional
        cacheFrom:
          - my-image:latest
        # docker build --platform value (not with uri). Optional
        platform: linux/arm64
        # docker build --provenance value (not with uri). Optional
        provenance: 'false'
```

### CloudFront

The `provider.cloudFront` settings define cache policies for the distribution that [CloudFront Lambda@Edge events](../events/cloudfront.md) create:

```yml
provider:
  cloudFront:
    # CloudFront cache policies, referenced by key from cloudFront events (cachePolicy.name)
    cachePolicies:
      myCachePolicy1:
        # Required. Seconds
        DefaultTTL: 60
        MinTTL: 30
        MaxTTL: 3600
        # Optional
        Comment: Cache policy for the docs pages
        ParametersInCacheKeyAndForwardedToOrigin:
          CookiesConfig:
            # Possible values are 'none', 'whitelist', 'allExcept' and 'all'
            CookieBehavior: whitelist
            Cookies:
              - my-public-cookie
          EnableAcceptEncodingBrotli: true # optional
          EnableAcceptEncodingGzip: true
          HeadersConfig:
            # Possible values are 'none' and 'whitelist'
            HeaderBehavior: whitelist
            Headers:
              - authorization
              - content-type
          QueryStringsConfig:
            # Possible values are 'none', 'whitelist', 'allExcept' and 'all'
            QueryStringBehavior: allExcept
            QueryStrings:
              - not-cached-query-string
```

### IAM permissions

The `provider.iam` settings configure the execution role of the service's functions and the role CloudFormation deploys with. The execution roles the Framework creates, shared or per function, also get the permissions their functions' events and settings need, such as writing logs, managing VPC network interfaces and reading SQS queues and streams. A role you supply, here or in a function's `role`, gets none of them, so it must grant them itself. See [IAM permissions](./iam.md):

```yml
provider:
  iam:
    # An existing IAM role (ARN, name or CloudFormation reference) for the functions; the Framework then creates
    # no execution roles, shared or per function
    # role: arn:aws:iam::123456789012:role/role
    # OR settings of the execution role the Framework creates
    role:
      # 'shared' (default): one role for all functions, plus a role of its own for each function that sets
      # iam.role.statements or iam.role.managedPolicies; 'perFunction': a role for every function
      mode: shared
      # Policy statements added to the role the Framework creates
      statements:
        - Effect: Allow
          Action:
            - 's3:ListBucket'
          Resource: 'arn:aws:s3:::my-bucket'
      # Role name, up to 64 characters (default: <service>-<stage>-<region>-lambdaRole)
      name: your-custom-name-role
      # IAM path of the role. Optional
      path: /your-custom-path/
      # Managed policy ARNs attached to the role. Optional
      managedPolicies:
        - arn:aws:iam::123456789012:policy/some-managed-policy
      # Permissions boundary policy ARN. Optional
      permissionsBoundary: arn:aws:iam::123456789012:policy/policy
      # Tags of the role. Optional
      tags:
        key: value
    # IAM role CloudFormation assumes to deploy the stack (default: the deploying credentials)
    deploymentRole: arn:aws:iam::123456789012:role/role
  # CloudFormation stack policy: which resources a deployment may update, replace or delete. Optional
  # This one allows every update except replacing or deleting EC2 instances
  stackPolicy:
    - Effect: Allow
      Principal: '*'
      Action: 'Update:*'
      Resource: '*'
    - Effect: Deny
      Principal: '*'
      Resource: '*'
      Action:
        - Update:Replace
        - Update:Delete
      Condition:
        StringEquals:
          ResourceType:
            - AWS::EC2::Instance
```

### VPC

The `provider.vpc` settings connect every function to a VPC; a function's own `vpc` overrides them. See [VPC configuration](./functions.md#vpc-configuration):

```yml
provider:
  # Optional. securityGroupIds and subnetIds are both required when vpc is set
  vpc:
    # Allow IPv6 outbound traffic from dual-stack subnets (default: false)
    ipv6AllowedForDualStack: true
    # 1-5 security group IDs
    securityGroupIds:
      - sg-0123456789abcdef0
    # 1-16 subnet IDs
    subnetIds:
      - subnet-0a1b2c3d4e5f60718
      - subnet-0f1e2d3c4b5a69788
```

### Logs

The `provider.logs` settings configure function logging and the access and execution logs of the service's APIs:

```yml
provider:
  logs:
    # Lambda logging settings of every function; each key a function's logs sets overrides the same key here. Optional
    lambda:
      # 'Text' (default) or 'JSON'
      logFormat: JSON
      # trace, debug, info, warn, error or fatal, any case; functions apply it only with logFormat JSON, web apps always
      applicationLogLevel: error
      # debug, info or warn, any case; functions apply it only with logFormat JSON, web apps always
      systemLogLevel: info
      # OR a log group every function writes to; the Framework then creates no function log groups. Not with logGroupClass
      # logGroup: /aws/lambda/global-log-group
      # 'standard' (default) or 'infrequent_access', any case. infrequent_access adds a log group
      # /aws/lambda/<function name>-ia that the function writes to; the standard log group is kept for existing logs
      logGroupClass: infrequent_access

    # HTTP API access logs: true for the default format, or an object with format (default: off)
    # Only for an HTTP API the service creates (not with provider.httpApi.id)
    httpApi:
      format: '{ "requestId":"$context.requestId", "ip": "$context.identity.sourceIp", "requestTime":"$context.requestTime", "httpMethod":"$context.httpMethod","routeKey":"$context.routeKey", "status":"$context.status","protocol":"$context.protocol", "responseLength":"$context.responseLength" }'

    # REST API logs: true for the defaults, or an object (default: off)
    # Only for a REST API the service creates (not with provider.apiGateway.restApiId)
    restApi:
      # Access logging (default: true)
      accessLogging: true
      # Access log format. Optional
      format: 'requestId: $context.requestId'
      # Execution logging (default: true)
      executionLogging: true
      # Execution log level: INFO (default) or ERROR
      level: INFO
      # Log full requests and responses in execution logs (default: true)
      fullExecutionData: true
      # IAM role API Gateway writes CloudWatch Logs with (default: a role the Framework creates)
      # Set on the account when REST access logging or WebSocket logs are first deployed; a later change to role isn't applied
      role: arn:aws:iam::123456789012:role/api-gateway-logs
      # The account's API Gateway CloudWatch Logs role is managed outside the Framework (default: false)
      roleManagedExternally: false

    # WebSocket API logs: true for the defaults, or an object (default: off)
    websocket:
      # Access logging (default: true)
      accessLogging: true
      # Access log format. Optional
      format: 'requestId: $context.requestId'
      # Execution logging (default: true)
      executionLogging: true
      # Execution log level: INFO (default) or ERROR
      level: INFO
      # Log full requests and responses in execution logs (default: true)
      fullExecutionData: true

    # Log groups for the Framework's custom resource functions (default: true)
    frameworkLambda: false
```

### S3 buckets

The `provider.s3` settings configure the buckets that [S3 events](../events/s3.md) create, by the name the events use in `bucket`:

```yml
provider:
  s3:
    # Key: the bucket value of the s3 events this configures
    bucketOne:
      # Bucket name (default: the key)
      name: my-custom-bucket-name
      # Other keys: the AWS::S3::Bucket properties in camelCase, such as versioningConfiguration,
      # lifecycleConfiguration, corsConfiguration, bucketEncryption, publicAccessBlockConfiguration, tags
      versioningConfiguration:
        Status: Enabled
```

The `AWS::S3::Bucket` properties are listed in the [CloudFormation reference for AWS::S3::Bucket](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-s3-bucket.html).

### Capacity Providers

The `provider.capacityProviders` settings define the Lambda capacity providers that functions with a `capacityProvider` run on. See [Managed Instances](./managed-instances.md):

```yml
provider:
  capacityProviders:
    # Capacity provider name, referenced from functions.<name>.capacityProvider
    myCapacityProvider:
      # Scaling settings. Optional
      scaling:
        maxVCpuCount: 16 # Maximum vCPUs, 12-15000 (AWS default: 400)
        mode: manual # 'auto' or 'manual'; 'manual' requires policies
        # 1-10 target tracking policies
        policies:
          - predefinedMetricType: LambdaCapacityProviderAverageCPUUtilization
            targetValue: 70 # 0-100
      # Instance types and architecture. Optional
      instanceRequirements:
        allowedInstanceTypes:
          - c7g.large
        # OR excludedInstanceTypes (not both)
        # excludedInstanceTypes:
        #   - c7g.xlarge
        architectures:
          - arm64 # one value; defaults to provider.architecture when instance types are set
      # Operator role Lambda uses to manage the instances (default: a role the Framework creates)
      permissions:
        operatorRole: arn:aws:iam::123456789012:role/MyOperatorRole
      # KMS key ARN that encrypts the capacity provider's data. Optional
      kmsKeyArn: arn:aws:kms:us-east-1:123456789012:key/1234abcd-12ab-34cd-56ef-1234567890ab
      # VPC of the instances; required here or on provider.vpc, which applies when this is omitted
      vpc:
        securityGroupIds:
          - sg-12345678
        subnetIds:
          - subnet-12345678
```

## Package

The `package` settings control how `serverless package` and `serverless deploy` [package the service's code into zip files](./packaging.md); a function's own `package` settings refine them:

```yml
# serverless.yml

package:
  # Glob patterns of files to include, or to exclude with a leading '!', applied in order. Optional
  patterns:
    - src/**
    - handler.js
    - '!.git/**'
    - '!.travis.yml'
  # Package each function as its own zip (default: false)
  individually: true
  # A prebuilt zip to deploy instead of packaging. Optional
  artifact: path/to/my-artifact.zip
  # Leave npm devDependencies out of the package (default: true)
  excludeDevDependencies: false
  # Directory "serverless package" writes the package to; when set, "serverless deploy" deploys that
  # package without packaging again, like the --package option. Optional: without it, the package
  # goes to .serverless and deploy packages first
  path: build/package
```

## AWS Lambda Functions

The `functions` block defines the service's Lambda functions, keyed by name (letters, digits, - and _). Function settings override the `provider` defaults. See [Functions](./functions.md):

```yml
# serverless.yml

functions:
  hello:
    # Required unless image is set: <file>.<exported function>, relative to the service directory
    handler: users.create
    # OR a container image (not with handler): the URI of an image in ECR,
    # or the name of an image defined in provider.ecr.images
    # image: baseimage
    # OR the object form, to override the image's settings
    # image:
    #   name: baseimage # or uri: <ECR image URI>
    #   command:
    #     - handler.hello
    #   entryPoint:
    #     - /lambda-entrypoint.sh
    #   workingDirectory: /var/task
    # Lambda runtime (default: provider.runtime, otherwise nodejs20.x)
    runtime: nodejs24.x
    # Runtime updates: 'auto' or 'onFunctionUpdate', or the object form; 'manual' needs the object form with arn
    runtimeManagement:
      mode: manual
      # Runtime version ARN; required with mode manual
      arn: arn:aws:lambda:us-east-1::runtime:0b8e1c5a2d7f4e3b9a6c8d0e1f2a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c
    # Memory in MB (default: provider.memorySize, otherwise 1024, or 2048 with capacityProvider)
    memorySize: 512
    # Timeout in seconds, 1-1800 (default: provider.timeout, otherwise 6)
    timeout: 10
    # Lambda Managed Instances: run on a capacity provider. Requires memorySize of 2048 or more. Optional
    # capacityProvider:
    #   name: myCapacityProvider # a key of provider.capacityProviders, or an ARN or CloudFormation reference
    #   maxConcurrency: 100 # requests per execution environment, 1-1600 (default: Lambda's per-vCPU default: Node.js 64, Python 16, Java and .NET 32)
    #   memoryPerVCpu: 4 # GiB per vCPU: 2, 4 or 8 (default: Lambda's default)
    #   scaling:
    #     min: 1 # execution environments, 0-15000, not above max (AWS default: 3); 0 requires max 0
    #     max: 10 # execution environments, 0-15000 (AWS default: no limit)
    # Environment variables, merged over provider.environment. Optional
    environment:
      APP_ENV_VARIABLE: FOOBAR
    # Ephemeral storage (/tmp) in MB, 512-10240 (default: 512)
    ephemeralStorageSize: 512
    # Deployed function name (default: <service>-<stage>-<function key>)
    name: ${sls:stage}-lambdaName
    # Function description. Optional
    description: My function
    # 'x86_64' or 'arm64' (default: provider.architecture, otherwise x86_64)
    architecture: x86_64
    # Durable Functions execution settings. Optional
    durableConfig:
      executionTimeout: 3600 # Required. Seconds, 1-31622400 (366 days)
      retentionPeriodInDays: 14 # Days to keep execution history, 1-90 (default: 14)
    # Concurrent executions reserved for this function, 0 or more. Optional
    reservedConcurrency: 5
    # Provisioned concurrency: a number of executions, or this object. Optional
    provisionedConcurrency:
      alias: active # Alias that carries it (default: provisioned)
      executions: 3 # Required in the object form
    # An existing IAM role for this function instead of the service role.
    # Not with iam.role.statements or iam.role.managedPolicies
    # role: arn:aws:iam::123456789012:role/role
    # OR a role of this function's own, created by the Framework when statements or managedPolicies are set, or in
    # perFunction mode. Not created when provider.iam.role is an existing role
    iam:
      inheritStatements: true # Add provider.iam.role.statements to this role (default: false, true in perFunction mode)
      role:
        statements: # Policy statements of this function's role
          - Effect: Allow
            Action:
              - dynamodb:GetItem
            Resource: arn:aws:dynamodb:${aws:region}:${aws:accountId}:table/Users
        # Managed policy ARNs attached to the role. Optional
        # provider.iam.role.managedPolicies are attached too in perFunction mode only
        managedPolicies:
          - arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess
        permissionsBoundary: arn:aws:iam::123456789012:policy/boundary # Optional
        path: /team/app/ # IAM path of the role. Optional
        # Role name, up to 64 characters (default: <service>-<stage>-<function>-<region>-lambdaRole, without
        # -lambdaRole when longer than 64 characters). Required when provider.iam.role.name is set
        name: ${sls:stage}-helloRole
        tags: # Merged over provider.iam.role.tags. Optional
          key: value
    # SNS topic ARN for failed asynchronous invocations (dead-letter queue); also Ref, Fn::GetAtt, Fn::ImportValue,
    # Fn::Join, Fn::Sub, Fn::Base64 or Fn::ToJsonString. For an SQS queue, use destinations.onFailure
    onError: arn:aws:sns:us-east-1:123456789012:sns-topic
    # KMS key ARN that encrypts this function's environment variables (default: provider.kmsKeyArn)
    kmsKeyArn: arn:aws:kms:us-east-1:123456789012:key/1234abcd-12ab-34cd-56ef-1234567890ab
    # Lambda SnapStart for Java 11+, Python 3.12+ and .NET 8+ (default: false); publishes a version and a "snapstart"
    # alias that event sources invoke. Not with provisionedConcurrency or ephemeralStorageSize above 512
    # snapStart: true
    # Recursive invocation loops between supported AWS services: 'allow' or 'terminate' (AWS default), any case
    recursiveLoop: allow
    # Create no CloudWatch log group for this function, and leave a role the Framework creates without
    # permission to write to it (default: false)
    disableLogs: false
    # Days to keep this function's logs (default: provider.logRetentionInDays, otherwise never expire);
    # not applied with logs.logGroup or disableLogs, when the Framework creates no log group
    logRetentionInDays: 14
    # Lambda logging settings; each key set here overrides the same key of provider.logs.lambda, the others come from it. Optional
    logs:
      # 'Text' (default) or 'JSON'
      logFormat: JSON
      # trace, debug, info, warn, error or fatal; applied only with logFormat JSON
      applicationLogLevel: ERROR
      # debug, info or warn; applied only with logFormat JSON
      systemLogLevel: INFO
      # OR the log group this function writes to; the Framework then creates no log group for it. Not with logGroupClass
      # logGroup: /aws/lambda/global-log-group
      # 'standard' or 'infrequent_access', any case (default: provider.logs.lambda.logGroupClass, otherwise standard)
      logGroupClass: infrequent_access
    # Tenant isolation: mode per_tenant, any case. Optional
    tenancy:
      mode: per_tenant
    # Tags of this function, merged over provider.tags. Optional
    tags:
      foo: bar
    # VPC of this function, overriding provider.vpc; both keys required. '~' turns off provider.vpc for this function
    vpc:
      securityGroupIds:
        - sg-0123456789abcdef0
      subnetIds:
        - subnet-0a1b2c3d4e5f60718
        - subnet-0f1e2d3c4b5a69788
    # Function URL: true for a public URL without CORS, or this object. Optional
    url:
      # Only value: aws_iam, which requires SigV4-signed requests (default: public)
      authorizer: 'aws_iam'
      # CORS: true for the defaults, or these settings. Optional
      cors:
        allowedOrigins:
          - '*'
        allowedHeaders:
          - Authorization
        allowedMethods:
          - GET
        allowCredentials: true
        exposedResponseHeaders:
          - SomeHeader
        maxAge: 3600
      # BUFFERED (default) or RESPONSE_STREAM (response streaming)
      invokeMode: RESPONSE_STREAM
    # Packaging settings of this function. Optional
    package:
      # Patterns applied after the service-level package.patterns
      patterns:
        - src/**
        - handler.js
        - '!.git/**'
        - '!.travis.yml'
      # A prebuilt zip for this function, used in place of packaged code. Without individually: true here or under package,
      # deploy also checks for the service zip (package.artifact, or the one built for other functions) and stops if it is missing
      artifact: path/to/my-artifact.zip
      # Package this function as its own zip (default: false)
      individually: true
    # Lambda layer ARNs or references; replace provider.layers, up to 5. Optional
    layers:
      - arn:aws:lambda:us-east-1:123456789012:layer:LayerName:1
    # X-Ray tracing: 'Active' or 'PassThrough' (default: provider.tracing.lambda)
    tracing: Active
    # Publish a version on each deployment (default: provider.versionFunctions); durableConfig requires versioning
    versionFunction: true
    # Name of a CloudFormation condition that decides whether the function deploys. Optional
    condition: SomeCondition
    # CloudFormation DependsOn of the function. Optional
    dependsOn:
      - MyThing
      - MyOtherThing
    # Destinations of asynchronous invocations. Optional
    destinations:
      # Name of a function in this service, or the ARN of a function, SQS queue, SNS topic or EventBridge bus
      onSuccess: processResult
      # Same forms as onSuccess
      # onFailure: arn:aws:sqs:us-east-1:123456789012:failed-invocations
      # OR the object form, required for CloudFormation references; type: function, sns, sqs or eventBus
      onFailure:
        type: sns
        arn:
          Ref: SomeTopicName
    # File system to mount (Amazon EFS or Amazon S3 Files). Optional
    fileSystemConfig:
      # Required. Access point ARN, or a CloudFormation reference
      arn: arn:aws:elasticfilesystem:us-east-1:123456789012:access-point/fsap-0123456789abcdef0
      # Required. Mount path: /mnt/<name>
      localMountPath: /mnt/example
      # efs or s3files (default: detected from arn); required for an S3 Files CloudFormation reference
      # type: efs
    # Retries of failed asynchronous invocations, 0-2 (AWS default: 2)
    maximumRetryAttempts: 1
    # Maximum age in seconds of an asynchronous event, 60-21600 (AWS default: 21600)
    maximumEventAge: 7200
    # logDataProtectionPolicy: data protection policy of this function's log group, overriding
    # provider.logDataProtectionPolicy; same shape (Name, Version and Statement are required)
    # Payload format version of this function's httpApi events: '1.0' or '2.0' (default: provider.httpApi.payload, otherwise '2.0')
    httpApi:
      payload: '2.0'
    # 'esbuild' builds this function with esbuild; false skips it (default: the service-level build settings)
    build: esbuild
    # CloudWatch alarms of this function: alarm definition names or alarm objects (see custom.alerts). Optional
    alarms:
      - functionErrors
    # Python functions: directory with the function's code and requirements file. Optional
    # module: functions/hello
```

## AWS Lambda Events

Events trigger a function; each function lists them under `functions.<name>.events`. See [Events](./events.md) for how events work and the event pages for each source.

### API Gateway v2 HTTP API

The `httpApi` event adds a route to the service's HTTP API (API Gateway v2). See [HTTP API events](../events/http-api.md):

```yaml
functions:
  hello:
    # ...
    events:
      # HTTP API endpoint (API Gateway v2)
      - httpApi:
          # HTTP method, or '*' for any method
          method: GET
          # Path; path parameters as {param}, greedy as {param+}. '*' (the default route) only with method '*' or no method
          path: /some-get-path/{param}
          authorizer: # Optional
            # Name of an authorizer defined in 'provider.httpApi.authorizers'
            name: someJwtAuthorizer
            # OR the ID of an authorizer of an external API (provider.httpApi.id)
            # id: abc123
            # OR type: aws_iam for IAM authorization; jwt and request are the other types
            # type: aws_iam
            scopes: # Optional, JWT authorizers only
              - user.id
              - user.email
      # Shorthand: 'METHOD path'
      - httpApi: 'POST /users'
      # Default route: requests that match no other route
      - httpApi: '*'
```

### API Gateway v1 REST API

The `http` event adds a method to the service's REST API (API Gateway v1). See [REST API events](../events/apigateway.md):

```yaml
functions:
  hello:
    # ...
    events:
      # REST API endpoint (API Gateway v1)
      - http:
          # Path for this endpoint
          path: users/create
          # HTTP method for this endpoint: get, post, put, patch, options, head, delete or any
          method: get
          # Integration type: lambda-proxy (default), lambda, http, http-proxy or mock
          integration: lambda-proxy
          # Invoke the function asynchronously and return 200 at once (default: false; integration becomes 'aws')
          async: false
          # Integration timeout in milliseconds, at least 50 (default: provider.apiGateway.timeoutInMillis, otherwise 29000)
          timeoutInMillis: 29000
          # Operation name of the method, shown in exported API definitions. Optional.
          operationId: createUser
          # Enable CORS. Don't forget to return the right header in your response
          cors: true
          # OR configure CORS
          # cors:
          #   origin: 'https://example.com'
          #   headers:
          #     - Content-Type
          #     - Authorization
          #   allowCredentials: false
          #   maxAge: 86400
          # Requires clients to add API keys values in the `x-api-key` header of their request
          private: true
          # An AWS API Gateway custom authorizer function
          authorizer:
            # Name of the authorizer function (must be in this service)
            name: authorizerFunc
            # OR the ARN of a function outside the service, or of a Cognito user pool
            # arn: arn:aws:lambda:us-east-1:123456789012:function:Lambda-Name
            # OR the ID of an existing authorizer (with type)
            # authorizerId: !Ref ApiGatewayAuthorizer
            resultTtlInSeconds: 0
            identitySource: method.request.header.Authorization
            identityValidationExpression: someRegex
            # token (default), request, cognito_user_pools, aws_iam or custom; case-insensitive
            type: token
            # OAuth scopes for Cognito user pool authorizers. Optional.
            # scopes:
            #   - my-app/read
            # Cognito claims to expose with the lambda integration. Optional.
            # claims:
            #   - email
            # Skip creating the invoke permission for an authorizer function managed outside the service (default: false)
            # managedExternally: true
          # Private integration through a VPC link (http or http-proxy integrations). Optional.
          # connectionType: vpc-link
          # connectionId: a1b2c3
          # Configure method request and integration request settings
          request:
            # HTTP endpoint URL and map path parameters, for http and http-proxy integrations
            # uri: http://url/{paramName}
            # HTTP method of the integration request for http and http-proxy integrations. Optional.
            # method: get
            # Optional request parameter configuration
            parameters:
              paths:
                paramName: true # mark path parameter as required
              headers:
                headerName: true # mark header as required
                custom-header:
                  required: true
                  # Map the header to a static value or integration request variable
                  mappedValue: context.requestId
              querystrings:
                paramName: true # mark query string
            # Request schema validation mapped by content type
            schemas:
              # Define the valid JSON Schema for this content-type
              application/json: ${file(create_request.json)}
              application/json+abc:
                # Name of the API Gateway model
                name: ModelName
                description: 'Some description'
                schema: ${file(model_schema.json)}
            # With lambda-proxy, only parameters and schemas apply; the following keys are for other integrations
            # Custom request mapping templates that overwrite default templates
            # template:
            #   application/json: '{ "httpMethod" : "$context.httpMethod" }'
            # Pass-through behavior for unmapped content types: NEVER, WHEN_NO_MATCH or WHEN_NO_TEMPLATES
            # passThrough: NEVER
            # CONVERT_TO_BINARY or CONVERT_TO_TEXT. Optional.
            # contentHandling: CONVERT_TO_TEXT
          response:
            # Response transfer mode (proxy integrations only): BUFFERED (default) or STREAM
            # Use STREAM to enable Lambda InvokeWithResponseStreaming or HTTP proxy streaming responses
            transferMode: STREAM
            # Response headers, templates and status codes apply to the lambda integration:
            # headers:
            #   Content-Type: "'text/html'"
            # template: $input.path('$')
            # statusCodes:
            #   201:
            #     pattern: '' # the default response
            #   409:
            #     pattern: '.*"statusCode":409,.*'
      # Shorthand: 'METHOD /path'
      - http: GET /users/list
```

### Websocket API

The `websocket` event connects a route of the service's WebSocket API to the function. See [WebSocket events](../events/websocket.md):

```yaml
functions:
  hello:
    # ...
    events:
      - websocket:
          # Route key: $connect, $disconnect, $default or a custom route
          route: $connect
          # Optional, setting this enables callbacks on websocket requests for two-way communication. Only $default
          routeResponseSelectionExpression: $default
          # Authorizer for the $connect route: a function name or ARN, or an object
          authorizer:
            # Name of the authorizer function in this service
            name: auth
            # OR the ARN of an authorizer function outside the service
            # arn: arn:aws:lambda:us-east-1:123456789012:function:auth
            identitySource:
              - 'route.request.header.Auth'
              - 'route.request.querystring.Auth'
      # Shorthand: the route key
      - websocket: $disconnect
```

### S3

The `s3` event triggers the function from bucket notifications; for a bucket name, the Framework creates the bucket unless `existing: true` is set. See [S3 events](../events/s3.md):

```yaml
functions:
  hello:
    # ...
    events:
      - s3:
          # Required. Bucket name, or a key of provider.s3
          bucket: photos
          # S3 event type (default: s3:ObjectCreated:*)
          event: s3:ObjectCreated:*
          # Object key filters: prefix and suffix rules. Optional
          rules:
            - prefix: uploads/
            - suffix: .jpg
          # The bucket exists already; the Framework adds the notification without creating it (default: false)
          existing: true
          # Update the notification configuration of an existing bucket on every deploy (default: false)
          forceDeploy: true
```

### Schedule

The `schedule` event invokes the function on a rate or cron schedule. See [Schedule events](../events/schedule.md):

```yaml
functions:
  hello:
    # ...
    events:
      - schedule:
          # 1-64 characters: letters, digits, '.', '-' and '_'. Not allowed with more than one rate
          name: my-scheduled-event
          description: a description of my scheduled event's purpose
          # rate() or cron() expression; can also be an array of expressions. cron() runs in UTC unless timezone is set
          rate: rate(10 minutes)
          # (default: true)
          enabled: false
          # Constant JSON input for the function; use only one of input, inputPath or inputTransformer
          input:
            key1: value1
            key2: value2
            stageParams:
              stage: dev
          # OR the part of the event to pass, as a JSON path
          # inputPath: '$.detail'
          # OR a template filled from the event
          # inputTransformer:
          #   inputPathsMap:
          #     eventTime: '$.time'
          #   inputTemplate: '{"time": <eventTime>, "key1": "value1"}'
      # EventBridge Scheduler (AWS::Scheduler::Schedule) instead of an EventBridge rule
      - schedule:
          rate: cron(0 9 * * ? *)
          # 'eventBus' (default, EventBridge rule) or 'scheduler' (EventBridge Scheduler)
          # 'scheduler' supports only 'input' (not inputPath or inputTransformer)
          method: scheduler
          # IANA timezone for cron expressions. Supported only when method is 'scheduler'
          timezone: America/New_York
          input:
            key1: value1
      # Shorthand: the expression
      - schedule: rate(1 hour)
```

### SNS

The `sns` event subscribes the function to an SNS topic. See [SNS events](../events/sns.md):

```yaml
functions:
  hello:
    # ...
    events:
      - sns:
          # Name of the topic the Framework creates; sns events with the same topicName share one topic
          topicName: aggregate
          # OR the ARN of an existing topic; with a CloudFormation reference as arn, also set topicName
          # arn: arn:aws:sns:us-east-1:123456789012:aggregate
          # Display name of the created topic. Optional.
          displayName: Data aggregation pipeline
          # KMS key ID, alias or ARN that encrypts the created topic. Optional.
          kmsMasterKeyId: alias/aws/sns
          filterPolicy:
            pet:
              - dog
              - cat
          # MessageAttributes (AWS default) or MessageBody
          filterPolicyScope: MessageAttributes
          # Dead-letter queue for messages SNS can't deliver: one of the three forms
          redrivePolicy:
            # (1) ARN
            deadLetterTargetArn: arn:aws:sqs:us-east-1:123456789012:myDLQ
            # (2) OR Ref (resource defined in same CF stack)
            # deadLetterTargetRef: myDLQ
            # (3) OR Import (export names of a queue defined in another CF stack)
            # deadLetterTargetImport:
            #   arn: MyShared-DLQArn
            #   url: MyShared-DLQUrl
      # Shorthand: a topic name or ARN
      - sns: dispatch
```

### SQS

The `sqs` event polls an existing SQS queue. See [SQS events](../events/sqs.md):

```yaml
functions:
  hello:
    # ...
    events:
      - sqs:
          # ARN or CloudFormation reference of an existing queue; the Framework doesn't create it
          arn: arn:aws:sqs:us-east-1:123456789012:myQueue
          # Optional (default: 10). 1-10000 for a standard queue, 1-10 for a FIFO queue
          # Above 10 requires maximumBatchingWindow of at least 1
          batchSize: 10
          # Optional, standard queues only, minimum is 0 and the maximum is 300 (seconds)
          maximumBatchingWindow: 10
          # (default: true)
          enabled: false
          # Optional, the only value is ReportBatchItemFailures
          functionResponseType: ReportBatchItemFailures
          # Optional, 1-10 patterns; SQS filters on the message body
          filterPatterns:
            - body:
                a: [1, 2]
          # Optional, must be in 2-1000 range. Mutually exclusive with provisionedPollers
          maximumConcurrency: 250
          # OR provisioned mode: dedicated event pollers (additional cost). Set to false to disable on an existing mapping
          # provisionedPollers:
          #   # Optional, must be in 2-200 range
          #   min: 2
          #   # Optional, must be in 2-10000 range
          #   max: 500
      # Shorthand: the queue ARN
      - sqs: arn:aws:sqs:us-east-1:123456789012:otherQueue
```

### Streams

The `stream` event reads an existing Kinesis data stream or DynamoDB stream. See [Stream events](../events/streams.md):

```yaml
functions:
  hello:
    # ...
    events:
      - stream:
          # ARN of a Kinesis data stream or DynamoDB stream, or a CloudFormation reference (then set type)
          arn: arn:aws:kinesis:us-east-1:123456789012:stream/foo
          # dynamodb or kinesis; required when arn is a CloudFormation reference
          type: kinesis
          # Optional, 1-10000 (default: 10)
          batchSize: 100
          # Optional, seconds to wait to fill a batch, 0-300
          batchWindow: 10
          # Optional, 1-10 concurrent batches per shard
          parallelizationFactor: 2
          # LATEST, TRIM_HORIZON (default) or AT_TIMESTAMP (Kinesis only)
          startingPosition: LATEST
          # Unix time in seconds; required with AT_TIMESTAMP
          # startingPositionTimestamp: 1735689600
          # Optional, -1 (AWS default, no limit) or 60-604800
          maximumRecordAgeInSeconds: 120
          # Optional, -1 (AWS default, retry until expiry) to 10000
          maximumRetryAttempts: 3
          # Optional, split a failed batch in two and retry (default: false)
          bisectBatchOnFunctionError: true
          # Optional, 0-900 seconds
          tumblingWindowInSeconds: 30
          # Kinesis only: read through an enhanced fan-out consumer; true creates one, or the ARN of an existing consumer
          consumer: true
          # Where to send records of failed batches: an SNS topic or SQS queue
          destinations:
            onFailure:
              arn: arn:aws:sqs:us-east-1:123456789012:failed-records
              # sns or sqs; required when arn is a CloudFormation reference
              type: sqs
          # (default: true)
          enabled: false
          # Optional, the only value is ReportBatchItemFailures
          functionResponseType: ReportBatchItemFailures
          # Optional, 1-10 patterns
          filterPatterns:
            - partitionKey: [1]
      # Shorthand: the stream ARN
      - stream: arn:aws:dynamodb:us-east-1:123456789012:table/users/stream/2024-01-01T00:00:00.000
```

### MSK

The `msk` event consumes a topic of an Amazon MSK cluster. See [MSK events](../events/msk.md):

```yaml
functions:
  hello:
    # ...
    events:
      - msk:
          # ARN of MSK Cluster
          arn: arn:aws:kafka:us-east-1:123456789012:cluster/ClusterName/a1b2c3d4-5678-90ab-cdef-11111EXAMPLE-1
          # name of Kafka topic to consume from
          topic: kafkaTopic
          # Optional, must be in 1-10000 range (AWS default: 100)
          batchSize: 100
          # Optional, must be in 0-300 range (seconds) (AWS default: 0.5 seconds)
          maximumBatchingWindow: 30
          # Optional, LATEST, AT_TIMESTAMP or TRIM_HORIZON (default: TRIM_HORIZON)
          startingPosition: LATEST
          # Mandatory when startingPosition is AT_TIMESTAMP, must be in Unix time seconds
          startingPositionTimestamp: 10000123
          # (default: true)
          enabled: false
          # Optional, arn of the secret key for authenticating with the brokers in your MSK cluster.
          saslScram512: arn:aws:secretsmanager:us-east-1:123456789012:secret:AmazonMSK_my-secret
          # Optional, the consumer group ID, up to 200 characters. It can't be changed after the mapping is created
          consumerGroupId: MyConsumerGroupId
          # Optional, 1-10 patterns; Kafka filters on the record value
          filterPatterns:
            - value:
                a: [1, 2]
          # Optional, provisioned mode: dedicated event pollers (additional cost). Set to false to disable on an existing mapping
          provisionedPollers:
            # Optional, must be in 1-200 range
            min: 1
            # Optional, must be in 1-2000 range
            max: 100
            # Optional, poller group name (letters, digits, hyphens, underscores) shared by up to 100 mappings in the same VPC
            group: shared-capacity
```

### ActiveMQ

The `activemq` event consumes a queue of an Amazon MQ for ActiveMQ broker. See [ActiveMQ events](../events/activemq.md):

```yaml
functions:
  hello:
    # ...
    events:
      - activemq:
          # ARN of ActiveMQ Broker
          arn: arn:aws:mq:us-east-1:123456789012:broker:ExampleMQBroker:b-a1b2c3d4-5678-90ab-cdef-example
          # Name of ActiveMQ queue consume from
          queue: queue-name
          # Secrets Manager ARN for basic auth credentials
          basicAuthArn: arn:aws:secretsmanager:us-east-1:123456789012:secret:MySecret
          # Optional, must be in 1-10000 range (AWS default: 100)
          batchSize: 100
          # Optional, must be in 0-300 range (seconds) (AWS default: 0.5 seconds)
          maximumBatchingWindow: 30
          # (default: true)
          enabled: false
          # Optional, 1-10 patterns; Amazon MQ filters on the message data
          filterPatterns:
            - data:
                a: [1, 2]
```

### Kafka

The `kafka` event consumes a topic of a self-managed Apache Kafka cluster. See [Kafka events](../events/kafka.md):

```yaml
functions:
  hello:
    # ...
    events:
      - kafka:
          # Authentication and network access: at least one method; VPC settings can be combined with the others
          accessConfigurations:
            # Secrets Manager ARNs, one per entry: saslPlainAuth, saslScram256Auth, saslScram512Auth,
            # clientCertificateTlsAuth or serverRootCaCertificate
            saslScram512Auth:
              - arn:aws:secretsmanager:us-east-1:123456789012:secret:MyBrokerSecretName
            # VPC subnets and security groups of a cluster in a VPC
            vpcSubnet:
              - subnet-0011001100
            vpcSecurityGroup:
              - sg-0123456789
          # An array of bootstrap server addresses
          bootstrapServers:
            - abc3.xyz.com:9092
            - abc2.xyz.com:9092
          # name of Kafka topic to consume from
          topic: MySelfManagedKafkaTopic
          # Optional, must be in 1-10000 range (AWS default: 100)
          batchSize: 100
          # Optional, must be in 0-300 range (seconds) (AWS default: 0.5 seconds)
          maximumBatchingWindow: 30
          # Optional, LATEST, AT_TIMESTAMP or TRIM_HORIZON (default: TRIM_HORIZON)
          startingPosition: LATEST
          # Mandatory when startingPosition is AT_TIMESTAMP
          startingPositionTimestamp: 10000123
          # (default: true)
          enabled: false
          # Optional, the consumer group ID, up to 200 characters. It can't be changed after the mapping is created
          consumerGroupId: MyConsumerGroupId
          # Optional, 1-10 patterns; Kafka filters on the record value
          filterPatterns:
            - value:
                eventName: [INSERT]
          # Optional, provisioned mode: dedicated event pollers (additional cost). Set to false to disable on an existing mapping
          provisionedPollers:
            # Optional, must be in 1-200 range
            min: 1
            # Optional, must be in 1-2000 range
            max: 100
            # Optional, poller group name (letters, digits, hyphens, underscores) shared by up to 100 mappings in the same VPC
            group: shared-capacity
```

### RabbitMQ

The `rabbitmq` event consumes a queue of an Amazon MQ for RabbitMQ broker. See [RabbitMQ events](../events/rabbitmq.md):

```yaml
functions:
  hello:
    # ...
    events:
      - rabbitmq:
          # ARN of RabbitMQ Broker
          arn: arn:aws:mq:us-east-1:123456789012:broker:ExampleMQBroker:b-a1b2c3d4-5678-90ab-cdef-example
          # Name of RabbitMQ queue consume from
          queue: queue-name
          # Name of RabbitMQ virtual host to consume from
          virtualHost: virtual-host
          # Secrets Manager ARN for basic auth credentials
          basicAuthArn: arn:aws:secretsmanager:us-east-1:123456789012:secret:MySecret
          # Optional, must be in 1-10000 range (AWS default: 100)
          batchSize: 100
          # Optional, must be in 0-300 range (seconds) (AWS default: 0.5 seconds)
          maximumBatchingWindow: 30
          # (default: true)
          enabled: false
          # Optional, 1-10 patterns; Amazon MQ filters on the message data
          filterPatterns:
            - data:
                a: [1, 2]
```

### Alexa

The `alexaSkill` and `alexaSmartHome` events let an Alexa skill invoke the function. See [Alexa Skill events](../events/alexa-skill.md) and [Alexa Smart Home events](../events/alexa-smart-home.md):

```yaml
functions:
  hello:
    # ...
    events:
      - alexaSkill:
          # Required: the skill ID
          appId: amzn1.ask.skill.xx-xx-xx-xx
          # (default: true)
          enabled: false
      - alexaSmartHome:
          # Required: the skill ID
          appId: amzn1.ask.skill.xx-xx-xx-xx
          # (default: true)
          enabled: false
      # Shorthand: the skill ID
      - alexaSkill: amzn1.ask.skill.yy-yy-yy-yy
```

### IOT

The `iot` event creates an AWS IoT topic rule that invokes the function; `iotFleetProvisioning` uses it as a fleet provisioning pre-provisioning hook. See [IoT events](../events/iot.md):

```yaml
functions:
  hello:
    # ...
    events:
      - iot:
          # Topic rule name: letters, digits and _ only
          name: myIoTEvent
          description: An IoT event
          # Required
          sql: "SELECT * FROM 'some_topic'"
          # Optional: 2015-10-08 (AWS default), 2016-03-23 or beta
          sqlVersion: '2016-03-23'
          # (default: true)
          enabled: false
      - iotFleetProvisioning:
          # Required: provisioning template document (object)
          templateBody: ${file(template.json)}
          # Required: ARN or CloudFormation intrinsic of the IAM provisioning role
          provisioningRoleArn: arn:aws:iam::123456789012:role/iot-provisioning-role
          # Optional: 1-36 characters, letters, digits, _ and -
          templateName: sensor-fleet
          # (default: true)
          enabled: false
```

### CloudWatch

The `cloudwatchEvent` event invokes the function for matching events on the default event bus; `cloudwatchLog` subscribes it to a log group. See [CloudWatch events](../events/cloudwatch-event.md) and [CloudWatch Logs events](../events/cloudwatch-log.md):

```yaml
functions:
  hello:
    # ...
    events:
      - cloudwatchEvent:
          # Rule name, 1-64 characters: letters, digits, '.', '-' and '_'. Optional
          name: ec2-state-changes
          description: EC2 instance state changes
          # (default: true)
          enabled: false
          event:
            source:
              - 'aws.ec2'
            detail-type:
              - 'EC2 Instance State-change Notification'
            detail:
              state:
                - pending
          # Constant JSON input for the function; use only one of input, inputPath or inputTransformer
          input:
            key1: value1
            key2: value2
            stageParams:
              stage: dev
          # OR the part of the event to pass, as a JSON path
          # inputPath: '$.detail'
          # OR a template filled from the event
          # inputTransformer:
          #   inputPathsMap:
          #     eventTime: '$.time'
          #   inputTemplate: '{"time": <eventTime>, "key1": "value1"}'
      - cloudwatchLog:
          logGroup: '/aws/lambda/hello'
          # Subscription filter pattern. Optional (default: all events)
          filter: '{$.userIdentity.type = Root}'
      # Shorthand: the log group name
      - cloudwatchLog: '/aws/lambda/other'
```

### Cognito

The `cognitoUserPool` event attaches the function to a Cognito user pool trigger. See [Cognito user pool events](../events/cognito-user-pool.md):

```yaml
functions:
  hello:
    # ...
    events:
      - cognitoUserPool:
          pool: MyUserPool
          # PreSignUp, PostConfirmation, PreAuthentication, PostAuthentication, PreTokenGeneration, CustomMessage,
          # DefineAuthChallenge, CreateAuthChallenge, VerifyAuthChallengeResponse, UserMigration, CustomSMSSender or CustomEmailSender
          trigger: PreTokenGeneration
          # Trigger event version: V1_0, V2_0 or V3_0 for PreTokenGeneration; V1_0 for the custom sender triggers. Optional
          lambdaVersion: V2_0
          # The user pool exists already; the Framework adds the trigger without creating it (default: false)
          existing: true
          # Update the triggers of an existing user pool on every deploy (default: false)
          forceDeploy: true
      - cognitoUserPool:
          pool: MyUserPool
          trigger: CustomEmailSender
          # KMS key ARN or reference; required for the CustomSMSSender and CustomEmailSender triggers
          kmsKeyId: 'arn:aws:kms:us-east-1:123456789012:key/12345678-9abc-def0-1234-56789abcdef1'
          existing: true
          forceDeploy: true
```

### ALB

The `alb` event adds a listener rule that routes matching requests of an existing Application Load Balancer to the function. See [ALB events](../events/alb.md):

```yaml
functions:
  hello:
    # ...
    events:
      - alb:
          # Required. Listener ARN, or a Ref to a listener defined under resources
          listenerArn: arn:aws:elasticloadbalancing:us-east-1:123456789012:listener/app/my-load-balancer/50dc6c495c0c9188/f2f7dc8efc522ab2
          # Rule priority, 1-50000, unique per listener
          priority: 1
          targetGroupName: helloTargetGroup # optional, up to 32 characters
          # At least one condition
          conditions:
            host:
              - example.com
            path:
              - /hello
            # Optional: method, header ({ name, values }), query (name: value) and ip (CIDR ranges)
            method:
              - GET
          # Names of authorizers defined in provider.alb.authorizers. Optional
          authorizer:
            - myFirstAuth
          # Pass multi-value headers and query strings to the function (default: false)
          multiValueHeaders: true
          # Optional, can also be set using a boolean value
          healthCheck:
            path: / # optional
            intervalSeconds: 35 # optional, 5-300
            timeoutSeconds: 30 # optional, 2-120
            healthyThresholdCount: 5 # optional, 2-10
            unhealthyThresholdCount: 5 # optional, 2-10
            matcher: # optional
              httpCode: '200'
```

### EventBridge

The `eventBridge` event invokes the function for matching events or on a schedule, on the default bus, a bus the Framework creates or an existing bus. See [EventBridge events](../events/event-bridge.md):

```yaml
functions:
  hello:
    # ...
    events:
      # Use the default AWS event bus
      - eventBridge:
          # Rule name: letters, digits, '.', '-' and '_'. Optional
          name: my-scheduled-rule
          description: a description of my eventBridge event's purpose
          schedule: rate(10 minutes)
          # (default: true)
          enabled: false
      # Create a custom event bus
      - eventBridge:
          eventBus: custom-saas-events
          pattern:
            source:
              - saas.external
      # Re-use an existing event bus
      - eventBridge:
          eventBus: arn:aws:events:us-east-1:123456789012:event-bus/custom-private-events
          pattern:
            source:
              - custom.private
          inputTransformer:
            inputPathsMap:
              eventTime: '$.time'
            inputTemplate: '{"time": <eventTime>, "key1": "value1"}'
      # Using 'inputs'
      - eventBridge:
          pattern:
            source:
              - 'aws.ec2'
            detail-type:
              - 'EC2 Instance State-change Notification'
            detail:
              state:
                - pending
          input:
            key1: value1
            key2: value2
            stageParams:
              stage: dev
      # Using 'inputPath'
      - eventBridge:
          pattern:
            source:
              - 'aws.ec2'
            detail-type:
              - 'EC2 Instance State-change Notification'
            detail:
              state:
                - pending
          inputPath: '$.detail'
      # Using 'inputTransformer'
      - eventBridge:
          pattern:
            source:
              - 'aws.ec2'
            detail-type:
              - 'EC2 Instance State-change Notification'
            detail:
              state:
                - pending
          inputTransformer:
            inputPathsMap:
              eventTime: '$.time'
            inputTemplate: '{"time": <eventTime>, "key1": "value1"}'
          retryPolicy:
            maximumEventAge: 3600
            maximumRetryAttempts: 3
          deadLetterQueueArn: !GetAtt QueueName.Arn
      # Subscribe to a Custom Event Bus (an ARN containing ':event-busv2/',
      # a Ref to an AWS::EventsV2::EventBus, or !GetAtt <bus>.EventBusArn)
      - eventBridge:
          eventBus: arn:aws:events:us-east-1:123456789012:event-busv2/orders/a1b2c3d4e5f6g7h8i9j0k1l2m
          pattern:
            detail-type:
              - OrderPlaced
          # Delivery order: 'unordered' (default) or 'fifo'
          ordering: unordered
          # Events per invocation, 1-100 (default: 10, delivered as an array of events)
          batchSize: 1
          # Seconds to wait to fill a batch, 0-300 (default: 0)
          maximumBatchingWindow: 0
          # Invoke asynchronously (default: false, synchronous)
          async: false
          # What re-enabling delivers: 'last_processed' (default, the backlog) or 'latest'
          resumePosition: last_processed
          # IAM role EventBridge assumes to invoke the function (default: the service's generated delivery role)
          role: arn:aws:iam::123456789012:role/orders-delivery
          retryPolicy:
            maximumEventAge: 86400
            maximumRetryAttempts: 185
          deadLetterQueueArn: !GetAtt QueueName.Arn
```

### CloudFront

The `cloudFront` event deploys the function as Lambda@Edge on a CloudFront distribution the Framework creates; deploy to us-east-1. See [CloudFront Lambda@Edge events](../events/cloudfront.md):

```yaml
functions:
  hello:
    # ...
    events:
      - cloudFront:
          # viewer-request, origin-request, origin-response or viewer-response
          eventType: viewer-response
          includeBody: true
          pathPattern: /docs*
          # Use either name or id
          cachePolicy:
            # Refers to a Cache Policy defined in 'provider.cloudFront.cachePolicies'
            name: myCachePolicy1
            # OR any external Cache Policy ID
            # id: 658327ea-f89d-4fab-a63d-7e88639e58f6
          # A URL string, or an origin object with DomainName and CustomOriginConfig or S3OriginConfig
          origin:
            DomainName: serverless.com
            OriginPath: /framework
            CustomOriginConfig:
              OriginProtocolPolicy: match-viewer
          # Use this origin as the distribution's default origin; required when the events use more than one origin
          isDefaultOrigin: true
          # Cache behavior settings for this path pattern. Optional
          behavior:
            ViewerProtocolPolicy: redirect-to-https
            AllowedMethods:
              - GET
              - HEAD
              - OPTIONS
            CachedMethods:
              - GET
              - HEAD
              - OPTIONS
```

## Function layers

The `layers` block defines [Lambda layers](./layers.md) the service publishes, keyed by name. Functions reference a layer of the service with `{ Ref: <Key>LambdaLayer }`, the key with its first letter uppercased (not with `retain: true`); see the layers page for the naming rules:

```yml
# serverless.yml

layers:
  hello:
    # Directory with the layer's contents; required unless package.artifact is set
    path: layer-dir
    # Published layer name (default: the key)
    name: ${sls:stage}-layerName
    # Layer description, up to 256 characters. Optional
    description: Description of what the lambda layer does
    # Packaging patterns of this layer, or a prebuilt zip to publish instead of path. Optional
    package:
      patterns:
        - '!**/*.test.js'
      # artifact: build/layer.zip
    # Compatible runtimes, up to 15. Optional
    compatibleRuntimes:
      - nodejs24.x
    # Compatible architectures: x86_64, arm64 or both. Optional
    compatibleArchitectures:
      - x86_64
      - arm64
    # License information, up to 512 characters. Optional
    licenseInfo: GPLv3
    # AWS account IDs allowed to use the layer, or '*' for every account. Optional
    allowedAccounts:
      - '123456789012'
    # Keep previous layer versions when a new one is published (default: false)
    retain: false
```

## AWS Lambda MicroVMs (Sandboxes)

The `sandboxes` top-level property defines [Sandboxes](./sandboxes.md): container workloads that run as AWS Lambda MicroVMs, each built from a `Dockerfile` or a prebuilt `s3://` zip. `serverless deploy` creates the MicroVM image with its IAM roles, log group, metrics and dashboard, and builds a new image version when the artifact's content or the sandbox's settings, such as `environment`, change; `serverless invoke`, `logs` and `dev` take `--sandbox <name>`. Only `artifact` is required:

```yml
# serverless.yml

sandboxes:
  api: # sandbox name (used in CloudFormation logical IDs)
    artifact: ./app # required: local directory with a Dockerfile, or an s3:// zip
    package:
      patterns: # files of a local artifact, relative to the service directory, after the service-level patterns
        - '!app/tests/**'
    minimumMemory: 2048 # MiB per instance: 512, 1024, 2048 (default), 4096 or 8192
    description: Orders API sandbox # default: <service> <name> sandbox (Serverless Framework)
    environment:
      KEY: value
      TABLE_NAME: !Ref UsersTable # strings or CloudFormation references; provider.environment is inherited
    osCapabilities: # additional OS capabilities; 'all' is the accepted value (default: none)
      - all
    hooks: # lifecycle hooks your server answers on POST /aws/lambda-microvms/runtime/v1/<hook>
      port: 9000 # 1-65535 (default: 9000)
      ready: # true for the AWS default timeout, or { timeout: <seconds> }
        timeout: 120
      run: true
      # validate, resume, suspend and terminate take the same values
    vpc: # optional; routes outbound traffic through your VPC (same value shapes as a function's vpc)
      subnetIds: !Split [',', !ImportValue network-private-subnets] # 1–16 ids, or one expression yielding the list
      securityGroupIds:
        - sg-12345678 # 1–5 ids or references
      protocol: ipv4 # ipv4 (default) or dualstack
    iam: # each role: an ARN or intrinsic of an existing role, or settings that extend the generated role
      executionRole:
        statements:
          - Effect: Allow
            Action: dynamodb:GetItem
            Resource: !GetAtt UsersTable.Arn
        managedPolicies:
          - arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess
        permissionsBoundary: arn:aws:iam::123456789012:policy/boundary
      # buildRole and operatorRole take the same forms
    observability: true # log group + metrics + dashboard (default: true); false keeps only the log group
    # OR configure each part
    # observability:
    #   logs:
    #     enabled: true
    #     retentionDays: 30 # default: 14
    #     logGroup: /aws/lambda-microvms/custom # default: /aws/lambda-microvms/<service>-<name>-<stage>
    #   metrics:
    #     enabled: true
    #     filters: # replaces the default errors filter
    #       errors: '%[Ee][Rr][Rr][Oo][Rr]%'
    #   alarms:
    #     notify: arn:aws:sns:us-east-1:123456789012:my-alerts # required with alarms
    #     thresholds:
    #       errors:
    #         threshold: 10
    #   dashboard:
    #     enabled: true
    tags: # tags for the image, log group, roles, alarms and connector
      team: orders
```

## Web Apps (Lambda Web Functions)

The `webApps` top-level property defines [Web Apps](./web-apps.md): HTTP servers (Express, Fastify, Hono, Next.js) that run as AWS Lambda Web Functions, each listening on `process.env.PORT`. `serverless deploy` packages each one, deploys it with its own HTTPS endpoint and log groups, and prints the URL; `serverless invoke` and `logs` take `--web-app <name>`, and `serverless dev` runs web apps locally. Web apps take these provider settings as defaults: `environment`, `iam`, `vpc`, `tags`, `kmsKeyArn`, `logRetentionInDays`, `logDataProtectionPolicy`, the `logs.lambda` log levels, an explicitly set `timeout`, and `runtime` when it is `nodejs24.x` or newer. Only `entry` is required:

```yml
# serverless.yml

webApps:
  orders: # web app name: letters, digits, - and _, ending in a letter or digit
    # required, the file that starts the HTTP server, inside the service directory (the path inside the zip with package.artifact)
    entry: src/server.ts
    # optional, Node.js 24 or newer as nodejsNN.x (default: provider.runtime when it is nodejs24.x or newer, otherwise nodejs24.x)
    runtime: nodejs24.x
    # optional, deployed name: letters, digits, - and _, up to 64 characters (default: <service>-<stage>-<name>)
    name: ${sls:stage}-orders
    # optional, description to publish to AWS
    description: Orders API
    # optional, request timeout in seconds, 3-900 (default: provider.timeout when set, otherwise 30)
    timeout: 60
    # optional, the most concurrent requests per execution environment, 1-128 (Lambda's default: 64)
    maxConcurrency: 64
    # optional, merged over provider.environment; PORT, HOSTNAME and AWS_LAMBDA_NODEJS_ENTRYPOINT are set by the Framework
    environment:
      TABLE_NAME: !Ref OrdersTable
    # optional, log levels, case-insensitive (default: the provider.logs.lambda levels, otherwise Lambda's default, info)
    logs:
      applicationLogLevel: info # trace, debug, info, warn, error or fatal
      systemLogLevel: info # debug, info or warn
    # optional, retention for both log groups (default: provider.logRetentionInDays)
    logRetentionInDays: 14
    # optional, data protection policy for both log groups (default: provider.logDataProtectionPolicy)
    logDataProtectionPolicy:
      Name: mask-email-addresses
      Version: '2021-06-01'
      Statement:
        - Sid: redact
          DataIdentifier:
            - arn:aws:dataprotection::aws:data-identifier/EmailAddress
          Operation:
            Deidentify:
              MaskConfig: {}
    # optional, execution role ARN, name or CloudFormation reference (default: the service's role)
    role: arn:aws:iam::123456789012:role/orders
    # optional, a role of the web app's own, as for functions. role can't be combined with
    # iam.role.statements or iam.role.managedPolicies; with role set, the other iam settings don't apply
    iam:
      # optional, add provider.iam.role.statements to the role (default: false, true in perFunction mode)
      inheritStatements: true
      role:
        # IAM policy statements for this web app
        statements:
          - Effect: Allow
            Action: dynamodb:GetItem
            Resource: !GetAtt OrdersTable.Arn
        # managed policy ARNs attached to the role
        managedPolicies:
          - arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess
        # optional, role name (default: <service>-<stage>-<name>-<region>-lambdaRole)
        name: ${sls:stage}-orders-role
        # optional, IAM path of the role
        path: /web/
        # optional, permissions boundary of the role
        permissionsBoundary: arn:aws:iam::123456789012:policy/boundary
        # optional, merged over provider.iam.role.tags
        tags:
          team: orders
    # optional, outbound access to a VPC through a network connector (default: provider.vpc)
    vpc:
      # optional, dual-stack (IPv6) outbound traffic through the connector (default: provider.vpc.ipv6AllowedForDualStack, otherwise false)
      ipv6AllowedForDualStack: true
      subnetIds:
        - subnet-0a1b2c3d4e5f60718
        - subnet-0f1e2d3c4b5a69788
      securityGroupIds:
        - sg-0123456789abcdef0
    # optional, KMS key for environment variable encryption (default: provider.kmsKeyArn)
    kmsKeyArn: arn:aws:kms:us-east-1:123456789012:key/1234abcd-12ab-34cd-56ef-1234567890ab
    # optional, merged over provider.tags
    tags:
      team: orders
    # optional, false skips esbuild for this web app; esbuild bundles any entry (default: esbuild for a TypeScript entry)
    build: esbuild
    package:
      # optional, applied after the service-level package.patterns
      patterns:
        - '!tests/**'
      # optional, a prebuilt zip deployed as it is (the server reads AWS_LAMBDA_HTTP_ENDPOINT itself);
      # a local path or an s3://bucket/key URI, downloaded when packaging
      artifact: build/orders.zip
    # optional, how serverless dev runs the web app on your machine (default: entry, run from source)
    dev:
      # required with dev: a command line run in your shell from the service directory, like an npm script;
      # PORT and HOSTNAME are set (next dev takes the host as --hostname). Needed when entry is a build output
      command: next dev --hostname 127.0.0.1
    # optional, the web app's endpoint: true (public, the default) or its settings; false is not accepted
    url:
      # optional, aws_iam requires SigV4-signed requests (default: public)
      authorizer: aws_iam
      # optional, the most execution environments, 2 to 10000
      maxEnvironments: 50
      # optional, requests per second: 0, 100-1000 in steps of 100, or 2000-10000 in steps of 1000
      rateLimit: 2000
```

## MCP Servers

The `mcp` top-level property hosts [MCP Servers](./mcp.md) (Model Context Protocol servers) written with the official MCP TypeScript SDK. Each server becomes a Lambda function served at `/<name>/mcp` on the service's REST API, with response streaming; `authorizer` adds an API Gateway authorizer on the route, `oauthDiscovery` publishes the OAuth protected-resource metadata document, and `state` adds a signing key. `serverless deploy` and `serverless info` print each server's URL.

```yml
# serverless.yml

provider:
  name: aws
  endpointType: REGIONAL # raises the streaming idle bound (~30 s on the EDGE default → ~5 min)

mcp:
  servers:
    crm: # server name — function key and URL path segment
      server: src/server.mjs # module default-exporting the SDK handler
      timeout: 120 # max tool duration in seconds (1–900, default 60)
      memorySize: 1024 # MB, 128–10240 (default: provider.memorySize, otherwise 1024)
      environment:
        ORDERS_TABLE: !Ref OrdersTable
      authorizer: verifyToken # rejects before invoke — string | http-event-style object | aws_iam
      oauthDiscovery: # publishes RFC 9728 discovery metadata (advertisement only)
        # The issuing authorization server: a literal https URL, or a
        # CloudFormation intrinsic when the issuer is created by this stack
        # (e.g. !Sub 'https://cognito-idp.${AWS::Region}.amazonaws.com/${UserPool}')
        issuer: https://example.us.auth0.com
        # The public https:// URL in front of this service, when its domain is configured elsewhere. Literal only
        # (default: derived from provider.domain, otherwise the stage URL)
        publicUrl: https://mcp.example.com
      state: true # signing key for elicitation round trips: true (provisioned) or the ARN of your SSM parameter or Secrets Manager secret
```

## AI Agents

The `ai` top-level property deploys [AI agents](./agents/README.md) to Amazon Bedrock AgentCore alongside the service's functions. It holds every AgentCore resource: `agents`, `tools`, `gateways`, `memory`, `browsers` and `codeInterpreters`. This snippet shows an agent's keys; see [AgentCore runtime](./agents/runtime.md):

```yml
# serverless.yml

ai:
  agents:
    # Agent name (used as a logical identifier)
    myAgent:
      # Optional description (1-1200 chars)
      description: My AI agent

      # Optional tags applied to the CloudFormation resource
      tags:
        team: platform
        env: prod

      # IAM role for the agent runtime. Can be:
      #   - A string (existing IAM role ARN or logical name)
      #   - An object to customize the auto-generated role
      #   - A CloudFormation intrinsic function
      # role: arn:aws:iam::123456789012:role/my-agent-role
      # OR customize the auto-generated role:
      role:
        # Optional custom role name (max 64 chars)
        name: my-agent-role
        # Additional IAM policy statements
        statements:
          - Effect: Allow
            Action:
              - dynamodb:GetItem
            Resource: arn:aws:dynamodb:us-east-1:123456789012:table/orders
        # Attach existing customer managed policies
        managedPolicies:
          - arn:aws:iam::123456789012:policy/agent-data-access
        # Optional permissions boundary
        permissionsBoundary: arn:aws:iam::123456789012:policy/boundary
        # Optional tags on the role
        tags:
          key: value

      # Memory for conversation persistence.
      # Can be a string (reference to a shared memory in ai.memory) or an inline config.
      # memory: sharedMemory # reference to ai.memory.sharedMemory
      # OR inline memory config:
      memory:
        expiration: 30 # Days until events expire (3-365)

      # Reference to a gateway defined in ai.gateways (string)
      gateway: myGateway

      # Code deployment (Python only): entry point file
      handler: agent.py
      # Python runtime for code deployment (default: python3.13)
      runtime: python3.14 # python3.10 | python3.11 | python3.12 | python3.13 | python3.14

      # Artifact configuration for container or code deployment
      artifact:
        # Container image: string (pre-built ECR URI) or object (build config)
        # image: 123456789012.dkr.ecr.us-east-1.amazonaws.com/my-agent:latest
        # OR build from source:
        image:
          # Dockerfile path relative to path (default: Dockerfile)
          file: Dockerfile
          # Docker build context directory, relative to the service directory (default: .)
          path: ./agent
          # Buildpacks builder image for builds without a Dockerfile (default: heroku/builder:24)
          builder: heroku/builder:24
          # ECR repository name (auto-created if omitted)
          repository: my-agent-repo
          # Docker --build-arg values injected at build time
          buildArgs:
            NODE_ENV: production
        # Optional S3 location for code deployment artifact
        s3:
          bucket: my-deployment-bucket
          key: agent.zip
          versionId: abc123

      # Packaging rules (same as Lambda functions)
      package:
        patterns:
          - 'src/**'
          - '!**/*.test.js'
        artifact: path/to/agent.zip

      # Invocation protocol (default: http)
      protocol: http # http | mcp | a2a

      # Environment variables injected into the agent container
      environment: # strings or CloudFormation references; provider.environment is inherited
        MODEL_ID: anthropic.claude-3-5-sonnet-20241022-v2:0
        LOG_LEVEL: info

      # Network configuration
      network:
        # Network mode (default: public)
        mode: public # public | vpc
        # Required when mode is vpc: 1-16 subnets and 1-16 security groups (AWS requires both)
        subnets:
          - subnet-aaaa1111
          - subnet-bbbb2222
        securityGroups:
          - sg-12345678

      # Authorizer for inbound requests to the agent runtime.
      # none and aws_iam keep the default SigV4 (IAM) authorization; custom_jwt with jwt requires a JWT instead
      # authorizer: none # none | aws_iam | custom_jwt
      # OR object form with JWT config (required when type is custom_jwt):
      authorizer:
        type: custom_jwt
        jwt:
          # Required: OIDC discovery URL (must end with /.well-known/openid-configuration)
          discoveryUrl: https://cognito-idp.us-east-1.amazonaws.com/us-east-1_xxxx/.well-known/openid-configuration
          # Optional: allowed JWT audiences
          allowedAudience:
            - my-client-id
          # Optional: allowed OAuth clients
          allowedClients:
            - my-client-id
          # Optional: required scopes
          allowedScopes:
            - openid
            - profile
          # Optional: custom claim matching rules
          customClaims:
            - inboundTokenClaimName: custom:org
              inboundTokenClaimValueType: STRING # STRING | STRING_ARRAY
              authorizingClaimMatchValue:
                claimMatchOperator: EQUALS # EQUALS | CONTAINS | CONTAINS_ANY
                claimMatchValue:
                  # Use matchValueString for a single value:
                  matchValueString: my-org
                  # OR matchValueStringList for multiple values (e.g., with contains_any):
                  # matchValueStringList:
                  #   - org-a
                  #   - org-b

      # Session lifecycle settings
      lifecycle:
        # Seconds of inactivity before a session is stopped (60-28800, AWS default: 900)
        idleRuntimeSessionTimeout: 300
        # Maximum lifetime of a session in seconds (60-28800, AWS default: 28800)
        maxLifetime: 3600

      # Named endpoints exposed by the agent runtime
      endpoints:
        - name: default
          version: '1'
          description: Primary agent endpoint

      # HTTP request headers to forward into the agent runtime
      requestHeaders:
        # Allowlist of header names to pass through (1-20 items)
        allowlist:
          - x-correlation-id
          - x-user-id
```

### Tools

The `ai.tools` block defines tools that agents call through a gateway, backed by a Lambda function, an OpenAPI spec, a Smithy model or an MCP server. See [AgentCore gateways and tools](./agents/gateway.md):

```yml
# serverless.yml

ai:
  tools:
    # Tool name (logical identifier, referenced by gateways and agents)
    myLambdaTool:
      # Lambda function tool: function name defined in the functions block
      # function: myFunction
      # OR object form with explicit name or ARN:
      function:
        name: myFunction # function name in this service
        # OR the ARN of an external function (takes precedence over name):
        # arn: arn:aws:lambda:us-east-1:123456789012:function:external-fn

      # Tool schema (required for function tools): describes the tools the Lambda exposes.
      # An inline list, or the path of a JSON file with the list
      toolSchema:
        - name: my_tool
          description: Does something useful
          inputSchema:
            type: object
            properties:
              input:
                type: string
                description: The input value
            required:
              - input

      # Optional description (1-200 chars)
      description: My Lambda-backed tool

      # Credential provider for Gateway-to-tool authentication
      credentials:
        # Credential type (default: gateway_iam_role)
        type: gateway_iam_role # gateway_iam_role | oauth | api_key

    myOpenApiTool:
      # OpenAPI schema tool: path to OpenAPI spec file
      openapi: openapi/my-api.yaml

    mySmithyTool:
      # Smithy model tool: path to Smithy model file
      smithy: smithy/my-model.smithy

    myMcpTool:
      # MCP server tool: https:// URL of the MCP server endpoint
      mcp: https://my-mcp-server.example.com/mcp
      credentials:
        type: oauth
        # Token Vault OAuth credential provider ARN (required for oauth)
        provider: arn:aws:bedrock-agentcore:us-east-1:123456789012:token-vault/default/oauth2credentialprovider/my-provider
        # OAuth scopes (required for oauth)
        scopes:
          - openid
          - read:data
        # OAuth grant type
        grantType: client_credentials # authorization_code | client_credentials
        # Optional: redirect URL for authorization_code flow
        defaultReturnUrl: https://my-app.example.com/callback
        # Optional: additional OAuth parameters (max 10)
        customParameters:
          audience: my-api

    myApiKeyTool:
      mcp: https://my-api.example.com/mcp
      credentials:
        type: api_key
        # Token Vault API key credential provider ARN (required for api_key)
        provider: arn:aws:bedrock-agentcore:us-east-1:123456789012:token-vault/default/apikeycredentialprovider/my-api-key
        # Where to send the API key
        location: header # header | query_parameter
        # Header or query parameter name
        parameterName: x-api-key
        # Optional prefix (e.g., "Bearer ")
        prefix: 'Bearer '
```

### Gateways

The `ai.gateways` block creates AgentCore gateways that expose `ai.tools` to agents over MCP. See [AgentCore gateways](./agents/gateway.md):

```yml
# serverless.yml

ai:
  gateways:
    # Gateway name (logical identifier, referenced by ai.agents[].gateway)
    myGateway:
      # Authorizer for inbound requests to the gateway
      # authorizer: none # none | aws_iam | custom_jwt
      # OR object form:
      authorizer:
        type: custom_jwt
        jwt:
          discoveryUrl: https://cognito-idp.us-east-1.amazonaws.com/us-east-1_xxxx/.well-known/openid-configuration
          allowedAudience:
            - my-client-id
          allowedClients:
            - my-client-id
          allowedScopes:
            - openid
          customClaims:
            - inboundTokenClaimName: custom:role
              inboundTokenClaimValueType: STRING # STRING | STRING_ARRAY
              authorizingClaimMatchValue:
                claimMatchOperator: EQUALS # EQUALS | CONTAINS | CONTAINS_ANY
                claimMatchValue:
                  matchValueString: admin
                  # OR matchValueStringList for multiple values:
                  # matchValueStringList:
                  #   - admin
                  #   - superadmin

      # Tools exposed by this gateway (references to ai.tools keys)
      tools:
        - myLambdaTool
        - myMcpTool

      # MCP protocol configuration for the gateway
      protocol:
        type: mcp # Only mcp is supported
        # Optional: supported MCP spec versions
        supportedVersions:
          - '2025-11-25'
        # Optional: system instructions passed to the agent (1-2048 chars)
        instructions: You are a helpful assistant with access to calculation tools.
        # Optional: search strategy for tool discovery
        searchType: semantic

      # Optional description (1-200 chars)
      description: Public tools gateway

      # IAM role (same structure as ai.agents[].role). The generated role can already invoke the
      # service's Lambda tools; add statements for anything else the gateway calls
      role:
        statements:
          - Effect: Allow
            Action:
              - secretsmanager:GetSecretValue
            Resource: arn:aws:secretsmanager:us-east-1:123456789012:secret:gateway-config

      # Optional KMS key ARN for encrypting gateway data
      kmsKey: arn:aws:kms:us-east-1:123456789012:key/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee

      # Set to 'debug' to include detailed error info in gateway responses
      exceptionLevel: debug

      # Optional tags
      tags:
        env: prod
```

### Memory

The `ai.memory` block creates AgentCore memory resources that agents share for conversation persistence. See [AgentCore memory](./agents/memory.md):

```yml
# serverless.yml

ai:
  memory:
    # Memory name (logical identifier, referenced by ai.agents[].memory)
    myMemory:
      # Days until memory events expire (3-365)
      expiration: 30

      # Optional KMS key ARN for encrypting memory data
      encryptionKey: arn:aws:kms:us-east-1:123456789012:key/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee

      # Optional memory consolidation strategies (array of strategy objects).
      # Passed through as-is to CloudFormation (AWS::BedrockAgentCore::Memory MemoryStrategies).
      strategies:
        - SemanticMemoryStrategy:
            Name: Conversations

      # IAM role (same structure as ai.agents[].role)
      role:
        statements:
          - Effect: Allow
            Action:
              - bedrock:InvokeModel
            Resource: arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-3-5-haiku-20241022-v1:0

      # Optional description (1-1200 chars)
      description: Shared conversation memory

      # Optional tags
      tags:
        team: platform
```

### Browsers

The `ai.browsers` block creates AgentCore managed browsers for web automation. See [AgentCore browser](./agents/browser.md):

```yml
# serverless.yml

ai:
  browsers:
    # Browser name (logical identifier)
    myBrowser:
      # Optional description (1-1200 chars)
      description: Browser with session recording

      # Optional tags
      tags:
        purpose: web-automation

      # IAM role (same structure as ai.agents[].role)
      role:
        statements:
          - Effect: Allow
            Action:
              - s3:PutObject
            Resource: arn:aws:s3:::my-recordings-bucket/*

      # Optional session recording configuration
      recording:
        enabled: true
        # S3 location for recording storage (required when enabled)
        s3Location:
          bucket: my-recordings-bucket
          prefix: browser-sessions/

      # Optional: enable request signing for browser sessions
      signing:
        enabled: true

      # Network configuration (default: public)
      network:
        mode: public # public | vpc
        # Required when mode is vpc: subnets and security groups (AWS requires both)
        subnets:
          - subnet-aaaa1111
        securityGroups:
          - sg-12345678
```

### Code Interpreters

The `ai.codeInterpreters` block creates AgentCore code interpreters for sandboxed code execution. See [AgentCore code interpreter](./agents/code-interpreter.md):

```yml
# serverless.yml

ai:
  codeInterpreters:
    # Code interpreter name (logical identifier)
    myInterpreter:
      # Optional description (1-1200 chars)
      description: Sandboxed code execution environment

      # Optional tags
      tags:
        purpose: data-analysis

      # IAM role (same structure as ai.agents[].role)
      role:
        statements:
          - Effect: Allow
            Action:
              - s3:GetObject
            Resource: arn:aws:s3:::my-data-bucket/*

      # Network configuration
      network:
        # sandbox: isolated (default), public: internet access, vpc: private VPC
        mode: sandbox # sandbox | public | vpc
        # Required when mode is vpc: subnets and security groups (AWS requires both)
        subnets:
          - subnet-aaaa1111
        securityGroups:
          - sg-12345678
```

## AppSync

The `appSync` top-level property deploys an [AWS AppSync GraphQL API](./appsync/README.md); `name` and `authentication` are required. Each key's page is named in its comment, under `./appsync/`:

```yml
# serverless.yml

appSync:
  # Required: the name of the API
  name: my-api
  # Required: the default authorization mode: API_KEY, AWS_IAM, AMAZON_COGNITO_USER_POOLS, OPENID_CONNECT or AWS_LAMBDA
  # See ./appsync/authentication.md
  authentication:
    type: API_KEY
  # Additional authorization modes, same shape as authentication. Optional
  additionalAuthentications:
    - type: AWS_IAM
  # API keys for API_KEY authorization: names, or objects with name, description, expiresAfter or expiresAt, wafRules
  apiKeys:
    - name: myKey
      expiresAfter: 1M
  # Schema file paths or globs, relative to the service directory (default: schema.graphql)
  schema:
    - schemas/*.graphql
  # Data sources by name; names use letters, digits and _ (see ./appsync/dataSources.md)
  dataSources:
    myTable:
      type: AMAZON_DYNAMODB
      config:
        tableName: my-table
  # Resolvers by Type.field; kind: PIPELINE (default) or UNIT (see ./appsync/resolvers.md)
  resolvers:
    Query.user:
      kind: UNIT
      dataSource: myTable
      code: resolvers/getUser.js
  # Pipeline functions by name, used in PIPELINE resolvers (see ./appsync/pipeline-functions.md). Optional
  pipelineFunctions:
    getUserFn:
      dataSource: myTable
      code: functions/getUser.js
  # Values substituted into resolver and function code and mapping templates. Optional
  substitutions:
    tableName: my-table
  # Environment variables for resolvers and functions. Optional
  environment:
    STAGE: ${sls:stage}
  # Enable AWS X-Ray tracing (default: false)
  xrayEnabled: false
  # GLOBAL (AppSync default) or PRIVATE; changing it replaces the API
  visibility: GLOBAL
  # Allow introspection queries (default: true)
  introspection: true
  # Maximum nesting depth of a query, 1-75 (default: no limit)
  queryDepthLimit: 10
  # Maximum resolvers one request can invoke, 1-1000 (default: AppSync default)
  resolverCountLimit: 100
  # Field-level logging to CloudWatch Logs. Optional
  logging:
    # Required: NONE, ERROR, INFO, DEBUG or ALL
    level: ERROR
    # Leave headers, context and evaluated templates out of the logs (default: false)
    excludeVerboseContent: false
    # Days to keep the logs (default: provider.logRetentionInDays)
    retentionInDays: 14
    # (default: true)
    enabled: true
  # API cache (see ./appsync/caching.md). Optional
  caching:
    # Required: FULL_REQUEST_CACHING or PER_RESOLVER_CACHING
    behavior: PER_RESOLVER_CACHING
    # SMALL, MEDIUM, LARGE, XLARGE, LARGE_2X, LARGE_4X, LARGE_8X or LARGE_12X
    type: SMALL
    # Seconds, 1-3600 (default: 3600)
    ttl: 300
  # Custom domain (see ./appsync/custom-domain.md). Optional
  domain:
    # Required: lowercase domain name
    name: api.example.com
    # Required with CloudFormation (default) unless certificateArn is set
    hostedZoneId: Z111111QQQQQQQ
  # AWS WAF web ACL for the API (see ./appsync/WAF.md). Optional
  waf:
    enabled: true
    # Allow (default) or Block
    defaultAction: Allow
    # Required unless arn names an existing web ACL
    rules:
      - throttle
  # Tags for the API. Optional
  tags:
    team: orders
  # Options for bundling JavaScript and TypeScript resolvers, or false to turn bundling off. Optional
  esbuild:
    minify: true
```

## Built-in features configured under custom

Some built-in features take their settings under `custom`, keeping the keys of the community plugins they replace.

### CloudWatch alerts

Create [CloudWatch alarms for Lambda functions](./alerts.md), SNS topics for them and dashboards:

```yml
# serverless.yml

custom:
  alerts:
    # Stages that get alerts (default: every stage)
    stages:
      - prod
    # SNS topics for alarm state changes: a topic name or ARN, or an object with topic and notifications
    topics:
      alarm:
        topic: ${self:service}-${sls:stage}-alerts-alarm
        notifications:
          - protocol: email
            endpoint: ops@example.com
    # Alarm definitions by name, merged over the built-in functionErrors, functionThrottles,
    # functionInvocations and functionDuration
    definitions:
      functionErrors:
        threshold: 5
    # Alarms created for every function: definition names or alarm objects; a function's alarms can turn one off
    alarms:
      - functionErrors
      - functionThrottles
    # Alarm name template and prefix for all alarms (default prefix: $[stackName])
    nameTemplate: $[functionName]-$[metricName]-Alarm
    prefixTemplate: $[stackName]
    # CloudWatch dashboards: true, a template name, a list, or an object. Optional
    dashboards: true
    # Deploy the alarms in a separate stack (default: false)
    externalStack: false
```

Functions add or turn off alarms with `functions.<name>.alarms` (see [AWS Lambda Functions](#aws-lambda-functions)).

### Version pruning

[Delete old Lambda function and layer versions](./prune.md) after each deploy:

```yml
# serverless.yml

custom:
  prune:
    # Prune after every serverless deploy (default: false); requires number
    automatic: true
    # Versions to keep, 0 or more; 0 deletes every version no alias points to
    number: 3
    # Also prune the service's layer versions (default: false)
    includeLayers: true
    # Also delete deployment artifacts no remaining version uses (default: false)
    includeArtifacts: false
```

### Python requirements

[Install Python requirements into the package](./python.md) from `requirements.txt`, Pipenv, Poetry or uv. The Framework installs requirements only when `custom.pythonRequirements` is set, even as `{}`:

```yml
# serverless.yml

custom:
  pythonRequirements:
    # false keeps the block but skips installing requirements (default: true)
    enabled: true
    # Requirements file (default: requirements.txt)
    fileName: requirements.txt
    # pip (default) or uv
    installer: pip
    # Build in a Docker container: true, false (default) or non-linux
    dockerizePip: non-linux
    # Remove tests, caches and other unneeded files from installed packages (default: false)
    slim: true
    # Zip the requirements into the package and unzip them at run time (default: false)
    zip: false
    # Put the requirements in a Lambda layer: true or layer settings (default: false)
    layer: false
    # Packages to leave out of the package (default: none)
    noDeploy:
      - boto3
    # Directory of extra libraries to copy into the package. Optional
    vendor: ./vendored
    # Other keys: usePoetry, usePipenv, useUv, requirePoetryLockFile, poetryWithGroups, poetryWithoutGroups,
    # poetryOnlyGroups, uvOptionalDependencies, uvWithGroups, uvWithoutGroups, uvOnlyGroups, pythonBin,
    # pipCmdExtraArgs, dockerImage, dockerFile, dockerBuildCmdExtraArgs, dockerRunCmdExtraArgs, dockerSsh,
    # dockerPrivateKey, dockerEnv, dockerExtraFiles, dockerRootless, strip, slimPatterns,
    # slimPatternsAppendDefaults, cleanupZipHelper, useStaticCache, useDownloadCache, cacheLocation,
    # staticCacheMaxVersions (see the Python requirements guide)
```

Python functions can set `module` (see [AWS Lambda Functions](#aws-lambda-functions)) to install requirements per function.

### API Gateway service proxies

[Connect REST API routes directly to an AWS service](./api-gateway-aws-proxy.md) (Kinesis, SQS, S3, SNS, DynamoDB or EventBridge) without a function:

```yml
# serverless.yml

custom:
  apiGatewayServiceProxies:
    # One item per route; the key is the service: kinesis, sqs, s3, sns, dynamodb or eventbridge
    - sqs:
        # Required: route path and method (get, post, put, patch, options, head, delete or any)
        path: /messages
        method: post
        # Required for sqs: the queue name, or Fn::GetAtt of the queue's QueueName
        queueName: { 'Fn::GetAtt': ['MessagesQueue', 'QueueName'] }
        # CORS: true or an object. Optional
        cors: true
        # Require an API key (default: false)
        private: false
        # NONE (default), AWS_IAM, CUSTOM or COGNITO_USER_POOLS
        authorizationType: NONE
        # Role API Gateway uses to call the service (default: a role the Framework creates). Optional
        # roleArn: arn:aws:iam::123456789012:role/sqs-proxy
        # Other keys: authorizerId, authorizationScopes, acceptParameters, request, response,
        # and each service's own keys (streamName, bucket, topicName, tableName, eventBusName, ...)
```

## AWS Resources

The `resources` block adds raw CloudFormation to the service's stack: extra resources and outputs, and overrides of the resources the Framework generates. See [AWS infrastructure resources](./resources.md):

```yml
# serverless.yml

# Insert raw CloudFormation in the deployed template. Accepted sections: Resources, Outputs, Conditions, Mappings,
# Parameters, Metadata, Description, Transform, AWSTemplateFormatVersion, and extensions
resources:
  Resources:
    usersTable:
      Type: AWS::DynamoDB::Table
      Properties:
        TableName: usersTable
        AttributeDefinitions:
          - AttributeName: email
            AttributeType: S
        KeySchema:
          - AttributeName: email
            KeyType: HASH
        ProvisionedThroughput:
          ReadCapacityUnits: 1
          WriteCapacityUnits: 1

  # Properties and attributes merged into resources the Framework generates, by logical ID
  extensions:
    UsersCreateLogGroup:
      Properties:
        RetentionInDays: 30

  # Stack outputs, which other stacks and services can read
  Outputs:
    UsersTableArn:
      Description: The ARN for the User's Table
      Value: !GetAtt usersTable.Arn
      # Export name that other stacks read with Fn::ImportValue
      Export:
        Name: ${self:service}:${sls:stage}:UsersTableArn
```

The `Outputs` section format is described in the [CloudFormation Outputs syntax](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/outputs-section-structure.html).
