import Editor from "@monaco-editor/react";

export default function CodeEditorPage() {
  return (
    <>
      <Editor
        defaultLanguage={"javascript"}
        theme="vs-dark"
        className="bg-[#1f272eae]"
      />
    </>
  );
}
