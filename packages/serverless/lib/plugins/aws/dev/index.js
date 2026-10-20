import validate from '../lib/validate.js'
import { log, progress, ServerlessError } from '@serverless/util'
import { devModeRanIn } from './state/paths.js'
import { serviceHasWebApps } from '../lib/web-apps.js'
import {
  devModeCommandHooks,
  restoreFunctionBeforeDeployFunction,
  restoreStageBeforeCommand,
  runDevRestore,
  runDevSetup,
} from './attach/commands.js'
import { runDevCommand, validateOnExit } from './commands/dev.js'
import { runDevStatus } from './commands/status.js'
import { runDevStop } from './commands/stop.js'
import { runDevWait } from './commands/wait.js'
import { runDevRequests } from './commands/requests.js'
import { runDevReplay } from './commands/replay.js'
import { setCliNames } from './commands/cli-names.js'
import {
  errorResult,
  jsonNeedsFinite,
  jsonRequested,
  printResult,
} from './commands/envelope.js'

const logger = log.get('sls:dev')
// The commands that restore the stage, or the function, before their own work.
const RESTORE_FIRST_COMMANDS = new Set([
  'deploy',
  'remove',
  'rollback',
  'deploy function',
])

/**
 * Constructs an instance of the dev mode plugin, setting up initial properties
 * and configuring hooks based on command inputs.
 *
 * @constructor
 * @param {Object} serverless - The serverless instance
 * @param {Object} [options={}] - The options passed to the plugin, with
 * defaults to an empty object if not provided.
 */
class AwsDev {
  constructor(serverless, options) {
    this.serverless = serverless
    this.options = options || {}
    this.provider = this.serverless.getProvider('aws')

    Object.assign(this, validate)

    this.commands = {
      'dev-build': {
        groupName: 'main',
        options: {},
        usage: 'Runs Dev Mode invocation',
        lifecycleEvents: ['build'],
        serviceDependencyMode: 'required',
        hasAwsExtension: true,
        type: 'entrypoint',
      },
    }
    // The Framework's own esbuild build hooks the `dev-build` lifecycle (internal; not a plugin
    // API); `serverless dev` spawns it before the first invocation and after each change.
    this.hooks = {
      'dev:dev': async () => await this.dev(),
      'dev-build:build': async () => {},
    }
    const commandName = this.serverless.processedInput.commands.join(' ')
    // A Dev Mode command names the commands and files it prints as they work from where it runs.
    if (commandName === 'dev' || commandName.startsWith('dev ')) {
      setCliNames({ serverless: this.serverless, options: this.options })
    }
    // Whether a session ran here, read now: `deploy` empties .serverless/ while it packages,
    // before its restore-first check runs.
    const devModeRanHere = RESTORE_FIRST_COMMANDS.has(commandName)
      ? devModeRanIn(this.serverless.serviceDir)
      : false

    Object.assign(
      this.hooks,
      devModeCommandHooks({
        commandName,
        options: this.options,
        handlers: {
          setup: async () =>
            runDevSetup({ provider: this.provider, options: this.options }),
          restore: async () => {
            const exitCode = await runDevRestore({
              serverless: this.serverless,
              provider: this.provider,
              options: this.options,
            })
            if (exitCode !== 0) this.setExitCode(exitCode)
          },
          status: async () => this.finite(runDevStatus),
          stop: async () => this.finite(runDevStop),
          wait: async () => this.finite(runDevWait),
          requests: async () => this.finite(runDevRequests),
          // `options.requestId` is the command's positional argument (`dev replay <requestId>`).
          replay: async () => this.finite(runDevReplay),
          restoreStage: (verb) => async () =>
            restoreStageBeforeCommand({
              serverless: this.serverless,
              provider: this.provider,
              verb,
              timestamp: this.options.timestamp,
              devModeRanHere,
            }),
          restoreFunction: async () =>
            restoreFunctionBeforeDeployFunction({
              serverless: this.serverless,
              provider: this.provider,
              functionKey: this.options.function,
              devModeRanHere,
            }),
        },
      }),
    )
  }

  /**
   * Validate the --mode option value
   */
  validateModeOption() {
    const validModes = ['functions', 'agents', 'sandboxes']
    const mode = this.options.mode

    if (mode === undefined) {
      return
    }

    if (!validModes.includes(mode)) {
      throw new ServerlessError(
        `Option "--mode" must be one of: ${validModes.join(', ')}.`,
        'INVALID_DEV_MODE_OPTION',
        { stack: false },
      )
    }
  }

  /**
   * Check if agents dev mode should be used
   * @returns {boolean} True if agents dev mode should be used
   */
  shouldUseAgentsDevMode() {
    const mode = this.options.mode
    const hasFunctions =
      Object.keys(this.serverless.service.functions || {}).length > 0
    const hasAgents =
      Object.keys(
        this.serverless.service.initialServerlessConfig?.ai?.agents || {},
      ).length > 0

    if (mode === 'agents') {
      if (!hasAgents) {
        throw new ServerlessError(
          'No agents defined in configuration. Cannot use --mode agents.',
          'NO_AGENTS_DEFINED',
        )
      }
      return true
    }

    if (mode === 'functions') {
      return false
    }

    /**
     * No explicit --mode provided: auto-detect based on configuration.
     * If no functions but agents exist, auto-select agents mode.
     */
    if (!hasFunctions && hasAgents) {
      return true
    }

    return false
  }

  /**
   * Check if sandboxes dev mode should be used
   * @returns {boolean} True if sandboxes dev mode should be used
   */
  shouldUseSandboxesDevMode() {
    const mode = this.options.mode
    const hasSandboxes =
      Object.keys(
        this.serverless.service.sandboxes ||
          this.serverless.configurationInput?.sandboxes ||
          {},
      ).length > 0

    // If --sandbox was explicitly provided, always route to sandbox mode
    // regardless of what else is defined in the service (functions, agents, etc.).
    if (this.options.sandbox !== undefined) {
      if (!hasSandboxes) {
        throw new ServerlessError(
          'No sandboxes defined in configuration. Cannot use --sandbox.',
          'NO_SANDBOXES_DEFINED',
          { stack: false },
        )
      }
      return true
    }

    if (mode === 'sandboxes') {
      if (!hasSandboxes) {
        throw new ServerlessError(
          'No sandboxes defined in configuration. Cannot use --mode sandboxes.',
          'NO_SANDBOXES_DEFINED',
          { stack: false },
        )
      }
      return true
    }
    if (mode === 'functions' || mode === 'agents') return false
    // Auto-detect: only sandboxes defined (no functions, no agents).
    const hasFunctions =
      Object.keys(this.serverless.service.functions || {}).length > 0
    const hasAgents =
      Object.keys(
        this.serverless.service.initialServerlessConfig?.ai?.agents || {},
      ).length > 0
    return hasSandboxes && !hasFunctions && !hasAgents
  }

  /**
   * Start sandboxes dev mode using the SandboxesDevMode plugin
   * @async
   * @returns {Promise<void>}
   */
  async startSandboxesDevMode() {
    const { default: SandboxesDevMode } =
      await import('../sandboxes/dev/index.js')
    const dev = new SandboxesDevMode(this.serverless, this.options, {
      log,
      progress,
    })
    await dev.run()
  }

  /**
   * Start agents dev mode using the AgentCore plugin
   * @async
   * @returns {Promise<void>}
   */
  async startAgentsDevMode() {
    const { AgentCoreDevMode } =
      await import('../bedrock-agentcore/dev/index.js')
    const { getLogicalId, getGatewayLogicalId } =
      await import('../bedrock-agentcore/utils/naming.js')

    const aiConfig = this.serverless.service.initialServerlessConfig?.ai || {}
    const agents = aiConfig.agents || {}
    const agentsConfig = Object.entries(agents).filter(([, config]) => {
      // Only include runtime agents (type: 'runtime' or no type specified for backwards compat)
      return !config.type || config.type === 'runtime'
    })

    if (agentsConfig.length === 0) {
      throw new ServerlessError(
        'No runtime agents found in configuration. Dev mode only supports runtime agents.',
        'NO_RUNTIME_AGENTS',
      )
    }

    // Determine which agent to run
    let agentName = this.options.agent
    if (!agentName) {
      if (agentsConfig.length > 1) {
        throw new ServerlessError(
          `Multiple agents found. Use -a to specify which agent to run in dev mode:\n` +
            agentsConfig.map(([n]) => `  - ${n}`).join('\n'),
          'MULTIPLE_AGENTS_NO_SELECTION',
          { stack: false },
        )
      }
      agentName = agentsConfig[0][0]
    }

    const agentConfig = agents[agentName]
    if (!agentConfig) {
      throw new ServerlessError(
        `Agent '${agentName}' not found in configuration. Available agents:\n` +
          agentsConfig.map(([n]) => `  - ${n}`).join('\n'),
        'AGENT_NOT_FOUND',
        { stack: false },
      )
    }

    // Get the port
    const port = this.options.port ? parseInt(this.options.port, 10) : 8080

    // Get deployed role ARN and other IDs from CloudFormation stack
    const mainProgress = progress.get('main')
    mainProgress.notice(`Starting agents dev mode for '${agentName}'...`)

    const stackName = this.provider.naming.getStackName()
    let roleArn
    let gatewayUrl
    let memoryId
    let stackOutputs = []

    try {
      const result = await this.provider.request(
        'CloudFormation',
        'describeStacks',
        { StackName: stackName },
      )

      const stack = result.Stacks?.[0]
      if (!stack) {
        throw new Error(`Stack ${stackName} not found`)
      }
      stackOutputs = stack.Outputs || []

      // 1. Get Role ARN
      const roleLogicalId = getLogicalId(agentName, 'Runtime')
      const roleOutputKey = `${roleLogicalId}RoleArn`
      const roleOutput = stack.Outputs?.find(
        (o) => o.OutputKey === roleOutputKey,
      )
      if (roleOutput) {
        roleArn = roleOutput.OutputValue
      } else if (
        typeof agentConfig.role === 'string' &&
        agentConfig.role.startsWith('arn:')
      ) {
        roleArn = agentConfig.role
      } else {
        throw new Error(`Role ARN output not found for agent '${agentName}'`)
      }

      // 2. Get Gateway URL - resolve from agent's gateway reference or default
      // Mirrors compiler logic: named gateway if agent specifies one,
      // default gateway if no explicit gateways defined, otherwise none
      const hasGateways = Object.keys(aiConfig.gateways || {}).length > 0
      if (agentConfig.gateway) {
        const gatewayOutputKey = `${getGatewayLogicalId(agentConfig.gateway)}Url`
        const gatewayOutput = stackOutputs.find(
          (o) => o.OutputKey === gatewayOutputKey,
        )
        if (gatewayOutput) {
          gatewayUrl = gatewayOutput.OutputValue
        }
      } else if (!hasGateways) {
        const gatewayOutputKey = `${getGatewayLogicalId()}Url`
        const gatewayOutput = stackOutputs.find(
          (o) => o.OutputKey === gatewayOutputKey,
        )
        if (gatewayOutput) {
          gatewayUrl = gatewayOutput.OutputValue
        }
      }

      // 3. Get Memory ID if memory is configured
      if (agentConfig.memory) {
        const memoryName =
          typeof agentConfig.memory === 'string'
            ? agentConfig.memory
            : `${agentName}-memory`
        const memoryLogicalId = getLogicalId(memoryName, 'Memory')
        const memoryOutputKey = `${memoryLogicalId}Id`
        const memoryOutput = stack.Outputs?.find(
          (o) => o.OutputKey === memoryOutputKey,
        )
        if (memoryOutput) {
          memoryId = memoryOutput.OutputValue
        }
      }
    } catch (error) {
      mainProgress.remove()
      throw new ServerlessError(
        `Failed to gather deployed agent resources. Make sure the agent is deployed first.\n` +
          `Run 'serverless deploy' to deploy the agent.\n` +
          `Error: ${error.message}`,
        'AGENT_RESOURCES_NOT_FOUND',
        { stack: false },
      )
    }

    // Prepare environment variables
    const providerEnv = this.serverless.service.provider.environment || {}
    const agentEnv = agentConfig.environment || {}

    // Merge: provider-level variables first, then agent-level (agent-level overrides provider-level)
    agentConfig.environment = {
      ...providerEnv,
      ...agentEnv,
    }

    // Resolve CloudFormation intrinsic functions (e.g. !GetAtt, !Ref, !ImportValue)
    // in environment variables from their deployed stack values.
    const resolveCfEnvVars = (await import('../utils/resolve-cf-env-vars.js'))
      .default
    await resolveCfEnvVars(this.provider, agentConfig.environment, stackOutputs)

    // Inject auto-discovered Bedrock AgentCore resources
    if (gatewayUrl) {
      agentConfig.environment.BEDROCK_AGENTCORE_GATEWAY_URL = gatewayUrl
    }
    if (memoryId) {
      agentConfig.environment.BEDROCK_AGENTCORE_MEMORY_ID = memoryId
    }

    // Add standard SLS_ variables for consistency with regular dev mode
    agentConfig.environment.SLS_SERVICE = this.serverless.service.service
    agentConfig.environment.SLS_STAGE = this.provider.getStage()
    agentConfig.environment.SLS_AGENT = agentName

    mainProgress.remove()

    // Start dev mode
    const devMode = new AgentCoreDevMode({
      serverless: this.serverless,
      provider: this.provider,
      serviceName: this.serverless.service.service,
      projectPath: this.serverless.serviceDir,
      agentName,
      agentConfig,
      region: this.provider.getRegion(),
      roleArn,
      port,
    })

    try {
      await devMode.start()
    } catch (error) {
      await devMode.stop()
      throw new ServerlessError(
        `Agents dev mode failed: ${error.message}`,
        'AGENTS_DEV_MODE_FAILED',
        { stack: false },
      )
    }
  }

  /**
   * The main handler for dev mode. Sandboxes and agents have their own sessions; functions mode
   * attaches the deployed functions to this machine and restores them on exit
   * (`./attach/session.js`), or with --dry-run only checks and prints what it would change
   * (`./commands/dev.js`). A session that could not attach or restore everything exits 3.
   *
   * @async
   * @returns {Promise<void>} Resolves when the session has ended.
   */
  async dev() {
    this.validateModeOption()
    this.validateFunctionsModeOptions()

    if (this.shouldUseSandboxesDevMode()) {
      this.noticeWebAppsNotRun()
      return await this.startSandboxesDevMode()
    }

    if (this.shouldUseAgentsDevMode()) {
      this.noticeWebAppsNotRun()
      return await this.startAgentsDevMode()
    }

    this.rejectWebAppsOnlyService()
    this.noticeWebAppsNotRun()

    // --on-exit is checked with the other option combinations, in runDevCommand.
    this.validateJsonOption()
    const exitCode = await runDevCommand({
      serverless: this.serverless,
      provider: this.provider,
      options: this.options,
      logger,
    })
    if (exitCode !== 0) this.setExitCode(exitCode)
  }

  /**
   * Dev Mode does not run web apps yet: a service with nothing else to run stops here, before
   * functions mode would report it has no functions.
   */
  rejectWebAppsOnlyService() {
    const hasFunctions =
      Object.keys(this.serverless.service.functions || {}).length > 0
    if (hasFunctions || !serviceHasWebApps(this.serverless)) return
    throw new ServerlessError(
      "serverless dev does not run web apps yet; support is planned. Start your web app's server locally to develop it.",
      'WEB_APPS_DEV_NOT_SUPPORTED',
      { stack: false },
    )
  }

  /** One line saying the session leaves the service's web apps out. */
  noticeWebAppsNotRun() {
    if (!serviceHasWebApps(this.serverless)) return
    logger.notice(
      'Web apps are not part of serverless dev yet; start their servers locally.',
    )
  }

  /**
   * Runs a finite Dev Mode command (`dev status`, `stop`, `wait`, `requests`, `replay`): its runner
   * returns `{ result, human }`; the human text goes to stderr, with --json the envelope is the
   * only thing on stdout, and a non-zero exit code is set for the shell and the CLI.
   */
  async finite(run) {
    const { result, human } = await run({
      serviceDir: this.serverless.serviceDir,
      options: this.options,
      provider: this.provider,
      serverless: this.serverless,
      logger,
    })
    const exitCode = printResult({
      json: jsonRequested(this.options),
      result,
      human,
      logger,
    })
    if (exitCode !== 0) this.setExitCode(exitCode)
  }

  /**
   * A Dev Mode command that ends non-zero without throwing (exit 3: a function not attached or not
   * restored) ends with that code. Every Dev Mode hook sets its code here and nowhere else:
   * `process.exitCode` is what the shell sees, and `serverless.exitCode` is what the CLI reports
   * the command (in Compose, this service) as not succeeded by.
   */
  setExitCode(exitCode) {
    process.exitCode = exitCode
    this.serverless.exitCode = exitCode
  }

  validateOnExitOption() {
    validateOnExit(this.options)
  }

  /**
   * The options of a functions-mode session (`--detach`, `--dry-run`, `--idle-timeout` and the
   * internal `--session-process`) mean nothing to the agents and sandboxes modes, which refuse
   * them when set (`--no-detach` is fine). `--json` there keeps the behaviour those modes have.
   */
  validateFunctionsModeOptions() {
    const functionsOnly = [
      'detach',
      'dry-run',
      'idle-timeout',
      'session-process',
    ].filter((name) => Boolean(this.options[name]))
    if (
      functionsOnly.length &&
      (this.shouldUseSandboxesDevMode() || this.shouldUseAgentsDevMode())
    ) {
      throw new ServerlessError(
        `${functionsOnly.map((name) => `--${name}`).join(', ')} work${functionsOnly.length === 1 ? 's' : ''} only in functions mode.`,
        'DEV_MODE_INVALID_OPTION_COMBINATION',
        { stack: false },
      )
    }
  }

  /** `--json` prints one result, which only `--detach` and `--dry-run` have. */
  validateJsonOption() {
    if (
      !jsonRequested(this.options) ||
      this.options.detach ||
      this.options['dry-run']
    ) {
      return
    }
    const error = new ServerlessError(
      jsonNeedsFinite(),
      'DEV_MODE_INVALID_OPTION_COMBINATION',
      { stack: false },
    )
    printResult({ json: true, result: errorResult(error), logger })
    throw error
  }
}

export default AwsDev
