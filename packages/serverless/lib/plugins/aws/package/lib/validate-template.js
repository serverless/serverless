// Improve error reporting for Framework specific functionalities

import ServerlessError from '../../../../serverless-error.js'
import { CUSTOMER_MANAGED_RUNTIME } from '../../lib/customer-managed-runtime.js'

export default {
  validateTemplate() {
    this.validateCustomerManagedRuntimeConfig()
  },

  /**
   * A function with `Runtime: custom` needs RuntimeConfig. The compiler adds it
   * for an alias ARN or intrinsic in `runtime`; a literal `runtime: custom` can
   * get it from `resources` (extensions or an override) or from a plugin, so
   * the check runs on the merged template.
   */
  validateCustomerManagedRuntimeConfig() {
    const service = this.serverless.service
    const resources =
      service.provider.compiledCloudFormationTemplate?.Resources ?? {}
    for (const functionName of service.getAllFunctions()) {
      const resource =
        resources[this.provider.naming.getLambdaLogicalId(functionName)]
      if (
        resource?.Type !== 'AWS::Lambda::Function' ||
        resource.Properties?.Runtime !== CUSTOMER_MANAGED_RUNTIME ||
        resource.Properties.RuntimeConfig
      ) {
        continue
      }
      throw new ServerlessError(
        `"runtime" of function "${functionName}" names a customer-managed runtime without its alias. Use the runtime alias ARN, for example arn:aws:lambda:us-east-1:123456789012:runtime/companyphp8/alias/prod, or a CloudFormation intrinsic that returns one. To pin a runtime version, add runtimeManagement: { mode: manual, arn: <runtime version ARN> }.`,
        'LAMBDA_CUSTOMER_MANAGED_RUNTIME_INVALID_ARN',
        { stack: false },
      )
    }
  },
}
