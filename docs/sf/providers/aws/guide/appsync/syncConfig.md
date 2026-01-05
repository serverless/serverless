# Sync Config

[Delta Sync](https://docs.aws.amazon.com/appsync/latest/devguide/tutorial-delta-sync.html) configuration for [resolvers](resolvers.md) and [pipeline functions](pipeline-functions.md).

## Quick start

```yaml
Query.user:
  dataSource: my-table
  sync:
    conflictDetection: 'VERSION'
    conflictHandler: 'LAMBDA'
    function:
      timeout: 30
      handler: 'functions/userSync.handler'
```

- `conflictDetection`: `VERSION` or `NONE`. Defaults to `VERSION`
- `conflictHandler`: When `conflictDetection` is `VERSION`, configures how conflict resolution happens. `OPTIMISTIC_CONCURRENCY`, `AUTOMERGE` or `LAMBDA`. Defaults to `OPTIMISTIC_CONCURRENCY`
- `function`: When `conflictHandler` is `LAMBDA`, a Lambda function definition as you would define it under the `functions` section of your `serverless.yml` file.
- `functionName`: When `conflictHandler` is `LAMBDA`, the name of the function as defined under the `functions` section of the `serverless.yml` file
- `functionAlias`: When `conflictHandler` is `LAMBDA`, a specific function alias to use.
- `functionArn`: When `conflictHandler` is `LAMBDA`, the function ARN to use.
