import dayjs from 'dayjs'
import { style } from '@serverless/util'

export default (msgParam) => {
  let msg = msgParam
  const dateFormat = 'YYYY-MM-DD HH:mm:ss.SSS'

  if (!msg.startsWith('REPORT')) msg = msg.trimRight()

  if (
    msg.startsWith('START') ||
    msg.startsWith('INIT_START') ||
    msg.startsWith('REPORT') ||
    msg.startsWith('END')
  ) {
    msg = msg.replace('RequestId:', '-')
    msg = msg.replace('Version:', '- Version:')
    if (msg.includes('\tDuration:')) {
      msg = msg.split('\tDuration:').join('\nDuration:')
    }
    return style.aside(msg)
  }

  if (msg.trim() === 'Process exited before completing request') {
    return style.error(msg)
  }

  const splitted = msg.split('\t')

  if (splitted.length < 3) {
    return msg
  }

  let date = ''
  let reqId = ''
  let level = ''

  if (!isNaN(new Date(splitted[0]).getTime())) {
    date = splitted[0]
    reqId = splitted[1]
  } else if (!isNaN(new Date(splitted[1]).getTime())) {
    date = splitted[1]
    reqId = splitted[2]
    level = `${splitted[0]}\t`
  } else {
    return msg
  }
  // The message follows the timestamp and request id, and the level where it comes first.
  const text = splitted.slice(level ? 3 : 2).join('\t')
  const time = dayjs(date).format(dateFormat)

  return `${style.aside(`${time} - ${reqId} - ${level}`)}\n${text}`
}
