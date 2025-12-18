import readConfig from '@serverless/framework/lib/configuration/read.js'

/**
 * Checks if a value contains Serverless Variables (${...})
 * @param {string} value - The value to check
 * @returns {boolean} - True if the value contains variables
 */
function containsServerlessVariables(value) {
  if (typeof value !== 'string') return false
  return value.includes('${')
}

/**
 * Extract service details from a Serverless Framework configuration file
 * @param {string} configFilePath - Path to the serverless.yml file
 * @returns {Promise<Object>} - Service details including name, stage, profile, region, and stack name
 */
export async function getServiceDetails(configFilePath) {
  try {
    // Parse the configuration file
    const config = await readConfig(configFilePath)

    // Extract service details
    const serviceName = config.service
    const provider = config.provider || {}
    const stage = provider.stage || 'dev' // Default to 'dev' if not specified
    const profile = provider.profile
    const region = provider.region

    // Determine stack name - either explicitly defined or derived from service and stage
    const stackName =
      provider.stackName ||
      (serviceName && stage ? `${serviceName}-${stage}` : undefined)

    // Check for Serverless Variables in each field
    const hasVariables = {
      serviceName: containsServerlessVariables(serviceName),
      stage: containsServerlessVariables(stage),
      profile: containsServerlessVariables(profile),
      region: containsServerlessVariables(region),
      stackName: containsServerlessVariables(stackName),
    }

    return {
      serviceName,
      stage,
      profile,
      region,
      stackName,
      hasVariables,
    }
  } catch (error) {
    console.error('Error extracting service details:', error)
    // Return a partial object with error information
    return {
      error: error.message,
      errorCode: error.code || 'UNKNOWN_ERROR',
      configFilePath,
    }
  }
}

/**
 * Adds variable warnings to service details if variables are present
 * @param {Object} serviceDetails - The service details object to enhance
 * @returns {Object} - Enhanced service details with warnings
 */
function addVariableWarnings(serviceDetails) {
  if (!serviceDetails || !serviceDetails.hasVariables) {
    return serviceDetails
  }

  const variableWarnings = []

  // Check for variables in each field and add warnings
  Object.entries(serviceDetails.hasVariables).forEach(([key, hasVariable]) => {
    if (hasVariable && serviceDetails[key]) {
      variableWarnings.push(
        `${key}: ${serviceDetails[key]} (contains Serverless Variables)`,
      )
    }
  })

  // Add variableWarnings and note to serviceDetails if needed
  if (variableWarnings.length > 0) {
    return {
      ...serviceDetails,
      variableWarnings,
      variablesNote:
        'Some values contain Serverless Variables (${...}) which will be resolved at deployment time. You may need to ask the user for the actual values.',
    }
  }

  return serviceDetails
}

/**
 * Enhanced version of findServerlessFrameworkProjects that includes service details
 * @param {Array} projects - Array of project objects from findServerlessFrameworkProjects
 * @returns {Promise<Array>} - Enhanced projects with service details
 */
export async function enhanceProjectsWithServiceDetails(projects) {
  const enhancedProjects = []

  for (const project of projects) {
    if (project.type === 'serverless-framework' && project.configFile) {
      try {
        let serviceDetails = await getServiceDetails(project.configFile)

        // Add variable warnings if needed
        serviceDetails = addVariableWarnings(serviceDetails)

        enhancedProjects.push({
          ...project,
          serviceDetails,
        })
      } catch (error) {
        console.error(`Error enhancing project ${project.path}:`, error)
        // Include the project without service details
        enhancedProjects.push(project)
      }
    } else {
      // Include non-Serverless Framework projects as is
      enhancedProjects.push(project)
    }
  }

  return enhancedProjects
}
