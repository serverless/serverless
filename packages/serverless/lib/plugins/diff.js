import cliCommandsSchema from '../cli/commands-schema.js'

class Diff {
  constructor(serverless) {
    this.serverless = serverless

    this.commands = {
      diff: {
        ...cliCommandsSchema.get('diff'),
      },
    }
  }
}

export default Diff
