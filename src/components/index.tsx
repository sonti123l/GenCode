import { Code } from "lucide-react";
import { Button } from "./ui/button";
import { Buttons } from "@/helpers/constants/button-constant";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Dispatch, SetStateAction } from "react";
import { DirEntryInfo, FileNode } from "@/helpers/interfaces/file-types";
import { buildFileTree } from "./rootfiles/buildTree";

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
    setTree(tree);
  };
  return (
    <div className="h-screen flex flex-col justify-center items-center w-full gap-3">
      <div className="flex flex-col gap-1">
        <div className="flex gap-2 justify-start items-center h-25 w-80">
          <Code className="w-8 h-8" />
          <p className="text-2xl font-semibold">GEN CODE</p>
        </div>
        <div className="flex gap-3">
          {Buttons?.map(
            (eachBtn: { name: string; icon: any }, index: number) => (
              <div
                className="bg-[#1f272eae] w-80 h-25 rounded-md flex flex-col justify-center items-start"
                key={index}
                onClick={() => {
                  eachBtn.name === "Open project" && handleSelectFolder();
                }}
              >
                <eachBtn.icon className="w-6 h-6 ml-4 text-gray-400" />
                <Button className="w-full justify-start bg-transparent hover:bg-transparent text-lg text-gray-400">
                  {eachBtn.name}
                </Button>
              </div>
            ),
          )}
        </div>
      </div>
      <div className="flex justify-start h-25 w-160">
        <p>Recent projects</p>
      </div>
    </div>
  );
}
