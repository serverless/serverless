const { execSync } = require('child_process')
const fs = require('fs')

const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'))
const releaseVersion = `v${packageJson.version}`

const output = execSync(`git tag ${releaseVersion} && git push --tags`)
