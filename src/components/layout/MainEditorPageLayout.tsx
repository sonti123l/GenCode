import { FileNode } from "@/helpers/interfaces/file-types";
import FileSystemRepresentation from "../core/FileSystemRepresentation";
import Options from "../core/Options";

export default function MainEditorPagelayout({ tree }: { tree: FileNode }) {
  return (
    <div className="h-full flex">
      <div className="h-full">
        <Options />
      </div>
      <div className="flex">
        <div className="h-full border border-white w-80">
          <FileSystemRepresentation tree={tree} />
        </div>
        <div className="h-full border border-white w-200"></div>
        <div className="h-full border border-white w-92"></div>
      </div>
    </div>
  );
}
