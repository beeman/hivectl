import type { DependencyField, DependencyGroup } from '../deps-types.ts'

export const DEPS_DEPENDENCY_FIELDS: DependencyField[] = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
]
export const DEPS_DEPENDENCY_GROUPS: DependencyGroup[] = ['workspace', 'catalog', 'direct']
export const DEPS_PACKAGE_JSON = 'package.json'
export const DEPS_PNPM_WORKSPACE_YAML = 'pnpm-workspace.yaml'
