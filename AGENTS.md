## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- When graphify-out/graph.json exists, run `graphify query "<question>"` before your first grep, search or source-file read for a codebase question, and put this rule in every subagent prompt that explores code. Read raw files only for lines the graph or an earlier read already located. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- A committed graphify-out/graph.json is rewritten whole on every build, so a large diff to it in a pull request is expected. Do not flag it as churn or suggest skipping the graph rebuild or its hooks.

# Agent workflow (mandatory)

## Before starting
1. Read specs/TechnicalSpecs.md (the index) and the invariants in it.
2. Load only the spec files the index routes you to for this task.
3. Use graphify for structural questions (what imports what, where something
   lives). Do not guess from filenames.

## While working
- Respect the invariants in the index. If a change would violate one, stop and
  ask instead of working around it.
- Keep modules small and single-purpose. Do not grow existing files into
  monoliths; add a new module instead.
- Pure logic stays DOM-free and gets unit tests.

## Definition of done (all required, in this order)
1. npm run format:check passes. Run `npm run format` after code edits.
2. npm run lint passes.
3. npm run typecheck passes (both projects).
4. npm test passes. New or changed behavior has tests.
5. npm run build passes.
6. npm run test:e2e passes. This is the required Tier 1 CDP smoke suite and
   covers the main user path end to end. Add or update a smoke assertion for
   user-visible behavior you change. For risky refactors or broad regression
   coverage, also run `npm run test:e2e:full`. After CSS/UI changes, also run
   `npm run test:e2e:visual`.
7. npm run dev starts with no console errors, and you manually smoke-test the
   area you changed.
8. Update the ONE spec file that owns the changed behavior, in the same
   change. If you added, moved or removed a module, update the index routing
   table too. Do not touch volatile numbers (test counts etc.) anywhere except
   specs/testing-and-verification.md.
9. Re-run graphify so the graph reflects the change.

## Handing work back
Report: what changed, which spec files you updated, the results of each
check above, anything you could not verify, and any spec/code mismatch you
noticed. Never claim a check passed without having run it.