# Career Strike plugin

This package is a thin Codex wrapper around the standalone Career Strike application. It does not
contain a second database, scheduler, crawler, ranking engine or application workflow.

## Setup

1. Install Career Strike and initialise its local workspace.
2. Install this plugin by using your approved Codex plugin distribution flow.
3. Run `career-strike authorize-mcp codex` once in your terminal.
4. Start a new Codex thread and use the Career Strike tools.

Do not additionally run `career-strike connect codex`; the plugin already configures the same
MCP server. The credential is stored in the owner-only Career Strike data directory and is never
placed in this plugin or printed by the command.

The MCP server has public read/write access by default. Viewing profile-derived fit, applications
or a shortlist requires an explicit grant in **Career Strike → Settings → AI assistants**. The
candidate must approve any requested personal information in the dashboard, and applications can
never be approved or submitted by an agent.

For Claude Code and OpenCode, use `career-strike connect claude-code` or
`career-strike connect opencode`. For other MCP-compatible clients, use the generic route in the
main [installation guide](../../docs/install.md#any-compatible-mcp-client).
