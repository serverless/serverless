/**
 * Tool for listing all serverless projects in the workspace
 * Supports Serverless Framework projects (serverless.yml) and CloudFormation projects
 */

import { getServerlessProjectsInfo } from '../lib/project-finder.js'
import { setListProjectsCalled } from './list-resources.js'

/**
 * List all serverless projects in the workspace
 *
 * @param {Object} params - Parameters for the tool
 * @param {string[]} params.workspaceRoots - Array of root directories to search in
 * @param {boolean} [params.userConfirmed] - Flag indicating if the user has explicitly confirmed the workspace paths
 * @returns {Promise<{projects: string[], multipleFound: boolean}>} - Information about found projects
 */
export async function listProjects(params) {
  // Mark that list-projects has been called
  setListProjectsCalled()

  const { workspaceRoots, userConfirmed } = params

  // Check if user has confirmed
  if (!userConfirmed) {
    return {
      content: [
        {
          type: 'text',
          text:
            '⚠️⚠️⚠️ ERROR: USER CONFIRMATION REQUIRED ⚠️⚠️⚠️\n\n' +
            'You MUST explicitly ask the user for permission before searching for projects.\n\n' +
            'Required workflow:\n' +
            '1. Ask the user: "Should I search for serverless projects in the following workspace paths: ' +
            JSON.stringify(workspaceRoots) +
            '?"\n' +
            '2. Wait for explicit user confirmation\n' +
            '3. If user confirms, call this tool again with userConfirmed=true\n' +
            '4. If user does NOT confirm, ask for the FULL ABSOLUTE PATH to the project directory\n' +
            '5. Once the user provides a specific path, replace workspaceRoots with ONLY that path',
        },
      ],
      isError: true,
    }
  }

  if (
    !workspaceRoots ||
    !Array.isArray(workspaceRoots) ||
    workspaceRoots.length === 0
  ) {
    return {
      content: [
        {
          type: 'text',
          text: 'Error: workspaceRoots parameter is required and must be a non-empty array of directory paths',
        },
      ],
      isError: true,
    }
  }

  try {
    // Get information about serverless projects in all workspace roots
    let allProjects = []

    // Process each workspace root
    for (const workspaceRoot of workspaceRoots) {
      const projectsInfo = await getServerlessProjectsInfo(workspaceRoot)
      allProjects = [...allProjects, ...projectsInfo.projects]
    }

    // Remove any duplicate projects (in case of overlapping workspace roots)
    // Since projects are now objects with paths, we need to deduplicate by path
    const uniquePaths = new Set()
    const uniqueProjects = allProjects.filter((project) => {
      if (uniquePaths.has(project.path)) {
        return false
      }
      uniquePaths.add(project.path)
      return true
    })

    // Group projects by type
    const projectsByType = uniqueProjects.reduce((acc, project) => {
      if (!acc[project.type]) {
        acc[project.type] = []
      }
      acc[project.type].push(project)
      return acc
    }, {})

    // Determine if multiple projects were found
    const multipleFound = uniqueProjects.length > 1

    // Create summary message
    let message = ''
    if (uniqueProjects.length === 0) {
      message = 'No serverless projects found in the workspace roots.'
    } else {
      const projectTypeCounts = Object.entries(projectsByType)
        .map(
          ([type, projects]) =>
            `${projects.length} ${type} project${projects.length > 1 ? 's' : ''}`,
        )
        .join(', ')

      message = multipleFound
        ? `Multiple serverless projects found (${projectTypeCounts}). Please specify which project directory to use with other tools.`
        : `One ${Object.keys(projectsByType)[0]} project found.`
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              projects: uniqueProjects,
              projectsByType: projectsByType,
              multipleFound: multipleFound,
              message: message,
            },
            null,
            2,
          ),
        },
      ],
    }
  } catch (error) {
    console.error('Error listing projects:', error)
    return {
      content: [
        {
          type: 'text',
          text: `Error listing serverless projects: ${error.message}`,
        },
      ],
      isError: true,
    }
  }
}
