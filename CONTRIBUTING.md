Pasted from Gitter, to be improved:
## Serverless Framework Testing Guide

Our team will test via an already provisioned Test Project on the Company’s AWS account. You do not need to make this test project locally, it already exists in the test project template that is included in the tests folder of Serverless. The project provisioned on the AWS account is titled:

s-test-prj

1. Copy these Environment Variables in your Serverless tests/.env file to use the Serverless Test AWS Account and Test Project. Don’t change their values:

TEST_SERVERLESS_EXE_CF=false  
TEST_SERVERLESS_EMAIL=yada@google.com  
TEST_SERVERLESS_REGION1=us-east-1  
TEST_SERVERLESS_REGION2=us-west-2  
TEST_SERVERLESS_STAGE1=development  
TEST_SERVERLESS_STAGE2=production  
TEST_SERVERLESS_LAMBDA_ROLE=ENTERARNHERE  
TEST_SERVERLESS_AWS_ACCESS_KEY=  
TEST_SERVERLESS_AWS_SECRET_KEY=  

Remember, leave TEST_SERVERLESS_EXE_CF set to false to develop more quickly. Set it to true when you are ready to use CloudFormation in your test.
At the end of running the tests, there should be only 1 Bucket in S3 and 1 Stack in CloudFormation (us-east-1 region). These are titled:
CloudFormation (us-east-1):   s-test-prj-development-r
S3 (us-east-1):                         serverless.useast1.s-test-prj.com

[To test the CloudFormation bits...] You'll also have to create a Lambda Role ARN. We do this by creating a project real quick, then copying the Role ARN from the AWS console

2. To ACTUALLY run the tests, do this at the root of the project:  
npm test
