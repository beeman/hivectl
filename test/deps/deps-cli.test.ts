import { expect, test } from 'bun:test'
import { realpathSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createDepsFixture, runDepsCli, writePackageJson } from '../shared/cli-test-utils.ts'

test('lists root dependencies when no workspace config is present', () => {
  const directory = createDepsFixture()

  try {
    writePackageJson(directory, {
      dependencies: {
        react: '^19.0.0',
      },
      devDependencies: {
        '@types/node': '^24.0.0',
      },
      name: 'plain-package',
    })

    const result = runDepsCli(['list'], directory)

    expect(result.status).toBe(0)
    expect(result.stdout.trim()).toBe(
      [
        'package.json',
        '  workspace (0)',
        '    (none)',
        '  catalog (0)',
        '    (none)',
        '  direct (2)',
        '    [dependencies] react: ^19.0.0',
        '    [devDependencies] @types/node: ^24.0.0',
      ].join('\n'),
    )
    expect(result.stderr.trim()).toBe('')
  } finally {
    rmSync(directory, { force: true, recursive: true })
  }
})

test('supports explicit deps list subcommand', () => {
  const directory = createDepsFixture()

  try {
    writePackageJson(directory, {
      dependencies: {
        react: '^19.0.0',
      },
      name: 'plain-package',
    })

    const result = runDepsCli(['list', '--json'], directory)
    const output = JSON.parse(result.stdout)

    expect(result.status).toBe(0)
    expect(output.packages).toHaveLength(1)
    expect(output.packages[0].direct).toEqual([
      {
        field: 'dependencies',
        name: 'react',
        version: '^19.0.0',
      },
    ])
    expect(result.stderr.trim()).toBe('')
  } finally {
    rmSync(directory, { force: true, recursive: true })
  }
})

test('shows deps help instead of listing implicitly', () => {
  const directory = createDepsFixture()

  try {
    writePackageJson(directory, {
      dependencies: {
        react: '^19.0.0',
      },
      name: 'plain-package',
    })

    const result = runDepsCli([], directory)

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Usage: hivectl deps [options] [command]')
    expect(result.stdout).toContain('list [options] [root]')
    expect(result.stdout).not.toContain('[dependencies] react: ^19.0.0')
    expect(result.stderr.trim()).toBe('')
  } finally {
    rmSync(directory, { force: true, recursive: true })
  }
})

test('prints JSON for npm workspace package dependency specs', () => {
  const directory = createDepsFixture()

  try {
    writePackageJson(directory, {
      dependencies: {
        '@root/direct': '1.0.0',
      },
      name: 'npm-workspace',
      packageManager: 'npm@11.0.0',
      workspaces: ['apps/*', 'packages/*'],
    })
    writePackageJson(join(directory, 'apps/web'), {
      dependencies: {
        '@workspace/core': 'workspace:*',
        react: 'catalog:',
      },
      devDependencies: {
        vite: '^7.0.0',
      },
      name: '@workspace/web',
    })
    writePackageJson(join(directory, 'packages/core'), {
      name: '@workspace/core',
      optionalDependencies: {
        effect: 'catalog:runtime',
      },
      peerDependencies: {
        typescript: '^5',
      },
    })

    const result = runDepsCli(['list', '--json'], directory)
    const output = JSON.parse(result.stdout)

    expect(result.status).toBe(0)
    expect(output).toEqual({
      manager: 'npm',
      packages: [
        {
          catalog: [],
          direct: [
            {
              field: 'dependencies',
              name: '@root/direct',
              version: '1.0.0',
            },
          ],
          path: 'package.json',
          workspace: [],
        },
        {
          catalog: [
            {
              field: 'dependencies',
              name: 'react',
              version: 'catalog:',
            },
          ],
          direct: [
            {
              field: 'devDependencies',
              name: 'vite',
              version: '^7.0.0',
            },
          ],
          path: 'apps/web/package.json',
          workspace: [
            {
              field: 'dependencies',
              name: '@workspace/core',
              version: 'workspace:*',
            },
          ],
        },
        {
          catalog: [
            {
              field: 'optionalDependencies',
              name: 'effect',
              version: 'catalog:runtime',
            },
          ],
          direct: [
            {
              field: 'peerDependencies',
              name: 'typescript',
              version: '^5',
            },
          ],
          path: 'packages/core/package.json',
          workspace: [],
        },
      ],
      root: realpathSync(directory),
    })
    expect(result.stderr.trim()).toBe('')
  } finally {
    rmSync(directory, { force: true, recursive: true })
  }
})

test('supports Bun workspace object package patterns', () => {
  const directory = createDepsFixture()

  try {
    writePackageJson(directory, {
      name: 'bun-workspace',
      packageManager: 'bun@1.3.12',
      workspaces: {
        packages: ['packages/*'],
      },
    })
    writePackageJson(join(directory, 'packages/ui'), {
      devDependencies: {
        '@types/react': 'catalog:',
      },
      name: '@workspace/ui',
    })

    const result = runDepsCli(['list'], directory)

    expect(result.status).toBe(0)
    expect(result.stdout.trim()).toContain('packages/ui/package.json')
    expect(result.stdout.trim()).toContain('    [devDependencies] @types/react: catalog:')
    expect(result.stderr.trim()).toBe('')
  } finally {
    rmSync(directory, { force: true, recursive: true })
  }
})

test('supports pnpm workspace yaml package patterns and excludes', () => {
  const directory = createDepsFixture()

  try {
    writePackageJson(directory, {
      name: 'pnpm-workspace',
      packageManager: 'pnpm@10.0.0',
    })
    writeFileSync(
      join(directory, 'pnpm-workspace.yaml'),
      ['packages:', "  - 'examples/**'", "  - 'packages/*'", "  - '!examples/ignored/**'", ''].join('\n'),
    )
    writePackageJson(join(directory, 'examples/basic'), {
      dependencies: {
        react: 'catalog:',
      },
      name: '@workspace/basic',
    })
    writePackageJson(join(directory, 'examples/ignored/basic'), {
      dependencies: {
        react: 'catalog:',
      },
      name: '@workspace/ignored',
    })
    writePackageJson(join(directory, 'packages/core'), {
      dependencies: {
        '@workspace/basic': 'workspace:*',
      },
      name: '@workspace/core',
    })

    const result = runDepsCli(['list', '--json'], directory)
    const output = JSON.parse(result.stdout)

    expect(result.status).toBe(0)
    expect(output.manager).toBe('pnpm')
    expect(output.packages.map((packageReport: { path: string }) => packageReport.path)).toEqual([
      'package.json',
      'examples/basic/package.json',
      'packages/core/package.json',
    ])
    expect(result.stderr.trim()).toBe('')
  } finally {
    rmSync(directory, { force: true, recursive: true })
  }
})

test('excludes package json files matched by root gitignore patterns', () => {
  const directory = createDepsFixture()

  try {
    writePackageJson(directory, {
      name: 'gitignore-workspace',
      packageManager: 'pnpm@10.0.0',
    })
    writeFileSync(join(directory, '.gitignore'), ['dist', '.nx/cache', ''].join('\n'))
    writeFileSync(join(directory, 'pnpm-workspace.yaml'), ['ignoredBuiltDependencies:', '  - nx', ''].join('\n'))
    writePackageJson(join(directory, 'apps/web'), {
      dependencies: {
        react: '^19.0.0',
      },
      name: '@workspace/web',
    })
    writePackageJson(join(directory, '.nx/cache/123/dist/libs/sdk'), {
      dependencies: {
        graphql: '^16.6.0',
      },
      name: '@workspace/cached-sdk',
    })
    writePackageJson(join(directory, 'dist/libs/sdk'), {
      dependencies: {
        graphql: '^16.6.0',
      },
      name: '@workspace/dist-sdk',
    })

    const result = runDepsCli(['list', '--json'], directory)
    const output = JSON.parse(result.stdout)

    expect(result.status).toBe(0)
    expect(output.packages.map((packageReport: { path: string }) => packageReport.path)).toEqual([
      'package.json',
      'apps/web/package.json',
    ])
    expect(result.stderr.trim()).toBe('')
  } finally {
    rmSync(directory, { force: true, recursive: true })
  }
})

test('prefers pnpm workspace detection over Bun lockfile heuristics', () => {
  const directory = createDepsFixture()

  try {
    writePackageJson(directory, {
      name: 'mixed-lockfiles',
    })
    writeFileSync(join(directory, 'bun.lock'), '')
    writeFileSync(join(directory, 'pnpm-workspace.yaml'), ['packages:', "  - 'packages/*'", ''].join('\n'))
    writePackageJson(join(directory, 'packages/app'), {
      dependencies: {
        react: '^19.2.0',
      },
      name: '@workspace/app',
    })

    const result = runDepsCli(['list', '--json'], directory)
    const output = JSON.parse(result.stdout)

    expect(result.status).toBe(0)
    expect(output.manager).toBe('pnpm')
    expect(output.packages.map((packageReport: { path: string }) => packageReport.path)).toEqual([
      'package.json',
      'packages/app/package.json',
    ])
    expect(result.stderr.trim()).toBe('')
  } finally {
    rmSync(directory, { force: true, recursive: true })
  }
})

test('rejects Yarn projects', () => {
  const directory = createDepsFixture()

  try {
    writePackageJson(directory, {
      name: 'yarn-workspace',
      packageManager: 'yarn@4.0.0',
    })

    const result = runDepsCli(['list'], directory)

    expect(result.status).toBe(1)
    expect(result.stdout.trim()).toBe('')
    expect(result.stderr.trim()).toBe('Yarn projects are not supported')
  } finally {
    rmSync(directory, { force: true, recursive: true })
  }
})

test('suggests catalog matches, repeated direct deps, and version drift', () => {
  const directory = createDepsFixture()

  try {
    writePackageJson(directory, {
      catalog: {
        react: '19.2.0',
      },
      catalogs: {
        build: {
          vite: '7.3.2',
        },
      },
      name: 'suggest-workspace',
      packageManager: 'bun@1.3.12',
      workspaces: ['packages/*'],
    })
    writePackageJson(join(directory, 'packages/api'), {
      dependencies: {
        typescript: '5.9.3',
        vite: '7.3.2',
        zod: '^4.1.0',
      },
      name: '@workspace/api',
    })
    writePackageJson(join(directory, 'packages/app'), {
      dependencies: {
        react: '19.2.0',
        typescript: '5.9.3',
        vite: '7.3.2',
        zod: '4.0.0',
      },
      name: '@workspace/app',
    })
    writePackageJson(join(directory, 'packages/ui'), {
      dependencies: {
        vite: '^7.0.0',
        zod: '4.0.0',
      },
      devDependencies: {
        typescript: '5.9.3',
      },
      name: '@workspace/ui',
    })

    const result = runDepsCli(['list', '--suggest', '--json'], directory)
    const output = JSON.parse(result.stdout)

    expect(result.status).toBe(0)
    expect(output.suggestions).toEqual({
      catalogCandidates: [
        {
          count: 3,
          locations: [
            {
              field: 'dependencies',
              path: 'packages/api/package.json',
            },
            {
              field: 'dependencies',
              path: 'packages/app/package.json',
            },
            {
              field: 'devDependencies',
              path: 'packages/ui/package.json',
            },
          ],
          name: 'typescript',
          version: '5.9.3',
        },
        {
          count: 2,
          locations: [
            {
              field: 'dependencies',
              path: 'packages/app/package.json',
            },
            {
              field: 'dependencies',
              path: 'packages/ui/package.json',
            },
          ],
          name: 'zod',
          version: '4.0.0',
        },
      ],
      directCatalogMatches: [
        {
          catalog: 'default',
          count: 1,
          locations: [
            {
              field: 'dependencies',
              path: 'packages/app/package.json',
            },
          ],
          name: 'react',
          protocol: 'catalog:',
          version: '19.2.0',
        },
        {
          catalog: 'build',
          count: 2,
          locations: [
            {
              field: 'dependencies',
              path: 'packages/api/package.json',
            },
            {
              field: 'dependencies',
              path: 'packages/app/package.json',
            },
          ],
          name: 'vite',
          protocol: 'catalog:build',
          version: '7.3.2',
        },
      ],
      notes: [],
      versionDrift: [
        {
          name: 'vite',
          versions: [
            {
              count: 1,
              locations: [
                {
                  field: 'dependencies',
                  path: 'packages/ui/package.json',
                },
              ],
              version: '^7.0.0',
            },
            {
              count: 2,
              locations: [
                {
                  field: 'dependencies',
                  path: 'packages/api/package.json',
                },
                {
                  field: 'dependencies',
                  path: 'packages/app/package.json',
                },
              ],
              version: '7.3.2',
            },
          ],
        },
        {
          name: 'zod',
          versions: [
            {
              count: 1,
              locations: [
                {
                  field: 'dependencies',
                  path: 'packages/api/package.json',
                },
              ],
              version: '^4.1.0',
            },
            {
              count: 2,
              locations: [
                {
                  field: 'dependencies',
                  path: 'packages/app/package.json',
                },
                {
                  field: 'dependencies',
                  path: 'packages/ui/package.json',
                },
              ],
              version: '4.0.0',
            },
          ],
        },
      ],
    })
    expect(result.stderr.trim()).toBe('')
  } finally {
    rmSync(directory, { force: true, recursive: true })
  }
})

test('reports named catalog value errors with the catalog name', () => {
  const directory = createDepsFixture()

  try {
    writePackageJson(directory, {
      catalogs: {
        build: {
          vite: 7,
        },
      },
      name: 'invalid-catalog',
      packageManager: 'bun@1.3.12',
    })

    const result = runDepsCli(['list', '--suggest'], directory)

    expect(result.status).toBe(1)
    expect(result.stdout.trim()).toBe('')
    expect(result.stderr.trim()).toBe('package.json.catalogs.build.vite must be a string')
  } finally {
    rmSync(directory, { force: true, recursive: true })
  }
})

test('prints suggestion sections in text output', () => {
  const directory = createDepsFixture()

  try {
    writePackageJson(directory, {
      dependencies: {
        react: '19.2.0',
      },
      name: 'text-suggest-workspace',
      packageManager: 'bun@1.3.12',
      workspaces: ['packages/*'],
    })
    writePackageJson(join(directory, 'packages/app'), {
      dependencies: {
        react: '19.2.0',
        vite: '7.3.2',
      },
      name: '@workspace/app',
    })
    writePackageJson(join(directory, 'packages/ui'), {
      dependencies: {
        react: '^19.0.0',
        vite: '7.3.2',
      },
      name: '@workspace/ui',
    })

    const result = runDepsCli(['list', '--suggest'], directory)

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('suggestions')
    expect(result.stdout).toContain('  catalog candidates')
    expect(result.stdout).toContain('    vite: 7.3.2 (2)')
    expect(result.stdout).toContain('  version drift')
    expect(result.stdout).toContain('    react')
    expect(result.stderr.trim()).toBe('')
  } finally {
    rmSync(directory, { force: true, recursive: true })
  }
})

test('notes that npm projects cannot apply catalog suggestions directly', () => {
  const directory = createDepsFixture()

  try {
    writePackageJson(directory, {
      dependencies: {
        react: '19.2.0',
      },
      name: 'npm-suggest-workspace',
      packageManager: 'npm@11.0.0',
      workspaces: ['packages/*'],
    })
    writePackageJson(join(directory, 'packages/app'), {
      dependencies: {
        react: '19.2.0',
      },
      name: '@workspace/app',
    })

    const result = runDepsCli(['list', '--suggest'], directory)

    expect(result.status).toBe(0)
    expect(result.stdout).toContain(
      'npm projects do not support catalog: dependency specs; suggestions identify repeated direct versions only.',
    )
    expect(result.stderr.trim()).toBe('')
  } finally {
    rmSync(directory, { force: true, recursive: true })
  }
})
