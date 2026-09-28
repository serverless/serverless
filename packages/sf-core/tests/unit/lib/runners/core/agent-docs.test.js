import {
  mkdtemp,
  mkdir,
  writeFile,
  realpath,
  readdir,
  readFile,
  rm,
  symlink,
} from 'fs/promises'
import { mkdtempSync, rmSync, symlinkSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import agentDocs, {
  buildIndex,
  renderIndex,
  stripSiteNoise,
  resolvePage,
  normalizePaths,
} from '../../../../../src/lib/runners/core/agent-docs.js'

const page = (title, body) =>
  `<!--\ntitle: '${title}'\ndescription: 'd'\n-->\n\n<!-- DOCS-SITE-LINK:START automatically generated  -->\n\n### [Read this on the main serverless docs site](https://www.serverless.com/x)\n\n<!-- DOCS-SITE-LINK:END -->\n\n# ${title}\n\n${body}\n`

// Symlink creation needs a privilege Windows does not grant by default. Probe
// once, synchronously, so the containment tests are skipped -- not silently
// passed -- on a platform that cannot build the fixture.
const symlinksSupported = (() => {
  const probe = mkdtempSync(path.join(tmpdir(), 'agent-docs-probe-'))
  try {
    symlinkSync(path.join(probe, 'target'), path.join(probe, 'link'))
    return true
  } catch {
    return false
  } finally {
    rmSync(probe, { recursive: true, force: true })
  }
})()
const itWithSymlinks = symlinksSupported ? it : it.skip

let docsDir
let outsideDir
beforeAll(async () => {
  docsDir = await realpath(await mkdtemp(path.join(tmpdir(), 'agent-docs-')))
  // A sibling of the docs root, i.e. genuinely outside it.
  outsideDir = await realpath(
    await mkdtemp(path.join(tmpdir(), 'agent-docs-outside-')),
  )
  await writeFile(
    path.join(outsideDir, 'secret.md'),
    page('Secret', 'must never be served'),
  )
  await mkdir(path.join(docsDir, 'guides', 'mcp'), { recursive: true })
  await mkdir(path.join(docsDir, 'providers', 'aws', 'events'), {
    recursive: true,
  })
  await writeFile(
    path.join(docsDir, 'README.md'),
    page('Serverless Framework Documentation', 'root'),
  )
  await writeFile(
    path.join(docsDir, 'getting-started.md'),
    page('Setting Up', 'install it'),
  )
  await writeFile(
    path.join(docsDir, 'guides', 'mcp', 'README.md'),
    page('MCP Server', 'overview'),
  )
  await writeFile(
    path.join(docsDir, 'guides', 'mcp', 'setup.md'),
    page('MCP Setup', 'setup'),
  )
  await writeFile(
    path.join(docsDir, 'providers', 'aws', 'events', 'schedule.md'),
    page('Schedule', 'cron'),
  )
  await writeFile(
    path.join(docsDir, 'orphan.md'),
    page('Orphan Page', 'not in menu'),
  )
  await writeFile(
    path.join(docsDir, 'menu.json'),
    JSON.stringify({
      Intro: '',
      'Get Started': { Setup: 'getting-started' },
      Usage: { Events: { Schedule: 'providers/aws/events/schedule' } },
      'MCP Server': { Overview: 'guides/mcp', Setup: 'guides/mcp/setup' },
    }),
  )
  if (symlinksSupported) {
    // Escapes: a directory symlink and a file symlink, both leaving the root.
    await symlink(outsideDir, path.join(docsDir, 'evil'), 'dir')
    await symlink(
      path.join(outsideDir, 'secret.md'),
      path.join(docsDir, 'escape.md'),
    )
    // Stays inside the docs tree, so it must keep working.
    await symlink(
      path.join(docsDir, 'guides', 'mcp'),
      path.join(docsDir, 'inside'),
      'dir',
    )
  }
})
afterAll(async () => {
  await rm(docsDir, { recursive: true, force: true })
  await rm(outsideDir, { recursive: true, force: true })
})

describe('stripSiteNoise', () => {
  it('removes the frontmatter comment and the docs-site link block, keeps the body', () => {
    const out = stripSiteNoise(page('T', 'body text'))
    expect(out.startsWith('# T')).toBe(true)
    expect(out).not.toContain('DOCS-SITE-LINK')
    expect(out).not.toContain("title: 'T'")
    expect(out).toContain('body text')
  })
  it('leaves a page without either block untouched', () => {
    expect(stripSiteNoise('# Plain\n\ntext\n')).toBe('# Plain\n\ntext\n')
  })
})

describe('buildIndex', () => {
  it('lists menu entries in menu order with section, title and size, mapping "" to README', async () => {
    const entries = await buildIndex(docsDir)
    expect(entries[0]).toMatchObject({
      section: 'Intro',
      path: 'README',
      title: 'Intro',
    })
    const schedule = entries.find(
      (e) => e.path === 'providers/aws/events/schedule',
    )
    expect(schedule).toMatchObject({
      section: 'Usage',
      title: 'Events › Schedule',
    })
    expect(schedule.bytes).toBeGreaterThan(0)
  })
  it('appends pages the menu omits under "Other pages", titled from their frontmatter', async () => {
    const entries = await buildIndex(docsDir)
    const orphan = entries.find((e) => e.path === 'orphan')
    expect(orphan).toMatchObject({
      section: 'Other pages',
      title: 'Orphan Page',
    })
    // a directory page named by the menu is NOT duplicated as README
    expect(
      entries.filter((e) => e.path.startsWith('guides/mcp')).map((e) => e.path),
    ).toEqual(['guides/mcp', 'guides/mcp/setup'])
  })
  it('lists a top-level menu path written with a trailing "/" once, as nested ones are', async () => {
    const dir = await realpath(
      await mkdtemp(path.join(tmpdir(), 'agent-docs-')),
    )
    try {
      await mkdir(path.join(dir, 'guides'), { recursive: true })
      await writeFile(
        path.join(dir, 'guides', 'README.md'),
        page('Guides', 'x'),
      )
      await writeFile(
        path.join(dir, 'menu.json'),
        JSON.stringify({ Guides: 'guides/', Nested: { Again: 'guides/' } }),
      )
      const entries = await buildIndex(dir)
      expect(entries.map((e) => e.path)).toEqual(['guides', 'guides'])
      expect(entries.some((e) => e.section === 'Other pages')).toBe(false)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('renderIndex', () => {
  it('prints the ratified header, one section per group, aligned columns and ~KB sizes', async () => {
    const text = renderIndex(await buildIndex(docsDir))
    const lines = text.split('\n')
    expect(lines[0]).toBe(
      'Serverless Framework documentation. Read a page: serverless agent docs <path> [<path> ...]',
    )
    expect(lines[1]).toBe('')
    expect(text).toContain('\nGet Started\n')
    expect(text).toMatch(/\n {2}getting-started\s+Setup\s+~1 KB\n/)
    expect(text).toContain('\nOther pages\n')
  })
})

describe('resolvePage', () => {
  it('resolves bare paths, .md paths and directory pages to a file', async () => {
    expect(
      (await resolvePage(docsDir, 'getting-started')).endsWith(
        'getting-started.md',
      ),
    ).toBe(true)
    expect(
      (await resolvePage(docsDir, 'getting-started.md')).endsWith(
        'getting-started.md',
      ),
    ).toBe(true)
    expect(
      (await resolvePage(docsDir, 'guides/mcp')).endsWith(
        path.join('guides', 'mcp', 'README.md'),
      ),
    ).toBe(true)
    expect(
      (await resolvePage(docsDir, 'guides/mcp/')).endsWith(
        path.join('guides', 'mcp', 'README.md'),
      ),
    ).toBe(true)
  })
  it('resolves "." to the documentation root README', async () => {
    // The first candidate for "." is "..md", which a naive startsWith('..')
    // containment test reads as an escape -- so "." was rejected before
    // "./README.md" was ever tried.
    expect((await resolvePage(docsDir, '.')).endsWith('README.md')).toBe(true)
  })
  it('rejects paths that escape the docs root', async () => {
    await expect(resolvePage(docsDir, '../etc/passwd')).rejects.toMatchObject({
      code: 'AGENT_DOCS_INVALID_PATH',
    })
    await expect(resolvePage(docsDir, '/etc/passwd')).rejects.toMatchObject({
      code: 'AGENT_DOCS_INVALID_PATH',
    })
  })
  itWithSymlinks(
    'rejects a symlink inside the tree that points outside it',
    async () => {
      // Lexically these never leave docsDir; only the realpath check catches them.
      await expect(resolvePage(docsDir, 'evil/secret')).rejects.toMatchObject({
        code: 'AGENT_DOCS_INVALID_PATH',
      })
      await expect(resolvePage(docsDir, 'escape')).rejects.toMatchObject({
        code: 'AGENT_DOCS_INVALID_PATH',
      })
      await expect(resolvePage(docsDir, 'escape.md')).rejects.toMatchObject({
        code: 'AGENT_DOCS_INVALID_PATH',
      })
    },
  )
  itWithSymlinks(
    'still resolves a symlink that stays inside the tree',
    async () => {
      // Containment is decided on the realpath, and that is what comes back:
      // an in-tree link resolves to its target, not to the link's own name.
      expect(await resolvePage(docsDir, 'inside/setup')).toBe(
        path.join(docsDir, 'guides', 'mcp', 'setup.md'),
      )
      expect(await resolvePage(docsDir, 'inside')).toBe(
        path.join(docsDir, 'guides', 'mcp', 'README.md'),
      )
    },
  )
  it('suggests sibling pages for an unknown page under a known directory', async () => {
    await expect(
      resolvePage(docsDir, 'guides/mcp/tools'),
    ).rejects.toMatchObject({
      code: 'AGENT_DOCS_PAGE_NOT_FOUND',
      message: expect.stringContaining(
        'Page "guides/mcp/tools" not found. Pages under "guides/mcp":',
      ),
    })
    await expect(
      resolvePage(docsDir, 'guides/mcp/tools'),
    ).rejects.toMatchObject({
      message: expect.stringContaining('  guides/mcp/setup'),
    })
  })
  it('falls back to the index hint when no parent directory exists', async () => {
    await expect(resolvePage(docsDir, 'nope/nothing')).rejects.toMatchObject({
      message:
        'Page "nope/nothing" not found. Run "serverless agent docs" for the full index.',
    })
  })
  it('reports a path the filesystem cannot even look at as not found', async () => {
    // A name past NAME_MAX makes realpath throw ENAMETOOLONG rather than
    // ENOENT. Every unreadable candidate must still come back as a page miss,
    // not as a raw filesystem error carrying the absolute install path.
    await expect(resolvePage(docsDir, 'a'.repeat(400))).rejects.toMatchObject({
      code: 'AGENT_DOCS_PAGE_NOT_FOUND',
    })
  })
})

describe('normalizePaths', () => {
  it('accepts undefined, a string, an array, and comma-joined values', () => {
    expect(normalizePaths(undefined)).toEqual([])
    expect(normalizePaths('a')).toEqual(['a'])
    expect(normalizePaths(['a', 'b,c', ' d '])).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('agentDocs', () => {
  const capture = () => {
    const chunks = []
    return { write: (t) => chunks.push(t), text: () => chunks.join('') }
  }
  it('prints the index when no paths are given and reports index analytics', async () => {
    const out = capture()
    const result = await agentDocs({ paths: [], docsDir, write: out.write })
    expect(out.text()).toContain('Serverless Framework documentation.')
    expect(result).toEqual({ pages: 0, index: true })
  })
  it('prints a single page as plain stripped markdown ending in a newline', async () => {
    const out = capture()
    const result = await agentDocs({
      paths: ['getting-started'],
      docsDir,
      write: out.write,
    })
    expect(out.text().startsWith('# Setting Up')).toBe(true)
    expect(out.text().endsWith('\n')).toBe(true)
    expect(out.text()).not.toContain('## getting-started')
    expect(result).toEqual({ pages: 1, index: false })
  })
  it('prints several pages each under a "## <path>" heading', async () => {
    const out = capture()
    await agentDocs({
      paths: ['getting-started', 'guides/mcp'],
      docsDir,
      write: out.write,
    })
    expect(out.text()).toContain('## getting-started\n\n# Setting Up')
    expect(out.text()).toContain('## guides/mcp\n\n# MCP Server')
  })
  it('maps an unreadable path to the page-not-found error, printing nothing', async () => {
    const out = capture()
    await expect(
      agentDocs({ paths: ['a'.repeat(400)], docsDir, write: out.write }),
    ).rejects.toMatchObject({ code: 'AGENT_DOCS_PAGE_NOT_FOUND' })
    expect(out.text()).toBe('')
  })
  it('fails as a whole (nothing printed) when one path is unknown', async () => {
    const out = capture()
    await expect(
      agentDocs({
        paths: ['getting-started', 'missing'],
        docsDir,
        write: out.write,
      }),
    ).rejects.toMatchObject({ code: 'AGENT_DOCS_PAGE_NOT_FOUND' })
    expect(out.text()).toBe('')
  })
})

describe('buildIndex resilience', () => {
  let staleDir
  beforeAll(async () => {
    staleDir = await realpath(
      await mkdtemp(path.join(tmpdir(), 'agent-docs-stale-')),
    )
    await writeFile(path.join(staleDir, 'README.md'), page('Root', 'root'))
    await writeFile(path.join(staleDir, 'kept.md'), page('Kept', 'kept'))
    await writeFile(
      path.join(staleDir, 'menu.json'),
      JSON.stringify({
        Intro: '',
        Section: { Kept: 'kept', Gone: 'removed-page' },
      }),
    )
  })
  afterAll(() => rm(staleDir, { recursive: true, force: true }))

  it('skips a menu entry whose page no longer exists instead of failing the index', async () => {
    const entries = await buildIndex(staleDir)
    expect(entries.map((e) => e.path)).toEqual(['README', 'kept'])
    expect(entries.every((e) => e.bytes > 0)).toBe(true)
  })

  it('still prints an index for a docs tree with a stale menu entry', async () => {
    const chunks = []
    const result = await agentDocs({
      paths: [],
      docsDir: staleDir,
      write: (t) => chunks.push(t),
    })
    expect(result).toEqual({ pages: 0, index: true })
    expect(chunks.join('')).toContain('Serverless Framework documentation.')
  })
})

// Drift guard: skipping an unresolvable menu entry keeps the shipped command
// usable, so the repo needs a test that fails loudly when menu.json and the
// packaged tree actually disagree.
describe('the packaged docs/sf tree', () => {
  const repoDocsDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../../../../../..',
    'docs/sf',
  )

  const menuLeaves = (node, out = []) => {
    for (const value of Object.values(node)) {
      if (typeof value === 'string') out.push(value === '' ? 'README' : value)
      else if (value && typeof value === 'object') menuLeaves(value, out)
    }
    return out
  }

  const countMarkdown = async (dir) => {
    let total = 0
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.isDirectory())
        total += await countMarkdown(path.join(dir, entry.name))
      else if (entry.isFile() && entry.name.endsWith('.md')) total += 1
    }
    return total
  }

  it('resolves every menu.json entry to a page that exists', async () => {
    const menu = JSON.parse(
      await readFile(path.join(repoDocsDir, 'menu.json'), 'utf8'),
    )
    const leaves = menuLeaves(menu)
    expect(leaves.length).toBeGreaterThan(0)
    const broken = []
    for (const leaf of leaves) {
      try {
        await resolvePage(repoDocsDir, leaf)
      } catch {
        broken.push(leaf)
      }
    }
    expect(broken).toEqual([])
  })

  it('indexes every packaged page exactly once', async () => {
    const entries = await buildIndex(repoDocsDir)
    expect(entries.length).toBe(await countMarkdown(repoDocsDir))
    expect(new Set(entries.map((e) => e.path)).size).toBe(entries.length)
  })
})
