export const GH_PIN_ACTIONS_DEFAULT_API_URL = 'https://api.github.com'
export const GH_PIN_ACTIONS_DEFAULT_MAX_TAG_PAGES = 25
export const GH_PIN_ACTIONS_NO_YAML_FILES_EXIT_CODE = 2
export const GH_PIN_ACTIONS_SHA_RE = /^[0-9a-f]{40}$/iu
export const GH_PIN_ACTIONS_SEMVER_RE =
  /^v?(?<major>0|[1-9]\d*)\.(?<minor>0|[1-9]\d*)\.(?<patch>0|[1-9]\d*)(?<prerelease>-[0-9A-Za-z.-]+)?(?<build>\+[0-9A-Za-z.-]+)?$/u
export const GH_PIN_ACTIONS_USES_RE = /^(\s*(?:-\s*)?uses\s*:\s*)(['"]?)([^'"\s#]+)\2([ \t]*(?:#.*)?)(\r?\n?)$/u
