// src/components/chat/ChatInterface.tsx
import { useState, useRef, useEffect, useCallback } from "react";
import { useEditor } from "@/context/EditorContext";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ScrollArea } from "../ui/scroll-area";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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
  Edit3,
  Zap,
  Brain,
  FileSearch,
  Scan,
  FileText,
  Layers,
  MessageSquare,
  GitBranch,
  Cpu
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
  type: 'search' | 'read' | 'edit' | 'write' | 'create' | 'rename' | 'delete' | 'analyze' | 'query';
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  description: string;
  result?: any;
  timestamp: Date;
}

interface AgentStep {
  id: string;
  type: 'thinking' | 'searching' | 'reading' | 'analyzing' | 'editing' | 'executing' | 'planning';
  message: string;
  status: 'active' | 'complete' | 'error';
  timestamp: Date;
  details?: string;
}

interface PlanStep {
  id: string;
  description: string;
  status: 'pending' | 'approved' | 'rejected' | 'in-progress' | 'completed';
  filePath?: string;
  editType?: 'modify' | 'create' | 'delete';
}

interface AgentPlan {
  id: string;
  title: string;
  description: string;
  steps: PlanStep[];
  createdAt: Date;
  status: 'draft' | 'approved' | 'executing' | 'completed' | 'rejected';
}

// Agent modes
type AgentMode = 'chat' | 'agent' | 'ask';

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

  // Parse Create file blocks - IMPROVED REGEX
  const createRegex = /```(\w*)\s*\[([^\]]+\.(ts|tsx|js|jsx|py|rs|go|java|cpp|c|h|html|css|json|md))\]\s*create\n([\s\S]*?)```/g;
  while ((match = createRegex.exec(content)) !== null) {
    edits.push({
      id: `edit-${Date.now()}-${Math.random()}`,
      path: match[2],
      original: '',
      modified: match[4].trim(),
      description: 'Create new file',
      applied: false,
      type: 'create'
    });
  }

  // Also try simpler pattern without language tag
  const simpleCreateRegex = /```\s*\[([^\]]+\.(ts|tsx|js|jsx|py|rs|go|java|cpp|c|h|html|css|json|md))\]\s*create\n([\s\S]*?)```/g;
  while ((match = simpleCreateRegex.exec(content)) !== null) {
    // Check if we already added this edit
    const path = match[1];
    if (!edits.some(e => e.path === path && e.type === 'create')) {
      edits.push({
        id: `edit-${Date.now()}-${Math.random()}`,
        path: path,
        original: '',
        modified: match[3].trim(),
        description: 'Create new file',
        applied: false,
        type: 'create'
      });
    }
  }

  return edits;
}

// Markdown Components
const MarkdownComponents = {
  code({ node, inline, className, children, ...props }: any) {
    const match = /language-(\w+)/.exec(className || '');
    const language = match ? match[1] : 'plaintext';
    const code = String(children).replace(/\n$/, '');

    if (inline) {
      return (
        <code className="chat-surface-2 px-1.5 py-0.5 rounded text-sm font-mono text-emerald-300 border chat-border" {...props}>
          {children}
        </code>
      );
    }

    return (
      <div className="my-2 rounded-xl border chat-border chat-surface-2 overflow-hidden shadow-lg">
        <div className="flex items-center justify-between px-3 py-2 chat-surface border-b chat-border">
          <div className="flex items-center gap-2">
            <FileCode className="w-4 h-4 text-blue-400" />
            <span className="text-xs text-gray-400 font-mono">{language}</span>
          </div>
          <button
            onClick={() => navigator.clipboard.writeText(code)}
            className="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-white transition-colors"
          >
            <Copy className="w-3 h-3" />
          </button>
        </div>
        <pre className="p-3 overflow-x-auto text-sm max-h-96 overflow-y-auto custom-scrollbar">
          <code className={`${className} font-mono whitespace-pre text-gray-200`} {...props}>
            {children}
          </code>
        </pre>
      </div>
    );
  },
  p({ children }: any) {
    return <p className="mb-4 last:mb-0 leading-relaxed break-words">{children}</p>;
  },
  h1({ children }: any) {
    return <h1 className="text-xl font-bold mb-4 text-white border-b border-[#3c3c3c] pb-2">{children}</h1>;
  },
  h2({ children }: any) {
    return <h2 className="text-lg font-bold mb-3 text-white mt-6">{children}</h2>;
  },
  h3({ children }: any) {
    return <h3 className="text-base font-semibold mb-2 text-gray-300 mt-4">{children}</h3>;
  },
  ul({ children }: any) {
    return <ul className="list-disc list-inside mb-4 space-y-1 text-gray-300">{children}</ul>;
  },
  ol({ children }: any) {
    return <ol className="list-decimal list-inside mb-4 space-y-1 text-gray-300">{children}</ol>;
  },
  li({ children }: any) {
    return <li className="ml-2 break-words">{children}</li>;
  },
  blockquote({ children }: any) {
    return (
      <blockquote className="border-l-4 border-emerald-500/70 pl-4 py-2 my-4 chat-surface rounded-r text-gray-300 italic">
        {children}
      </blockquote>
    );
  },
  table({ children }: any) {
    return (
      <div className="overflow-x-auto my-4">
        <table className="w-full border-collapse border border-[#3c3c3c] text-sm">
          {children}
        </table>
      </div>
    );
  },
  thead({ children }: any) {
    return <thead className="bg-[#2d2d2d]">{children}</thead>;
  },
  th({ children }: any) {
    return <th className="border border-[#3c3c3c] px-3 py-2 text-left font-semibold text-gray-300">{children}</th>;
  },
  td({ children }: any) {
    return <td className="border border-[#3c3c3c] px-3 py-2 text-gray-400">{children}</td>;
  },
  hr() {
    return <hr className="border-[#3c3c3c] my-6" />;
  },
  a({ children, href }: any) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
        {children}
      </a>
    );
  },
  strong({ children }: any) {
    return <strong className="font-bold text-white">{children}</strong>;
  },
  em({ children }: any) {
    return <em className="italic text-gray-300">{children}</em>;
  },
  del({ children }: any) {
    return <del className="line-through text-gray-500">{children}</del>;
  },
};

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
    <div className="my-2 rounded-xl border chat-border chat-surface-2 overflow-hidden shadow-lg w-full min-w-0">
      <div className="flex items-center justify-between px-3 py-2 chat-surface border-b chat-border">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1 hover:bg-white/10 rounded shrink-0 transition-colors"
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
          <span className="text-sm text-gray-300 truncate font-medium">
            {block.fileName || block.language}
          </span>
          {block.fileName && (
            <span className="text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 shrink-0 font-medium">
              {block.action === "create" ? "NEW" : "EDIT"}
            </span>
          )}
          {isCypher && (
            <span className="text-xs px-2 py-0.5 rounded bg-green-500/20 text-green-400 shrink-0 font-medium">
              QUERY
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
              className="px-2 py-1 text-xs bg-green-600 hover:bg-green-700 rounded text-white transition-colors flex items-center gap-1 font-medium"
            >
              <PlayCircle className="w-3 h-3" />
              Execute
            </button>
          )}
          {block.fileName && onApply && (
            <button
              onClick={() => onApply(block)}
              className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 rounded text-white transition-colors flex items-center gap-1 font-medium"
            >
              <FileEdit className="w-3 h-3" />
              Apply
            </button>
          )}
        </div>
      </div>
      {expanded && (
        <pre className="p-3 overflow-x-auto text-sm max-h-96 overflow-y-auto custom-scrollbar">
          <code className="text-gray-200 font-mono whitespace-pre">
            {block.code}
          </code>
        </pre>
      )}
    </div>
  );
}

// Agent Step Visualization (Cursor/Replit style)
function AgentStepCard({ step }: { step: AgentStep }) {
  const getIcon = () => {
    switch (step.type) {
      case 'thinking':
        return <Brain className="w-4 h-4" />;
      case 'searching':
        return <FileSearch className="w-4 h-4" />;
      case 'reading':
        return <FileText className="w-4 h-4" />;
      case 'analyzing':
        return <Scan className="w-4 h-4" />;
      case 'editing':
        return <Edit3 className="w-4 h-4" />;
      case 'executing':
        return <Zap className="w-4 h-4" />;
      case 'planning':
        return <GitBranch className="w-4 h-4" />;
      default:
        return <Layers className="w-4 h-4" />;
    }
  };

  const getColor = () => {
    if (step.status === 'error') return 'text-red-400';
    if (step.status === 'complete') return 'text-green-400';
    return 'text-blue-400';
  };

  const getBgColor = () => {
    if (step.status === 'error') return 'bg-red-500/10 border-red-500/30';
    if (step.status === 'complete') return 'bg-green-500/10 border-green-500/30';
    return 'bg-blue-500/10 border-blue-500/30';
  };

  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg border ${getBgColor()} transition-all duration-300 animate-slide-in`}>
      <div className={`${getColor()} mt-0.5 shrink-0`}>
        {step.status === 'active' ? (
          <div className="relative">
            <div className="absolute inset-0 animate-ping opacity-75">
              {getIcon()}
            </div>
            {getIcon()}
          </div>
        ) : step.status === 'complete' ? (
          <CheckCircle className="w-4 h-4" />
        ) : step.status === 'error' ? (
          <AlertCircle className="w-4 h-4" />
        ) : (
          getIcon()
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className={`text-sm font-medium ${getColor()}`}>{step.message}</p>
          {step.status === 'active' && (
            <div className="flex gap-1">
              <div className="w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          )}
        </div>
        {step.details && (
          <p className="text-xs text-gray-400 mt-1 font-mono truncate">{step.details}</p>
        )}
      </div>
    </div>
  );
}

// Cypher Query Animation
function CypherQueryAnimation({ query, onComplete }: { query: string; onComplete?: () => void }) {
  const [progress, setProgress] = useState(0);
  const steps = [
    'Parsing query...',
    'Analyzing graph structure...',
    'Executing traversal...',
    'Collecting results...',
    'Complete!'
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress(prev => {
        const next = prev + 1;
        if (next >= steps.length) {
          clearInterval(interval);
          setTimeout(() => onComplete?.(), 500);
          return steps.length - 1;
        }
        return next;
      });
    }, 400);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="my-3 p-4 rounded-lg bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/30 animate-slide-in">
      <div className="flex items-center gap-3 mb-3">
        <div className="relative">
          <Database className="w-5 h-5 text-purple-400" />
          <div className="absolute inset-0 animate-ping opacity-50">
            <Database className="w-5 h-5 text-purple-400" />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-purple-300">Executing Graph Query</p>
          <p className="text-xs text-purple-400/70 mt-0.5">{steps[progress]}</p>
        </div>
      </div>
      <div className="w-full bg-purple-900/30 rounded-full h-1.5 overflow-hidden">
        <div
          className="bg-gradient-to-r from-purple-500 to-blue-500 h-1.5 transition-all duration-500 ease-out"
          style={{ width: `${((progress + 1) / steps.length) * 100}%` }}
        />
      </div>
      <pre className="mt-3 p-2 bg-black/30 rounded text-xs text-purple-300 font-mono overflow-x-auto max-h-20 custom-scrollbar">
        {query}
      </pre>
    </div>
  );
}

// File Reading Animation
function FileReadingAnimation({
  current,
  total,
  currentFile
}: {
  current: number;
  total: number;
  currentFile: string;
}) {
  const progress = (current / total) * 100;

  return (
    <div className="my-3 p-4 rounded-lg bg-gradient-to-r from-blue-500/10 to-cyan-500/10 border border-blue-500/30 animate-slide-in">
      <div className="flex items-start gap-3 mb-3">
        <div className="relative mt-0.5">
          <FileSearch className="w-5 h-5 text-blue-400" />
          <div className="absolute inset-0 animate-pulse opacity-50">
            <FileSearch className="w-5 h-5 text-blue-400" />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-medium text-blue-300">Reading files...</p>
            <span className="text-xs text-blue-400 font-mono">{current}/{total}</span>
          </div>
          <div className="w-full bg-blue-900/30 rounded-full h-2 overflow-hidden mb-2">
            <div
              className="bg-gradient-to-r from-blue-500 to-cyan-500 h-2 transition-all duration-300 ease-out relative"
              style={{ width: `${progress}%` }}
            >
              <div className="absolute inset-0 bg-white/20 animate-shimmer" />
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-blue-400/80">
            <FileText className="w-3 h-3 shrink-0" />
            <p className="truncate font-mono">{currentFile}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Plan Display Component
function PlanDisplay({
  plan,
  onApprove,
  onReject,
  onModify
}: {
  plan: AgentPlan;
  onApprove: () => void;
  onReject: () => void;
  onModify: (stepId: string, newDescription: string) => void;
}) {
  const [editingStep, setEditingStep] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const getStatusIcon = (status: PlanStep['status']) => {
    switch (status) {
      case 'approved': return <CheckCircle className="w-4 h-4 text-green-400" />;
      case 'rejected': return <X className="w-4 h-4 text-red-400" />;
      case 'in-progress': return <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />;
      case 'completed': return <Check className="w-4 h-4 text-green-400" />;
      default: return <div className="w-4 h-4 rounded-full border-2 border-gray-500" />;
    }
  };

  return (
    <div className="my-4 p-4 rounded-xl chat-surface-2 border chat-border animate-slide-in">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <GitBranch className="w-5 h-5 text-emerald-400" />
          <h3 className="text-sm font-semibold text-gray-100">{plan.title}</h3>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full font-medium ${plan.status === 'draft' ? 'bg-emerald-500/10 text-emerald-400' :
          plan.status === 'approved' ? 'bg-green-500/20 text-green-400' :
            plan.status === 'rejected' ? 'bg-red-500/20 text-red-400' :
              'bg-blue-500/20 text-blue-400'
          }`}>
          {plan.status.toUpperCase()}
        </span>
      </div>

      <p className="text-sm text-gray-300 mb-4 whitespace-pre-wrap break-words">{plan.description}</p>

      <div className="space-y-2 mb-4">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Planned Steps</h4>
        {plan.steps.map((step, index) => (
          <div key={step.id} className="flex items-start gap-3 p-2 chat-surface rounded-lg border chat-border min-w-0">
            <span className="text-xs text-gray-500 font-mono mt-0.5">{index + 1}</span>
            <div className="flex-1 min-w-0">
              {editingStep === step.id ? (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    className="flex-1 chat-surface-2 border chat-border rounded px-2 py-1 text-sm text-white"
                    autoFocus
                  />
                  <button
                    onClick={() => {
                      onModify(step.id, editValue);
                      setEditingStep(null);
                    }}
                    className="p-1 text-green-400 hover:bg-green-500/20 rounded"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-2 min-w-0">
                  <div className="flex items-start gap-2 min-w-0 flex-1">
                    {getStatusIcon(step.status)}
                    <span className={`text-sm break-words whitespace-pre-wrap ${step.status === 'rejected' ? 'line-through text-gray-500' : 'text-gray-300'
                      }`}>
                      {step.description}
                    </span>
                    {step.filePath && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 font-mono shrink-0 max-w-[50%] truncate">
                        {step.filePath.split(/[\\/]/).pop()}
                      </span>
                    )}
                  </div>
                  {plan.status === 'draft' && (
                    <button
                      onClick={() => {
                        setEditingStep(step.id);
                        setEditValue(step.description);
                      }}
                      className="p-1 text-gray-500 hover:text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    >
                      <Edit3 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {plan.status === 'draft' && (
        <div className="flex gap-2">
          <button
            onClick={onApprove}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 chat-button rounded-full text-white text-sm font-medium transition-colors"
          >
            <CheckCircle className="w-4 h-4" />
            Approve Plan
          </button>
          <button
            onClick={onReject}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-full text-white text-sm font-medium transition-colors"
          >
            <X className="w-4 h-4" />
            Reject
          </button>
        </div>
      )}
    </div>
  );
}

function MessageBubble({
  message,
  onApplyCode,
  onCopyCode,
  onExecuteQuery,
  agentSteps,
  isPlanning,
  currentPlan,
  onApprovePlan,
  onRejectPlan,
  onModifyPlanStep,
}: {
  message: Message;
  onApplyCode: (block: CodeBlock) => void;
  onCopyCode: (code: string) => void;
  onExecuteQuery: (query: string) => void;
  agentSteps?: AgentStep[];
  isPlanning?: boolean;
  currentPlan?: AgentPlan | null;
  onApprovePlan?: () => void;
  onRejectPlan?: () => void;
  onModifyPlanStep?: (stepId: string, newDescription: string) => void;
}) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";
  const textContent = formatMessageContent(message.content);
  const codeBlocks = extractCodeBlocks(message.content).filter(b => b.language !== 'cypher');

  if (isSystem) {
    return (
      <div className="flex justify-center mb-4 shrink-0 animate-slide-in w-full min-w-0">
        <div className="px-4 py-2 chat-surface-2 rounded-full text-sm chat-muted border chat-border max-w-[90%] break-words">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""} mb-4 shrink-0 animate-slide-in w-full min-w-0`}
    >
      <div
        className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center shadow-lg ${isUser ? "bg-gradient-to-br from-blue-500 to-blue-600" : "bg-gradient-to-br from-purple-500 to-purple-600"
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
        {/* Agent Steps */}
        {!isUser && agentSteps && agentSteps.length > 0 && (
          <div className="mb-3 space-y-2 w-full">
            {agentSteps.map((step) => (
              <AgentStepCard key={step.id} step={step} />
            ))}
          </div>
        )}

        {/* Plan Display */}
        {!isUser && isPlanning && currentPlan && onApprovePlan && onRejectPlan && (
          <div className="w-full mb-3">
            <PlanDisplay
              plan={currentPlan}
              onApprove={onApprovePlan}
              onReject={onRejectPlan}
              onModify={onModifyPlanStep || (() => { })}
            />
          </div>
        )}

        {/* Message Content with Markdown */}
        {(textContent || message.content) && (
          <div
            className={`rounded-2xl px-4 py-3 break-words shadow-sm max-w-full ${isUser
              ? "bg-[#2f80ed] text-white"
              : "chat-surface-2 text-gray-200 border chat-border"
              }`}
          >
            {isUser ? (
              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                {message.content}
              </p>
            ) : (
              <div className="prose prose-invert prose-sm max-w-full">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={MarkdownComponents}
                >
                  {message.content}
                </ReactMarkdown>
              </div>
            )}
            {message.isStreaming && (
              <span className="inline-block w-2 h-4 bg-current animate-pulse ml-1" />
            )}
          </div>
        )}

        {/* Code Blocks */}
        {codeBlocks.length > 0 && (
          <div className="mt-2 w-full max-w-full space-y-2">
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
    <div className="absolute bottom-full left-0 right-0 mb-2 bg-[#2d2d2d] border border-[#3c3c3c] rounded-lg p-4 shadow-xl z-50 animate-slide-in">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-white">Settings</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="space-y-3">
        <div>
          <label className="text-xs text-gray-400 block mb-1 font-medium">Model</label>
          <div className="flex gap-2">
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="flex-1 bg-[#1e1e1e] border border-[#3c3c3c] rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
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
              className="p-1.5 bg-[#1e1e1e] border border-[#3c3c3c] rounded hover:bg-white/10 transition-colors"
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
          <code className="bg-[#1e1e1e] px-1 rounded font-mono">ollama serve</code>
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
    { icon: Code, label: "Explain", prompt: "Explain this code in detail:", color: "blue" },
    {
      icon: FileEdit,
      label: "Refactor",
      prompt: "Refactor this code to be cleaner and more efficient:",
      color: "purple"
    },
    {
      icon: Terminal,
      label: "Add tests",
      prompt: "Write unit tests for this code:",
      color: "green"
    },
    {
      icon: Sparkles,
      label: "Optimize",
      prompt: "Optimize this code for better performance:",
      color: "yellow"
    },
  ];

  return (
    <div className="flex gap-2 px-3 py-2 border-b border-[#3c3c3c] overflow-x-auto shrink-0 custom-scrollbar">
      {actions.map((action) => (
        <button
          key={action.label}
          onClick={() => onAction(action.prompt)}
          disabled={!hasContext}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition-all shrink-0 font-medium ${hasContext
            ? "bg-[#3c3c3c] hover:bg-[#4c4c4c] text-gray-300 hover:scale-105"
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
        className="flex items-center gap-2 px-3 py-1.5 bg-[#3c3c3c] hover:bg-[#4c4c4c] rounded text-sm text-gray-300 transition-colors font-medium"
      >
        <FolderOpen className="w-4 h-4" />
        <span>Chats</span>
        <ChevronDown
          className={`w-4 h-4 transition-transform ${showList ? "rotate-180" : ""}`}
        />
      </button>

      {showList && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-[#2d2d2d] border border-[#3c3c3c] rounded-lg shadow-xl z-50 max-h-64 overflow-y-auto custom-scrollbar animate-slide-in">
          <button
            onClick={() => {
              onNew();
              setShowList(false);
            }}
            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/10 text-sm text-gray-300 border-b border-[#3c3c3c] transition-colors font-medium"
          >
            <Plus className="w-4 h-4" />
            New conversation
          </button>
          {conversations.map((conv) => (
            <div
              key={conv.id}
              className={`flex items-center justify-between px-3 py-2 hover:bg-white/10 cursor-pointer transition-colors ${currentId === conv.id ? "bg-white/10" : ""
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
                className="p-1 hover:bg-red-500/20 rounded text-gray-500 hover:text-red-400 shrink-0 transition-colors"
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

// Pending Edits Panel
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
    <div className="mb-4 p-3 bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border border-yellow-500/30 rounded-lg animate-slide-in">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-medium text-yellow-400 flex items-center gap-2">
          <Edit3 className="w-4 h-4" />
          Pending Changes ({pendingCount})
        </h4>
        <div className="flex gap-2">
          <button
            onClick={onApplyAll}
            className="text-xs px-2 py-1 bg-green-600 hover:bg-green-700 rounded text-white transition-colors font-medium"
          >
            Apply All
          </button>
          <button
            onClick={onRejectAll}
            className="text-xs px-2 py-1 bg-red-600 hover:bg-red-700 rounded text-white transition-colors font-medium"
          >
            Reject All
          </button>
        </div>
      </div>
      <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
        {edits.filter(e => !e.applied).map((edit) => (
          <div key={edit.id} className="flex items-center justify-between p-2 bg-[#2d2d2d] rounded text-xs border border-[#3c3c3c] hover:border-yellow-500/50 transition-colors">
            <div className="flex items-center gap-2 overflow-hidden">
              {edit.type === 'create' ? (
                <FilePlus className="w-3 h-3 text-green-400 shrink-0" />
              ) : edit.type === 'delete' ? (
                <FileX className="w-3 h-3 text-red-400 shrink-0" />
              ) : (
                <Edit3 className="w-3 h-3 text-blue-400 shrink-0" />
              )}
              <span className="text-gray-300 truncate font-mono">{edit.path.split(/[\\/]/).pop()}</span>
              <span className="text-gray-500 truncate">{edit.description}</span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => onViewDiff(edit)}
                className="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-white transition-colors"
                title="View diff"
              >
                <Eye className="w-3 h-3" />
              </button>
              <button
                onClick={() => onApply(edit.id)}
                className="p-1 hover:bg-green-500/20 rounded text-green-400 hover:text-green-300 transition-colors"
                title="Apply"
              >
                <Check className="w-3 h-3" />
              </button>
              <button
                onClick={() => onReject(edit.id)}
                className="p-1 hover:bg-red-500/20 rounded text-red-400 hover:text-red-300 transition-colors"
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

// Diff Modal
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
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-[#1e1e1e] border border-[#3c3c3c] rounded-lg w-full max-w-4xl max-h-[80vh] flex flex-col shadow-2xl animate-scale-in">
        <div className="flex items-center justify-between p-4 border-b border-[#3c3c3c]">
          <h3 className="text-white font-medium flex items-center gap-2">
            <FileEdit className="w-5 h-5 text-blue-400" />
            Changes to {path.split(/[\\/]/).pop()}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-4 custom-scrollbar">
          <pre className="text-sm font-mono whitespace-pre-wrap">
            {diff.split('\n').map((line, idx) => (
              <div key={idx} className={`px-2 py-0.5 ${line.startsWith('+') ? 'text-green-400 bg-green-400/10' : ''
                }${line.startsWith('-') ? 'text-red-400 bg-red-400/10' : ''
                }${line.startsWith('@@') ? 'text-blue-400 bg-blue-400/10 font-bold' : ''
                }`}>
                {line}
              </div>
            ))}
          </pre>
        </div>
        <div className="p-4 border-t border-[#3c3c3c] flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-300 hover:bg-white/10 rounded transition-colors font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// Agent Mode Badge
function AgentModeBadge({ mode }: { mode: AgentMode }) {
  const config = {
    chat: { color: 'bg-gray-600', label: 'CHAT', icon: MessageSquare },
    agent: { color: 'bg-gradient-to-r from-purple-600 to-purple-700', label: 'AGENT', icon: Cpu },
    ask: { color: 'bg-gradient-to-r from-blue-600 to-blue-700', label: 'ASK', icon: Search }
  };

  const Icon = config[mode].icon;

  return (
    <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded text-white font-bold ${config[mode].color} shadow-md`}>
      <Icon className="w-3 h-3" />
      {config[mode].label}
    </span>
  );
}

// Main Component
export default function ChatInterface() {
  const { selectedFile, fileContent, setFileContent } = useEditor();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [contextFiles, setContextFiles] = useState<FileContext[]>([]);
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [showSettings, setShowSettings] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"connected" | "disconnected" | "checking">("checking");
  const [conversations, setConversations] = useState<{ id: string; title: string; timestamp: Date; messages: Message[] }[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [neo4jConnected, setNeo4jConnected] = useState(false);
  const [graphStored, setGraphStored] = useState(false);
  const [graphContext, setGraphContext] = useState<GraphContext | null>(null);

  // Agent mode state
  const [agentMode, setAgentMode] = useState<AgentMode>('agent');
  const [pendingEdits, setPendingEdits] = useState<PendingEdit[]>([]);
  const [autoApplyEdits, setAutoApplyEdits] = useState(true); // Changed default to true
  const [showDiffModal, setShowDiffModal] = useState(false);
  const [currentDiff, setCurrentDiff] = useState<{ path: string; diff: string } | null>(null);

  // Planning state
  const [currentPlan, setCurrentPlan] = useState<AgentPlan | null>(null);
  const [isPlanning, setIsPlanning] = useState(false);
  const [planApprovalMessageId, setPlanApprovalMessageId] = useState<string | null>(null);

  // Animation state
  const [agentSteps, setAgentSteps] = useState<Map<string, AgentStep[]>>(new Map());
  const [activeQuery, setActiveQuery] = useState<string | null>(null);
  const [fileReadingProgress, setFileReadingProgress] = useState<{
    current: number;
    total: number;
    currentFile: string;
  } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastAutoExecutedId = useRef<string | null>(null);
  const [isAutoExecuting, setIsAutoExecuting] = useState(false);

  // Check if query is asking for analysis
  const isAnalysisQuery = useCallback((query: string): boolean => {
    const analysisKeywords = [
      'analyze', 'analysis', 'understand', 'explain', 'review',
      'examine', 'inspect', 'study', 'assess', 'evaluate',
      'what does', 'how does', 'show me', 'find', 'search for'
    ];
    const lowerQuery = query.toLowerCase();
    return analysisKeywords.some(keyword => lowerQuery.includes(keyword));
  }, []);

  // Check if query is asking for modification
  const isModificationQuery = useCallback((query: string): boolean => {
    const modificationKeywords = [
      'modify', 'change', 'update', 'edit', 'fix', 'refactor',
      'improve', 'optimize', 'add', 'remove', 'delete', 'create',
      'implement', 'write', 'generate', 'build', 'make', 'new file'
    ];
    const lowerQuery = query.toLowerCase();
    return modificationKeywords.some(keyword => lowerQuery.includes(keyword));
  }, []);

  // Listen for Cypher logs
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

  // CRITICAL FIX: Apply edits directly without relying on pendingEdits state
  const applyEditsDirectly = async (edits: PendingEdit[]) => {
    console.log(`Applying ${edits.length} edits directly...`, edits);
    
    for (const edit of edits) {
      try {
        if (edit.type === 'create') {
          console.log("Creating file:", edit.path);
          console.log("Content length:", edit.modified.length);
          
          // DIRECT INVOKE TO TAURI BACKEND
          await invoke("create_file", {
            path: edit.path,
            content: edit.modified
          });
          
          // Update pending edits status
          setPendingEdits(prev => prev.map(e => 
            e.id === edit.id ? { ...e, applied: true } : e
          ));

          // Add system message
          const successMsg: Message = {
            id: Date.now().toString(),
            role: "system",
            content: `✅ Created file: ${edit.path}`,
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, successMsg]);

          // Refresh directory if needed
          const event = new CustomEvent('refresh-directory');
          window.dispatchEvent(event);

        } else if (edit.type === 'search_replace') {
          console.log("Applying search/replace to:", edit.path);
          
          // Read current content
          const fileData = await fileTools.readFile(edit.path);
          if (fileData.error) {
            throw new Error(fileData.error);
          }

          // Apply the replacement
          const newContent = fileData.content.replace(edit.original, edit.modified);
          
          // DIRECT INVOKE TO TAURI BACKEND
          await invoke("write_file_content", {
            path: edit.path,
            content: newContent
          });

          // Update pending edits
          setPendingEdits(prev => prev.map(e => 
            e.id === edit.id ? { ...e, applied: true } : e
          ));

          // Add system message
          const successMsg: Message = {
            id: Date.now().toString(),
            role: "system",
            content: `✅ Modified file: ${edit.path}`,
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, successMsg]);

          // Update context if file was in context
          if (selectedFile === edit.path) {
            setFileContent(newContent);
          }

        } else if (edit.type === 'delete') {
          console.log("Deleting file:", edit.path);
          
          // DIRECT INVOKE TO TAURI BACKEND
          await invoke("delete_file", { path: edit.path });
          
          setPendingEdits(prev => prev.map(e => 
            e.id === edit.id ? { ...e, applied: true } : e
          ));

          const successMsg: Message = {
            id: Date.now().toString(),
            role: "system",
            content: `✅ Deleted file: ${edit.path}`,
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, successMsg]);
        }
      } catch (error) {
        console.error("Failed to apply edit:", error);
        
        const errorMsg: Message = {
          id: Date.now().toString(),
          role: "system",
          content: `❌ Failed to apply edit to ${edit.path}: ${error}`,
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, errorMsg]);
      }
    }
  };

  // Apply pending edits using the direct method
  const applyPendingEdits = async (editIds?: string[]) => {
    const toApply = editIds
      ? pendingEdits.filter(e => editIds.includes(e.id) && !e.applied)
      : pendingEdits.filter(e => !e.applied);

    await applyEditsDirectly(toApply);
  };

  // Auto-execute Cypher queries and handle plans - FIXED VERSION
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });

    const processAssistantMessage = async () => {
      const lastMsg = messages[messages.length - 1];
      if (!lastMsg || lastMsg.role !== 'assistant' || lastMsg.isStreaming || isAutoExecuting) return;

      if (lastAutoExecutedId.current === lastMsg.id) return;

      // Check for plan in message
      if (lastMsg.content.includes('PLAN:') && isPlanning) {
        return;
      }

      const blocks = extractCodeBlocks(lastMsg.content);
      const cypherBlock = blocks.find(b => b.language === 'cypher');

      if (cypherBlock && agentMode === 'agent') {
        console.log("Auto-executing Cypher block detected...");
        lastAutoExecutedId.current = lastMsg.id;
        setIsAutoExecuting(true);
        setActiveQuery(cypherBlock.code);

        try {
          await handleExecuteQuery(cypherBlock.code, true);
        } catch (e) {
          console.error("Auto-execution failed", e);
        }

        setActiveQuery(null);
        setIsAutoExecuting(false);
      }

      // Parse and queue edit blocks - CRITICAL FIX
      const edits = parseEditBlocks(lastMsg.content);
      console.log("Parsed edits from message:", edits);
      
      if (edits.length > 0) {
        // Add to pending first for UI display
        setPendingEdits(prev => [...prev, ...edits]);
        
        // Then apply them immediately using the edits we just parsed
        if (autoApplyEdits) {
          console.log("Auto-applying edits...", edits);
          await applyEditsDirectly(edits);
        }
      }
    };

    processAssistantMessage();
  }, [messages, isAutoExecuting, autoApplyEdits, agentMode, isPlanning]);

  // Update context when selected file changes
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

  // Helper to add agent step
  const addAgentStep = useCallback((messageId: string, step: Omit<AgentStep, 'id' | 'timestamp'>) => {
    const newStep: AgentStep = {
      ...step,
      id: `${Date.now()}-${Math.random()}`,
      timestamp: new Date()
    };

    setAgentSteps(prev => {
      const steps = prev.get(messageId) || [];
      return new Map(prev).set(messageId, [...steps, newStep]);
    });
  }, []);

  // Helper to update last agent step
  const updateLastAgentStep = useCallback((messageId: string, updates: Partial<AgentStep>) => {
    setAgentSteps(prev => {
      const steps = prev.get(messageId) || [];
      if (steps.length === 0) return prev;

      const updated = [...steps];
      updated[updated.length - 1] = { ...updated[updated.length - 1], ...updates };
      return new Map(prev).set(messageId, updated);
    });
  }, []);

  // Parse plan from AI response
  const parsePlanFromResponse = (content: string): AgentPlan | null => {
    const planMatch = content.match(/PLAN:\s*([\s\S]*?)(?=\n\n|\n###|\n##|$)/);
    if (!planMatch) return null;

    const planText = planMatch[1].trim();
    const steps: PlanStep[] = [];

    // Parse numbered steps
    const stepMatches = planText.match(/(\d+)\.\s*(.+?)(?=\n\d+\.|\n\n|$)/gs);
    if (stepMatches) {
      stepMatches.forEach((match, idx) => {
        const stepMatch = match.match(/(\d+)\.\s*(.+)/s);
        if (stepMatch) {
          steps.push({
            id: `step-${idx}`,
            description: stepMatch[2].trim(),
            status: 'pending'
          });
        }
      });
    }

    if (steps.length === 0) return null;

    return {
      id: `plan-${Date.now()}`,
      title: 'Code Modification Plan',
      description: planText.split('\n')[0],
      steps,
      createdAt: new Date(),
      status: 'draft'
    };
  };

  // Handle plan approval
  const handleApprovePlan = useCallback(() => {
    if (!currentPlan) return;

    setCurrentPlan(prev => prev ? { ...prev, status: 'approved' } : null);
    setIsPlanning(false);

    // Continue with execution
    const assistantMsg: Message = {
      id: (Date.now() + 1).toString(),
      role: "assistant",
      content: "Plan approved! Proceeding with execution...",
      timestamp: new Date(),
      isStreaming: false,
    };

    setMessages(prev => [...prev, assistantMsg]);

    // Trigger the actual modification
    sendMessageWithExplicitContext(
      "Execute the approved plan now. Make the changes to the files.",
      contextFiles
    );
  }, [currentPlan, contextFiles]);

  // Handle plan rejection
  const handleRejectPlan = useCallback(() => {
    if (!currentPlan) return;

    setCurrentPlan(prev => prev ? { ...prev, status: 'rejected' } : null);
    setIsPlanning(false);

    const assistantMsg: Message = {
      id: (Date.now() + 1).toString(),
      role: "assistant",
      content: "Plan rejected. Let me know if you'd like to try a different approach.",
      timestamp: new Date(),
      isStreaming: false,
    };

    setMessages(prev => [...prev, assistantMsg]);
  }, [currentPlan]);

  // Handle plan step modification
  const handleModifyPlanStep = useCallback((stepId: string, newDescription: string) => {
    setCurrentPlan(prev => {
      if (!prev) return null;
      return {
        ...prev,
        steps: prev.steps.map(step =>
          step.id === stepId ? { ...step, description: newDescription } : step
        )
      };
    });
  }, []);

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

    const messageId = messages[messages.length - 1]?.id;

    // Add searching step
    if (messageId) {
      addAgentStep(messageId, {
        type: 'searching',
        message: 'Searching codebase graph',
        status: 'active',
        details: 'Querying Neo4j for relevant files...'
      });
    }

    try {
      const result = await invoke<CypherQueryResult>("execute_cypher_query", {
        cypher: query,
      });

      // Mark searching as complete
      if (messageId) {
        updateLastAgentStep(messageId, { status: 'complete' });
      }

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

          // Add reading step
          if (messageId) {
            addAgentStep(messageId, {
              type: 'reading',
              message: `Reading ${paths.length} files`,
              status: 'active'
            });
          }

          const fileDataList = await fileTools.readFiles(paths, (current, total, currentPath) => {
            setFileReadingProgress({
              current,
              total,
              currentFile: currentPath.split(/[\\/]/).pop() || currentPath
            });
          });

          setFileReadingProgress(null);

          // Mark reading as complete
          if (messageId) {
            updateLastAgentStep(messageId, { status: 'complete' });
          }

          const newContextFiles: FileContext[] = fileDataList
            .filter(f => !f.error)
            .map(f => ({
              path: f.path,
              content: f.content,
              language: f.path.split('.').pop() || 'plaintext'
            }));

          if (newContextFiles.length > 0) {
            // Add analyzing step
            if (messageId) {
              addAgentStep(messageId, {
                type: 'analyzing',
                message: 'Analyzing code structure',
                status: 'active'
              });
            }

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

                // Mark analyzing as complete
                if (messageId) {
                  updateLastAgentStep(messageId, { status: 'complete' });
                }

                setTimeout(() => {
                  sendMessageWithExplicitContext(
                    `Files loaded. Analyze these files and provide insights: "${originalQuery}"`,
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
      setFileReadingProgress(null);

      if (messageId) {
        updateLastAgentStep(messageId, { status: 'error', details: String(error) });
      }

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
  const buildSystemPrompt = useCallback(async (explicitContext?: FileContext[], forPlanning: boolean = false) => {
    const activeContext = explicitContext || contextFiles;

    let systemPrompt = `You are an AI Coding Assistant with ${agentMode === 'agent' ? 'FULL AGENT MODE' : 'CHAT MODE'}.

WORKFLOW RULES:
${agentMode === 'agent' ? `
ANALYSIS WORKFLOW:
1. When user asks to analyze/explain code -> Generate Cypher query -> System auto-executes -> Files load -> You analyze immediately
2. Always provide thorough analysis with actual code references
3. Never ask user to provide file contents

MODIFICATION WORKFLOW:
1. When user asks to modify code:
   - First read/analyze the relevant files
   - Create a detailed PLAN with numbered steps
   - Present PLAN to user for approval
   - Wait for user confirmation
   - Then execute with search/replace blocks

CRITICAL: Always use this format for plans:
PLAN:
1. Step description
2. Step description
3. Step description

Then wait for approval before making changes.
` : 'Standard chat mode - answer questions helpfully.'}

RESPONSE RULES:
- Use markdown formatting with headers, lists, code blocks
- Be direct and professional
- Provide complete, thorough analysis
- Use actual code from loaded files
- Never mention internal processes (Neo4j, Cypher, etc.)`

    if (forPlanning) {
      systemPrompt += `\n\nYou are in PLANNING MODE. Create a detailed step-by-step plan for the requested changes. List specific files to modify and what changes to make.`;
    }

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

    // Determine if this is a modification request that needs planning
    const needsPlanning = agentMode === 'agent' && isModificationQuery(userMessage) && !isPlanning;

    if (needsPlanning) {
      setIsPlanning(true);
    }

    const assistantMsg: Message = {
      id: (Date.now() + 1).toString(),
      role: "assistant",
      content: "",
      timestamp: new Date(),
      isStreaming: true,
    };

    setMessages((prev) => [...prev, assistantMsg]);
    setPlanApprovalMessageId(assistantMsg.id);

    // Add appropriate initial step
    if (agentMode === 'agent') {
      if (isAnalysisQuery(userMessage)) {
        addAgentStep(assistantMsg.id, {
          type: 'searching',
          message: 'Analyzing codebase structure',
          status: 'active',
          details: 'Generating graph query...'
        });
      } else if (needsPlanning) {
        addAgentStep(assistantMsg.id, {
          type: 'planning',
          message: 'Creating modification plan',
          status: 'active'
        });
      } else {
        addAgentStep(assistantMsg.id, {
          type: 'thinking',
          message: 'Processing request',
          status: 'active'
        });
      }
    }

    try {
      const systemPrompt = await buildSystemPrompt(undefined, needsPlanning);
      const chatMessages: ChatMessage[] = [
        { role: "system", content: systemPrompt },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: userMessage },
      ];

      await invoke("chat_with_ollama", {
        model: model,
        messages: chatMessages,
      });

      // Mark initial step as complete
      updateLastAgentStep(assistantMsg.id, { status: 'complete' });

      setMessages((prev) => {
        const lastMsg = prev[prev.length - 1];

        // Check if we got a plan
        if (isPlanning && lastMsg) {
          const plan = parsePlanFromResponse(lastMsg.content);
          if (plan) {
            setCurrentPlan(plan);
          }
        }

        return prev.map((m) =>
          m.id === assistantMsg.id ? { ...m, isStreaming: false } : m
        );
      });
    } catch (error) {
      console.error("Chat error:", error);

      if (agentMode === 'agent') {
        updateLastAgentStep(assistantMsg.id, { status: 'error', details: String(error) });
      }

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
        content: `✅ Successfully applied changes to ${block.fileName}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, successMsg]);
    } catch (error) {
      const errorMsg: Message = {
        id: Date.now().toString(),
        role: "system",
        content: `❌ Failed to apply changes: ${error}`,
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
    setAgentSteps(new Map());
    setCurrentPlan(null);
    setIsPlanning(false);
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
    setAgentSteps(new Map());
    setCurrentPlan(null);
    setIsPlanning(false);
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
    <div className="h-full flex flex-col bg-[#0f0f10] overflow-hidden text-gray-100">
      <style>{`
        :root {
          --chat-bg: #0f0f10;
          --chat-surface: #151618;
          --chat-surface-2: #1b1d20;
          --chat-border: #2a2d31;
          --chat-text: #e7e9ee;
          --chat-muted: #9aa3ad;
          --chat-accent: #10a37f;
          --chat-accent-2: #1a7f64;
        }

        @keyframes slide-in {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        @keyframes scale-in {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        
        .animate-slide-in {
          animation: slide-in 0.3s ease-out;
        }
        
        .animate-fade-in {
          animation: fade-in 0.2s ease-out;
        }
        
        .animate-scale-in {
          animation: scale-in 0.3s ease-out;
        }
        
        .animate-shimmer {
          animation: shimmer 2s infinite;
        }
        
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #1e1e1e;
        }
        
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #3c3c3c;
          border-radius: 3px;
        }
        
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #4c4c4c;
        }

        .prose pre {
          background-color: var(--chat-surface) !important;
        }

        .prose {
          max-width: 100% !important;
          overflow-wrap: anywhere;
          word-break: break-word;
        }

        .prose * {
          max-width: 100%;
        }

        .prose ol,
        .prose ul {
          padding-left: 1.25rem;
        }

        .chat-surface {
          background: var(--chat-surface);
        }

        .chat-surface-2 {
          background: var(--chat-surface-2);
        }

        .chat-border {
          border-color: var(--chat-border);
        }

        .chat-muted {
          color: var(--chat-muted);
        }

        .chat-accent {
          color: var(--chat-accent);
        }

        .chat-button {
          background: var(--chat-accent);
        }

        .chat-button:hover {
          background: var(--chat-accent-2);
        }

        .chat-ring:focus {
          outline: none;
          box-shadow: 0 0 0 2px rgba(16, 163, 127, 0.35);
          border-color: var(--chat-accent);
        }
      `}</style>

      {/* Header with Mode Selector */}
      <div className="flex items-center justify-between px-4 py-3 border-b chat-border chat-surface shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-emerald-400" />
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
          <div className="flex items-center gap-1 chat-surface-2 rounded-full p-1 border chat-border">
            {(['chat', 'agent', 'ask'] as AgentMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => {
                  setAgentMode(mode);
                  if (mode !== 'agent') {
                    setIsPlanning(false);
                    setCurrentPlan(null);
                  }
                }}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all flex items-center gap-1 ${agentMode === mode
                  ? mode === 'agent' ? 'bg-emerald-600 text-white shadow-lg' : 'bg-[#2b2f35] text-white'
                  : 'text-gray-400 hover:text-gray-200'
                  }`}
              >
                {mode === 'chat' && <MessageSquare className="w-3 h-3" />}
                {mode === 'agent' && <Cpu className="w-3 h-3" />}
                {mode === 'ask' && <Search className="w-3 h-3" />}
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
            className="p-1.5 hover:bg-white/10 rounded text-gray-400 hover:text-white transition-colors"
            title="Clear chat"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-1.5 hover:bg-white/10 rounded text-gray-400 hover:text-white transition-colors"
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="px-4 py-1 chat-surface border-b chat-border text-xs chat-muted shrink-0 flex items-center justify-between">
        <span className="font-mono">Model: {model}</span>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={autoApplyEdits}
              onChange={(e) => setAutoApplyEdits(e.target.checked)}
              className="w-3 h-3 rounded border-gray-600"
            />
            <span className={autoApplyEdits ? 'text-green-400 font-medium' : ''}>Auto-apply edits</span>
          </label>
          {neo4jConnected && graphStored && (
            <span className="text-green-400 font-medium flex items-center gap-1">
              <Database className="w-3 h-3" />
              Graph ready
            </span>
          )}
        </div>
      </div>

      <QuickActions
        onAction={handleQuickAction}
        hasContext={contextFiles.length > 0}
      />

      <div className="flex-1 min-h-0 overflow-hidden relative flex flex-col">
        <ScrollArea className="h-full w-full">
          <div className="p-5 md:p-6 min-h-full overflow-x-hidden">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-gray-500 min-h-100">
                <div className="relative mb-4">
                  <Bot className="w-12 h-12 text-purple-400/50" />
                  <div className="absolute inset-0 animate-ping opacity-20">
                    <Bot className="w-12 h-12 text-purple-400" />
                  </div>
                </div>
                <h3 className="text-lg font-medium text-gray-300 mb-2">
                  AI Coding Assistant
                </h3>
                {agentMode === 'agent' && (
                  <div className="space-y-2 text-sm max-w-md">
                    <p className="text-purple-400 font-medium flex items-center justify-center gap-2">
                      <Cpu className="w-4 h-4" />
                      Agent Mode Active
                    </p>
                    <ul className="text-left text-gray-400 space-y-1 text-xs">
                      <li>Ask me to <strong>analyze</strong> your codebase - I'll search and read files automatically</li>
                      <li>Ask me to <strong>modify</strong> code - I'll create a plan for your approval first</li>
                      <li>I can create, edit, and delete files with your permission</li>
                    </ul>
                  </div>
                )}
                {connectionStatus === "disconnected" && (
                  <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm max-w-md animate-slide-in">
                    <p className="font-medium">Ollama not connected</p>
                    <p className="text-xs mt-1">
                      Start Ollama with:{" "}
                      <code className="bg-red-500/20 px-1 rounded font-mono">ollama serve</code>
                    </p>
                  </div>
                )}

                {neo4jConnected && graphStored && (
                  <div className="mt-4 p-3 bg-green-500/10 border border-green-500/30 rounded-lg text-green-400 text-sm max-w-md animate-slide-in">
                    <p className="font-medium flex items-center gap-2 justify-center">
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
              <div className="flex flex-col space-y-3">
                <PendingEditsPanel
                  edits={pendingEdits}
                  onApply={(id) => {
                    const edit = pendingEdits.find(e => e.id === id);
                    if (edit) {
                      applyEditsDirectly([edit]);
                    }
                  }}
                  onReject={(id) => setPendingEdits(prev => prev.filter(e => e.id !== id))}
                  onViewDiff={async (edit) => {
                    const diff = await generateDiffForEdit(edit);
                    setCurrentDiff({ path: edit.path, diff });
                    setShowDiffModal(true);
                  }}
                  onApplyAll={() => applyEditsDirectly(pendingEdits.filter(e => !e.applied))}
                  onRejectAll={() => setPendingEdits([])}
                />

                {/* Active Query Animation */}
                {activeQuery && (
                  <CypherQueryAnimation
                    query={activeQuery}
                    onComplete={() => setActiveQuery(null)}
                  />
                )}

                {/* File Reading Animation */}
                {fileReadingProgress && (
                  <FileReadingAnimation
                    current={fileReadingProgress.current}
                    total={fileReadingProgress.total}
                    currentFile={fileReadingProgress.currentFile}
                  />
                )}

                {messages.map((message) => (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    onApplyCode={handleApplyCode}
                    onCopyCode={handleCopyCode}
                    onExecuteQuery={handleExecuteQuery}
                    agentSteps={agentSteps.get(message.id)}
                    isPlanning={isPlanning && message.id === planApprovalMessageId}
                    currentPlan={currentPlan}
                    onApprovePlan={handleApprovePlan}
                    onRejectPlan={handleRejectPlan}
                    onModifyPlanStep={handleModifyPlanStep}
                  />
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      <div className="relative border-t chat-border chat-surface p-3 shrink-0">
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
                    ? isPlanning
                      ? "Review the plan above. Type 'approve' to proceed or ask for changes..."
                      : "Ask me to analyze or modify your code..."
                    : "Ask about your code..."
              }
              className="w-full chat-surface-2 border chat-border rounded-2xl px-4 py-3 pr-12 text-sm text-white placeholder-gray-500 focus:outline-none chat-ring resize-none transition-colors"
              rows={2}
              disabled={isLoading}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || isLoading || (isPlanning && !input.toLowerCase().includes('approve'))}
              className={`absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-xl text-white transition-all ${!input.trim() || isLoading || (isPlanning && !input.toLowerCase().includes('approve'))
                ? "bg-[#2b2f35] cursor-not-allowed"
                : agentMode === 'agent'
                  ? "chat-button shadow-lg"
                  : "bg-[#2f80ed] hover:bg-[#256fd1]"
                }`}
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
          <span className="font-mono">
            {agentMode === 'agent'
              ? isPlanning
                ? "⏸️ Waiting for plan approval..."
                : "⚡ Agent Mode: I'll analyze → plan → execute with your approval"
              : "Press Enter to send, Shift+Enter for new line"
            }
          </span>
          <div className="flex items-center gap-2 font-mono">
            <span>{contextFiles.length} files in context</span>
            {pendingEdits.filter(e => !e.applied).length > 0 && (
              <span className="text-yellow-400 font-medium">
                • {pendingEdits.filter(e => !e.applied).length} pending edits
              </span>
            )}
            {currentPlan && currentPlan.status === 'draft' && (
              <span className="text-amber-400 font-medium animate-pulse">
                • Plan awaiting approval
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