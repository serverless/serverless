import Globals from './globals.js'
import DomainConfig from './models/domain-config.js'

export default class Logging {
  static cliLog(prefix, message) {
    Globals.serverless.cli.log(`${prefix} ${message}`, Globals.pluginName)
  }

  /**
   * Formats basePath for display in CLI, hiding the default "(none)" value
   * @param {string} basePath
   * @returns {string} Formatted basePath for display
   */
  static formatBasePathForDisplay(basePath) {
    if (!basePath || basePath === Globals.defaultBasePath) {
      return '(root)'
    }
    return basePath
  }

  /**
   * Logs error message
   * @param {string} message
   */
  static logError(message) {
    if (Globals.v3Utils) {
      Globals.v3Utils.log.error(message)
    } else {
      Logging.cliLog('[Error]', message)
    }
  }

  /**
   * Logs info message
   * @param {string} message
   */
  static logInfo(message) {
    if (Globals.v3Utils) {
      Globals.v3Utils.log.verbose(message)
    } else {
      Logging.cliLog('[Info]', message)
    }
  }

  /**
   * Logs warning message
   * @param {string} message
   */
  static logWarning(message) {
    if (Globals.v3Utils) {
      Globals.v3Utils.log.warning(message)
    } else {
      Logging.cliLog('[WARNING]', message)
    }
  }

  /**
   * Prints out a summary of all domain manager related info
   * @param {Array} domains
   */
  static printDomainSummary(domains) {
    // Filter domains that have domainInfo
    const validDomains = domains.filter((domain) => domain.domainInfo)

    if (validDomains.length === 0) {
      return
    }

    const summaryList = []

    if (validDomains.length === 1) {
      // Single domain - properties directly under section
      const domain = validDomains[0]
      let domainLine = `name: ${domain.givenDomainName}`
      if (domain.basePath && domain.basePath !== Globals.defaultBasePath) {
        // Normalize basePath: remove leading/trailing slashes, add trailing slash
        let normalizedBasePath = domain.basePath.replace(/^\/+|\/+$/g, '')
        if (normalizedBasePath) {
          domainLine += `/${normalizedBasePath}/`
        }
      }
      summaryList.push(domainLine)
      summaryList.push(`target: ${domain.domainInfo.domainName}`)
      summaryList.push(`zone id: ${domain.domainInfo.hostedZoneId}`)
    } else {
      // Multiple domains - use list format
      validDomains.forEach((domain) => {
        let domainLine = `- name: ${domain.givenDomainName}`
        if (domain.basePath && domain.basePath !== Globals.defaultBasePath) {
          // Normalize basePath: remove leading/trailing slashes, add trailing slash
          let normalizedBasePath = domain.basePath.replace(/^\/+|\/+$/g, '')
          if (normalizedBasePath) {
            domainLine += `/${normalizedBasePath}/`
          }
        }
        summaryList.push(domainLine)
        summaryList.push(`  target: ${domain.domainInfo.domainName}`)
        summaryList.push(`  zone id: ${domain.domainInfo.hostedZoneId}`)
      })
    }

    if (Globals.v3Utils) {
      const sectionName = validDomains.length === 1 ? 'domain' : 'domains'
      Globals.serverless.addServiceOutputSection(sectionName, summaryList)
    } else {
      Logging.cliLog('[Summary]', 'Domain Configuration')
      summaryList.forEach((item) => {
        Logging.cliLog('', `${item}`)
      })
    }
  }
}
