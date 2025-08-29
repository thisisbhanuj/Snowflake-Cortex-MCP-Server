/* eslint-disable @typescript-eslint/no-unsafe-assignment */

/**
 * @module payloadBuilder
 * @description Utility functions to build Cortex Agent payloads dynamically and load tool definitions from JSON files.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Definition of a Cortex Agent tool.
 */
export interface ToolDefinition {
  /** The unique name of the tool, used in tool_resources and tool_spec */
  name: string;
  /** Optional configuration or resource parameters for the tool */
  resources?: Record<string, unknown>;
  /** The type of the tool (e.g., "cortex_analyst_text_to_sql") */
  type: string;
}

/**
 * Builds a payload object to send to a Cortex Agent, dynamically including
 * all tools and resources.
 *
 * @param toolDefinitions - Array of tools with their types and optional resources.
 * @param query - The user query to send to the agent.
 * @returns The fully constructed payload object suitable for MCP requests.
 */
export function buildAgentConfig(toolDefinitions: ToolDefinition[], query: string) {
  const toolResources: Record<string, unknown> = {};
  const tools: unknown[] = [];

  for (const tool of toolDefinitions) {
    if (tool.resources) toolResources[tool.name] = tool.resources;
    tools.push({ tool_spec: { name: tool.name, type: tool.type } });
  }

  return {
    defaultInstruction:
      "You will always maintain a friendly tone and provide concise response.",
    messages: [
      {
        content: [{ text: query, type: "text" }],
        role: "user",
      },
    ],
    model: process.env.MODEL,
    stream: true,
    tool_choice: { type: "auto" },
    tool_resources: toolResources,
    tools,
  };
}

/**
 * Loads tool definitions from a JSON file and substitutes environment variables
 * if any value is of the form "${ENV_VAR_NAME}".
 *
 * @throws Will throw an error if the toolDefinitions.json file does not exist.
 * @returns Array of ToolDefinition objects.
 */
export function loadToolDefinitions(): ToolDefinition[] {
  const configPath = path.join(__dirname, "../../toolDefinitions.json");

  if (!fs.existsSync(configPath)) {
    throw new Error(
      `toolDefinitions.json not found at ${configPath}. Please ensure the file exists.`
    );
  }

  const raw = fs.readFileSync(configPath, "utf-8");
  const parsed = JSON.parse(raw);
  return substituteEnv(parsed) as ToolDefinition[];
}

/**
 * Recursively substitutes strings in the format "${ENV_VAR}" with their
 * corresponding environment variable values.
 *
 * @param obj - Any object, array, or string to process.
 * @returns The object with environment variables substituted.
 */
function substituteEnv<T>(obj: T): T {
  if (typeof obj === "string") {
    const match = /^\$\{(.+)\}$/.exec(obj);
    if (match) return (process.env[match[1]] ?? "") as unknown as T;
    return obj;
  }

  if (Array.isArray(obj)) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return obj.map((item) => substituteEnv(item)) as unknown as T;
  }

  if (typeof obj === "object" && obj !== null) {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [k, substituteEnv(v)])
    ) as unknown as T;
  }

  return obj;
}
