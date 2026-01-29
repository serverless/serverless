'use strict'

/**
 * Info display commands for AgentCore resources
 *
 * Shows information about configured AgentCore resources including
 * gateways, tools, memories, runtimes, browsers, and code interpreters.
 */

import { detectTargetType } from '../compilers/gatewayTarget.js'
import { collectAllTools } from '../compilation/orchestrator.js'
import { isReservedAgentKey } from '../validators/config.js'

/**
 * Display deployment information after deploy
 *
 * @param {object} config - Configuration object
 * @param {object} config.agents - Agent configurations
 */
export function displayDeploymentInfo(config) {
  const { agents } = config

  if (!agents || Object.keys(agents).length === 0) {
    return
  }

  // Resources deployed - no verbose output needed
}

/**
 * Show information about AgentCore resources
 *
 * @param {object} config - Configuration object
 * @param {object} config.agents - Agent configurations
 * @param {object} config.log - Logger instance
 * @param {object} config.options - Command options (e.g., verbose)
 * @param {object} config.provider - Serverless provider instance
 */
export async function showInfo(config) {
  const { agents, log, options, provider } = config

  if (!agents || Object.keys(agents).length === 0) {
    log.notice('No AgentCore resources defined in this service.')
    return
  }

  log.notice('AgentCore Resources:')
  log.notice('')

  // Check if gateway exists and show its URL
  const { hasTools } = collectAllTools(agents)
  if (hasTools) {
    log.notice('Gateway:')
    log.notice('  Auto-created gateway for tools')
    // Try to get gateway URL from stack outputs
    try {
      const stackName = provider.naming.getStackName()
      const result = await provider.request(
        'CloudFormation',
        'describeStacks',
        {
          StackName: stackName,
        },
      )
      const stack = result.Stacks?.[0]
      const urlOutput = stack?.Outputs?.find(
        (o) => o.OutputKey === 'AgentCoreGatewayUrl',
      )
      if (urlOutput) {
        log.notice(`  URL: ${urlOutput.OutputValue}`)
      }
    } catch {
      log.notice('  URL: (deploy to see URL)')
    }
    log.notice('')
  }

  // Display shared memory
  if (agents.memory) {
    log.notice('Shared Memory:')
    for (const [memoryName, memoryConfig] of Object.entries(agents.memory)) {
      log.notice(`  ${memoryName}:`)
      log.notice(`    Type: Memory (shared)`)
      if (memoryConfig.description) {
        log.notice(`    Description: ${memoryConfig.description}`)
      }
      if (memoryConfig.expiration) {
        log.notice(`    Expiration: ${memoryConfig.expiration} days`)
      }
      if (options.verbose) {
        log.notice(`    Config: ${JSON.stringify(memoryConfig, null, 2)}`)
      }
      log.notice('')
    }
  }

  // Display shared tools
  if (agents.tools) {
    log.notice('Shared Tools:')
    for (const [toolName, toolConfig] of Object.entries(agents.tools)) {
      log.notice(`  ${toolName}:`)
      try {
        const toolType = detectTargetType(toolConfig)
        log.notice(`    Type: ${toolType}`)
      } catch {
        log.notice(`    Type: unknown`)
      }
      if (toolConfig.description) {
        log.notice(`    Description: ${toolConfig.description}`)
      }
      if (options.verbose) {
        log.notice(`    Config: ${JSON.stringify(toolConfig, null, 2)}`)
      }
      log.notice('')
    }
  }

  // Display runtime agents (non-reserved keys)
  log.notice('Runtime Agents:')
  let hasRuntimeAgents = false
  for (const [name, agentConfig] of Object.entries(agents)) {
    // Skip reserved keys
    if (isReservedAgentKey(name)) {
      continue
    }
    hasRuntimeAgents = true
    log.notice(`  ${name}:`)
    log.notice(`    Type: Runtime`)

    if (agentConfig.description) {
      log.notice(`    Description: ${agentConfig.description}`)
    }

    // Show memory info for runtimes
    if (agentConfig.memory) {
      if (typeof agentConfig.memory === 'string') {
        log.notice(`    Memory: ${agentConfig.memory} (shared reference)`)
      } else {
        log.notice(`    Memory: inline`)
      }
    }

    // Show gateway info for runtimes
    if (agentConfig.gateway) {
      log.notice(`    Gateway: ${agentConfig.gateway}`)
    }

    if (options.verbose) {
      log.notice(`    Config: ${JSON.stringify(agentConfig, null, 2)}`)
    }

    log.notice('')
  }
  if (!hasRuntimeAgents) {
    log.notice('  (none)')
    log.notice('')
  }

  // Display browsers
  if (agents.browsers && Object.keys(agents.browsers).length > 0) {
    log.notice('Browsers:')
    for (const [name, browserConfig] of Object.entries(agents.browsers)) {
      log.notice(`  ${name}:`)
      if (browserConfig.description) {
        log.notice(`    Description: ${browserConfig.description}`)
      }
      if (options.verbose) {
        log.notice(`    Config: ${JSON.stringify(browserConfig, null, 2)}`)
      }
      log.notice('')
    }
  }

  // Display codeInterpreters
  if (
    agents.codeInterpreters &&
    Object.keys(agents.codeInterpreters).length > 0
  ) {
    log.notice('Code Interpreters:')
    for (const [name, ciConfig] of Object.entries(agents.codeInterpreters)) {
      log.notice(`  ${name}:`)
      if (ciConfig.description) {
        log.notice(`    Description: ${ciConfig.description}`)
      }
      if (options.verbose) {
        log.notice(`    Config: ${JSON.stringify(ciConfig, null, 2)}`)
      }
      log.notice('')
    }
  }
}
