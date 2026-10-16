import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import { AwsRoute53Client } from '../../src/lib/aws/route53.js'

describe('AwsRoute53Client.createRecordIfNotExists', () => {
  let client

  beforeEach(() => {
    client = new AwsRoute53Client()
    client.client.send = jest.fn()
  })

  test('does not create a record that already exists', async () => {
    client.client.send.mockResolvedValueOnce({
      ResourceRecordSets: [
        { Name: 'other.example.com.', Type: 'CNAME' },
        { Name: '_abc.example.com.', Type: 'CNAME' },
      ],
    })

    await client.createRecordIfNotExists('Z123', {
      Name: '_abc.example.com',
      Type: 'CNAME',
      Value: 'validation.acm-validations.aws.',
    })

    // Only the ListResourceRecordSets call, no ChangeResourceRecordSets
    expect(client.client.send).toHaveBeenCalledTimes(1)
  })

  test('creates the record when no matching record exists', async () => {
    client.client.send
      .mockResolvedValueOnce({
        ResourceRecordSets: [{ Name: '_abc.example.com.', Type: 'TXT' }],
      })
      .mockResolvedValueOnce({})

    await client.createRecordIfNotExists('Z123', {
      Name: '_abc.example.com',
      Type: 'CNAME',
      Value: 'validation.acm-validations.aws.',
    })

    expect(client.client.send).toHaveBeenCalledTimes(2)
  })
})
