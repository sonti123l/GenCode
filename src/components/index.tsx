import { Buttons } from "@/helpers/constants/button-constant";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Dispatch, SetStateAction } from "react";
import { DirEntryInfo, FileNode } from "@/helpers/interfaces/file-types";
import { buildFileTree } from "./rootfiles/buildTree";
import { getAllFilePaths } from "./rootfiles/getAllFilePaths";
import { ParsedFile } from "@/lib/parser";

export default function FolderSelectorPage({
  setTree,
}: {
  setTree: Dispatch<SetStateAction<FileNode>>;
}) {
  const handleSelectFolder = async () => {
    const selectedPath = await open({
      fileAccessMode: "copy",
      directory: true,
      multiple: false,
    });

    if (!selectedPath) return;

    const entries = await invoke<DirEntryInfo[]>("read_directory", {
      path: selectedPath,
    });

    const tree = buildFileTree(entries, selectedPath);
    const filePaths = getAllFilePaths(tree);
    const files: any = await invoke("read_file_content", {
      paths: filePaths,
    });
    const parsedData = await invoke<ParsedFile[]>("parse_files", {
      files: files,
    });

    const stats = {
      total: parsedData.length,
      successful: 0,
      failed: 0,
      byLanguage: {} as Record<string, number>,
      totalLines: 0,
      totalNodes: 0,
    };

    for (const file of parsedData) {

      if (file.success) {
        stats.successful++;
        stats.totalLines += file.metadata.lines;
        stats.totalNodes += file.metadata.node_count;

        stats.byLanguage[file.language] =
          (stats.byLanguage[file.language] || 0) + 1;
      } else {
        stats.failed++;
      }
    }

    setTree(tree);
  };

  return (
    <div className="min-h-screen w-full bg-transparent flex items-center justify-center p-8">
      <div className="w-full max-w-2xl space-y-12">
        <div className="text-center space-y-2">
          <h1 className="text-5xl font-light text-white tracking-tight">
            GEN CODE
          </h1>
          <p className="text-sm text-gray-500">Start building something new</p>
        </div>

        <div className="flex gap-3 justify-center">
          {Buttons?.map((eachBtn, index) => (
            <button
              key={index}
              onClick={() => {
                eachBtn.name === "Open project" && handleSelectFolder();
              }}
              className="group flex items-center gap-3 px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-all duration-200"
            >
              <eachBtn.icon
                className="w-4 h-4 text-gray-400"
                strokeWidth={1.5}
              />
              <span className="text-sm text-gray-300">{eachBtn.name}</span>
            </button>
          ))}
        </div>

        <div className="space-y-3">
          <p className="text-xs text-gray-600 uppercase tracking-wider">
            Recent
          </p>
          <div className="text-sm text-gray-500">No recent projects</div>
        </div>
      </div>
    </div>
  );
}
