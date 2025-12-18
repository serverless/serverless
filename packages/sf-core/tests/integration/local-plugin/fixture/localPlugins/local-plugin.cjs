class MyPlugin {
  constructor(serverless) {
    this.serverless = serverless
    this.hooks = {
      initialize: () => {
        console.log('Init my local plugin')
      },
      'before:deploy:deploy': () => {
        console.log('Before deploy my local plugin')
      },
    }
    this.serverless.extendConfiguration(
      ['functions', 'function1', 'description'],
      '${localplugin:address}',
    )
    this.configurationVariablesSources = {
      localplugin: {
        resolve: async ({
          address,
          resolveConfigurationProperty,
          resolveVariable,
          options,
        }) => {
          if (!address) {
            throw new Error(
              'Missing address argument in "localplugin" resolver',
            )
          }
          return {
            value: `${address}-${options.region}-${await resolveConfigurationProperty(['service'])}-${await resolveVariable('sls:stage')}`,
          }
        },
      },
    }
  }
}

module.exports = MyPlugin
