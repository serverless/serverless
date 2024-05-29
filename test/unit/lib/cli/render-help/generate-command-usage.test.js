'use strict'

const { expect } = require('chai')
const generateCommandUsage = require('../../../../../lib/cli/render-help/generate-command-usage')
const commandsSchema = require('../../../../../lib/cli/commands-schema/no-service')

describe('test/unit/lib/cli/render-help/generate-command-usage.test.js', () => {
  it('should generate usage info', async () => {
    const commandSchema = commandsSchema.get('config')
    const resultString = generateCommandUsage('config', commandSchema)
    expect(resultString).to.have.string('config')
    expect(resultString).to.have.string(commandSchema.usage)
  })
})
