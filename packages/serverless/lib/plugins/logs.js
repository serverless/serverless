import cliCommandsSchema from '../cli/commands-schema.js'

class Logs {
  constructor(serverless) {
    this.serverless = serverless

    this.commands = {
      logs: {
        ...cliCommandsSchema.get('logs'),
      },
    }
  }
}

export default Logs
