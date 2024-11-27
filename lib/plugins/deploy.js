import ServerlessError from '../serverless-error.js'
import cliCommandsSchema from '../cli/commands-schema.js'

class Deploy {
  constructor(serverless, options) {
    this.serverless = serverless
    this.options = options || {}
    this.commands = {
      deploy: {
        ...cliCommandsSchema.get('deploy'),
        commands: {
          function: {
            ...cliCommandsSchema.get('deploy function'),
          },
          list: {
            ...cliCommandsSchema.get('deploy list'),

            commands: {
              functions: {
                ...cliCommandsSchema.get('deploy list functions'),
              },
            },
          },
        },
      },
    }

    this.hooks = {
      'before:deploy:deploy': async () => {
        const provider = this.serverless.service.provider.name
        if (!this.serverless.getProvider(provider)) {
          const errorMessage = `The specified provider "${provider}" does not exist.`
          throw new ServerlessError(errorMessage, 'INVALID_PROVIDER')
        }

        if (!this.options.package && !this.serverless.service.package.path) {
          await this.serverless.pluginManager.spawn('package')
        }
      },
      'after:deploy:deploy': async () => {
        return true
      },
    }
  }
}

export default Deploy
