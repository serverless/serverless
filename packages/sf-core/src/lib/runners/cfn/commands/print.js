import os from 'os'
import _ from 'lodash'
import jc from 'json-cycle'
import yaml from 'js-yaml'
import { ServerlessError, log, progress } from '@serverless/util'

/**
 * Fetches service/stack information and displays it in the specified format.
 * @param {Object} params
 * @param {Object} params.templateFile - The CloudFormation template file.
 * @param {string} [params.format='yaml'] - The desired output format ('yaml', 'json', or 'text').
 */
export default async function ({ templateFile, format = 'yaml' }) {
  const mainProgress = progress.get('main')
  mainProgress.notice('Loading')

  let conf = templateFile
  let out

  if (format === 'text') {
    if (Array.isArray(conf)) {
      out = conf.join(os.EOL)
    } else {
      if (_.isObject(conf)) {
        throw new ServerlessError(
          'Cannot print an object as "text"',
          'PRINT_INVALID_OBJECT_AS_TEXT',
          { stack: false },
        )
      }
      out = String(conf)
    }
  } else if (format === 'json') {
    out = jc.stringify(conf, null, '  ')
  } else if (format === 'yaml') {
    out = yaml.dump(JSON.parse(jc.stringify(conf)), { noRefs: true })
  } else {
    throw new ServerlessError(
      'Format must be "yaml", "json" or "text"',
      'PRINT_INVALID_FORMAT',
      { stack: false },
    )
  }

  log.writeCompose(out)
  log.writeCompose(' ')
}
