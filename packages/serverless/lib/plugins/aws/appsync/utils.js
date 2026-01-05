import _ from 'lodash'
const { upperFirst, transform, values } = _
import { DateTime, Duration } from 'luxon'
import { promisify } from 'util'
import * as readline from 'readline'

export const timeUnits = {
  y: 'years',
  q: 'quarters',
  M: 'months',
  w: 'weeks',
  d: 'days',
  h: 'hours',
  m: 'minutes',
  s: 'seconds',
  ms: 'milliseconds',
}

const isRecord = (value) => {
  return typeof value === 'object'
}

export const toCfnKeys = (object) =>
  transform(object, (acc, value, key) => {
    const newKey = typeof key === 'string' ? upperFirst(key) : key

    acc[newKey] = isRecord(value) ? toCfnKeys(value) : value

    return acc
  })

export const wait = async (time) => {
  await new Promise((resolve) => setTimeout(resolve, time))
}

export const parseDateTimeOrDuration = (input) => {
  try {
    // Try to parse a date
    let date = DateTime.fromISO(input)
    if (!date.isValid) {
      // try to parse duration
      date = DateTime.now().minus(parseDuration(input))
    }

    return date
  } catch (error) {
    throw new Error('Invalid date or duration')
  }
}

export const parseDuration = (input) => {
  let duration
  if (typeof input === 'number') {
    duration = Duration.fromDurationLike({ hours: input })
  } else if (typeof input === 'string') {
    const regexp = new RegExp(`^(\\d+)(${Object.keys(timeUnits).join('|')})?$`)
    const match = input.match(regexp)
    if (match) {
      let amount = parseInt(match[1], 10)
      let unit = timeUnits[match[2]] || 'hours'

      // 1 year could be 366 days on or before leap year,
      // which would fail. Swap for 365 days
      if (input.match(/^1y(ears?)?$/)) {
        amount = 365
        unit = 'days'
      }

      duration = Duration.fromDurationLike({ [unit]: amount })
    } else {
      throw new Error(`Could not parse ${input} as a valid duration`)
    }
  } else {
    throw new Error(`Could not parse ${input} as a valid duration`)
  }

  return duration
}

export const getHostedZoneName = (domain) => {
  const parts = domain.split('.')
  if (parts.length > 2) {
    parts.shift()
  }
  return `${parts.join('.')}.`
}

export const getWildCardDomainName = (domain) => {
  return `*.${domain.split('.').slice(1).join('.')}`
}

export const question = async (questionText) => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })
  const q = promisify((questionText, cb) => {
    rl.question(questionText, (a) => {
      cb(null, a)
    })
  }).bind(rl)

  const answer = await q(`${questionText}: `)
  rl.close()

  return answer
}

export const confirmAction = async () => {
  const answer = await question('Do you want to continue? y/N')

  return answer.toLowerCase() === 'y'
}
