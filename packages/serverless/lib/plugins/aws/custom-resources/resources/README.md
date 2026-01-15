# Serverless Custom CloudFormation Resources

This directory contains the Lambda functions for the Serverless Custom CloudFormation Resources.

Runtime and dependencies

- Handlers run on Node.js 22.x and use the AWS SDK for JavaScript v3 (`@aws-sdk/*`) preinstalled in the Lambda runtime. The packaged zip only includes these source files (no `node_modules`).

What each custom resource does and why it’s needed

1. Custom::S3 (existing bucket notifications)

- What it does: Adds/removes `LambdaFunctionConfigurations` on an existing S3 bucket and manages Lambda invoke permissions for that bucket.
- Why needed: CloudFormation cannot authoritatively manage notification rules on an external, pre-existing bucket referenced in your service. The custom resource applies the desired event, filter rules, and permissions idempotently during Create/Update/Delete.
- Activated by: Function event `s3: { bucket: <name|CFN ref>, existing: true, ... }`.
- Code: `s3/handler.js`, `s3/lib/bucket.js`, `s3/lib/permissions.js`.

2. Custom::CognitoUserPool (existing user pool triggers)

- What it does: Updates an existing Cognito User Pool’s `LambdaConfig` to attach/detach Lambda triggers (e.g., `PostConfirmation`, `PreTokenGeneration`). Supports custom sender sources with `KMSKeyID` and manages Lambda permissions.
- Why needed: When using an existing User Pool, CloudFormation cannot directly update triggers through your stack. The custom resource applies trigger configuration changes and permissions safely.
- Activated by: Function event `cognitoUserPool: { pool: <name>, trigger: <Trigger>, existing: true, ... }`.
- Code: `cognito-user-pool/handler.js`, `cognito-user-pool/lib/user-pool.js`, `cognito-user-pool/lib/permissions.js`.

3. Custom::EventBridge (rule/target via custom resources)

- What it does: Creates/deletes an EventBridge rule, sets the pattern or schedule, and manages the Lambda target (including input settings and permissions). Creates/deletes a named event bus when needed.
- Why needed: Legacy integration path for EventBridge when opting out of native CloudFormation. Kept for backwards compatibility; native CloudFormation is preferred going forward.
- Activated by: `provider.eventBridge.useCloudFormation: false` and a function `eventBridge` event.
- Code: `event-bridge/handler.js`, `event-bridge/lib/event-bridge.js`, `event-bridge/lib/utils.js`.

4. Custom::ApiGatewayAccountRole (API Gateway → CloudWatch logs role)

- What it does: Ensures an account-level IAM role is set for API Gateway logging. Creates/attaches `AmazonAPIGatewayPushToCloudWatchLogs` if needed and updates the API Gateway account to use it.
- Why needed: The account-level `cloudwatchRoleArn` is not modeled directly in CloudFormation for the standard REST API path used here. This custom resource reliably configures logging when you enable API Gateway logs.
- Activated by: `provider.logs.restApi: true` in service config (used during stage compilation for REST API).
- Code: `api-gateway-cloud-watch-role/handler.js`.

Notes

- All handlers send a success/failure response to the CloudFormation `ResponseURL` and log details to CloudWatch.
- Idempotency is handled by reading current state first (e.g., S3 notifications, Cognito `DescribeUserPool`) and applying minimal changes.
