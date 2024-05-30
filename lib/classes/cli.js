import utils from '@serverlessinc/sf-core/src/utils.js'

const { log } = utils
const legacyPluginLog = log.get('sls:cli:plugin-legacy-log')

class CLI {
  constructor(serverless) {
    this.serverless = serverless
    this.loadedPlugins = []
    this.loadedCommands = {}
  }

  setLoadedPlugins(plugins) {
    this.loadedPlugins = plugins
  }

  setLoadedCommands(commands) {
    this.loadedCommands = commands
  }

  printDot() {
    process.stderr.write('.')
  }

  log(message, entity, opts) {
    legacyPluginLog.notice(entity ? `${entity}: ${message}` : message)
  }

  consoleLog(message) {
    legacyPluginLog.notice(message)
  }
}

export default CLI
