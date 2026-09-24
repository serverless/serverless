import { jest } from '@jest/globals'
import { ServerlessErrorCodes } from '@serverless/util'
import {
  findOrg,
  pickFallbackOrg,
  settleDefaultOrg,
} from '../../../../src/lib/auth/default-org.js'

const orgs = [
  { orgName: 'team', role: 'member', createdAt: 100 },
  { orgName: 'mine-new', role: 'owner', createdAt: 300 },
  { orgName: 'mine-old', role: 'owner', createdAt: 200 },
]

describe('pickFallbackOrg', () => {
  it('picks the oldest org the user owns', () => {
    expect(pickFallbackOrg(orgs).orgName).toBe('mine-old')
  })

  it('falls back to the oldest org when the user owns none', () => {
    expect(
      pickFallbackOrg([
        { orgName: 'b', role: 'member', createdAt: 2 },
        { orgName: 'a', role: 'member', createdAt: 1 },
      ]).orgName,
    ).toBe('a')
  })
})

describe('findOrg', () => {
  it('returns the org with that name', () => {
    expect(findOrg(orgs, 'team')).toBe(orgs[0])
  })

  it('throws a stackless ORG_NOT_FOUND that lists the orgs the user belongs to', () => {
    let error
    try {
      findOrg(orgs, 'nope')
    } catch (e) {
      error = e
    }
    expect(error.code).toBe(ServerlessErrorCodes.general.ORG_NOT_FOUND)
    expect(error.message).toBe(
      'You don\'t belong to an org named "nope". Your orgs: team, mine-new, mine-old.',
    )
    expect(error.stack).toBeUndefined()
  })
})

describe('settleDefaultOrg', () => {
  const choose = jest.fn(() => 'team')
  beforeEach(() => choose.mockClear())

  it('a requested org wins over a saved default', async () => {
    expect(
      await settleDefaultOrg({
        orgs,
        savedDefaultOrgName: 'team',
        requestedOrgName: 'mine-new',
        chooseDefaultOrg: choose,
      }),
    ).toEqual({ orgName: 'mine-new', source: 'requested' })
    expect(choose).not.toHaveBeenCalled()
  })

  it('an unknown requested org throws ORG_NOT_FOUND', async () => {
    await expect(
      settleDefaultOrg({
        orgs,
        requestedOrgName: 'nope',
        chooseDefaultOrg: choose,
      }),
    ).rejects.toMatchObject({
      code: ServerlessErrorCodes.general.ORG_NOT_FOUND,
    })
  })

  it('keeps a saved default the user still belongs to', async () => {
    expect(
      await settleDefaultOrg({
        orgs,
        savedDefaultOrgName: 'mine-new',
        chooseDefaultOrg: choose,
      }),
    ).toEqual({ orgName: 'mine-new', source: 'saved' })
    expect(choose).not.toHaveBeenCalled()
  })

  it('asks the chooser when the saved default is no longer one of the orgs', async () => {
    expect(
      await settleDefaultOrg({
        orgs,
        savedDefaultOrgName: 'gone',
        chooseDefaultOrg: choose,
      }),
    ).toEqual({ orgName: 'team', source: 'chosen' })
  })

  it('uses the only org without asking', async () => {
    expect(
      await settleDefaultOrg({ orgs: [orgs[0]], chooseDefaultOrg: choose }),
    ).toEqual({ orgName: 'team', source: 'only' })
    expect(choose).not.toHaveBeenCalled()
  })

  it('asks the chooser among several orgs and no default', async () => {
    expect(await settleDefaultOrg({ orgs, chooseDefaultOrg: choose })).toEqual({
      orgName: 'team',
      source: 'chosen',
    })
    expect(choose).toHaveBeenCalledWith(orgs)
  })
})
