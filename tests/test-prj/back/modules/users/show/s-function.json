{
  "name": "UsersShow",
  "envVars": [],
  "package": {
    "optimize": {
      "builder": "browserify",
      "minify": true,
      "ignore": [],
      "exclude": [
        "aws-sdk"
      ],
      "includePaths": []
    },
    "excludePatterns": []
  },
  "plugins": [],
  "cloudFormation": {
    "lambda": {
      "Function": {
        "Type": "AWS::Lambda::Function",
        "Properties": {
          "Runtime": "nodejs",
          "Handler": "modules/users/show/index.handler",
          "Role": {
            "Ref": "aaLambdaRoleArn"
          },
          "Code": {
            "S3Bucket": "",
            "S3Key": ""
          },
          "Timeout": 6,
          "MemorySize": 1024
        }
      }
    },
    "apiGateway": {
      "Endpoint": {
        "Type": "AWS::ApiGateway::Endpoint",
        "Path": "users",
        "Method": "GET",
        "AuthorizationType": "none",
        "ApiKeyRequired": false,
        "RequestTemplates": {
          "application/json": "{\"access_token\":\"$input.params('access_token')\",\"body\":\"$input.json('$')\"}"
        },
        "RequestParameters": {
          "integration.request.querystring.integrationQueryParam": "method.request.querystring.access_token"
        },
        "Responses": {
          "default": {
            "statusCode": "200",
            "responseParameters": {},
            "responseModels": {},
            "responseTemplates": {
              "application/json": ""
            }
          },
          "400": {
            "statusCode": "400"
          }
        }
      }
    }
  }
}