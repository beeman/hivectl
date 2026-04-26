import { expect, test } from 'bun:test'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createDepsFixture, readPackageJson, runDepsCli, writePackageJson } from '../shared/cli-test-utils.ts'

test('previews pin changes without writing files', () => {
  const directory = createDepsFixture()

  try {
    writePackageJson(directory, {
      dependencies: {
        react: '^19.2.0',
      },
      name: 'dry-run-pin',
      packageManager: 'bun@1.3.12',
    })
    const originalPackageJson = readFileSync(join(directory, 'package.json'), 'utf8')

    const result = runDepsCli(['pin', '--dry-run', '--json'], directory)
    const output = JSON.parse(result.stdout)

    expect(result.status).toBe(0)
    expect(output.changes).toEqual([
      {
        field: 'dependencies',
        from: '^19.2.0',
        name: 'react',
        path: 'package.json',
        to: '19.2.0',
      },
    ])
    expect(output.configChanges).toEqual([
      {
        action: 'create',
        path: 'bunfig.toml',
        setting: 'install.exact',
        to: 'true',
      },
    ])
    expect(readFileSync(join(directory, 'package.json'), 'utf8')).toBe(originalPackageJson)
    expect(existsSync(join(directory, 'bunfig.toml'))).toBe(false)
    expect(result.stderr.trim()).toBe('')
  } finally {
    rmSync(directory, { force: true, recursive: true })
  }
})

test('pins Bun workspace dependency specs and creates bunfig exact config', () => {
  const directory = createDepsFixture()

  try {
    writePackageJson(directory, {
      catalog: {
        react: '^19.2.0',
      },
      dependencies: {
        '@workspace/app': 'workspace:*',
        vite: '~7.3.2',
      },
      name: 'bun-pin',
      packageManager: 'bun@1.3.12',
      workspaces: ['packages/*'],
    })
    writePackageJson(join(directory, 'packages/app'), {
      dependencies: {
        '@scope/pkg': '=1.2.3-beta.1',
        zod: '^4.1.0',
      },
      name: '@workspace/app',
    })

    const result = runDepsCli(['pin'], directory)
    const rootPackageJson = readPackageJson(directory)
    const workspacePackageJson = readPackageJson(join(directory, 'packages/app'))

    expect(result.status).toBe(0)
    expect(rootPackageJson).toMatchObject({
      catalog: {
        react: '19.2.0',
      },
      dependencies: {
        '@workspace/app': 'workspace:*',
        vite: '7.3.2',
      },
    })
    expect(workspacePackageJson).toMatchObject({
      dependencies: {
        '@scope/pkg': '1.2.3-beta.1',
        zod: '4.1.0',
      },
    })
    expect(readFileSync(join(directory, 'bunfig.toml'), 'utf8')).toBe('[install]\nexact = true\n')
    expect(result.stdout).toContain('Pinned 4 dependency spec(s)')
    expect(result.stderr.trim()).toBe('')
  } finally {
    rmSync(directory, { force: true, recursive: true })
  }
})

test('pins pnpm workspace catalogs and writes save-exact config', () => {
  const directory = createDepsFixture()

  try {
    writePackageJson(directory, {
      name: 'pnpm-pin',
      packageManager: 'pnpm@10.0.0',
    })
    writeFileSync(
      join(directory, 'pnpm-workspace.yaml'),
      ['packages:', "  - 'packages/*'", 'catalog:', '  react: ^19.2.0', ''].join('\n'),
    )
    writePackageJson(join(directory, 'packages/app'), {
      dependencies: {
        react: '^19.2.0',
      },
      name: '@workspace/app',
    })

    const result = runDepsCli(['pin'], directory)

    expect(result.status).toBe(0)
    expect(readPackageJson(join(directory, 'packages/app'))).toMatchObject({
      dependencies: {
        react: '19.2.0',
      },
    })
    expect(readFileSync(join(directory, 'pnpm-workspace.yaml'), 'utf8')).toContain('react: 19.2.0')
    expect(readFileSync(join(directory, '.npmrc'), 'utf8')).toBe('save-exact=true\n')
    expect(result.stderr.trim()).toBe('')
  } finally {
    rmSync(directory, { force: true, recursive: true })
  }
})

test('updates npm save-exact config when pinning npm projects', () => {
  const directory = createDepsFixture()

  try {
    writePackageJson(directory, {
      dependencies: {
        react: '^19.2.0',
      },
      name: 'npm-pin',
      packageManager: 'npm@11.0.0',
    })
    writeFileSync(join(directory, '.npmrc'), 'registry=https://registry.npmjs.org/\nsave-exact=false\n')

    const result = runDepsCli(['pin'], directory)

    expect(result.status).toBe(0)
    expect(readPackageJson(directory)).toMatchObject({
      dependencies: {
        react: '19.2.0',
      },
    })
    expect(readFileSync(join(directory, '.npmrc'), 'utf8')).toBe(
      'registry=https://registry.npmjs.org/\nsave-exact=true\n',
    )
    expect(result.stderr.trim()).toBe('')
  } finally {
    rmSync(directory, { force: true, recursive: true })
  }
})

test('updates the effective npm save-exact config entry', () => {
  const directory = createDepsFixture()

  try {
    writePackageJson(directory, {
      dependencies: {
        react: '^19.2.0',
      },
      name: 'npm-pin-duplicates',
      packageManager: 'npm@11.0.0',
    })
    writeFileSync(
      join(directory, '.npmrc'),
      'save-exact=true\nregistry=https://registry.npmjs.org/\nsave-exact=false\n',
    )

    const result = runDepsCli(['pin'], directory)

    expect(result.status).toBe(0)
    expect(readFileSync(join(directory, '.npmrc'), 'utf8')).toBe(
      'save-exact=true\nregistry=https://registry.npmjs.org/\nsave-exact=true\n',
    )
    expect(result.stderr.trim()).toBe('')
  } finally {
    rmSync(directory, { force: true, recursive: true })
  }
})

test('does not add a leading newline when updating an empty bunfig', () => {
  const directory = createDepsFixture()

  try {
    writePackageJson(directory, {
      name: 'bun-empty-config',
      packageManager: 'bun@1.3.12',
    })
    writeFileSync(join(directory, 'bunfig.toml'), '')

    const result = runDepsCli(['pin'], directory)

    expect(result.status).toBe(0)
    expect(readFileSync(join(directory, 'bunfig.toml'), 'utf8')).toBe('[install]\nexact = true')
    expect(result.stderr.trim()).toBe('')
  } finally {
    rmSync(directory, { force: true, recursive: true })
  }
})
