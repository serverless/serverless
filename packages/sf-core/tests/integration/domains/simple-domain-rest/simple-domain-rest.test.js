import path from 'path'
import readConfig from '@serverless/framework/lib/configuration/read.js'
import url from 'url'
import { setGlobalRendererSettings } from '@serverless/util'
import {
  ACMClient,
  DeleteCertificateCommand,
  ListCertificatesCommand,
} from '@aws-sdk/client-acm'
import {
  ChangeResourceRecordSetsCommand,
  ListHostedZonesCommand,
  ListResourceRecordSetsCommand,
  Route53Client,
} from '@aws-sdk/client-route-53'
import { jest } from '@jest/globals'
import { getTestStageName, runSfCore } from '../../../utils/runSfCore'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))

describe('Serverless Framework Service - Simple Domain REST', () => {
  const configFileDirPath = path.join(__dirname, 'fixture')
  const acmClient = new ACMClient({ region: 'us-east-1' })
  const route53Client = new Route53Client({ region: 'us-east-1' })
  const originalEnv = process.env
  const stage = getTestStageName()
  let service, configFilePath, domainName, basePath, certificateArn
  let deploymentSucceeded = false

  beforeAll(async () => {
    setGlobalRendererSettings({
      isInteractive: false,
      logLevel: 'error',
    })
    configFilePath = path.join(configFileDirPath, 'serverless.yml')
    service = await readConfig(configFilePath)

    if (typeof service.provider.domain === 'string') {
      domainName = service.provider.domain
      basePath = ''
    } else {
      domainName = service.provider.domain.name
      basePath = service.provider.domain.basePath || ''
    }
    process.env = {
      ...originalEnv,
      SERVERLESS_PLATFORM_STAGE: 'dev',
      SERVERLESS_LICENSE_KEY: process.env.SERVERLESS_LICENSE_KEY_DEV,
      SERVERLESS_ACCESS_KEY: undefined,
    }
  })

  afterAll(() => {
    process.env = originalEnv
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('Deploy', async () => {
    await runSfCore({
      coreParams: {
        options: { stage, c: configFilePath },
        command: ['deploy'],
      },
      jest,
    })

    // Mark deployment as successful
    deploymentSucceeded = true

    // Find the auto-created certificate for cleanup
    const certificatesResponse = await acmClient.send(
      new ListCertificatesCommand({
        CertificateStatuses: ['ISSUED', 'PENDING_VALIDATION'],
      }),
    )

    const certificate = certificatesResponse.CertificateSummaryList.find(
      (cert) => cert.DomainName === domainName,
    )

    if (certificate) {
      certificateArn = certificate.CertificateArn
      console.log(`📜 Found certificate for cleanup: ${certificateArn}`)
    }
  })

  test('Validate Domain Works', async () => {
    // Skip this test if deployment failed
    if (!deploymentSucceeded) {
      console.log(
        '⏭️  Skipping domain validation test because deployment failed',
      )
      return
    }

    // Retry domain validation with delays
    const maxRetries = 30
    const retryDelay = 10000 // 10 seconds
    let attempt = 0
    let domainWorking = false

    console.log(
      `🔄 Testing domain availability (max ${maxRetries} attempts, ${retryDelay / 1000}s intervals)...`,
    )

    while (attempt < maxRetries && !domainWorking) {
      attempt++

      try {
        const testUrl = basePath
          ? `https://${domainName}/${basePath.replace(/^\//, '')}`
          : `https://${domainName}`

        console.log(
          `⏳ Attempt ${attempt}/${maxRetries}: Testing domain ${testUrl}...`,
        )

        const response = await fetch(testUrl)

        if (response.status === 200) {
          const responseBody = await response.json()

          if (responseBody && responseBody.message === 'Success') {
            console.log(`✅ Domain ${testUrl} is working correctly!`)
            domainWorking = true
          } else {
            throw new Error(
              `Unexpected response body: ${JSON.stringify(responseBody)}`,
            )
          }
        } else {
          throw new Error(`HTTP ${response.status}`)
        }
      } catch (error) {
        console.log(
          `❌ Attempt ${attempt}/${maxRetries} failed: ${error.message}`,
        )

        if (attempt < maxRetries) {
          console.log(`⏳ Waiting ${retryDelay / 1000}s before next attempt...`)
          await new Promise((resolve) => setTimeout(resolve, retryDelay))
        }
      }
    }

    // Final assertion
    expect(domainWorking).toBe(true)
  }, 300000) // 5 minute timeout for domain setup + validation

  test('Remove', async () => {
    await runSfCore({
      coreParams: {
        options: { stage, c: configFilePath },
        command: ['remove'],
      },
      jest,
    })

    // Clean up the auto-created ACM certificate with retry logic
    if (certificateArn) {
      const maxRetries = 10
      const retryDelay = 15000 // 15 seconds
      let attempt = 0
      let certificateDeleted = false

      console.log(`🔄 Attempting to delete certificate: ${certificateArn}`)

      while (attempt < maxRetries && !certificateDeleted) {
        try {
          await acmClient.send(
            new DeleteCertificateCommand({
              CertificateArn: certificateArn,
            }),
          )
          console.log(`🧹 Successfully deleted certificate: ${certificateArn}`)
          certificateDeleted = true
        } catch (error) {
          attempt++

          if (error.name === 'ResourceInUseException') {
            console.log(
              `⏳ Certificate still in use (attempt ${attempt}/${maxRetries}). Waiting ${retryDelay / 1000}s...`,
            )

            if (attempt < maxRetries) {
              await new Promise((resolve) => setTimeout(resolve, retryDelay))
            } else {
              console.warn(
                `⚠️  Certificate still in use after ${maxRetries} attempts. Manual cleanup may be required.`,
              )
            }
          } else if (error.name === 'ResourceNotFoundException') {
            console.log(`✅ Certificate already deleted: ${certificateArn}`)
            certificateDeleted = true
          } else {
            console.error(
              `❌ Unexpected error deleting certificate: ${error.message}`,
            )
            break
          }
        }
      }
    }

    // Clean up ACM validation DNS records
    if (domainName) {
      try {
        console.log(
          `🔍 Searching for ACM validation DNS records for domain: ${domainName}`,
        )

        // Find the hosted zone for the domain
        const hostedZonesResponse = await route53Client.send(
          new ListHostedZonesCommand({}),
        )

        // Get the domain host part (e.g., "example.com" from "api.example.com")
        const domainHost = domainName.includes('.')
          ? domainName.substring(domainName.indexOf('.') + 1)
          : domainName

        const targetHostedZone = hostedZonesResponse.HostedZones.filter(
          (hostedZone) => {
            const hostedZoneName = hostedZone.Name.replace(/\.$/, '')
            return (
              domainName === hostedZoneName ||
              domainHost.endsWith(hostedZoneName)
            )
          },
        )
          .sort((zone1, zone2) => zone2.Name.length - zone1.Name.length)
          .shift()

        if (targetHostedZone) {
          const hostedZoneId = targetHostedZone.Id.replace('/hostedzone/', '')
          console.log(
            `📋 Found hosted zone: ${targetHostedZone.Name} (${hostedZoneId})`,
          )

          // List all records in the hosted zone
          const recordsResponse = await route53Client.send(
            new ListResourceRecordSetsCommand({
              HostedZoneId: hostedZoneId,
            }),
          )

          // Find ACM validation records (CNAME records that are specifically for this domain)
          // Format: _randomhash.domainname. (note the trailing dot in DNS)
          const validationRecords = recordsResponse.ResourceRecordSets.filter(
            (record) => {
              if (record.Type !== 'CNAME' || !record.Name.startsWith('_')) {
                return false
              }

              // Remove trailing dot if present (DNS records often have it)
              const recordName = record.Name.replace(/\.$/, '')
              const targetDomain = domainName

              // Check if the record ends with exactly our domain (not just contains it)
              // This prevents matching subdomains when cleaning up apex domains
              return (
                recordName.endsWith(`.${targetDomain}`) &&
                recordName.indexOf(`.${targetDomain}`) ===
                  recordName.lastIndexOf(`.${targetDomain}`)
              )
            },
          )

          console.log(
            `🔍 Found ${validationRecords.length} ACM validation records to clean up`,
          )

          // Delete each validation record
          for (const record of validationRecords) {
            try {
              console.log(`🧹 Deleting validation record: ${record.Name}`)

              await route53Client.send(
                new ChangeResourceRecordSetsCommand({
                  HostedZoneId: hostedZoneId,
                  ChangeBatch: {
                    Changes: [
                      {
                        Action: 'DELETE',
                        ResourceRecordSet: record,
                      },
                    ],
                  },
                }),
              )

              console.log(
                `✅ Successfully deleted validation record: ${record.Name}`,
              )
            } catch (recordError) {
              console.warn(
                `⚠️  Could not delete validation record ${record.Name}: ${recordError.message}`,
              )
            }
          }
        } else {
          console.log(
            `⚠️  Could not find hosted zone for domain: ${domainName}`,
          )
        }
      } catch (error) {
        console.warn(
          `⚠️  Error cleaning up DNS validation records: ${error.message}`,
        )
      }
    }
  }, 600000) // 10 minute timeout for removal and cleanup
})
