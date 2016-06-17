# Remove

```
serverless remove --stage dev --region us-east-1
```

Removes the deployed service which is defined in your current working directory according to the stage and region.

## Options
- `--stage` The name of the stage in service. **Required**.
- `--region` The name of the region in stage. **Required**.

## Provided lifecycle events
- `remove:remove`

## Examples

```
serverless remove --stage dev --region us-east-1
```

This example will remove the deployed service of your current working directory with the stage `dev` and the region
`us-east-1`.
