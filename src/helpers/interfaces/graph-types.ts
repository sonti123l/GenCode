export interface GraphContext {
  summary: string;
  cypherSchema: string;
  sampleQueries: string[];
  nodesByType: Record<string, number>;
  edgesByType: Record<string, number>;
}

export interface CodeGraph {
  nodes: Array<{
    id: string;
    type: string;
    name?: string;
    path?: string;
    language?: string;
    lines?: number;
    [key: string]: any;
  }>;
  edges: Array<{
    from: string;
    to: string;
    type: string;
    unresolved?: boolean;
    [key: string]: any;
  }>;
  files?: Array<{
    id: number;
    type: string;
    path: string;
    language: string;
    lines: number;
  }>;
}

export interface CypherQueryResult {
  success: boolean;
  data: any[];
  error?: string;
  summary: string;
}