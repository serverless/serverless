import cliCommandsSchema from '../cli/commands-schema.js'

class Rollback {
  constructor(serverless) {
    this.serverless = serverless

    this.commands = {
      rollback: {
        ...cliCommandsSchema.get('rollback'),
        commands: {
          function: {
            ...cliCommandsSchema.get('rollback function'),
          },
        },
      },
    }
  }
}

export default Rollback
