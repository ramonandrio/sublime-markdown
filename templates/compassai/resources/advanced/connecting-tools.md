# Connecting Tools (MCPs)

CompassAI works out of the box with just files. But you can connect external tools — analytics, project management, research — so Claude can query them directly instead of relying on what you've manually saved in `context/`.

---

## How it works

CompassAI uses MCP (Model Context Protocol) servers to connect to external tools. Once connected, you can ask naturally:

- "What's the retention for users who signed up last month?" → Claude queries Amplitude
- "Show me open tickets for the checkout epic" → Claude queries Linear
- "What did users say about feature X?" → Claude queries Dovetail

If no MCP is connected, Claude falls back to whatever you've saved in `context/`. Everything still works — just with less real-time data.

---

## Connecting a tool

Run this from Claude Code:

```
/connect-mcps connect to [tool name]
```

Examples:

```
/connect-mcps connect to amplitude
/connect-mcps connect to linear
/connect-mcps connect to notion
/connect-mcps connect to dovetail
/connect-mcps connect to jira
```

Claude will guide you through authentication and test the connection.

---

## Supported tools

| Category | Tools |
|----------|-------|
| Analytics | Amplitude, Mixpanel, PostHog, Pendo |
| Project management | Linear, Jira |
| Documentation | Notion, Confluence |
| User research | Dovetail |
| Communication | Slack |
| Design | Figma |

---

## Priority order

If you're connecting multiple tools, start here:

1. **Analytics** (Amplitude, Mixpanel) — unlocks real-time metrics in `/feature-metrics`, `/impact-sizing`, `/retention-analysis`
2. **Project management** (Linear, Jira) — enables `/create-tickets` to push directly
3. **Research** (Dovetail) — connects user quotes to `/user-research-synthesis`
4. Others as needed

---

## Tips

- MCPs are optional. Never required. Skip them entirely if you prefer file-based context.
- You can add MCPs at any time — not just during setup.
- If a connection breaks, run `/connect-mcps connect to [tool]` again to re-authenticate.
- Run `/connect-mcps` with no arguments to see all available integrations and their status.
