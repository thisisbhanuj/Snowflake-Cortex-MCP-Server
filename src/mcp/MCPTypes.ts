export interface DeltaEvent {
  data?: { delta?: { content?: unknown[] } };
  delta?: { content?: unknown[] };
}

export type DeltaItem = TextItem | ToolResultsItem;

export type SSEOutput = [string, string, unknown[]];

export interface TextItem {
  text?: string;
  type: "text";
}

export interface ToolResult {
  json?: {
    searchResults?: { doc_id: string; source_id: string }[];
    sql?: string;
    text?: string;
  };
  type: string;
}

export interface ToolResultsItem {
  tool_results?: { content?: unknown[] };
  type?: "tool_results";
}