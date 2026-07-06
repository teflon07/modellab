# Contributing to modellab

Thanks for your interest in modellab. This public repository is a **generated
mirror** of a private development repo, so please read "Project model" below
before opening a pull request, issues, security reports, and discussions are the
most useful ways to contribute right now.

## Project model

The modellab public repo is a **generated release mirror**: the source of truth
is a private development repo, and releases are published here. What that means
for you:

- **Pin to tagged releases, not to `main`.** The `main` branch is regenerated as
  the project evolves, so its commit history isn't a stable base for Git
  dependencies pre-1.0. **Tagged releases and published artifacts are stable**, 
  use them for pinning; don't depend on arbitrary `main` SHAs.
- **Security fixes** land on the latest release and `main` (see
  [SECURITY.md](SECURITY.md)).
- **Code contributions are possible**, routed through the maintainer: an accepted
  PR is applied upstream and lands in the next release with your authorship
  preserved (so it may close as "applied upstream" rather than merging directly).
  For anything non-trivial, open an issue first so we can confirm it fits.
- **Best contribution paths today:** issues (bugs and ideas), security reports,
  and design discussions.

## Contributor License Agreement (CLA)

If a code contribution of yours is accepted, you will need to have signed the
project [Contributor License Agreement](docs/CLA.md). It confirms you have the
right to submit your contribution and grants the project the rights it needs to
distribute it under the current MIT/Apache-2.0 terms, and, if the project later
adopts a different license for a commercial or hosted edition, under those terms
too. **You keep the copyright to your contributions.**

Signing is automated: when you open a pull request, the CLA bot posts a link and
asks you to reply with the sign-off sentence it provides. You sign once.

We use a CLA (rather than a DCO sign-off) deliberately, to keep the option of a
future commercial/hosted edition open. modellab will always remain available
under an OSI-approved open-source license.

## Development

```sh
bun install
bun test
bun build harness/src/cli.ts --target=bun --outfile /tmp/modellab-cli.js
```

CI enforces tests and a build check.

## Ground rules

- One logical change per PR. Add tests for new behavior.

## License

By contributing, you agree that your contributions will be dual-licensed under
the MIT and Apache-2.0 licenses, consistent with the project.
