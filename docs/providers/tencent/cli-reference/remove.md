
# Tencent-scf - Remove

The `sls remove` command will remove the deployed service, defined in your current working directory, from the provider.

```bash
serverless remove
```

## Options

- `--stage` or `-s` The name of the stage in service, `dev` by default.
- `--region` or `-r` The name of the region in stage, `ap-guangzhou` by default.

## Examples

### Removal of service in specific stage and region

```bash
serverless remove --stage dev --region ap-guangzhou
```

This example will remove the deployed service of your current working directory with the stage `dev` and the region `ap-guangzhou`.
