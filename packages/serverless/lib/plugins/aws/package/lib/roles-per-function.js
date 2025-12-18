import _ from 'lodash'
import util from 'util'
import path from 'path'
import { log } from '@serverless/util'
import applyPerFunctionPermissions from './roles-per-function-permissions.js'

const PLUGIN_NAME = 'serverless-iam-roles-per-function'

export default {
  handlePerFunctionRolesFinalizeHook() {
    const pm = this.serverless && this.serverless.pluginManager
    const plugins =
      (pm && pm.getPlugins ? pm.getPlugins() : pm && pm.plugins) || []
    const hasIamPerFunctionPlugin = plugins.some(
      (p) =>
        p &&
        p.constructor &&
        (p.constructor._serverlessExternalPluginName ===
          'serverless-iam-roles-per-function' ||
          p.constructor.name === 'ServerlessIamPerFunctionPlugin'),
    )
    if (!hasIamPerFunctionPlugin) {
      // Create per-function IAM roles after functions compiled, before finalize
      this.createRolesPerFunction()
    } else {
      // Inform users that the external plugin is no longer needed
      log.warning(
        [
          "serverless-iam-roles-per-function: This plugin's functionality is now built into the",
          'Framework. You can safely remove the plugin and use the',
          'new per-function IAM features documented here:',
          'https://www.serverless.com/framework/docs/providers/aws/guide/iam',
        ].join(' '),
      )
    }
  },
  _throwError(msg, ...args) {
    if (!_.isEmpty(args)) {
      msg = util.format(msg, args)
    }
    const errMsg = `ERROR: ${msg}`
    throw new this.serverless.classes.Error(errMsg)
  },

  _validateStatements(statements) {
    if (_.isEmpty(statements)) return
    let violationsFound
    if (!Array.isArray(statements)) {
      violationsFound = 'it is not an array'
    } else {
      const descriptions = statements.map((statement, i) => {
        const missing = [
          ['Effect'],
          ['Action', 'NotAction'],
          ['Resource', 'NotResource'],
        ].filter((props) => props.every((prop) => !statement[prop]))
        return missing.length === 0
          ? null
          : `statement ${i} is missing the following properties: ${missing
              .map((m) => m.join(' / '))
              .join(', ')}`
      })
      const flawed = descriptions.filter((curr) => curr)
      if (flawed.length) violationsFound = flawed.join('; ')
    }

    if (violationsFound) {
      const errorMessage = [
        'iamRoleStatements should be an array of objects,',
        ' where each object has Effect, Action / NotAction, Resource / NotResource fields.',
        ` Specifically, ${violationsFound}`,
      ].join('')
      this._throwError(errorMessage)
    }
  },

  _getIamRoleLambdaExecutionTemplate() {
    if (!this._iamRoleLambdaExecutionTemplate) {
      this._iamRoleLambdaExecutionTemplate = this.serverless.utils.readFileSync(
        path.join(
          this.serverless.config.serverlessPath,
          'plugins',
          'aws',
          'package',
          'lib',
          'iam-role-lambda-execution-template.json',
        ),
      )
    }
    return this._iamRoleLambdaExecutionTemplate
  },

  _buildBaseIamRoleFromProviderConfig(iamRoleConfig = {}) {
    const baseTemplate = _.cloneDeep(this._getIamRoleLambdaExecutionTemplate())
    baseTemplate.Properties.Path = this.provider.naming.getRolePath()
    baseTemplate.Properties.RoleName = this.provider.naming.getRoleName()
    baseTemplate.Properties.Policies[0].PolicyName =
      this.provider.naming.getPolicyName()

    if (iamRoleConfig.tags && typeof iamRoleConfig.tags === 'object') {
      baseTemplate.Properties.Tags = Object.keys(iamRoleConfig.tags).map(
        (key) => ({
          Key: key,
          Value: iamRoleConfig.tags[key],
        }),
      )
    }

    if (iamRoleConfig.permissionsBoundary) {
      baseTemplate.Properties.PermissionsBoundary =
        iamRoleConfig.permissionsBoundary
    } else if (iamRoleConfig.permissionBoundary) {
      // Backwards-compat alias for permissionsBoundary
      baseTemplate.Properties.PermissionsBoundary =
        iamRoleConfig.permissionBoundary
    } else if (this.serverless.service.provider.rolePermissionsBoundary) {
      // Service-level default boundary (matches merge-iam-templates.js)
      baseTemplate.Properties.PermissionsBoundary =
        this.serverless.service.provider.rolePermissionsBoundary
    }

    if (Array.isArray(iamRoleConfig.managedPolicies)) {
      baseTemplate.Properties.ManagedPolicyArns = [
        ...(baseTemplate.Properties.ManagedPolicyArns || []),
        ...iamRoleConfig.managedPolicies,
      ]
    } else {
      baseTemplate.Properties.ManagedPolicyArns =
        baseTemplate.Properties.ManagedPolicyArns || []
    }

    return baseTemplate
  },

  _getRoleNameLength(nameParts) {
    let length = 0
    for (const part of nameParts) {
      if (part.Ref) {
        if (part.Ref === 'AWS::Region') {
          length += this.serverless.service.provider.region.length
        } else {
          length += part.Ref.length
        }
      } else {
        length += String(part).length
      }
    }
    length += nameParts.length - 1
    return length
  },

  _getFunctionRoleName(functionName) {
    const roleName = this.provider.naming.getRoleName()
    const fnJoin = roleName['Fn::Join']
    if (
      !_.isArray(fnJoin) ||
      fnJoin.length !== 2 ||
      !_.isArray(fnJoin[1]) ||
      fnJoin[1].length < 2
    ) {
      this._throwError(
        'Global Role Name is not in expected format. Got name: ' +
          JSON.stringify(roleName),
      )
    }
    fnJoin[1].splice(2, 0, functionName)
    if (
      this._getRoleNameLength(fnJoin[1]) > 64 &&
      fnJoin[1][fnJoin[1].length - 1] === 'lambdaRole'
    ) {
      fnJoin[1].pop()
    }
    if (this._getRoleNameLength(fnJoin[1]) > 64) {
      this._throwError(
        `auto generated role name for function: ${functionName} is too long (over 64 chars).
        Try setting a custom role name using the property: iam.role.name`,
      )
    }
    return roleName
  },

  _updateFunctionResourceRole(functionName, roleName, globalRoleName) {
    const functionResourceName =
      this.provider.naming.getLambdaLogicalId(functionName)
    const functionResource =
      this.serverless.service.provider.compiledCloudFormationTemplate.Resources[
        functionResourceName
      ]

    if (
      _.isEmpty(functionResource) ||
      _.isEmpty(functionResource.Properties) ||
      _.isEmpty(functionResource.Properties.Role) ||
      !_.isArray(functionResource.Properties.Role['Fn::GetAtt'])
    ) {
      this._throwError(
        'Function Resource is not in expected format. For function name: ' +
          functionName,
      )
    }
    const currentDependsOn = Array.isArray(functionResource.DependsOn)
      ? functionResource.DependsOn
      : []
    functionResource.DependsOn = [roleName].concat(
      currentDependsOn.filter((val) => val !== globalRoleName),
    )
    functionResource.Properties.Role['Fn::GetAtt'][0] = roleName
    return functionResourceName
  },

  _createRoleForFunction(functionName, functionToRoleMap, options = {}) {
    const {
      baseIamRoleOverride,
      preserveManagedPolicies = false,
      forceRoleCreation = false,
      defaultInheritProviderStatements = false,
    } = options
    const functionObject = this.serverless.service.getFunction(functionName)
    const newShapeStatementsTop = _.get(functionObject, 'iam.role.statements')
    const hasLegacyStatements = functionObject.iamRoleStatements !== undefined
    const hasNewShapeStatements = newShapeStatementsTop !== undefined
    const functionManagedPolicies = _.get(
      functionObject,
      'iam.role.managedPolicies',
    )
    const hasFunctionManagedPolicies =
      Array.isArray(functionManagedPolicies) &&
      functionManagedPolicies.length > 0
    const hasCustomPerFunctionConfig =
      hasLegacyStatements || hasNewShapeStatements || hasFunctionManagedPolicies
    if (!hasCustomPerFunctionConfig && !forceRoleCreation) return
    if (functionObject.role) {
      if (hasCustomPerFunctionConfig) {
        this._throwError(
          "Defining function 'role' cannot be combined with per-function IAM settings ('iamRoleStatements', 'iam.role.statements', or 'iam.role.managedPolicies'). Function name: " +
            functionName,
        )
      }
      return
    }
    const effectiveStatementsForValidate = hasNewShapeStatements
      ? newShapeStatementsTop
      : functionObject.iamRoleStatements
    this._validateStatements(effectiveStatementsForValidate)

    const globalRoleName = this.provider.naming.getRoleLogicalId()
    const baseIamRole =
      baseIamRoleOverride ||
      this.serverless.service.provider.compiledCloudFormationTemplate.Resources[
        globalRoleName
      ]
    if (!baseIamRole) {
      this._throwError(
        'Global IAM Role resource is missing. Ensure IAM role compilation completed before assigning per-function roles.',
      )
    }
    const functionIamRole = _.cloneDeep(baseIamRole)

    const policyStatements = []
    functionIamRole.Properties.Policies[0].PolicyDocument.Statement =
      policyStatements

    let managedPolicyArns = functionIamRole.Properties.ManagedPolicyArns
    if (preserveManagedPolicies) {
      managedPolicyArns = Array.isArray(managedPolicyArns)
        ? [...managedPolicyArns]
        : []
    } else {
      managedPolicyArns = []
    }
    functionIamRole.Properties.ManagedPolicyArns = managedPolicyArns

    applyPerFunctionPermissions({
      functionName,
      functionObject,
      functionIamRole,
      policyStatements,
      serverless: this.serverless,
      provider: this.provider,
      throwError: (msg, ...args) => this._throwError(msg, ...args),
    })

    const customConfig = _.get(
      this.serverless.service,
      `custom.${PLUGIN_NAME}`,
      {},
    )
    const legacyDefaultInheritRaw = customConfig.defaultInherit
    const legacyDefaultInherit =
      legacyDefaultInheritRaw === undefined
        ? undefined
        : Boolean(legacyDefaultInheritRaw)

    let defaultInherit
    if (defaultInheritProviderStatements) {
      // Per-function mode: default to true if no legacy default configured,
      // otherwise respect the legacy default.
      defaultInherit =
        legacyDefaultInherit === undefined ? true : legacyDefaultInherit
    } else {
      // Shared mode: default to false unless legacy default is explicitly set.
      defaultInherit =
        legacyDefaultInherit === undefined ? false : legacyDefaultInherit
    }
    const newShapeInherit = _.get(functionObject, 'iam.inheritStatements')
    let isInherit
    if (newShapeInherit !== undefined) {
      // New structured flag takes precedence and can explicitly disable inheritance
      isInherit = newShapeInherit
    } else if (functionObject.iamRoleStatementsInherit !== undefined) {
      // Legacy plugin flag still respected when present
      isInherit = functionObject.iamRoleStatementsInherit
    } else {
      // Fallback to defaultInherit behaviour (legacy plugin and/or per-mode default)
      isInherit = defaultInherit
    }

    const providerIamRoleStatements = this.serverless.service.provider.iam
      ? this.serverless.service.provider.iam.role?.statements
      : this.serverless.service.provider.iamRoleStatements

    if (isInherit && !_.isEmpty(providerIamRoleStatements)) {
      for (const s of providerIamRoleStatements) policyStatements.push(s)
    }

    const newShapeStatementsLocal = _.get(functionObject, 'iam.role.statements')
    const effectiveStatements =
      newShapeStatementsLocal !== undefined
        ? newShapeStatementsLocal
        : functionObject.iamRoleStatements
    if (Array.isArray(effectiveStatements)) {
      for (const s of effectiveStatements) policyStatements.push(s)
    }

    const iamPermissionsBoundary =
      _.get(functionObject, 'iam.role.permissionsBoundary') ||
      functionObject.iamPermissionsBoundary
    const iamGlobalPermissionsBoundary =
      customConfig.iamGlobalPermissionsBoundary
    if (iamPermissionsBoundary || iamGlobalPermissionsBoundary) {
      functionIamRole.Properties.PermissionsBoundary =
        iamPermissionsBoundary || iamGlobalPermissionsBoundary
    }
    if (iamGlobalPermissionsBoundary) {
      baseIamRole.Properties.PermissionsBoundary = iamGlobalPermissionsBoundary
    }

    const explicitRoleName =
      _.get(functionObject, 'iam.role.name') ||
      functionObject.iamRoleStatementsName
    functionIamRole.Properties.RoleName =
      explicitRoleName || this._getFunctionRoleName(functionName)

    // Apply function-level role overrides: path, managed policies, tags
    const functionRolePath = _.get(functionObject, 'iam.role.path')
    if (functionRolePath) {
      functionIamRole.Properties.Path = functionRolePath
    }

    if (
      Array.isArray(functionManagedPolicies) &&
      functionManagedPolicies.length
    ) {
      functionIamRole.Properties.ManagedPolicyArns = (
        functionIamRole.Properties.ManagedPolicyArns || []
      ).concat(functionManagedPolicies)
    }

    const functionRoleTags = _.get(functionObject, 'iam.role.tags')
    if (functionRoleTags && typeof functionRoleTags === 'object') {
      const existingTagsArray = functionIamRole.Properties.Tags || []
      const existing = {}
      for (const t of existingTagsArray) {
        if (t && t.Key != null) existing[t.Key] = t.Value
      }
      const merged = { ...existing, ...functionRoleTags }
      functionIamRole.Properties.Tags = Object.entries(merged).map(
        ([Key, Value]) => ({ Key, Value }),
      )
    }

    const roleResourceName =
      this.provider.naming.getNormalizedFunctionName(functionName) +
      globalRoleName

    this.serverless.service.provider.compiledCloudFormationTemplate.Resources[
      roleResourceName
    ] = functionIamRole

    const functionResourceName = this._updateFunctionResourceRole(
      functionName,
      roleResourceName,
      globalRoleName,
    )
    functionToRoleMap.set(functionResourceName, roleResourceName)
  },

  _setEventSourceMappings(functionToRoleMap) {
    for (const mapping of _.values(
      this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
    )) {
      if (mapping.Type && mapping.Type === 'AWS::Lambda::EventSourceMapping') {
        const functionNameFn = _.get(
          mapping,
          'Properties.FunctionName.Fn::GetAtt',
        )
        if (!_.isArray(functionNameFn)) continue
        const functionName = functionNameFn[0]
        const roleName = functionToRoleMap.get(functionName)
        if (roleName) mapping.DependsOn = roleName
      }
    }
  },

  createRolesPerFunction() {
    const allFunctions = this.serverless.service.getAllFunctions()
    if (_.isEmpty(allFunctions)) return
    // Parity with core early-returns when provider role is external or explicitly set
    const iamConfig = this.serverless.service.provider.iam || {}
    const iamRole = _.get(iamConfig, 'role', {})
    const functionToRoleMap = new Map()
    const perFunctionIamRoleEnabled =
      _.isObject(iamRole) && iamRole.mode === 'perFunction'
    if (
      this.provider.isExistingRoleProvided &&
      this.provider.isExistingRoleProvided(iamRole)
    )
      return
    if (
      'role' in this.serverless.service.provider &&
      !perFunctionIamRoleEnabled
    )
      return
    if (perFunctionIamRoleEnabled) {
      const baseIamRole = this._buildBaseIamRoleFromProviderConfig(iamRole)
      for (const func of allFunctions) {
        this._createRoleForFunction(func, functionToRoleMap, {
          baseIamRoleOverride: baseIamRole,
          preserveManagedPolicies: true,
          // In per-function mode, default to inheriting provider statements,
          // but allow functions to opt out via iam.inheritStatements: false.
          defaultInheritProviderStatements: true,
          forceRoleCreation: true,
        })
      }
    } else {
      for (const func of allFunctions) {
        this._createRoleForFunction(func, functionToRoleMap)
      }
    }
    this._setEventSourceMappings(functionToRoleMap)
  },
}
