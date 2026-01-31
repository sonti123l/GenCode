import { FileNode } from "@/helpers/interfaces/file-types";
import FileSystemRepresentation from "../core/FileSystemRepresentation";
import CodeEditorPage from "../core/CodeEditorPage";
import ChatInterface from "../core/ChatInterface";
import TerminalWindow from "../core/TerminalWindow";
import { useState } from "react";
import { FolderOpen, FileSearch } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "../ui/tooltip";
import { useChatVisibility, useTerminalVisibility } from "../core/AppLayout";
import GraphIcon from "@/icons/graph-icon";
import CodeGraphViewer from "../core/CodeGraphViewer";

function IconSidebar({
  activeTab,
  setActiveTab,
}: {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}) {
  const menuItems = [
    { id: "files", icon: FolderOpen, label: "Explorer" },
    { id: "search", icon: FileSearch, label: "Search" },
    { id: "graph", icon: GraphIcon, label: "Graph" },
  ];

  return (
    <TooltipProvider>
      <div className="h-full w-12 bg-[#333333] flex flex-col items-center pt-2 gap-2">
        {menuItems.map((item) => (
          <Tooltip key={item.id}>
            <TooltipTrigger asChild>
              <button
                onClick={() => setActiveTab(item.id)}
                className={`p-2 rounded-md transition-colors ${activeTab === item.id
                    ? "bg-white/20 text-white"
                    : "text-gray-400 hover:bg-white/10 hover:text-gray-200"
                  }`}
              >
                <item.icon className="w-5 h-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{item.label}</TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  );
}

export default function MainEditorPageLayout({ tree }: { tree: FileNode }) {
  const { showChat, setShowChat } = useChatVisibility();
  const { showTerminal, toggleTerminal } = useTerminalVisibility();
  const [chatWidth, setChatWidth] = useState(400);
  const [isResizing, setIsResizing] = useState(false);
  const [activeTab, setActiveTab] = useState("files");

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isResizing) return;
    const newWidth = window.innerWidth - e.clientX;
    if (newWidth >= 300 && newWidth <= 800) {
      setChatWidth(newWidth);
    }
  };

  const handleMouseUp = () => {
    setIsResizing(false);
  };

  return (
    <div
      className="h-full flex flex-col w-full"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div className="flex-1 flex w-full min-h-0 relative">
        <IconSidebar activeTab={activeTab} setActiveTab={setActiveTab} />
        {activeTab === "files" ? (
          <>
            <div className="h-full w-60 bg-[#181818] flex-shrink-0 border-r border-[#3c3c3c]">
              <div className="h-8 flex items-center px-3 text-xs text-gray-400 uppercase tracking-wider border-b border-[#3c3c3c]">
                Explorer
              </div>
              <div className="h-[calc(100%-2rem)]">
                <FileSystemRepresentation tree={tree} />
              </div>
            </div>

            <div className="h-full flex-1 bg-[#1e1e1e] min-w-0">
              <CodeEditorPage />
            </div>

            {showChat && (
              <>
                <div
                  className={`w-1 bg-[#3c3c3c] hover:bg-purple-500 cursor-col-resize transition-colors flex-shrink-0 ${isResizing ? "bg-purple-500" : ""
                    }`}
                  onMouseDown={handleMouseDown}
                />

                <div
                  className="h-full bg-[#1e1e1e] flex-shrink-0 flex flex-col border-l border-[#3c3c3c] relative overflow-hidden"
                  style={{ width: chatWidth }}
                >
                  <ChatInterface />
                </div>
              </>
            )}
          </>
        ) : activeTab === "graph" ? (
          <div className="h-[calc(100vh-10px)] overflow-y-auto w-full">
            <CodeGraphViewer />
          </div>
        ) : (
          <div></div>
        )}

      </div>

      <div className="flex-shrink-0 w-full z-20">
        <TerminalWindow
          isVisible={showTerminal}
          onToggle={toggleTerminal}
          cwd={tree.path}
        />
      </div>
    </div>
  );
}
