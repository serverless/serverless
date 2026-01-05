import { jest } from '@jest/globals'
import fs from 'fs'
import { Api } from '../../../../../../lib/plugins/aws/appsync/resources/Api.js'
import { MappingTemplate } from '../../../../../../lib/plugins/aws/appsync/resources/MappingTemplate.js'
import * as given from './given.js'

const plugin = given.plugin()

describe('Mapping Templates', () => {
  let mock
  let mockExists

  beforeEach(() => {
    mock = jest
      .spyOn(fs, 'readFileSync')
      .mockImplementation(
        (path) => `Content of ${`${path}`.replace(/\\/g, '/')}`,
      )
    mockExists = jest.spyOn(fs, 'existsSync').mockReturnValue(true)
  })

  afterEach(() => {
    mock.mockRestore()
    mockExists.mockRestore()
  })

  it('should substitute variables', () => {
    const api = new Api(given.appSyncConfig(), plugin)
    const mapping = new MappingTemplate(api, {
      path: 'foo.vtl',
      substitutions: {
        foo: 'bar',
        var: { Ref: 'MyReference' },
      },
    })
    const template =
      'Foo: ${foo}, Var: ${var}, Context: ${ctx.args.id}, Unknonw: ${unknown}'
    expect(mapping.processTemplateSubstitutions(template)).toMatchSnapshot()
  })

  it('should substitute variables and use defaults', () => {
    const api = new Api(
      given.appSyncConfig({
        substitutions: {
          foo: 'bar',
          var: 'bizz',
        },
      }),
      plugin,
    )
    const mapping = new MappingTemplate(api, {
      path: 'foo.vtl',
      substitutions: {
        foo: 'fuzz',
      },
    })
    const template = 'Foo: ${foo}, Var: ${var}'
    expect(mapping.processTemplateSubstitutions(template)).toMatchSnapshot()
  })

  it('should fail if template is missing', () => {
    mockExists = jest.spyOn(fs, 'existsSync').mockReturnValue(false)
    const api = new Api(given.appSyncConfig(), plugin)
    const mapping = new MappingTemplate(api, {
      path: 'foo.vtl',
      substitutions: {
        foo: 'bar',
        var: { Ref: 'MyReference' },
      },
    })

    expect(function () {
      mapping.compile()
    }).toThrowErrorMatchingSnapshot()
  })
})
