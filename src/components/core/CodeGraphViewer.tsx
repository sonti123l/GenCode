import { useEffect, useState } from "react";
import {
  CodeGraph,
  getFileDependencies,
  getFunctionCalls,
  getFunctionsInFile,
  GraphNode,
} from "../rootfiles/buildCodeGraphFromFiles";

export default function CodeGraphViewer() {
  const [graph, setGraph] = useState<CodeGraph | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [selectedFile, setSelectedFile] = useState<string>("");
  const [selectedFunction, setSelectedFunction] = useState<GraphNode | null>(
    null,
  );

  useEffect(() => {
    // Load graph from localStorage (set by FolderSelectorPage)
    const savedGraph = localStorage.getItem("codeGraph");
    const savedStats = localStorage.getItem("parseStats");

    if (savedGraph) {
      setGraph(JSON.parse(savedGraph));
    }

    if (savedStats) {
      setStats(JSON.parse(savedStats));
    }
  }, []);

  if (!graph) {
    return (
      <div className="p-8 text-white">
        <p>No code graph available. Please open a project first.</p>
      </div>
    );
  }

  // Calculate statistics
  const nodesByType = graph.nodes.reduce(
    (acc, node) => {
      acc[node.type] = (acc[node.type] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const edgesByType = graph.edges.reduce(
    (acc, edge) => {
      acc[edge.type] = (acc[edge.type] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  // Get functions for selected file
  const functions = selectedFile ? getFunctionsInFile(graph, selectedFile) : [];

  // Get calls for selected function
  const functionCalls = selectedFunction
    ? getFunctionCalls(graph, selectedFunction.id)
    : [];

  // Get dependencies for selected file
  const dependencies = selectedFile
    ? getFileDependencies(graph, selectedFile)
    : [];

  return (
    <div className="min-h-screen w-full bg-gray-950 text-white p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-4xl font-bold mb-2">Code Graph Viewer</h1>
          <p className="text-gray-400">
            Explore your codebase structure and relationships
          </p>
        </div>

        {/* Statistics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard title="Total Files" value={graph.files.length} icon="📁" />
          <StatCard title="Total Nodes" value={graph.nodes.length} icon="🔵" />
          <StatCard title="Total Edges" value={graph.edges.length} icon="🔗" />
          <StatCard
            title="Functions"
            value={nodesByType["function"] || 0}
            icon="⚡"
          />
        </div>

        {/* Parse Stats */}
        {stats && (
          <div className="bg-gray-900 rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Parse Statistics</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-gray-400">Successful</p>
                <p className="text-2xl font-bold text-green-500">
                  {stats.successful}
                </p>
              </div>
              <div>
                <p className="text-gray-400">Failed</p>
                <p className="text-2xl font-bold text-red-500">
                  {stats.failed}
                </p>
              </div>
              <div>
                <p className="text-gray-400">Total Lines</p>
                <p className="text-2xl font-bold">
                  {stats.totalLines.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-gray-400">Total Nodes</p>
                <p className="text-2xl font-bold">
                  {stats.totalNodes.toLocaleString()}
                </p>
              </div>
            </div>

            <div className="mt-4">
              <p className="text-gray-400 mb-2">By Language</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(stats.byLanguage).map(([lang, count]) => (
                  <span
                    key={lang}
                    className="px-3 py-1 bg-blue-500/20 text-blue-300 rounded-full text-sm"
                  >
                    {lang}: {count as number}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Node Types */}
        <div className="bg-gray-900 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Node Types</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {Object.entries(nodesByType).map(([type, count]) => (
              <div key={type} className="bg-gray-800 p-4 rounded-lg">
                <p className="text-gray-400 text-sm">{type}</p>
                <p className="text-2xl font-bold">{count}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Edge Types */}
        <div className="bg-gray-900 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Relationship Types</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {Object.entries(edgesByType).map(([type, count]) => (
              <div key={type} className="bg-gray-800 p-4 rounded-lg">
                <p className="text-gray-400 text-sm">{type}</p>
                <p className="text-2xl font-bold">{count}</p>
              </div>
            ))}
          </div>
        </div>

        {/* File Explorer */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Files List */}
          <div className="bg-gray-900 rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Files</h2>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {graph.files.map((file) => (
                <button
                  key={file.id}
                  onClick={() => setSelectedFile(file.path || "")}
                  className={`w-full text-left p-3 rounded-lg transition-colors ${
                    selectedFile === file.path
                      ? "bg-blue-600"
                      : "bg-gray-800 hover:bg-gray-700"
                  }`}
                >
                  <p className="font-mono text-sm truncate">{file.path}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {file.language} • {file.lines} lines
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* File Details */}
          <div className="bg-gray-900 rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">File Details</h2>
            {selectedFile ? (
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-400">File Path</p>
                  <p className="font-mono text-sm">{selectedFile}</p>
                </div>

                {/* Dependencies */}
                {dependencies.length > 0 && (
                  <div>
                    <p className="text-sm text-gray-400 mb-2">
                      Dependencies ({dependencies.length})
                    </p>
                    <div className="space-y-1">
                      {dependencies.map((dep) => (
                        <div
                          key={dep.id}
                          className="text-sm bg-gray-800 p-2 rounded"
                        >
                          {dep.path}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Functions */}
                {functions.length > 0 && (
                  <div>
                    <p className="text-sm text-gray-400 mb-2">
                      Functions ({functions.length})
                    </p>
                    <div className="space-y-1">
                      {functions.map((func) => (
                        <button
                          key={func.id}
                          onClick={() => setSelectedFunction(func)}
                          className={`w-full text-left p-2 rounded text-sm transition-colors ${
                            selectedFunction?.id === func.id
                              ? "bg-green-600"
                              : "bg-gray-800 hover:bg-gray-700"
                          }`}
                        >
                          <span className="font-mono">{func.name}</span>
                          {func.params && func.params.length > 0 && (
                            <span className="text-gray-400">
                              ({func.params.join(", ")})
                            </span>
                          )}
                          <span className="text-xs text-gray-500 ml-2">
                            L{func.startLine}-{func.endLine}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Function Calls */}
                {selectedFunction && functionCalls.length > 0 && (
                  <div>
                    <p className="text-sm text-gray-400 mb-2">
                      Calls from {selectedFunction.name} ({functionCalls.length}
                      )
                    </p>
                    <div className="space-y-1">
                      {functionCalls.map((call, idx) => (
                        <div
                          key={idx}
                          className="text-sm bg-gray-800 p-2 rounded"
                        >
                          → {call.name}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-gray-500">Select a file to view details</p>
            )}
          </div>
        </div>

        {/* Export Options */}
        <div className="bg-gray-900 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Export</h2>
          <div className="flex gap-4">
            <button
              onClick={() => {
                const blob = new Blob([JSON.stringify(graph, null, 2)], {
                  type: "application/json",
                });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "code-graph.json";
                a.click();
              }}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              Export Graph JSON
            </button>

            <button
              onClick={() => {
                // Export as DOT format for Graphviz
                const dot = generateDotFormat(graph);
                const blob = new Blob([dot], { type: "text/plain" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "code-graph.dot";
                a.click();
              }}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
            >
              Export DOT Format
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper component for stats cards
function StatCard({
  title,
  value,
  icon,
}: {
  title: string;
  value: number;
  icon: string;
}) {
  return (
    <div className="bg-gray-900 rounded-lg p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-gray-400 text-sm">{title}</p>
          <p className="text-3xl font-bold mt-1">{value.toLocaleString()}</p>
        </div>
        <div className="text-4xl">{icon}</div>
      </div>
    </div>
  );
}

// Generate DOT format for Graphviz visualization
function generateDotFormat(graph: CodeGraph): string {
  let dot = "digraph CodeGraph {\n";
  dot += "  node [shape=box, style=rounded];\n\n";

  // Add nodes
  graph.nodes.forEach((node) => {
    const label = node.name || node.path || `Node ${node.id}`;
    const color =
      {
        file: "lightblue",
        function: "lightgreen",
        class: "lightyellow",
        variable: "lightpink",
        import: "lightgray",
      }[node.type] || "white";

    dot += `  n${node.id} [label="${label}", fillcolor="${color}", style="filled,rounded"];\n`;
  });

  dot += "\n";

  // Add edges
  graph.edges.forEach((edge) => {
    const style =
      {
        CALLS: "solid",
        IMPORTS_FROM: "dashed",
        CONTAINS: "dotted",
        USES: "solid",
        DEFINES: "solid",
        EXTENDS: "bold",
      }[edge.type] || "solid";

    const fromId = typeof edge.from === "number" ? edge.from : -1;
    const toId = typeof edge.to === "number" ? edge.to : -1;

    if (fromId >= 0 && toId >= 0) {
      dot += `  n${fromId} -> n${toId} [label="${edge.type}", style="${style}"];\n`;
    }
  });

  dot += "}\n";
  return dot;
}
