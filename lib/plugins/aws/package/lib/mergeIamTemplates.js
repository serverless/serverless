'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');
const path = require('path');

module.exports = {
  mergeIamTemplates() {
    this.validateStatements(this.serverless.service.provider.iamRoleStatements);
    this.validateManagedPolicies(this.serverless.service.provider.iamManagedPolicies);
    return this.merge();
  },

  merge() {
    // resolve early if no functions are provided
    if (!this.serverless.service.getAllFunctions().length) {
      return BbPromise.resolve();
    }

    // create log group resources
    this.serverless.service.getAllFunctions().forEach(functionName => {
      const functionObject = this.serverless.service.getFunction(functionName);
      const logGroupLogicalId = this.provider.naming.getLogGroupLogicalId(functionName);
      const newLogGroup = {
        [logGroupLogicalId]: {
          Type: 'AWS::Logs::LogGroup',
          Properties: {
            LogGroupName: this.provider.naming.getLogGroupName(functionObject.name),
          },
        },
      };

      const logRetentionInDays = this.provider.getLogRetentionInDays();
      if (logRetentionInDays) {
        newLogGroup[logGroupLogicalId].Properties.RetentionInDays = logRetentionInDays;
      }

      _.merge(
        this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
        newLogGroup
      );
    });

    // resolve early if provider level role is provided
    if ('role' in this.serverless.service.provider) {
      return BbPromise.resolve();
    }

    // resolve early if all functions contain a custom role
    const customRolesProvided = [];
    this.serverless.service.getAllFunctions().forEach(functionName => {
      const functionObject = this.serverless.service.getFunction(functionName);
      customRolesProvided.push('role' in functionObject);
    });
    if (_.isEqual(_.uniq(customRolesProvided), [true])) {
      return BbPromise.resolve();
    }

    // merge in the iamRoleLambdaTemplate
    const iamRoleLambdaExecutionTemplate = this.serverless.utils.readFileSync(
      path.join(
        this.serverless.config.serverlessPath,
        'plugins',
        'aws',
        'package',
        'lib',
        'iam-role-lambda-execution-template.json'
      )
    );
    iamRoleLambdaExecutionTemplate.Properties.Path = this.provider.naming.getRolePath();
    iamRoleLambdaExecutionTemplate.Properties.RoleName = this.provider.naming.getRoleName();
    iamRoleLambdaExecutionTemplate.Properties.Policies[0].PolicyName = this.provider.naming.getPolicyName();

    _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, {
      [this.provider.naming.getRoleLogicalId()]: iamRoleLambdaExecutionTemplate,
    });

    const canonicalFunctionNamePrefix = `${
      this.provider.serverless.service.service
    }-${this.provider.getStage()}`;
    const logGroupsPrefix = this.provider.naming.getLogGroupName(canonicalFunctionNamePrefix);

    const policyDocumentStatements = this.serverless.service.provider.compiledCloudFormationTemplate
      .Resources[this.provider.naming.getRoleLogicalId()].Properties.Policies[0].PolicyDocument
      .Statement;

    let hasOneOrMoreCanonicallyNamedFunctions = false;

    // Ensure policies for functions with custom name resolution
    this.serverless.service.getAllFunctions().forEach(functionName => {
      const { name: resolvedFunctionName } = this.serverless.service.getFunction(functionName);
      if (!resolvedFunctionName || resolvedFunctionName.startsWith(canonicalFunctionNamePrefix)) {
        hasOneOrMoreCanonicallyNamedFunctions = true;
        return;
      }

      const customFunctionNamelogGroupsPrefix = this.provider.naming.getLogGroupName(
        resolvedFunctionName
      );

      policyDocumentStatements[0].Resource.push({
        'Fn::Sub':
          'arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}' +
          `:log-group:${customFunctionNamelogGroupsPrefix}:*`,
      });

      policyDocumentStatements[1].Resource.push({
        'Fn::Sub':
          'arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}' +
          `:log-group:${customFunctionNamelogGroupsPrefix}:*:*`,
      });
    });

    if (hasOneOrMoreCanonicallyNamedFunctions) {
      // Ensure general policies for functions with default name resolution
      policyDocumentStatements[0].Resource.push({
        'Fn::Sub':
          'arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}' +
          `:log-group:${logGroupsPrefix}*:*`,
      });

      policyDocumentStatements[1].Resource.push({
        'Fn::Sub':
          'arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}' +
          `:log-group:${logGroupsPrefix}*:*:*`,
      });
    }

    if (this.serverless.service.provider.iamRoleStatements) {
      // add custom iam role statements
      this.serverless.service.provider.compiledCloudFormationTemplate.Resources[
        this.provider.naming.getRoleLogicalId()
      ].Properties.Policies[0].PolicyDocument.Statement = policyDocumentStatements.concat(
        this.serverless.service.provider.iamRoleStatements
      );
    }

    if (this.serverless.service.provider.iamManagedPolicies) {
      // add iam managed policies
      const iamManagedPolicies = this.serverless.service.provider.iamManagedPolicies;
      if (iamManagedPolicies.length > 0) {
        this.mergeManagedPolicies(iamManagedPolicies);
      }
    }

    // check if one of the functions contains vpc configuration
    const vpcConfigProvided = [];
    this.serverless.service.getAllFunctions().forEach(functionName => {
      const functionObject = this.serverless.service.getFunction(functionName);
      if ('vpc' in functionObject) {
        vpcConfigProvided.push(true);
      }
    });

    if (_.includes(vpcConfigProvided, true) || this.serverless.service.provider.vpc) {
      // add managed iam policy to allow ENI management
      this.mergeManagedPolicies([
        {
          'Fn::Join': [
            '',
            [
              'arn:',
              { Ref: 'AWS::Partition' },
              ':iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole',
            ],
          ],
        },
      ]);
    }

    return BbPromise.resolve();
  },

  mergeManagedPolicies(managedPolicies) {
    const resource = this.serverless.service.provider.compiledCloudFormationTemplate.Resources[
      this.provider.naming.getRoleLogicalId()
    ].Properties;
    if (!_.has(resource, 'ManagedPolicyArns') || _.isEmpty(resource.ManagedPolicyArns)) {
      resource.ManagedPolicyArns = [];
    }
    resource.ManagedPolicyArns = resource.ManagedPolicyArns.concat(managedPolicies);
  },

  validateStatements(statements) {
    // Verify that iamRoleStatements (if present) is an array of { Effect: ...,
    // Action: ..., Resource: ... } objects.
    if (!statements) {
      return;
    }
    let violationsFound;
    if (!(statements instanceof Array)) {
      violationsFound = 'it is not an array';
    } else {
      const descriptions = statements.map((statement, i) => {
        const missing = [['Effect'], ['Action', 'NotAction'], ['Resource', 'NotResource']].filter(
          props => props.every(prop => statement[prop] === undefined)
        );
        return missing.length === 0
          ? null
          : `statement ${i} is missing the following properties: ${missing
              .map(m => m.join(' / '))
              .join(', ')}`;
      });
      const flawed = descriptions.filter(curr => curr);
      if (flawed.length) {
        violationsFound = flawed.join('; ');
      }
    }

    if (violationsFound) {
      const errorMessage = [
        'iamRoleStatements should be an array of objects,',
        ' where each object has Effect, Action / NotAction, Resource / NotResource fields.',
        ` Specifically, ${violationsFound}`,
      ].join('');
      throw new this.serverless.classes.Error(errorMessage);
    }
  },

  validateManagedPolicies(iamManagedPolicies) {
    // Verify that iamManagedPolicies (if present) is an array
    if (!iamManagedPolicies) {
      return;
    }
    if (!_.isArray(iamManagedPolicies)) {
      throw new this.serverless.classes.Error('iamManagedPolicies should be an array of arns');
    }
  },
};
