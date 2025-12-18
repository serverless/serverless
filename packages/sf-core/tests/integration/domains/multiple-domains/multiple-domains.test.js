/* eslint-disable no-undef */
import path from 'path'
import readConfig from '@serverless/framework/lib/configuration/read.js'
import url from 'url'
import { setGlobalRendererSettings } from '@serverless/util'
import {
  ACMClient,
  ListCertificatesCommand,
  DeleteCertificateCommand,
} from '@aws-sdk/client-acm'
import {
  Route53Client,
  ListHostedZonesCommand,
  ListResourceRecordSetsCommand,
  ChangeResourceRecordSetsCommand,
} from '@aws-sdk/client-route-53'
import { jest } from '@jest/globals'
import { getTestStageName, runSfCore } from '../../../utils/runSfCore'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))

describe('Serverless Framework Service - Domains Multiple Domains', () => {
  const configFileDirPath = path.join(__dirname, 'fixture')
  const acmClient = new ACMClient({ region: 'us-east-1' })
  const route53Client = new Route53Client({ region: 'us-east-1' })
  const originalEnv = process.env
  const stage = getTestStageName()
  let service, configFilePath, domains, certificateArns
  let deploymentSucceeded = false

  beforeAll(async () => {
    setGlobalRendererSettings({
      isInteractive: false,
      logLevel: 'error',
    })
    configFilePath = path.join(configFileDirPath, 'serverless.yml')
    service = await readConfig(configFilePath)

    // Handle multiple domains array
    domains = service.provider.domains || []
    certificateArns = []
    console.log(`📋 Testing multiple domains: ${domains.join(', ')}`)
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

    // Find the auto-created certificates for cleanup
    const certificatesResponse = await acmClient.send(
      new ListCertificatesCommand({
        CertificateStatuses: ['ISSUED', 'PENDING_VALIDATION'],
      }),
    )

    // Find certificates for all our domains
    for (const domainName of domains) {
      const certificate = certificatesResponse.CertificateSummaryList.find(
        (cert) => cert.DomainName === domainName,
      )

      if (certificate) {
        certificateArns.push(certificate.CertificateArn)
        console.log(
          `📜 Found certificate for cleanup: ${domainName} -> ${certificate.CertificateArn}`,
        )
      }
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

    // Test all domains
    const maxRetries = 30
    const retryDelay = 10000 // 10 seconds
    const domainResults = {}

    console.log(
      `🔄 Testing ${domains.length} domains (max ${maxRetries} attempts each, ${retryDelay / 1000}s intervals)...`,
    )

    // Test each domain
    for (const domainName of domains) {
      let attempt = 0
      let domainWorking = false

      console.log(`\n🎯 Testing domain: ${domainName}`)

      while (attempt < maxRetries && !domainWorking) {
        attempt++

        try {
          const testUrl = `https://${domainName}`

          console.log(
            `⏳ Attempt ${attempt}/${maxRetries}: Testing ${testUrl}...`,
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
            console.log(
              `⏳ Waiting ${retryDelay / 1000}s before next attempt...`,
            )
            await new Promise((resolve) => setTimeout(resolve, retryDelay))
          }
        }
      }

      domainResults[domainName] = domainWorking
    }

    // Log results summary
    console.log('\n📊 Domain Test Results:')
    for (const [domain, working] of Object.entries(domainResults)) {
      console.log(
        `  ${working ? '✅' : '❌'} ${domain}: ${working ? 'WORKING' : 'FAILED'}`,
      )
    }

    // Final assertion - all domains must be working
    const allDomainsWorking = Object.values(domainResults).every(
      (working) => working,
    )
    expect(allDomainsWorking).toBe(true)
  }, 600000) // 10 minute timeout for multiple domain setup + validation

  test('Remove', async () => {
    await runSfCore({
      coreParams: {
        options: { stage, c: configFilePath },
        command: ['remove'],
      },
      jest,
    })

    // Clean up the auto-created ACM certificates with retry logic
    if (certificateArns.length > 0) {
      console.log(
        `🔄 Attempting to delete ${certificateArns.length} certificates...`,
      )

      for (const certificateArn of certificateArns) {
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
            console.log(
              `🧹 Successfully deleted certificate: ${certificateArn}`,
            )
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
    }

    // Clean up ACM validation DNS records for all domains
    if (domains.length > 0) {
      console.log(
        `🔍 Cleaning up DNS validation records for ${domains.length} domains...`,
      )

      // Get hosted zones once
      const hostedZonesResponse = await route53Client.send(
        new ListHostedZonesCommand({}),
      )

      for (const domainName of domains) {
        try {
          console.log(
            `🔍 Searching for ACM validation DNS records for domain: ${domainName}`,
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
              `📋 Found hosted zone for ${domainName}: ${targetHostedZone.Name} (${hostedZoneId})`,
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
              `🔍 Found ${validationRecords.length} ACM validation records to clean up for ${domainName}`,
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
            `⚠️  Error cleaning up DNS validation records for ${domainName}: ${error.message}`,
          )
        }
      }
    }
  }, 900000) // 15 minute timeout for multiple domain removal and cleanup
})
