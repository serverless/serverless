import fs from 'fs'
import path from 'path'
import { promisify } from 'util'
import { execFile } from 'child_process'
import { enhanceProjectsWithServiceDetails } from './serverless-framework/service-details.js'

const execFileAsync = promisify(execFile)
const readFileAsync = promisify(fs.readFile)
const statAsync = promisify(fs.stat)

/**
 * Validate that the provided path is an existing directory
 *
 * @param {string} dirPath - The directory path to validate
 * @returns {Promise<string>} - The validated absolute path
 * @throws {Error} - If the path is not a valid directory
 */
async function validateWorkspaceDir(dirPath) {
  if (!dirPath || typeof dirPath !== 'string') {
    throw new Error('Workspace directory must be a non-empty string')
  }

  // Resolve to absolute path to prevent relative path tricks
  const absolutePath = path.resolve(dirPath)

  // Verify the path exists and is a directory
  const stats = await statAsync(absolutePath)
  if (!stats.isDirectory()) {
    throw new Error(`Path is not a directory: ${absolutePath}`)
  }

  return absolutePath
}

/**
 * Find all Serverless Framework projects in the workspace
 * Looks for serverless.yml files
 *
 * @param {string} workspaceDir - The workspace directory to search in
 * @returns {Promise<{type: string, path: string}[]>} - Array of objects with project type and path
 */
export async function findServerlessFrameworkProjects(workspaceDir) {
  try {
    // Validate and resolve the workspace directory
    const rootDir = await validateWorkspaceDir(workspaceDir || process.cwd())

    // Use find command to locate all serverless.yml files, excluding node_modules and .git
    const { stdout } = await execFileAsync(
      'find',
      [
        rootDir,
        '-name',
        'serverless.yml',
        '-not',
        '-path',
        '*/node_modules/*',
        '-not',
        '-path',
        '*/.git/*',
      ],
      { maxBuffer: 10 * 1024 * 1024 }, // Increase buffer size for large workspaces
    )

    // Get the directories containing serverless.yml files
    const projectPaths = stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((filePath) => ({
        type: 'serverless-framework',
        path: path.dirname(filePath),
        configFile: filePath,
      }))

    return projectPaths
  } catch (error) {
    console.error('Error finding Serverless Framework projects:', error)
    return [] // Return empty array instead of throwing to allow other project types to be found
  }
}

/**
 * Find YAML/YML files in a workspace directory
 *
 * @param {string} workspaceDir - The workspace directory to search in
 * @returns {Promise<string[]>} - Array of file paths
 */
async function findYamlFiles(workspaceDir) {
  // Validate and resolve the workspace directory
  const rootDir = await validateWorkspaceDir(workspaceDir || process.cwd())

  // Use find command to locate all yaml/yml files, excluding node_modules and .git
  // We'll run two separate find commands to avoid syntax issues with complex expressions
  const { stdout: yamlStdout } = await execFileAsync(
    'find',
    [
      rootDir,
      '-name',
      '*.yaml',
      '-not',
      '-path',
      '*/node_modules/*',
      '-not',
      '-path',
      '*/.git/*',
    ],
    { maxBuffer: 5 * 1024 * 1024 }, // Increase buffer size for large workspaces
  )

  const { stdout: ymlStdout } = await execFileAsync(
    'find',
    [
      rootDir,
      '-name',
      '*.yml',
      '-not',
      '-path',
      '*/node_modules/*',
      '-not',
      '-path',
      '*/.git/*',
    ],
    { maxBuffer: 5 * 1024 * 1024 }, // Increase buffer size for large workspaces
  )

  // Combine the results with a newline in between if both have content
  const stdout =
    yamlStdout.trim() && ymlStdout.trim()
      ? yamlStdout.trim() + '\n' + ymlStdout.trim()
      : yamlStdout.trim() + ymlStdout.trim()

  return stdout.trim().split('\n').filter(Boolean)
}

/**
 * Find projects in YAML files based on a signature string
 *
 * @param {string[]} yamlFiles - Array of YAML file paths
 * @param {string} signature - String to search for in file content
 * @param {string} projectType - Type identifier for found projects
 * @param {string} [excludeSignature] - Optional signature to exclude (files with this signature will be skipped)
 * @returns {Promise<Array<{type: string, path: string, configFile: string}>>} - Array of found projects
 */
async function findProjectsBySignature(
  yamlFiles,
  signature,
  projectType,
  excludeSignature,
) {
  const projects = []

  for (const filePath of yamlFiles) {
    try {
      const fileContent = await readFileAsync(filePath, 'utf8')
      if (fileContent.includes(signature)) {
        // Skip this file if it contains the exclude signature
        if (excludeSignature && fileContent.includes(excludeSignature)) {
          continue
        }

        projects.push({
          type: projectType,
          path: path.dirname(filePath),
          configFile: filePath,
        })
      }
    } catch (readError) {
      console.error(`Error reading file ${filePath}:`, readError)
      // Continue to next file
    }
  }

  return projects
}

/**
 * Find all CloudFormation projects in the workspace
 * Looks for YAML/YML files containing AWSTemplateFormatVersion but excludes AWS SAM templates
 * which contain AWS::Serverless-2016-10-31
 *
 * @param {string} workspaceDir - The workspace directory to search in
 * @returns {Promise<Array<{type: string, path: string, configFile: string}>>} - Array of objects with project type and path
 */
export async function findCloudFormationProjects(workspaceDir) {
  try {
    const yamlFiles = await findYamlFiles(workspaceDir)
    // Exclude files that contain the SAM transform signature
    return await findProjectsBySignature(
      yamlFiles,
      'AWSTemplateFormatVersion',
      'cloudformation',
      'AWS::Serverless-2016-10-31',
    )
  } catch (error) {
    console.error('Error finding CloudFormation projects:', error)
    return [] // Return empty array instead of throwing to allow other project types to be found
  }
}

/**
 * Find all AWS SAM projects in the workspace
 * Looks for YAML/YML files containing AWS::Serverless-2016-10-31
 *
 * @param {string} workspaceDir - The workspace directory to search in
 * @returns {Promise<Array<{type: string, path: string, configFile: string}>>} - Array of objects with project type and path
 */
export async function findAwsSamProjects(workspaceDir) {
  try {
    const yamlFiles = await findYamlFiles(workspaceDir)
    return await findProjectsBySignature(
      yamlFiles,
      'AWS::Serverless-2016-10-31',
      'sam',
    )
  } catch (error) {
    console.error('Error finding AWS SAM projects:', error)
    return [] // Return empty array instead of throwing to allow other project types to be found
  }
}

/**
 * Get information about serverless projects in the workspace
 * Detects Serverless Framework projects (serverless.yml), CloudFormation projects, and AWS SAM projects
 *
 * @param {string} workspaceDir - The workspace directory to search in
 * @returns {Promise<{projects: Array<{type: string, path: string, configFile: string}>, multipleFound: boolean}>} - Information about found projects
 */
export async function getServerlessProjectsInfo(workspaceDir) {
  // Find all serverless projects in the workspace by type
  const [serverlessFrameworkProjects, cloudFormationProjects, awsSamProjects] =
    await Promise.all([
      findServerlessFrameworkProjects(workspaceDir),
      findCloudFormationProjects(workspaceDir),
      findAwsSamProjects(workspaceDir),
    ])

  // Combine all project types
  const allProjects = [
    ...serverlessFrameworkProjects,
    ...cloudFormationProjects,
    ...awsSamProjects,
  ]

  // Remove duplicates (same path with different types)
  const uniquePaths = new Set()
  const uniqueProjects = allProjects.filter((project) => {
    if (uniquePaths.has(project.path)) {
      return false
    }
    uniquePaths.add(project.path)
    return true
  })

  // Enhance Serverless Framework projects with service details
  const enhancedProjects =
    await enhanceProjectsWithServiceDetails(uniqueProjects)

  return {
    projects: enhancedProjects,
    multipleFound: enhancedProjects.length > 1,
  }
}
