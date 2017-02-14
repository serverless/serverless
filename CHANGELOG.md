# 1.7.0 (14.02.2017)
- Added CloudWatch event source (#3102)
- Fixed average functions duration calculation in "sls metrics" output (#3067)
- Added SLS_IGNORE_WARNINGS flag and logging upcoming breaking changes (#3217)
- Reduced memory consumption during zipping process (#3220)
- Fixed bug when using LogGroup resources with custom roles (#3213)

## Meta
- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.6.1...v1.7.0)

# 1.6.1 (31.01.2017)
A minimal patch release that fixes an issue with rendering README.md on npm registry.

# 1.6.0 (30.01.2017)

**Important Note:** This release includes breaking changes. If your services stopped working after upgrading to v1.6.0, please read the following section.

## Breaking Changes

### CloudWatch logs are created explicitly
Up until this release, CloudWatch log groups were created implicitly by AWS/Lambda by default and were not included in your service stack. However, some users were able to easily reach the CloudWatch log group limits (currently at 500 log groups), and it wasn't an easy task to clear them all. Because of that we decided to explicitly create the log groups using CloudFormation so that you can easily remove them with `sls remove`. This was also optionally possible with the `cfLogs: true` config option.

If your service doesn't have the `cfLogs: true` set, and one of the function has been invoked at least once (hence the log groups were created implicitly by AWS), then it's very likely that you'll receive a "log group already exists" error after upgrading to v1.6.0. That's because CF is now trying to create the already created log groups from scratch to include it in the stack resources. **To fix this breaking change,** simply delete the old log group, or rename your service if you **must** keep the old logs.

### Removed function Arns from CloudFormation outputs
Up until this release, the output section of the generated CloudFormation template included an output resource for each function Arn. This caused deploying big services to fail because users were hitting the 60 outputs per stack limit. This effectively means that you can't have a service that has more than 60 functions. To avoid this AWS limit, we decided to remove those function output resources completely, to keep the stack clean. This also means removing the function Arns from the `sls info` command, and at the end of the deployment command.

This is a breaking change for your project if you're depending on those function output resources in anyway, or if you're depending on function arn outputs from the deploy or info commands. Otherwise, your project shouldn't be affected by this change. Fixing this issue depends on your needs, but just remember that you can always create your own CF outputs in `serverless.yml`.

### Moved `getStackName()` method
This is a breaking change for plugin authors only. If your plugin used the `provider.getStackName()` method, it has been moved to `naming.js`, and should be referenced with `provider.naming.getStackName()` instead.

### Removed the `defaults` property from `serverless.yml`
We've finally dropped support for the `defaults` property which we introduced in v1. All child properties should now be moved to the `provider` object instead.

## Non-breaking changes
- Reduce memory consumption on deploy by at least 50% (#3145)
- Added openwhisk template to `sls create` command (#3122)
- Allow Role 'Fn::GetAtt' for Lambda `role` (#3083)
- Added Access-Control-Allow-Credentials for CORS settings (#2736)
- add Support for SNS Subscription to existing topics (#2796)
- Function version resources are now optional. (#3042)
- Invoke local now supports python runtime. (#2937)
- Fixed "deployment bucket doesn't exist" error (#3107)
- Allowed function events value to be variables (#2434)

## Meta
- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.5.1...v1.6.0)

# 1.5.1 (19.01.2017)

## Bug Fixes
- Fix bug with multi line values is given in IoT events (#3095)
- Add support of numeric template creation path (#3064)
- Fix deployment bucket bug when using eu-west-1 (#3107)

## Meta
- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.5.0...v1.5.1)


# 1.5.0 (05.01.2017)

## Features
* [Added IoT event source support](https://github.com/serverless/serverless/blob/master/docs/providers/aws/events/iot.md) (#2954)
* [Cognito user pool authorizer](https://serverless.com/framework/docs/providers/aws/events/apigateway/#http-endpoints-with-custom-authorizers) (#2141)
* Service installation with a name (#2616)

## Bug Fixes
* Fix VTL string escaping (#2993)
* Scheduled events are enabled by default (#2940)
* Update status code regex to match newlines (#2991)
* Add check for preexistent service directory (#3014)
* Deployment monitoring fixes (#2906)
* Credential handling fixes (#2820)
* Reduced policy statement size significantly (#2952)

## Meta
* [Github Milestone](https://github.com/serverless/serverless/milestone/20?closed=1)
* [Comparison since last release](https://github.com/serverless/serverless/compare/v1.4.0...v1.5.0)

# 1.4.0 (15.12.2016)

## Features
* [Alexa event support](https://github.com/serverless/serverless/issues/2875) (#2875)
* [New C# service template](https://github.com/serverless/serverless/tree/master/docs/providers/aws/examples/hello-world/csharp) (#2858)
* [Local Invoke Improvements](https://github.com/serverless/serverless/pull/2865) (#2865)
* [Service wide metrics](https://github.com/serverless/serverless/blob/master/docs/providers/aws/cli-reference/metrics.md) (#2846)
* [Install service by pointing to a Github directory](https://github.com/serverless/serverless/issues/2721) (#2721)
* [Add support for stdin for invoke & invoke local](https://github.com/serverless/serverless/blob/master/docs/providers/aws/cli-reference/invoke.md#function-invocation-with-data-from-standard-input) (#2894)

## Bug Fixes
* Fixed exit code for failed function invocations (#2836)
* Stricter validation for custom IAM statements (#2132)
* Fixed bug in credentials setup (#2878)
* Removed unnecessary warnings during Serverless installation (#2811)
* Removed request and response config when using proxy integration (#2799)
* Internal refactoring

## Meta
* [Github Milestone](https://github.com/serverless/serverless/milestone/18?closed=1)
* [Comparison since last release](https://github.com/serverless/serverless/compare/v1.3.0...v1.4.0)

# 1.3.0 (02.12.2016)

## Features
* [Metrics support](https://serverless.com/framework/docs/providers/aws/cli-reference/metrics/) (#1650)
* [AWS credential setup command](https://serverless.com/framework/docs/providers/aws/cli-reference/config/) (#2623)
* Lambda versioning on each deploy (#2676)

## Improvements
* Documentation improvements with `serverless.yml` file reference (#2703)
* Display info how to use SLS_DEBUG (#2690)
* Drop `event.json` file on service creation (#2786)
* Refactored test structure (#2464)
* Automatic test detection (#1337)

## Bug Fixes
* Add DependsOn for Lamda functions and IamPolicyLambdaExecution (#2743)
* Add JSON data parsing for invoke command (#2685)
* Internal refactoring

## Meta
* [Github Milestone](https://github.com/serverless/serverless/milestone/17?closed=1)
* [Comparison since last release](https://github.com/serverless/serverless/compare/v1.2.1...v1.3.0)

# 1.2.0 (22.11.2016)

## Features
* [Lambda environment variables support](https://serverless.com/framework/docs/providers/aws/guide/functions#environment-variables) (#2748)
* [Load Serverless variables from javascript files](https://serverless.com/framework/docs/providers/aws/guide/variables#reference-variables-in-javascript-files) (#2495)
* [Add support for setting custom IAM roles for functions](https://serverless.com/framework/docs/providers/aws/guide/iam#custom-iam-roles-for-each-function) (#1807)
* Lambda environment variables support in Invoke Local (#2757)
* Tighter and secure permissions for event sources (#2023)

## Bug Fixes
* Fix `--noDeploy` flag to generate deployment files offline without needing internet connection (#2648)
* Bring back the `include` packaging feature with the help of globs (#2460)
* Internal refactoring

## Meta
* [Github Milestone](https://github.com/serverless/serverless/milestone/16?closed=1)
* [Comparison since last release](https://github.com/serverless/serverless/compare/v1.1.0...v1.2.0)

# 1.1.0 (02.11.2016)

## Future breaking changes
We will include the LogGroup for your Lambda function in the CloudFormation template in the future. This will break deployments to existing applications because the log group was already created. You will get a warning about this if you deploy currently. We will force this behaviour in a future release, for now you can set it through the `cfLogs: true` parameter in your provider config. This change will also limit the logging rights to only this LogGroup, which should have no impact on your environment. You can read more in [our docs](https://serverless.com/framework/docs/providers/aws/guide/functions#log-group-resources).

## Features
* [Rollback Support](https://serverless.com/framework/docs/providers/aws/cli-reference/rollback/) (#2495)
* [Log Groups in Cloudformation](https://serverless.com/framework/docs/providers/aws/guide/functions#log-group-resources) (#2520)
* [Allow Services without functions](https://github.com/serverless/serverless/pull/2499) (#2499)
* [Clean up S3 Deployment bucket only after successful deployment](https://github.com/serverless/serverless/pull/2564) (#2564)
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

## Meta
* [Github Milestone](https://github.com/serverless/serverless/milestone/15)
* [Comparison since last release](https://github.com/serverless/serverless/compare/v1.0.3...v1.1.0)

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
