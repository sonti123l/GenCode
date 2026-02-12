import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useEditor } from "@/context/EditorContext";
import GitGraphPanel from "./GitGraphPanel";
import {
    RefreshCw,
    Check,
    Plus,
    MoreHorizontal,
    ChevronRight,
    ChevronDown,
    Undo2,
    File,

    GitCommit,
    GitBranch,
    X,
    Minus
} from "lucide-react";

interface GitFileStatus {
    path: string;
    status: string;
}

interface GitRepoStatus {
    branch: string;
    changes: GitFileStatus[];
    staged: GitFileStatus[];
}

interface SourceControlPanelProps {
    repoPath: string;
}

export default function SourceControlPanel({ repoPath }: SourceControlPanelProps) {
    const [isRepo, setIsRepo] = useState<boolean | null>(null);
    const [status, setStatus] = useState<GitRepoStatus | null>(null);
    const [commitMessage, setCommitMessage] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [stagedOpen, setStagedOpen] = useState(true);
    const [changesOpen, setChangesOpen] = useState(true);
    const [graphOpen, setGraphOpen] = useState(false);
    const [inputFocused, setInputFocused] = useState(false);

    const { setSelectedFile, setFileContent, setEditorMode, setDiffOriginal } = useEditor();

    useEffect(() => {
        checkRepo();
    }, [repoPath]);

    const checkRepo = async () => {
        try {
            setLoading(true);
            const isGit = await invoke<boolean>("check_is_git_repo", { path: repoPath });
            setIsRepo(isGit);
            if (isGit) {
                refreshStatus();
            } else {
                setStatus(null);
            }
        } catch (err) {
            console.error("Failed to check git repo:", err);
            setIsRepo(false);
        } finally {
            setLoading(false);
        }
    };

    const refreshStatus = async () => {
        if (!repoPath) return;
        try {
            const gitStatus = await invoke<GitRepoStatus>("get_git_status", { path: repoPath });
            setStatus(gitStatus);
            setError(null);
        } catch (err: any) {
            console.error("Failed to get git status:", err);
            setError(err.toString());
        }
    };

    const stageFile = async (filePath: string) => {
        try {
            await invoke("git_add", { repoPath, filePath });
            refreshStatus();
        } catch (err: any) {
            setError("Failed to stage file: " + err);
        }
    };

    const unstageFile = async (filePath: string) => {
        try {
            await invoke("git_unstage", { repoPath, filePath });
            refreshStatus();
        } catch (err: any) {
            setError("Failed to unstage file: " + err);
        }
    };

    const handleCommit = async () => {
        if (!commitMessage.trim()) return;
        try {
            setLoading(true);
            await invoke("git_commit", { repoPath, message: commitMessage });
            setCommitMessage("");
            refreshStatus();
        } catch (err: any) {
            setError("Commit failed: " + err);
        } finally {
            setLoading(false);
        }
    };

    const handlePush = async () => {
        try {
            setLoading(true);
            await invoke("git_push", { repoPath });
            refreshStatus();
        } catch (err: any) {
            setError("Push failed: " + err);
        } finally {
            setLoading(false);
        }
    }

    const handlePull = async () => {
        try {
            setLoading(true);
            await invoke("git_pull", { repoPath });
            refreshStatus();
        } catch (err: any) {
            setError("Pull failed: " + err);
        } finally {
            setLoading(false);
        }
    }

    const handleFileClick = async (filePath: string) => {
        const normalizedRepoPath = repoPath.replace(/\\/g, '/').replace(/\/$/, '');
        const normalizedFilePath = filePath.replace(/\\/g, '/');
        const fullPath = `${normalizedRepoPath}/${normalizedFilePath}`;

        setSelectedFile(fullPath);

        try {
            setLoading(true);
            const currentContent = await invoke<string>("read_file_while_content", { path: fullPath });
            setFileContent(currentContent);

            const originalContent = await invoke<string>("get_diff_content", {
                repoPath: repoPath,
                filePath: filePath
            });
            setDiffOriginal(originalContent);
            setEditorMode("diff");
        } catch (err) {
            console.error("Failed to open diff:", err);
            setError("Failed to open diff: " + err);
        } finally {
            setLoading(false);
        }
    };

    const handleOpenFile = async (e: React.MouseEvent, filePath: string) => {
        e.stopPropagation();
        const normalizedRepoPath = repoPath.replace(/\\/g, '/').replace(/\/$/, '');
        const normalizedFilePath = filePath.replace(/\\/g, '/');
        const fullPath = `${normalizedRepoPath}/${normalizedFilePath}`;

        setSelectedFile(fullPath);

        try {
            const content = await invoke<string>("read_file_while_content", { path: fullPath });
            setFileContent(content);
            setEditorMode("edit");
        } catch (err) {
            console.error("Failed to open file:", err);
        }
    };

    const getFileStatusColor = (status: string) => {
        switch (status) {
            case "M": return "text-[#e2c08d]";
            case "A": return "text-[#73c991]";
            case "D": return "text-[#f48771]";
            case "U": return "text-[#73c991]";
            case "R": return "text-[#73c991]";
            case "C": return "text-[#73c991]";
            default: return "text-[#cccccc]";
        }
    };

    const getFileStatusBadge = (status: string) => {
        switch (status) {
            case "M": return "M";
            case "A": return "A";
            case "D": return "D";
            case "U": return "U";
            case "R": return "R";
            case "C": return "C";
            default: return "?";
        }
    }

    const getFileName = (path: string) => {
        return path.split(/[\\/]/).pop() || path;
    };

    const getFilePath = (path: string) => {
        const lastSlash = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'));
        return lastSlash > 0 ? path.substring(0, lastSlash) : '';
    };

    if (isRepo === false) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-[#858585] p-6 text-center bg-[#1e1e1e]">
                <GitBranch className="w-12 h-12 mb-3 opacity-40" />
                <p className="text-sm mb-1">No source control providers registered.</p>
                <p className="text-xs opacity-70">Initialize a git repository to get started.</p>
            </div>
        );
    }

    if (loading && !status) {
        return (
            <div className="flex items-center justify-center h-full bg-[#1e1e1e]">
                <div className="flex flex-col items-center gap-2 text-[#858585]">
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    <span className="text-xs">Loading repository...</span>
                </div>
            </div>
        );
    }

    const totalChanges = (status?.staged?.length || 0) + (status?.changes?.length || 0);

    return (
        <div className="flex flex-col h-full bg-[#1e1e1e] text-[#cccccc] select-none text-[13px] font-sans">
            {/* Header */}
            <div className="flex items-center justify-between px-3 h-8.75 border-b border-[#2d2d2d] shrink-0">
                <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-[#cccccc]">
                        Source Control
                    </span>
                    {totalChanges > 0 && (
                        <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-[#1a7dc4] text-white font-medium">
                            {totalChanges}
                        </span>
                    )}
                </div>
                <div className="flex gap-0.5">
                    <button
                        onClick={refreshStatus}
                        title="Refresh"
                        className="p-1 hover:bg-[#2a2d2e] rounded transition-colors"
                        disabled={loading}
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                    <button
                        title="More Actions..."
                        className="p-1 hover:bg-[#2a2d2e] rounded transition-colors"
                    >
                        <MoreHorizontal className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Branch Info */}
            {status && (
                <div className="px-3 py-2 border-b border-[#2d2d2d] bg-[#252526] shrink-0">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-[11px]">
                            <GitBranch className="w-3.5 h-3.5" />
                            <span className="text-[#cccccc] font-medium">{status.branch}</span>
                        </div>
                        <div className="flex gap-1">
                            <button
                                onClick={handlePull}
                                title="Pull"
                                className="p-1 hover:bg-[#2a2d2e] rounded text-[#cccccc] hover:text-white transition-colors"
                                disabled={loading}
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                                </svg>
                            </button>
                            <button
                                onClick={handlePush}
                                title="Push"
                                className="p-1 hover:bg-[#2a2d2e] rounded text-[#cccccc] hover:text-white transition-colors"
                                disabled={loading}
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Error Banner */}
            {error && (
                <div className="px-3 py-2 bg-[#5a1d1d] text-[#f48771] text-[11px] border-b border-[#2d2d2d] flex items-start gap-2 shrink-0">
                    <span className="flex-1">{error}</span>
                    <button onClick={() => setError(null)} className="hover:text-white">
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            )}

            {/* Commit Input */}
            <div className="px-3 py-3 border-b border-[#2d2d2d] shrink-0">
                <div className="flex flex-col gap-2">
                    <div className={`relative ${inputFocused ? 'ring-1 ring-[#007acc]' : ''}`}>
                        <input
                            className="w-full bg-[#3c3c3c] border border-[#3c3c3c] rounded px-2 py-1.5 text-[12px] text-[#cccccc] placeholder-[#858585] focus:outline-none focus:bg-[#3c3c3c] focus:border-[#007acc] transition-colors"
                            placeholder="Message (Ctrl+Enter to commit)"
                            value={commitMessage}
                            onChange={(e) => setCommitMessage(e.target.value)}
                            onFocus={() => setInputFocused(true)}
                            onBlur={() => setInputFocused(false)}
                            onKeyDown={(e) => {
                                if (e.ctrlKey && e.key === "Enter") {
                                    handleCommit();
                                }
                            }}
                        />
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={handleCommit}
                            disabled={!commitMessage.trim() || loading || !status?.staged?.length}
                            className={`flex-1 py-1.5 px-3 rounded flex items-center justify-center gap-1.5 text-[12px] font-medium transition-all ${!commitMessage.trim() || loading || !status?.staged?.length
                                    ? "bg-[#2d2d2d] text-[#656565] cursor-not-allowed"
                                    : "bg-[#0e639c] hover:bg-[#1177bb] text-white"
                                }`}
                        >
                            <Check className="w-3.5 h-3.5" />
                            Commit
                        </button>
                        <button
                            className="px-2 py-1.5 rounded bg-[#2d2d2d] hover:bg-[#3c3c3c] text-[#cccccc] transition-colors"
                            title="Commit options"
                        >
                            <ChevronDown className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>
            </div>

            {/* File Lists */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden">
                {/* Staged Changes */}
                {status?.staged && status.staged.length > 0 && (
                    <div className="border-b border-[#2d2d2d]">
                        <div
                            className="flex items-center px-2 py-1.5 hover:bg-[#2a2d2e] cursor-pointer sticky top-0 bg-[#1e1e1e] z-10"
                            onClick={() => setStagedOpen(!stagedOpen)}
                        >
                            {stagedOpen ? (
                                <ChevronDown className="w-3.5 h-3.5 mr-1.5 text-[#cccccc]" />
                            ) : (
                                <ChevronRight className="w-3.5 h-3.5 mr-1.5 text-[#cccccc]" />
                            )}
                            <span className="text-[11px] font-semibold uppercase tracking-wide text-[#cccccc]">
                                Staged Changes
                            </span>
                            <span className="ml-2 px-1.5 py-0.5 text-[9px] rounded-full bg-[#3c3c3c] text-[#cccccc] font-medium">
                                {status.staged.length}
                            </span>
                            <div className="ml-auto flex gap-0.5">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        status.staged.forEach(f => unstageFile(f.path));
                                    }}
                                    className="p-1 opacity-0 group-hover:opacity-100 hover:bg-[#3c3c3c] rounded transition-all"
                                    title="Unstage All Changes"
                                >
                                    <Minus className="w-3 h-3" />
                                </button>
                            </div>
                        </div>

                        {stagedOpen && (
                            <div>
                                {status.staged.map((file) => (
                                    <div
                                        key={file.path}
                                        className="flex items-center px-7 py-1 hover:bg-[#2a2d2e] group cursor-pointer transition-colors"
                                        onClick={() => handleFileClick(file.path)}
                                    >
                                        <span className={`w-4 text-center text-[10px] font-semibold mr-2 ${getFileStatusColor(file.status)}`}>
                                            {getFileStatusBadge(file.status)}
                                        </span>
                                        <div className="flex-1 min-w-0 flex items-baseline gap-2">
                                            <span className="text-[13px] text-[#cccccc]" title={file.path}>
                                                {getFileName(file.path)}
                                            </span>
                                            {getFilePath(file.path) && (
                                                <span className="text-[11px] text-[#6e6e6e] truncate">
                                                    {getFilePath(file.path)}
                                                </span>
                                            )}
                                        </div>
                                        <div className="hidden group-hover:flex items-center gap-1 ml-2">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleOpenFile(e, file.path);
                                                }}
                                                className="p-0.5 hover:bg-[#3c3c3c] rounded text-[#cccccc] hover:text-white transition-colors"
                                                title="Open File"
                                            >
                                                <File className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    unstageFile(file.path);
                                                }}
                                                className="p-0.5 hover:bg-[#3c3c3c] rounded text-[#cccccc] hover:text-white transition-colors"
                                                title="Unstage Changes"
                                            >
                                                <Minus className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Unstaged Changes */}
                {status?.changes && status.changes.length > 0 && (
                    <div className="border-b border-[#2d2d2d]">
                        <div
                            className="flex items-center px-2 py-1.5 hover:bg-[#2a2d2e] cursor-pointer group sticky top-0 bg-[#1e1e1e] z-10"
                            onClick={() => setChangesOpen(!changesOpen)}
                        >
                            {changesOpen ? (
                                <ChevronDown className="w-3.5 h-3.5 mr-1.5 text-[#cccccc]" />
                            ) : (
                                <ChevronRight className="w-3.5 h-3.5 mr-1.5 text-[#cccccc]" />
                            )}
                            <span className="text-[11px] font-semibold uppercase tracking-wide text-[#cccccc]">
                                Changes
                            </span>
                            <span className="ml-2 px-1.5 py-0.5 text-[9px] rounded-full bg-[#3c3c3c] text-[#cccccc] font-medium">
                                {status.changes.length}
                            </span>
                            <div className="ml-auto flex gap-0.5">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        status.changes.forEach(f => stageFile(f.path));
                                    }}
                                    className="p-1 opacity-0 group-hover:opacity-100 hover:bg-[#3c3c3c] rounded transition-all"
                                    title="Stage All Changes"
                                >
                                    <Plus className="w-3 h-3" />
                                </button>
                                <button
                                    onClick={(e) => e.stopPropagation()}
                                    className="p-1 opacity-0 group-hover:opacity-100 hover:bg-[#3c3c3c] rounded transition-all"
                                    title="Discard All Changes"
                                >
                                    <Undo2 className="w-3 h-3" />
                                </button>
                            </div>
                        </div>

                        {changesOpen && (
                            <div>
                                {status.changes.map((file) => (
                                    <div
                                        key={file.path}
                                        className="flex items-center px-7 py-1 hover:bg-[#2a2d2e] group cursor-pointer transition-colors"
                                        onClick={() => handleFileClick(file.path)}
                                    >
                                        <span className={`w-4 text-center text-[10px] font-semibold mr-2 ${getFileStatusColor(file.status)}`}>
                                            {getFileStatusBadge(file.status)}
                                        </span>
                                        <div className="flex-1 min-w-0 flex items-baseline gap-2">
                                            <span className="text-[13px] text-[#cccccc]" title={file.path}>
                                                {getFileName(file.path)}
                                            </span>
                                            {getFilePath(file.path) && (
                                                <span className="text-[11px] text-[#6e6e6e] truncate">
                                                    {getFilePath(file.path)}
                                                </span>
                                            )}
                                        </div>
                                        <div className="hidden group-hover:flex items-center gap-1 ml-2">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleOpenFile(e, file.path);
                                                }}
                                                className="p-0.5 hover:bg-[#3c3c3c] rounded text-[#cccccc] hover:text-white transition-colors"
                                                title="Open File"
                                            >
                                                <File className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                onClick={(e) => e.stopPropagation()}
                                                className="p-0.5 hover:bg-[#3c3c3c] rounded text-[#cccccc] hover:text-white transition-colors"
                                                title="Discard Changes"
                                            >
                                                <Undo2 className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    stageFile(file.path);
                                                }}
                                                className="p-0.5 hover:bg-[#3c3c3c] rounded text-[#cccccc] hover:text-white transition-colors"
                                                title="Stage Changes"
                                            >
                                                <Plus className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Empty State */}
                {status && !status.staged?.length && !status.changes?.length && (
                    <div className="flex flex-col items-center justify-center h-48 text-[#858585] text-center px-6">
                        <GitCommit className="w-10 h-10 mb-3 opacity-40" />
                        <p className="text-sm mb-1">No changes</p>
                        <p className="text-xs opacity-70">Your working tree is clean</p>
                    </div>
                )}
            </div>

            {/* Git Graph Section */}
            <div className="border-t border-[#2d2d2d] shrink-0">
                <div
                    className="flex items-center px-2 py-1.5 hover:bg-[#2a2d2e] cursor-pointer bg-[#252526]"
                    onClick={() => setGraphOpen(!graphOpen)}
                >
                    {graphOpen ? (
                        <ChevronDown className="w-3.5 h-3.5 mr-1.5 text-[#cccccc]" />
                    ) : (
                        <ChevronRight className="w-3.5 h-3.5 mr-1.5 text-[#cccccc]" />
                    )}
                    <GitCommit className="w-3.5 h-3.5 mr-1.5 text-[#cccccc]" />
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-[#cccccc]">
                        Commits
                    </span>
                </div>
                {graphOpen && (
                    <div className="h-80 border-t border-[#2d2d2d] bg-[#1e1e1e]">
                        <GitGraphPanel repoPath={repoPath} />
                    </div>
                )}
            </div>
        </div>
    );
}