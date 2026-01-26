import { useState, useRef, useEffect, useCallback } from "react";
import { useEditor } from "@/context/EditorContext";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ScrollArea } from "../ui/scroll-area";
import {
  Send,
  Bot,
  User,
  Code,
  FileCode,
  Loader2,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Terminal,
  FileEdit,
  Eye,
  X,
  Settings,
  RefreshCw,
  Plus,
  Trash2,
  FolderOpen,
} from "lucide-react";
import {
  CodeBlock,
  Message,
  FileContext,
  ChatStreamEvent,
  ChatMessage,
} from "@/helpers/interfaces/file-types";

const DEFAULT_MODEL = "gemma3:4b";

function extractCodeBlocks(content: string): CodeBlock[] {
  const codeBlockRegex = /```(\w+)?\s*(?:\[([^\]]+)\])?\n([\s\S]*?)```/g;
  const blocks: CodeBlock[] = [];
  let match;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    const language = match[1] || "plaintext";
    const fileName = match[2];
    const code = match[3].trim();

    blocks.push({
      language,
      code,
      fileName,
      action: fileName ? "edit" : "view",
    });
  }

  return blocks;
}

function formatMessageContent(content: string): string {
  return content
    .replace(/```(\w+)?\s*(?:\[([^\]]+)\])?\n[\s\S]*?```/g, "")
    .trim();
}

function CodeBlockDisplay({
  block,
  onApply,
  onCopy,
}: {
  block: CodeBlock;
  onApply?: (block: CodeBlock) => void;
  onCopy: (code: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const handleCopy = () => {
    onCopy(block.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-2 rounded-lg border border-[#3c3c3c] bg-[#1e1e1e] overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-[#2d2d2d] border-b border-[#3c3c3c]">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1 hover:bg-white/10 rounded"
          >
            {expanded ? (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-400" />
            )}
          </button>
          <FileCode className="w-4 h-4 text-blue-400" />
          <span className="text-sm text-gray-300">
            {block.fileName || block.language}
          </span>
          {block.fileName && (
            <span className="text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-400">
              {block.action === "create" ? "NEW" : "EDIT"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleCopy}
            className="p-1.5 hover:bg-white/10 rounded text-gray-400 hover:text-white transition-colors"
            title="Copy code"
          >
            {copied ? (
              <Check className="w-4 h-4 text-green-400" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </button>
          {block.fileName && onApply && (
            <button
              onClick={() => onApply(block)}
              className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 rounded text-white transition-colors flex items-center gap-1"
            >
              <FileEdit className="w-3 h-3" />
              Apply
            </button>
          )}
        </div>
      </div>
      {expanded && (
        <pre className="p-3 overflow-x-auto text-sm">
          <code className="text-gray-300 font-mono whitespace-pre">
            {block.code}
          </code>
        </pre>
      )}
    </div>
  );
}

function MessageBubble({
  message,
  onApplyCode,
  onCopyCode,
}: {
  message: Message;
  onApplyCode: (block: CodeBlock) => void;
  onCopyCode: (code: string) => void;
}) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";
  const textContent = formatMessageContent(message.content);
  const codeBlocks = extractCodeBlocks(message.content);

  if (isSystem) {
    return (
      <div className="flex justify-center mb-4">
        <div className="px-4 py-2 bg-[#2d2d2d] rounded-full text-sm text-gray-400 border border-[#3c3c3c]">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""} mb-4 animate-in fade-in slide-in-from-bottom-2 duration-300`}
    >
      <div
        className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
          isUser ? "bg-blue-600" : "bg-purple-600"
        }`}
      >
        {isUser ? (
          <User className="w-4 h-4 text-white" />
        ) : (
          <Bot className="w-4 h-4 text-white" />
        )}
      </div>
      <div
        className={`flex-1 max-w-[85%] ${isUser ? "flex flex-col items-end" : ""}`}
      >
        <div
          className={`rounded-lg px-4 py-3 ${
            isUser
              ? "bg-blue-600 text-white"
              : "bg-[#2d2d2d] text-gray-200 border border-[#3c3c3c]"
          }`}
        >
          {textContent && (
            <p className="whitespace-pre-wrap text-sm leading-relaxed">
              {textContent}
            </p>
          )}
          {message.isStreaming && (
            <span className="inline-block w-2 h-4 bg-current animate-pulse ml-1" />
          )}
        </div>
        {codeBlocks.length > 0 && (
          <div className="mt-2 w-full">
            {codeBlocks.map((block, index) => (
              <CodeBlockDisplay
                key={index}
                block={block}
                onApply={onApplyCode}
                onCopy={onCopyCode}
              />
            ))}
          </div>
        )}
        <span className="text-xs text-gray-500 mt-1">
          {message.timestamp.toLocaleTimeString()}
        </span>
      </div>
    </div>
  );
}

function ContextPanel({
  files,
  onRemove,
  onClear,
}: {
  files: FileContext[];
  onRemove: (path: string) => void;
  onClear: () => void;
}) {
  const [expanded, setExpanded] = useState(true);

  if (files.length === 0) return null;

  return (
    <div className="border-b border-[#3c3c3c] bg-[#252526]">
      <div
        className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-white/5"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-400" />
          )}
          <Eye className="w-4 h-4 text-green-400" />
          <span className="text-sm text-gray-300">
            Context ({files.length} files)
          </span>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClear();
          }}
          className="text-xs text-gray-500 hover:text-gray-300"
        >
          Clear all
        </button>
      </div>
      {expanded && (
        <div className="px-3 pb-2 flex flex-wrap gap-2">
          {files.map((file) => (
            <div
              key={file.path}
              className="flex items-center gap-1 px-2 py-1 bg-[#3c3c3c] rounded text-xs text-gray-300"
            >
              <FileCode className="w-3 h-3" />
              <span className="max-w-37.5 truncate">
                {file.path.split(/[\\/]/).pop()}
              </span>
              <button
                onClick={() => onRemove(file.path)}
                className="ml-1 hover:text-red-400"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SettingsPanel({
  model,
  setModel,
  isOpen,
  onClose,
}: {
  model: string;
  setModel: (model: string) => void;
  isOpen: boolean;
  onClose: () => void;
}) {
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchModels = async () => {
    setLoading(true);
    try {
      const models = await invoke<string[]>("get_ollama_models");
      setAvailableModels(models);
    } catch (error) {
      console.error("Failed to fetch models:", error);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (isOpen) {
      fetchModels();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="absolute bottom-full left-0 right-0 mb-2 bg-[#2d2d2d] border border-[#3c3c3c] rounded-lg p-4 shadow-xl z-10">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-white">Settings</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-white">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="space-y-3">
        <div>
          <label className="text-xs text-gray-400 block mb-1">Model</label>
          <div className="flex gap-2">
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="flex-1 bg-[#1e1e1e] border border-[#3c3c3c] rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
            >
              <option value={DEFAULT_MODEL}>{DEFAULT_MODEL}</option>
              {availableModels
                .filter((m) => m !== DEFAULT_MODEL)
                .map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
            </select>
            <button
              onClick={fetchModels}
              className="p-1.5 bg-[#1e1e1e] border border-[#3c3c3c] rounded hover:bg-white/10"
              disabled={loading}
            >
              <RefreshCw
                className={`w-4 h-4 text-gray-400 ${loading ? "animate-spin" : ""}`}
              />
            </button>
          </div>
        </div>
        <p className="text-xs text-gray-500">
          Make sure Ollama is running locally:{" "}
          <code className="bg-[#1e1e1e] px-1 rounded">ollama serve</code>
        </p>
      </div>
    </div>
  );
}

function QuickActions({
  onAction,
  hasContext,
}: {
  onAction: (prompt: string) => void;
  hasContext: boolean;
}) {
  const actions = [
    { icon: Code, label: "Explain", prompt: "Explain this code in detail:" },
    {
      icon: FileEdit,
      label: "Refactor",
      prompt: "Refactor this code to be cleaner and more efficient:",
    },
    {
      icon: Terminal,
      label: "Add tests",
      prompt: "Write unit tests for this code:",
    },
    {
      icon: Sparkles,
      label: "Optimize",
      prompt: "Optimize this code for better performance:",
    },
  ];

  return (
    <div className="flex gap-2 px-3 py-2 border-b border-[#3c3c3c] overflow-x-auto">
      {actions.map((action) => (
        <button
          key={action.label}
          onClick={() => onAction(action.prompt)}
          disabled={!hasContext}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition-colors ${
            hasContext
              ? "bg-[#3c3c3c] hover:bg-[#4c4c4c] text-gray-300"
              : "bg-[#2c2c2c] text-gray-600 cursor-not-allowed"
          }`}
        >
          <action.icon className="w-3 h-3" />
          {action.label}
        </button>
      ))}
    </div>
  );
}

function ConversationList({
  conversations,
  currentId,
  onSelect,
  onNew,
  onDelete,
}: {
  conversations: { id: string; title: string; timestamp: Date }[];
  currentId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}) {
  const [showList, setShowList] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setShowList(!showList)}
        className="flex items-center gap-2 px-3 py-1.5 bg-[#3c3c3c] hover:bg-[#4c4c4c] rounded text-sm text-gray-300"
      >
        <FolderOpen className="w-4 h-4" />
        <span>Chats</span>
        <ChevronDown
          className={`w-4 h-4 transition-transform ${showList ? "rotate-180" : ""}`}
        />
      </button>

      {showList && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-[#2d2d2d] border border-[#3c3c3c] rounded-lg shadow-xl z-20 max-h-64 overflow-y-auto">
          <button
            onClick={() => {
              onNew();
              setShowList(false);
            }}
            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/10 text-sm text-gray-300 border-b border-[#3c3c3c]"
          >
            <Plus className="w-4 h-4" />
            New conversation
          </button>
          {conversations.map((conv) => (
            <div
              key={conv.id}
              className={`flex items-center justify-between px-3 py-2 hover:bg-white/10 cursor-pointer ${
                currentId === conv.id ? "bg-white/10" : ""
              }`}
              onClick={() => {
                onSelect(conv.id);
                setShowList(false);
              }}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-300 truncate">{conv.title}</p>
                <p className="text-xs text-gray-500">
                  {conv.timestamp.toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(conv.id);
                }}
                className="p-1 hover:bg-red-500/20 rounded text-gray-500 hover:text-red-400"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ChatInterface() {
  const { selectedFile, fileContent, setFileContent } = useEditor();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [contextFiles, setContextFiles] = useState<FileContext[]>([]);
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [showSettings, setShowSettings] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<
    "connected" | "disconnected" | "checking"
  >("checking");
  const [conversations, setConversations] = useState<
    { id: string; title: string; timestamp: Date; messages: Message[] }[]
  >([]);
  const [currentConversationId, setCurrentConversationId] = useState<
    string | null
  >(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const checkConnection = async () => {
      try {
        const connected = await invoke<boolean>("check_ollama_connection");
        setConnectionStatus(connected ? "connected" : "disconnected");
      } catch {
        setConnectionStatus("disconnected");
      }
    };

    checkConnection();
    const interval = setInterval(checkConnection, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const unlisten = listen<ChatStreamEvent>("chat-stream", (event) => {
      const { content, done } = event.payload;

      setMessages((prev) => {
        const lastMessage = prev[prev.length - 1];
        if (
          lastMessage &&
          lastMessage.role === "assistant" &&
          lastMessage.isStreaming
        ) {
          return prev.map((m, i) =>
            i === prev.length - 1
              ? { ...m, content: m.content + content, isStreaming: !done }
              : m,
          );
        }
        return prev;
      });
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (selectedFile && fileContent) {
      const ext = selectedFile.split(".").pop()?.toLowerCase() || "";
      const langMap: Record<string, string> = {
        js: "javascript",
        jsx: "javascript",
        ts: "typescript",
        tsx: "typescript",
        py: "python",
        rs: "rust",
        go: "go",
        java: "java",
        cpp: "cpp",
        c: "c",
        html: "html",
        css: "css",
        json: "json",
        md: "markdown",
      };

      const newContext: FileContext = {
        path: selectedFile,
        content: fileContent,
        language: langMap[ext] || "plaintext",
      };

      setContextFiles((prev) => {
        const exists = prev.find((f) => f.path === selectedFile);
        if (exists) {
          return prev.map((f) => (f.path === selectedFile ? newContext : f));
        }
        return [...prev, newContext];
      });
    }
  }, [selectedFile, fileContent]);
  

  const buildSystemPrompt = useCallback(() => {
    let systemPrompt = `You are an expert AI coding assistant integrated into a code editor called GEN CODE. You help developers understand, write, and improve code.

Your capabilities:
- Analyze and explain code
- Write new code and suggest improvements
- Debug issues and fix bugs
- Refactor code for better quality
- Write tests and documentation

Guidelines:
- Be concise but thorough
- Always provide code examples when relevant
- Use markdown code blocks with language specifiers
- When suggesting file changes, use the format: \`\`\`language [filename]\ncode\n\`\`\`
- Explain your reasoning when making suggestions
- If you need to create a new file, specify the full path in the filename
`;

    if (contextFiles.length > 0) {
      systemPrompt += "\n\nCurrent context files:\n";
      contextFiles.forEach((file) => {
        systemPrompt += `\n--- ${file.path} ---\n\`\`\`${file.language}\n${file.content}\n\`\`\`\n`;
      });
    }

    return systemPrompt;
  }, [contextFiles]);

  const sendMessage = async (userMessage: string) => {
    if (!userMessage.trim() || isLoading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: userMessage,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    if (connectionStatus === "disconnected") {
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: `**Ollama is not connected**

To use the AI assistant, please:

1. **Install Ollama** (if not installed): Visit [ollama.ai](https://ollama.ai) and download it
2. **Start Ollama**: Run \`ollama serve\` in your terminal
3. **Pull a model**: Run \`ollama pull codellama:7b\` or \`ollama pull llama2\`

Once Ollama is running, the connection status will turn green and you can chat with the AI.`,
        timestamp: new Date(),
        isStreaming: false,
      };
      setMessages((prev) => [...prev, errorMsg]);
      setIsLoading(false);
      return;
    }

    const assistantMsg: Message = {
      id: (Date.now() + 1).toString(),
      role: "assistant",
      content: "",
      timestamp: new Date(),
      isStreaming: true,
    };

    setMessages((prev) => [...prev, assistantMsg]);

    try {
      const chatMessages: ChatMessage[] = [
        { role: "system", content: buildSystemPrompt() },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: userMessage },
      ];

      await invoke("chat_with_ollama", {
        model: model,
        messages: chatMessages,
      });

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsg.id ? { ...m, isStreaming: false } : m,
        ),
      );
    } catch (error) {
      console.error("Chat error:", error);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsg.id
            ? {
                ...m,
                content: ` **Error connecting to Ollama**

${error instanceof Error ? error.message : String(error)}

**Troubleshooting:**
- Make sure Ollama is running: \`ollama serve\`
- Check if the model is installed: \`ollama list\`
- Try pulling a model: \`ollama pull ${model}\``,
                isStreaming: false,
              }
            : m,
        ),
      );
    }

    setIsLoading(false);
  };

  const handleApplyCode = async (block: CodeBlock) => {
    if (!block.fileName) return;

    try {
      await invoke("write_file_content", {
        path: block.fileName,
        content: block.code,
      });

      if (selectedFile === block.fileName) {
        setFileContent(block.code);
      }

      const successMsg: Message = {
        id: Date.now().toString(),
        role: "system",
        content: `Successfully applied changes to ${block.fileName}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, successMsg]);
    } catch (error) {
      const errorMsg: Message = {
        id: Date.now().toString(),
        role: "system",
        content: `Failed to apply changes: ${error}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    }
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
  };

  const handleQuickAction = (prompt: string) => {
    if (contextFiles.length > 0) {
      sendMessage(prompt);
    } else {
      setInput(prompt + " ");
      inputRef.current?.focus();
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const removeContextFile = (path: string) => {
    setContextFiles((prev) => prev.filter((f) => f.path !== path));
  };

  const clearContext = () => {
    setContextFiles([]);
  };

  const handleNewConversation = () => {
    if (messages.length > 0) {
      const title = messages[0]?.content.slice(0, 50) || "New conversation";
      setConversations((prev) => [
        ...prev,
        {
          id: currentConversationId || Date.now().toString(),
          title,
          timestamp: new Date(),
          messages: [...messages],
        },
      ]);
    }
    setMessages([]);
    setCurrentConversationId(Date.now().toString());
  };

  const handleSelectConversation = (id: string) => {
    const conv = conversations.find((c) => c.id === id);
    if (conv) {
      setMessages(conv.messages);
      setCurrentConversationId(id);
    }
  };

  const handleDeleteConversation = (id: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (currentConversationId === id) {
      setMessages([]);
      setCurrentConversationId(null);
    }
  };

  const handleClearChat = () => {
    setMessages([]);
  };

  return (
    <div className="h-full flex flex-col bg-[#1e1e1e]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#3c3c3c] bg-[#252526]">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-400" />
            <span className="font-medium text-white">AI Assistant</span>
            <span
              className={`w-2 h-2 rounded-full ${
                connectionStatus === "connected"
                  ? "bg-green-500"
                  : connectionStatus === "checking"
                    ? "bg-yellow-500 animate-pulse"
                    : "bg-red-500"
              }`}
              title={
                connectionStatus === "connected"
                  ? "Connected to Ollama"
                  : connectionStatus === "checking"
                    ? "Checking connection..."
                    : "Disconnected - Start Ollama"
              }
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ConversationList
            conversations={conversations}
            currentId={currentConversationId}
            onSelect={handleSelectConversation}
            onNew={handleNewConversation}
            onDelete={handleDeleteConversation}
          />
          <button
            onClick={handleClearChat}
            className="p-1.5 hover:bg-white/10 rounded text-gray-400 hover:text-white"
            title="Clear chat"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-1.5 hover:bg-white/10 rounded text-gray-400 hover:text-white"
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="px-4 py-1 bg-[#252526] border-b border-[#3c3c3c] text-xs text-gray-500">
        Model: {model}
      </div>

      <ContextPanel
        files={contextFiles}
        onRemove={removeContextFile}
        onClear={clearContext}
      />

      <QuickActions
        onAction={handleQuickAction}
        hasContext={contextFiles.length > 0}
      />

      <ScrollArea className="flex-1 p-4 h-100">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-gray-500">
            <Bot className="w-12 h-12 mb-4 text-purple-400/50" />
            <h3 className="text-lg font-medium text-gray-300 mb-2">
              AI Coding Assistant
            </h3>
            <p className="text-sm max-w-md mb-4">
              Ask me anything about your code. I can explain, refactor, debug,
              write tests, and more. Open a file to add it to the context.
            </p>
            {connectionStatus === "disconnected" && (
              <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm max-w-md">
                <p className="font-medium">Ollama not connected</p>
                <p className="text-xs mt-1">
                  Start Ollama with:{" "}
                  <code className="bg-red-500/20 px-1 rounded">
                    ollama serve
                  </code>
                </p>
                <p className="text-xs mt-1">
                  Then pull a model:{" "}
                  <code className="bg-red-500/20 px-1 rounded">
                    ollama pull codellama:7b
                  </code>
                </p>
              </div>
            )}
            {connectionStatus === "connected" && contextFiles.length === 0 && (
              <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg text-blue-400 text-sm max-w-md">
                <p className="font-medium">💡 Tip</p>
                <p className="text-xs mt-1">
                  Open a file from the file explorer to add it to the context.
                  The AI will be able to see and understand your code.
                </p>
              </div>
            )}
          </div>
        ) : (
          <div>
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                onApplyCode={handleApplyCode}
                onCopyCode={handleCopyCode}
              />
            ))}
            {/* <div ref={messagesEndRef} /> */}
          </div>
        )}
      </ScrollArea>

      {/* Input Area */}
      <div className="relative border-t border-[#3c3c3c] bg-[#252526] p-3 mb-10">
        <SettingsPanel
          model={model}
          setModel={setModel}
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
        />
        <div className="flex gap-2">
          <div className="flex-1 relative flex justify-center items-center">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder={
                connectionStatus === "disconnected"
                  ? "Type your message... (Ollama not connected)"
                  : contextFiles.length > 0
                    ? "Ask about the code..."
                    : "Ask a question or open a file for context..."
              }
              className="w-full bg-[#1e1e1e] border border-[#3c3c3c] rounded-lg px-4 py-3 pr-12 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 resize-none"
              rows={2}
              disabled={isLoading}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || isLoading}
              className="absolute right-2 p-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg text-white transition-colors"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
        <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
          <span>Press Enter to send, Shift+Enter for new line</span>
          <span>{contextFiles.length} files in context</span>
        </div>
      </div>
    </div>
  );
}