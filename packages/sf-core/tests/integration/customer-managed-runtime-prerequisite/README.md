# Customer-managed runtime prerequisite

A Lambda customer-managed runtime that backs the live suite in `../customer-managed-runtimes/`. It is a **persistent, per-account prerequisite** in `us-east-1`: it exists in test-1, where CI runs the suite (pinned to shard 1), and you create it once in any other account you run the suite from. Leave it standing. The suite reads its alias ARN from the SSM parameter `/cmr-integration-test/runtime-alias-arn`; in an account without that parameter, the suite skips with a log.

Why not create the runtime in each run: when a runtime is deleted, Lambda keeps its name reserved and counts it against the account's runtime quota (100 per Region by default) for 7 to 30 days. A runtime per CI run would fill the quota within days.

## What it provisions

- `template.yml`: the runtime `sls-integration-test-node24`, its version `v1` and the alias `stable` (all with `DeletionPolicy: Retain`, so deleting the stack does not reserve the name for 30 days), and the SSM `String` parameter `/cmr-integration-test/runtime-alias-arn` holding the alias ARN.
- `Dockerfile`: the runtime image, the Lambda Node.js 24 base image plus the marker file `/var/runtime-opt/sls-integration-runtime` that the suite's function returns.

## Create it (once per account)

Run from this directory, with credentials for the test account, Docker running, and `ACCOUNT_ID` set to the account id. The repository name and the `v1` tag are fixed: `template.yml` builds the image URI from them.

```bash
REGION=us-east-1
REPO=sls-integration-test-runtime
aws ecr create-repository --repository-name "$REPO" --region "$REGION"
aws ecr set-repository-policy --repository-name "$REPO" --region "$REGION" --policy-text '{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "LambdaReadAccess",
    "Effect": "Allow",
    "Principal": { "Service": "lambda.amazonaws.com" },
    "Action": ["ecr:BatchGetImage", "ecr:DescribeImages", "ecr:GetDownloadUrlForLayer"],
    "Condition": {
      "StringEquals": { "aws:SourceAccount": "'"$ACCOUNT_ID"'" },
      "ArnLike": { "aws:SourceArn": "arn:aws:lambda:'"$REGION"':'"$ACCOUNT_ID"':runtime/*" }
    }
  }]
}'
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com"
docker build --platform linux/amd64 -t "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$REPO:v1" .
docker push "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$REPO:v1"
serverless deploy --stack sls-integration-test-customer-managed-runtime --region "$REGION"
```

`serverless deploy` in a directory that holds a `template.yml` deploys it as a CloudFormation stack. The ECR repository and the image push stay outside the template: CloudFormation creates the runtime version from an image that must already exist.

Keep the image in the repository: a runtime version whose image is deleted stops working.

The roles that run the suites need `ssm:GetParameter` on the parameter and `lambda:AssociateRuntimeAlias` on the alias ARN, in addition to what deploying a service needs.
