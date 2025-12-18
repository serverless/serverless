import fs from 'fs/promises'
import path from 'path'

export const detectAiFramework = async (projectPath) => {
  try {
    const packageJsonPath = path.join(projectPath, 'package.json')
    const packageJsonExists = await fs
      .access(packageJsonPath)
      .then(() => true)
      .catch(() => false)

    if (!packageJsonExists) {
      return null
    }

    const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8')
    const packageJson = JSON.parse(packageJsonContent)

    const dependencies = packageJson.dependencies || {}
    const devDependencies = packageJson.devDependencies || {}

    if (
      dependencies.mastra !== undefined ||
      dependencies['@mastra/core'] !== undefined ||
      devDependencies.mastra !== undefined ||
      devDependencies['@mastra/core'] !== undefined
    ) {
      return { aiFramework: 'mastra' }
    }

    return null
  } catch (error) {
    console.error('Error detecting AI framework:', error)
    return null
  }
}
