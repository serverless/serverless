/**
 * Creates a sls.cmd wrapper on Windows that points to the sf-core CLI.
 * Used by CI to make `sls` available in PATH on Windows runners.
 */
const fs = require('fs')
const path = require('path')

const binDir = path.join('.github', 'bin')
fs.mkdirSync(binDir, { recursive: true })

const target = path.resolve('packages', 'sf-core', 'bin', 'sf-core.js')
const content = `@node "${target}" %*\r\n`

fs.writeFileSync(path.join(binDir, 'sls.cmd'), content)
console.log(`Created sls.cmd -> ${target}`)
