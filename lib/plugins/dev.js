import cliCommandsSchema from '../cli/commands-schema.js'

class Dev {
  constructor(serverless) {
    this.serverless = serverless

    this.commands = {
      dev: {
        ...cliCommandsSchema.get('dev'),
      },
    }
  }
}

export default Dev
