import cliCommandsSchema from '../cli/commands-schema.js'

class Info {
  constructor(serverless) {
    this.serverless = serverless

    this.commands = {
      info: {
        ...cliCommandsSchema.get('info'),
      },
    }
  }
}

export default Info
