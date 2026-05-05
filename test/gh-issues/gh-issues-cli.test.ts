import { expect, test } from 'bun:test'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { styleText } from 'node:util'
import { createGhIssuesFixture, runGhIssuesCli, startFakeGhIssuesApi } from '../shared/cli-test-utils.ts'

type StyleFormat = Parameters<typeof styleText>[0]

function getCacheDirectory(root: string): string {
  return join(root, '.hivectl', 'gh-issues', 'github.com', 'beeman', 'hivectl')
}

function color(format: StyleFormat, text: string): string {
  return styleText(format, text)
}

test('syncs GitHub issues into a hidden cache and adds it to git info exclude', async () => {
  const api = await startFakeGhIssuesApi()
  const fixture = createGhIssuesFixture()

  try {
    const result = await runGhIssuesCli(['sync', '--api-url', api.url, '--remote', 'upstream'], fixture, {
      GH_TOKEN: 'test-token',
    })
    const cacheDirectory = getCacheDirectory(fixture)
    const issueOne = JSON.parse(readFileSync(join(cacheDirectory, 'issues', '1.json'), 'utf8'))
    const issueTwo = JSON.parse(readFileSync(join(cacheDirectory, 'issues', '2.json'), 'utf8'))

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Added .hivectl/gh-issues/ to ')
    expect(result.stdout).toContain(
      'Synced github.com/beeman/hivectl into .hivectl/gh-issues/github.com/beeman/hivectl',
    )
    expect(result.stdout).toContain('Fetched 2 issue(s), 2 comment(s), 3 GitHub API request(s)')
    expect(result.stderr.trim()).toBe('')
    expect(readFileSync(join(fixture, '.git', 'info', 'exclude'), 'utf8')).toBe('.hivectl/gh-issues/\n')
    expect(issueOne).toMatchObject({
      author: 'alice',
      comments: [
        {
          author: 'carol',
          body: 'A cached comment should be searchable without the API.',
        },
      ],
      number: 1,
      title: 'Offline issue cache',
    })
    expect(issueTwo).toMatchObject({
      author: 'bob',
      comments: [
        {
          author: 'dave',
          body: 'Search through cached issue comments.',
        },
      ],
      number: 2,
      title: 'Search cached comments',
    })
    expect(existsSync(join(cacheDirectory, 'issues', '3.json'))).toBe(false)
    expect(api.requests).toEqual([
      '/repos/beeman/hivectl/issues?direction=asc&per_page=100&sort=updated&state=all',
      '/repos/beeman/hivectl/issues/1/comments?per_page=100',
      '/repos/beeman/hivectl/issues/2/comments?per_page=100',
    ])
  } finally {
    await api.close()
    rmSync(fixture, { force: true, recursive: true })
  }
})

test('uses the saved sync cursor on repeat syncs', async () => {
  const api = await startFakeGhIssuesApi()
  const fixture = createGhIssuesFixture()

  try {
    const first = await runGhIssuesCli(['sync', '--api-url', api.url, '--remote', 'upstream'], fixture, {
      GH_TOKEN: 'test-token',
    })
    const second = await runGhIssuesCli(['sync', '--api-url', api.url, '--remote', 'upstream'], fixture, {
      GH_TOKEN: 'test-token',
    })

    expect(first.status).toBe(0)
    expect(second.status).toBe(0)
    expect(second.stdout).not.toContain('Added .hivectl/gh-issues/')
    expect(second.stdout).toContain('Fetched 0 issue(s), 0 comment(s), 1 GitHub API request(s)')
    expect(api.requests.at(-1)).toContain('/repos/beeman/hivectl/issues?')
    expect(api.requests.at(-1)).toContain('since=')
  } finally {
    await api.close()
    rmSync(fixture, { force: true, recursive: true })
  }
})

test('searches cached issues without calling the GitHub API', async () => {
  const api = await startFakeGhIssuesApi()
  const fixture = createGhIssuesFixture()

  try {
    const sync = await runGhIssuesCli(['sync', '--api-url', api.url, '--remote', 'upstream'], fixture, {
      GH_TOKEN: 'test-token',
    })
    const requestCount = api.requests.length
    const search = await runGhIssuesCli(['search', 'cached', '--remote', 'upstream'], fixture)

    expect(sync.status).toBe(0)
    expect(search.status).toBe(0)
    expect(search.stdout.trim()).toBe(
      [
        'Found 2 cached GitHub issue(s) matching "cached" in github.com/beeman/hivectl',
        '#2 closed Search cached comments',
        'https://github.com/beeman/hivectl/issues/2',
        'title: Search cached comments',
        'body: A second cached issue.',
        'comment by dave: Search through cached issue comments.',
        '#1 open Offline issue cache',
        'https://github.com/beeman/hivectl/issues/1',
        'comment by carol: A cached comment should be searchable without the API.',
      ].join('\n'),
    )
    expect(search.stderr.trim()).toBe('')
    expect(api.requests.length).toBe(requestCount)
  } finally {
    await api.close()
    rmSync(fixture, { force: true, recursive: true })
  }
})

test('matches cached search content after stripping ANSI escape sequences', async () => {
  const api = await startFakeGhIssuesApi()
  const fixture = createGhIssuesFixture()

  try {
    const sync = await runGhIssuesCli(['sync', '--api-url', api.url, '--remote', 'upstream'], fixture, {
      GH_TOKEN: 'test-token',
    })
    const cacheDirectory = getCacheDirectory(fixture)
    const issuePath = join(cacheDirectory, 'issues', '1.json')
    const issue = JSON.parse(readFileSync(issuePath, 'utf8'))

    issue.body = 'ca\u001b[31mch\u001b[0med with terminal color'
    writeFileSync(issuePath, `${JSON.stringify(issue, null, 2)}\n`)

    const requestCount = api.requests.length
    const search = await runGhIssuesCli(['search', 'cached', '--remote', 'upstream'], fixture)

    expect(sync.status).toBe(0)
    expect(search.status).toBe(0)
    expect(search.stdout).toContain('body: cached with terminal color')
    expect(search.stderr.trim()).toBe('')
    expect(api.requests.length).toBe(requestCount)
  } finally {
    await api.close()
    rmSync(fixture, { force: true, recursive: true })
  }
})

test('refuses cross-origin GitHub API pagination URLs', async () => {
  const api = await startFakeGhIssuesApi({ crossOriginNext: true })
  const fixture = createGhIssuesFixture()

  try {
    const result = await runGhIssuesCli(['sync', '--api-url', api.url, '--remote', 'upstream'], fixture, {
      GH_TOKEN: 'test-token',
    })

    expect(result.status).toBe(1)
    expect(result.stdout.trim()).toBe('')
    expect(result.stderr.trim()).toBe(
      `Refusing cross-origin GitHub API request: https://evil.example (expected ${api.url})`,
    )
    expect(api.requests).toEqual(['/repos/beeman/hivectl/issues?direction=asc&per_page=100&sort=updated&state=all'])
  } finally {
    await api.close()
    rmSync(fixture, { force: true, recursive: true })
  }
})

test('lists cached issues with local filters without calling the GitHub API', async () => {
  const api = await startFakeGhIssuesApi()
  const fixture = createGhIssuesFixture()

  try {
    const sync = await runGhIssuesCli(['sync', '--api-url', api.url, '--remote', 'upstream'], fixture, {
      GH_TOKEN: 'test-token',
    })
    const requestCount = api.requests.length
    const list = await runGhIssuesCli(
      [
        'list',
        '--author',
        'bob',
        '--keyword',
        'comments',
        '--remote',
        'upstream',
        '--status',
        'closed',
        '--tag',
        'enhancement',
      ],
      fixture,
    )

    expect(sync.status).toBe(0)
    expect(list.status).toBe(0)
    expect(list.stdout.trim()).toBe(
      [
        `${color(['bold', 'green'], 'Found 1')} cached GitHub issue(s) in ${color('cyan', 'github.com/beeman/hivectl')}`,
        `${color('bold', '#2')} ${color(['bold', 'magenta'], 'closed')} ${color('bold', 'Search cached comments')}`,
        `${color('dim', 'author:')} bob ${color('dim', '| labels:')} ${color(
          'cyan',
          'enhancement',
        )} ${color('dim', '| updated:')} 2026-05-02T00:10:00Z`,
        color('blue', 'https://github.com/beeman/hivectl/issues/2'),
      ].join('\n'),
    )
    expect(list.stderr.trim()).toBe('')
    expect(api.requests.length).toBe(requestCount)
  } finally {
    await api.close()
    rmSync(fixture, { force: true, recursive: true })
  }
})

test('validates updated-after before reading the cache', async () => {
  const fixture = createGhIssuesFixture()

  try {
    const list = await runGhIssuesCli(['list', '--remote', 'upstream', '--updated-after', 'not-a-date'], fixture)

    expect(list.status).toBe(1)
    expect(list.stdout.trim()).toBe('')
    expect(list.stderr.trim()).toBe('Invalid --updated-after value "not-a-date". Expected a date or ISO timestamp.')
  } finally {
    rmSync(fixture, { force: true, recursive: true })
  }
})

test('prints JSON for listed cached issue filters and defaults to open status', async () => {
  const api = await startFakeGhIssuesApi()
  const fixture = createGhIssuesFixture()

  try {
    const sync = await runGhIssuesCli(['sync', '--api-url', api.url, '--remote', 'upstream'], fixture, {
      GH_TOKEN: 'test-token',
    })
    const list = await runGhIssuesCli(['list', '--json', '--remote', 'upstream', '--tag', 'bug'], fixture)

    expect(sync.status).toBe(0)
    expect(list.status).toBe(0)
    expect(JSON.parse(list.stdout)).toEqual({
      filters: {
        author: null,
        keyword: null,
        status: 'open',
        tags: ['bug'],
        updatedAfter: null,
      },
      issues: [
        {
          author: 'alice',
          labels: ['bug'],
          number: 1,
          state: 'open',
          title: 'Offline issue cache',
          updatedAt: '2026-05-01T00:10:00Z',
          url: 'https://github.com/beeman/hivectl/issues/1',
        },
      ],
      repository: {
        hostname: 'github.com',
        owner: 'beeman',
        repo: 'hivectl',
      },
    })
    expect(list.stderr.trim()).toBe('')
  } finally {
    await api.close()
    rmSync(fixture, { force: true, recursive: true })
  }
})

test('requires an explicit repo or remote when multiple GitHub remotes exist without a TTY', async () => {
  const api = await startFakeGhIssuesApi()
  const fixture = createGhIssuesFixture()

  try {
    const result = await runGhIssuesCli(['sync', '--api-url', api.url], fixture, {
      GH_TOKEN: 'test-token',
    })

    expect(result.status).toBe(1)
    expect(result.stdout.trim()).toBe('')
    expect(result.stderr.trim()).toBe(
      'gh-issues requires --remote or --repo when multiple GitHub remotes are available',
    )
    expect(api.requests).toEqual([])
  } finally {
    await api.close()
    rmSync(fixture, { force: true, recursive: true })
  }
})
