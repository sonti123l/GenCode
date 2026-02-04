import { useEditor } from "@/context/EditorContext";
import { DiffEditor } from "@monaco-editor/react";
import { getLanguageFromFileName } from "../rootfiles/getLanguageFromFileName";

export default function DiffCodeEditorPage() {
  const { selectedFile, fileContent, editorMode } = useEditor();

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
        <div className="text-sm text-[#cccccc]">{fileName} Working tree M</div>
      </div>

      {editorMode === "diff" && (
        <DiffEditor
          original={useEditor().diffOriginal}
          modified={fileContent}
          language={language}
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
            readOnly: true, // Typically diff view is read-only or focused on edit side, let's keep it safe for now
            renderSideBySide: true,
          }}
        />
      )}
    </div>
  );
}
