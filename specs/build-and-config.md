# Build, Tooling, and Configuration

**Purpose:** how LyriX is built, type-checked, bundled, and secured at the window/CSP level.

**Owning source paths:** `package.json`, `electron.vite.config.ts`, `tsconfig.json`,
`tsconfig.node.json`, `tsconfig.web.json`, `src/renderer/index.html`, `src/main/window.ts`,
`forge.config.js`.

**Last verified:** 2026-11-06 against LyriX 0.1.0.

**Related:** [TechnicalSpecs.md](TechnicalSpecs.md), [architecture.md](architecture.md),
[main/lifecycle-and-ipc.md](main/lifecycle-and-ipc.md), [security-and-robustness.md](security-and-robustness.md).

## Scripts (`package.json`)

| Script | Purpose |
| --- | --- |
| `npm run dev` | electron-vite dev server + Electron. |
| `npm run build` | Production bundle into `out/`. |
| `npm start` | Preview the production bundle. |
| `npm run typecheck` | `typecheck:node` then `typecheck:web`. |
| `npm run typecheck:node` | `tsc` over main, preload, shared, config. |
| `npm run typecheck:web` | `tsc` over renderer, preload `.d.ts`, shared. |
| `npm test` | `vitest run`. |
| `npm run package` | Build, then `electron-forge package`. |
| `npm run make` | Build, then `electron-forge make`. |

UNVERIFIED/POSSIBLY STALE: the original §5 script table listed only the first seven rows.
`package.json` also defines `package` and `make`, and `forge.config.js` configures an asar package
with a Squirrel maker for Windows. The original §18 claim that there is “no packaging/distribution
configuration” is therefore stale; see [known-limitations.md](known-limitations.md).

## TypeScript projects

- `tsconfig.node.json` — ES2022, `moduleResolution: Bundler`, Node + electron-vite types; includes
  `src/main/**`, `src/preload/**`, `src/shared/**`, and the Vite config.
- `tsconfig.web.json` — ES2022 + DOM libs, Vite client types; includes `src/renderer/**/*.ts`,
  `src/preload/*.d.ts`, `src/shared/**`.
- `tsconfig.json` — solution file with project references.
- Strict mode, `isolatedModules`, `verbatimModuleSyntax`, and `skipLibCheck` are enabled.

The `typecheck:*` scripts pass `--composite false` and `--noEmit`; the project references remain the
source of truth for which files belong to which runtime.

## electron-vite

`electron.vite.config.ts` excludes `music-metadata` from dependency externalization so the ESM-only
package is bundled into the CJS main process.

## Renderer security settings

`BrowserWindow` uses `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`.
`index.html` sets a CSP allowing only self scripts, self/inline styles, `data:`/`media:` images, and
`self`/`media:` audio.

The concrete window options and CSP string are owned by [main/lifecycle-and-ipc.md](main/lifecycle-and-ipc.md)
and [security-and-robustness.md](security-and-robustness.md); this file only records the build-time
configuration contract.
