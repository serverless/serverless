import cliCommandsSchema from '../cli/commands-schema.js'

class Offline {
  constructor(serverless) {
    this.serverless = serverless

    this.commands = {
      offline: {
        ...cliCommandsSchema.get('offline'),
      },
    }
  }
}

export default Offline
