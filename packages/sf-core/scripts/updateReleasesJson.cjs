const fs = require('fs')
const { execSync } = require('child_process')

const packageJson = JSON.parse(fs.readFileSync('../package.json', 'utf8'))
let version = packageJson.version

// Handle canary builds
if (process.env.IS_CANARY === 'true') {
  const gitSha = execSync('git rev-parse --short HEAD').toString().trim()
  version = `${gitSha}`
}

const releasesJson = JSON.parse(fs.readFileSync('./releases.json', 'utf8'))
releasesJson.version = version

fs.writeFileSync(
  './releases.json',
  `${JSON.stringify(releasesJson, null, 2)}\n`,
)
