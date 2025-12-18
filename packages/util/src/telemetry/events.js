import { z } from 'zod'

const SfCoreAnalysisGeneratedBody = z.object({
  orgId: z.string(),
  userId: z.string().optional(),
  machineId: z.string().optional(),
  source: z.string(),
  actionName: z.string(),
  configurationFileName: z.string(),
  actionSucceeded: z.boolean(),
  error: z.object({
    name: z.string(),
    message: z.string(),
    stacktrace: z.string().optional(),
    code: z.string().optional(),
  }),
  isEsbuildEnabled: z.boolean(),
  operatingSystem: z.string(),
  architecture: z.string(),
  providerRuntime: z.string().optional(),
  runtimes: z.array(z.string()).optional(),
  plugins: z.array(z.string()).optional(),
  cliOptions: z.array(z.string()).optional(),
  cicd: z.boolean(),
  resolvers: z.array(z.string()).optional(),
})

export { SfCoreAnalysisGeneratedBody }
