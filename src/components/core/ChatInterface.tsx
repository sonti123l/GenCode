// src/components/chat/ChatInterface.tsx
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
  AlertCircle,
  Database,
  PlayCircle,
  CheckCircle,
  Wand2,
  GitPullRequest,
  Shield,
  RotateCcw,
  FilePlus,
  FileX,
  Search,
  CheckSquare,
  Edit3
} from "lucide-react";
import {
  CodeBlock,
  Message,
  FileContext,
  ChatStreamEvent,
  ChatMessage,
} from "@/helpers/interfaces/file-types";
import fileTools, { generateDiff } from "@/tools/fileTools";

const DEFAULT_MODEL = "glm-4.6:cloud";

interface GraphContext {
  summary: string;
  cypherSchema: string;
  sampleQueries: string[];
  nodesByType: Record<string, number>;
  edgesByType: Record<string, number>;
}

interface CodeGraph {
  nodes: Array<{
    id: string;
    type: string;
    name?: string;
    path?: string;
    language?: string;
    lines?: number;
    [key: string]: any;
  }>;
  edges: Array<{
    from: string;
    to: string;
    type: string;
    unresolved?: boolean;
    [key: string]: any;
  }>;
  files?: Array<{
    id: number;
    type: string;
    path: string;
    language: string;
    lines: number;
  }>;
}

interface CypherQueryResult {
  success: boolean;
  data: any[];
  error?: string;
  summary: string;
}

interface PendingEdit {
  id: string;
  path: string;
  original: string;
  modified: string;
  description: string;
  applied: boolean;
  type: 'search_replace' | 'create' | 'delete' | 'insert';
}

interface AgentAction {
  id: string;
  type: 'search' | 'read' | 'edit' | 'write' | 'create' | 'rename' | 'delete';
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  description: string;
  result?: any;
}

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

// Parse agent edit blocks from AI response
function parseEditBlocks(content: string): PendingEdit[] {
  const edits: PendingEdit[] = [];
  
  // Parse Search/Replace blocks (Aider format)
  const searchReplaceRegex = /<<<<<<< SEARCH\n([\s\S]*?)=======\n([\s\S]*?)>>>>>>> REPLACE(?:\s+file:\s*([^\n]+))?/g;
  let match;
  
  while ((match = searchReplaceRegex.exec(content)) !== null) {
    const search = match[1].trim();
    const replace = match[2].trim();
    const filePath = match[3]?.trim();
    
    if (filePath) {
      edits.push({
        id: `edit-${Date.now()}-${Math.random()}`,
        path: filePath,
        original: search,
        modified: replace,
        description: 'Search/Replace edit',
        applied: false,
        type: 'search_replace'
      });
    }
  }
  
  // Parse Create file blocks
  const createRegex = /```\w*\s*\[([^\]]+\.(ts|tsx|js|jsx|py|rs|go|java|cpp|c|h|html|css|json|md))\]\s*create\n([\s\S]*?)```/g;
  while ((match = createRegex.exec(content)) !== null) {
    edits.push({
      id: `edit-${Date.now()}-${Math.random()}`,
      path: match[1],
      original: '',
      modified: match[3].trim(),
      description: 'Create new file',
      applied: false,
      type: 'create'
    });
  }
  
  return edits;
}

function CodeBlockDisplay({
  block,
  onApply,
  onCopy,
  onExecuteQuery,
}: {
  block: CodeBlock;
  onApply?: (block: CodeBlock) => void;
  onCopy: (code: string) => void;
  onExecuteQuery?: (query: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const handleCopy = () => {
    onCopy(block.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isCypher = block.language === "cypher";

  return (
    <div className="my-2 rounded-lg border border-[#3c3c3c] bg-[#1e1e1e] overflow-hidden shrink-0">
      <div className="flex items-center justify-between px-3 py-2 bg-[#2d2d2d] border-b border-[#3c3c3c]">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1 hover:bg-white/10 rounded shrink-0"
          >
            {expanded ? (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-400" />
            )}
          </button>
          {isCypher ? (
            <Database className="w-4 h-4 text-green-400 shrink-0" />
          ) : (
            <FileCode className="w-4 h-4 text-blue-400 shrink-0" />
          )}
          <span className="text-sm text-gray-300 truncate">
            {block.fileName || block.language}
          </span>
          {block.fileName && (
            <span className="text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 shrink-0">
              {block.action === "create" ? "NEW" : "EDIT"}
            </span>
          )}
          {isCypher && (
            <span className="text-xs px-2 py-0.5 rounded bg-green-500/20 text-green-400 shrink-0">
              CYPHER
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
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
          {isCypher && onExecuteQuery && (
            <button
              onClick={() => onExecuteQuery(block.code)}
              className="px-2 py-1 text-xs bg-green-600 hover:bg-green-700 rounded text-white transition-colors flex items-center gap-1"
            >
              <PlayCircle className="w-3 h-3" />
              Execute
            </button>
          )}
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
        <pre className="p-3 overflow-x-auto text-sm max-h-96 overflow-y-auto">
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
  onExecuteQuery,
}: {
  message: Message;
  onApplyCode: (block: CodeBlock) => void;
  onCopyCode: (code: string) => void;
  onExecuteQuery: (query: string) => void;
}) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";
  const textContent = formatMessageContent(message.content);
  const codeBlocks = extractCodeBlocks(message.content).filter(b => b.language !== 'cypher');

  if (isSystem) {
    return (
      <div className="flex justify-center mb-4 shrink-0">
        <div className="px-4 py-2 bg-[#2d2d2d] rounded-full text-sm text-gray-400 border border-[#3c3c3c] max-w-[90%] wrap-break-word">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""} mb-4 shrink-0`}
    >
      <div
        className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${isUser ? "bg-blue-600" : "bg-purple-600"
          }`}
      >
        {isUser ? (
          <User className="w-4 h-4 text-white" />
        ) : (
          <Bot className="w-4 h-4 text-white" />
        )}
      </div>
      <div
        className={`flex-1 min-w-0 ${isUser ? "flex flex-col items-end" : ""}`}
      >
        <div
          className={`rounded-lg px-4 py-3 wrap-break-word ${isUser
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
          <div className="mt-2 w-full max-w-full">
            {codeBlocks.map((block, index) => (
              <CodeBlockDisplay
                key={index}
                block={block}
                onApply={onApplyCode}
                onCopy={onCopyCode}
                onExecuteQuery={onExecuteQuery}
              />
            ))}
          </div>
        )}
        <span className="text-xs text-gray-500 mt-1 shrink-0">
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
    <div className="border-b border-[#3c3c3c] bg-[#252526] shrink-0">
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
              className="flex items-center gap-1 px-2 py-1 bg-[#3c3c3c] rounded text-xs text-gray-300 max-w-full"
            >
              <FileCode className="w-3 h-3 shrink-0" />
              <span className="truncate">
                {file.path.split(/[\\/]/).pop()}
              </span>
              <button
                onClick={() => onRemove(file.path)}
                className="ml-1 hover:text-red-400 shrink-0"
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
    <div className="absolute bottom-full left-0 right-0 mb-2 bg-[#2d2d2d] border border-[#3c3c3c] rounded-lg p-4 shadow-xl z-50">
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
    <div className="flex gap-2 px-3 py-2 border-b border-[#3c3c3c] overflow-x-auto shrink-0">
      {actions.map((action) => (
        <button
          key={action.label}
          onClick={() => onAction(action.prompt)}
          disabled={!hasContext}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition-colors shrink-0 ${hasContext
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
        <div className="absolute top-full left-0 mt-1 w-64 bg-[#2d2d2d] border border-[#3c3c3c] rounded-lg shadow-xl z-50 max-h-64 overflow-y-auto">
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
              className={`flex items-center justify-between px-3 py-2 hover:bg-white/10 cursor-pointer ${currentId === conv.id ? "bg-white/10" : ""
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
                className="p-1 hover:bg-red-500/20 rounded text-gray-500 hover:text-red-400 shrink-0"
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

function FileLoadingProgress({
  current,
  total,
  currentFile,
}: {
  current: number;
  total: number;
  currentFile: string;
}) {
  const progress = (current / total) * 100;
  
  return (
    <div className="flex items-start gap-3 px-4 py-3 mb-4 bg-purple-500/10 border border-purple-500/30 rounded-lg">
      <div className="relative flex items-center justify-center shrink-0 mt-0.5">
        <div className="w-5 h-5 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
        <Database className="w-3 h-3 text-purple-400 absolute" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm text-purple-300 font-medium">Reading files...</p>
          <span className="text-xs text-purple-400">{current}/{total}</span>
        </div>
        <div className="w-full bg-purple-900/30 rounded-full h-1.5 mb-2">
          <div 
            className="bg-purple-500 h-1.5 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-xs text-purple-400/70 truncate">{currentFile}</p>
      </div>
    </div>
  );
}

// New: Agent Actions Panel
function AgentActionsPanel({ actions }: { actions: AgentAction[] }) {
  if (actions.length === 0) return null;
  
  return (
    <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
      <h4 className="text-sm font-medium text-blue-400 mb-2">Agent Actions</h4>
      <div className="space-y-1">
        {actions.slice(-5).map((action, idx) => (
          <div key={idx} className="flex items-center gap-2 text-xs">
            {action.status === 'in-progress' && (
              <Loader2 className="w-3 h-3 animate-spin text-blue-400" />
            )}
            {action.status === 'completed' && (
              <Check className="w-3 h-3 text-green-400" />
            )}
            {action.status === 'failed' && (
              <AlertCircle className="w-3 h-3 text-red-400" />
            )}
            {action.status === 'pending' && (
              <div className="w-3 h-3 rounded-full bg-gray-600" />
            )}
            <span className={`
              ${action.status === 'completed' ? 'text-green-400' : ''}
              ${action.status === 'failed' ? 'text-red-400' : ''}
              ${action.status === 'in-progress' ? 'text-blue-400' : ''}
              ${action.status === 'pending' ? 'text-gray-500' : ''}
            `}>
              {action.description}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// New: Pending Edits Panel
function PendingEditsPanel({ 
  edits, 
  onApply, 
  onReject, 
  onViewDiff,
  onApplyAll,
  onRejectAll
}: { 
  edits: PendingEdit[];
  onApply: (id: string) => void;
  onReject: (id: string) => void;
  onViewDiff: (edit: PendingEdit) => void;
  onApplyAll: () => void;
  onRejectAll: () => void;
}) {
  if (edits.length === 0) return null;

  const pendingCount = edits.filter(e => !e.applied).length;
  if (pendingCount === 0) return null;

  return (
    <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-medium text-yellow-400">
          Pending Changes ({pendingCount})
        </h4>
        <div className="flex gap-2">
          <button 
            onClick={onApplyAll}
            className="text-xs px-2 py-1 bg-green-600 hover:bg-green-700 rounded text-white"
          >
            Apply All
          </button>
          <button 
            onClick={onRejectAll}
            className="text-xs px-2 py-1 bg-red-600 hover:bg-red-700 rounded text-white"
          >
            Reject All
          </button>
        </div>
      </div>
      <div className="space-y-2 max-h-40 overflow-y-auto">
        {edits.filter(e => !e.applied).map((edit) => (
          <div key={edit.id} className="flex items-center justify-between p-2 bg-[#2d2d2d] rounded text-xs">
            <div className="flex items-center gap-2 overflow-hidden">
              {edit.type === 'create' ? (
                <FilePlus className="w-3 h-3 text-green-400 shrink-0" />
              ) : edit.type === 'delete' ? (
                <FileX className="w-3 h-3 text-red-400 shrink-0" />
              ) : (
                <Edit3 className="w-3 h-3 text-blue-400 shrink-0" />
              )}
              <span className="text-gray-300 truncate">{edit.path.split(/[\\/]/).pop()}</span>
              <span className="text-gray-500 truncate">{edit.description}</span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => onViewDiff(edit)}
                className="p-1 hover:bg-white/10 rounded text-gray-400"
                title="View diff"
              >
                <Eye className="w-3 h-3" />
              </button>
              <button
                onClick={() => onApply(edit.id)}
                className="p-1 hover:bg-green-500/20 rounded text-green-400"
                title="Apply"
              >
                <Check className="w-3 h-3" />
              </button>
              <button
                onClick={() => onReject(edit.id)}
                className="p-1 hover:bg-red-500/20 rounded text-red-400"
                title="Reject"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// New: Diff Modal
function DiffModal({ 
  isOpen, 
  onClose, 
  path, 
  diff 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  path: string; 
  diff: string; 
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-[#1e1e1e] border border-[#3c3c3c] rounded-lg w-full max-w-4xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-[#3c3c3c]">
          <h3 className="text-white font-medium">Changes to {path.split(/[\\/]/).pop()}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-4">
          <pre className="text-sm font-mono whitespace-pre-wrap">
            {diff.split('\n').map((line, idx) => (
              <div key={idx} className={`
                ${line.startsWith('+') ? 'text-green-400 bg-green-400/10' : ''}
                ${line.startsWith('-') ? 'text-red-400 bg-red-400/10' : ''}
                ${line.startsWith('@@') ? 'text-blue-400 bg-blue-400/10' : ''}
              `}>
                {line}
              </div>
            ))}
          </pre>
        </div>
        <div className="p-4 border-t border-[#3c3c3c] flex justify-end gap-2">
          <button 
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-300 hover:bg-white/10 rounded"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// New: Agent Mode Badge
function AgentModeBadge({ mode }: { mode: 'chat' | 'agent' | 'ask' }) {
  const colors = {
    chat: 'bg-gray-600',
    agent: 'bg-purple-600',
    ask: 'bg-blue-600'
  };

  return (
    <span className={`text-xs px-2 py-0.5 rounded text-white ${colors[mode]}`}>
      {mode.toUpperCase()}
    </span>
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
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [neo4jConnected, setNeo4jConnected] = useState(false);
  const [graphStored, setGraphStored] = useState(false);
  const [graphContext, setGraphContext] = useState<GraphContext | null>(null);
  const [fileLoadingProgress, setFileLoadingProgress] = useState<{
    current: number;
    total: number;
    currentFile: string;
  } | null>(null);
  
  // NEW: Agent mode state
  const [agentMode, setAgentMode] = useState<'chat' | 'agent' | 'ask'>('chat');
  const [pendingEdits, setPendingEdits] = useState<PendingEdit[]>([]);
  const [agentActions, setAgentActions] = useState<AgentAction[]>([]);
  const [autoApplyEdits, setAutoApplyEdits] = useState(false);
  const [showDiffModal, setShowDiffModal] = useState(false);
  const [currentDiff, setCurrentDiff] = useState<{path: string; diff: string} | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastAutoExecutedId = useRef<string | null>(null);
  const [isAutoExecuting, setIsAutoExecuting] = useState(false);

  useEffect(() => {
    const unlisten = listen<{ query: string; summary: string }>(
      "cypher-log",
      (event) => {
        console.log(
          `%c[BACKEND CYPHER] %c${event.payload.query}`,
          "color: #a855f7; font-weight: bold",
          "color: #e5e7eb"
        );
        console.log(
          `%c[BACKEND RESULT] %c${event.payload.summary}`,
          "color: #22c55e; font-weight: bold",
          "color: #9ca3af"
        );
      }
    );

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Check Neo4j connection
  useEffect(() => {
    const connectAndCheckNeo4j = async () => {
      try {
        const uri = import.meta.env.VITE_NEO4J_URI || "bolt://localhost:7687";
        const user = import.meta.env.VITE_NEO4J_USER || "neo4j";
        const password = import.meta.env.VITE_NEO4J_PASSWORD || "";

        await invoke<string>("connect_neo4j", { uri, user, password });
        console.log("Auto-connected to Neo4j");
        setNeo4jConnected(true);
      } catch (e) {
        console.error("Auto-connect failed, checking existing connection...", e);
        try {
          const connected = await invoke<boolean>("check_neo4j_connection");
          setNeo4jConnected(connected);
        } catch {
          setNeo4jConnected(false);
        }
      }
    };

    connectAndCheckNeo4j();
    const interval = setInterval(async () => {
      try {
        const connected = await invoke<boolean>("check_neo4j_connection");
        setNeo4jConnected(connected);
      } catch {
        setNeo4jConnected(false);
      }
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  // Store graph automatically
  useEffect(() => {
    const storeGraphAutomatically = async () => {
      if (!neo4jConnected) {
        setGraphStored(false);
        return;
      }

      try {
        const savedGraph = localStorage.getItem("codeGraph");
        if (!savedGraph) {
          setGraphStored(false);
          return;
        }

        const rawGraph = JSON.parse(savedGraph);
        const graph: CodeGraph = {
          nodes: rawGraph.nodes.map((node: any) => ({
            id: String(node.id),
            type: node.type,
            name: node.name,
            path: node.path,
            language: node.language,
            lines: node.lines,
            ...(node.startLine !== undefined && { startLine: node.startLine }),
            ...(node.endLine !== undefined && { endLine: node.endLine }),
            ...(node.params && { params: node.params }),
            ...(node.source && { source: node.source }),
            ...(node.specifiers && { specifiers: node.specifiers }),
            ...(node.line !== undefined && { line: node.line }),
          })),
          edges: rawGraph.edges.map((edge: any) => ({
            from: String(edge.from),
            to: String(edge.to),
            type: edge.type,
            ...(edge.unresolved !== undefined && { unresolved: edge.unresolved }),
            ...(edge.edgeType && { edgeType: edge.edgeType }),
          })),
          ...(rawGraph.files && { files: rawGraph.files }),
        };

        await invoke("store_graph_in_neo4j", { graph });
        const context = await invoke<GraphContext>("generate_graph_context", { graph });
        setGraphContext(context);
        setGraphStored(true);
        console.log("Graph automatically stored/updated in Neo4j");

      } catch (error) {
        console.error("Failed to auto-store graph:", error);
        setGraphStored(false);
      }
    };

    storeGraphAutomatically();
  }, [neo4jConnected]);

  // Check Ollama connection
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

  // Listen for chat streaming
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
              : m
          );
        }
        return prev;
      });
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Auto-execute Cypher queries
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });

    const checkAndExecuteQuery = async () => {
      const lastMsg = messages[messages.length - 1];
      if (!lastMsg || lastMsg.role !== 'assistant' || lastMsg.isStreaming || isAutoExecuting) return;

      if (lastAutoExecutedId.current === lastMsg.id) return;

      const blocks = extractCodeBlocks(lastMsg.content);
      const cypherBlock = blocks.find(b => b.language === 'cypher');

      if (cypherBlock) {
        console.log("Auto-executing Cypher block detected...");
        lastAutoExecutedId.current = lastMsg.id;
        setIsAutoExecuting(true);

        try {
          await handleExecuteQuery(cypherBlock.code, true);
        } catch (e) {
          console.error("Auto-execution failed", e);
        }

        setIsAutoExecuting(false);
      }

      // Parse and queue edit blocks
      const edits = parseEditBlocks(lastMsg.content);
      if (edits.length > 0) {
        setPendingEdits(prev => [...prev, ...edits]);
        if (autoApplyEdits) {
          applyPendingEdits(edits.map(e => e.id));
        }
      }
    };

    checkAndExecuteQuery();
  }, [messages, isAutoExecuting, autoApplyEdits]);

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

  // Apply pending edits
  const applyPendingEdits = async (editIds?: string[]) => {
    const toApply = editIds 
      ? pendingEdits.filter(e => editIds.includes(e.id) && !e.applied)
      : pendingEdits.filter(e => !e.applied);

    for (const edit of toApply) {
      try {
        let result;
        if (edit.type === 'search_replace') {
          result = await fileTools.applySearchReplace(edit.path, edit.original, edit.modified, { fuzzy: true });
        } else if (edit.type === 'create') {
          result = await fileTools.createFile(edit.path, edit.modified);
        } else if (edit.type === 'delete') {
          result = await fileTools.deleteFile(edit.path);
        }

        if (result?.success) {
          setPendingEdits(prev => prev.map(e => e.id === edit.id ? { ...e, applied: true } : e));
          
          // Update context if file modified
          if (result.newContent) {
            setContextFiles(prev => {
              const exists = prev.find(f => f.path === edit.path);
              const ext = edit.path.split('.').pop() || 'plaintext';
              const newContext: FileContext = {
                path: edit.path,
                content: result.newContent,
                language: ext
              };
              
              if (exists) {
                return prev.map(f => f.path === edit.path ? newContext : f);
              }
              return [...prev, newContext];
            });

            if (selectedFile === edit.path) {
              setFileContent(result.newContent);
            }
          }
        }
      } catch (error) {
        console.error("Failed to apply edit:", error);
      }
    }
  };

  // Execute Cypher query and load files
  const handleExecuteQuery = async (query: string, isAuto: boolean = false) => {
    console.log("Executing Cypher Query:", query);

    if (!neo4jConnected) {
      const errorMsg: Message = {
        id: Date.now().toString(),
        role: "system",
        content: "⚠️ Neo4j is not connected. Please connect first.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMsg]);
      return;
    }

    try {
      const result = await invoke<CypherQueryResult>("execute_cypher_query", {
        cypher: query,
      });

      if (result.data.length > 0) {
        const filePaths = new Set<string>();

        const extractPaths = (obj: any) => {
          if (!obj) return;
          if (typeof obj === 'string') {
            if ((obj.includes('/') || obj.includes('\\')) && (obj.includes('.') || obj.length > 3) && !obj.includes('\n')) {
              filePaths.add(obj);
            }
            return;
          }
          if (typeof obj === 'object') {
            if (obj.path && typeof obj.path === 'string') {
              filePaths.add(obj.path);
            }
            Object.keys(obj).forEach(key => {
              const val = obj[key];
              if (typeof val === 'string' && (key.endsWith('path') || key.endsWith('Path'))) {
                extractPaths(val);
              }
            });
            Object.values(obj).forEach(val => extractPaths(val));
          }
        };

        result.data.forEach((item) => extractPaths(item));

        if (filePaths.size > 0) {
          const paths = Array.from(filePaths);
          console.log("Auto-reading files from graph result:", paths);

          const fileDataList = await fileTools.readFiles(paths, (current, total, currentPath) => {
            setFileLoadingProgress({
              current,
              total,
              currentFile: currentPath.split(/[\\/]/).pop() || currentPath
            });
          });

          setFileLoadingProgress(null);

          const newContextFiles: FileContext[] = fileDataList
            .filter(f => !f.error)
            .map(f => ({
              path: f.path,
              content: f.content,
              language: f.path.split('.').pop() || 'plaintext'
            }));

          if (newContextFiles.length > 0) {
            setContextFiles(prev => {
              const existing = new Set(prev.map(p => p.path));
              const filtered = newContextFiles.filter(f => !existing.has(f.path));
              if (filtered.length === 0) return prev;
              const updated = [...prev, ...filtered];
              
              if (isAuto) {
                const recentUserMessages = messages
                  .filter(m => m.role === 'user')
                  .slice(-2);
                const originalQuery = recentUserMessages.length > 0 
                  ? recentUserMessages[recentUserMessages.length - 1].content 
                  : "analysis";
                
                setTimeout(() => {
                  sendMessageWithExplicitContext(
                    `Files loaded. Proceed with: "${originalQuery}"`,
                    updated
                  );
                }, 800);
              }
              
              return updated;
            });
          }
        }
      }
    } catch (error) {
      console.error("Cypher execution error:", error);
      setFileLoadingProgress(null);
      const errorMsg: Message = {
        id: Date.now().toString(),
        role: "system",
        content: `Query execution failed: ${error}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    }
  };

  // Enhanced system prompt with agent capabilities
  const buildSystemPrompt = useCallback(async (explicitContext?: FileContext[]) => {
    const activeContext = explicitContext || contextFiles;
    
    let systemPrompt = `You are an AI Coding Assistant with ${agentMode === 'agent' ? 'FULL AGENT MODE - You can directly modify code' : 'chat mode'}.

CRITICAL BEHAVIOR:
- When user asks to analyze files, YOU generate Cypher queries to find them
- System auto-executes queries and loads file contents
- You then IMMEDIATELY provide complete analysis using the loaded content
- NEVER ask user to provide file contents
- NEVER say you can't see files - they will be loaded automatically

${agentMode === 'agent' ? `
AGENT EDITING CAPABILITIES:
You can modify files using these formats:

1. SEARCH/REPLACE (for modifications):
file: src/components/Button.tsx
const Button = () => {

2. CREATE NEW FILE:
\`\`\`typescript[src/utils/helpers.ts] create
export function helper() { }
\`\`\`

3. DELETE FILE (mention it and user will confirm)

Always use SEARCH/REPLACE for modifications, never return full files.
` : ''}

RESPONSE RULES:
- Be direct and professional
- Provide complete, thorough analysis
- Use actual code from loaded files
- Never mention internal processes (Neo4j, Cypher, etc.)

${neo4jConnected && graphStored ? 'Graph database is active. Use it.' : 'Limited mode - use only provided context.'}`;

    if (neo4jConnected && graphStored && graphContext) {
      try {
        const savedGraph = localStorage.getItem("codeGraph");
        if (savedGraph) {
          const rawGraph = JSON.parse(savedGraph);
          const graph: CodeGraph = {
            nodes: rawGraph.nodes.map((node: any) => ({
              id: String(node.id),
              type: node.type,
              name: node.name,
              path: node.path,
              language: node.language,
              lines: node.lines,
              ...(node.startLine !== undefined && { startLine: node.startLine }),
              ...(node.endLine !== undefined && { endLine: node.endLine }),
              ...(node.params && { params: node.params }),
              ...(node.source && { source: node.source }),
              ...(node.specifiers && { specifiers: node.specifiers }),
              ...(node.line !== undefined && { line: node.line }),
            })),
            edges: rawGraph.edges.map((edge: any) => ({
              from: String(edge.from),
              to: String(edge.to),
              type: edge.type,
              ...(edge.unresolved !== undefined && { unresolved: edge.unresolved }),
              ...(edge.edgeType && { edgeType: edge.edgeType }),
            })),
            ...(rawGraph.files && { files: rawGraph.files }),
          };

          const queryContext = await invoke<string>("graph_to_query_context", {
            graph,
          });
          systemPrompt += "\n\n" + queryContext;
        }
      } catch (error) {
        console.error("Failed to add graph context:", error);
      }
    }

    if (activeContext.length > 0) {
      systemPrompt += "\n\n=== LOADED FILES ===\n";
      activeContext.forEach((file) => {
        systemPrompt += `\n--- ${file.path} ---\n\`\`\`${file.language}\n${file.content}\n\`\`\`\n`;
      });
      systemPrompt += "\nUSE THESE FILES IN YOUR ANALYSIS.\n";
    }

    return systemPrompt;
  }, [contextFiles, graphContext, neo4jConnected, graphStored, agentMode]);

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
        content: "**Ollama is not connected**\n\nPlease start Ollama to use the AI assistant.",
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
      const systemPrompt = await buildSystemPrompt();
      const chatMessages: ChatMessage[] = [
        { role: "system", content: systemPrompt },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: userMessage },
      ];

      await invoke("chat_with_ollama", {
        model: model,
        messages: chatMessages,
      });

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsg.id ? { ...m, isStreaming: false } : m
        )
      );
    } catch (error) {
      console.error("Chat error:", error);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsg.id
            ? { ...m, content: `**Error**: ${error}`, isStreaming: false }
            : m
        )
      );
    }

    setIsLoading(false);
  };

  const sendMessageWithExplicitContext = async (userMessage: string, explicitContext: FileContext[]) => {
    if (!userMessage.trim() || isLoading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: userMessage,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    if (connectionStatus === "disconnected") {
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "**Ollama is not connected**\n\nPlease start Ollama to use the AI assistant.",
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
      const systemPrompt = await buildSystemPrompt(explicitContext);
      const chatMessages: ChatMessage[] = [
        { role: "system", content: systemPrompt },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: userMessage },
      ];

      await invoke("chat_with_ollama", {
        model: model,
        messages: chatMessages,
      });

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsg.id ? { ...m, isStreaming: false } : m
        )
      );
    } catch (error) {
      console.error("Chat error:", error);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsg.id
            ? { ...m, content: `**Error**: ${error}`, isStreaming: false }
            : m
        )
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
    setPendingEdits([]);
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
    setPendingEdits([]);
  };

  // Generate diff for pending edit
  const generateDiffForEdit = async (edit: PendingEdit): Promise<string> => {
    if (edit.type === 'create') {
      return `--- /dev/null\n+++ ${edit.path}\n@@ -0,0 +1,${edit.modified.split('\n').length} @@\n${edit.modified.split('\n').map(l => '+' + l).join('\n')}`;
    }
    
    try {
      const fileData = await fileTools.readFile(edit.path);
      const oldContent = fileData.content || '';
      return generateDiff(edit.path, oldContent, oldContent.replace(edit.original, edit.modified));
    } catch {
      return `--- ${edit.path}\n+++ ${edit.path}\n@@ -1,1 +1,1 @@\n-${edit.original}\n+${edit.modified}`;
    }
  };

  return (
    <div className="h-full max-h-full flex flex-col bg-[#1e1e1e] overflow-hidden isolate">
      {/* Header with Mode Selector */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#3c3c3c] bg-[#252526] shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-400" />
            <span className="font-medium text-white">AI Assistant</span>
            <AgentModeBadge mode={agentMode} />
            <span
              className={`w-2 h-2 rounded-full ${connectionStatus === "connected"
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
          {/* Agent Mode Toggle */}
          <div className="flex items-center gap-1 bg-[#1e1e1e] rounded-lg p-1 border border-[#3c3c3c]">
            {(['chat', 'agent', 'ask'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setAgentMode(mode)}
                className={`px-3 py-1 rounded text-xs font-medium transition-all ${
                  agentMode === mode 
                    ? mode === 'agent' ? 'bg-purple-600 text-white' : 'bg-[#3c3c3c] text-white'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
          
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

      <div className="px-4 py-1 bg-[#252526] border-b border-[#3c3c3c] text-xs text-gray-500 shrink-0 flex items-center justify-between">
        <span>Model: {model}</span>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={autoApplyEdits}
              onChange={(e) => setAutoApplyEdits(e.target.checked)}
              className="w-3 h-3 rounded border-gray-600"
            />
            <span className={autoApplyEdits ? 'text-green-400' : ''}>Auto-apply edits</span>
          </label>
          {neo4jConnected && graphStored && (
            <span className="text-green-400">• Graph ready</span>
          )}
        </div>
      </div>

      <QuickActions
        onAction={handleQuickAction}
        hasContext={contextFiles.length > 0}
      />

      <div className="flex-1 basis-0 min-h-0 overflow-hidden relative flex flex-col">
        <ScrollArea className="h-full w-full">
          <div className="p-4 min-h-full">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-gray-500 min-h-100">
                <Bot className="w-12 h-12 mb-4 text-purple-400/50" />
                <h3 className="text-lg font-medium text-gray-300 mb-2">
                  AI Coding Assistant
                </h3>
                {agentMode === 'agent' && (
                  <p className="text-sm text-purple-400 mb-4">
                    Agent Mode: I can autonomously modify your code
                  </p>
                )}
                {connectionStatus === "disconnected" && (
                  <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm max-w-md">
                    <p className="font-medium">Ollama not connected</p>
                    <p className="text-xs mt-1">
                      Start Ollama with:{" "}
                      <code className="bg-red-500/20 px-1 rounded">ollama serve</code>
                    </p>
                  </div>
                )}

                {neo4jConnected && graphStored && (
                  <div className="mt-4 p-3 bg-green-500/10 border border-green-500/30 rounded-lg text-green-400 text-sm max-w-md">
                    <p className="font-medium flex items-center gap-2">
                      <CheckCircle className="w-4 h-4" />
                      Graph Database Ready
                    </p>
                    <p className="text-xs mt-1">
                      Try: "Analyze the entire codebase" or "Show me all TypeScript files"
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col">
                <AgentActionsPanel actions={agentActions} />
                <PendingEditsPanel 
                  edits={pendingEdits} 
                  onApply={(id) => applyPendingEdits([id])}
                  onReject={(id) => setPendingEdits(prev => prev.filter(e => e.id !== id))}
                  onViewDiff={async (edit) => {
                    const diff = await generateDiffForEdit(edit);
                    setCurrentDiff({ path: edit.path, diff });
                    setShowDiffModal(true);
                  }}
                  onApplyAll={() => applyPendingEdits()}
                  onRejectAll={() => setPendingEdits([])}
                />
                {messages.map((message) => (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    onApplyCode={handleApplyCode}
                    onCopyCode={handleCopyCode}
                    onExecuteQuery={handleExecuteQuery}
                  />
                ))}
                
                {fileLoadingProgress && (
                  <FileLoadingProgress
                    current={fileLoadingProgress.current}
                    total={fileLoadingProgress.total}
                    currentFile={fileLoadingProgress.currentFile}
                  />
                )}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      <div className="relative border-t border-[#3c3c3c] bg-[#252526] p-3 shrink-0">
        <SettingsPanel
          model={model}
          setModel={setModel}
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
        />
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder={
                connectionStatus === "disconnected"
                  ? "Ollama not connected..."
                  : agentMode === 'agent'
                    ? "Tell me what to build or modify..."
                    : "Ask about your code..."
              }
              className="w-full bg-[#1e1e1e] border border-[#3c3c3c] rounded-lg px-4 py-3 pr-12 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 resize-none"
              rows={2}
              disabled={isLoading}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || isLoading}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg text-white transition-colors"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : agentMode === 'agent' ? (
                <Wand2 className="w-4 h-4" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
        <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
          <span>
            {agentMode === 'agent' 
              ? "Agent Mode: Enter to plan and execute changes"
              : "Press Enter to send, Shift+Enter for new line"
            }
          </span>
          <div className="flex items-center gap-2">
            <span>{contextFiles.length} files in context</span>
            {pendingEdits.filter(e => !e.applied).length > 0 && (
              <span className="text-yellow-400">
                • {pendingEdits.filter(e => !e.applied).length} pending edits
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Diff Modal */}
      <DiffModal
        isOpen={showDiffModal}
        onClose={() => setShowDiffModal(false)}
        path={currentDiff?.path || ''}
        diff={currentDiff?.diff || ''}
      />
    </div>
  );
}