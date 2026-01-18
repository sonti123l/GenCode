import { FileNode } from "@/helpers/interfaces/file-types";
import FileSystemRepresentation from "../core/FileSystemRepresentation";
import Options from "../core/Options";
import CodeEditorPage from "../core/CodeEditorPage";

export default function MainEditorPagelayout({ tree }: { tree: FileNode }) {
  return (
    <div className="h-full flex">
      <div className="h-full">
        <Options />
      </div>
      <div className="flex">
        <div className="h-full w-80 overflow-y-auto">
          <FileSystemRepresentation tree={tree} />
        </div>
        <div className="h-full w-200">
          <CodeEditorPage />
        </div>
        <div className="h-full w-92"></div>
      </div>
    </div>
  );
}
