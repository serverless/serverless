# 1.1.0 (02.11.2016)

* [Github Milestone](https://github.com/serverless/serverless/milestone/15)
* [Comparison since last release](https://github.com/serverless/serverless/compare/v1.0.3...v1.1.0)

## Future breaking changes
We will include the LogGroup for your Lambda function in the CloudFormation template in the future. This will break deployments to existing applications because the log group was already created. You will get a warning about this if you deploy currently. We will force this behaviour in a future release, for now you can set it through the `cfLogs: true` parameter in your provider config. This change will also limit the logging rights to only this LogGroup, which should have no impact on your environment. You can read more in [our docs](https://serverless.com/framework/docs/providers/aws/guide/functions#log-group-resources).

## Features
* [Rollback Support](https://serverless.com/framework/docs/providers/aws/cli-reference/rollback/) (#2495)
* [Log Groups in Cloudformation](https://serverless.com/framework/docs/providers/aws/guide/functions#log-group-resources) (#2520)
* [Allow Services without functions](#2499) (#2499)
* [Clean up S3 Deployment bucket only after successful deployment](#2564) (#2564)
* [Allow Inclusion after Exclusion using ! Globs](https://serverless.com/framework/docs/providers/aws/guide/packaging/) (#2266)
* [Version Pinning for Serverless Services to only deploy with specified versions](https://serverless.com/framework/docs/providers/aws/guide/version/) (#2505)
* [Invoke local plugin](https://serverless.com/framework/docs/providers/aws/cli-reference/invoke/) (#2533)
* [Plugin template](https://serverless.com/framework/docs/providers/aws/cli-reference/create/) (#2581)
* [Simple Plugins are now installable in subfolder of the service](https://serverless.com/framework/docs/providers/aws/guide/plugins#service-local-plugin) (#2581)

## Bugs
* Fix variable syntax fallback if the file doesn't exist (#2565)
* Fix overwriting undefined variables (#2541)
* Fix CF deployment issue (#2576)
* Correctly package symlinks (#2266)

## Other
* [Large documentation refactoring](https://serverless.com/framework/docs/) (#2527)

# 1.0.3 (21.10.2016)

Following is a selection of features, bug fixes and other changes we did since 1.0.2.
You can also check out all changes in the [Github Compare View](https://github.com/serverless/serverless/compare/v1.0.2...v1.0.3)

## Features
* [Stack Tags and Policy](https://serverless.com/framework/docs/providers/aws/) (#2158)
* [CF Stack Output Variables in Verbose deploy output](https://serverless.com/framework/docs/cli-reference/deploy/) (#2253)
* [Custom Status code for non-proxy APIG integration](https://serverless.com/framework/docs/providers/aws/events/apigateway/) (#2014)
* [Function Runtime can now be configured per function](https://serverless.com/framework/docs/providers/aws/) (#2425)
* [Allow absolute path for invoke command event file](https://serverless.com/framework/docs/cli-reference/invoke/) (#2443)
* [Add list deployments command to show last deployments stored in S3 bucket](https://serverless.com/framework/docs/cli-reference/deploy/) (#2439)

## Bugs

* Fix not thrown error after failed ResourceStatus bug (#2367)
* Fix overwrite resources and custom resource merge bug (#2385)
* Clean up after deployment works correctly now (#2436)

## Other
* Migrate Integration tests into main repository (#2438)

# 1.0.2 (13.10.2016)

* Clean up NPM package (#2352)
* Clean up Stats functionality (#2345)

# 1.0.1 (12.10.2016)

Accidentally released 1.0.1 to NPM, so we have to skip this version (added here to remove confusion)

# 1.0.0 (12.10.2016)

## Breaking Changes

* The HTTP Event now uses the [recently released Lambda Proxy](http://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-set-up-simple-proxy.html#api-gateway-proxy-integration-types) by default. This requires you to change your handler result to fit the new proxy integration. You can also switch back to the old integration type.
* The Cloudformation Name of APIG paths that have a variable have changed, so if you have a variable in a path and redeploy CF will throw an error. To fix this remove the path and readd it a second deployment.

## Release Highlights
Following is a selection of the most important Features of the 1.0.0 since 1.0.0-rc.1.

You can see all features of 1.0.0-rc.1 in the [release blogpost](https://serverless.com/blog/serverless-v1-0-rc-1/)

### Documentation
* New documentation website https://serverless.com/framework/docs

### Events
* API Gateway Improvements
  * [Supporting API Gateway Lambda Proxy](https://serverless.com/framework/docs/providers/aws/events/apigateway/) (#2185)
  * [Support HTTP request parameters](https://serverless.com/framework/docs/providers/aws/events/apigateway/) (#2056)
* [S3 Event Rules](https://serverless.com/framework/docs/providers/aws/events/s3/) (#2068)
* [Built-in Stream Event support (Dynamo & Kinesis)](https://serverless.com/framework/docs/providers/aws/events/streams/) (#2250)

### Other
* [Configurable deployment bucket outside of CF stack](https://github.com/serverless/serverless/pull/2189) (#2189)
* [Install command to get services from Github](https://serverless.com/framework/docs/cli-reference/install/) (#2161)
* [Extended AWS credentials support](https://serverless.com/framework/docs/providers/aws/setup/) (#2229)
* [Extended the Serverless integration test suite](https://github.com/serverless/integration-test-suite)
