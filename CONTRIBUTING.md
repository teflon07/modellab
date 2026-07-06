# Contributing to modellab

Thanks for your interest in modellab. Issues, pull requests, security reports,
and design discussions are all welcome.

## How to contribute

- **Bugs and ideas:** open an issue. For anything non-trivial, open an issue
  first so we can agree on the approach before you build it.
- **Pull requests:** fork, create a branch, and open a PR against `main`.
  Accepted contributions are merged with your authorship preserved.
- **Security issues:** report them privately rather than as a public issue (see
  [SECURITY.md](SECURITY.md)).

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
