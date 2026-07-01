# Contributing

Vector Channels is an open-source project. Contributions welcome.

## Getting started

1. Fork the repo and clone your fork.
2. Install pnpm 9+ and Node 22.20.0+. Use `.nvmrc` with `nvm use` to pin.
3. `pnpm install` at the repo root.
4. `pnpm dev` to run the standalone demo.
5. `pnpm test` to run the unit tests.
6. `pnpm typecheck` to verify types.

## Development workflow

- Branch from `main`.
- Keep PRs focused — one encoding change or one integration piece per PR.
- Match the existing code style (Prettier defaults, strict TypeScript).
- Every new rendering feature should come with at least one unit test for its pure-function logic and, when practical, a visual smoke test.
- MIT license header on new source files. See `packages/core/src/types.ts` for the header template.

## Design changes

Visualization design decisions are deliberated, not imposed. For any non-trivial encoding change (new rail behavior, new glyph, new state primitive):

1. Open an issue describing the problem the encoding solves and what existing encoding (if any) it replaces or competes with.
2. For significant changes, prototype in a sandbox branch first — a standalone React/Canvas component showing the encoding in isolation — before touching `core`.
3. Link relevant academic or operational references.

The design principles in `ROADMAP.md` are the tiebreakers when design discussions stall.

## Code of conduct

This project follows the [Contributor Covenant](https://www.contributor-covenant.org/) Code of Conduct. By participating, you are expected to uphold this code.

## License

By contributing, you agree that your contributions will be licensed under the MIT License. See `LICENSE`.

## Contact

- Primary: [repo issues](https://github.com/PaulMRamirez/vector-channels/issues)
