import path from 'path'
import _ from 'lodash'
import { log } from '@serverless/util'
import ServerlessError from '../../../../serverless-error.js'

export default {
  generateCoreTemplate() {
    this.serverless.service.provider.compiledCloudFormationTemplate =
      this.serverless.utils.readFileSync(
        path.join(
          this.serverless.config.serverlessPath,
          'plugins',
          'aws',
          'package',
          'lib',
          'core-cloudformation-template.json',
        ),
      )

    const userProvidedBucketName =
      this.serverless.service.provider.deploymentBucket

    const deploymentBucketObject =
      this.serverless.service.provider.deploymentBucketObject
    if (deploymentBucketObject && Object.keys(deploymentBucketObject).length) {
      const deploymentBucketLogicalId =
        this.provider.naming.getDeploymentBucketLogicalId()

      // resource tags support for deployment bucket
      if (
        deploymentBucketObject.tags &&
        Object.keys(deploymentBucketObject.tags).length
      ) {
        const tags = deploymentBucketObject.tags

        const bucketTags = Object.keys(tags).map((key) => ({
          Key: key,
          Value: tags[key],
        }))

        Object.assign(
          this.serverless.service.provider.compiledCloudFormationTemplate
            .Resources[deploymentBucketLogicalId].Properties,
          {
            Tags: bucketTags,
          },
        )
      }

      // enable S3 block public access for deployment bucket
      if (deploymentBucketObject.blockPublicAccess) {
        this.serverless.service.provider.compiledCloudFormationTemplate.Resources[
          deploymentBucketLogicalId
        ].Properties.PublicAccessBlockConfiguration = {
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true,
        }
      }

      // enable S3 bucket versioning
      if (deploymentBucketObject.versioning) {
        this.serverless.service.provider.compiledCloudFormationTemplate.Resources[
          deploymentBucketLogicalId
        ].Properties.VersioningConfiguration = {
          Status: 'Enabled',
        }
      }

      if (deploymentBucketObject.skipPolicySetup) {
        const deploymentBucketPolicyLogicalId =
          this.provider.naming.getDeploymentBucketPolicyLogicalId()
        delete this.serverless.service.provider.compiledCloudFormationTemplate
          .Resources[deploymentBucketPolicyLogicalId]
      }
    }

    const isS3TransferAccelerationSupported =
      this.provider.isS3TransferAccelerationSupported()
    const isS3TransferAccelerationEnabled =
      this.provider.isS3TransferAccelerationEnabled()
    const isS3TransferAccelerationDisabled =
      this.provider.isS3TransferAccelerationDisabled()

    if (isS3TransferAccelerationEnabled && isS3TransferAccelerationDisabled) {
      const errorMessage = [
        'You cannot enable and disable S3 Transfer Acceleration at the same time',
      ].join('')
      throw new ServerlessError(
        errorMessage,
        'S3_ACCELERATION_ENABLED_AND_DISABLED',
      )
    }

    if (userProvidedBucketName) {
      if (isS3TransferAccelerationEnabled) {
        throw new ServerlessError(
          'It is not possible to enable S3 Transfer Acceleration on an user provided bucket. In order to avoid this error, stop using `--aws-s3-accelerate` flag',
          'S3_TRANSFER_ACCELERATION_ON_EXISTING_BUCKET',
        )
      }
      this.bucketName = userProvidedBucketName
      this.serverless.service.package.deploymentBucket = userProvidedBucketName
      this.serverless.service.provider.compiledCloudFormationTemplate.Outputs.ServerlessDeploymentBucketName.Value =
        userProvidedBucketName

      // do not remove the bucket if it already exists in the stack
      if (!this.deploymentBucketInStack) {
        delete this.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ServerlessDeploymentBucket
        delete this.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ServerlessDeploymentBucketPolicy
      }
      return
    }

    if (this.globalDeploymentBucketUsed) {
      this.serverless.service.package.deploymentBucket = this.bucketName
      this.serverless.service.provider.compiledCloudFormationTemplate.Outputs.ServerlessDeploymentBucketName.Value =
        this.bucketName

      // do not remove the bucket if it already exists in the stack
      if (!this.deploymentBucketInStack) {
        delete this.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ServerlessDeploymentBucket
        delete this.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ServerlessDeploymentBucketPolicy
      }

      return
    }

    // Reference code storage with the legacy in-stack bucket: the bucket must
    // be versioned (Lambda pins exact object versions), and the Lambda
    // service principal needs read access via the bucket policy.
    if (this.provider.isReferenceCodeStorageMode()) {
      if (
        !deploymentBucketObject ||
        deploymentBucketObject.versioning !== true
      ) {
        throw new ServerlessError(
          '"codeStorageMode: reference" with the in-stack deployment bucket requires "deploymentBucket.versioning: true".',
          'REFERENCE_MODE_LEGACY_BUCKET_VERSIONING_REQUIRED',
        )
      }
      const deploymentBucketPolicyLogicalId =
        this.provider.naming.getDeploymentBucketPolicyLogicalId()
      const policyResource =
        this.serverless.service.provider.compiledCloudFormationTemplate
          .Resources[deploymentBucketPolicyLogicalId]
      if (policyResource) {
        policyResource.Properties.PolicyDocument.Statement.push({
          Sid: 'ServerlessLambdaSelfManagedCodeAccess',
          Effect: 'Allow',
          Principal: { Service: 'lambda.amazonaws.com' },
          Action: ['s3:GetObject', 's3:GetObjectVersion'],
          Resource: {
            'Fn::Join': [
              '',
              [
                'arn:aws:s3:::',
                { Ref: this.provider.naming.getDeploymentBucketLogicalId() },
                '/*',
              ],
            ],
          },
          Condition: {
            StringEquals: { 'aws:SourceAccount': { Ref: 'AWS::AccountId' } },
          },
        })
      } else {
        // skipPolicySetup removed the policy resource — the user owns it
        log.warning(
          '"codeStorageMode: reference" with "skipPolicySetup: true": make sure your deployment bucket policy grants the Lambda service principal s3:GetObject and s3:GetObjectVersion.',
        )
      }
    }

    if (isS3TransferAccelerationEnabled && isS3TransferAccelerationSupported) {
      // enable acceleration via CloudFormation
      Object.assign(
        this.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ServerlessDeploymentBucket.Properties,
        {
          AccelerateConfiguration: {
            AccelerationStatus: 'Enabled',
          },
        },
      )
      // keep track of acceleration status via CloudFormation Output
      this.serverless.service.provider.compiledCloudFormationTemplate.Outputs.ServerlessDeploymentBucketAccelerated =
        {
          Value: true,
        }
    } else if (
      isS3TransferAccelerationDisabled &&
      isS3TransferAccelerationSupported
    ) {
      // explicitly disable acceleration via CloudFormation
      Object.assign(
        this.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ServerlessDeploymentBucket.Properties,
        {
          AccelerateConfiguration: {
            AccelerationStatus: 'Suspended',
          },
        },
      )
    }

    const coreTemplateFileName = this.provider.naming.getCoreTemplateFileName()

    const coreTemplateFilePath = path.join(
      this.serverless.serviceDir,
      '.serverless',
      coreTemplateFileName,
    )

    this.serverless.utils.writeFileSync(
      coreTemplateFilePath,
      this.serverless.service.provider.compiledCloudFormationTemplate,
    )

    this.serverless.service.provider.coreCloudFormationTemplate = _.cloneDeep(
      this.serverless.service.provider.compiledCloudFormationTemplate,
    )
  },
}
