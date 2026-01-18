import { FileNode } from "@/helpers/interfaces/file-types";
import FileSystemRepresentation from "../core/FileSystemRepresentation";
import Options from "../core/Options";
import CodeEditorPage from "../core/CodeEditorPage";

export default function MainEditorPagelayout({ tree }: { tree: FileNode }) {
  return (
    <div className="h-full flex w-full">
      <div className="h-full w-12 bg-[#333333]">
        <Options />
      </div>

      <div className="h-full flex flex-1">
        <div className="h-full w-65 bg-[#181818]">
          <FileSystemRepresentation tree={tree} />
        </div>

        <div className="h-full flex-1 bg-[#1e1e1e]">
          <CodeEditorPage />
        </div>
      </div>
    </div>
  );
}
