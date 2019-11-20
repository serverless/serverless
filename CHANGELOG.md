# 1.58.0 (2019-11-20)

- [Fix missing ALB trigger in console](https://github.com/serverless/serverless/pull/6926)
- [Add support for vpc link integration discussed as part of #5025](https://github.com/serverless/serverless/pull/6051)
- [Setup Codecov](https://github.com/serverless/serverless/pull/6924)
- [Fix handling of China region in S3 bucket policy](https://github.com/serverless/serverless/pull/6934)
- [Fix policy definition](https://github.com/serverless/serverless/pull/6937)
- [Fix typo in Tencent docs](https://github.com/serverless/serverless/pull/6935)
- [Add Knative provider template](https://github.com/serverless/serverless/pull/6936)
- [Add Knative documentation](https://github.com/serverless/serverless/pull/6930)
- [PLAT-1798 - set env vars for AWS creds from cached credentials…](https://github.com/serverless/serverless/pull/6938)
- [Add azure python to cli](https://github.com/serverless/serverless/pull/6945)
- [updated providers menu order in docs](https://github.com/serverless/serverless/pull/6955)
- [Update API Gateway tagging to use partition for deployed region](https://github.com/serverless/serverless/pull/6948)
- [Fix: use normalized maps in zipService.js](https://github.com/serverless/serverless/pull/6705)
- [Add support for multi-value headers in ALB events](https://github.com/serverless/serverless/pull/6940)
- [Improve config error handling](https://github.com/serverless/serverless/pull/6962)
- [sls-flask starter kit](https://github.com/serverless/serverless/pull/6967)
- [Add variable completion report if variable progress was reported](https://github.com/serverless/serverless/pull/6966)
- [Update docs links](https://github.com/serverless/serverless/pull/6975)
- [Update documentation to include information about tags](https://github.com/serverless/serverless/pull/6982)
- [Python3.8 support!](https://github.com/serverless/serverless/pull/6978)
- [Updates to CI/CD settings for the beta](https://github.com/serverless/serverless/pull/6972)
- [rename output variables to outputs](https://github.com/serverless/serverless/pull/6971)
- [Fix Tencent Template and Readme](https://github.com/serverless/serverless/pull/6984)
- [Default to Nodejs12.x runtime](https://github.com/serverless/serverless/pull/6983)
- [#6162: Support multiple schemas, don't overwrite RequestModels for each](https://github.com/serverless/serverless/pull/6954)
- [Support empty deploymentPrefix](https://github.com/serverless/serverless/pull/6941)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.57.0...v1.58.0)

# 1.57.0 (2019-11-06)

- [Note about how to move services to new apps](https://github.com/serverless/serverless/pull/6912)
- [Allow casting to boolean in Serverless variables](https://github.com/serverless/serverless/pull/6869)
- [Create distinct target groups for different ALBs](https://github.com/serverless/serverless/pull/6383)
- [sls create --help improvements](https://github.com/serverless/serverless/pull/6919)
- [Fix race conditions handling in stats requests](https://github.com/serverless/serverless/pull/6920)
- [Update AWS Limits on Lambda@Edge](https://github.com/serverless/serverless/pull/6922)
- [Fixes bug with sns-cross-region definition using psuedo params](https://github.com/serverless/serverless/pull/6879)
- [Add tencent-plugins english version docs](https://github.com/serverless/serverless/pull/6916)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.56.1...v1.57.0)

# 1.56.1 (2019-10-31)

- [Fix deployment bucket policy handling with custom bucket ](https://github.com/serverless/serverless/pull/6909)
- [Feat: aws-nodejs-typescript template improvements](https://github.com/serverless/serverless/pull/6904)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.56.0...v1.56.1)

# 1.56.0 (2019-10-31)

- [AWS - deployment bucket policy for HTTPS only](https://github.com/serverless/serverless/pull/6823)
- [Docs on renamed outputs and expanded support](https://github.com/serverless/serverless/pull/6870)
- [Fix minor typo](https://github.com/serverless/serverless/pull/6877)
- [Added mock integration documentation example](https://github.com/serverless/serverless/pull/6883)
- [Fix region error handling in Lambda@Edge implementation](https://github.com/serverless/serverless/pull/6886)
- [Allow specifying ApiGateway logs role ARN](https://github.com/serverless/serverless/pull/6747)
- [Adds unused memory alert](https://github.com/serverless/serverless/pull/6889)
- [Find origin by domain name and path](https://github.com/serverless/serverless/pull/6880)
- [fix minor typo in kubeless docs](https://github.com/serverless/serverless/pull/6896)
- [Add tencent provider create-template](https://github.com/serverless/serverless/pull/6898)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.55.1...v1.56.0)

# 1.55.1 (2019-10-23)

- [Allow plugins to customize what flags are supported during interactive cli](https://github.com/serverless/serverless/pull/6697)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.55.0...v1.55.1)

# 1.55.0 (2019-10-23)

- [Allow empty arrays in overrides](https://github.com/serverless/serverless/pull/6813)
- [Make question mark available as variables fallback](https://github.com/serverless/serverless/pull/6808)
- [Improve plugins resolution and initialization flow](https://github.com/serverless/serverless/pull/6814)
- [Azure Python template](https://github.com/serverless/serverless/pull/6822)
- [Chore - stop using deprecated 'new Buffer()' method.](https://github.com/serverless/serverless/pull/6829)
- [AWS - adding naming function for S3 compiled template file name.](https://github.com/serverless/serverless/pull/6828)
- [Span docs! and full `serverless_sdk` docs](https://github.com/serverless/serverless/pull/6809)
- [Fix perms with several CloudWatch log subscriptions](https://github.com/serverless/serverless/pull/6827)
- [Fixing an Azure docs broken link](https://github.com/serverless/serverless/pull/6838)
- [Adding note to Azure nodejs template](https://github.com/serverless/serverless/pull/6839)
- [Updated Azure Functions documentation](https://github.com/serverless/serverless/pull/6840)
- [Support for NotAction and NotResource in IAM role statements](https://github.com/serverless/serverless/pull/6842)
- [added frontmatter to sdk docs](https://github.com/serverless/serverless/pull/6845)
- [Setup <tab> completion via CLI command and interactive CLI step](https://github.com/serverless/serverless/pull/6835)
- [Upgrade gradle version](https://github.com/serverless/serverless/pull/6855)
- [Update Google provider documentation for functions](https://github.com/serverless/serverless/pull/6854)
- [SNS integration tests](https://github.com/serverless/serverless/pull/6846)
- [SQS integration tests](https://github.com/serverless/serverless/pull/6847)
- [Streams integration tests](https://github.com/serverless/serverless/pull/6848)
- [Improvements on SQS docs as suggested on #6516](https://github.com/serverless/serverless/pull/6853)
- [Schedule integration tests](https://github.com/serverless/serverless/pull/6851)
- [Update event documentation](https://github.com/serverless/serverless/pull/6857)
- [Upgrade groovy/gradle/plugin versions and dependencies (aws-groovy-gradle)](https://github.com/serverless/serverless/pull/6862)
- [Upgrade gradle/plugins version and dependencies (aws-clojure-gradle)](https://github.com/serverless/serverless/pull/6861)
- [IoT integration tests](https://github.com/serverless/serverless/pull/6837)
- [Update https-proxy-agent dependency](https://github.com/serverless/serverless/pull/6866)
- [Allow to use Ref in stream arn property](https://github.com/serverless/serverless/pull/6856)
- [Add Tests for resolveFilePathsFromPatterns()](https://github.com/serverless/serverless/pull/6825)
- [Integration tests improvements and fixes](https://github.com/serverless/serverless/pull/6867)
- [Honor cfnRole in custom resources](https://github.com/serverless/serverless/pull/6871)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.54.0...v1.55.0)

# 1.54.0 (2019-10-09)

- [Fixing typos in variable names](https://github.com/serverless/serverless/pull/6746)
- [Simplify GitHub Issue / PR templates](https://github.com/serverless/serverless/pull/6753)
- [Capture and span docs](https://github.com/serverless/serverless/pull/6757)
- [Automate keeping the sfe-next branch upto date](https://github.com/serverless/serverless/pull/6743)
- [Update dependencies in aws-scala-sbt template](https://github.com/serverless/serverless/pull/6754)
- [PR Template --> Hide useful scripts in expandable section](https://github.com/serverless/serverless/pull/6763)
- [Doc refactoring and new features](https://github.com/serverless/serverless/pull/6758)
- [doc: add cosmosdb events doc](https://github.com/serverless/serverless/pull/6794)
- [Showcase how to use AWS SDK in sls helpers](https://github.com/serverless/serverless/pull/6788)
- [Issue 4867 - Allowing InvokeBridge to find handleRequest method from super classes](https://github.com/serverless/serverless/pull/6791)
- [Update Azure environment variable documentation](https://github.com/serverless/serverless/pull/6798)
- [Update quick-start.md](https://github.com/serverless/serverless/pull/6802)
- [Add Questions issue template that navigate users to forums](https://github.com/serverless/serverless/pull/6786)
- [Update SLS Deploy Documentation](https://github.com/serverless/serverless/pull/6790)
- [S3 Block Public Access](https://github.com/serverless/serverless/pull/6779)
- [Documentation for CI/CD](https://github.com/serverless/serverless/pull/6767)
- [Added logging Implementation for serverless openwhisk-nodejs template](https://github.com/serverless/serverless/pull/6806)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.53.0...v1.54.0)

# 1.53.0 (2019-09-25)

- [Respect logRetentionInDays in log group for websocket](https://github.com/serverless/serverless/pull/6658)
- [Remove requirement for an existing AWS profile on sls package command](https://github.com/serverless/serverless/pull/6564)
- [Adding docs on using captureError](https://github.com/serverless/serverless/pull/6670)
- [Make minor correction to CONTRIBUTING.md.](https://github.com/serverless/serverless/pull/6682)
- [[Docs] Added clarification on specifying SNS ARN](https://github.com/serverless/serverless/pull/6678)
- [Fix regular expression escaping in aws plugin.](https://github.com/serverless/serverless/pull/6689)
- [Update Azure quickstart and Azure Node.js project README](https://github.com/serverless/serverless/pull/6376)
- [Update Azure CLI Reference Docs](https://github.com/serverless/serverless/pull/6380)
- [Docs: update and clean up hello world app documentation](https://github.com/serverless/serverless/pull/6664)
- [Update Azure provider guide docs](https://github.com/serverless/serverless/pull/6403)
- [Update azure nodejs template](https://github.com/serverless/serverless/pull/6626)
- [Move common test utils to @serverless/test](https://github.com/serverless/serverless/pull/6660)
- [Add testing docs](https://github.com/serverless/serverless/pull/6696)
- [Add aliyun provider](https://github.com/serverless/serverless/pull/4922)
- [Update homepage in package.json to point to the docs](https://github.com/serverless/serverless/pull/6703)
- [Fix typo](https://github.com/serverless/serverless/pull/6712)
- [Truncated aliyun events menuText](https://github.com/serverless/serverless/pull/6708)
- [Added Components Versions](https://github.com/serverless/serverless/pull/6702)
- [Add commas when specifying Google roles for legibility](https://github.com/serverless/serverless/pull/6707)
- [Add Theodo to the consultants section of the README](https://github.com/serverless/serverless/pull/6713)
- [Remove incorrect AWS Access Role test instruction](https://github.com/serverless/serverless/pull/6686)
- [Feat: add qualifier option to invoke command](https://github.com/serverless/serverless/pull/6711)
- [Upgrade @serverless/test to v2](https://github.com/serverless/serverless/pull/6714)
- [Allow plugins not in registry to be installed](https://github.com/serverless/serverless/pull/6719)
- [PLAT-1599 Modularize interactive AWS setup](https://github.com/serverless/serverless/pull/6639)
- [Documented url+zip deploy strategy for serverless-kubeless](https://github.com/serverless/serverless/pull/6721)
- [Improve message for Windows users in AWS credentials setup](https://github.com/serverless/serverless/pull/6728)
- [Fix custom resources install](https://github.com/serverless/serverless/pull/6742)
- [Add support for MaximumBatchingWindowInSeconds property on stream events](https://github.com/serverless/serverless/pull/6741)
- [Alibaba Docs Update](https://github.com/serverless/serverless/pull/6744)
- [Update Jackson versions](https://github.com/serverless/serverless/pull/6748)
- [Improvements to stats handling](https://github.com/serverless/serverless/pull/6749)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.52.2...v1.53.0)

# 1.52.2 (2019-09-20)

- [Lock graceful-fs at 4.2.1](https://github.com/serverless/serverless/pull/6717)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.52.1...v1.52.2)

# 1.52.1 (2019-09-19)

- [Change how enterprise plugin async init is preformed](https://github.com/serverless/serverless/pull/6687)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.52.0...v1.52.1)

# 1.52.0 (2019-09-11)

- [Add initialize lifecycle event](https://github.com/serverless/serverless/pull/6601)
- [Fix API Gateway name not being resolved API Gateway Resource not in main stack](https://github.com/serverless/serverless/pull/6611)
- [Support optional CloudWatch logs writing for custom resource lambdas](https://github.com/serverless/serverless/pull/6608)
- [Ensure inquirer's chalk override works through symlinks](https://github.com/serverless/serverless/pull/6616)
- [Fixes aws partition name in apigateway resourceArn to support GovCloud](https://github.com/serverless/serverless/pull/6615)
- [Do not retry on AWS 403 errors](https://github.com/serverless/serverless/pull/6618)
- [Fix overriding package settings after packaging function](https://github.com/serverless/serverless/pull/6606)
- [null](https://github.com/serverless/serverless/pull/1)
- [Download templates from a Bitbucket Server](https://github.com/serverless/serverless/pull/6604)
- [Update Readme to replace SC5.io with nordcloud.com](https://github.com/serverless/serverless/pull/6622)
- [Add plugin hooks to define config variable getters](https://github.com/serverless/serverless/pull/6566)
- [Allow for tail on GetAtt parsing](https://github.com/serverless/serverless/pull/6624)
- [Resolve empty config object for an empty config file](https://github.com/serverless/serverless/pull/6631)
- [Remove enterprise from upgrade notes](https://github.com/serverless/serverless/pull/6625)
- [Add support for Lambda@Edge](https://github.com/serverless/serverless/pull/6512)
- [Tests for interactive CLI ](https://github.com/serverless/serverless/pull/6635)
- [Support functions without events in CloudFront remove logging](https://github.com/serverless/serverless/pull/6645)
- [Add support for Condition and DependsOn](https://github.com/serverless/serverless/pull/6642)
- [Improve plugin loading error reporting](https://github.com/serverless/serverless/pull/6646)
- [Use hooks to log Lambda@Edge removal reminder](https://github.com/serverless/serverless/pull/6652)
- [Quickfix "too many open files" issue on Windows](https://github.com/serverless/serverless/pull/6653)
- [Bump sfe plugin!](https://github.com/serverless/serverless/pull/6654)
- [replace use of tenant with org in docs & templates](https://github.com/serverless/serverless/pull/6655)
- [Update insights.md](https://github.com/serverless/serverless/pull/6663)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.51.0...v1.52.0)

# 1.51.0 (2019-08-28)

- [AWS API Gateway customize log level](https://github.com/serverless/serverless/pull/6542)
- [Fix retained layer logical id](https://github.com/serverless/serverless/pull/6545)
- [add docs for options misused in #6546](https://github.com/serverless/serverless/pull/6547)
- [Fix: Remove Bluebird promise warning when NODE_ENV=development](https://github.com/serverless/serverless/pull/6556)
- [AWS API Gateway set value of provider.logRetentionInDays for log group expiration](https://github.com/serverless/serverless/pull/6548)
- [Fix support for external websocketApiId](https://github.com/serverless/serverless/pull/6543)
- [Ensure AWS SDK is mocked for tests that call it](https://github.com/serverless/serverless/pull/6571)
- [do not log warnings on empty arrays](https://github.com/serverless/serverless/pull/6554)
- [API Gateway enable/disable access/execution logs](https://github.com/serverless/serverless/pull/6578)
- [Allow unresolved Rest API id with provider.tags setting](https://github.com/serverless/serverless/pull/6586)
- [Improve error reporting](https://github.com/serverless/serverless/pull/6585)
- [Fix exclusion of Yarn logs in Lambda packages](https://github.com/serverless/serverless/pull/6589)
- [Improve Rest API id resolution for SDK updates](https://github.com/serverless/serverless/pull/6587)
- [Fix ServerlessError handling](https://github.com/serverless/serverless/pull/6588)
- [Style updates for docs](https://github.com/serverless/serverless/pull/6596)
- [PLAT-1629 - Fix custom resource lambda naming](https://github.com/serverless/serverless/pull/6599)
- [Ensure API Gateway CloudWatch role is setup via custom resource](https://github.com/serverless/serverless/pull/6591)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.50.1...v1.51.0)

# 1.50.1 (2019-08-26)

- [add `interactiveCli:end lifecycle hook & bump dashboard plugin dep`](https://github.com/serverless/serverless/pull/6549)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.50.0...v1.50.1)

# 1.50.0 (2019-08-14)

- [Render event information in aws-ruby handler template](https://github.com/serverless/serverless/pull/6478)
- [Adding ap-south-1 to supported region list](https://github.com/serverless/serverless/pull/6473)
- [Fix invalid path char in GoLang packaging on Windows](https://github.com/serverless/serverless/pull/6484)
- [Multiple event definitions for existing S3 bucket](https://github.com/serverless/serverless/pull/6477)
- [Remove Enterprise and Platform from log info](https://github.com/serverless/serverless/pull/6501)
- [Allow AWS Subscription Filters to be reordered](https://github.com/serverless/serverless/pull/6471)
- [Check if more than 1 existing bucket is configured](https://github.com/serverless/serverless/pull/6506)
- [Multiple event definitions for existing Cognito User Pools](https://github.com/serverless/serverless/pull/6491)
- [Improve error handling](https://github.com/serverless/serverless/pull/6502)
- [Add PreTokenGeneration & UserMigration Cognito triggers](https://github.com/serverless/serverless/pull/6511)
- [Add Twilio Runtime to create templates](https://github.com/serverless/serverless/pull/6467)
- [Update kubeless guide docs](https://github.com/serverless/serverless/pull/6513)
- [Fix ImportValue handling in existing S3 buckets #6416](https://github.com/serverless/serverless/pull/6417)
- [Improve interactive AWS creds flow](https://github.com/serverless/serverless/pull/6449)
- [Retain existing Cognito User Pool config](https://github.com/serverless/serverless/pull/6519)
- [Switch integration tests runner from Jest to Mocha](https://github.com/serverless/serverless/pull/6517)
- [Change strategy for deciding to deploy new function.](https://github.com/serverless/serverless/pull/6520)
- [Fix support for EventBridge partner event sources](https://github.com/serverless/serverless/pull/6518)
- [fix(GITHUB-6525-5172): Rewrite copyDirContentsSyncAllow to call fs-extra::copySync() on the directories instead of calling it on the files to copy individually](https://github.com/serverless/serverless/pull/6526)
- [Do not crash CI on Coveralls error](https://github.com/serverless/serverless/pull/6535)
- [Only add merged IAM policies for Lambda when they will be used (#6262)](https://github.com/serverless/serverless/pull/6534)
- [Setup APIGW CloudWatch role via custom resource](https://github.com/serverless/serverless/pull/6531)
- [Fix deploy command if package.individually set on a function-level](https://github.com/serverless/serverless/pull/6537)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.49.0...v1.50.0)

# 1.49.0 (2019-07-30)

- [Remove hard coded partition when validating subscription filters](https://github.com/serverless/serverless/pull/6446)
- [Fix cross-account/cross-regions SNS subscriptions to topics with the same name](https://github.com/serverless/serverless/pull/6445)
- [Add EventBridge event source](https://github.com/serverless/serverless/pull/6397)
- [Update invoke-local.md documentation](https://github.com/serverless/serverless/pull/6466)
- [Doc new insights](https://github.com/serverless/serverless/pull/6469)
- [New error insight alert doc update to reflect per execution inspection](https://github.com/serverless/serverless/pull/6472)
- [Existing S3 bucket fixes](https://github.com/serverless/serverless/pull/6456)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.48.4...v1.49.0)

# 1.48.4 (2019-07-25)

- [Add note for supported version of existing bucket feature](https://github.com/serverless/serverless/pull/6435)
- [Support in interactive flow for SFE provided AWS creds](https://github.com/serverless/serverless/pull/6440)
- [Fix sls package regression caused by cred fail fast](https://github.com/serverless/serverless/pull/6447)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.48.3...v1.48.4)

# 1.48.3 (2019-07-23)

- [Issue 6364 request path](https://github.com/serverless/serverless/pull/6422)
- [Remove spaces from Cognito Pool Name](https://github.com/serverless/serverless/pull/6419)
- [Use slss.io for links](https://github.com/serverless/serverless/pull/6428)
- [Fix regression in EC2 & CodeBuild caused by missing creds check](https://github.com/serverless/serverless/pull/6427<Paste>)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.48.2...v1.48.3)

# 1.48.2 (2019-07-19)

- [Fix issues in post install and pre uninstall scripts](https://github.com/serverless/serverless/pull/6415)
-

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.48.1...v1.48.2)

# 1.48.1 (2019-07-19)

- [Use Python3 for Python in interactive setup](https://github.com/serverless/serverless/pull/6406)
- [Fixing broken link for Node install.](https://github.com/serverless/serverless/pull/6405)
- [Added Cloud Build option for serverless deploy guide](https://github.com/serverless/serverless/pull/6401)
- [Changed AWS subscription filters to use function object name](https://github.com/serverless/serverless/pull/6402)
- [Strip trailing comment when renaming a service](https://github.com/serverless/serverless/pull/6408)
- [Improve tracking reliability](https://github.com/serverless/serverless/pull/6410)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.48.0...v1.48.1)

# 1.48.0 (2019-07-18)

- [SFE plugin & sdk version info](https://github.com/serverless/serverless/pull/6344)
- [Allow optionally splitting SSM parameter value for StringList type](https://github.com/serverless/serverless/pull/6365)
- [Cross region SNS Trigger](https://github.com/serverless/serverless/pull/6366)
- [Fix typo](https://github.com/serverless/serverless/pull/6379)
- [Add SLS_NO_WARNINGS env var](https://github.com/serverless/serverless/pull/6345)
- [Fix async S3 test](https://github.com/serverless/serverless/pull/6385)
- [Fix AWS secret access key validation in interactive CLI](https://github.com/serverless/serverless/pull/6387)
- [Improve post install message](https://github.com/serverless/serverless/pull/6388)
- [PLAT-1385 Ensure expected service name in interactively created project](https://github.com/serverless/serverless/pull/6386)
- [Updated gradle and kotlin.js gradle plugin fixing #5598](https://github.com/serverless/serverless/pull/6372)
- [actually update the right aws creds link interactive setup aws](https://github.com/serverless/serverless/pull/6395)
- [Integrating Components](https://github.com/serverless/serverless/pull/6350)
- [Add support for existing Cognito User Pools](https://github.com/serverless/serverless/pull/6362)
- [Add the missing colon](https://github.com/serverless/serverless/pull/6398)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.47.0...v1.48.0)

# 1.47.0 (2019-07-10)

- [Add Onica as a Consultant](https://github.com/serverless/serverless/pull/6300)
- [Correct typo](https://github.com/serverless/serverless/pull/6301)
- [Adapt new ESLint and Prettier configuration](https://github.com/serverless/serverless/pull/6284)
- [Ensure deploy is triggered in CI](https://github.com/serverless/serverless/pull/6306)
- [Remove jsbeautify configuration](https://github.com/serverless/serverless/pull/6309)
- [Improve PR template](https://github.com/serverless/serverless/pull/6308)
- [Allow users to specify API Gateway Access Log format](https://github.com/serverless/serverless/pull/6299)
- [Fix service.provider.region resolution](https://github.com/serverless/serverless/pull/6317)
- [Add null as a consultant](https://github.com/serverless/serverless/pull/6323)
- [Update very minor typo in credentials.md](https://github.com/serverless/serverless/pull/6321)
- [Expose non-errors in informative way](https://github.com/serverless/serverless/pull/6318)
- [Fix async leaks detection conditional](https://github.com/serverless/serverless/pull/6319)
- [Typo fix in AWS ALB event documentation](https://github.com/serverless/serverless/pull/6325)
- [Websockets: fix passing log group ARN](https://github.com/serverless/serverless/pull/6310)
- [Specify invoke local option in the guide](https://github.com/serverless/serverless/pull/6327)
- [Update Webpack version and usage of aws-nodejs-ecma-script template](https://github.com/serverless/serverless/pull/6324)
- [Make ALB event target group names unique](https://github.com/serverless/serverless/pull/6322)
- [Improve Travis CI conf](https://github.com/serverless/serverless/pull/6330)
- [Support for Github Entreprise in sls create](https://github.com/serverless/serverless/pull/6332)
- [Merge patch 1.46.1 release artifacts back into master](https://github.com/serverless/serverless/pull/6343)
- [Add support for existing S3 buckets](https://github.com/serverless/serverless/pull/6290)
- [PLAT-1202 - Interactive `serverless` create](https://github.com/serverless/serverless/pull/6294)
- [PLAT-1091 - message in `npm i` output about the `serverless` quickstart command](https://github.com/serverless/serverless/pull/6238)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.46.1...v1.47.0)

# 1.46.1 (2019-06-28)

- [Fix service.provider.region resolution](https://github.com/serverless/serverless/pull/6317)
- [Ensure deploy is triggered in CI](https://github.com/serverless/serverless/pull/6306)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.46.0...v1.46.1)

# 1.46.0 (2019-06-26)

- [Fix formatting issue with Markdown link](https://github.com/serverless/serverless/pull/6228)
- [Update docs | dont use provider.tags with shared API Gateway](https://github.com/serverless/serverless/pull/6225)
- [Fix: Update azure template](https://github.com/serverless/serverless/pull/6258)
- [Improve user message](https://github.com/serverless/serverless/pull/6254)
- [Reference custom ApiGateway for models and request validators if conf…](https://github.com/serverless/serverless/pull/6231)
- [Ensure integration tests do not fail when run concurrently](https://github.com/serverless/serverless/pull/6256)
- [Improve integration test experience](https://github.com/serverless/serverless/pull/6253)
- [Fix lambda integration timeout response template](https://github.com/serverless/serverless/pull/6255)
- [Fix duplicate packaging issue](https://github.com/serverless/serverless/pull/6244)
- [Fix Travis configuration for branch/tag runs](https://github.com/serverless/serverless/pull/6265)
- [fixed a typo 🖊](https://github.com/serverless/serverless/pull/6275)
- [Fix #6267](https://github.com/serverless/serverless/pull/6268)
- [#6017 Allow to load plugin from path](https://github.com/serverless/serverless/pull/6261)
- [Added correction based on community feedback](https://github.com/serverless/serverless/pull/6286)
- [Remove package-lock.json and shrinkwrap scripts](https://github.com/serverless/serverless/pull/6280)
- [Remove README redundant link](https://github.com/serverless/serverless/pull/6288)
- [Remove default stage value in provider object](https://github.com/serverless/serverless/pull/6200)
- [Use naming to get stackName](https://github.com/serverless/serverless/pull/6285)
- [Fix typo in link to ALB docs](https://github.com/serverless/serverless/pull/6292)
- [Add ip, method, header and query conditions to ALB events](https://github.com/serverless/serverless/pull/6293)
- [Feature/support external websocket api](https://github.com/serverless/serverless/pull/6272)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.45.1...v1.46.0)

# 1.45.1 (2019-06-12)

- [Fix IAM policies setup for functions with custom name](https://github.com/serverless/serverless/pull/6240)
- [Fix Travis CI deploy config](https://github.com/serverless/serverless/pull/6234)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.45.0...v1.45.1)

# 1.45.0 (2019-06-12)

- [Add `--config` option](https://github.com/serverless/serverless/pull/6216)
- [Fix and improve ESlint config](https://github.com/serverless/serverless/pull/6188)
- [Tests: Fix mocha config](https://github.com/serverless/serverless/pull/6187)
- [Thorough integration testing](https://github.com/serverless/serverless/pull/6148)
- [Tests: Isolation improvements](https://github.com/serverless/serverless/pull/6186)
- [Add support for Websocket Logs](https://github.com/serverless/serverless/pull/6088)
- [Cleanup and improve Travis CI configuration](https://github.com/serverless/serverless/pull/6178)
- [Tests: Fix stub configuration](https://github.com/serverless/serverless/pull/6205)
- [Tests: Upgrade Sinon](https://github.com/serverless/serverless/pull/6206)
- [Add Application Load Balancer event source](https://github.com/serverless/serverless/pull/6073)
- [Do not run integration tests for PR's](https://github.com/serverless/serverless/pull/6207)
- [Adding a validation to validation.js script](https://github.com/serverless/serverless/pull/6192)
- [Tests: Upgrade dependencies, improve isolation and experience on Windows](https://github.com/serverless/serverless/pull/6208)
- [Add support for S3 hosted package artifacts](https://github.com/serverless/serverless/pull/6196)
- [Remove root README generator](https://github.com/serverless/serverless/pull/6215)
- [Myho/npm lint fix](https://github.com/serverless/serverless/pull/6217)
- [Use common prefix for log groups permissions at Lambdas' execution roles](https://github.com/serverless/serverless/pull/6212)
- [Update Scala version to 2.13.0 for aws-scala-sbt template](https://github.com/serverless/serverless/pull/6222)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.44.1...v1.45.0)

# 1.44.1 (2019-05-28)

- [Fix enterprise plugin lookup in global yarn installs](https://github.com/serverless/serverless/pull/6183)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.44.0...v1.44.1)

# 1.44.0 (2019-05-28)

- [Built in integration of Serverless Enterprise](https://github.com/serverless/serverless/pull/6074)
- [Setup Travis Windows support / Remove AppVeyor](https://github.com/serverless/serverless/pull/6132)
- [Update required Node.js version / Add version check](https://github.com/serverless/serverless/pull/6077)
- [Add scopes for cognito type APIGW referenced authorizer ](https://github.com/serverless/serverless/pull/6150)
- [Do not throw error if authorizer has empty claims](https://github.com/serverless/serverless/pull/6121)
- [Tests: Patch mocha bugs and fix broken async flow cases](https://github.com/serverless/serverless/pull/6157)
- [Fix tagging API Gateway stage fails if tag contains special characters like space](https://github.com/serverless/serverless/pull/6139)
- [Solve the problem of principal format in China region](https://github.com/serverless/serverless/pull/6127)
- [Upgrade mocha, switch from istanbul to nyc, improve tests configuration](https://github.com/serverless/serverless/pull/6169)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.43.0...v1.44.0)

# 1.43.0 (2019-05-20)

- [Update services.md](https://github.com/serverless/serverless/pull/6138)
- [Azure: exclude development dependency files when packaging functions](https://github.com/serverless/serverless/pull/6137)
- [Update release process docs and toolings](https://github.com/serverless/serverless/pull/6113)
- [Update AWS Node.js runtime to version 10](https://github.com/serverless/serverless/pull/6142)
- [Fix tests setup issues](https://github.com/serverless/serverless/pull/6147)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.42.3...v1.43.0)

# 1.42.3 (2019-05-14)

- [Update deploy.md](https://github.com/serverless/serverless/pull/6110)
- [Adding a more specific example of how to package individually](https://github.com/serverless/serverless/pull/6108)
- [Update Azure Functions Template](https://github.com/serverless/serverless/pull/6106)
- [Update cloudflare documentation](https://github.com/serverless/serverless/pull/6105)
- [Azure template update](https://github.com/serverless/serverless/pull/6122)
- [Remove not used module](https://github.com/serverless/serverless/pull/6095)
- [Support color output in tests](https://github.com/serverless/serverless/pull/6119)
- [Fix validation after API Gateway deployment](https://github.com/serverless/serverless/pull/6128)
- [Improve handling of custom API Gateway options](https://github.com/serverless/serverless/pull/6129)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.42.2...v1.42.3)

# 1.42.2 (2019-05-10)

- [Fix restApiId resolution in post CF deployment phase](https://github.com/serverless/serverless/pull/6111)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.42.1...v1.42.2)

# 1.42.1 (2019-05-09)

- [Fix bug with `cors: true`](https://github.com/serverless/serverless/pull/6104)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.42.0...v1.42.1)

# 1.42.0 (2019-05-09)

- [Update cors.md](https://github.com/serverless/serverless/pull/6027)
- [Add tags to AWS APIGateway Stage](https://github.com/serverless/serverless/pull/5851)
- [Remove safeguards when using API Gateway Stage resource settings](https://github.com/serverless/serverless/pull/6040)
- [Enable Setting Amazon API Gateway API Key Value](https://github.com/serverless/serverless/pull/5982)
- [Add more specific sub command error handling](https://github.com/serverless/serverless/pull/6038)
- [Use region pseudo parameter](https://github.com/serverless/serverless/pull/6026)
- [Add authorization scopes support for cognito user pool integration](https://github.com/serverless/serverless/pull/6000)
- [Merging v1.41.1 changes back into master](https://github.com/serverless/serverless/pull/6042)
- [Support wildcard in API Gateway cors domains](https://github.com/serverless/serverless/pull/6043)
- [Support setting both proxy and ca file for awsprovider AWS config agent](https://github.com/serverless/serverless/pull/5952)
- [Fix doc: How to update serverless](https://github.com/serverless/serverless/pull/6052)
- [Update event.md](https://github.com/serverless/serverless/pull/6061)
- [Allow Fn::Join in stream event arns](https://github.com/serverless/serverless/pull/6064)
- [Fix markup error with Authe1.42.0 (2019-05-09)ntication value](https://github.com/serverless/serverless/pull/6068)
- [Drop duplicate paragraph in aws/guide/credentials](https://github.com/serverless/serverless/pull/6075)
- [Improve integration test of aws-scala-sbt](https://github.com/serverless/serverless/pull/6079)
- [Highlight skipping of deployments](https://github.com/serverless/serverless/pull/6070)
- [Add support for API Gateway REST API Logs](https://github.com/serverless/serverless/pull/6057)
- [Implement logging with Log4j2 for aws-scala-sbt](https://github.com/serverless/serverless/pull/6078)
- [Update serverless.yml.md](https://github.com/serverless/serverless/pull/6085)
- [Fixed three small typos in doc](https://github.com/serverless/serverless/pull/6092)
- [fixed small errors in spotinst docs](https://github.com/serverless/serverless/pull/6093)
- [Add support for API Gateway Binary Media Types](https://github.com/serverless/serverless/pull/6063)
- [SDK based API Gateway Stage updates](https://github.com/serverless/serverless/pull/6084)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.41.1...v1.42.0)

# 1.41.1 (2019-04-23)

- [Remove safeguards when using API Gateway Stage resource settings](https://github.com/serverless/serverless/pull/6040)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.41.0...v1.41.1)

# 1.41.0 (2019-04-18)

- [Add error message when provider does not exist](https://github.com/serverless/serverless/pull/5964)
- [The code for removing comments is easy to read](https://github.com/serverless/serverless/pull/5973)
- [Added rust template for Cloudflare WASM](https://github.com/serverless/serverless/pull/5971)
- [Remove useless variable assignment](https://github.com/serverless/serverless/pull/5991)
- [Merge identical IF-branches](https://github.com/serverless/serverless/pull/5989)
- [eslint: Mark as root config](https://github.com/serverless/serverless/pull/5998)
- [#4750 Java invoke local support for handlers that implement RequestStreamHandler](https://github.com/serverless/serverless/pull/5954)
- [#5993: Ability to pass args for docker run command during invoke local docker](https://github.com/serverless/serverless/pull/5994)
- [Add additional Capability when Transform is detected](https://github.com/serverless/serverless/pull/5997)
- [#5990: Fix layer download caching during invoke local docker](https://github.com/serverless/serverless/pull/5992)
- [#5947: Ensure invoke local docker runs lambda with the dependencies](https://github.com/serverless/serverless/pull/5977)
- [Updating Node.js runtime version](https://github.com/serverless/serverless/pull/6011)
- [Make it easier on the eyes of serverless newcomers](https://github.com/serverless/serverless/pull/6013)
- [Allow specifying a retention policy for lambda layers](https://github.com/serverless/serverless/pull/6010)
- [Update quick-start.md](https://github.com/serverless/serverless/pull/6018)
- [Add AWS x-ray support for API Gateway](https://github.com/serverless/serverless/pull/5692)
- [Add support for multiple usage plans](https://github.com/serverless/serverless/pull/5970)
- [#5945: Invoke local docker to pass env vars to lambda container](https://github.com/serverless/serverless/pull/5988)
- [Update newsletter + enterprise link in readme](https://github.com/serverless/serverless/pull/6023)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.40.0...v1.41.0)

# 1.40.0 (2019-03-28)

- [Align error logging](https://github.com/serverless/serverless/pull/5937)
- [Fixing minor typo](https://github.com/serverless/serverless/pull/5943)
- [Documentation tweak around shared authorizers](https://github.com/serverless/serverless/pull/5944)
- [Support for asynchronous lambda invocation with integration type AWS](https://github.com/serverless/serverless/pull/5898)
- [Add unit tests for getLocalAccessKey function](https://github.com/serverless/serverless/pull/5948)
- [Document changes from #4951](https://github.com/serverless/serverless/pull/5949)
- [Added ability to create custom stack names and API names](https://github.com/serverless/serverless/pull/4951)
- [Fixes #5188 "Failed to fetch the event types list due the error: API …](https://github.com/serverless/serverless/pull/5335)
- [Allow \* in variable string literal defaults](https://github.com/serverless/serverless/pull/5640)
- [Add Serverless instanceId concept](https://github.com/serverless/serverless/pull/5926)
- [Doc: Include that APIGateway status code of async events](https://github.com/serverless/serverless/pull/5957)
- [Update npm dependencies](https://github.com/serverless/serverless/pull/5968)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.39.1...v1.40.0)

# 1.39.1 (2019-03-18)

- [Revert "Fixed #4188 - Package generating incorrect package artifact path in serverless-state.json"](https://github.com/serverless/serverless/pull/5936)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.39.0...v1.39.1)

# 1.39.0 (2019-03-15)

- [Add support for invoke local with docker](https://github.com/serverless/serverless/pull/5863)
- [fix regression with golang check on windows ](https://github.com/serverless/serverless/pull/5899)
- [Support for Cloudwatch Event InputTransformer](https://github.com/serverless/serverless/pull/5912)
- [Allow individual packaging with TypeScript source maps](https://github.com/serverless/serverless/pull/5743)
- [Support API Gateway stage deployment description](https://github.com/serverless/serverless/pull/5509)
- [Allow Fn::Join in SQS arn builder](https://github.com/serverless/serverless/pull/5351)
- [Add AWS x-ray support for Lambda](https://github.com/serverless/serverless/pull/5860)
- [Fix CloudFormation template normalization](https://github.com/serverless/serverless/pull/5885)
- [Fix bug when using websocket events with functions with custom roles](https://github.com/serverless/serverless/pull/5880)
- [Print customized function names correctly in sls info output](https://github.com/serverless/serverless/pull/5883)
- [Added websockets authorizer support](https://github.com/serverless/serverless/pull/5867)
- [Support more route characters for websockets](https://github.com/serverless/serverless/pull/5865)
- [kotlin jvm maven updates](https://github.com/serverless/serverless/pull/5872)
- [Put `Custom Response Headers` into `[Responses]`](https://github.com/serverless/serverless/pull/5862)
- [Packaging exclude only config file being used](https://github.com/serverless/serverless/pull/5840)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.38.0...v1.39.0)

# 1.38.0 (2019-02-20)

- [Set timout & others on context in python invoke local](https://github.com/serverless/serverless/pull/5796)
- [Append in Custom Syntax](https://github.com/serverless/serverless/pull/5799)
- [Don't load config for `config`](https://github.com/serverless/serverless/pull/5798)
- [Replace blocking fs.readFileSync with non blocking fs.readFile in checkForChanges.js](https://github.com/serverless/serverless/pull/5791)
- [Added layer option for deploy function update-config](https://github.com/serverless/serverless/pull/5787)
- [fix makeDeepVariable replacement](https://github.com/serverless/serverless/pull/5809)
- [Make local ruby pry work](https://github.com/serverless/serverless/pull/5718)
- [Replace \ with / in paths on windows before passing to nanomatch](https://github.com/serverless/serverless/pull/5808)
- [Support deploying GoLang to AWS from Windows!](https://github.com/serverless/serverless/pull/5813)
- [Fix windows go rework](https://github.com/serverless/serverless/pull/5816)
- [Make use of join operator first argument in sns docs](https://github.com/serverless/serverless/pull/5826)
- [add support for command type='container'](https://github.com/serverless/serverless/pull/5821)
- [Add Google Python function template](https://github.com/serverless/serverless/pull/5819)
- [Update config-credentials.md](https://github.com/serverless/serverless/pull/5827)
- [Update bucket conf to default AES256 encryption.](https://github.com/serverless/serverless/pull/5800)
- [Fix: override wildcard glob pattern (\*\*) in resolveFilePathsFromPatterns](https://github.com/serverless/serverless/pull/5825)
- [Indicate unused context in aws-nodejs-typescipt](https://github.com/serverless/serverless/pull/5832)
- [Add stack trace to aws/invokeLocal errors](https://github.com/serverless/serverless/pull/5835)
- [Missing underscore](https://github.com/serverless/serverless/pull/5836)
- [Updating cloudformation resource reference url](https://github.com/serverless/serverless/pull/5690)
- [Docs: Replacing "runtimes" with "templates"](https://github.com/serverless/serverless/pull/5843)
- [Add support for websockets event](https://github.com/serverless/serverless/pull/5824)
- [AWS: \${ssm} resolve vairbale as JSON if it is stored as JSON in Secrets Manager](https://github.com/serverless/serverless/pull/5842)
- [Fix service name in template install message](https://github.com/serverless/serverless/pull/5839)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.37.1...v1.38.0)

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
- [AWS: Fix \${cf.REGION} syntax causes deployment in wrong region](https://github.com/serverless/serverless/pull/5650)
- [support for @ symbol in \${file()} variables paths](https://github.com/serverless/serverless/pull/5312)
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
- [Extend \${cf} syntax to get output from another region](https://github.com/serverless/serverless/pull/5579)
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
- Expose plugin hooks (#2985)
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
- Added support for CloudFormation service roles (#3147)
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

- [Added IoT event source support](https://github.com/serverless/serverless/blob/master/docs/providers/aws/events/iot.md) (#2954)
- [Cognito user pool authorizer](https://serverless.com/framework/docs/providers/aws/events/apigateway/#http-endpoints-with-custom-authorizers) (#2141)
- Service installation with a name (#2616)

## Bug Fixes

- Fix VTL string escaping (#2993)
- Scheduled events are enabled by default (#2940)
- Update status code regex to match newlines (#2991)
- Add check for preexistent service directory (#3014)
- Deployment monitoring fixes (#2906)
- Credential handling fixes (#2820)
- Reduced policy statement size significantly (#2952)

## Meta

- [Github Milestone](https://github.com/serverless/serverless/milestone/20?closed=1)
- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.4.0...v1.5.0)

# 1.4.0 (2016-12-15)

## Features

- [Alexa event support](https://github.com/serverless/serverless/issues/2875) (#2875)
- [New C# service template](https://github.com/serverless/serverless/tree/master/docs/providers/aws/examples/hello-world/csharp) (#2858)
- [Local Invoke Improvements](https://github.com/serverless/serverless/pull/2865) (#2865)
- [Service wide metrics](https://github.com/serverless/serverless/blob/master/docs/providers/aws/cli-reference/metrics.md) (#2846)
- [Install service by pointing to a Github directory](https://github.com/serverless/serverless/issues/2721) (#2721)
- [Add support for stdin for invoke & invoke local](https://github.com/serverless/serverless/blob/master/docs/providers/aws/cli-reference/invoke.md#function-invocation-with-data-from-standard-input) (#2894)

## Bug Fixes

- Fixed exit code for failed function invocations (#2836)
- Stricter validation for custom IAM statements (#2132)
- Fixed bug in credentials setup (#2878)
- Removed unnecessary warnings during Serverless installation (#2811)
- Removed request and response config when using proxy integration (#2799)
- Internal refactoring

## Meta

- [Github Milestone](https://github.com/serverless/serverless/milestone/18?closed=1)
- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.3.0...v1.4.0)

# 1.3.0 (2016-12-02)

## Features

- [Metrics support](https://serverless.com/framework/docs/providers/aws/cli-reference/metrics/) (#1650)
- [AWS credential setup command](https://serverless.com/framework/docs/providers/aws/cli-reference/config/) (#2623)
- Lambda versioning on each deploy (#2676)

## Improvements

- Documentation improvements with `serverless.yml` file reference (#2703)
- Display info how to use SLS_DEBUG (#2690)
- Drop `event.json` file on service creation (#2786)
- Refactored test structure (#2464)
- Automatic test detection (#1337)

## Bug Fixes

- Add DependsOn for Lamda functions and IamPolicyLambdaExecution (#2743)
- Add JSON data parsing for invoke command (#2685)
- Internal refactoring

## Meta

- [Github Milestone](https://github.com/serverless/serverless/milestone/17?closed=1)
- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.2.1...v1.3.0)

# 1.2.0 (2016-11-22)

## Features

- [Lambda environment variables support](https://serverless.com/framework/docs/providers/aws/guide/functions#environment-variables) (#2748)
- [Load Serverless variables from javascript files](https://serverless.com/framework/docs/providers/aws/guide/variables#reference-variables-in-javascript-files) (#2495)
- [Add support for setting custom IAM roles for functions](https://serverless.com/framework/docs/providers/aws/guide/iam#custom-iam-roles-for-each-function) (#1807)
- Lambda environment variables support in Invoke Local (#2757)
- Tighter and secure permissions for event sources (#2023)

## Bug Fixes

- Fix `--noDeploy` flag to generate deployment files offline without needing internet connection (#2648)
- Bring back the `include` packaging feature with the help of globs (#2460)
- Internal refactoring

## Meta

- [Github Milestone](https://github.com/serverless/serverless/milestone/16?closed=1)
- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.1.0...v1.2.0)

# 1.1.0 (2016-11-02)

## Future breaking changes

We will include the LogGroup for your Lambda function in the CloudFormation template in the future. This will break deployments to existing applications because the log group was already created. You will get a warning about this if you deploy currently. We will force this behaviour in a future release, for now you can set it through the `cfLogs: true` parameter in your provider config. This change will also limit the logging rights to only this LogGroup, which should have no impact on your environment. You can read more in [our docs](https://serverless.com/framework/docs/providers/aws/guide/functions#log-group-resources).

## Features

- [Rollback Support](https://serverless.com/framework/docs/providers/aws/cli-reference/rollback/) (#2495)
- [Log Groups in Cloudformation](https://serverless.com/framework/docs/providers/aws/guide/functions#log-group-resources) (#2520)
- [Allow Services without functions](https://github.com/serverless/serverless/pull/2499) (#2499)
- [Clean up S3 Deployment bucket only after successful deployment](https://github.com/serverless/serverless/pull/2564) (#2564)
- [Allow Inclusion after Exclusion using ! Globs](https://serverless.com/framework/docs/providers/aws/guide/packaging/) (#2266)
- [Version Pinning for Serverless Services to only deploy with specified versions](https://serverless.com/framework/docs/providers/aws/guide/version/) (#2505)
- [Invoke local plugin](https://serverless.com/framework/docs/providers/aws/cli-reference/invoke/) (#2533)
- [Plugin template](https://serverless.com/framework/docs/providers/aws/cli-reference/create/) (#2581)
- [Simple Plugins are now installable in subfolder of the service](https://serverless.com/framework/docs/providers/aws/guide/plugins#service-local-plugin) (#2581)

## Bugs

- Fix variable syntax fallback if the file doesn't exist (#2565)
- Fix overwriting undefined variables (#2541)
- Fix CF deployment issue (#2576)
- Correctly package symlinks (#2266)

## Other

- [Large documentation refactoring](https://serverless.com/framework/docs/) (#2527)

## Meta

- [Github Milestone](https://github.com/serverless/serverless/milestone/15)
- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.0.3...v1.1.0)

# 1.0.3 (2016-10-21)

Following is a selection of features, bug fixes and other changes we did since 1.0.2.
You can also check out all changes in the [Github Compare View](https://github.com/serverless/serverless/compare/v1.0.2...v1.0.3)

## Features

- [Stack Tags and Policy](https://serverless.com/framework/docs/providers/aws/) (#2158)
- [CF Stack Output Variables in Verbose deploy output](https://serverless.com/framework/docs/cli-reference/deploy/) (#2253)
- [Custom Status code for non-proxy APIG integration](https://serverless.com/framework/docs/providers/aws/events/apigateway/) (#2014)
- [Function Runtime can now be configured per function](https://serverless.com/framework/docs/providers/aws/) (#2425)
- [Allow absolute path for invoke command event file](https://serverless.com/framework/docs/cli-reference/invoke/) (#2443)
- [Add list deployments command to show last deployments stored in S3 bucket](https://serverless.com/framework/docs/cli-reference/deploy/) (#2439)

## Bugs

- Fix not thrown error after failed ResourceStatus bug (#2367)
- Fix overwrite resources and custom resource merge bug (#2385)
- Clean up after deployment works correctly now (#2436)

## Other

- Migrate Integration tests into main repository (#2438)

# 1.0.2 (2016-10-13)

- Clean up NPM package (#2352)
- Clean up Stats functionality (#2345)

# 1.0.1 (2016-10-12)

Accidentally released 1.0.1 to NPM, so we have to skip this version (added here to remove confusion)

# 1.0.0 (2016-10-12)

## Breaking Changes

- The HTTP Event now uses the [recently released Lambda Proxy](http://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-set-up-simple-proxy.html#api-gateway-proxy-integration-types) by default. This requires you to change your handler result to fit the new proxy integration. You can also switch back to the old integration type.
- The Cloudformation Name of APIG paths that have a variable have changed, so if you have a variable in a path and redeploy CF will throw an error. To fix this remove the path and readd it a second deployment.

## Release Highlights

Following is a selection of the most important Features of the 1.0.0 since 1.0.0-rc.1.

You can see all features of 1.0.0-rc.1 in the [release blogpost](https://serverless.com/blog/serverless-v1-0-rc-1/)

### Documentation

- New documentation website https://serverless.com/framework/docs

### Events

- API Gateway Improvements
  - [Supporting API Gateway Lambda Proxy](https://serverless.com/framework/docs/providers/aws/events/apigateway/) (#2185)
  - [Support HTTP request parameters](https://serverless.com/framework/docs/providers/aws/events/apigateway/) (#2056)
- [S3 Event Rules](https://serverless.com/framework/docs/providers/aws/events/s3/) (#2068)
- [Built-in Stream Event support (Dynamo & Kinesis)](https://serverless.com/framework/docs/providers/aws/events/streams/) (#2250)

### Other

- [Configurable deployment bucket outside of CF stack](https://github.com/serverless/serverless/pull/2189) (#2189)
- [Install command to get services from Github](https://serverless.com/framework/docs/cli-reference/install/) (#2161)
- [Extended AWS credentials support](https://serverless.com/framework/docs/providers/aws/setup/) (#2229)
- [Extended the Serverless integration test suite](https://github.com/serverless/integration-test-suite)
