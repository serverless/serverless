
# Tencent-scf - Rollback

Rollback a service to a specific deployment.

```bash
serverless rollback --timestamp timestamp
```

If `timestamp` is not specified, Framework will show your existing deployments.

## Options

- `--timestamp` or `-t` The deployment you want to rollback to.
- `--verbose` or `-v` Shows any history deployment.

## Examples


At first you want to run `serverless deploy list` to show your existing deployments. This will provide you with a list of the deployments stored in your COS bucket. You can then use the timestamp of one of these deployments to rollback to this specific deployment.

**Example:**

```
$ sls deploy list
Serverless: Listing deployments:
Serverless: -------------
Serverless: Timestamp: 1572625699
Serverless: Datetime: 2019-11-01T16:28:19.896Z
Serverless: Files:
Serverless: - my-service-dev-1572625699.json
Serverless: - my-service-dev-SNixdp-2019-11-01-16-28-19.zip
Serverless: -------------
Serverless: Timestamp: 1572350506
Serverless: Datetime: 2019-10-29T12:01:46.816Z
Serverless: Files:
Serverless: - my-service-dev-1572350506.json
Serverless: - my-service-dev-2SDp7w-2019-10-29-12-01-46.zip

$ sls rollback -t 1572625699
Serverless: Rollback function my-service-dev-function_one
Serverless: Rollback function my-service-dev-function_one
Serverless: Rollback configure for function my-service-dev-function_one
Serverless: Setting tags for function my-service-dev-function_one
Serverless: Rollback trigger for function my-service-dev-function_one
Serverless: Deployed function my-service-dev-function_one successful
```
