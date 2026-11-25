import "dotenv/config";
import { timingSafeEqual } from "node:crypto";
import cors from "cors";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import rateLimit from "express-rate-limit";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer } from "./mcp/serverFactory.js";

const app = express();
const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "127.0.0.1";

function requiredEnvironmentVariable(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const apiKey = requiredEnvironmentVariable("MCP_API_KEY");

function authenticate(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const authorization = request.header("authorization");
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";
  const supplied = Buffer.from(token);
  const expected = Buffer.from(apiKey);

  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  ) {
    response.setHeader("WWW-Authenticate", "Bearer");
    response.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
}

app.disable("x-powered-by");
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(",") ?? false }));
app.use(express.json({ limit: "256kb" }));
app.use(rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: "draft-8" }));

app.get("/health", (_request, response) => {
  response.json({ status: "ok", uptime: process.uptime() });
});

app.post("/mcp", authenticate, async (request: Request, response: Response) => {
  const server = createMcpServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  try {
    await server.connect(transport);
    await transport.handleRequest(request, response, request.body);
  } catch {
    if (!response.headersSent) {
      response.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  } finally {
    await server.close();
  }
});

app.all("/mcp", (_request, response) => {
  response.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed" },
    id: null,
  });
});

const httpServer = app.listen(port, host);

let shuttingDown = false;
const shutdown = (): void => {
  if (shuttingDown) return;
  shuttingDown = true;
  httpServer.close((error) => process.exit(error ? 1 : 0));
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
