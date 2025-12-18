import { ServerlessError } from '@serverless/util'

class AwsCompileCapacityProviders {
  constructor(serverless, options) {
    this.serverless = serverless
    this.options = options
    this.provider = this.serverless.getProvider('aws')

    this.hooks = {
      'before:package:compileFunctions': () => this.compileCapacityProviders(),
    }
  }

  compileCapacityProviders() {
    this.serverless.service.getAllFunctions().forEach((functionName) => {
      const functionObject = this.serverless.service.getFunction(functionName)
      const cp = functionObject.capacityProvider

      if (cp === 'default' || (cp && cp.name === 'default')) {
        if (!this.serverless.service.provider.capacityProviders) {
          this.serverless.service.provider.capacityProviders = {}
        }
        if (!this.serverless.service.provider.capacityProviders.default) {
          this.serverless.service.provider.capacityProviders.default = {}
        }
      }
    })

    const { capacityProviders } = this.serverless.service.provider

    if (!capacityProviders) return

    Object.entries(capacityProviders).forEach(([name, config]) => {
      this.compileCapacityProvider(name, config || {})
    })
  }

  compileCapacityProvider(name, config) {
    const logicalId =
      this.provider.naming.getLambdaCapacityProviderLogicalId(name)
    const resource = {
      Type: 'AWS::Lambda::CapacityProvider',
      Properties: {
        CapacityProviderName:
          this.provider.naming.getLambdaCapacityProviderName(name),
      },
    }

    // CapacityProviderScalingConfig
    if (config.scaling) {
      const scalingConfig = {}

      if (config.scaling.maxVCpuCount != null) {
        scalingConfig.MaxVCpuCount = config.scaling.maxVCpuCount
      }

      if (
        Array.isArray(config.scaling.policies) &&
        config.scaling.policies.length
      ) {
        scalingConfig.ScalingPolicies = config.scaling.policies.map(
          (policy) => ({
            PredefinedMetricType: policy.predefinedMetricType,
            TargetValue: policy.targetValue,
          }),
        )
      }

      if (config.scaling.mode) {
        const mode = String(config.scaling.mode).toLowerCase()
        if (mode === 'auto') {
          scalingConfig.ScalingMode = 'Auto'
        } else if (mode === 'manual') {
          scalingConfig.ScalingMode = 'Manual'
          // Manual scaling mode requires at least one policy; validate early
          if (!scalingConfig.ScalingPolicies) {
            throw new ServerlessError(
              `Capacity provider "${name}": when scaling.mode is set to "manual", at least one scaling.policies entry is required.`,
              'LAMBDA_CAPACITY_PROVIDER_MANUAL_SCALING_REQUIRES_POLICIES',
              { stack: false },
            )
          }
        } else {
          scalingConfig.ScalingMode = config.scaling.mode
        }
      }

      if (Object.keys(scalingConfig).length) {
        resource.Properties.CapacityProviderScalingConfig = scalingConfig
      }
    }

    // InstanceRequirements – map config shape to CFN shape
    if (config.instanceRequirements) {
      const irConfig = config.instanceRequirements
      const instanceRequirements = {}

      const hasAllowed =
        Array.isArray(irConfig.allowedInstanceTypes) &&
        irConfig.allowedInstanceTypes.length
      const hasExcluded =
        Array.isArray(irConfig.excludedInstanceTypes) &&
        irConfig.excludedInstanceTypes.length
      // Start with any user-provided architectures
      let architectures =
        Array.isArray(irConfig.architectures) && irConfig.architectures.length
          ? irConfig.architectures
          : undefined

      // allowedInstanceTypes and excludedInstanceTypes cannot be used together
      if (hasAllowed && hasExcluded) {
        throw new ServerlessError(
          `Capacity provider "${name}": instanceRequirements.allowedInstanceTypes and instanceRequirements.excludedInstanceTypes cannot be set at the same time.`,
          'LAMBDA_CAPACITY_PROVIDER_INVALID_INSTANCE_REQUIREMENTS',
          { stack: false },
        )
      }

      // Lambda Managed Instances require an architecture when instance types are constrained.
      // If the user didn't provide architectures, fall back to the service-level architecture
      // or default to x86_64 (matching normal Lambda defaults).
      if ((hasAllowed || hasExcluded) && !architectures) {
        const providerArchitecture =
          this.serverless.service.provider.architecture
        const effectiveArchitecture = providerArchitecture || 'x86_64'
        architectures = [effectiveArchitecture]
      }

      if (hasAllowed) {
        instanceRequirements.AllowedInstanceTypes =
          irConfig.allowedInstanceTypes
      }

      if (hasExcluded) {
        instanceRequirements.ExcludedInstanceTypes =
          irConfig.excludedInstanceTypes
      }

      if (architectures && architectures.length) {
        instanceRequirements.Architectures = architectures
      }

      if (Object.keys(instanceRequirements).length) {
        resource.Properties.InstanceRequirements = instanceRequirements
      }
    }

    // If no InstanceRequirements were set but the provider has a non-default architecture,
    // we still need to set it so the capacity provider matches function architectures.
    if (
      !resource.Properties.InstanceRequirements &&
      this.serverless.service.provider.architecture &&
      this.serverless.service.provider.architecture !== 'x86_64'
    ) {
      resource.Properties.InstanceRequirements = {
        Architectures: [this.serverless.service.provider.architecture],
      }
    }

    // VpcConfig – explicit per-provider VPC overrides provider.vpc
    const vpc = config.vpc || this.serverless.service.provider.vpc
    if (
      vpc &&
      (Array.isArray(vpc.securityGroupIds)
        ? vpc.securityGroupIds.length
        : vpc.securityGroupIds && typeof vpc.securityGroupIds === 'object') &&
      (Array.isArray(vpc.subnetIds)
        ? vpc.subnetIds.length
        : vpc.subnetIds && typeof vpc.subnetIds === 'object')
    ) {
      resource.Properties.VpcConfig = {
        SecurityGroupIds: vpc.securityGroupIds,
        SubnetIds: vpc.subnetIds,
      }
    }

    // Lambda Capacity Providers always require a VpcConfig. Fail fast with a clear error
    // when neither provider.vpc nor capacityProviders[name].vpc provides a valid config.
    if (!resource.Properties.VpcConfig) {
      throw new ServerlessError(
        `Capacity provider "${name}": VPC configuration is required. Specify subnetIds and securityGroupIds on provider.vpc or provider.capacityProviders.${name}.vpc.`,
        'LAMBDA_CAPACITY_PROVIDER_MISSING_VPC',
        { stack: false },
      )
    }

    // KMS key (optional)
    if (config.kmsKeyArn) {
      resource.Properties.KmsKeyArn = config.kmsKeyArn
    }

    // PermissionsConfig / Operator role
    const operatorRoleArn =
      config.permissions && config.permissions.operatorRole

    if (operatorRoleArn) {
      resource.Properties.PermissionsConfig = {
        CapacityProviderOperatorRoleArn: operatorRoleArn,
      }
    } else {
      const roleLogicalId =
        this.provider.naming.getLambdaCapacityProviderOperatorRoleLogicalId()
      const roleResource = {
        Type: 'AWS::IAM::Role',
        Properties: {
          AssumeRolePolicyDocument: {
            Version: '2012-10-17',
            Statement: [
              {
                Effect: 'Allow',
                Principal: {
                  Service: 'lambda.amazonaws.com',
                },
                Action: 'sts:AssumeRole',
              },
            ],
          },
          ManagedPolicyArns: [
            'arn:aws:iam::aws:policy/AWSLambdaManagedEC2ResourceOperator',
          ],
        },
      }

      Object.assign(
        this.serverless.service.provider.compiledCloudFormationTemplate
          .Resources,
        {
          [roleLogicalId]: roleResource,
        },
      )

      resource.Properties.PermissionsConfig = {
        CapacityProviderOperatorRoleArn: {
          'Fn::GetAtt': [roleLogicalId, 'Arn'],
        },
      }
    }

    Object.assign(
      this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
      {
        [logicalId]: resource,
      },
    )
  }
}

export default AwsCompileCapacityProviders
