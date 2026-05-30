import { formatProvisionedResources } from '../../../../../../../../lib/plugins/aws/offline/lib/provisioner/boot-log.js'
import {
  createRegistry,
  registerSqsQueue,
  registerSnsTopic,
  registerS3Bucket,
  registerEventResource,
} from '../../../../../../../../lib/plugins/aws/offline/lib/provisioner/registry.js'

describe('formatProvisionedResources', () => {
  it('returns an empty array when nothing is provisioned', () => {
    expect(formatProvisionedResources(createRegistry())).toEqual([])
  })

  it('groups provisioned resources by type with their local url/arn', () => {
    const reg = createRegistry()
    registerSqsQueue(reg, {
      logicalId: 'Q',
      name: 'Q',
      url: 'http://localhost:3002/000000000000/Q',
      arn: 'arn:aws:sqs:us-east-1:000000000000:Q',
    })
    registerSnsTopic(reg, {
      logicalId: 'T',
      name: 'T',
      arn: 'arn:aws:sns:us-east-1:000000000000:T',
    })
    registerS3Bucket(reg, {
      logicalId: 'B',
      name: 'b',
      arn: 'arn:aws:s3:::b',
      properties: {},
    })
    registerEventResource(reg, {
      logicalId: 'Bus',
      name: 'Bus',
      arn: 'arn:aws:events:us-east-1:000000000000:event-bus/Bus',
      kind: 'bus',
      properties: {},
    })

    const lines = formatProvisionedResources(reg)
    expect(lines).toEqual([
      'Queues:',
      '  Q  →  http://localhost:3002/000000000000/Q',
      'Topics:',
      '  T  →  arn:aws:sns:us-east-1:000000000000:T',
      'Buckets:',
      '  B  →  arn:aws:s3:::b',
      'Event buses/rules:',
      '  Bus  →  arn:aws:events:us-east-1:000000000000:event-bus/Bus',
    ])
  })

  it('omits empty groups', () => {
    const reg = createRegistry()
    registerSnsTopic(reg, { logicalId: 'T', name: 'T', arn: 'arn:t' })
    const lines = formatProvisionedResources(reg)
    expect(lines.some((l) => l.startsWith('Queues'))).toBe(false)
    expect(lines[0]).toBe('Topics:')
  })
})
