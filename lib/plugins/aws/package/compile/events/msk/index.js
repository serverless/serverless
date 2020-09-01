'use strict';

class AwsCompileMSKEvents {
  constructor(serverless) {
    this.serverless = serverless;
    this.provider = this.serverless.getProvider('aws');

    this.hooks = {
      'package:compileEvents': this.compileMSKEvents.bind(this),
    };

    this.serverless.configSchemaHandler.defineFunctionEvent('aws', 'msk', {
      type: 'object',
      properties: {
        arn: {
          oneOf: [
            {
              type: 'string',
              pattern:
                '^arn:aws[a-zA-Z-]*:kafka:[a-z]{2}((-gov)|(-iso(b?)))?-[a-z]+-[1-9]{1}:[0-9]{12}:cluster',
            },
            { $ref: '#/definitions/awsCfImport' },
            { $ref: '#/definitions/awsCfRef' },
          ],
        },
        batchSize: {
          type: 'number',
          minimum: 1,
          maximum: 10000,
        },
        enabled: {
          type: 'boolean',
        },
        startingPosition: {
          type: 'string',
          enum: ['LATEST', 'TRIM_HORIZON'],
        },
        topic: {
          type: 'string',
        },
      },
      additionalProperties: false,
      required: ['arn', 'topic'],
    });
  }

  resolveDependsOn(funcRole) {
    let dependsOn = 'IamRoleLambdaExecution';

    if (funcRole) {
      if (
        // check whether the custom role is an ARN
        typeof funcRole === 'string' &&
        funcRole.indexOf(':') !== -1
      ) {
        dependsOn = [];
      } else if (
        // otherwise, check if we have an in-service reference to a role ARN
        typeof funcRole === 'object' &&
        'Fn::GetAtt' in funcRole &&
        Array.isArray(funcRole['Fn::GetAtt']) &&
        funcRole['Fn::GetAtt'].length === 2 &&
        typeof funcRole['Fn::GetAtt'][0] === 'string' &&
        typeof funcRole['Fn::GetAtt'][1] === 'string' &&
        funcRole['Fn::GetAtt'][1] === 'Arn'
      ) {
        dependsOn = funcRole['Fn::GetAtt'][0];
      } else if (
        // otherwise, check if we have an import or parameters ref
        typeof funcRole === 'object' &&
        ('Fn::ImportValue' in funcRole || 'Ref' in funcRole)
      ) {
        dependsOn = [];
      } else if (typeof funcRole === 'string') {
        dependsOn = funcRole;
      }
    }

    return dependsOn;
  }

  getMSKClusterName(eventSourceArn) {
    if (eventSourceArn['Fn::ImportValue']) {
      return eventSourceArn['Fn::ImportValue'];
    } else if (eventSourceArn.Ref) {
      return eventSourceArn.Ref;
    }

    return eventSourceArn.split('/')[1];
  }

  compileMSKEvents() {
    this.serverless.service.getAllFunctions().forEach(functionName => {
      const functionObj = this.serverless.service.getFunction(functionName);
      const cfTemplate = this.serverless.service.provider.compiledCloudFormationTemplate;

      if (functionObj.events) {
        // It is required to add the following statement in order to be able to connect to MSK cluster
        const ec2Statement = {
          Effect: 'Allow',
          Action: [
            'ec2:CreateNetworkInterface',
            'ec2:DescribeNetworkInterfaces',
            'ec2:DescribeVpcs',
            'ec2:DeleteNetworkInterface',
            'ec2:DescribeSubnets',
            'ec2:DescribeSecurityGroups',
          ],
          Resource: '*',
        };
        const mskStatement = {
          Effect: 'Allow',
          Action: ['kafka:DescribeCluster', 'kafka:GetBootstrapBrokers'],
          Resource: [],
        };

        functionObj.events.forEach(event => {
          if (event.msk) {
            const EventSourceArn = event.msk.arn;
            const Topic = event.msk.topic;
            const BatchSize = event.msk.batchSize || 100;
            const Enabled = event.msk.enabled != null ? event.msk.enabled : true;
            const StartingPosition = event.msk.startingPosition || 'TRIM_HORIZON';

            const mskClusterName = this.getMSKClusterName(EventSourceArn);
            const mskEventLogicalId = this.provider.naming.getMSKEventLogicalId(
              functionName,
              mskClusterName,
              Topic
            );

            const funcRole = functionObj.role || this.serverless.service.provider.role;
            const dependsOn = this.resolveDependsOn(funcRole);

            const lambdaLogicalId = this.provider.naming.getLambdaLogicalId(functionName);

            const mskResource = {
              Type: 'AWS::Lambda::EventSourceMapping',
              DependsOn: dependsOn,
              Properties: {
                BatchSize,
                EventSourceArn,
                FunctionName: {
                  'Fn::GetAtt': [lambdaLogicalId, 'Arn'],
                },
                StartingPosition,
                Enabled,
                Topics: [Topic],
              },
            };

            mskStatement.Resource.push(EventSourceArn);

            const newMSKObject = {
              [mskEventLogicalId]: mskResource,
            };

            Object.assign(cfTemplate.Resources, newMSKObject);
          }
        });

        if (cfTemplate.Resources.IamRoleLambdaExecution) {
          const statement =
            cfTemplate.Resources.IamRoleLambdaExecution.Properties.Policies[0].PolicyDocument
              .Statement;
          if (mskStatement.Resource.length) {
            statement.push(mskStatement);
            statement.push(ec2Statement);
          }
        }
      }
    });
  }
}

module.exports = AwsCompileMSKEvents;
