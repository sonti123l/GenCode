import { getCurrentWindow } from "@tauri-apps/api/window";
import { useMemo, useState, createContext, useContext } from "react";
import { Bot, Terminal } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "../ui/tooltip";

// Create context for chat visibility
interface ChatContextType {
  showChat: boolean;
  setShowChat: (show: boolean) => void;
  toggleChat: () => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export function useChatVisibility() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChatVisibility must be used within AppLayout");
  }
  return context;
}

// Create context for terminal visibility
interface TerminalContextType {
  showTerminal: boolean;
  setShowTerminal: (show: boolean) => void;
  toggleTerminal: () => void;
}

const TerminalContext = createContext<TerminalContextType | undefined>(undefined);

export function useTerminalVisibility() {
  const context = useContext(TerminalContext);
  if (!context) {
    throw new Error("useTerminalVisibility must be used within AppLayout");
  }
  return context;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const win = useMemo(() => getCurrentWindow(), []);
  const [showChat, setShowChat] = useState(true);
  const [showTerminal, setShowTerminal] = useState(false);

  const toggleChat = () => setShowChat((prev) => !prev);
  const toggleTerminal = () => setShowTerminal((prev) => !prev);

  const chatContextValue: ChatContextType = {
    showChat,
    setShowChat,
    toggleChat,
  };

  const terminalContextValue: TerminalContextType = {
    showTerminal,
    setShowTerminal,
    toggleTerminal,
  };

  return (
    <ChatContext.Provider value={chatContextValue}>
      <TerminalContext.Provider value={terminalContextValue}>
        <TooltipProvider>
          <div className="h-screen flex flex-col bg-[#1e1e1e]">
            {/* Header */}
            <div className="flex h-8 bg-[#1f1f1f] text-gray-300 select-none">
              {/* App Title - Draggable */}
              <div
                data-tauri-drag-region
                className="flex items-center px-3 text-sm flex-1"
              >
                GEN CODE
              </div>

              {/* Terminal Toggle Button */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={toggleTerminal}
                    className={`w-10 h-8 flex items-center justify-center transition-colors ${
                      showTerminal
                        ? "bg-green-600/30 text-green-400 hover:bg-green-600/40"
                        : "hover:bg-[#3a3a3a] text-gray-400 hover:text-gray-200"
                    }`}
                  >
                    <Terminal className="w-4 h-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="bg-[#2d2d2d] border-[#3c3c3c] text-white">
                  <p className="text-xs">
                    {showTerminal ? "Hide Terminal" : "Open Terminal"}
                  </p>
                  <p className="text-[10px] text-gray-400">Ctrl+` to toggle</p>
                </TooltipContent>
              </Tooltip>

              {/* AI Agent Toggle Button */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={toggleChat}
                    className={`w-10 h-8 flex items-center justify-center transition-colors ${
                      showChat
                        ? "bg-purple-600/30 text-purple-400 hover:bg-purple-600/40"
                        : "hover:bg-[#3a3a3a] text-gray-400 hover:text-gray-200"
                    }`}
                  >
                    <Bot className="w-4 h-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="bg-[#2d2d2d] border-[#3c3c3c] text-white">
                  <p className="text-xs">
                    {showChat ? "Hide AI Agent" : "Open AI Agent"}
                  </p>
                  <p className="text-[10px] text-gray-400">Chat with AI to code faster</p>
                </TooltipContent>
              </Tooltip>

              {/* Window Controls */}
              <div className="flex">
                <button
                  className="w-10 h-8 hover:bg-[#3a3a3a] flex items-center justify-center"
                  onClick={async () => await win.minimize()}
                >
                  —
                </button>
                <button
                  className="w-10 h-8 hover:bg-[#3a3a3a] flex items-center justify-center"
                  onClick={async () => await win.toggleMaximize()}
                >
                  ▢
                </button>
                <button
                  className="w-10 h-8 hover:bg-red-600 flex items-center justify-center"
                  onClick={async () => await win.close()}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-hidden">{children}</div>
          </div>
        </TooltipProvider>
      </TerminalContext.Provider>
    </ChatContext.Provider>
  );
}
