const fs = require('fs')

const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'))
packageJson.version = `${packageJson.version}-${process.env.GITHUB_SHA.slice(0, 8)}`
fs.writeFileSync('./package.json', `${JSON.stringify(packageJson, null, 2)}\n`)
