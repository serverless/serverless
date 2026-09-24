# Multi-service projects: placement, references, and stages

## Contents

- Where a resource goes: decide by whether it holds data
- References: pick the mechanism by where the value lives
- Lifecycle: bootstrap once, then personal stages

Read this when a service needs a database or other stateful resource, when a
project has (or should have) more than one service, when one service needs a
value from another, or when setting up per-developer stages. A single service
is the common case; everything below applies once placement splits the
project.

## Where a resource goes: decide by whether it holds data

Ask one question of every resource: **does it hold durable data you would be
upset to lose?**

- **No: it stays in the app service.** Functions and their stateless wiring —
  HTTP APIs, event routing, SNS topics, EventBridge rules, SQS queues (a
  queue holding messages you cannot lose goes with the data). The app
  service deploys per stage (each deploy is its own `<service>-<stage>`
  stack), so every developer, pull request, and preview gets an isolated copy
  automatically. It is created and removed often, so keep it cheap and safe to
  recreate.
- **Yes: it gets its own service.** Databases and data stores — RDS/Aurora,
  DynamoDB, S3 buckets, OpenSearch. Deploy it once to a shared, long-lived
  stage and let the app stages read it. Frequent app deploys and
  `serverless remove` then never touch the data.

As soon as a resource gets its own service, the project is multi-service:
manage it with Serverless Compose, one `serverless-compose.yml` at the
project root listing the services (`serverless agent docs guides/compose`).

## References: pick the mechanism by where the value lives

**Inside one service: CloudFormation intrinsics.** Reference a resource
declared in the same service's `resources:` with `!Ref` (its name) or
`!GetAtt` (its ARN): `TABLE_NAME: !Ref OrdersTable`, IAM
`Resource: !GetAtt OrdersTable.Arn`. Leave out explicit physical names where
you can, so CloudFormation generates a unique one per stage, and reference it
everywhere instead of rebuilding the name as a string.

**Across services: the producer declares Outputs.** Other services read a
service's CloudFormation stack **Outputs**, so a service others depend on
declares them in `resources.Outputs`:

```yaml
# orders-db/serverless.yml
resources:
  Resources:
    OrdersTable:
      Type: AWS::DynamoDB::Table
      DeletionPolicy: Retain
      UpdateReplacePolicy: Retain
      Properties:
        BillingMode: PAY_PER_REQUEST
        PointInTimeRecoverySpecification:
          PointInTimeRecoveryEnabled: true
        AttributeDefinitions:
          - AttributeName: id
            AttributeType: S
        KeySchema:
          - AttributeName: id
            KeyType: HASH
  Outputs:
    TableName:
      Value: !Ref OrdersTable
    TableArn:
      Value: !GetAtt OrdersTable.Arn
```

`Retain` keeps the table when its stack is removed or the table is replaced,
and point-in-time recovery restores it after a bad write; a data store gets
both. Plain Outputs are all Compose needs. Prefer them over `Export` with
`Fn::ImportValue`: an exported output cannot change or be removed while
another stack imports it, which gets in the way of stages that are created and
removed often.

**Wire every cross-service value in the compose file.** It is the one place
the graph is described. Each service stays a plain `${param:...}` reader that
does not know who produces a value or at which stage.

**Same stage: `${service:<service>.<Output>}`.** Compose reads the output at
the stage of the current run and deploys that service first:

```yaml
# serverless-compose.yml
services:
  worker:
    path: worker
  api:
    path: api
    params:
      jobsQueueUrl: ${service:worker.JobsQueueUrl}
```

**A shared data service: a named `service` resolver pinned to its
stage.** Declare the resolver under `stages`, pin its `stage`, and read
through it:

```yaml
# serverless-compose.yml
stages:
  default:
    params:
      dataStage: dev # personal and preview stages read the shared dev data
    resolvers:
      shared:
        type: service
        stage: ${param:dataStage}
  prod:
    params:
      dataStage: prod # prod reads prod

services:
  orders-db:
    path: orders-db
  worker:
    path: worker
  api:
    path: api
    params:
      jobsQueueUrl: ${service:worker.JobsQueueUrl}
      ordersTableName: ${shared:orders-db.TableName}
      ordersTableArn: ${shared:orders-db.TableArn}
```

```yaml
# api/serverless.yml
provider:
  environment:
    JOBS_QUEUE_URL: ${param:jobsQueueUrl}
    ORDERS_TABLE: ${param:ordersTableName}
  iam:
    role:
      statements:
        - Effect: Allow
          Action: [dynamodb:GetItem, dynamodb:PutItem]
          Resource: ${param:ordersTableArn}
```

A pinned reference adds a deploy-ordering edge only when the stage it reads is
the stage of the run. A `dev` run deploys `orders-db` before `api`; a
personal-stage run reads the `dev` outputs and does not deploy `orders-db` at
all. Reading pinned outputs requires the shared service to be deployed to that
stage first.

A reference can be part of a larger value
(`postgres://${shared:orders-db.Host}:5432/orders`). Before the first deploy,
`serverless print` shows `NOT_AVAILABLE_IN_PRINT_COMMAND` for values that do
not exist yet.

**Outside this Compose project: resolve by how it was provisioned.**
`${aws:cf:<stack>.<Output>}` for another CloudFormation or Serverless
Framework stack, `${terraform:outputs:<name>}` for Terraform, and
`${ssm:/path}` for a value in Parameter Store. Keep these for things that are
not services in the compose file; everything inside the graph goes through
`service` references. Every variable source and its options:
`serverless agent docs guides/variables`.

Keep secrets out of plain config: SSM `SecureString`, Secrets Manager, or RDS
IAM authentication, which needs no static secret.

## Lifecycle: bootstrap once, then personal stages

The everyday commands live in `package.json` scripts, set up once when the
project is scaffolded: [package-json-scripts.md](package-json-scripts.md).

1. **Bootstrap the shared stage once per project**: `npm run bootstrap:dev`,
   a full-graph `serverless deploy --stage dev`. Whoever owns the shared data
   runs it; skip it when the `dev` stage already exists. Because `dataStage`
   is also `dev` in that run, Compose deploys `orders-db` before the services
   that read it, with no `dependsOn`.
2. **Deploy your personal stage**: `npm run deploy:personal-stage`, which runs
   `serverless deploy --service=api,worker --stage <you>`. A comma-separated
   `--service` list runs on exactly the named services, ordered among
   themselves by their dependencies. Services you do not name are neither
   deployed nor removed, so the stateful `orders-db` stays as it is and the
   app reads its `dev` outputs.
3. **Develop one service at a time**: `npm run dev:<service>`. In a Compose
   project `dev` runs on one service per terminal, and so does
   `serverless <service> agent inspect`, which checks one service's deployed
   state from the project root.
4. **Remove your personal stage** with `npm run remove:personal-stage`, the
   same `--service` list with `remove`.

If a run needs a value that is not deployed yet, the error names the service,
output, or stage that is missing. Deploy that first rather than adding a
literal value in its place.
