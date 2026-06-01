import cliCommandsSchema from '../cli/commands-schema.js'
import offlineSchema from './aws/offline/lib/schema.js'

class Offline {
  constructor(serverless) {
    this.serverless = serverless

    // Register the top-level `offline:` schema from the always-loaded shell so a
    // top-level `offline:` block validates even when the community
    // `serverless-offline` plugin owns the command (mid-migration). The AWS
    // implementation no longer registers it, so this runs exactly once.
    serverless?.configSchemaHandler?.defineTopLevelProperty?.(
      'offline',
      offlineSchema,
    )

    this.commands = {
      offline: {
        ...cliCommandsSchema.get('offline'),
      },
    }
  }
}

export default Offline
