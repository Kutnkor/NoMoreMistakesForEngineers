# Contributing

Use Node.js 24 and pnpm 11.19.0. Run `pnpm install --frozen-lockfile`, then `pnpm dev`.

Before submitting a change, run `pnpm check`. Include the problem, the resulting behavior and relevant validation in the pull request. Keep numerical-model changes accompanied by an independent reference or a counterexample, and record seeds and evaluation budgets for research changes.

For hardware additions, identify the exact board/module revision, official pin documentation, voltage constraints and what was actually compiled or simulated. A catalog entry alone must not enable executable support. For images, retain source, author, transformation and reuse information.

Bug reports should include the workspace, browser, reproducible steps and a minimal exported circuit/specification where available. Do not include access tokens, serial logs containing personal data, or private datasets.

Generated reports should preserve failed runs and state whether evidence comes from synthetic data, a simulator, compiler or physical hardware. Optional browser and ngspice checks are described in `docs/RESEARCH.md`.

Lint covers application code, domain logic, hooks, scripts and tests. Generated build/scratch folders and the vendored `components/ui/` template layer are excluded from lint; TypeScript still checks the UI layer. Existing vector-diagram exceptions are documented inline.
