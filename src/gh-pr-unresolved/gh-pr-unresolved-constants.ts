export const GH_PR_UNRESOLVED_MAX_PREVIEW_LENGTH = 120
export const GH_PR_UNRESOLVED_NO_PR_MESSAGE = 'No pull request found for current branch'
// biome-ignore lint/complexity/useRegexLiterals: The constructor avoids embedding control characters in a regex literal.
export const GH_PR_UNRESOLVED_ANSI_ESCAPE_SEQUENCES = new RegExp(
  String.raw`\u001b(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001b\\))`,
  'gu',
)
// biome-ignore lint/complexity/useRegexLiterals: The constructor avoids embedding control characters in a regex literal.
export const GH_PR_UNRESOLVED_CONTROL_CHARACTERS = new RegExp(String.raw`[\u0000-\u001f\u007f]`, 'gu')
export const GH_PR_UNRESOLVED_REVIEW_THREADS_QUERY = `  query($id: ID!, $after: String) {
    node(id: $id) {
      ... on PullRequest {
        reviewThreads(first: 100, after: $after) {
          nodes {
            isOutdated
            isResolved
            comments(first: 1) {
              nodes {
                author {
                  login
                }
                body
                outdated
                path
                url
              }
            }
          }
          pageInfo {
            endCursor
            hasNextPage
          }
        }
      }
    }
  }
`
