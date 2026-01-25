import { useEditor } from "@/context/EditorContext";
import Editor from "@monaco-editor/react";

function getLanguageFromFileName(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase();

  const map: Record<string, string> = {
    js: "javascript",
    jsx: "javascript",
    ts: "typescript",
    tsx: "typescript",
    json: "json",
    html: "html",
    css: "css",
    scss: "scss",
    py: "python",
    rs: "rust",
    go: "go",
    java: "java",
    cpp: "cpp",
    c: "c",
    cs: "csharp",
    php: "php",
    rb: "ruby",
    swift: "swift",
    kt: "kotlin",
    md: "markdown",
    xml: "xml",
    yaml: "yaml",
    yml: "yaml",
    sh: "shell",
    sql: "sql",
    txt: "plaintext",
  };

  return map[ext || ""] || "plaintext";
}

export default function CodeEditorPage() {
  const { selectedFile, fileContent } = useEditor();

  if (!selectedFile) {
    return (
      <div className="h-full flex items-center justify-center bg-[#1e1e1e] text-[#858585]">
        <div className="text-center select-none">
          <p className="text-base">No file opened</p>
          <p className="text-sm mt-1">Open a file from the explorer</p>
        </div>
      </div>
    );
  }

  const language = getLanguageFromFileName(selectedFile);
  const fileName = selectedFile.split(/[\\/]/).pop();

  return (
    <div className="h-full flex flex-col bg-[#1e1e1e]">
      <div className="h-9 flex items-center bg-[#252526] px-3">
        <div className="text-sm text-[#cccccc]">{fileName}</div>
      </div>

      <Editor
        language={language}
        value={fileContent}
        theme="vs-dark"
        className="flex-1"
        options={{
          fontSize: 14,
          fontFamily: "Consolas, 'Courier New', monospace",
          lineNumbers: "on",
          minimap: { enabled: false },
          scrollbar: {
            verticalScrollbarSize: 10,
            horizontalScrollbarSize: 10,
          },
          cursorStyle: "line",
          cursorBlinking: "blink",
          scrollBeyondLastLine: false,
          smoothScrolling: false,
          padding: { top: 10, bottom: 10 },
          tabSize: 2,
          insertSpaces: true,
          automaticLayout: true,
          renderWhitespace: "none",
          wordWrap: "off",
        }}
      />
    </div>
  );
}
