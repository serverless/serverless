'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');
const path = require('path');

module.exports = {
  configureStack() {
    this.serverless.service.provider
      .compiledCloudFormationTemplate = this.serverless.utils.readFileSync(
      path.join(this.serverless.config.serverlessPath,
        'plugins',
        'aws',
        'deploy',
        'lib',
        'core-cloudformation-template.json')
    );

    if (typeof this.serverless.service.provider.iamRoleARN !== 'string') {
      // merge in the iamRoleLambdaTemplate
      const iamRoleLambdaExecutionTemplate = this.serverless.utils.readFileSync(
        path.join(this.serverless.config.serverlessPath,
          'plugins',
          'aws',
          'deploy',
          'lib',
          'iam-role-lambda-execution-template.json')
      );

      _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
        iamRoleLambdaExecutionTemplate);

      // merge in the iamPolicyLambdaTemplate
      const iamPolicyLambdaExecutionTemplate = this.serverless.utils.readFileSync(
        path.join(this.serverless.config.serverlessPath,
          'plugins',
          'aws',
          'deploy',
          'lib',
          'iam-policy-lambda-execution-template.json')
      );

      // set the necessary variables for the IamPolicyLambda
      iamPolicyLambdaExecutionTemplate
        .IamPolicyLambdaExecution
        .Properties
        .PolicyName = `${this.options.stage}-${this.serverless.service.service}-lambda`;

      iamPolicyLambdaExecutionTemplate
        .IamPolicyLambdaExecution
        .Properties
        .PolicyDocument
        .Statement[0]
        .Resource = `arn:aws:logs:${this.options.region}:*:*`;

      _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
        iamPolicyLambdaExecutionTemplate);


      // add custom iam role statements
      if (this.serverless.service.provider.iamRoleStatements &&
        this.serverless.service.provider.iamRoleStatements instanceof Array) {
        this.serverless.service.provider.compiledCloudFormationTemplate
          .Resources
          .IamPolicyLambdaExecution
          .Properties
          .PolicyDocument
          .Statement = this.serverless.service.provider.compiledCloudFormationTemplate
          .Resources
          .IamPolicyLambdaExecution
          .Properties
          .PolicyDocument
          .Statement.concat(this.serverless.service.provider.iamRoleStatements);
      }
    }

    const bucketName = this.serverless.service.provider.deploymentBucket;

    if (bucketName) {
      return BbPromise.bind(this)
        .then(() => this.validateS3BucketName(bucketName))
        .then(() => this.aws.request('S3',
          'getBucketLocation',
          {
            Bucket: bucketName,
          },
          this.options.stage,
          this.options.region
        ))
        .then(result => {
          if (result.LocationConstraint !== this.options.region) {
            throw new this.serverless.classes.Error(
              'Deployment bucket is not in the same region as the lambda function'
            );
          }
          this.bucketName = bucketName;
          this.serverless.service.package.deploymentBucket = bucketName;
          this.serverless.service.provider.compiledCloudFormationTemplate
            .Outputs.ServerlessDeploymentBucketName.Value = bucketName;

          delete this.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.ServerlessDeploymentBucket;
        });
    }

    return BbPromise.resolve();
  },

};
