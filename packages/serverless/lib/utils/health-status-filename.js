import path from 'path'
import os from 'os'

export default path.resolve(
  os.homedir(),
  '.serverless/last-command-health-status',
)
