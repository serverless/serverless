/**
 * `serverless agent docs [paths..]` — print the packaged Serverless Framework
 * documentation on demand, for AI agents.
 *
 * Without paths: an index built from docs/sf/menu.json (curated titles, menu
 * order) plus any page the menu omits. With paths: the page markdown, minus
 * the site-only noise (frontmatter comment, docs-site link block), to stdout.
 *
 * The docs tree ships in every release next to dist/ (copied there for the
 * MCP docs tool), so the pages always match the installed CLI version and
 * need no network. Read-only, unauthenticated, works in any directory.
 */
import { readFile, readdir, realpath, stat } from 'fs/promises'
import path from 'path'
import { ServerlessError, writeText } from '@serverless/util'
import { resolveDocPath } from '@serverless/mcp/src/tools/docs.js'
import { fromRepoRoot } from '@serverless/mcp/src/utils/path-utils.js'

export const INDEX_HEADER =
  'Serverless Framework documentation. Read a page: serverless agent docs <path> [<path> ...]'
const OTHER_SECTION = 'Other pages'

const defaultDocsDir = () => fromRepoRoot('docs/sf')

// The shared resolver reports a missing path as exists:false but rethrows every
// other filesystem failure -- ENAMETOOLONG for an over-long name, EINVAL for a
// character the platform forbids, ERR_INVALID_ARG_VALUE for a NUL byte. A
// candidate the filesystem will not even look at is, for this command, simply
// not a page: swallow it here so the caller still ends at
// AGENT_DOCS_PAGE_NOT_FOUND instead of a raw error carrying the install path.
const probe = async (baseDir, relativePath) => {
  try {
    return await resolveDocPath(baseDir, relativePath)
  } catch {
    return {
      resolvedPath: path.resolve(baseDir, relativePath),
      isWithinBase: true,
      exists: false,
    }
  }
}

/** Same flattening as the repeatable --dir flag: array | string | undefined, comma-joined allowed. */
export const normalizePaths = (paths) =>
  paths === undefined
    ? []
    : (Array.isArray(paths) ? paths : [paths])
        .flatMap((value) => String(value).split(','))
        .map((value) => value.trim())
        .filter(Boolean)

/** Drop the HTML-comment frontmatter and the DOCS-SITE-LINK block; keep everything else verbatim. */
export const stripSiteNoise = (markdown) =>
  markdown
    .replace(/^<!--[\s\S]*?-->\s*\n/, '')
    .replace(/<!-- DOCS-SITE-LINK:START[\s\S]*?DOCS-SITE-LINK:END -->\s*\n/, '')
    .replace(/^\s*\n/, '')

const titleFromFrontmatter = (markdown, fallback) => {
  const match = markdown.match(/^<!--[\s\S]*?^title:\s*(.+?)\s*$[\s\S]*?-->/m)
  if (!match) return fallback
  return match[1].replace(/^['"]|['"]$/g, '')
}

/** Every *.md under dir, as menu-style paths (no extension, "/" separators). */
const listPages = async (dir, base = dir, out = []) => {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) await listPages(full, base, out)
    else if (entry.isFile() && entry.name.endsWith('.md')) {
      out.push(
        path
          .relative(base, full)
          .split(path.sep)
          .join('/')
          .replace(/\.md$/, ''),
      )
    }
  }
  return out
}

/**
 * Resolve a menu path or user path to the page file inside docsDir.
 * Order: "<p>.md" → "<p>/README.md" → "<p>" when it is a file (an explicit
 * ".md" path). Throws AGENT_DOCS_INVALID_PATH for escapes and
 * AGENT_DOCS_PAGE_NOT_FOUND (with sibling suggestions) for misses.
 */
export const resolvePage = async (docsDir, requested) => {
  const clean = String(requested).replace(/\\/g, '/').replace(/\/+$/, '')
  const invalid = () =>
    new ServerlessError(
      `Invalid path "${requested}" — paths are relative to the documentation root.`,
      'AGENT_DOCS_INVALID_PATH',
      { stack: false },
    )
  if (!clean || path.isAbsolute(clean) || clean.split('/').includes('..'))
    throw invalid()

  const candidates = clean.endsWith('.md')
    ? [clean]
    : [`${clean}.md`, `${clean}/README.md`, clean]
  for (const candidate of candidates) {
    const { resolvedPath, isWithinBase, exists } = await probe(
      docsDir,
      candidate,
    )
    if (!isWithinBase) throw invalid()
    if (exists && (await stat(resolvedPath)).isFile()) return resolvedPath
  }
  throw new ServerlessError(
    await notFoundMessage(docsDir, clean),
    'AGENT_DOCS_PAGE_NOT_FOUND',
    {
      stack: false,
    },
  )
}

const notFoundMessage = async (docsDir, clean) => {
  const parts = clean.split('/')
  parts.pop()
  while (parts.length) {
    const dirPath = parts.join('/')
    const { resolvedPath, isWithinBase, exists } = await probe(docsDir, dirPath)
    if (isWithinBase && exists && (await stat(resolvedPath)).isDirectory()) {
      const pages = (await listPages(resolvedPath, docsDir)).sort()
      return [
        `Page "${clean}" not found. Pages under "${dirPath}":`,
        ...pages.map((p) => `  ${p}`),
        'Run "serverless agent docs" for the full index.',
      ].join('\n')
    }
    parts.pop()
  }
  return `Page "${clean}" not found. Run "serverless agent docs" for the full index.`
}

const walkMenu = (node, section, crumbs, out) => {
  for (const [label, value] of Object.entries(node)) {
    if (typeof value === 'string') {
      out.push({
        section,
        title: [...crumbs, label].join(' › '),
        path: value === '' ? 'README' : value.replace(/\/$/, ''),
      })
    } else if (value && typeof value === 'object') {
      walkMenu(value, section, [...crumbs, label], out)
    }
  }
}

/** @returns {Promise<Array<{section: string, title: string, path: string, bytes: number}>>} */
export const buildIndex = async (docsDir) => {
  const menu = JSON.parse(
    await readFile(path.join(docsDir, 'menu.json'), 'utf8'),
  )
  const entries = []
  for (const [section, value] of Object.entries(menu)) {
    if (typeof value === 'string') {
      entries.push({
        section,
        title: section,
        path: value === '' ? 'README' : value.replace(/\/$/, ''),
      })
    } else {
      walkMenu(value, section, [], entries)
    }
  }
  const listed = new Set(entries.map((e) => e.path))
  const isListed = (p) =>
    listed.has(p) ||
    (p.endsWith('/README') && listed.has(p.slice(0, -'/README'.length)))
  for (const p of (await listPages(docsDir)).sort()) {
    if (isListed(p)) continue
    const file = await resolvePage(docsDir, p)
    entries.push({
      section: OTHER_SECTION,
      title: titleFromFrontmatter(await readFile(file, 'utf8'), p),
      path: p,
    })
  }
  // Skip -- rather than throw on -- a menu entry whose page cannot be resolved.
  // The index is what every other error message points the agent at, so one
  // stale menu.json line must not be able to take the whole command down with a
  // circular "run serverless agent docs" message. The repo's own unit test
  // asserts menu.json and the packaged tree agree, so drift fails CI loudly
  // while the shipped runtime stays usable.
  const resolved = []
  for (const entry of entries) {
    try {
      const file = await resolvePage(docsDir, entry.path)
      entry.bytes = (await stat(file)).size
    } catch {
      continue
    }
    resolved.push(entry)
  }
  return resolved
}

export const renderIndex = (entries) => {
  const pathWidth = Math.max(...entries.map((e) => e.path.length))
  const titleWidth = Math.max(...entries.map((e) => e.title.length))
  const lines = [INDEX_HEADER, '']
  let section
  for (const entry of entries) {
    if (entry.section !== section) {
      section = entry.section
      lines.push(section)
    }
    const kb = `~${Math.max(1, Math.round(entry.bytes / 1024))} KB`
    lines.push(
      `  ${entry.path.padEnd(pathWidth)}  ${entry.title.padEnd(titleWidth)}  ${kb}`,
    )
  }
  return `${lines.join('\n')}\n`
}

export default async function agentDocs({
  paths,
  docsDir = defaultDocsDir(),
  write = writeText, // test seam; stdout in production
}) {
  // Containment is decided on real paths, so resolve the root once and pass
  // that down: a docs tree reached through a link would otherwise be compared
  // -- and have its suggestions listed -- against a root it never matches.
  const root = await realpath(docsDir).catch(() => docsDir)
  const requested = normalizePaths(paths)
  if (!requested.length) {
    write(renderIndex(await buildIndex(root)))
    return { pages: 0, index: true }
  }
  // Resolve every page before printing anything: a bad path fails the whole
  // call instead of leaving a half-printed answer the agent might trust.
  const files = []
  for (const p of requested) files.push([p, await resolvePage(root, p)])
  const chunks = []
  for (const [p, file] of files) {
    const body = stripSiteNoise(await readFile(file, 'utf8')).replace(
      /\s*$/,
      '\n',
    )
    chunks.push(requested.length > 1 ? `## ${p}\n\n${body}` : body)
  }
  write(requested.length > 1 ? chunks.join('\n---\n\n') : chunks[0])
  return { pages: requested.length, index: false }
}
