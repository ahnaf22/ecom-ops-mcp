# ecom-ops-mcp

## 90-Second Live Demo

[Watch the demo on Loom](https://www.loom.com/share/24de580a36dd4842b996bed71364fb83)

Production MCP server for querying ecommerce customers, products, orders, inventory, and revenue through stdio or stateless HTTP.

## Architecture

```text
Client -> Bearer Auth / Rate Limit -> MCP Server -> SQL Guard -> SQLite DB
                                      |                         |
                                      +---- audited to stderr --+
```

Each HTTP request receives a fresh `McpServer` and transport. The stdio entrypoint uses one server for the lifetime of its local process.

## Quick Start

```bash
npm install
npm run seed
npm run build
```

Run locally with `npm run start:stdio`, or copy `.env.example` to `.env`, set `MCP_API_KEY`, and run `npm run start:http`.

## Claude Desktop (stdio)

Add this to Claude Desktop's MCP configuration, replacing the path if the repository is elsewhere:

```json
{
  "mcpServers": {
    "ecom-ops-mcp": {
      "command": "node",
      "args": ["D:\\Saas projects\\ecom-ops-mcp\\dist\\stdio.js"]
    }
  }
}
```

## Remote HTTP

Start with Docker Compose:

```bash
MCP_API_KEY=replace-with-a-long-random-secret docker compose up --build
```

Initialize an MCP connection:

```bash
curl -N http://localhost:3000/mcp \
  -H "Authorization: Bearer replace-with-a-long-random-secret" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"curl","version":"1.0.0"}}}'
```

## Production Security Features

- Fresh MCP server and transport per HTTP request prevents cross-client state leakage.
- Only single `SELECT` statements are accepted; mutations, comments, stacked statements, and results over 50 rows are blocked.
- HTTP requests require a constant-time-checked Bearer token and are limited to 60 requests/minute per IP.
- Tool audit events are structured JSON written only to stderr, keeping stdio JSON-RPC clean.
