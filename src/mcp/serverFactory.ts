import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { db, STORE_SCHEMA_DDL } from "../db/database.js";
import { validateReadOnlySql } from "../db/guard.js";
import { writeAuditLog } from "../utils/logger.js";

const orderLookupSchema = z
  .object({
    order_id: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Numeric order ID to look up"),
    customer_email: z
      .string()
      .email()
      .optional()
      .describe("Customer email whose orders should be returned"),
  })
  .strict()
  .refine(
    (input) =>
      (input.order_id !== undefined) !== (input.customer_email !== undefined),
    { message: "Provide exactly one of order_id or customer_email" },
  );

const lowStockSchema = z.object({}).strict();

const revenueSchema = z
  .object({
    days: z
      .number()
      .int()
      .min(1)
      .max(365)
      .default(30)
      .describe("Number of trailing calendar days to summarize, from 1 to 365"),
  })
  .strict();

const readonlyQuerySchema = z
  .object({
    sql: z
      .string()
      .min(1)
      .describe("A single SQLite SELECT query; results are capped at 50 rows"),
  })
  .strict();

function result(data: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    structuredContent: data,
  };
}

async function audited(
  toolName: string,
  handler: () => CallToolResult | Promise<CallToolResult>,
): Promise<CallToolResult> {
  const startedAt = performance.now();
  try {
    const response = await handler();
    writeAuditLog(toolName, Math.round(performance.now() - startedAt), "success");
    return response;
  } catch (error) {
    writeAuditLog(toolName, Math.round(performance.now() - startedAt), "error");
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: error instanceof Error ? error.message : "Tool execution failed",
        },
      ],
    };
  }
}

export function createMcpServer(): McpServer {
  const server = new McpServer({ name: "ecom-ops-mcp", version: "1.0.0" });

  server.registerTool(
    "get_order_details",
    {
      description:
        "Look up orders, line items, payment status, and customer tier by order ID or customer email.",
      inputSchema: orderLookupSchema,
    },
    ({ order_id, customer_email }) =>
      audited("get_order_details", () => {
        const orders = db
          .prepare(
            `SELECT o.id AS order_id, o.status, o.total_cents, o.payment_status,
                    o.created_at, c.id AS customer_id, c.name AS customer_name,
                    c.email AS customer_email, c.tier AS customer_tier
             FROM orders o
             JOIN customers c ON c.id = o.customer_id
             WHERE (? IS NOT NULL AND o.id = ?)
                OR (? IS NOT NULL AND c.email = ?)
             ORDER BY o.created_at DESC
             LIMIT 50`,
          )
          .all(order_id ?? null, order_id ?? null, customer_email ?? null, customer_email ?? null) as Array<
          Record<string, unknown> & { order_id: number }
        >;

        const itemStatement = db.prepare(
          `SELECT oi.id, oi.product_id, p.sku, p.name, oi.quantity,
                  oi.unit_price_cents,
                  oi.quantity * oi.unit_price_cents AS line_total_cents
           FROM order_items oi
           JOIN products p ON p.id = oi.product_id
           WHERE oi.order_id = ?
           ORDER BY oi.id`,
        );

        return result({
          orders: orders.map((order) => ({
            ...order,
            items: itemStatement.all(order.order_id),
          })),
        });
      }),
  );

  server.registerTool(
    "get_low_stock_alerts",
    {
      description: "Return products at or below their reorder level, most urgent first.",
      inputSchema: lowStockSchema,
    },
    () =>
      audited("get_low_stock_alerts", () => {
        const products = db
          .prepare(
            `SELECT id, sku, name, stock_qty, reorder_level, price_cents,
                    reorder_level - stock_qty AS units_below_reorder
             FROM products
             WHERE stock_qty <= reorder_level
             ORDER BY units_below_reorder DESC, stock_qty ASC, id ASC`,
          )
          .all();
        return result({ products });
      }),
  );

  server.registerTool(
    "get_revenue_summary",
    {
      description:
        "Summarize captured revenue, order statuses, and failed webhooks over a trailing period.",
      inputSchema: revenueSchema,
    },
    ({ days }) =>
      audited("get_revenue_summary", () => {
        const since = `-${days} days`;
        const total = db
          .prepare(
            `SELECT COALESCE(SUM(total_cents), 0) AS total_revenue_cents
             FROM orders
             WHERE datetime(created_at) >= datetime('now', ?)
               AND status IN ('paid', 'shipped')
               AND payment_status = 'paid'`,
          )
          .get(since) as { total_revenue_cents: number };
        const ordersByStatus = db
          .prepare(
            `SELECT status, COUNT(*) AS order_count
             FROM orders
             WHERE datetime(created_at) >= datetime('now', ?)
             GROUP BY status
             ORDER BY status`,
          )
          .all(since) as Array<{ status: string; order_count: number }>;
        const failed = db
          .prepare(
            `SELECT COUNT(*) AS count
             FROM orders
             WHERE datetime(created_at) >= datetime('now', ?)
               AND status = 'failed_webhook'`,
          )
          .get(since) as { count: number };

        const statusCounts: Record<string, number> = {
          pending: 0,
          paid: 0,
          shipped: 0,
          failed_webhook: 0,
          refunded: 0,
        };
        for (const row of ordersByStatus) statusCounts[row.status] = row.order_count;

        return result({
          days,
          total_revenue_cents: total.total_revenue_cents,
          orders_by_status: statusCounts,
          failed_webhook_count: failed.count,
        });
      }),
  );

  server.registerTool(
    "run_readonly_query",
    {
      description: "Run a validated, read-only SELECT query against the store database.",
      inputSchema: readonlyQuerySchema,
    },
    ({ sql }) =>
      audited("run_readonly_query", () => {
        const rows = db.prepare(validateReadOnlySql(sql)).all();
        return result({ rows });
      }),
  );

  server.registerResource(
    "store-schema",
    "store://schema",
    {
      description: "Exact SQLite CREATE TABLE DDL for the ecommerce store",
      mimeType: "text/sql",
    },
    async () => ({
      contents: [{ uri: "store://schema", mimeType: "text/sql", text: STORE_SCHEMA_DDL }],
    }),
  );

  return server;
}
