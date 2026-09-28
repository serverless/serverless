# serverless.yml essentials

## Contents

- A minimal service
- Authoring rules
- A function, a table, and least-privilege access

## A minimal service

```yaml
service: my-service
frameworkVersion: '4'

provider:
  name: aws
  runtime: nodejs24.x
  region: us-east-1

functions:
  api:
    handler: handler.hello
    events:
      - httpApi: 'GET /hello'
```

## Authoring rules

- Write `serverless.yml` and the handler files directly. For a starting
  point, adapt one of the services in the
  [Serverless Framework examples](https://github.com/serverless/examples),
  which cover common runtimes, events, and integrations.
- Use the newest runtime your language has on Lambda (for Node.js,
  `nodejs24.x`), for `provider.runtime` and any per-function `runtime`.
  Check the list of current Lambda runtimes when unsure.
- `service` names the stack; keep it short, lowercase, hyphenated.
- `org` (optional, top-level) names the Serverless org the service deploys to;
  without it the user's default org is used. Set it when the user belongs to
  several orgs.
- Pin `frameworkVersion` to the major (`'4'`) to stay on v4, or to an exact
  release so every machine and CI run the same version.
- Without `provider.region`, the region comes from `AWS_REGION` in the
  environment, else `us-east-1`; set it so every shell deploys to the same
  region.
- Each function needs a `handler` (file.export). Events attach triggers:

```yaml
events:
  - httpApi: 'POST /users' # HTTP API endpoint
  - schedule: rate(1 hour) # scheduled job
  - sqs:
      arn: !GetAtt MyQueue.Arn # queue consumer
  - s3:
      bucket: ${self:service}-uploads-${sls:stage} # names are global: one per stage
      event: s3:ObjectCreated:* # object notifications
```

Each event type has more options than these one-liners show (batching,
filters, authorizers, CORS): read its page before configuring one, for
example `serverless agent docs providers/aws/events/sqs`. The index lists
them all under Events.

- Any other AWS resource the functions need goes under `resources:` as raw
  CloudFormation:

```yaml
resources:
  Resources:
    MyQueue:
      Type: AWS::SQS::Queue
```

- Stage-specific values use `stages.<stage>.params`:

```yaml
stages:
  default:
    params:
      tableName: users-dev
  prod:
    params:
      tableName: users-prod
functions:
  api:
    environment:
      TABLE: ${param:tableName}
```

Deploy with `serverless deploy --stage prod` to select a stage. Parameters
can also come from `--param` on the command line or from the Serverless
Dashboard: `serverless agent docs guides/parameters`.

## A function, a table, and least-privilege access

References and least-privilege access in one file. A resource declared under
`resources:` is referenced by its logical id from anywhere else in the file:
`!Ref` for its name, `!GetAtt <id>.Arn` for its ARN.

```yaml
service: orders-api
frameworkVersion: '4'

provider:
  name: aws
  runtime: nodejs24.x
  httpApi:
    cors: true
  environment:
    ORDERS_TABLE: !Ref OrdersTable # the deployed table's name, as an env var
    STAGE: ${sls:stage} # the stage being deployed, for code that needs it

functions:
  createOrder:
    handler: src/orders.create
    memorySize: 512 # default 1024 MB
    timeout: 10 # default 6 s; HTTP API requests are capped at 30 s
    events:
      - httpApi: 'POST /orders'
    iam:
      role:
        statements: # this function's own role: these actions on this table only
          - Effect: Allow
            Action:
              - dynamodb:PutItem
              - dynamodb:GetItem
            Resource: !GetAtt OrdersTable.Arn

resources:
  Resources:
    OrdersTable:
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

`functions.<name>.iam.role.statements` gives that function its own role. To
share one role across all functions, put the statements under
`provider.iam.role.statements` instead. For choosing between a shared role,
per-function roles, or both, read `serverless agent docs providers/aws/guide/iam`.

The table sits in the app service here only to keep the example in one file:
a table in the app service is created and removed with each stage. A real
data store gets its own service, and the app reads its name and ARN through
params: [multi-service.md](multi-service.md).
