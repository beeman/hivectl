import { expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  CHECKOUT_SHA,
  createGhPinActionsRepo,
  PUBLISH_SHA,
  runGhPinActionsCli,
  SETUP_NODE_SHA,
  startFakeGitHubApi,
  UNSTABLE_SHA,
} from '../shared/cli-test-utils.ts'

test('pins external GitHub Actions in multiple files and reports changes in alphabetical order', async () => {
  const api = await startFakeGitHubApi()
  const directory = createGhPinActionsRepo()

  try {
    const result = await runGhPinActionsCli(['--api-url', api.url], directory)

    expect(result.status).toBe(0)
    expect(result.stdout.trim()).toBe(
      [
        'Found 3 unique action uses in 2 files.',
        '',
        'Actions:',
        `  acme/publish/task -> v1.4.0 @ ${PUBLISH_SHA}`,
        `  actions/checkout -> v6.0.0 @ ${CHECKOUT_SHA}`,
        `  actions/setup-node -> v21.0.0 @ ${SETUP_NODE_SHA}`,
        '',
        'Updated 3 uses lines across 2 files.',
        '  .github/actions/setup/action.yml: 2',
        '  .github/workflows/ci.yaml: 1',
      ].join('\n'),
    )
    expect(result.stderr.trim()).toBe('')
    expect(readFileSync(join(directory, '.github', 'workflows', 'ci.yaml'), 'utf8')).toContain(
      `      - uses: actions/checkout@${CHECKOUT_SHA} # v6.0.0`,
    )
    expect(readFileSync(join(directory, '.github', 'workflows', 'ci.yaml'), 'utf8')).toContain(
      '      - uses: ./.github/actions/setup',
    )
    expect(readFileSync(join(directory, '.github', 'workflows', 'ci.yaml'), 'utf8')).toContain(
      '      - uses: docker://alpine:3.20',
    )
    expect(readFileSync(join(directory, '.github', 'actions', 'setup', 'action.yml'), 'utf8')).toContain(
      `    - uses: 'actions/setup-node@${SETUP_NODE_SHA}' # v21.0.0`,
    )
    expect(readFileSync(join(directory, '.github', 'actions', 'setup', 'action.yml'), 'utf8')).toContain(
      `    - uses: "acme/publish/task@${PUBLISH_SHA}" # v1.4.0`,
    )
  } finally {
    rmSync(directory, { force: true, recursive: true })
    await api.close()
  }
})

test('prints planned GitHub Actions updates in dry-run mode without writing files', async () => {
  const api = await startFakeGitHubApi()
  const directory = createGhPinActionsRepo()
  const workflowPath = join(directory, '.github', 'workflows', 'ci.yaml')
  const originalWorkflow = readFileSync(workflowPath, 'utf8')

  try {
    const result = await runGhPinActionsCli(['--api-url', api.url, '--dry-run'], directory)

    expect(result.status).toBe(0)
    expect(result.stdout.trim()).toContain('Would update 3 uses lines across 2 files.')
    expect(result.stderr.trim()).toBe('')
    expect(readFileSync(workflowPath, 'utf8')).toBe(originalWorkflow)
  } finally {
    rmSync(directory, { force: true, recursive: true })
    await api.close()
  }
})

test('checks GitHub Actions pins without writing files', async () => {
  const api = await startFakeGitHubApi()
  const directory = createGhPinActionsRepo()
  const workflowPath = join(directory, '.github', 'workflows', 'ci.yaml')
  const originalWorkflow = readFileSync(workflowPath, 'utf8')

  try {
    const dirtyResult = await runGhPinActionsCli(['--api-url', api.url, '--check'], directory)

    expect(dirtyResult.status).toBe(1)
    expect(dirtyResult.stdout.trim()).toContain('Would update 3 uses lines across 2 files.')
    expect(dirtyResult.stderr.trim()).toBe('')
    expect(readFileSync(workflowPath, 'utf8')).toBe(originalWorkflow)

    const writeResult = await runGhPinActionsCli(['--api-url', api.url], directory)
    const cleanResult = await runGhPinActionsCli(['--api-url', api.url, '--check'], directory)

    expect(writeResult.status).toBe(0)
    expect(cleanResult.status).toBe(0)
    expect(cleanResult.stdout.trim()).toContain('Would update 0 uses lines across 0 files.')
    expect(cleanResult.stderr.trim()).toBe('')
  } finally {
    rmSync(directory, { force: true, recursive: true })
    await api.close()
  }
})

test('prints JSON output for GitHub Actions pinning results', async () => {
  const api = await startFakeGitHubApi()
  const directory = createGhPinActionsRepo()

  try {
    const result = await runGhPinActionsCli(['--api-url', api.url, '--dry-run', '--json'], directory)

    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual({
      actions: [
        {
          actionPath: 'acme/publish/task',
          repoKey: 'acme/publish',
          sha: PUBLISH_SHA,
          tag: 'v1.4.0',
        },
        {
          actionPath: 'actions/checkout',
          repoKey: 'actions/checkout',
          sha: CHECKOUT_SHA,
          tag: 'v6.0.0',
        },
        {
          actionPath: 'actions/setup-node',
          repoKey: 'actions/setup-node',
          sha: SETUP_NODE_SHA,
          tag: 'v21.0.0',
        },
      ],
      changedByFile: {
        '.github/actions/setup/action.yml': 2,
        '.github/workflows/ci.yaml': 1,
      },
      fileCount: 2,
      mode: 'dry_run',
      status: 'would_update',
      totalChanged: 3,
      uniqueActionCount: 3,
    })
    expect(result.stderr.trim()).toBe('')
  } finally {
    rmSync(directory, { force: true, recursive: true })
    await api.close()
  }
})

test('fails when a GitHub Action has no stable exact SemVer tag', async () => {
  const api = await startFakeGitHubApi()
  const directory = mkdtempSync(join(tmpdir(), 'hivectl-pin-actions-'))

  mkdirSync(join(directory, '.github', 'workflows'), { recursive: true })
  writeFileSync(
    join(directory, '.github', 'workflows', 'ci.yaml'),
    ['name: CI', 'jobs:', '  build:', '    steps:', '      - uses: acme/unstable@main', ''].join('\n'),
  )

  try {
    const result = await runGhPinActionsCli(['--api-url', api.url], directory)

    expect(result.status).toBe(1)
    expect(result.stdout.trim()).toBe('')
    expect(result.stderr.trim()).toBe('No stable exact SemVer tag found for acme/unstable')
  } finally {
    rmSync(directory, { force: true, recursive: true })
    await api.close()
  }
})

test('allows SemVer build metadata without prerelease opt-in', async () => {
  const api = await startFakeGitHubApi()
  const directory = mkdtempSync(join(tmpdir(), 'hivectl-pin-actions-'))
  const workflowPath = join(directory, '.github', 'workflows', 'ci.yaml')

  mkdirSync(join(directory, '.github', 'workflows'), { recursive: true })
  writeFileSync(
    workflowPath,
    ['name: CI', 'jobs:', '  build:', '    steps:', '      - uses: acme/build@main', ''].join('\n'),
  )

  try {
    const result = await runGhPinActionsCli(['--api-url', api.url], directory)

    expect(result.status).toBe(0)
    expect(result.stderr.trim()).toBe('')
    expect(readFileSync(workflowPath, 'utf8')).toContain(`      - uses: acme/build@${PUBLISH_SHA} # v1.0.0+build.5`)
  } finally {
    rmSync(directory, { force: true, recursive: true })
    await api.close()
  }
})

test('allows prerelease GitHub Action tags when requested', async () => {
  const api = await startFakeGitHubApi()
  const directory = mkdtempSync(join(tmpdir(), 'hivectl-pin-actions-'))
  const workflowPath = join(directory, '.github', 'workflows', 'ci.yaml')

  mkdirSync(join(directory, '.github', 'workflows'), { recursive: true })
  writeFileSync(
    workflowPath,
    ['name: CI', 'jobs:', '  build:', '    steps:', '      - uses: acme/unstable@main', ''].join('\n'),
  )

  try {
    const result = await runGhPinActionsCli(['--api-url', api.url, '--include-prereleases'], directory)

    expect(result.status).toBe(0)
    expect(result.stderr.trim()).toBe('')
    expect(readFileSync(workflowPath, 'utf8')).toContain(`      - uses: acme/unstable@${UNSTABLE_SHA} # v2.0.0-beta.1`)
  } finally {
    rmSync(directory, { force: true, recursive: true })
    await api.close()
  }
})

test('returns exit code 2 when no GitHub Actions YAML files are found', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'hivectl-pin-actions-'))

  try {
    const result = await runGhPinActionsCli([], directory)

    expect(result.status).toBe(2)
    expect(result.stdout.trim()).toBe('')
    expect(result.stderr.trim()).toBe('No .github YAML files found.')
  } finally {
    rmSync(directory, { force: true, recursive: true })
  }
})

test('skips files without external GitHub Action uses references', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'hivectl-pin-actions-'))

  mkdirSync(join(directory, '.github', 'workflows'), { recursive: true })
  writeFileSync(
    join(directory, '.github', 'workflows', 'ci.yaml'),
    [
      'name: CI',
      'jobs:',
      '  build:',
      '    steps:',
      '      - uses: ./.github/actions/setup',
      '      - uses: docker://alpine:3.20',
      '',
    ].join('\n'),
  )

  try {
    const result = await runGhPinActionsCli([], directory)

    expect(result.status).toBe(0)
    expect(result.stdout.trim()).toBe('No external GitHub action uses references found.')
    expect(result.stderr.trim()).toBe('')
  } finally {
    rmSync(directory, { force: true, recursive: true })
  }
})
