# Build, Tooling, and Configuration

**Purpose:** how LyriX is formatted, built, type-checked, bundled, and secured at the window/CSP
level.

**Owning source paths:** `package.json`, `.prettierrc.json`, `.prettierignore`,
`eslint.config.mjs`, `.github/workflows/ci.yml`, `electron.vite.config.ts`, `tsconfig.json`,
`tsconfig.node.json`, `tsconfig.web.json`, `src/renderer/index.html`, `src/main/window.ts`,
`forge.config.js`.

**Last verified:** 2026-11-10 against LyriX 0.1.0.

**Related:** [TechnicalSpecs.md](TechnicalSpecs.md), [architecture.md](architecture.md),
[main/lifecycle-and-ipc.md](main/lifecycle-and-ipc.md), [security-and-robustness.md](security-and-robustness.md).

## Scripts (`package.json`)

| Script | Purpose |
| --- | --- |
| `npm run dev` | electron-vite dev server + Electron. |
| `npm run build` | Production bundle into `build/`. |
| `npm start` | Preview the production bundle. |
| `npm run format` | Prettier over code and configuration files. |
| `npm run format:check` | Fail when code or configuration is not Prettier-formatted. |
| `npm run lint` | ESLint over TypeScript, JavaScript, and the E2E harness. |
| `npm run lint:fix` | ESLint with automatic fixes. |
| `npm run typecheck` | `typecheck:node` then `typecheck:web`. |
| `npm run typecheck:node` | `tsc` over main, preload, shared, config. |
| `npm run typecheck:web` | `tsc` over renderer, preload `.d.ts`, shared. |
| `npm test` | `vitest run`. |
| `npm run test:e2e` | Build, then the required Tier 1 CDP smoke suite. |
| `npm run test:e2e:full` | Build, then the opt-in Tier 2 CDP regression suite. |
| `npm run test:e2e:visual` | Build, then the optional Tier 3 CDP visual suite. |
| `npm run fixtures:e2e` | Regenerate the committed E2E fixtures with ffmpeg. |
| `npm run package` | Build, then `electron-forge package`. |
| `npm run make` | Build, then `electron-forge make`. |

UNVERIFIED/POSSIBLY STALE: the original §5 script table listed only the first seven scripts above.
`package.json` also defines `package` and `make`, and `forge.config.js` configures an asar package
with a Squirrel maker for Windows. The original §18 claim that there is “no packaging/distribution
configuration” is therefore stale; see [known-limitations.md](known-limitations.md).

## Linting

`eslint.config.mjs` uses the flat config format with `@eslint/js`,
`typescript-eslint`, and `globals`. `npm run lint` lints the repository and fails on errors or
warnings; generated output (`build/`, `out/`, `.vite/`, `graphify-out/`) and binary E2E fixtures
are ignored.

- `src/**/*.ts` and `electron.vite.config.ts` run the typescript-eslint
  `recommendedTypeChecked` rules using the `tsconfig.node.json` and `tsconfig.web.json`
  projects. Node globals apply to main, preload, and shared; browser globals apply to the
  renderer.
- `tests/**/*.ts` use the non-type-checked `recommended` rules because the unit tests are not
  part of either runtime project.
- JavaScript files (`forge.config.js`, the E2E harness) use `@eslint/js` recommended rules with
  Node globals.

Two rules are tuned rather than followed blindly. `@typescript-eslint/unbound-method` is off
because the codebase passes callback properties between modules and the rule cannot distinguish
them from unbound class methods. `prefer-const` is off in the `src/renderer/src/main.ts`
composition root, which declares late-bound service singletons before assigning them in
dependency order. `eslint-config-prettier` is appended last so ESLint correctness rules never
fight the formatter.

## Formatting

`prettier --check .` (also `npm run format:check`) enforces layout. Prettier owns quotes,
semicolons, wrapping, and indentation; ESLint owns correctness. `.prettierrc.json` matches the
existing style: no semicolons, single quotes, 100-column lines, no trailing commas, and
`endOfLine: "auto"` so the repository works with Git's Windows line-ending conversion.

`.prettierignore` scopes formatting to code and configuration. It excludes Markdown (`*.md`),
generated output (`build/`, `out/`, `.vite/`, `graphify-out/`), dependencies, agent tooling
(`.opencode/`), the lockfile, and binary E2E fixtures. `specs/`, `README.md`, and `AGENTS.md` stay
hand-formatted.

## Continuous integration

`.github/workflows/ci.yml` runs on pushes to `main` and `dev`, on pull requests, and on manual
dispatch. The `checks` job uses `windows-latest` with Node 22 and runs, in order: `npm ci`,
`npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`.
Superseded runs on the same ref are cancelled.

The E2E tiers and packaging are intentionally excluded. The E2E suites need a graphical desktop
session, launch Electron, and play audio, so they remain local until they are proven on a hosted
runner. Packaging and installer generation are separate from the verification workflow.

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
