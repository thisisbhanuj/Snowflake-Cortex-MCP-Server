import { getMCPInstance, runCortexAgentQuery } from "#mcp/mcpUtils.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const SNOWFLAKE_ACCOUNT_URL = process.env.SNOWFLAKE_ACCOUNT_URL ?? null;
const SNOWFLAKE_PAT = process.env.SNOWFLAKE_PAT ?? '';

if (!SNOWFLAKE_PAT) throw new Error("Set SNOWFLAKE_PAT environment variable");
if (!SNOWFLAKE_ACCOUNT_URL) throw new Error("Set SNOWFLAKE_ACCOUNT_URL environment variable");

/**
 *  This provides a Model Context Protocol (MCP) server implementation for
    interacting with Snowflake's Cortex AI services. The server enables seamless
    integration with Snowflake's machine learning and AI capabilities through a
    standardized protocol interface.

    The package supports:
    - Cortex Search: Semantic search across Snowflake data
    - Cortex Analyst: Natural language to SQL query generation

    The server can be configured through command-line arguments or environment
    variables, uses Snowflake Programmatic Access Token &
    YAML configuration file to define service specifications.
 */
async function bootstrap() {
  const server = getMCPInstance();

  server.registerTool(
    "run_cortex_agents",
    {
      description: "Runs queries through ❄️ Cortex Agents",
      inputSchema: { query: z.string() },
      title: "Snowflake Cortex Agent Query Tool",
    },
    async ({ query }) => {
      if (!query) {
        throw new Error("Invalid request object");
      }
      const result = await runCortexAgentQuery(query, SNOWFLAKE_PAT);
      return { 
        content: [
          { 
            text: JSON.stringify(result, null, 2), 
            type: "text" 
          }
        ]
      };
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

bootstrap().catch((err: unknown) => {
  console.error("Fatal error -> ", err);
  process.exit(1);
});
