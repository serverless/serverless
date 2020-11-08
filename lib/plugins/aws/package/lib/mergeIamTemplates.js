'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');
const path = require('path');

module.exports = {
  mergeIamTemplates() {
    // resolve early if no functions are provided
    if (!this.serverless.service.getAllFunctions().length) {
      return BbPromise.resolve();
    }

    // create log group resources
    this.serverless.service
      .getAllFunctions()
      .filter(functionName => !this.serverless.service.getFunction(functionName).disableLogs)
      .forEach(functionName => {
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

    if (this.serverless.service.provider.rolePermissionsBoundary) {
      iamRoleLambdaExecutionTemplate.Properties.PermissionsBoundary = this.serverless.service.provider.rolePermissionsBoundary;
    }

    iamRoleLambdaExecutionTemplate.Properties.Policies[0].PolicyName = this.provider.naming.getPolicyName();
    //  RAUL: adding IAMCONFIG OBJECTS
    this.serverless.service.provider.iamConfig = {
      principals: new Set(),
      policyStatements: [],
      managedPolicies: [],
    };

    this.serverless.service.getAllFunctions().forEach(functionName => {
      const functionObject = this.serverless.service.getFunction(functionName);
      functionObject.iamConfig = {
        principals: new Set(),
        policyStatements: [],
        managedPolicies: [],
      };
    });

    // RAUL: will take this out

    _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, {
      [this.provider.naming.getRoleLogicalId()]: iamRoleLambdaExecutionTemplate,
    });

    // RAUL ********** THIS SECTION DEALS WITH IAM STATEMENTS NECESSARY FOR LOGS

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

      // RAUL: adding Logs resources to iamConfig:

      // RAUL: Take this out later
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
      // RAUL: ****END OF BOTH TAKE OUT
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

    // RAUL: ***** END OF SECTION DEALING WITH IAM STATEMETS FOR LOGS

    // RAUL: WILL PROBABLY START EDITING HERE

    if (this.serverless.service.provider.iamRoleStatements) {
      // add custom iam role statements
      this.serverless.service.provider.compiledCloudFormationTemplate.Resources[
        this.provider.naming.getRoleLogicalId()
      ].Properties.Policies[0].PolicyDocument.Statement = policyDocumentStatements.concat(
        this.serverless.service.provider.iamRoleStatements
      );
      // RAUL: add custom iam role statements to provider.iamConfig object
      this.serverless.service.provider.iamConfig.policyStatements = this.serverless.service.provider.iamConfig.policyStatements.concat(
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

    if (vpcConfigProvided.includes(true) || this.serverless.service.provider.vpc) {
      // add managed iam policy to allow ENI management

      // RAUL: Take this out later
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
        // END OF TAKE OUT
      ]);
    }

    return BbPromise.resolve();
  },

  mergeManagedPolicies(managedPolicies) {
    // RAUL: TAKE THIS OUT LATER
    const resource = this.serverless.service.provider.compiledCloudFormationTemplate.Resources[
      this.provider.naming.getRoleLogicalId()
    ].Properties;
    if (!Array.isArray(resource.ManagedPolicyArns)) {
      resource.ManagedPolicyArns = [];
    }
    resource.ManagedPolicyArns = resource.ManagedPolicyArns.concat(managedPolicies);
    // RAUL: END OF TAKE OUT
    this.serverless.service.provider.iamConfig.managedPolicies = this.serverless.service.provider.iamConfig.managedPolicies.concat(
      managedPolicies
    );
  },
};
