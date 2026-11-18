import _ from 'lodash'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc.js'
import wait from 'timers-ext/promise/sleep.js'
import { style } from '@serverless/util'
import formatLambdaLogEvent from '../utils/format-lambda-log-event.js'
import ServerlessError from '../../../serverless-error.js'

dayjs.extend(utc)

/**
 * The `logs` command's reading of a Lambda log group, shared by `--function`
 * and `--web-app`: the group's most recent streams, then their events, once or
 * (with `--tail`) polling for new ones.
 */

/**
 * The error `getLogStreamNames` throws for a log group without streams.
 *
 * @param {string} message
 * @returns {ServerlessError}
 */
export const noLogStreamsError = (message) =>
  new ServerlessError(message, 'NO_EXISTING_LOG_STREAMS', { stack: false })

/**
 * The names of the 50 streams with the most recent events in `logGroupName`.
 *
 * @param {object} params
 * @param {object} params.provider - the AWS provider
 * @param {string} params.logGroupName
 * @param {string} params.noLogStreamsMessage - the error message when the group has no streams
 * @returns {Promise<string[]>}
 */
export async function getLogStreamNames({
  provider,
  logGroupName,
  noLogStreamsMessage,
}) {
  const reply = await provider.request('CloudWatchLogs', 'describeLogStreams', {
    logGroupName,
    descending: true,
    limit: 50,
    orderBy: 'LastEventTime',
  })
  if (!reply || reply.logStreams.length === 0) {
    throw noLogStreamsError(noLogStreamsMessage)
  }
  return reply.logStreams.map((logStream) => logStream.logStreamName)
}

/**
 * Print the events of `logStreamNames` in `logGroupName`. With `options.tail`
 * it keeps polling: it records the paging state (`nextToken`, `startTime`) on
 * `options` and looks the streams up again through `getLogStreams`.
 *
 * @param {object} params
 * @param {object} params.provider - the AWS provider
 * @param {object} params.logger
 * @param {object} params.progress
 * @param {object} params.options - the command's `startTime`, `filter`, `tail`, `interval`, `nextToken`
 * @param {string} params.logGroupName
 * @param {string[]} params.logStreamNames
 * @param {() => Promise<string[]>} params.getLogStreams - the stream lookup for the next poll
 * @returns {Promise<void>}
 */
export async function showLogEvents(params) {
  const { provider, logger, progress, options, logGroupName, getLogStreams } =
    params
  const { logStreamNames } = params

  if (!logStreamNames || !logStreamNames.length) {
    if (options.tail) {
      const newLogStreamNames = await getLogStreams()
      await showLogEvents({ ...params, logStreamNames: newLogStreamNames })
    }
  }

  const request = {
    logGroupName,
    interleaved: true,
    logStreamNames,
    startTime: options.startTime,
  }

  if (options.filter) request.filterPattern = options.filter
  if (options.nextToken) request.nextToken = options.nextToken
  if (options.startTime) {
    const since =
      ['m', 'h', 'd'].indexOf(
        options.startTime[options.startTime.length - 1],
      ) !== -1
    if (since) {
      request.startTime = dayjs()
        .subtract(
          options.startTime.replace(/\D/g, ''),
          options.startTime.replace(/\d/g, ''),
        )
        .valueOf()
    } else {
      request.startTime = dayjs.utc(options.startTime).valueOf()
    }
  } else {
    request.startTime = dayjs().subtract(10, 'm').valueOf()
    if (options.tail) {
      request.startTime = dayjs().subtract(15, 's').valueOf()
    }
  }

  const results = await provider.request(
    'CloudWatchLogs',
    'filterLogEvents',
    request,
  )

  const startTimeHumanReadable = dayjs(request.startTime).format(
    'YYYY-MM-DD HH:mm:ss',
  )

  // Remove progress before printing results
  progress.remove()

  // If not tailing, and no logs found, show a message
  if (!options.tail && (!results.events || !results.events.length)) {
    logger.aside(`No logs found from start time: ${startTimeHumanReadable}`)
    return
  }

  // If logs found
  if (results.events && results.events.length) {
    if (!options.tail) {
      logger.aside(`Logs Start Time: ${startTimeHumanReadable}`)
      logger.blankLine()
    }

    // Print log messages w/ custom formatting
    results.events.forEach((e) => {
      logger.notice(formatLambdaLogEvent(e.message))
    })
  }

  if (results.nextToken) {
    options.nextToken = results.nextToken
  } else {
    delete options.nextToken
  }

  if (options.tail) {
    // Set listening message
    progress.notice(`Listening ${style.aside(startTimeHumanReadable)}`)

    if (results.events && results.events.length) {
      options.startTime = _.last(results.events).timestamp + 1
    }

    await wait(options.interval)
    const newLogStreamNames = await getLogStreams()
    await showLogEvents({ ...params, logStreamNames: newLogStreamNames })
  }
}
