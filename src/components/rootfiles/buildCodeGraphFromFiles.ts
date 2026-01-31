import { ASTNode, ParsedFile } from "@/helpers/constants/graphNodes";

export interface GraphNode {
  id: number;
  type: "file" | "function" | "class" | "variable" | "import";
  name?: string;
  path?: string;
  language?: string;
  lines?: number;
  bytes?: number;
  params?: string[];
  startLine?: number;
  endLine?: number;
  line?: number;
  source?: string;
  specifiers?: string[];
  file?: string;
}

export interface GraphEdge {
  from: number | string;
  to: number | string;
  type: "CONTAINS" | "IMPORTS_FROM" | "CALLS" | "USES" | "DEFINES" | "EXTENDS";
  edgeType:
    | "structural"
    | "dependency"
    | "control_flow"
    | "dataflow"
    | "inheritance";
  line?: number;
  module?: string;
  unresolved?: boolean;
}

export interface CodeGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  files: GraphNode[];
}

export function buildCodeGraphFromFiles(parsedFiles: ParsedFile[]): CodeGraph {
  const graph: CodeGraph = {
    nodes: [],
    edges: [],
    files: [],
  };

  let nodeIdCounter = 0;
  const nodeMap = new Map<string, number>();
  const fileMap = new Map<string, number>();

  // Process each file
  parsedFiles.forEach((fileData) => {
    if (!fileData.success || !fileData.ast) {
      console.warn(`Skipping ${fileData.path}: ${fileData.error}`);
      return;
    }

    const fileNodeId = nodeIdCounter++;
    const fileNode: GraphNode = {
      id: fileNodeId,
      type: "file",
      path: fileData.path,
      language: fileData.language,
      lines: fileData.metadata?.lines || 0,
      bytes: fileData.metadata?.bytes || 0,
    };

    graph.nodes.push(fileNode);
    graph.files.push(fileNode);
    fileMap.set(fileData.path, fileNodeId);

    processAST(fileData.ast, fileNodeId, fileData.path);
  });

  function processAST(ast: ASTNode, fileNodeId: number, filePath: string) {
    function traverse(node: ASTNode, scope: ASTNode[] = []) {
      if (!node || !node.children) return;

      node.children.forEach((child) => {
        const nodeId = nodeIdCounter++;

        switch (child.node_type) {
          case "import_statement":
            handleImport(child, nodeId, fileNodeId, filePath);
            break;

          case "function_declaration":
            handleFunction(child, nodeId, fileNodeId, filePath);
            break;

          case "class_declaration":
            handleClass(child, nodeId, fileNodeId, filePath);
            break;

          case "variable_declaration":
          case "lexical_declaration":
            handleVariable(child, nodeId, scope, filePath);
            break;
        }

        traverse(child, [...scope, child]);
      });
    }

    traverse(ast);
  }

  function handleImport(
    node: ASTNode,
    nodeId: number,
    fileNodeId: number,
    filePath: string,
  ) {
    const importInfo = extractImportInfo(node);

    if (importInfo?.source) {
      const importNode: GraphNode = {
        id: nodeId,
        type: "import",
        source: importInfo.source,
        specifiers: importInfo.specifiers,
        line: node.start_line,
        file: filePath,
      };

      graph.nodes.push(importNode);

      graph.edges.push({
        from: fileNodeId,
        to: nodeId,
        type: "CONTAINS",
        edgeType: "structural",
      });

      const resolvedPath = resolveImportPath(importInfo.source, filePath);
      const targetFileId = fileMap.get(resolvedPath);

      if (targetFileId !== undefined) {
        graph.edges.push({
          from: fileNodeId,
          to: targetFileId,
          type: "IMPORTS_FROM",
          edgeType: "dependency",
          module: importInfo.source,
        });
      }
    }
  }

  function handleFunction(
    node: ASTNode,
    nodeId: number,
    fileNodeId: number,
    filePath: string,
  ) {
    const funcInfo = extractFunctionInfo(node);

    if (funcInfo?.name) {
      const funcNode: GraphNode = {
        id: nodeId,
        type: "function",
        name: funcInfo.name,
        params: funcInfo.params,
        startLine: node.start_line,
        endLine: node.end_line,
        file: filePath,
      };

      graph.nodes.push(funcNode);
      nodeMap.set(`${filePath}:${funcInfo.name}`, nodeId);

      graph.edges.push({
        from: fileNodeId,
        to: nodeId,
        type: "CONTAINS",
        edgeType: "structural",
      });

      extractFunctionCalls(node, nodeId, filePath);
      extractVariableUsage(node, nodeId);
    }
  }

  function handleClass(
    node: ASTNode,
    nodeId: number,
    fileNodeId: number,
    filePath: string,
  ) {
    const classInfo = extractClassInfo(node);

    if (classInfo?.name) {
      const classNode: GraphNode = {
        id: nodeId,
        type: "class",
        name: classInfo.name,
        startLine: node.start_line,
        endLine: node.end_line,
        file: filePath,
      };

      graph.nodes.push(classNode);
      nodeMap.set(`${filePath}:${classInfo.name}`, nodeId);

      graph.edges.push({
        from: fileNodeId,
        to: nodeId,
        type: "CONTAINS",
        edgeType: "structural",
      });

      if (classInfo.extends) {
        graph.edges.push({
          from: nodeId,
          to: classInfo.extends,
          type: "EXTENDS",
          edgeType: "inheritance",
          unresolved: true,
        });
      }
    }
  }

  function handleVariable(
    node: ASTNode,
    nodeId: number,
    scope: ASTNode[],
    filePath: string,
  ) {
    const varInfo = extractVariableInfo(node);

    if (varInfo?.name) {
      const varNode: GraphNode = {
        id: nodeId,
        type: "variable",
        name: varInfo.name,
        line: node.start_line,
        file: filePath,
      };

      graph.nodes.push(varNode);

      const container = [...scope]
        .reverse()
        .find(
          (s) =>
            s.node_type === "function_declaration" ||
            s.node_type === "class_declaration",
        );

      if (container) {
        const containerInfo =
          container.node_type === "function_declaration"
            ? extractFunctionInfo(container)
            : extractClassInfo(container);

        if (containerInfo?.name) {
          const containerId = nodeMap.get(`${filePath}:${containerInfo.name}`);

          if (containerId !== undefined) {
            graph.edges.push({
              from: containerId,
              to: nodeId,
              type: "DEFINES",
              edgeType: "dataflow",
            });
          }
        }
      }
    }
  }

  function extractFunctionCalls(
    funcNode: ASTNode,
    funcNodeId: number,
    filePath: string,
  ) {
    function findCalls(node: ASTNode) {
      if (!node) return;

      if (node.node_type === "call_expression") {
        const calleeInfo = extractCalleeName(node);

        if (calleeInfo?.name) {
          const calleeId = nodeMap.get(`${filePath}:${calleeInfo.name}`);

          graph.edges.push({
            from: funcNodeId,
            to: calleeId ?? calleeInfo.name,
            type: "CALLS",
            edgeType: "control_flow",
            line: node.start_line,
            unresolved: calleeId === undefined,
          });
        }
      }

      if (node.children) {
        node.children.forEach(findCalls);
      }
    }

    findCalls(funcNode);
  }

  function extractVariableUsage(
    funcNode: ASTNode,
    funcNodeId: number,
  ) {
    function findIdentifiers(node: ASTNode, parent?: ASTNode) {
      if (!node) return;

      if (
        node.node_type === "identifier" &&
        parent?.node_type !== "function_declaration" &&
        parent?.node_type !== "variable_declaration" &&
        parent?.node_type !== "lexical_declaration"
      ) {
        const varName = node.text;
        if (varName) {
          const varId = findVariableInScope();

          if (varId !== undefined) {
            graph.edges.push({
              from: funcNodeId,
              to: varId,
              type: "USES",
              edgeType: "dataflow",
              line: node.start_line,
            });
          }
        }
      }

      if (node.children) {
        node.children.forEach((child) => findIdentifiers(child, node));
      }
    }

    findIdentifiers(funcNode);
  }

  // Helper extraction functions
  function extractImportInfo(
    node: ASTNode,
  ): { source: string | null; specifiers: string[] } | null {
    const children = node.children || [];
    const stringNode = children.find(
      (c) =>
        c.node_type === "string" ||
        c.node_type === "string_literal" ||
        c.node_type === "string_fragment",
    );

    let source = stringNode?.text?.replace(/['"]/g, "") || null;

    // If no direct string found, search deeper
    if (!source && stringNode?.children) {
      const fragment = stringNode.children.find(
        (c) => c.node_type === "string_fragment",
      );
      source = fragment?.text || null;
    }

    return { source, specifiers: [] };
  }

  function extractFunctionInfo(
    node: ASTNode,
  ): { name: string; params: string[] } | null {
    const children = node.children || [];
    const nameNode = children.find((c) => c.node_type === "identifier");
    const paramsNode = children.find(
      (c) =>
        c.node_type === "formal_parameters" || c.node_type === "parameters",
    );

    return {
      name: nameNode?.text || "anonymous",
      params: extractParams(paramsNode),
    };
  }

  function extractClassInfo(
    node: ASTNode,
  ): { name: string; extends: string | null } | null {
    const children = node.children || [];
    const nameNode = children.find((c) => c.node_type === "identifier");
    const extendsNode = children.find((c) => c.node_type === "class_heritage");

    return {
      name: nameNode?.text || "AnonymousClass",
      extends: extendsNode ? extractExtends(extendsNode) : null,
    };
  }

  function extractVariableInfo(node: ASTNode): { name: string } | null {
    const children = node.children || [];
    const declarator = children.find(
      (c) =>
        c.node_type === "variable_declarator" ||
        c.node_type === "lexical_declaration",
    );

    let nameNode = declarator?.children?.find(
      (c) => c.node_type === "identifier",
    );

    // If not found in declarator, try direct children
    if (!nameNode) {
      nameNode = children.find((c) => c.node_type === "identifier");
    }

    return nameNode?.text ? { name: nameNode.text } : null;
  }

  function extractCalleeName(callNode: ASTNode): { name: string } | null {
    const children = callNode.children || [];
    const calleeNode = children[0];

    if (!calleeNode) return null;

    if (calleeNode.node_type === "identifier") {
      return calleeNode.text ? { name: calleeNode.text } : null;
    } else if (calleeNode.node_type === "member_expression") {
      return { name: extractMemberExpression(calleeNode) };
    }

    return null;
  }

  function extractMemberExpression(node: ASTNode): string {
    return node.text || "member_call";
  }

  function extractParams(paramsNode?: ASTNode): string[] {
    if (!paramsNode?.children) return [];
    return paramsNode.children
      .filter((c) => c.node_type === "identifier")
      .map((c) => c.text || "")
      .filter(Boolean);
  }

  function extractExtends(heritageNode: ASTNode): string | null {
    const identifier = heritageNode.children?.find(
      (c) => c.node_type === "identifier",
    );
    return identifier?.text || null;
  }

  function resolveImportPath(
    importSource: string,
    currentFilePath: string,
  ): string {
    // Basic resolution - you might want to make this more sophisticated
    if (importSource.startsWith(".")) {
      const dir = currentFilePath.substring(
        0,
        currentFilePath.lastIndexOf("\\"),
      );
      return `${dir}\\${importSource}`.replace(/\//g, "\\");
    }
    return importSource;
  }

  function findVariableInScope(
  
  ): number | undefined {
    // Simplified - in real implementation, walk up scope chain
    return undefined;
  }

  return graph;
}

// Query helper functions
export function getFunctionsInFile(
  graph: CodeGraph,
  filePath: string,
): GraphNode[] {
  return graph.nodes.filter(
    (n) => n.type === "function" && n.file === filePath,
  );
}

export function getFunctionCalls(
  graph: CodeGraph,
  functionNodeId: number,
): GraphNode[] {
  return graph.edges
    .filter((e) => e.from === functionNodeId && e.type === "CALLS")
    .map((e) => graph.nodes.find((n) => n.id === e.to))
    .filter((n): n is GraphNode => n !== undefined);
}

export function getFileDependencies(
  graph: CodeGraph,
  filePath: string,
): GraphNode[] {
  const fileNode = graph.files.find((f) => f.path === filePath);
  if (!fileNode) return [];

  return graph.edges
    .filter((e) => e.from === fileNode.id && e.type === "IMPORTS_FROM")
    .map((e) => graph.nodes.find((n) => n.id === e.to))
    .filter((n): n is GraphNode => n !== undefined);
}
