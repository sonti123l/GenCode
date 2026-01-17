import { useState } from "react";
import FolderSelectorPage from "./components";
import { FileNode } from "./helpers/interfaces/file-types";
import MainEditorPageLayout from "./components/layout/MainEditorPageLayout";

export default function App() {
  const [tree, setTree] = useState<FileNode>({
    name: "",
    path: "",
    isDir: false,
    children: [],
  });

  return (
    <div className="flex h-screen w-screen overflow-y-hidden bg-[#11151cf4] text-white">
      {tree.name ? (
        <MainEditorPageLayout tree={tree} />
      ) : (
        <FolderSelectorPage setTree={setTree} />
      )}
    </div>
  );
}
