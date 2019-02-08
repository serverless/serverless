# 1.37.1 (2019-02-08)

- [Fix makeDeepVariable replacement](https://github.com/serverless/serverless/pull/5809)

## Meta
 - [Comparison since last release](https://github.com/serverless/serverless/compare/v1.37.0...v1.37.1)


# 1.37.0 (2019-02-06)

- [Fixes for AWS cors config issues](https://github.com/serverless/serverless/pull/5785)
- [Preserve whitespaces in single-quote literal fallback](https://github.com/serverless/serverless/pull/5775)
- [AWS: Add fallback support in ${cf} and ${s3}](https://github.com/serverless/serverless/pull/5758)
- [Throw an error if plugin is executed outside of a serverless directory](https://github.com/serverless/serverless/pull/5636)
- [Require provider.credentials vars to be resolved before s3/ssm/cf vars](https://github.com/serverless/serverless/pull/5763)
- [Provide multi origin cors values](https://github.com/serverless/serverless/pull/5740)
- [handle layers paths with trailing slash and leading ./ or just .](https://github.com/serverless/serverless/pull/5656)
- [Resolve profile before performing aws-sdk dependent actions](https://github.com/serverless/serverless/pull/5744)
- [Fix assuming a role with an AWS profile](https://github.com/serverless/serverless/pull/5739)
- [Allows Fn::GetAtt with Lambda DLQ-onError](https://github.com/serverless/serverless/pull/5139)
- [Fix #5664 - Rollback fails due to a timestamp parsing error](https://github.com/serverless/serverless/pull/5710)
- [AWS: Tell S3 bucket name and how to recover if deployment bucket does not exist](https://github.com/serverless/serverless/pull/5714)
- [Do not print logs if print command is used.](https://github.com/serverless/serverless/pull/5728)
- [Default to error code if message is non-existent](https://github.com/serverless/serverless/pull/4794)
- [Add resource count and warning to info display](https://github.com/serverless/serverless/pull/4822)
- [Add uploaded file name to log while AWS deploy](https://github.com/serverless/serverless/pull/5495)
- [Enable tab completion for slss shortcut](https://github.com/serverless/serverless/pull/4712)
- [Upgrade google-cloudfunctions to v2 and set defaults to node8 etc](https://github.com/serverless/serverless/pull/5311)
- [Convert reservedConcurrency to integer to allow use env var](https://github.com/serverless/serverless/pull/5705)

## Meta
 - [Comparison since last release](https://github.com/serverless/serverless/compare/v1.36.3...v1.37.0)


# 1.36.3 (2019-01-23)
 - [AWS: Consolidates Lambda::Permission objects for cloudwatchLog events](https://github.com/serverless/serverless/pull/5531)
 - [Suppress confusing warning "A valid undefined..." ](https://github.com/serverless/serverless/pull/5723)
 - [Add google go template](https://github.com/serverless/serverless/pull/5726)
 - [Provide AWS_PROFILE from configuration for invoke local](https://github.com/serverless/serverless/pull/5662)
 - [Test that CLI does not convert numeric option to number](https://github.com/serverless/serverless/pull/5727)
 - [Remove duplicate-handler warnings based on community feedback.](https://github.com/serverless/serverless/pull/5733)
 - [Enable download template from a private github repo using personal access token](https://github.com/serverless/serverless/pull/5715)
 - [Fix sls plugin install -n @scoped/package](https://github.com/serverless/serverless/pull/5736)

## Meta
 - [Comparison since last release](https://github.com/serverless/serverless/compare/v1.36.2...v1.36.3)

# 1.36.2 (2019-01-21)
 - [AWS: Request cache should add region as key to prevent cross-region cache collision](https://github.com/serverless/serverless/pull/5694)
 - [Fixed a link](https://github.com/serverless/serverless/pull/5707)
 - [Clarify docs for the http key for GCF](https://github.com/serverless/serverless/pull/5680)
 - [Fix awsProvider.js : "Cannot use 'in' operator to search for '0'](https://github.com/serverless/serverless/pull/5688)
 - [Fix array notation in stream ARN](https://github.com/serverless/serverless/pull/5702)
 - [Remove platform code](https://github.com/serverless/serverless/pull/5687)
 - [Increase @types/aws-lambda version in aws-nodejs-typescript template](https://github.com/serverless/serverless/pull/5695)
 - [Update aws-scala-sbt template](https://github.com/serverless/serverless/pull/5725)
 - [docs: Kubeless secrets](https://github.com/serverless/serverless/pull/5130)
 - [docs menu sidebar - added [Getting Started] above [Providers]](https://github.com/serverless/serverless/pull/5721)
 - [Fix layer doc reference to functions (should be layers)](https://github.com/serverless/serverless/pull/5697)

## Meta
 - [Comparison since last release](https://github.com/serverless/serverless/compare/v1.36.1...v1.36.2)


# 1.36.1 (2019-01-14)
 - [Update layers.md](https://github.com/serverless/serverless/pull/5678)
 - [AWS: Fix stage name validation timing and allow hyphen](https://github.com/serverless/serverless/pull/5686)

## Meta
 - [Comparison since last release](https://github.com/serverless/serverless/compare/v1.36.0...v1.36.1)

# 1.36.0 (2019-01-10)
 - [Log AWS SDK calls in debug mode](https://github.com/serverless/serverless/pull/5604)
 - [Added currently supported regions for GCP functions](https://github.com/serverless/serverless/pull/5601)
 - [Update Cloudflare Templates](https://github.com/serverless/serverless/pull/5620)
 - [AWS: Validate rate/cron syntax before Deploy](https://github.com/serverless/serverless/pull/5635)
 - [Fix error log output](https://github.com/serverless/serverless/pull/5378)
 - [Support for native async/await in AWS Lambda for aws-nodejs-typescript template ](https://github.com/serverless/serverless/pull/5607)
 - [aws-csharp create template uses handler-specific artifact](https://github.com/serverless/serverless/pull/5411)
 - [change behaviour on initial stack create failed](https://github.com/serverless/serverless/pull/5631)
 - [Add warning for multiple functions having same handler](https://github.com/serverless/serverless/pull/5638)
 - [AWS: Add API Gateway stage name validation.](https://github.com/serverless/serverless/pull/5639)
 - [fix Cloudflare template config](https://github.com/serverless/serverless/pull/5651)
 - [AWS: Fix ${cf.REGION} syntax causes deployment in wrong region](https://github.com/serverless/serverless/pull/5650)
 - [support for @ symbol in ${file()} variables paths](https://github.com/serverless/serverless/pull/5312)
 - [Fix ResourceLimitExceeded for cloudwatchLog event](https://github.com/serverless/serverless/pull/5554)
 - various documentation updates (#5625, #5613, #5628, #5659, #5618, #5437, #5623, #5627, #5665)

## Meta
 - [Comparison since last release](https://github.com/serverless/serverless/compare/v1.35.1...v1.36.0)


# 1.35.1 (2018-12-18)
 - [fixed regression preventing including files outside working dir](https://github.com/serverless/serverless/pull/5602)
 - [Update ruby template gitignore](https://github.com/serverless/serverless/pull/5599)

## Meta
 - [Comparison since last release](https://github.com/serverless/serverless/compare/v1.35.0...v1.35.1)

# 1.35.0 (2018-12-13)
 - [Fix logRetentionInDays regression in AWS](https://github.com/serverless/serverless/pull/5562)
 - [`invoke local` support for Ruby lambdas](https://github.com/serverless/serverless/pull/5559)
 - [Set reserved concurrency in cfn template even if zero](https://github.com/serverless/serverless/pull/5566)
 - [Fix `--env` being shadowed when using `sls invoke local`](https://github.com/serverless/serverless/pull/5565)
 - [Preserve whitespace in variable literal defaults](https://github.com/serverless/serverless/pull/5571)
 - [Drastically improved dev dependency exclusion performance](https://github.com/serverless/serverless/pull/5574)
 - [Extend ${cf} syntax to get output from another region](https://github.com/serverless/serverless/pull/5579)
 - [Upgrade aws-sdk dep to fix issues with using AWS Profiles](https://github.com/serverless/serverless/pull/5587)
 - Documentation updates

## Meta
 - [Comparison since last release](https://github.com/serverless/serverless/compare/v1.34.1...v1.35.0)


# 1.34.1 (2018-11-30)
 - [Add aws-ruby template](https://github.com/serverless/serverless/pull/5546)
 - [Add support for API Gateway payload compression](https://github.com/serverless/serverless/pull/5529)

## Meta
 - [Comparison since last release](https://github.com/serverless/serverless/compare/v1.34.0...v1.34.1)

# 1.34.0 (2018-11-29)
 - [Lambda Layers support](https://github.com/serverless/serverless/pull/5538)
 - [Python3.7 support](https://github.com/serverless/serverless/pull/5505)
 - [Updating roles requirement for GCF deployment](https://github.com/serverless/serverless/pull/5490)
 - [Support returning promises from serverless.js](https://github.com/serverless/serverless/pull/4827)
 - [update CloudFlare worker docs to new more consistent config](https://github.com/serverless/serverless/pull/5521)
 - [fix --aws-profile so it overrides profile defined in serverless.yml](https://github.com/serverless/serverless/pull/5516)
 - [Fix invoke local when using a callback in nodejs](https://github.com/serverless/serverless/pull/5525)
 - [Fix parsing of --data & --context option with invoke local](https://github.com/serverless/serverless/pull/5512)

## Meta
 - [Comparison since last release](https://github.com/serverless/serverless/compare/v1.33.2...v1.34.0)


# 1.33.2 (2018-11-18)
 - [fix `invoke local` with python2.7 projects](https://github.com/serverless/serverless/pull/5500)
 - [fix `logs --tail`](https://github.com/serverless/serverless/pull/5503)

## Meta
 - [Comparison since last release](https://github.com/serverless/serverless/compare/v1.33.1...v1.33.2)



# 1.33.1 (2018-11-15)
 - [fix issue with `sls deploy --verbose --stage foobar`](https://github.com/serverless/serverless/pull/5492)

## Meta
 - [Comparison since last release](https://github.com/serverless/serverless/compare/v1.33.0...v1.33.1)


# 1.33.0 (2018-11-15)
 - [2116 consistent errors missing config](https://github.com/serverless/serverless/pull/5298)
 - [Update plugin version of google-nodejs template](https://github.com/serverless/serverless/pull/5473)
 - [insert line break to suppress warning](https://github.com/serverless/serverless/pull/5445)
 - [Fix wrong example function name.](https://github.com/serverless/serverless/pull/5477)
 - [Removed errant apostrophe](https://github.com/serverless/serverless/pull/5471)
 - [Wrong error when S3 bucket name starts with an upper-case character](https://github.com/serverless/serverless/pull/5409)
 - [Fix integration test](https://github.com/serverless/serverless/pull/5440)
 - [Use pythonX instead of pythonX.Y in invoke local(take 3)](https://github.com/serverless/serverless/pull/5210)
 - [update python invokeLocal to detect tty](https://github.com/serverless/serverless/pull/5355)
 - [Fix typo in Google workflow](https://github.com/serverless/serverless/pull/5433)
 - [Updating services.md > Invoking Serverless locally](https://github.com/serverless/serverless/pull/5425)
 - [Assume role and MFA support for Serverless CLI](https://github.com/serverless/serverless/pull/5432)
 - [Fix build error caused by new docs PR ](https://github.com/serverless/serverless/pull/5435)
 - [Adding Ruby support for OpenWhisk provider plugin.](https://github.com/serverless/serverless/pull/5427)
 - [Update Cloudflare Workers documentation](https://github.com/serverless/serverless/pull/5419)
 - [break single general issue template into two specialized templates](https://github.com/serverless/serverless/pull/5405)
 - [Improve language in alexa-skill documentation](https://github.com/serverless/serverless/pull/5408)
 - [APIG ApiKeySourceType support.](https://github.com/serverless/serverless/pull/5395)
 - [Revert "Update cognito-user-pool.md"](https://github.com/serverless/serverless/pull/5399)
 - [Let function package.individually config override service artifact](https://github.com/serverless/serverless/pull/5364)
 - [Added CloudWatch Proxy to examples](https://github.com/serverless/serverless/pull/5270)
 - [Multiple cloudformation resources](https://github.com/serverless/serverless/pull/5250)
 - [Added possibility to specify custom S3 key prefix instead of the stan…](https://github.com/serverless/serverless/pull/5299)
 - [Doc update for openwhisk package name](https://github.com/serverless/serverless/pull/5375)
 - [add aws-go-mod](https://github.com/serverless/serverless/pull/5393)
 - [Fix bin process not always exiting](https://github.com/serverless/serverless/pull/5349)
 - [Avoid args being rounded and converted to numbers](https://github.com/serverless/serverless/pull/5361)
 - [Add CacheControl headers on the OPTIONS response in AWS API Gateway](https://github.com/serverless/serverless/pull/5328)
 - [fix Makefile style for Go template](https://github.com/serverless/serverless/pull/5389)
 - [Update handler name when deploy a single function](https://github.com/serverless/serverless/pull/5301)
 - [fix: Implement context.log function for invoke local command on Python environment.](https://github.com/serverless/serverless/pull/5391)
 - [validate if serverless.yml exists when running sls info command](https://github.com/serverless/serverless/pull/5390)
 - [Update documentation, README.md](https://github.com/serverless/serverless/pull/5388)
 - [Remove invalid log](https://github.com/serverless/serverless/pull/5377)
 - [fix 3916 ](https://github.com/serverless/serverless/pull/5387)
 - [Update cognito-user-pool.md](https://github.com/serverless/serverless/pull/5384)
 - [add gitignore setting to Go template](https://github.com/serverless/serverless/pull/5386)
 - [fixed anchor links in aws/guide/variables.md file](https://github.com/serverless/serverless/pull/5370)
 - [Serverless Pipeline](https://github.com/serverless/serverless/pull/5360)
 - [add Serverless Line Bot example](https://github.com/serverless/serverless/pull/5359)
 - [Update invoke-local.md](https://github.com/serverless/serverless/pull/5362)
 - [Webtask Deprecation](https://github.com/serverless/serverless/pull/5263)
 - [Add Support for Shorthand CloudFormation Syntax](https://github.com/serverless/serverless/pull/5327)
 - [Provide Consistent Service Path (Fix #5242)](https://github.com/serverless/serverless/pull/5314)
 - [null](https://github.com/serverless/serverless/pull/5242)
 - [Add Cloudflare to docs/getting-started page.](https://github.com/serverless/serverless/pull/5342)
 - [Invoke local override env](https://github.com/serverless/serverless/pull/5313)
 - [more faithfully represent aws lambda python runtime context](https://github.com/serverless/serverless/pull/5291)
 - [Update AWS TypeScript handler template](https://github.com/serverless/serverless/pull/5309)
 - [add untildify package to handle create paths with a ~](https://github.com/serverless/serverless/pull/5062)
 - [[Docs] - Add support information for AWS lambda and SQS](https://github.com/serverless/serverless/pull/5305)
 - [Update README.md](https://github.com/serverless/serverless/pull/5294)
 - [Add information on invoking Workers.](https://github.com/serverless/serverless/pull/5310)
 - [Update quick-start.md](https://github.com/serverless/serverless/pull/5308)
 - [Cloudflare: Specify config under provider property](https://github.com/serverless/serverless/pull/5289)
 - [Create an HttpsProxyAgent for plugin list if necessary](https://github.com/serverless/serverless/pull/5481)

## Meta
 - [Comparison since last release](https://github.com/serverless/serverless/compare/v1.32.0...v1.33.0)


# 1.32.0 (2018-09-17)
- [Update quick-start.md](https://github.com/serverless/serverless/pull/5290)
- [Backend state item generation and multi-region support](https://github.com/serverless/serverless/pull/5265)

## Meta
- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.31.0...v1.32.0)


# 1.31.0 (2018-09-11)
- [Add support for Cloudflare Workers](https://github.com/serverless/serverless/pull/5258)
- [docs: Fix mismatch in AWS Metrics](https://github.com/serverless/serverless/pull/5276)
- [Add new template for AWS Alexa Typescript](https://github.com/serverless/serverless/pull/5266)
- [Remove `/tmp/node-dependencies*`](https://github.com/serverless/serverless/pull/5079)
- [Adds FilterPolicy to SNS event](https://github.com/serverless/serverless/pull/5229)
- [Update API Gateway Default Request Templates](https://github.com/serverless/serverless/pull/5222)
- [Update serverless.yml.md](https://github.com/serverless/serverless/pull/5236)
- [Fix for #3069 - Failing to handle schedule event body params](https://github.com/serverless/serverless/pull/5268)
- [Remove redundant link to same docs page](https://github.com/serverless/serverless/pull/5243)

## Meta
- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.30.3...v1.31.0)


# 1.30.3 (2018-08-28)
- [Fix CORS race condition](https://github.com/serverless/serverless/pull/5256)

## Meta
- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.30.2...v1.30.3)


# 1.30.2 (2018-08-28)
- [Fixed a bug when using DynamoDB events with Serverless Platform](https://github.com/serverless/serverless/pull/5237)
- [Fixed a bug when using deep variable references](https://github.com/serverless/serverless/pull/5224)
- [Fixed an issue with Makefile of the aws-go-dep template](https://github.com/serverless/serverless/pull/5227)

## Meta
- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.30.1...v1.30.2)


# 1.30.1 (2018-08-16)
- [Fix CI deployment to Serverless Platform](https://github.com/serverless/serverless/issues/5182)
- [Fix a minor resources ID issue on Serverless Platform](https://github.com/serverless/serverless/pull/5208)
- [Update nodejs template to 8.10](https://github.com/serverless/serverless/pull/5088)

## Meta
- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.30.0...v1.30.1)


# 1.30.0 (2018-08-09)
- [Added support for multiple access keys for multiple tenants](https://github.com/serverless/serverless/pull/5189)
- [Fixed a publishing bug when having more than 100 resources](https://github.com/serverless/serverless/pull/5189)
- [Add Windows support for spawning mvn](https://github.com/serverless/serverless/pull/5028)
- [Update spawn API with {shell=true}](https://github.com/serverless/serverless/pull/5192)
- [AWS Clojurescript Gradle Template](https://github.com/serverless/serverless/pull/5147)
- [Use latest dotnet runtime in AWS Lambda](https://github.com/serverless/serverless/pull/5107)
- [Ignore null errors to allow resolution instead of rejection on undefined SSM variables](https://github.com/serverless/serverless/pull/5119)
- [Fixed a bug when using deep variable references](https://github.com/serverless/serverless/pull/5156)
- [Add support for installing templates and boilerplates from GitLab](https://github.com/serverless/serverless/pull/5116)
- [Fixed that create command didn't use the service name given as -n option](https://github.com/serverless/serverless/pull/5082)

## Meta
- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.29.2...v1.30.0)


# 1.29.2 (2018-07-29)
- [Fixed a bug when using APIG lambda integration with Serverless Dashboard](https://github.com/serverless/serverless/pull/5174)
- [Fixed a bug by transforming env var to string when setting num value](https://github.com/serverless/serverless/pull/5166)

## Meta
- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.29.1...v1.29.2)


# 1.29.1 (2018-07-28)
- [Fixed a bug when using APIG root path with Serverless Dashboard](https://github.com/serverless/serverless/pull/5170)

## Meta
- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.29.0...v1.29.1)


# 1.29.0 (2018-07-26)
- [Fixes issue with Node 10.7.0](https://github.com/serverless/serverless/issues/5133)
- [Serverless Dashboard Updates: Subscriptions, Resources, Deploys and Refresh Tokens](https://github.com/serverless/serverless/pull/5127)
- [Support `invoke local` of AWS Lambda Async Functions](https://github.com/serverless/serverless/pull/4912)
- [Improve aws-scala-sbt template](https://github.com/serverless/serverless/pull/5086)

## Meta
- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.28.0...v1.29.0)


# 1.28.0 (2018-07-04)
- [Add SQS event integration](https://github.com/serverless/serverless/pull/5074)
- [Integration with the Serverless Dashboard](https://github.com/serverless/serverless/pull/5043)
- [Add APIG resource policy](https://github.com/serverless/serverless/pull/5071)
- [Add PRIVATE endpoint type](https://github.com/serverless/serverless/pull/5080)
- [Added ability to create custom stack names and API names](https://github.com/serverless/serverless/pull/4951)
- [Add print options to allow digging, transforming and formatting](https://github.com/serverless/serverless/pull/5036)
- [only use json-cycles when opt-in, for state serialization](https://github.com/serverless/serverless/pull/5029)
- [Make function tags inherit provider tags](https://github.com/serverless/serverless/pull/5007)
- [Make local plugins folder configurable](https://github.com/serverless/serverless/pull/4892)
- [More flexible version constraint for AWS Lambda Go library](https://github.com/serverless/serverless/pull/5045)
- [Update aws-java-maven template to use Log4J2 as recommended by AWS](https://github.com/serverless/serverless/pull/5032)
- [Fix binary support for pre-flight requests (OPTIONS method)](https://github.com/serverless/serverless/pull/4895)

## Meta
- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.27.0...v1.28.0)


# 1.27.0 (2018-05-02)
- [Add maxAge option for CORS](https://github.com/serverless/serverless/pull/4639)
- [Add fn integration](https://github.com/serverless/serverless/pull/4934)
- [iamManagedPolicies merging with Vpc config](https://github.com/serverless/serverless/pull/4879)
- [Support arrays in function definition too](https://github.com/serverless/serverless/pull/4847)
- [Add iam managed policies](https://github.com/serverless/serverless/pull/4793)
- [Pass authorizer custom context to target lambda](https://github.com/serverless/serverless/pull/4773)
- [Allow UsagePlan's to be created without ApiKeys defined](https://github.com/serverless/serverless/pull/4768)
- [Added name property to cloudwatchEvent CF template](https://github.com/serverless/serverless/pull/4763)
- [Java maven templates for OpenWhisk](https://github.com/serverless/serverless/pull/4758)
- [Pass serverless variable when calling function in referenced file](https://github.com/serverless/serverless/pull/4743)
- [Eliminate/Report Hung Promises, Prepopulate Stage and Region, Handle Quoted Strings](https://github.com/serverless/serverless/pull/4713)
- [Restricting alexaSkill functions to specific Alexa skills](https://github.com/serverless/serverless/pull/4701)
- [Add support for concurrency option in AWS Lambda](https://github.com/serverless/serverless/pull/4694)
- [Fix concurrency upload](https://github.com/serverless/serverless/pull/4677)
- [Support AWS GovCloud and China region deployments](https://github.com/serverless/serverless/pull/4665)

## Meta
- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.26.1...v1.27.0)


# 1.26.1 (2018-02-27)
- [Fix lambda integration regression](https://github.com/serverless/serverless/pull/4775)

## Meta
- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.26.0...v1.26.1)


# 1.26.0 (2018-01-29)
- [AWS Go support](https://github.com/serverless/serverless/pull/4669)
- [Support for using an existing ApiGateway and Resources](https://github.com/serverless/serverless/pull/4247)
- [Add logRetentionInDays config](https://github.com/serverless/serverless/pull/4591)
- [Add support of `serverless.js` configuration file](https://github.com/serverless/serverless/pull/4590)
- [Add "did you mean..." CLI suggestions](https://github.com/serverless/serverless/pull/4586)
- [Add `--template-path` option to `serverless create`](https://github.com/serverless/serverless/pull/4576)
- [Add support POJO input support for Java invoke local](https://github.com/serverless/serverless/pull/4596)

## Meta
- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.25.0...v1.26.0)


# 1.25.0 (2017-12-20)
- [Improve Stage and Region Usage](https://github.com/serverless/serverless/pull/4560)
- [Add API Gateway endpoint configuration](https://github.com/serverless/serverless/pull/4531)
- [Add cache to Variables class](https://github.com/serverless/serverless/pull/4499)
- [Added support for circular references in the variable system](https://github.com/serverless/serverless/pull/4144)
- [Circular Vars Fix](https://github.com/serverless/serverless/pull/4478)
- [Ignore the check whether deploymentBucket exists when using "package"](https://github.com/serverless/serverless/pull/4474)
- [Template / AWS Kotlin JVM Gradle](https://github.com/serverless/serverless/pull/4433)
- [Basic logging for python invoke local](https://github.com/serverless/serverless/pull/4429)
- [Add Amazon S3 Transfer Acceleration support](https://github.com/serverless/serverless/pull/4293)
- [Updated awsProvider to allow manual specification of certificate auth](https://github.com/serverless/serverless/pull/4118)
- [Fix lambda version generation when only function config changes](https://github.com/serverless/serverless/pull/4510)
- [Added request cache and queue to AWS provider and use it from variable resolution](https://github.com/serverless/serverless/pull/4518)
- [Add significant variable usage corner cases](https://github.com/serverless/serverless/pull/4529)

## Meta
- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.24.1...v1.25.0)


# 1.24.1 (2017-11-07)
- [Fix this.userStats.track is not a function error when tailing function logs](https://github.com/serverless/serverless/pull/4441)
- [Improve variables test](https://github.com/serverless/serverless/pull/4450)
- [Error when file referenced in serverless.yml does not exist](https://github.com/serverless/serverless/pull/4448)

## Meta
- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.24.0...v1.24.1)


# 1.24.0 (2017-11-01)
- [Run "serverless deploy list" if timestamp is not specified in rollback command](https://github.com/serverless/serverless/pull/4297)
- [Add alexaSmartHome event](https://github.com/serverless/serverless/pull/4238)
- [Distinguish plugin initialization error from plugin not found error](https://github.com/serverless/serverless/pull/4322)
- [Removing private: true from function does not change it's state](https://github.com/serverless/serverless/pull/4302)
- [Change packaging order in zipFiles function](https://github.com/serverless/serverless/pull/4299)
- [Enable bluebird long stack traces only in SLS_DEBUG mode](https://github.com/serverless/serverless/pull/4333)
- [Create service using template from an external repository](https://github.com/serverless/serverless/pull/4133)
- [API Gateway timeout hardcap](https://github.com/serverless/serverless/pull/4348)
- [Set stdin to a TTY in invoke.py to allow PDB use](https://github.com/serverless/serverless/pull/4360)
- [Add function attached to API Gateway effective timeout warning](https://github.com/serverless/serverless/pull/4373)
- [Exclude dev dependency .bin executables](https://github.com/serverless/serverless/pull/4383)
- [Fix "deploy function" command by normalizing role](https://github.com/serverless/serverless/pull/4320)
- [Add print command to generate output of computed serverless.yml](https://github.com/serverless/serverless/pull/4169)
- [Print message if Serverless Framework update is available](https://github.com/serverless/serverless/pull/4301)
- [Allow symlinks as custom variable files in serverless.yml](https://github.com/serverless/serverless/pull/4389)
- [Provide option to conceal API Gateway key values from the output](https://github.com/serverless/serverless/pull/4382)
- [Configurable Authorizer Type](https://github.com/serverless/serverless/pull/4372)

## Meta
- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.23.0...v1.24.0)


# 1.23.0 (2017-09-21)
- [Obey VIRTUAL_ENV on Windows](https://github.com/serverless/serverless/pull/4286)
- [Implement pinging for the CLI login](https://github.com/serverless/serverless/pull/4206)
- [Fixed a bug with deploy function not inheriting provider config](https://github.com/serverless/serverless/pull/4262)
- [Added Auth0 Webtasks Provider Template for Nodejs](https://github.com/serverless/serverless/pull/4283)
- [Added Java support for invoke local](https://github.com/serverless/serverless/pull/4199)

## Meta
- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.22.0...v1.23.0)


# 1.22.0 (2017-09-13)
- [Serverless now fails if provided profile is not valid](https://github.com/serverless/serverless/pull/4245)
- [Removed escaping of double quotes around string values in Serverless Variables](https://github.com/serverless/serverless/pull/4224)
- [Added 4 new plugin commands](https://github.com/serverless/serverless/pull/4046)
- [Added aws-kotlin-jvm-marven template](https://github.com/serverless/serverless/pull/4220)
- [Added --update-config option to deploy function command](https://github.com/serverless/serverless/pull/4173)
- [Added description to CloudWatch Events](https://github.com/serverless/serverless/pull/4221)
- [Added support for aliasing commands](https://github.com/serverless/serverless/pull/4198)
- [Added --function option to deploy command](https://github.com/serverless/serverless/pull/4192)
- [Fixed a bug with Kinesis events](https://github.com/serverless/serverless/pull/4084)
- [Fixed a bug with packaging](https://github.com/serverless/serverless/pull/4189)

## Meta
- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.21.1...v1.22.0)


# 1.21.1 (2017-09-06)
- [Preserve file encoding during packaging process](https://github.com/serverless/serverless/pull/4189)

## Meta
- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.21.0...v1.21.1)


# 1.21.0 (2017-08-30)
- [Allow custom CLI class instances](https://github.com/serverless/serverless/pull/4160)
- [Add support in Spotinst Functions](https://github.com/serverless/serverless/pull/4127)
- [Add PHP support for OpenWhisk](https://github.com/serverless/serverless/pull/4153)
- [Fixed a bug with stack deletion monitoring](https://github.com/serverless/serverless/pull/4132)
- [Allow AWS Profile CLI option to overwrite config and env](https://github.com/serverless/serverless/pull/3980)
- [Improve performance of the package plugin](https://github.com/serverless/serverless/pull/3924)
- [Add support for custom context with Invoke Local](https://github.com/serverless/serverless/pull/4126)
- [Add aws-nodejs-typescript template](https://github.com/serverless/serverless/pull/4058)
- [Add aws-nodejs-ecma-script template](https://github.com/serverless/serverless/pull/4056)
- [Allow updates for AWS profiles](https://github.com/serverless/serverless/pull/3866)
- [Fixed a bug in Invoke Local when using Python in Windows](https://github.com/serverless/serverless/pull/3832)
- [Fixed a bug with the Variable System overwrites](https://github.com/serverless/serverless/pull/4097)

## Meta
- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.20.2...v1.21.0)


# 1.20.2 (2017-08-17)
- [Bump event-gateway version to 0.5.15](https://github.com/serverless/serverless/pull/4116)

## Meta
- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.20.1...v1.20.2)


# 1.20.1 (2017-08-17)
- [Rethrow original plugin error in debug mode](https://github.com/serverless/serverless/pull/4091)
- [Add platform gate to serverless run / emit](https://github.com/serverless/serverless/pull/4103)

## Meta
- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.20.0...v1.20.1)


# 1.20.0 (2017-08-16)
- [Add Serverless Run plugin](https://github.com/serverless/serverless/pull/4034)
- [Add Serverless Emit plugin](https://github.com/serverless/serverless/pull/4038)
- [Kubeless template for python and nodejs](https://github.com/serverless/serverless/pull/3970)
- [Improve deprecation hook message](https://github.com/serverless/serverless/pull/4011)

## Meta
- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.19.0...v1.20.0)


# 1.19.0 (2017-08-02)
- [Removed provider name validation](https://github.com/serverless/serverless/pull/3941)
- [Fixed a bug with dev dependencies exclusion](https://github.com/serverless/serverless/pull/3975)
- [Fixed a bug with "deploy list functions"](https://github.com/serverless/serverless/pull/3971)
- [Fixed a bug with Serverless Plugins loading](https://github.com/serverless/serverless/pull/3960)

## Meta
- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.18.1...v1.19.0)


# 1.18.1 (2017-07-28)
- [Fixed a bug with Serverless Variables](https://github.com/serverless/serverless/pull/3996)
- [Fixed a bug with dev dependencies exclusion](https://github.com/serverless/serverless/pull/3975)

## Meta
- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.18.0...v1.18.1)


# 1.18.0 (2017-07-20)
- [Added support for a new "default" property for Plugins CLI options](https://github.com/serverless/serverless/pull/3808)
- [Fixed a bug with dev dependencies exclusion](https://github.com/serverless/serverless/pull/3889)
- [Added support for a new "publish" property to opt-out from Platform publishing](https://github.com/serverless/serverless/pull/3950)
- [Fixed a bug with "sls remove" when the stack includes Exports](https://github.com/serverless/serverless/pull/3935)
- [Added support for request parameter configuration with lambda-proxy integration](https://github.com/serverless/serverless/pull/3722)
- [Enhanced the environment variables for invoke local to include AWS_REGION](https://github.com/serverless/serverless/pull/3908)
- [Updated the deploy command to ignore custom plugins in service directory during deployment](https://github.com/serverless/serverless/pull/3910)
- [Fixed a bug with function packaging](https://github.com/serverless/serverless/pull/3856)
- [Updated the package command to ignore function packaging if a custom artifact is specified](https://github.com/serverless/serverless/pull/3876)
- [Added support for absolute paths when using Serverless Variables file references](https://github.com/serverless/serverless/pull/3888)


## Meta
- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.17.0...v1.18.0)


# 1.17.0 (2017-07-05)
- Cleanup F# build template output on macOS - #3897
- Add disable flag for OpenWhisk functions - #3830
- Only redeploy when the code/config changes - #3838
- Add opt-out config for dev dependency exclusion - #3877
- Add infinite stack trace for errors - #3839
- Fixed a bug with autocomplete - #3798


## Meta
- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.16.1...v1.17.0)


# 1.16.1 (2017-06-26)
- CI/CD fix for the Serverless Platform - #3829

## Meta
- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.16.0...v1.16.1)


# 1.16.0 (2017-06-21)
- Added support for usage plans to APIG - #3819
- Optmizied packaging to exclude dev dependencies - #3737
- Added support for S3 server side encryption - #3804
- Improved HTTP error handling - #3752
- Throw an error when requsted CF variable doesn't exist - #3739
- Throw an error if an individual package is empty - #3729

## Meta
- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.15.0...v1.16.0)


# 1.15.3 (2017-06-12)
- Fixed autocomplete bug with help option - #3781

## Meta
- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.15.2...v1.15.3)


# 1.15.2 (2017-06-10)
- Fixed installation error - #3763

## Meta
- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.15.0...v1.15.2)


# 1.15.0 (2017-06-08)
- Added autocomplete support to the CLI - #3753
- Added KMS key support - #3672
- Added Cognito User pool support - #3657
- Added serverless.json support - #3647
- Added aws-profile support - #3701
- Added CloudFormation validation support - #3668
- Fixed S3 event race condition bug - #3705
- Fixed CORS origin config bug - #3692

## Meta
- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.14.0...v1.15.0)

# 1.14.0 (2017-05-24)
- Added login command - #3558
- Added support for DeadLetter Config with SNS - #3609
- Added support for S3 variables - #3592
- Added rollback function command - #3571
- Added `X-Amz-User-Agent` to list of allowed headers in CORS - #3614
- Added support for HTTP_PROXY API Gateway integration - #3534
- Added IS_LOCAL environment variable with invoke local command - #3642
- Removed package.json in exclude rules - #3644


## Meta
- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.13.2...v1.14.0)


# 1.13.2 (2017-05-15)
- Fixed a bug when using dot notation in YAML keys (#3620)

## Meta
- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.13.1...v1.13.2)


# 1.13.1 (2017-05-12)
- Fixed bug when referencing variables from other variable object values (#3604)
- Fixed bug when packaging a functions-free service (#3598)

## Meta
- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.13.0...v1.13.1)


# 1.13.0 (2017-05-10)
- Added support for cross service communication via CloudFormation outputs (#3575)
- Add Lambda tagging functionality (#3548)
- Added support for Promises in the variable system (#3554)
- Added hello-world template (#3445)
- Improved Info plugins lifecylce events for plugin authors (#3507)
- Allow service to be specified as object in serverless.yml (#3521)

## Meta
- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.12.0...v1.13.0)

# 1.12.1 (2017-04-27)
- Fix bug when using the package command with the variable system (#3527)

## Meta
- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.12.0...v1.12.1)

# 1.12.0 (2017-04-26)
- Separated packaging and deployment with a new package command (#3344)
- Extend OpenWhisk runtime support (#3454)
- Upgrade gradle wrapper to 3.5 (#3466)
- Fixed bug when using event streams with custom roles (#3457)
- Fixed bug with SNS events (#3443)
- Fixed bug when using custom deployment bucket (#3479)
- Added support for Python 3.6 for Lambda (#3483)
- Added new syntax to specify ARN for SNS events (#3505)

# 1.11.0 (2017-04-12)
- Add CloudWatch Logs Event Source (#3407)
- Add version description from function (#3429)
- Add support for packaging functions individually (#3433)

## Meta
- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.10.2...v1.11.0)


# 1.10.2 (3.04.2017)
- Add support for packaging functions individually at the function level (#3433)

# 1.10.1 (2017-03-30)
- Update serverless-alpha detection (#3423)

## Meta
- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.10.0...v1.10.1)


# 1.10.0 (2017-03-29)
- Fixed bug with ANY http method (#3304)
- Reduced unit test time significantly (#3359)
- Added AWS Groovy Gradle Template (#3353)
- Reduce dependency tree depth between IAM & Log Groups (#3360)
- Added entrypoints for plugins (#3327)
- Removed pre-install script (#3385)
- Expose plugin hooks  (#2985)
- Add support for Node 6 runtime in invoke local (#3403)
- Updated Node.js templates to include Node 6 runtime by default (#3406)
- Removed breaking changes warnings (#3418)
- Auto loading serverless-alpha plugin (#3373)

## Meta
- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.9.0...v1.10.0)

# 1.9.0 (2017-03-14)
- Fixed bug with serverless plugins lookup (#3180)
- Fixed bug with `serverless create` generated .gitignore (#3355)
- Fixed bug with authorizer claims (#3187)
- Added support for CloudFormation service roles  (#3147)
- Improvements for invoke local plugin (#3037)
- Added Azure Functions Node.js template in `serverless create` (#3334)
- Allow DynamoDB and Kinesis streams to use GetAtt/ImportValue (#3111)

## Meta
- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.8.0...v1.9.0)


# 1.8.0 (2017-02-28)
## Non-Breaking Changes

- Fixed bug with deployment progress monitoring (#3297)
- Fixed "too many open files" error (#3310)
- Fixed bug with functions lists loaded from a separate file using Serverless Variables (#3186)

## Breaking Changes

#### Removed IamPolicyLambdaExecution Resource
We've removed the `IamPolicyLambdaExecution` resource template and replaced it with inline policy within the role as it's been causing issues with VPC and bloating the CF template. This is a breaking change only for users who are depending on that resource with `Ref` or similar CF intrinsic functions.

#### Changed displayed function name for `sls info`
The function name displayed when you run `sls info` is now the short function name as found in `serverless.yml` rather than the actual lambda name to keep it more provider agnostic. This could be breaking for any user who is depending or parsing the CLI output.


## Meta
- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.7.0...v1.8.0)

# 1.7.0 (2017-02-14)
- Added CloudWatch event source (#3102)
- Fixed average functions duration calculation in "sls metrics" output (#3067)
- Added SLS_IGNORE_WARNINGS flag and logging upcoming breaking changes (#3217)
- Reduced memory consumption during zipping process (#3220)
- Fixed bug when using LogGroup resources with custom roles (#3213)

## Meta
- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.6.1...v1.7.0)

# 1.6.1 (2017-01-31)
A minimal patch release that fixes an issue with rendering README.md on npm registry.

# 1.6.0 (2017-01-30)

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

# 1.5.1 (2017-01-19)

## Bug Fixes
- Fix bug with multi line values is given in IoT events (#3095)
- Add support of numeric template creation path (#3064)
- Fix deployment bucket bug when using eu-west-1 (#3107)

## Meta
- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.5.0...v1.5.1)


# 1.5.0 (2017-01-05)

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

# 1.4.0 (2016-12-15)

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

# 1.3.0 (2016-12-02)

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

# 1.2.0 (2016-11-22)

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

# 1.1.0 (2016-11-02)

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

# 1.0.3 (2016-10-21)

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

# 1.0.2 (2016-10-13)

* Clean up NPM package (#2352)
* Clean up Stats functionality (#2345)

# 1.0.1 (2016-10-12)

Accidentally released 1.0.1 to NPM, so we have to skip this version (added here to remove confusion)

# 1.0.0 (2016-10-12)

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
