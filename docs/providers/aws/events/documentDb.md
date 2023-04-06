# DocumentDb

## Event definition

```yml
functions:
  docDbEventConsumer:
    handler: handler.default
    events:
      - documentDb:
          #required properties
          cluster: arn:aws:rds:us-west-2:123456789012:cluster:privatecluster7de2-epzcyvu4pjoy
          smk: arn:aws:secretsmanager:us-east-1:123456789012:secret:DocDBSecret-BAtjxi
          db: myAwsomeDatabaseName
          #optional
          auth: BASIC_AUTH
          batchSize: 42
          batchWindow: 80
          collection: myAwsomeCollectionName
          document: UpdateLookup
          enabled: true
          startingPosition: LATEST
```
