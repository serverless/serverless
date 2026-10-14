import cliCommandsSchema from '../cli/commands-schema.js'

class Dev {
  constructor(serverless) {
    this.serverless = serverless

    this.commands = {
      dev: {
        ...cliCommandsSchema.get('dev'),
        commands: {
          setup: {
            ...cliCommandsSchema.get('dev setup'),
          },
          restore: {
            ...cliCommandsSchema.get('dev restore'),
          },
          status: {
            ...cliCommandsSchema.get('dev status'),
          },
          stop: {
            ...cliCommandsSchema.get('dev stop'),
          },
          wait: {
            ...cliCommandsSchema.get('dev wait'),
          },
          requests: {
            ...cliCommandsSchema.get('dev requests'),
          },
          replay: {
            ...cliCommandsSchema.get('dev replay'),
          },
        },
      },
    }
  }
}

export default Dev
