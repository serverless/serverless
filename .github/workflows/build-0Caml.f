When creating an API gateway method using the lambda proxy integration, the method isn't set to depend on the lambda permission in the CloudFormation code. When you first deploy the API, this isn't a problem, because the API can be deployed and the lambda permission created in parallel, and once they're both done the API works.

However, if you perform an update which replaces the lambda function, this is what happens:

New lambda function is created
New lambda permission is created
API gateway method is updated & API gateway deployment is created
Eventually, the API works. However during the update, users can receive errors from the API due to missing permissions. This is because step 2 & 3 above run in parallel, creating a race condition. The API gateway can be deployed before the Lambda permission has been created. Until the permission has been created, users will receive errors.

I think the fix for this should be fairly simple. The AWS::ApiGateway::Method resource in the CloudFormation stack needs a DependsOn attribute referencing the AWS::Lambda::Permission resource.

serverless.yml 
(for create)
serverless.yml 
(for update)
SLS_DEBUG=* 
serverless deploy output
Installed 
version

Framework Core:
2.43.1 
(local)
Plugin: 5.1.3
SDK: 4.2.2
Components: 3.10.1
