import { jest } from '@jest/globals'
import ACMWrapper from '../../../../../../../lib/plugins/aws/domains/aws/acm-wrapper.js'
import Globals from '../../../../../../../lib/plugins/aws/domains/globals.js'

const cert = (arn, domainName, status, { sans, notAfter } = {}) => ({
  CertificateArn: arn,
  DomainName: domainName,
  SubjectAlternativeNameSummaries: sans || [domainName],
  Status: status,
  ...(notAfter ? { NotAfter: new Date(notAfter) } : {}),
})

describe('ACMWrapper', () => {
  beforeEach(() => {
    Globals.serverless = { providers: { aws: { sdk: { config: {} } } } }
    Globals.v3Utils = { log: { verbose: jest.fn() } }
  })

  afterEach(() => {
    Globals.v3Utils = undefined
    jest.restoreAllMocks()
  })

  describe('getCertArnByDomainName', () => {
    const pick = (certificates, domainName = 'api.example.com') =>
      ACMWrapper.getCertArnByDomainName(certificates, domainName)

    it('picks the only certificate whose name matches exactly', () => {
      expect(pick([cert('arn:exact', 'api.example.com', 'ISSUED')])).toBe(
        'arn:exact',
      )
    })

    it('prefers an issued certificate over pending and inactive ones for the same name, whatever the listing order', () => {
      const pending = cert(
        'arn:pending',
        'api.example.com',
        'PENDING_VALIDATION',
      )
      const issued = cert('arn:issued', 'api.example.com', 'ISSUED')
      const inactive = cert('arn:inactive', 'api.example.com', 'INACTIVE')

      expect(pick([pending, issued, inactive])).toBe('arn:issued')
      expect(pick([inactive, pending, issued])).toBe('arn:issued')
    })

    it('picks a pending certificate when no issued one matches', () => {
      expect(
        pick([
          cert('arn:inactive', 'api.example.com', 'INACTIVE'),
          cert('arn:pending', 'api.example.com', 'PENDING_VALIDATION'),
        ]),
      ).toBe('arn:pending')
    })

    it('never picks an inactive certificate', () => {
      expect(
        pick([cert('arn:inactive', 'api.example.com', 'INACTIVE')]),
      ).toBeUndefined()
    })

    it('does not treat a certificate for the parent domain as covering a subdomain', () => {
      expect(pick([cert('arn:apex', 'example.com', 'ISSUED')])).toBeUndefined()
    })

    it('prefers an exact name over a wildcard', () => {
      const wildcard = cert('arn:wildcard', '*.example.com', 'ISSUED')
      const exact = cert('arn:exact', 'api.example.com', 'ISSUED')

      expect(pick([wildcard, exact])).toBe('arn:exact')
      expect(pick([exact, wildcard])).toBe('arn:exact')
    })

    it('keeps the most specific name before preferring status', () => {
      expect(
        pick([
          cert('arn:wildcard', '*.example.com', 'ISSUED'),
          cert('arn:exact-pending', 'api.example.com', 'PENDING_VALIDATION'),
        ]),
      ).toBe('arn:exact-pending')
    })

    it('picks a wildcard one level up', () => {
      expect(pick([cert('arn:wildcard', '*.example.com', 'ISSUED')])).toBe(
        'arn:wildcard',
      )
    })

    it('does not treat a wildcard as covering deeper subdomains or the apex', () => {
      const wildcard = cert('arn:wildcard', '*.example.com', 'ISSUED')

      expect(pick([wildcard], 'a.api.example.com')).toBeUndefined()
      expect(pick([wildcard], 'example.com')).toBeUndefined()
    })

    it('matches subject alternative names', () => {
      expect(
        pick([
          cert('arn:san', 'www.example.org', 'ISSUED', {
            sans: ['www.example.org', '*.example.com'],
          }),
        ]),
      ).toBe('arn:san')
    })

    it('matches an exact subject alternative name above a wildcard', () => {
      expect(
        pick([
          cert('arn:wildcard', '*.example.com', 'ISSUED'),
          cert('arn:san-exact', '*.example.com', 'ISSUED', {
            sans: ['*.example.com', 'api.example.com'],
          }),
        ]),
      ).toBe('arn:san-exact')
    })

    it('falls back to an issued wildcard when the exact certificate is inactive', () => {
      expect(
        pick([
          cert('arn:inactive', 'api.example.com', 'INACTIVE'),
          cert('arn:wildcard', '*.example.com', 'ISSUED'),
        ]),
      ).toBe('arn:wildcard')
    })

    it('picks a wildcard certificate for a wildcard custom domain', () => {
      expect(
        pick(
          [
            cert('arn:apex', 'example.com', 'ISSUED'),
            cert('arn:wildcard', '*.example.com', 'ISSUED'),
          ],
          '*.example.com',
        ),
      ).toBe('arn:wildcard')
    })

    it('ignores an expiry date that cannot be read', () => {
      expect(
        pick([
          cert('arn:unreadable', 'api.example.com', 'ISSUED', {
            notAfter: 'not a date',
          }),
          cert('arn:dated', 'api.example.com', 'ISSUED', {
            notAfter: '2027-01-01T00:00:00Z',
          }),
        ]),
      ).toBe('arn:dated')
    })

    it('breaks ties by the latest expiry', () => {
      const sooner = cert('arn:sooner', 'api.example.com', 'ISSUED', {
        notAfter: '2027-01-01T00:00:00Z',
      })
      const later = cert('arn:later', 'api.example.com', 'ISSUED', {
        notAfter: '2027-06-01T00:00:00Z',
      })
      const unknown = cert('arn:unknown', 'api.example.com', 'ISSUED')

      expect(pick([sooner, later])).toBe('arn:later')
      expect(pick([later, sooner])).toBe('arn:later')
      expect(pick([unknown, sooner])).toBe('arn:sooner')
    })

    it('keeps the listing order when nothing else separates certificates', () => {
      expect(
        pick([
          cert('arn:first', 'api.example.com', 'ISSUED'),
          cert('arn:second', 'api.example.com', 'ISSUED'),
        ]),
      ).toBe('arn:first')
    })

    it('tolerates certificates without subject alternative names', () => {
      expect(
        pick([
          {
            CertificateArn: 'arn:no-sans',
            DomainName: 'api.example.com',
            Status: 'ISSUED',
          },
        ]),
      ).toBe('arn:no-sans')
    })
  })

  describe('getCertArnByCertName', () => {
    const byName = (certificates, certName) =>
      new ACMWrapper().getCertArnByCertName(certificates, certName)

    it('picks the certificate whose domain name equals the configured name', () => {
      expect(
        byName(
          [
            cert('arn:other', 'other.example.com', 'ISSUED'),
            cert('arn:named', 'named.example.com', 'ISSUED'),
          ],
          'named.example.com',
        ),
      ).toBe('arn:named')
    })

    it('matches the domain name only, not subject alternative names', () => {
      expect(
        byName(
          [
            cert('arn:san', 'other.example.com', 'ISSUED', {
              sans: ['other.example.com', 'named.example.com'],
            }),
          ],
          'named.example.com',
        ),
      ).toBeNull()
    })

    it('prefers an issued certificate, then the latest expiry, and never an inactive one', () => {
      expect(
        byName(
          [
            cert('arn:inactive', 'named.example.com', 'INACTIVE'),
            cert('arn:pending', 'named.example.com', 'PENDING_VALIDATION'),
            cert('arn:sooner', 'named.example.com', 'ISSUED', {
              notAfter: '2027-01-01T00:00:00Z',
            }),
            cert('arn:later', 'named.example.com', 'ISSUED', {
              notAfter: '2027-06-01T00:00:00Z',
            }),
          ],
          'named.example.com',
        ),
      ).toBe('arn:later')
      expect(
        byName(
          [cert('arn:inactive', 'named.example.com', 'INACTIVE')],
          'named.example.com',
        ),
      ).toBeNull()
    })
  })

  describe('getCertArn', () => {
    const listing = (certificates) => {
      const wrapper = new ACMWrapper()
      jest
        .spyOn(wrapper.acm, 'send')
        .mockResolvedValue({ CertificateSummaryList: certificates })
      return wrapper
    }

    it('lists ECDSA P-256 and P-384 certificates as well as RSA 1024 and 2048 ones', async () => {
      const wrapper = listing([cert('arn:ec', 'api.example.com', 'ISSUED')])

      await expect(
        wrapper.getCertArn({ givenDomainName: 'api.example.com' }),
      ).resolves.toBe('arn:ec')
      expect(wrapper.acm.send).toHaveBeenCalledTimes(1)
      expect(wrapper.acm.send.mock.calls[0][0].input).toEqual({
        CertificateStatuses: ['PENDING_VALIDATION', 'ISSUED', 'INACTIVE'],
        Includes: {
          keyTypes: ['RSA_1024', 'RSA_2048', 'EC_prime256v1', 'EC_secp384r1'],
        },
      })
    })

    it('returns the issued certificate when a pending request for the same name is listed first', async () => {
      const wrapper = listing([
        cert('arn:pending', 'api.example.com', 'PENDING_VALIDATION'),
        cert('arn:issued', 'api.example.com', 'ISSUED'),
      ])

      await expect(
        wrapper.getCertArn({ givenDomainName: 'api.example.com' }),
      ).resolves.toBe('arn:issued')
    })

    it('reports a missing named certificate when only an inactive one has that name', async () => {
      const wrapper = listing([
        cert('arn:inactive', 'named.example.com', 'INACTIVE'),
      ])

      await expect(
        wrapper.getCertArn({
          givenDomainName: 'api.example.com',
          certificateName: 'named.example.com',
        }),
      ).rejects.toMatchObject({
        code: 'ACM_CERTIFICATE_NOT_FOUND',
        message:
          "Could not find an in-date certificate for 'named.example.com'.",
      })
    })

    it('reports a missing certificate when only the parent domain has one, so a certificate can be created', async () => {
      const wrapper = listing([cert('arn:apex', 'example.com', 'ISSUED')])

      await expect(
        wrapper.getCertArn({ givenDomainName: 'api.example.com' }),
      ).rejects.toMatchObject({
        code: 'ACM_CERTIFICATE_NOT_FOUND',
        message: "Could not find an in-date certificate for 'api.example.com'.",
      })
    })
  })
})
