import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMcpServer } from "../src/mcp/serverFactory.js";

describe("run_readonly_query", () => {
  let client: Client;
  let server: McpServer;

  beforeAll(async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: "guard-tests", version: "1.0.0" });
    server = createMcpServer();
    await Promise.all([
      client.connect(clientTransport),
      server.connect(serverTransport),
    ]);
  });

  afterAll(async () => {
    await client.close();
    await server.close();
  });

  async function run(sql: string) {
    return client.callTool({
      name: "run_readonly_query",
      arguments: { sql },
    });
  }

  it.each([
    ["comment-based SQL injection", "SELECT * FROM customers WHERE id = 1 OR 1=1 --"],
    ["DROP TABLE", "DROP TABLE customers"],
    ["UPDATE", "UPDATE products SET stock_qty = 0"],
    ["multiple statements", "SELECT * FROM customers; DELETE FROM customers"],
  ])("blocks %s", async (_case, sql) => {
    const response = await run(sql);
    expect(response.isError).toBe(true);
  });

  it("allows valid SELECT queries", async () => {
    const response = await run("SELECT 1 AS ok");
    expect(response.isError).not.toBe(true);
    expect(response.structuredContent).toEqual({ rows: [{ ok: 1 }] });
  });
});
