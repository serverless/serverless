import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { marked } from 'marked'
import striptags from 'striptags'
import grayMatter from 'gray-matter'
import algoliasearch from 'algoliasearch'

// Environment variables
const { ALGOLIA_API_KEY, ALGOLIA_APP_ID, ALGOLIA_DOCS_INDEX } = process.env

// Initialize Algolia client and index
const algoliaClient = algoliasearch(ALGOLIA_APP_ID, ALGOLIA_API_KEY)
const algoliaIndex = algoliaClient.initIndex(ALGOLIA_DOCS_INDEX)

// Define __dirname for ESM
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Function to fix frontmatter in markdown files
const fixFrontmatter = (file) => {
  if (file && typeof file === 'string') {
    return file.replace('<!--', '---').replace('-->', '---')
  }
  return file
}

// Function to replace all items in Algolia index
const replaceAllAlgoliaItems = async (items, options = {}) => {
  try {
    await algoliaIndex.replaceAllObjects(items, options)
    console.log('Replaced all Algolia items successfully')
  } catch (error) {
    console.error('Error replacing Algolia items:', error)
    throw error
  }
}

// Function to remove a specific line from markdown content
const removeSpecificLine = (markdownContent) => {
  return markdownContent.replace(
    /### \[Read this on the main serverless docs site\]\(.*\)/,
    '',
  )
}

// Function to preprocess markdown content
const preprocessMarkdown = (markdownContent) => {
  const cleanedMarkdown = removeSpecificLine(markdownContent)
  const htmlContent = marked(cleanedMarkdown)
  return striptags(htmlContent)
}

// Function to traverse the repository and collect markdown files
const traverseRepo = (dir) => {
  const files = []
  const items = fs.readdirSync(dir)
  items.forEach((item) => {
    const fullPath = path.join(dir, item)
    const stat = fs.statSync(fullPath)

    if (stat.isDirectory()) {
      files.push(...traverseRepo(fullPath))
    } else if (stat.isFile() && item.endsWith('.md')) {
      files.push({
        name: item,
        path: fullPath,
      })
    }
  })

  return files
}

// Function to fetch file content locally
const getFileContent = (filePath) => {
  return fs.readFileSync(filePath, 'utf-8')
}

// Function to synchronize documents between the local filesystem and Algolia
const syncWithAlgolia = async () => {
  try {
    const docsDir = path.join(__dirname, '../docs')
    const files = traverseRepo(docsDir)

    console.log(`Found ${files.length} local files`)

    const itemsToUpdate = await Promise.all(
      files.map(async (file) => {
        const fileContent = getFileContent(file.path)
        const fixedFile = fixFrontmatter(fileContent)
        const { data: frontmatter, content: markdownContent } =
          grayMatter(fixedFile)
        const { title = file.name, description } = frontmatter || {}
        const content = preprocessMarkdown(markdownContent)

        const objectID = path.relative(docsDir, file.path).replace('.md', '')

        return {
          objectID,
          title,
          description,
          content,
          githubFilePath: file.path,
        }
      }),
    )

    await replaceAllAlgoliaItems(itemsToUpdate)
    console.log('Sync with Algolia completed successfully')
  } catch (error) {
    console.error('Error syncing with Algolia:', error)
  }
}

// Usage
syncWithAlgolia()
