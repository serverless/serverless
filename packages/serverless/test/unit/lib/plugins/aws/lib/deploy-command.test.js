import { describe, expect, it } from '@jest/globals'
import { deployCommand } from '../../../../../../lib/plugins/aws/lib/deploy-command.js'

// The command that deploys this service to the stage and region the current
// run uses. Within Compose it names the service, since a plain deploy from the
// Compose root deploys every service, stateful ones included.
const build = ({ stage = 'alex', region = 'us-east-1', compose } = {}) => ({
  serverless: { compose },
  provider: { getStage: () => stage, getRegion: () => region },
})

describe('deployCommand', () => {
  it('names the stage and region', () => {
    expect(deployCommand(build())).toBe(
      'serverless deploy --stage alex --region us-east-1',
    )
  })

  it('adds --service within Compose', () => {
    expect(
      deployCommand(
        build({ compose: { isWithinCompose: true, serviceName: 'api' } }),
      ),
    ).toBe('serverless deploy --service=api --stage alex --region us-east-1')
  })

  it('no --service outside Compose or without a service key', () => {
    expect(deployCommand(build({ compose: { isWithinCompose: false } }))).toBe(
      'serverless deploy --stage alex --region us-east-1',
    )
    expect(deployCommand(build({ compose: { isWithinCompose: true } }))).toBe(
      'serverless deploy --stage alex --region us-east-1',
    )
  })
})
