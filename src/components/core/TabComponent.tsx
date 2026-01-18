// components/TabBar.tsx
import { X } from "lucide-react";
import { FileIcon } from "../rootfiles/files/FileIcon";

export default function TabBar() {
  const { tabs, activeTab, setActiveTab, closeTab } = useEditor();

  const handleCloseTab = (e: React.MouseEvent, path: string) => {
    e.stopPropagation();
    closeTab(path);
  };

  if (tabs.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center bg-[#252526] border-b border-gray-800 overflow-x-auto scrollbar-thin">
      {tabs.map((tab: any) => (
        <div    
          key={tab.path}
          onClick={() => setActiveTab(tab.path)}
          className={`
            flex items-center gap-2 px-3 py-2 border-r border-gray-800 cursor-pointer
            min-w-[120px] max-w-[200px] group relative
            ${activeTab === tab.path 
              ? 'bg-[#1e1e1e] text-white' 
              : 'bg-[#2d2d30] text-gray-400 hover:bg-[#2a2d2e]'
            }
          `}
        >
          {/* File Icon */}
          <FileIcon fileName={tab.name} isDirectory={false} />
          
          {/* File Name */}
          <span className="truncate text-sm flex-1">
            {tab.name}
          </span>

          {/* Dirty indicator (dot for unsaved changes) */}
          {tab.isDirty && (
            <div className="w-2 h-2 rounded-full bg-white" />
          )}

          {/* Close button */}
          <button
            onClick={(e) => handleCloseTab(e, tab.path)}
            className={`
              p-0.5 rounded hover:bg-gray-600 
              ${tab.isDirty ? 'opacity-0 group-hover:opacity-100' : ''}
            `}
          >
            <X className="h-3 w-3" />
          </button>

          {/* Active tab indicator */}
          {activeTab === tab.path && (
            <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-blue-500" />
          )}
        </div>
      ))}
    </div>
  );
}

function useEditor(): { tabs: any; activeTab: any; setActiveTab: any; closeTab: any; } {
    throw new Error("Function not implemented.");
}
