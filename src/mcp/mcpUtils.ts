import { buildAgentConfig, loadToolDefinitions } from "#builder/payloadBuilder.js";
import { DeltaEvent, DeltaItem, SSEOutput, ToolResult } from "#mcp/MCPTypes.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import fetch from "node-fetch";
import { v4 as uuidv4 } from "uuid";

const REST_SQL_ENDPOINT = process.env.REST_SQL_ENDPOINT ?? "";
const AGENT_ENDPOINT = process.env.AGENT_ENDPOINT ?? "";

let mcpInstance: McpServer | null = null;

/**
 * Executes a SQL query via the REST SQL endpoint.
 * @param {string} sql - The SQL statement to execute. Semicolons are stripped before sending.
 * @param {string} pat - Programmatic access token for authentication.
 * @returns {Promise<any>} The JSON response from the SQL API or an error object.
 */
export async function executeSQL(sql: string, pat: string): Promise<unknown> {
  try {
    const requestId = uuidv4();
    const sqlApiUrl = `${REST_SQL_ENDPOINT}?requestId=${requestId}`;
    const sqlPayload = { statement: sql.replace(";", ""), timeout: 60 };
    const response = await fetch(sqlApiUrl, {
      body: JSON.stringify(sqlPayload),
      headers: getHeaders(pat),
      method: "POST",
    });

    if (response.ok) return await response.json();
    return { error: `SQL API error: ${await response.text()}` };
  } catch (err: unknown) {
    if (err instanceof Error) {
      return { error: `SQL execution error: ${err.message}` };
    }
    return { error: `SQL execution error: ${String(err)}` };
  }
}

/**
 * Builds HTTP headers for API requests.
 * @param {string} pat - Programmatic access token for authentication.
 * @returns {Headers} The configured headers object.
 */
export function getHeaders(pat: string) {
  const apiHeaders: Headers = new Headers({
    Authorization: `Bearer ${pat}`,
    "Content-Type": "application/json",
    "X-Snowflake-Authorization-Token-Type": "PROGRAMMATIC_ACCESS_TOKEN",
  });
  return apiHeaders;
}

/**
 * Retrieves a singleton instance of the MCP Server.
 * If not already initialized, creates a new MCP Server instance.
 * @returns {McpServer} The initialized MCP server instance.
 */
export function getMCPInstance() {
  if (!mcpInstance) {
    mcpInstance = new McpServer({
      capabilities: {
        resources: {},
        tools: {},
      },
      name: "Cortex Agent MCP Server",
      version: "1.0.0",
    });
    console.error("✅ MCP Server initialized");
  }
  return mcpInstance;
}

/**
 * Parses tool results from Cortex Agent responses and updates the state.
 * @param {any[]} results - Array of tool result objects.
 * @param {{citations: { doc_id: string; source_id: string }[], sql: string, text: string}} state - The state object to update with parsed values.
 */
export function parseToolResults(
  results: unknown[],
  state: { citations: { doc_id: string; source_id: string }[]; sql: string; text: string }
) {
  for (const r of results) {
    const result = r as ToolResult; // safe because we validate below
    if (result.type !== "json" || !result.json) continue;

    state.text += result.json.text ?? "";
    if (result.json.sql) state.sql = result.json.sql;

    if (result.json.searchResults) {
      state.citations.push(
        ...result.json.searchResults.map(s => ({
          doc_id: s.doc_id,
          source_id: s.source_id,
        })),
      );
    }
  }
}


/**
 * Processes delta content (chunks of partial results) from an SSE stream.
 * @param {any[]} content - The content array from the delta payload.
 * @param {{citations: { doc_id: string; source_id: string }[], sql: string, text: string}} state - The state object to update.
 */
export function processDeltaContent(
  content: unknown[],
  state: { citations: { doc_id: string; source_id: string }[]; sql: string; text: string }
) {
  for (const item of content as DeltaItem[]) {
    if (item.type === "text") {
      state.text += item.text ?? "";
    } else if (item.type === "tool_results") {
      parseToolResults(item.tool_results?.content ?? [], state);
    }
  }
}

/**
 * Processes a single line of SSE stream output.
 * @param {string} line - A line from the SSE response.
 * @param {{ citations: { doc_id: string; source_id: string }[], sql: string, text: string }} state - The state object to update.
 */
export function processLine(
  line: string, state: { citations: { doc_id: string; source_id: string }[]; sql: string; text: string }
) {
  if (line.startsWith("data:")) {
    processPayload(line.slice(5).trim(), state);
  }
}

/**
 * Parses a JSON payload from an SSE response and updates the state.
 * @param {string} payload - The JSON payload string.
 * @param { { citations: { doc_id: string; source_id: string }[], sql: string, text: string } } state - The state object to update.
 */
export function processPayload(
  payload: string,
  state: { citations: { doc_id: string; source_id: string }[]; sql: string; text: string }
) {
  if (!payload || payload === "[DONE]") return;

  try {
    const evt = JSON.parse(payload) as DeltaEvent;

    const delta = evt.delta ?? evt.data?.delta;
    if (delta?.content) {
      processDeltaContent(delta.content, state);
    }
  } catch {
    // ignore bad JSON
  }
}

/**
 * Processes an entire SSE (Server-Sent Events) response stream into structured output.
 * @param {Response} resp - The fetch API Response object containing an SSE stream.
 * @returns {Promise<SSEOutput>} A tuple containing [text, sql, citations].
 */
export async function processSSEResponse(resp: Response): Promise<SSEOutput> {
  const state = { citations: [] as { doc_id: string; source_id: string }[], sql: "", text: "" };
  const decoder = new TextDecoder("utf-8");
  // Treat body as a stream
  const stream = resp.body as unknown as NodeJS.ReadableStream;
  let textChunk;
  for await (const chunk of stream) {
    textChunk = decoder.decode(typeof chunk === "string" ? Buffer.from(chunk) : chunk, { stream: true });
    textChunk.split("\n").forEach((line) => {
      processLine(line, state);
    });
  }

  return [state.text, state.sql, state.citations];
}

/**
 * Runs a Cortex Agent query end-to-end: sends query, processes SSE responses, and executes SQL if generated.
 * @param {string} query - The natural language query to run.
 * @param {string} pat - Programmatic access token for authentication.
 * @returns {Promise<{ citations: { doc_id: string; source_id: string }[], results: any, sql: string, text: string }>} 
 * Object containing citations, SQL execution results (if any), generated SQL, and response text.
 */
export async function runCortexAgentQuery(query: string, pat: string) {
  const toolDefinitions = loadToolDefinitions();
  const payload = buildAgentConfig(toolDefinitions, query);
  const requestId = uuidv4();
  const agentApiUrl = `${AGENT_ENDPOINT}?requestId=${requestId}`;
  const resp = await fetch(agentApiUrl, {
    body: JSON.stringify(payload),
    headers: {
      ...Object.fromEntries(getHeaders(pat)),
      Accept: "text/event-stream",
    },
    method: "POST",
  });

  const [text, sql, citations] = await processSSEResponse(resp as unknown as Response);
  const results = sql ? await executeSQL(sql, pat) : null;

  return { citations, results, sql, text };
}
