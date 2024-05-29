'use strict'

module.exports = class CustomVariableSourcePlugin {
  constructor(serverless, options, utils) {
    this.serverless = serverless
    this.options = options
    this.utils = utils
    this.configurationVariablesSources = {
      other: {
        async resolve({ address }) {
          // `address` contains the name of the variable to resolve:
          // In `${foo:some-variable}`, address will contain `some-variable`.

          // Resolver is expected to return an object with the value in the `value` property:
          return {
            //
            value: `Resolving variable ${address}`,
          }
        },
      },
    }
  }
}
