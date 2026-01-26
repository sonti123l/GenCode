// Graph nodes represent code entities
export const graphNodes = {
  functions: [],      // Function declarations
  variables: [],      // Variable declarations
  imports: [],        // Import statements
  calls: [],          // Function calls
  classes: [],        // Class declarations
  // ... other entity types
};

export const relationships = {
  CALLS: [],          // function A calls function B
  USES: [],           // function uses variable
  IMPORTS: [],        // file imports module
  DEFINES: [],        // function defines variable
  CONTAINS: [],       // parent contains child
  RETURNS: [],        // function returns value
  ASSIGNS: [],        // assigns to variable
  // ... other relationships
};

// @/lib/parser.ts

export interface ParsedFile {
  path: string;
  language: string;
  success: boolean;
  error: string | null;
  ast: ASTNode | null;
  metadata: ParseMetadata;
}

export interface ASTNode {
  node_type: string;
  text: string | null;
  start_line: number;
  start_col: number;
  end_line: number;
  end_col: number;
  start_byte: number;
  end_byte: number;
  is_named: boolean;
  children: ASTNode[];
}

export interface ParseMetadata {
  lines: number;
  bytes: number;
  node_count: number;
  tree_depth: number;
  has_syntax_errors: boolean;
}

export type GraphNode = {
  id: number;
  type: string;
  name?: string;
  path?: string;
  language?: string;
};

export type GraphEdge = {
  from: number;
  to: number | string;
  type: string;
  unresolved?: boolean;
};

export type CodeGraph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};
