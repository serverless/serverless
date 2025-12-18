import { z } from 'zod'

export const ConfigAwsIntegrationSlackSchema = z
  .object({
    type: z.literal('slack'),
    name: z.string().describe('Display name for the Slack app'),
    socketMode: z
      .boolean()
      .default(false)
      .describe('Whether to use socket mode for the Slack app'),
    webhookPath: z
      .string()
      .describe(
        'Path to receive slack events at, if not set the default path will be `/integrations/<name>/slack`',
      )
      .optional(),
    credentials: z
      .object({
        signingSecret: z
          .string()
          .describe('The signing secret for the Slack app'),
        botToken: z.string().describe('The bot token for the Slack app'),
        appToken: z
          .string()
          .describe(
            'The app token for the Slack app, if socketMode is enabled then this must be provided',
          )
          .optional(),
      })
      .optional(),
  })
  .superRefine((val, ctx) => {
    if (val.socketMode && val.credentials && !val.credentials.appToken) {
      return ctx.addIssue({
        code: 'invalid-credentials',
        message: 'appToken is required when socketMode is enabled',
      })
    }
  })

export const ConfigAwsIntegrationEventbridgeSchema = z.object({
  type: z.literal('awsEventBridge'),
  webhookPath: z
    .string()
    .describe(
      'Path to receive eventbridge events at, if not set the default path will be `/integrations/<name>/eventbridge`',
    )
    .optional(),
  pattern: z
    .record(z.string(), z.any())
    .describe('The pattern to filter events by'),
})

export const ConfigAwsIntegrationScheduleSchema = z.object({
  type: z.literal('schedule'),
  webhookPath: z
    .string()
    .describe(
      'Path to receive schedule events at, if not set the default path will be `/integrations/<name>/schedule`',
    )
    .optional(),
  schedule: z
    .string()
    .describe(
      'The schedule to run the handler function, either in rate format or cron format',
    ),
})

export const ConfigAwsIntegrationsSchema = z.record(
  z.string(),
  z.union([
    ConfigAwsIntegrationEventbridgeSchema,
    ConfigAwsIntegrationSlackSchema,
    ConfigAwsIntegrationScheduleSchema,
  ]),
)
