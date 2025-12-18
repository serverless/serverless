import graphlib, { Graph } from '@dagrejs/graphlib'
import { randomUUID } from 'crypto'
import { ServerlessError, ServerlessErrorCodes } from '@serverless/util'
import { DEFAULT_AWS_CREDENTIAL_RESOLVER } from './manager.js'

/**
 * @typedef Placeholder
 * @property {string} original
 * @property {Fallback[]} fallbacks
 */

/**
 * @typedef Fallback
 * @property {string} providerName
 * @property {string} resolverType
 * @property {string} key
 * @property {Object} [dedicatedResolverConfig]
 * @property {Object} [resolverConfig]
 */

/**
 * @typedef dedicatedResolverConfig
 * @property {string} [region]
 */

/**
 * @typedef ResolverConfig
 * @property {string} [rawOrDecrypt]
 * @property {string} [stackName]
 * @property {string} [outputKey]
 * @property {string} [bucketName]
 * @property {string} [objectKey]
 */

/**
 * @typedef DedicatedResolverProvider
 * @property {string} providerName
 * @property {string} resolverName
 * @property {string} [region]
 * @property {string} [rawOrDecrypt]
 * @property {string} [stackName]
 * @property {string} [outputKey]
 * @property {string} [bucketName]
 * @property {string} [objectKey]
 */

/**
 * @typedef Format
 * @property {RegExp} regex
 * @property {Function} process
 */

/**
 * @typedef Formats
 * @property {Format} ssm
 * @property {Format} cf
 * @property {Format} file
 * @property {Format} s3
 * @property {Format} main
 */

// Regex for all resolvers in format: ${providerName:resolverType:key}
// and ${file(filePath)} or ${file(filePath):key}
const mainRegex = /^([^:()]+)(?:\((.*)\))?(?::(.*))?$/g

// Regex for legacy variable with optional part in parentheses:
// ${ssm:path} or ${ssm(region,rawOrDecrypt):path}
const legacyOptionalParenthesesRegex =
  /^(s3|ssm|output|cf)(?:\(([^,]*?)(?:,\s*([^)]+))?\))?:(.*)/g

const formats = {
  legacyOptionalParentheses: {
    regex: legacyOptionalParenthesesRegex,
    process: (
      [original, providerName, region, rawOrDecrypt, path],
      credentialResolverName,
    ) => {
      if (providerName === 'output') {
        return processOutput(path, original)
      } else if (providerName === 's3') {
        return processS3(path, original, credentialResolverName)
      } else if (providerName === 'ssm') {
        return processSsm(
          region,
          rawOrDecrypt,
          original,
          path,
          credentialResolverName,
        )
      } else if (providerName === 'cf') {
        return processCf(region, path, original, credentialResolverName)
      }
    },
  },
  main: {
    regex: mainRegex,
    process: ([original, providerName, params, resolverTypeAndKey]) => {
      // If only one group is matched, it's a literal value. Return null.
      if (providerName && !params && !resolverTypeAndKey) {
        return null
      }

      let resolverType, key
      if (resolverTypeAndKey) {
        // Use custom function to find colons outside of placeholders and parentheses
        const colonIndices = findIndicesOutsideParenthesesAndBraces(
          resolverTypeAndKey,
          [':'],
        )

        if (colonIndices.length > 0) {
          // If colon is found outside ${} and parentheses, split into resolverType and key
          // (covers provider:resolver:key format)
          const firstColonIndex = colonIndices[0]
          resolverType = resolverTypeAndKey.substring(0, firstColonIndex)
          key = resolverTypeAndKey.substring(firstColonIndex + 1)
        } else {
          // If no colon, it's just the key (covers provider:key format)
          key = resolverTypeAndKey
        }
      }

      if (providerName === 'file' || providerName === 'strToBool') {
        // Only concatenate params and key if both are defined
        if (providerName === 'file' || providerName === 'strToBool') {
          if (params && key) {
            // Both params and key are defined
            key = `${params}#${key}`
          } else if (params) {
            // Only params is defined
            key = params
          }
        }
      }

      if (params) {
        // Convert params to an array
        // Covers provider(param1,param2,paramN) format
        const commas = findIndicesOutsideParenthesesAndBraces(params, ',')
        params = splitUsingCommaIndices(params, commas)
          .map((elem) => elem.trim())
          .map((elem) =>
            /^['"].*['"]$/.test(elem) ? parseLiteralValue(elem) : elem,
          )
      }

      return {
        placeholder: {
          original,
          providerName,
          resolverType,
          params,
          key,
        },
      }
    },
  },
}

const extractPlaceholder = (currentString, credentialResolverName) => {
  for (const format of Object.values(formats)) {
    const matches = [...currentString.matchAll(format.regex)]
    for (const match of matches) {
      const result = format.process(match, credentialResolverName)
      if (result && result.placeholder) {
        return result.placeholder
      }
    }
  }
}

/**
 * Extract placeholders and dedicated resolver providers from a string.
 * @param {string} str - The string to extract placeholders from.
 * @returns {{placeholder: Placeholder | null}} - The extracted placeholder or null if the placeholder should be ignored.
 */
export const extractPlaceholderDetailsFromPlaceholderString = (
  str,
  credentialResolverName,
) => {
  const original = str
  str = trimBrackets(str)
  const fallbackBorders = findIndicesOutsideParenthesesAndBraces(str, ',')
  // Always add the end of the string as a fallback border
  fallbackBorders.push(str.length)
  const fallbacks = []
  let end = 0
  for (const commaIndex of fallbackBorders) {
    const currentString = str.substring(end, commaIndex).trim()
    end = commaIndex + 1
    if (/^['"].*['"]$/.test(currentString)) {
      // If the current string is a literal value in quotes, extract it
      // and add it as a fallback
      fallbacks.push({ literalValue: parseLiteralValue(currentString) })
    } else {
      // Otherwise, extract the placeholder
      const fallback = extractPlaceholder(currentString, credentialResolverName)
      fallback
        ? fallbacks.push(fallback)
        : fallbacks.push({ literalValue: parseLiteralValue(currentString) })
    }
  }
  const placeholder = {
    original,
    fallbacks,
  }
  if (shouldBeIgnored(placeholder)) {
    return { placeholder: null }
  }
  return { placeholder }
}

const parseLiteralValue = (value) => {
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1)
  }
  return JSON.parse(value)
}

function findIndicesOutsideParenthesesAndBraces(inputString, charactersToFind) {
  const indices = []
  let depthParentheses = 0 // Tracks depth of nested parentheses
  let depthBraces = 0 // Tracks depth of nested braces within ${}

  for (let i = 0; i < inputString.length; i++) {
    const char = inputString[i]

    // Check for the beginning of a ${ sequence
    if (inputString.substring(i, i + 2) === '${') {
      depthBraces++ // Increase depth for braces
      i++ // Skip the '{' as it's already counted
    } else if (char === '}' && depthBraces > 0) {
      depthBraces-- // Decrease depth for braces
    } else if (char === '(') {
      depthParentheses++ // Increase depth on encountering an opening parenthesis
    } else if (char === ')') {
      depthParentheses-- // Decrease depth on encountering a closing parenthesis
    }

    // Add index of characters that are outside any parentheses or braces
    if (
      charactersToFind.includes(char) &&
      depthParentheses === 0 &&
      depthBraces === 0
    ) {
      indices.push(i)
    }
  }

  return indices
}

/**
 * Throw an error if cycles are found in the graph.
 * @param graph
 * @throws {ServerlessError} - If cycles are found in the graph.
 */
export const throwIfCyclesFound = (graph) => {
  const cycles = graphlib.alg.findCycles(graph)
  if (cycles.length) {
    throw new ServerlessError(
      `Cyclic reference found: ${cycles
        .map((cycle) =>
          cycle
            .map((node) => {
              return graph.node(node)?.original ?? node
            })
            .join(' -> '),
        )
        .join(', ')}`,
      ServerlessErrorCodes.resolvers.RESOLVER_CYCLIC_REFERENCE,
    )
  }
}

/**
 * Collect placeholders from a service configuration file.
 * @param {object} serviceConfigFile - The service configuration file to collect placeholders from.
 * @param {string[]} [startPath] - The path of parent object to keep correct paths for placeholders.
 * (options.region or options.r or serviceConfigFile.provider.region or 'us-east-1').
 * @param {string} credentialResolverName - The name of the credential resolver.
 * @returns {Promise<{graph: Graph}>} - The graph of the placeholders.
 */
export const extractPlaceholderFromObject = async (
  serviceConfigFile,
  startPath = [],
  credentialResolverName,
) => {
  const currentObject = serviceConfigFile

  const graph = new Graph()
  // Start collecting placeholders from the specified point
  await collectFromObject(
    currentObject,
    startPath,
    [graph],
    credentialResolverName,
  )
  throwIfCyclesFound(graph)
  return { graph }
}

export const collectFromObject = async (
  obj,
  parentPath = [],
  graphs,
  credentialResolverName,
  parentNode = null,
) => {
  const newNodeIds = [] // Collect all new node IDs

  if (typeof obj === 'string') {
    // Collect new node IDs from the string
    newNodeIds.push(
      ...extractPlaceholdersFromString(
        graphs,
        obj,
        parentPath,
        credentialResolverName,
        parentNode,
      ),
    )
  } else if (typeof obj === 'object' && obj !== null) {
    for (const [key, value] of Object.entries(obj)) {
      // Recursively collect new node IDs from nested objects
      const childNodeIds = await collectFromObject(
        value,
        parentNode ? parentPath : parentPath.concat(key),
        graphs,
        credentialResolverName,
        parentNode,
      )
      newNodeIds.push(...childNodeIds)
    }
  }

  return newNodeIds // Return the aggregated new node IDs
}

/**
 * Extract placeholders from a string and add them to a graph.
 * This function is able to process multiple placeholders in a single string,
 * and nested placeholders within placeholders.
 * @param {[Graph]} graphs - The graph to add the placeholders to.
 * @param {string} s - The string to extract placeholders from.
 * @param {string[]} parentPath - The path of the parent object.
 * @param {string} credentialResolverName - The name of the credential resolver.
 * @param {string} [parentNode] - The parent node of the nested placeholders.
 */
export function extractPlaceholdersFromString(
  graphs,
  s,
  parentPath,
  credentialResolverName,
  parentNode = null,
) {
  const newNodeIds = [] // Collect new node IDs
  // This function is responsible for extracting placeholders from a string.
  // It keeps track of the depth of nested placeholders using curly braces.
  function extract(s, parent = null) {
    let depth = 0 // Depth of curly braces
    let placeholderStart = -1 // Start index of a placeholder

    // Iterate over the string
    for (let i = 0; i < s.length; i++) {
      // If we encounter a '${', we have found a placeholder
      if (s[i] === '$' && i + 1 < s.length && s[i + 1] === '{') {
        // If we are not inside another placeholder, mark the start of this one
        if (depth === 0) {
          placeholderStart = i
        }
        // Increase depth for every opening brace
        depth += 1
        // Skip the '{' since it's part of '${'
        i++
      } else if (s[i] === '}' && depth > 0) {
        // Decrease depth for every closing brace
        depth -= 1
        // If we have found the end of a placeholder
        if (depth === 0 && placeholderStart !== -1) {
          // Extract the placeholder
          const placeholderStr = s.substring(placeholderStart, i + 1)
          // Extract the details of the placeholder
          const hasColon = placeholderStr.indexOf(':', 2) > -1
          const hasOpeningBrace = placeholderStr.indexOf('(', 2) > -1
          const hasClosingBrace = placeholderStr.indexOf(')', 2) > -1
          // Placeholder must have a colon or both opening and closing braces
          // to be considered a valid placeholder
          if (hasColon || (hasOpeningBrace && hasClosingBrace)) {
            const { placeholder } =
              extractPlaceholderDetailsFromPlaceholderString(
                placeholderStr,
                credentialResolverName,
              )
            if (placeholder) {
              // Add the placeholder to the graph
              const { id } = addPlaceholderToGraph(
                randomUUID(),
                graphs,
                placeholder,
                parent,
                parentPath,
                credentialResolverName,
              )
              // Collect the new node ID
              newNodeIds.push(id)
              // Recursively extract nested placeholders
              // but remove the curly braces from the placeholder string first
              // to avoid infinite recursion
              extract(trimBrackets(placeholderStr), id)
            }
            // Reset the placeholder start index
            placeholderStart = -1
          }
        }
      }
    }
  }

  // Start extraction with no parent for top-level placeholders
  extract(s, parentNode)

  return newNodeIds // Return the collected new node IDs
}

function trimBrackets(inputString) {
  // Check and trim if the string starts with '${' and ends with '}'
  return inputString.replace(/^\$\{([\s\S]*)\}$/, '$1')
}

/**
 * Add a placeholder to the graph.
 * @param {[Graph]} graphs - The graphs to add the placeholder to.
 * @param {Placeholder} placeholder - The placeholder to add.
 * @param {string} parent - The parent of the nested placeholder.
 * @param {string[]} parentPath - The path of the parent object.
 * @param {string} credentialResolverName - The name of the credential resolver.
 */
export function addPlaceholderToGraph(
  id,
  graphs,
  placeholder,
  parent,
  parentPath,
  credentialResolverName,
) {
  // Iterate over each graph in the graphs array
  graphs.forEach((graph) => {
    placeholder.path = parentPath
    placeholder.parent = parent
    let resolvePromise
    placeholder.promiseResolved = new Promise((resolve) => {
      resolvePromise = resolve
    })
    placeholder.resolve = resolvePromise

    // Add placeholder as a node
    graph.setNode(id, placeholder)

    // Add provider nodes and dependency edges
    for (const fallback of placeholder?.fallbacks || []) {
      // Normalize 'aws' provider to the effective credential resolver name
      // so that dependencies target the actual credential resolver
      let providerName = fallback.providerName
      if (credentialResolverName && providerName === 'aws') {
        providerName = credentialResolverName
      }
      if (providerName && providerName !== DEFAULT_AWS_CREDENTIAL_RESOLVER) {
        // If the provider node does not exist, add it
        if (!graph.hasNode(providerName)) {
          graph.setNode(providerName, {
            provider: true,
          })
        }

        // Add dependency edge from placeholder to provider
        // to resolve the provider before the placeholder
        graph.setEdge(id, providerName)
      }

      // If this is a dedicated resolver for the credential resolver, add a node for it
      if (fallback.dedicatedResolverConfig) {
        graph.setNode(fallback.resolverType, {
          dedicatedResolverConfig: fallback.dedicatedResolverConfig,
        })
        // Add dependency edge from placeholder to resolver
        // to resolve the resolver before the placeholder
        graph.setEdge(id, fallback.resolverType)

        // Add dependency edge from dedicated resolver to credential resolver
        // to resolve the credential resolver before the dedicated resolver
        if (graph.hasNode(credentialResolverName)) {
          graph.setEdge(fallback.resolverType, credentialResolverName)
        }

        // Add dependency edge from resolver to provider.region
        // to resolve the region before the resolver
        graph.nodes().forEach((node) => {
          const nodeData = graph.node(node)
          if (
            nodeData?.path?.length === 2 &&
            nodeData.path[0] === 'provider' &&
            nodeData.path[1] === 'region'
          ) {
            graph.setEdge(fallback.resolverType, node)
          }
        })
      }

      // If placeholder is in a stages block and is a resolver,
      // we need to add a dependency edge from the provider to the placeholder
      // to resolve the placeholder before the provider
      if (parentPath[0] === 'stages' && parentPath[2] === 'resolvers') {
        const providerName = parentPath[3] // Get the provider name
        if (providerName) {
          // If the provider name exists
          if (!graph.hasNode(providerName)) {
            // If the provider node does not exist, add it
            graph.setNode(providerName, { provider: true })
          }
          // Add dependency edge from provider to placeholder
          // to resolve the placeholder before the provider
          graph.setEdge(providerName, id)
        }
      }
    }

    if (parent && graph.hasNode(parent)) {
      // Add dependency edge from parent to placeholder
      // to resolve the nested placeholder before the parent
      graph.setEdge(parent, id)
    }

    // Add edges to the graph to handle 'self' references
    handleSelfReferences(graph, [id])
  })

  return { id }
}

/**
 * Add edges from the given node to other nodes if it references them via 'self'.
 * @param {Graph} graph - The graph to modify.
 * @param {string} nodeId - The ID of the node to process.
 * @param {object} nodeData - The data of the current node.
 */
function addEdgesFromSelf(graph, nodeId, nodeData) {
  if (!nodeData?.fallbacks) return

  nodeData.fallbacks.forEach((fallback) => {
    if (fallback.providerName !== 'self') return

    const selfPath = fallback.key.split('.')

    graph.nodes().forEach((otherNodeId) => {
      const otherNodeData = graph.node(otherNodeId)

      if (doesPathMatch(selfPath, otherNodeData?.path)) {
        if (!graph.hasEdge(nodeId, otherNodeId)) {
          graph.setEdge(nodeId, otherNodeId)
        }
      }
    })
  })
}

/**
 * Add edges to handle 'self' references in the graph.
 * @param {Graph} graph - The graph to modify.
 * @param {string[]} [nodeIds] - Optional list of node IDs to process.
 */
export function handleSelfReferences(graph, nodeIds = graph.nodes()) {
  nodeIds.forEach((nodeId) => {
    const nodeData = graph.node(nodeId)
    addEdgesToSelf(graph, nodeId, nodeData)
    addEdgesFromSelf(graph, nodeId, nodeData)
  })
}

/**
 * Add edges from other nodes to the given node if they reference it via 'self'.
 * @param {Graph} graph - The graph to modify.
 * @param {string} nodeId - The ID of the node to process.
 * @param {object} nodeData - The data of the current node.
 */
function addEdgesToSelf(graph, nodeId, nodeData) {
  graph.nodes().forEach((otherNodeId) => {
    const otherNodeData = graph.node(otherNodeId)

    if (!otherNodeData?.fallbacks) return

    otherNodeData.fallbacks.forEach((fallback) => {
      if (fallback.providerName !== 'self') return

      if (doesPathMatch(fallback.key.split('.'), nodeData?.path)) {
        if (!graph.hasEdge(otherNodeId, nodeId)) {
          graph.setEdge(otherNodeId, nodeId)
        }
      }
    })
  })
}

/**
 * Check if a node's path matches a specified self path
 * @param {string[]} selfPath - The self path to compare.
 * @param {string[]} nodePath - The path of the node to compare.
 * @returns {boolean} - True if the nodePath matches the selfPath, false otherwise.
 */
function doesPathMatch(selfPath, nodePath) {
  if (!selfPath || !nodePath) return false
  return nodePath.every((segment, index) => segment === selfPath[index])
}

/**
 * Check if a placeholder should be ignored
 * @param {Placeholder} placeholder - The placeholder to check.
 * @returns {boolean}
 */
const shouldBeIgnored = (placeholder) => {
  return (
    // Ignore AWS pseudo parameters (e.g. ${AWS::Partition})
    // and CloudWatch dynamic labels
    (placeholder.fallbacks.length === 1 &&
      (placeholder.fallbacks[0].providerName === 'AWS' || // AWS pseudo parameters
        placeholder.fallbacks[0].providerName === 'PROP' || // CloudWatch dynamic labels
        placeholder.fallbacks[0].providerName === 'iot')) || // AWS IoT Core policy variables
    placeholder.fallbacks[0].providerName?.startsWith('!') // literal value in Fn::Sub
  )
}

const processS3 = (fullPath, original, credentialResolverName) => {
  const [bucketName, ...keyParts] = fullPath.split('/')
  const objectKey = keyParts.join('/') // Join back the rest as key may contain '/'
  const dedicatedResolverName = `s3-${bucketName}-${objectKey}`
  return {
    placeholder: {
      original,
      providerName: credentialResolverName,
      resolverType: dedicatedResolverName,
      key: '',
      dedicatedResolverConfig: {
        type: 'aws',
        [dedicatedResolverName]: {
          type: 's3',
          bucketName,
          objectKey,
        },
      },
    },
  }
}

function processOutput(fullPath, original) {
  return {
    placeholder: {
      original,
      providerName: 'output',
      key: fullPath,
    },
  }
}

const processSsm = (
  region,
  rawOrDecrypt,
  original,
  path,
  credentialResolverName,
) => {
  // If the first argument is `raw` or `noDecrypt`, it is the rawOrDecrypt argument
  // and the region is not specified
  if (region === 'raw' || region === 'noDecrypt') {
    rawOrDecrypt = region
    region = null
  }
  // If the first argument is a region, it is the region argument,
  // and the rawOrDecrypt argument is not specified.
  const dedicatedResolverName = `ssm${region ? `-${region}` : ''}${
    rawOrDecrypt ? `-${rawOrDecrypt}` : ''
  }`
  return {
    placeholder: {
      original,
      providerName: credentialResolverName,
      resolverType: dedicatedResolverName,
      key: path,
      dedicatedResolverConfig: {
        type: 'aws',
        [dedicatedResolverName]: {
          region,
          type: 'ssm',
          rawOrDecrypt,
        },
      },
    },
  }
}

const processCf = (region, path, original, credentialResolverName) => {
  const resolverName = `cf${region ? `-${region}` : ''}`
  return {
    placeholder: {
      original,
      providerName: credentialResolverName,
      resolverType: resolverName,
      key: path,
      dedicatedResolverConfig: {
        type: 'aws',
        [resolverName]: {
          region,
          type: 'cf',
        },
      },
    },
  }
}

const splitUsingCommaIndices = (str, commaIndices) => {
  const result = []
  let start = 0

  // Loop through each comma index and slice the string from start to commaIndex
  for (const commaIndex of commaIndices) {
    result.push(str.slice(start, commaIndex))
    start = commaIndex + 1 // Update start to be after the current comma
  }

  // Add the remaining part of the string after the last comma
  result.push(str.slice(start))

  return result
}
