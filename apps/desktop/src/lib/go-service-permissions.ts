/**
 * Compatibility policy for Go service process DTOs.
 *
 * Historical/event DTOs may omit `allowedActions`; absence never grants a
 * privileged process operation.
 */
export function canRestartGoService(
  process: { allowedActions?: { restart?: boolean } | null } | null | undefined,
) {
  return process?.allowedActions?.restart === true;
}
