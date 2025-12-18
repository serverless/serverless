import memoizee from 'memoizee'
import ensureExists from './ensure-exists.js'
import path from 'path'
import os from 'os'

// Get day-month-year to use for artifact cache path
const date = new Date()
const day = date.getDate()
const month = date.getMonth() + 1
const year = date.getFullYear()
const version = `${day}-${month}-${year}`

const cachePath = path.resolve(os.homedir(), '.serverless/artifacts', version)

export default memoizee(
  async (filename, generate) => {
    await ensureExists(path.resolve(cachePath, filename), generate)
    return cachePath
  },
  { length: 1, promise: true },
)
