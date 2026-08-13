/**
 * Backward-compat re-export shim. The omp-probe code moved to
 * `lib/rocinante/rocinante-cli-core.js` (CJS) + `lib/rocinante/rocinante-cli.ts`
 * (TS facade) as part of the install packaging refactor (D2). All existing
 * `import { resolveOmpBin } from "@/lib/omp/omp-cli"` call sites keep
 * working through this re-export. We use a relative path (not the
 * `@/lib/...` alias) so test runners that load this file via jiti (no
 * tsconfig path mapping) still resolve the re-export.
 */
export {
  findOmpBin as resolveOmpBin,
  getOmpVersion,
  getOmpVersionSync,
  clearOmpCliCache as invalidateOmpCliCache,
  BIN_NAME,
  ENV_OVERRIDE,
} from "../rocinante/rocinante-cli";
