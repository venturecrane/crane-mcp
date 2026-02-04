# crane-mcp

MCP server for Venture Crane development workflow. Provides tools for session management, context validation, and handoffs.

## Installation

```bash
# Install globally
npm install -g @venturecrane/crane-mcp

# Register with Claude Code
claude mcp add crane -- crane-mcp
```

## Prerequisites

- Node.js 20+
- Infisical CLI (for secrets injection)
- Repos cloned to `~/dev/` (any naming convention works - matched by git remote)

## Usage

Start Claude with Infisical to inject the API key:

```bash
infisical run --path /vc -- claude
```

Then use crane tools:

| Tool | Purpose |
|------|---------|
| `crane_sod` | Start of day - validates context, guides to correct repo |
| `crane_ventures` | List available ventures and their local paths |
| `crane_context` | Get current venture, repo, branch info |
| `crane_handoff` | Create session handoff (EOD or passing work) |

## How It Works

1. **No hardcoded paths** - Scans `~/dev/` for git repos and matches by remote URL
2. **Org-based matching** - Matches git remote org (e.g., `venturecrane`) to venture
3. **API-driven** - Venture list comes from crane-context API, not local config
4. **Session caching** - Ventures cached in-memory for the session duration

## Tools

### crane_sod

Initialize session and validate you're in the right repo.

```
Parameters:
  venture?: string  - Optional venture code (vc, ke, dfg, sc, smd)

Returns:
  - If in valid repo: confirms context, starts API session
  - If not: lists ventures with local paths, guides navigation
```

### crane_ventures

List all ventures with installation status.

```
Parameters: none

Returns: List of ventures with org, local path, and installed status
```

### crane_context

Get current context without starting a session.

```
Parameters: none

Returns: Venture, repo, branch, directory info
```

### crane_handoff

Create a handoff when ending session.

```
Parameters:
  summary: string     - What was done, what's pending
  status: string      - "in_progress" | "blocked" | "done"
  issue_number?: number

Returns: Confirmation with handoff details
```

## Development

```bash
cd crane-mcp
npm install
npm run build
npm run dev  # watch mode
```

### Local Testing

```bash
# Link locally
npm link

# Add to Claude
claude mcp add crane -- crane-mcp

# Test (start Claude in a venture repo)
cd ~/dev/crane-console
infisical run --path /vc -- claude
# Then: "call crane_context"
```

## Architecture

```
┌─────────────────────────────────────────┐
│           Claude Code                   │
│                                         │
│   ┌─────────────────────────────────┐  │
│   │       crane-mcp (stdio)          │  │
│   │                                  │  │
│   │  ~/dev/ scanner → org matching   │  │
│   │            ↓                     │  │
│   │    crane-context API             │  │
│   └─────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

## Troubleshooting

**"CRANE_CONTEXT_KEY not found"**
- Start Claude with Infisical: `infisical run --path /vc -- claude`

**"Failed to connect to Crane API"**
- Check network connectivity
- Verify API is reachable: `curl https://crane-context.automation-ab6.workers.dev/ventures`

**Venture not detected**
- Ensure git remote points to a known org (venturecrane, kidexpenses, etc.)
- Check `crane_ventures` to see configured orgs
