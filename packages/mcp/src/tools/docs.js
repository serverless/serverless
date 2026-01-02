import fs from 'node:fs/promises'
import path from 'node:path'
import { fromRepoRoot } from '../utils/path-utils.js'

// Base directories for documentation
const docsBaseDirs = {
  sf: fromRepoRoot('docs/sf'),
  scf: fromRepoRoot('docs/scf'),
}

function normalizeDocPath(product, docPath) {
  // Remove product prefix if it exists to avoid path duplication
  return docPath.startsWith(`${product}/`)
    ? docPath.substring(product.length + 1)
    : docPath
}

function resolvePathInBase(baseDir, relativePath) {
  const resolvedPath = path.resolve(baseDir, relativePath)
  const relativeToBase = path.relative(baseDir, resolvedPath)
  const isWithinBase =
    relativeToBase === '' ||
    (!relativeToBase.startsWith('..') && !path.isAbsolute(relativeToBase))

  return { resolvedPath, isWithinBase }
}

/**
 * Lists the contents of a directory, filtering for markdown files
 * @param {string} dirPath - Path to the directory
 * @returns {Promise<{dirs: string[], files: string[]}>} - Directories and files in the directory
 */
async function listDirContents(dirPath) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    const dirs = []
    const files = []

    for (const entry of entries) {
      if (entry.isDirectory()) {
        dirs.push(entry.name + '/')
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push(entry.name)
      }
    }

    return {
      dirs: dirs.sort(),
      files: files.sort(),
    }
  } catch (error) {
    console.error(`Failed to list directory contents: ${dirPath}`, error)
    throw error
  }
}

/**
 * Reads markdown content from a file path
 * @param {string} product - The product (sf or scf)
 * @param {string} docPath - Path to the document relative to the product base directory
 * @returns {Promise<string>} - Content of the markdown file
 */
async function readMarkdownContent(product, docPath) {
  if (!docsBaseDirs[product]) {
    throw new Error(`Invalid product: ${product}. Must be one of: sf, scf`)
  }

  const normalizedPath = normalizeDocPath(product, docPath)
  const { resolvedPath: fullPath, isWithinBase } = resolvePathInBase(
    docsBaseDirs[product],
    normalizedPath,
  )

  if (!isWithinBase) {
    throw new Error(`Invalid path: ${product}/${docPath}`)
  }

  try {
    const stats = await fs.stat(fullPath)

    if (stats.isDirectory()) {
      const { dirs, files } = await listDirContents(fullPath)
      const dirListing = [
        `Directory contents of ${product}/${docPath}:`,
        '',
        dirs.length > 0 ? 'Subdirectories:' : 'No subdirectories.',
        ...dirs.map((d) => `- ${d}`),
        '',
        files.length > 0
          ? 'Files in this directory:'
          : 'No files in this directory.',
        ...files.map((f) => `- ${f}`),
        '',
        '---',
        '',
        'Contents of all files in this directory:',
        '',
      ].join('\n')

      // Append all file contents
      let fileContents = ''
      for (const file of files) {
        const filePath = path.join(fullPath, file)
        const content = await fs.readFile(filePath, 'utf-8')
        fileContents += `\n\n# ${file}\n\n${content}`
      }

      return dirListing + fileContents
    }

    // If it's a file, just read it
    return fs.readFile(fullPath, 'utf-8')
  } catch (error) {
    throw new Error(`Path not found: ${product}/${docPath}`)
  }
}

/**
 * Finds the nearest existing directory and lists its contents
 * @param {string} product - The product (sf or scf)
 * @param {string} docPath - Path to look for
 * @param {string} availablePaths - String containing available paths
 * @returns {Promise<string>} - Formatted string with suggestions
 */
async function findNearestDirectory(product, docPath, availablePaths) {
  if (!docsBaseDirs[product]) {
    throw new Error(`Invalid product: ${product}. Must be one of: sf, scf`)
  }

  const normalizedPath = normalizeDocPath(product, docPath)
  const { isWithinBase } = resolvePathInBase(
    docsBaseDirs[product],
    normalizedPath,
  )

  if (!isWithinBase) {
    throw new Error(`Invalid path: ${product}/${docPath}`)
  }

  // Split path into parts and try each parent directory
  const parts = normalizedPath.split('/')

  while (parts.length > 0) {
    const testPath = parts.join('/')
    try {
      const { resolvedPath: fullPath, isWithinBase: testWithinBase } =
        resolvePathInBase(docsBaseDirs[product], testPath)

      if (!testWithinBase) {
        parts.pop()
        continue
      }

      const stats = await fs.stat(fullPath)

      if (stats.isDirectory()) {
        const { dirs, files } = await listDirContents(fullPath)
        return [
          `Path "${product}/${docPath}" not found.`,
          `Here are the available paths in "${product}/${testPath}":`,
          '',
          dirs.length > 0 ? 'Directories:' : 'No subdirectories.',
          ...dirs.map((d) => `- ${product}/${testPath}/${d}`),
          '',
          files.length > 0 ? 'Files:' : 'No files.',
          ...files.map((f) => `- ${product}/${testPath}/${f}`),
        ].join('\n')
      }
    } catch {
      // Directory doesn't exist, try parent
    }
    parts.pop()
  }

  // If no parent directories found, return root listing
  return [
    `Path "${product}/${docPath}" not found.`,
    'Here are all available paths:',
    '',
    availablePaths,
  ].join('\n')
}

/**
 * Recursively builds a tree of directories and files
 * @param {string} basePath - Base path for the product
 * @param {string} relativePath - Current relative path being processed
 * @param {string} indent - Current indentation level for formatting
 * @param {string} prefix - Product prefix (sf/ or scf/)
 * @returns {Promise<string>} - Formatted tree structure
 */
async function buildDirectoryTree(
  basePath,
  relativePath = '',
  indent = '',
  prefix = '',
) {
  const currentPath = path.join(basePath, relativePath)
  let result = []

  try {
    const { dirs, files } = await listDirContents(currentPath)

    // Add files first
    for (const file of files) {
      result.push(
        `${indent}📄 ${prefix}${relativePath ? relativePath + '/' : ''}${file}`,
      )
    }

    // Then recursively process directories
    for (const dir of dirs) {
      // Remove the trailing slash for display
      const dirName = dir.replace(/\/$/, '')
      result.push(
        `${indent}📁 ${prefix}${relativePath ? relativePath + '/' : ''}${dirName}/`,
      )

      // Build the path for the next level
      const nextRelativePath = relativePath
        ? `${relativePath}/${dirName}`
        : dirName
      const subTree = await buildDirectoryTree(
        basePath,
        nextRelativePath,
        `${indent}  `,
        prefix,
      )
      result.push(subTree)
    }

    return result.join('\n')
  } catch (error) {
    return `${indent}❌ Error accessing ${currentPath}: ${error.message}`
  }
}

/**
 * Gets a listing of all available documentation paths in a tree structure
 * @returns {Promise<{sf: string, scf: string}>} - Available paths for each product
 */
async function getAvailablePaths() {
  const result = {}

  for (const product of ['sf', 'scf']) {
    try {
      const tree = await buildDirectoryTree(
        docsBaseDirs[product],
        '',
        '',
        `${product}/`,
      )

      result[product] = [
        `Available ${product.toUpperCase()} documentation:`,
        '',
        '📂 Documentation Tree:',
        tree,
        '',
        'Use these paths with the docs tool to view specific documents.',
        'Example: { product: "' + product + '", paths: ["path/to/file.md"] }',
      ].join('\n')
    } catch (error) {
      result[product] =
        `Error loading ${product.toUpperCase()} documentation: ${error.message}`
    }
  }

  return result
}

/**
 * Main function to get documentation
 * @param {Object} args - Tool arguments
 * @param {string} args.product - Product (sf or scf)
 * @param {string[]} [args.paths] - Paths to the documents
 * @returns {Promise<Object>} - Tool response
 */
export async function getDocs(args) {
  try {
    // Initialize available paths
    const availablePaths = await getAvailablePaths()

    // Validate product
    const product = args.product?.toLowerCase()
    if (!product || !['sf', 'scf'].includes(product)) {
      return {
        content: [
          {
            type: 'text',
            text: `Invalid product: ${product}. Must be one of: sf, scf\n\n${availablePaths.sf}\n\n${availablePaths.scf}`,
          },
        ],
        isError: true,
      }
    }

    // If no paths are specified, list available paths
    if (!args.paths || args.paths.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: availablePaths[product],
          },
        ],
        isError: false,
      }
    }

    // Process each requested path
    const results = await Promise.all(
      args.paths.map(async (docPath) => {
        try {
          const content = await readMarkdownContent(product, docPath)
          return {
            path: docPath,
            content,
            error: null,
          }
        } catch (error) {
          if (error.message.includes('Path not found')) {
            const suggestions = await findNearestDirectory(
              product,
              docPath,
              availablePaths[product],
            )
            return {
              path: docPath,
              content: null,
              error: suggestions,
            }
          }
          return {
            path: docPath,
            content: null,
            error: error.message,
          }
        }
      }),
    )

    // Format the results
    const output = results
      .map((result) => {
        // Check if the path already starts with the product prefix to avoid duplication
        const displayPath = result.path.startsWith(`${product}/`)
          ? result.path
          : `${product}/${result.path}`

        if (result.error) {
          return `## ${displayPath}\n\n${result.error}\n\n---\n`
        }
        return `## ${displayPath}\n\n${result.content}\n\n---\n`
      })
      .join('\n')

    return {
      content: [
        {
          type: 'text',
          text: output,
        },
      ],
      isError: false,
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error.message}`,
        },
      ],
      isError: true,
    }
  }
}
