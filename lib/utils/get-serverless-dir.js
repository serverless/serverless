import path from 'path'
import os from 'os'

// get .serverless home path
function getServerlessDir() {
  return path.join(os.homedir(), '.serverless')
}

export default getServerlessDir
