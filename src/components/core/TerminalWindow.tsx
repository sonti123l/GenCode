import { useEffect, useRef, useState, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "@xterm/xterm/css/xterm.css";
import {
  Plus,
  X,
  ChevronDown,
  Maximize2,
  Minimize2,
  Terminal as TerminalIcon,
} from "lucide-react";

interface TerminalTab {
  id: string;
  name: string;
  terminal: Terminal;
  fitAddon: FitAddon;
}

interface TerminalOutputEvent {
  terminal_id: string;
  data: string;
}

export default function TerminalWindow({
  isVisible,
  onToggle,
  cwd,
}: {
  isVisible: boolean;
  onToggle: () => void;
  cwd?: string;
}) {
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [isMaximized, setIsMaximized] = useState(false);
  const [height, setHeight] = useState(300);
  const [isResizing, setIsResizing] = useState(false);
  const terminalContainerRef = useRef<HTMLDivElement>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const createTerminal = useCallback(async () => {
    const terminalId = `terminal-${Date.now()}`;
    const tabNumber = tabs.length + 1;

    const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: "bar",
      fontSize: 13,
      fontFamily: 'Consolas, "Courier New", monospace',
      theme: {
        background: "#1e1e1e",
        foreground: "#cccccc",
        cursor: "#ffffff",
        cursorAccent: "#1e1e1e",
        selectionBackground: "#264f78",
        black: "#000000",
        red: "#cd3131",
        green: "#0dbc79",
        yellow: "#e5e510",
        blue: "#2472c8",
        magenta: "#bc3fbc",
        cyan: "#11a8cd",
        white: "#e5e5e5",
        brightBlack: "#666666",
        brightRed: "#f14c4c",
        brightGreen: "#23d18b",
        brightYellow: "#f5f543",
        brightBlue: "#3b8eea",
        brightMagenta: "#d670d6",
        brightCyan: "#29b8db",
        brightWhite: "#ffffff",
      },
      allowProposedApi: true,
      scrollback: 10000,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(webLinksAddon);

    const newTab: TerminalTab = {
      id: terminalId,
      name: `Terminal ${tabNumber}`,
      terminal,
      fitAddon,
    };

    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(terminalId);

    try {
      await invoke("create_terminal", {
        terminalId,
        cwd: cwd || null,
      });
    } catch (error) {
      console.error("Failed to create terminal:", error);
      terminal.writeln(`\x1b[31mFailed to create terminal: ${error}\x1b[0m`);
    }

    terminal.onData((data) => {
      invoke("write_terminal", {
        terminalId,
        data,
      }).catch((err) => console.error("Failed to write to terminal:", err));
    });

    return newTab;
  }, [tabs.length, cwd]);

  useEffect(() => {
    const unlisten = listen<TerminalOutputEvent>("terminal-output", (event) => {
      const { terminal_id, data } = event.payload;
      const tab = tabs.find((t) => t.id === terminal_id);
      if (tab) {
        tab.terminal.write(data);
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [tabs]);

  useEffect(() => {
    if (!terminalContainerRef.current || !activeTabId) return;

    const activeTab = tabs.find((t) => t.id === activeTabId);
    if (!activeTab) return;

    terminalContainerRef.current.innerHTML = "";

    activeTab.terminal.open(terminalContainerRef.current);
    activeTab.fitAddon.fit();

    activeTab.terminal.focus();
  }, [activeTabId, tabs, isVisible]);

  useEffect(() => {
    if (!terminalContainerRef.current) return;

    resizeObserverRef.current = new ResizeObserver(() => {
      const activeTab = tabs.find((t) => t.id === activeTabId);
      if (activeTab) {
        try {
          activeTab.fitAddon.fit();
          const dims = activeTab.fitAddon.proposeDimensions();
          if (dims) {
            invoke("resize_terminal", {
              terminalId: activeTab.id,
              rows: dims.rows,
              cols: dims.cols,
            }).catch(console.error);
          }
        } catch (e) {}
      }
    });

    resizeObserverRef.current.observe(terminalContainerRef.current);

    return () => {
      resizeObserverRef.current?.disconnect();
    };
  }, [activeTabId, tabs]);

  useEffect(() => {
    if (isVisible && tabs.length === 0) {
      createTerminal();
    }
  }, [isVisible, tabs.length, createTerminal]);

  const closeTab = async (tabId: string) => {
    const tab = tabs.find((t) => t.id === tabId);
    if (tab) {
      tab.terminal.dispose();
      await invoke("close_terminal", { terminalId: tabId }).catch(console.error);
    }

    setTabs((prev) => prev.filter((t) => t.id !== tabId));

    if (activeTabId === tabId) {
      const remainingTabs = tabs.filter((t) => t.id !== tabId);
      setActiveTabId(remainingTabs.length > 0 ? remainingTabs[0].id : null);
    }
  };

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const newHeight = window.innerHeight - e.clientY;
      if (newHeight >= 150 && newHeight <= window.innerHeight - 200) {
        setHeight(newHeight);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+` to toggle terminal
      if (e.ctrlKey && e.key === "`") {
        e.preventDefault();
        onToggle();
      }
      // Ctrl+Shift+` to create new terminal
      if (e.ctrlKey && e.shiftKey && e.key === "`") {
        e.preventDefault();
        createTerminal();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onToggle, createTerminal]);

  if (!isVisible) return null;

  return (
    <div
      className="flex flex-col bg-[#1e1e1e] border-t border-[#3c3c3c]"
      style={{ height: isMaximized ? "calc(100vh - 2rem)" : height }}
    >
      {/* Resize Handle */}
      <div
        className={`h-1 bg-[#3c3c3c] hover:bg-purple-500 cursor-ns-resize transition-colors ${
          isResizing ? "bg-purple-500" : ""
        }`}
        onMouseDown={handleResizeMouseDown}
      />

      {/* Terminal Header */}
      <div className="flex items-center justify-between h-9 bg-[#252526] border-b border-[#3c3c3c] px-2">
        <div className="flex items-center gap-1 overflow-x-auto">
          {/* Tabs */}
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={`flex items-center gap-1 px-3 py-1 rounded-t text-sm cursor-pointer group ${
                activeTabId === tab.id
                  ? "bg-[#1e1e1e] text-white"
                  : "text-gray-400 hover:text-gray-200 hover:bg-[#2d2d2d]"
              }`}
              onClick={() => setActiveTabId(tab.id)}
            >
              <TerminalIcon className="w-3.5 h-3.5" />
              <span className="max-w-25 truncate">{tab.name}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
                className="ml-1 p-0.5 rounded hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}

          {/* New Terminal Button */}
          <button
            onClick={() => createTerminal()}
            className="p-1.5 rounded hover:bg-white/10 text-gray-400 hover:text-white"
            title="New Terminal (Ctrl+Shift+`)"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsMaximized(!isMaximized)}
            className="p-1.5 rounded hover:bg-white/10 text-gray-400 hover:text-white"
            title={isMaximized ? "Restore" : "Maximize"}
          >
            {isMaximized ? (
              <Minimize2 className="w-4 h-4" />
            ) : (
              <Maximize2 className="w-4 h-4" />
            )}
          </button>
          <button
            onClick={onToggle}
            className="p-1.5 rounded hover:bg-white/10 text-gray-400 hover:text-white"
            title="Hide Terminal (Ctrl+`)"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Terminal Container */}
      <div
        ref={terminalContainerRef}
        className="flex-1 overflow-hidden"
        style={{ padding: "4px 8px" }}
      />

      {/* Status Bar */}
      <div className="h-6 flex items-center justify-between px-3 bg-[#252526] border-t border-[#3c3c3c] text-xs text-gray-500">
        <div className="flex items-center gap-2">
          <span>
            {tabs.length} terminal{tabs.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span>Ctrl+` to toggle</span>
          <span>•</span>
          <span>Ctrl+Shift+` new terminal</span>
        </div>
      </div>
    </div>
  );
}