import { useEffect, useState } from "react";
import {
  CodeGraph,
  getFileDependencies,
  getFunctionCalls,
  getFunctionsInFile,
  GraphNode,
} from "../rootfiles/buildCodeGraphFromFiles";
import { Network, Download, FileCode, GitBranch, Activity } from "lucide-react";
import { openGraphInBrowser } from "../rootfiles/openGraphInBrowser";


export default function CodeGraphViewer() {
  const [graph, setGraph] = useState<CodeGraph | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [selectedFile, setSelectedFile] = useState<string>("");
  const [selectedFunction, setSelectedFunction] = useState<GraphNode | null>(null);

  useEffect(() => {
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
      <div className="flex items-center justify-center h-screen bg-gray-950">
        <div className="text-center space-y-4">
          <FileCode className="w-16 h-16 text-gray-600 mx-auto" />
          <div>
            <h2 className="text-xl font-semibold text-white mb-2">No Code Graph Available</h2>
            <p className="text-gray-400">Please open a project to analyze your codebase</p>
          </div>
        </div>
      </div>
    );
  }

  const nodesByType = graph.nodes.reduce((acc, node) => {
    acc[node.type] = (acc[node.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const edgesByType = graph.edges.reduce((acc, edge) => {
    acc[edge.type] = (acc[edge.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const functions = selectedFile ? getFunctionsInFile(graph, selectedFile) : [];
  const functionCalls = selectedFunction ? getFunctionCalls(graph, selectedFunction.id) : [];
  const dependencies = selectedFile ? getFileDependencies(graph, selectedFile) : [];

  return (
    <div className="h-screen w-full bg-gray-950 text-white flex flex-col overflow-hidden">
      {/* Top Navigation Bar */}
      <div className="flex items-center justify-between px-6 py-4 bg-gray-900/80 backdrop-blur-sm border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-linear-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              <Network className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Code Graph Viewer</h1>
              <p className="text-xs text-gray-400">Explore your codebase structure and relationships</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">

          <div className="w-px h-8 bg-gray-700 mx-2" />

          <button
            onClick={() => {
              const blob = new Blob([JSON.stringify(graph, null, 2)], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "code-graph.json";
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="flex items-center gap-2 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 rounded-lg transition-all duration-200 text-sm font-medium"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      {/* Content Area — always the statistics view now */}
      <div className="flex-1 overflow-hidden">
        <StatisticsView
          graph={graph}
          stats={stats}
          nodesByType={nodesByType}
          edgesByType={edgesByType}
          selectedFile={selectedFile}
          setSelectedFile={setSelectedFile}
          selectedFunction={selectedFunction}
          setSelectedFunction={setSelectedFunction}
          functions={functions}
          functionCalls={functionCalls}
          dependencies={dependencies}
        />
      </div>
    </div>
  );
}

// Statistics View Component
function StatisticsView({
  graph,
  stats,
  nodesByType,
  edgesByType,
  selectedFile,
  setSelectedFile,
  selectedFunction,
  setSelectedFunction,
  functions,
  functionCalls,
  dependencies
}: any) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            title="Total Files"
            value={graph.files.length}
            icon={<FileCode className="w-5 h-5" />}
            color="blue"
          />
          <MetricCard
            title="Total Nodes"
            value={graph.nodes.length}
            icon={<Activity className="w-5 h-5" />}
            color="purple"
          />
          <MetricCard
            title="Relationships"
            value={graph.edges.length}
            icon={<GitBranch className="w-5 h-5" />}
            color="green"
          />
          <MetricCard
            title="Functions"
            value={nodesByType["function"] || 0}
            icon={<Network className="w-5 h-5" />}
            color="orange"
          />
        </div>

        {/* Parse Statistics */}
        {stats && (
          <div className="bg-linear-to-br from-gray-900 to-gray-800 rounded-xl p-6 border border-gray-800 shadow-xl">
            <div className="flex items-center gap-2 mb-4">
              <Activity className="w-5 h-5 text-blue-400" />
              <h2 className="text-lg font-semibold">Parse Statistics</h2>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-gray-900/50 rounded-lg p-4">
                <p className="text-xs text-gray-400 mb-1">Successful</p>
                <p className="text-2xl font-bold text-green-400">{stats.successful}</p>
              </div>
              <div className="bg-gray-900/50 rounded-lg p-4">
                <p className="text-xs text-gray-400 mb-1">Failed</p>
                <p className="text-2xl font-bold text-red-400">{stats.failed}</p>
              </div>
              <div className="bg-gray-900/50 rounded-lg p-4">
                <p className="text-xs text-gray-400 mb-1">Total Lines</p>
                <p className="text-2xl font-bold text-blue-400">{stats.totalLines.toLocaleString()}</p>
              </div>
              <div className="bg-gray-900/50 rounded-lg p-4">
                <p className="text-xs text-gray-400 mb-1">Total Nodes</p>
                <p className="text-2xl font-bold text-purple-400">{stats.totalNodes.toLocaleString()}</p>
              </div>
            </div>

            <div>
              <p className="text-sm text-gray-400 mb-3">Languages Detected</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(stats.byLanguage).map(([lang, count]) => (
                  <div
                    key={lang}
                    className="px-3 py-1.5 bg-blue-500/10 border border-blue-500/20 text-blue-300 rounded-lg text-sm font-medium"
                  >
                    {lang} <span className="text-blue-400/60">·</span> {count as number}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Node & Edge Types */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Node Types */}
          <div className="bg-linear-to-br from-gray-900 to-gray-800 rounded-xl p-6 border border-gray-800 shadow-xl">
            <h2 className="text-lg font-semibold mb-4">Node Types</h2>
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(nodesByType).map(([type, count]) => (
                <div
                  key={type}
                  className="bg-gray-900/50 rounded-lg p-4 border border-gray-700/50 hover:border-gray-600 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-400 capitalize">{type}</p>
                    <p className="text-lg font-bold text-white">{count as number}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Edge Types */}
          <div className="bg-linear-to-br from-gray-900 to-gray-800 rounded-xl p-6 border border-gray-800 shadow-xl">
            <h2 className="text-lg font-semibold mb-4">Relationship Types</h2>
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(edgesByType).map(([type, count]) => (
                <div
                  key={type}
                  className="bg-gray-900/50 rounded-lg p-4 border border-gray-700/50 hover:border-gray-600 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-400">{type}</p>
                    <p className="text-lg font-bold text-white">{count as number}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* File Explorer & Details */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Files List */}
          <div className="bg-linear-to-br from-gray-900 to-gray-800 rounded-xl border border-gray-800 shadow-xl overflow-hidden">
            <div className="p-6 border-b border-gray-700">
              <h2 className="text-lg font-semibold">Project Files</h2>
              <p className="text-xs text-gray-400 mt-1">{graph.files.length} files total</p>
            </div>
            <div className="p-4 space-y-2 max-h-125 overflow-y-auto custom-scrollbar">
              {graph.files.map((file: any) => (
                <button
                  key={file.id}
                  onClick={() => setSelectedFile(file.path || "")}
                  className={`w-full text-left p-3 rounded-lg transition-all duration-200 ${selectedFile === file.path
                    ? "bg-blue-600 shadow-lg shadow-blue-600/20"
                    : "bg-gray-800/50 hover:bg-gray-700/50 border border-gray-700/50"
                    }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <FileCode className="w-4 h-4 shrink-0" />
                    <p className="font-mono text-sm truncate flex-1">{file.path}</p>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-400 ml-6">
                    <span className="px-2 py-0.5 bg-gray-900/50 rounded">{file.language}</span>
                    <span>{file.lines} lines</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* File Details */}
          <div className="bg-linear-to-br from-gray-900 to-gray-800 rounded-xl border border-gray-800 shadow-xl overflow-hidden">
            <div className="p-6 border-b border-gray-700">
              <h2 className="text-lg font-semibold">File Details</h2>
              <p className="text-xs text-gray-400 mt-1">
                {selectedFile ? "Viewing file information" : "Select a file to view details"}
              </p>
            </div>
            <div className="p-4 space-y-4 max-h-125 overflow-y-auto custom-scrollbar">
              {selectedFile ? (
                <>
                  {/* File Path */}
                  <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-700/50">
                    <p className="text-xs text-gray-400 mb-1">File Path</p>
                    <p className="font-mono text-sm text-blue-400 break-all">{selectedFile}</p>
                  </div>

                  {/* Dependencies */}
                  {dependencies.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-medium text-gray-300">Dependencies</p>
                        <span className="px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded text-xs">
                          {dependencies.length}
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        {dependencies.map((dep: any) => (
                          <div
                            key={dep.id}
                            className="text-sm bg-gray-800/50 border border-gray-700/50 p-2.5 rounded-lg font-mono text-gray-300 hover:bg-gray-700/50 transition-colors"
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
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-medium text-gray-300">Functions</p>
                        <span className="px-2 py-0.5 bg-green-500/20 text-green-300 rounded text-xs">
                          {functions.length}
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        {functions.map((func: any) => (
                          <button
                            key={func.id}
                            onClick={() => setSelectedFunction(func)}
                            className={`w-full text-left p-2.5 rounded-lg text-sm transition-all duration-200 ${selectedFunction?.id === func.id
                              ? "bg-green-600 shadow-lg shadow-green-600/20"
                              : "bg-gray-800/50 border border-gray-700/50 hover:bg-gray-700/50"
                              }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-mono font-medium">{func.name}</span>
                              <span className="text-xs text-gray-400">L{func.startLine}-{func.endLine}</span>
                            </div>
                            {func.params && func.params.length > 0 && (
                              <div className="text-xs text-gray-400 mt-1 font-mono">
                                ({func.params.join(", ")})
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Function Calls */}
                  {selectedFunction && functionCalls.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-medium text-gray-300">
                          Calls from {selectedFunction.name}
                        </p>
                        <span className="px-2 py-0.5 bg-purple-500/20 text-purple-300 rounded text-xs">
                          {functionCalls.length}
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        {functionCalls.map((call: any, idx: number) => (
                          <div
                            key={idx}
                            className="text-sm bg-gray-800/50 border border-gray-700/50 p-2.5 rounded-lg flex items-center gap-2"
                          >
                            <span className="text-purple-400">→</span>
                            <span className="font-mono">{call.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex items-center justify-center h-full min-h-75">
                  <div className="text-center space-y-2">
                    <FileCode className="w-12 h-12 text-gray-700 mx-auto" />
                    <p className="text-gray-500 text-sm">Select a file to view details</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Export Options */}
        <div className="bg-linear-to-br from-gray-900 to-gray-800 rounded-xl p-6 border border-gray-800 shadow-xl">
          <h2 className="text-lg font-semibold mb-4">Export Options</h2>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => {
                const blob = new Blob([JSON.stringify(graph, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "code-graph.json";
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 rounded-lg transition-all duration-200 shadow-lg shadow-blue-600/20 text-sm font-medium"
            >
              <Download className="w-4 h-4" />
              Export Graph JSON
            </button>

            <button
              onClick={() => {
                const dot = generateDotFormat(graph);
                const blob = new Blob([dot], { type: "text/plain" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "code-graph.dot";
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="flex items-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 rounded-lg transition-all duration-200 shadow-lg shadow-green-600/20 text-sm font-medium"
            >
              <Download className="w-4 h-4" />
              Export DOT Format
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Metric Card Component
function MetricCard({
  title,
  value,
  icon,
  color
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
  color: 'blue' | 'purple' | 'green' | 'orange';
}) {
  const colorClasses = {
    blue: 'from-blue-500/10 to-blue-600/10 border-blue-500/20 text-blue-400',
    purple: 'from-purple-500/10 to-purple-600/10 border-purple-500/20 text-purple-400',
    green: 'from-green-500/10 to-green-600/10 border-green-500/20 text-green-400',
    orange: 'from-orange-500/10 to-orange-600/10 border-orange-500/20 text-orange-400'
  };

  const textColors = {
    blue: 'text-blue-400',
    purple: 'text-purple-400',
    green: 'text-green-400',
    orange: 'text-orange-400'
  };

  return (
    <div className={`bg-linear-to-br ${colorClasses[color]} rounded-xl p-6 border shadow-xl`}>
      <div className="flex items-center justify-between mb-3">
        <div className={`${textColors[color]}`}>{icon}</div>
        <p className="text-3xl font-bold text-white">{value.toLocaleString()}</p>
      </div>
      <p className="text-sm text-gray-400 font-medium">{title}</p>
    </div>
  );
}

function generateDotFormat(graph: CodeGraph): string {
  let dot = "digraph CodeGraph {\n";
  dot += "  node [shape=box, style=rounded];\n\n";

  graph.nodes.forEach((node) => {
    const label = node.name || node.path || `Node ${node.id}`;
    const color = {
      file: "lightblue",
      function: "lightgreen",
      class: "lightyellow",
      variable: "lightpink",
      import: "lightgray",
    }[node.type] || "white";

    dot += `  n${node.id} [label="${label}", fillcolor="${color}", style="filled,rounded"];\n`;
  });

  dot += "\n";

  graph.edges.forEach((edge) => {
    const style = {
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