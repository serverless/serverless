import cliCommandsSchema from '../cli/commands-schema.js'

class Metrics {
  constructor(serverless, options) {
    this.serverless = serverless
    this.options = options

    this.commands = {
      metrics: {
        ...cliCommandsSchema.get('metrics'),
      },
    }
  }
}

export default Metrics
