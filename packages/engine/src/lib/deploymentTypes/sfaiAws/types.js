import { z } from 'zod'

const ServerlessAiManifestOrchestratorSchema = z.object({
  port: z.number().describe('The port to listen on').default(8080),
  baseUrl: z
    .string()
    .describe('The base URL to use')
    .default('http://localhost:8080/v1'),
  devDashboard: z
    .boolean()
    .describe('Whether to enable the dev dashboard')
    .default(false),
})

const ServerlessAiManifestAgentIntegrationSlackSchema = z.object({
  type: z.literal('slack'),
  path: z.string().describe('The webhook URL to use for the Slack app'),
  handler: z.string().describe('The path to the handler function').optional(),
  config: z.object({
    name: z.string().describe('The name of the Slack app'),
    socketMode: z
      .boolean()
      .describe('Whether to use socket mode for the Slack app')
      .default(false),
    credentialsEnvironmentVariables: z.object({
      botToken: z
        .string()
        .describe('The environment variable name for the bot token'),
      signingSecret: z
        .string()
        .describe('The environment variable name for the signing secret'),
      appToken: z
        .string()
        .describe('The environment variable name for the app token'),
    }),
  }),
})

const ServerlessAiManifestAgentIntegrationStreamSchema = z.object({
  type: z.literal('stream'),
  handler: z.string().describe('The path to the handler function'),
})

const ServerlessAiManifestAgentIntegrationEventBridgeSchema = z.object({
  type: z.literal('awsEventBridge'),
  handler: z.string().describe('The path to the handler function'),
  path: z
    .string()
    .describe('The webhook URL to use for the EventBridge app')
    .optional(),
  config: z.object({
    pattern: z
      .record(z.string(), z.any())
      .describe('The pattern to filter events by'),
    webhookSecretEnvironmentName: z
      .string()
      .describe(
        'The webhook secret environment variable name to use for the EventBridge app',
      )
      .optional(),
  }),
})

const ServerlessAiManifestAgentIntegrationScheduleSchema = z.object({
  type: z.literal('schedule'),
  handler: z.string().describe('The path to the handler function'),
  config: z.object({
    schedule: z
      .string()
      .describe(
        'The schedule to run the handler function, either in rate format or cron format',
      ),
  }),
})

const ServerlessAiManifestAgentIntegrationMcpSchema = z.object({
  type: z.literal('mcp'),
  handler: z.string().describe('The path to the handler function').optional(),
  path: z.string().describe('The URL path to the MCP SSE endpoint').optional(),
  config: z
    .object({
      description: z
        .string()
        .describe('The description of the MCP that would be used by tool calls')
        .optional(),
      credentialsEnvironmentVariables: z
        .object({
          bearerToken: z
            .string()
            .describe('The bearer token to use for the MCP')
            .optional(),
        })
        .optional(),
    })
    .optional(),
})

// const ConfigSfaiAwsIntegrationScheduleSchema = z.object({
//   type: z.literal('schedule'),
//   handler: z.string().describe('Path to the handler function'),
//   schedule: z.string().describe('The schedule to run the handler function, either in rate format or cron format'),
// })

const ServerlessAiManifestAgentSchema = z.object({
  name: z.string().describe('The name of the agent'),
  type: z.enum(['mastraAgent']).describe('The type of agent to deploy'),
  entryPoint: z.string().describe('The entry point for the agent'),
  integrations: z
    .record(
      z.string(),
      z.union([
        ServerlessAiManifestAgentIntegrationSlackSchema,
        ServerlessAiManifestAgentIntegrationStreamSchema,
        ServerlessAiManifestAgentIntegrationEventBridgeSchema,
        ServerlessAiManifestAgentIntegrationScheduleSchema,
        ServerlessAiManifestAgentIntegrationMcpSchema,
      ]),
    )
    .describe('The integrations to use for the agent'),
})

export const ServerlessAiManifestSchema = z.object({
  orchestrator: ServerlessAiManifestOrchestratorSchema.default({
    port: 8080,
    baseUrl: 'http://localhost:8080/v1',
    devDashboard: false,
  }),
  agent: ServerlessAiManifestAgentSchema,
})
