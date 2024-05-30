'use strict'

const expect = require('chai').expect
const runServerless = require('../../../../../../utils/run-serverless')
const fs = require('fs').promises
const path = require('path')

describe('#saveCompiledTemplate()', () => {
  it('should save the compiled template to disk', async () => {
    const result = await runServerless({
      fixture: 'aws',
      command: ['package'],
    })

    const cfTemplateFilePath = path.join(
      result.fixtureData.servicePath,
      '.serverless',
      'cloudformation-template-update-stack.json',
    )

    const cfTemplateJsonOnDisk = await fs.readFile(cfTemplateFilePath, 'utf-8')
    const cfTemplateOnDisk = JSON.parse(cfTemplateJsonOnDisk)

    expect(cfTemplateOnDisk).to.deep.equal(result.cfTemplate)
  })

  it('should minify compiled template if --minify-template is set', async () => {
    const result = await runServerless({
      fixture: 'aws',
      command: ['package'],
      options: {
        'minify-template': true,
      },
    })

    const cfTemplateFilePath = path.join(
      result.fixtureData.servicePath,
      '.serverless',
      'cloudformation-template-update-stack.json',
    )

    const cfTemplateJsonOnDisk = await fs.readFile(cfTemplateFilePath, 'utf-8')
    const cfMinifiedTemplateJson = JSON.stringify(result.cfTemplate, null, 0)

    expect(cfTemplateJsonOnDisk).to.equal(cfMinifiedTemplateJson)
  })
})
