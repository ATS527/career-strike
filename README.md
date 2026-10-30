# Career Strike

Local-first job-hunting platform. The local service and dashboard are the source of truth;
Codex, Claude Code and OpenCode are optional clients connected over MCP.

## Status

Pre-release. Feature status is tracked only in `acceptance/registry.json`; a criterion is PASS
only with recorded test evidence.

## Data location

Career data is stored outside this repository in the per-user application data directory
(macOS: `~/Library/Application Support/career-strike`, Linux: `$XDG_DATA_HOME/career-strike`,
Windows: `%APPDATA%\career-strike`), or `CAREER_STRIKE_HOME` if set. Career Strike refuses to
store data inside a git working tree.

## Commands

    career-strike init      # create the data directory and database
    career-strike serve     # run the local service on 127.0.0.1
    career-strike status    # report whether the service is running
    career-strike doctor    # diagnose the installation

## License

Apache-2.0. See `LICENSE`.

## Development

    npm install            # also enables the pre-commit hook (core.hooksPath=.githooks)
    npm run check          # typecheck + all tests
    npm run acceptance     # run criterion tests on a clean tree and record evidence

The pre-commit hook runs a privacy scan over staged content (secrets, non-example email
addresses, and personal terms listed in `<data dir>/privacy-denylist.txt`) and then `npm run check`.
