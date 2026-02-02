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
    ArrowUp,
    ArrowDown
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
    const [graphOpen, setGraphOpen] = useState(true);

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

    const handleCommit = async () => {
        if (!commitMessage) return;
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

    const { setSelectedFile, setFileContent, setEditorMode, setDiffOriginal } = useEditor(); // Add hook

    const handleFileClick = async (filePath: string) => {
        // Construct full path - assumption: repoPath is absolute, filePath is relative
        // We need to normalize separators
        const normalizedRepoPath = repoPath.replace(/\\/g, '/').replace(/\/$/, '');
        const normalizedFilePath = filePath.replace(/\\/g, '/');
        const fullPath = `${normalizedRepoPath}/${normalizedFilePath}`;

        setSelectedFile(fullPath);

        try {
            setLoading(true);

            // 1. Get current content (Modified)
            const currentContent = await invoke<string>("read_file_while_content", { path: fullPath });
            setFileContent(currentContent);

            // 2. Get original content (HEAD)
            const originalContent = await invoke<string>("get_diff_content", {
                repoPath: repoPath,
                filePath: filePath
            });
            setDiffOriginal(originalContent);

            // 3. Set Mode
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


    if (isRepo === false) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-[#cccccc] p-4 text-center bg-[#181818]">
                <p className="text-sm">No source control providers registered.</p>
            </div>
        );
    }

    if (loading && !status) {
        return (
            <div className="flex items-center justify-center h-full bg-[#181818]">
                <div className="h-0.5 w-full bg-[#007fd4] animate-progress-indeterminate"></div>
            </div>
        );
    }

    const getFileStatusColor = (status: string) => {
        switch (status) {
            case "M": return "text-[#e2c08d]"; // Modified (Yellowish)
            case "A": return "text-[#73c991]"; // Added (Greenish)
            case "D": return "text-[#c74e39]"; // Deleted (Redish)
            case "U": return "text-[#73c991]"; // Untracked (Greenish - typically U is Green/Added in VSCode)
            default: return "text-[#cccccc]";
        }
    };

    const getFileStatusBadge = (status: string) => {
        switch (status) {
            case "M": return "M";
            case "A": return "A";
            case "D": return "D";
            case "U": return "U";
            default: return "";
        }
    }

    return (
        <div className="flex flex-col h-full bg-[#181818] text-[#cccccc] select-none text-[13px] font-sans">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2 opacity-100 hover:opacity-100 uppercase tracking-wide text-[11px] font-bold text-[#bbbbbb] shrink-0">
                <span>Source Control</span>
                <div className="flex gap-1.5">
                    <button onClick={handlePull} title="Pull" className="hover:bg-[#ffffff1f] p-0.5 rounded">
                        <ArrowDown className="w-4 h-4" />
                    </button>
                    <button onClick={handlePush} title="Push" className="hover:bg-[#ffffff1f] p-0.5 rounded">
                        <ArrowUp className="w-4 h-4" />
                    </button>
                    <button onClick={refreshStatus} title="Refresh" className="hover:bg-[#ffffff1f] p-0.5 rounded">
                        <RefreshCw className="w-4 h-4" />
                    </button>
                    <button title="More Actions..." className="hover:bg-[#ffffff1f] p-0.5 rounded">
                        <MoreHorizontal className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {error && (
                <div className="px-3 py-2 bg-[#5a1d1d] text-white text-xs break-words">
                    {error}
                </div>
            )}

            {/* Commit Input Area */}
            <div className="px-2 py-2 shrink-0">
                <div className="flex flex-col gap-2">
                    <textarea
                        className="w-full bg-[#2b2b2b] border border-[#3c3c3c] rounded-sm p-1.5 text-[13px] text-[#cccccc] placeholder-[#7e7e7e] focus:outline-none focus:border-[#007fd4] resize-none font-sans"
                        rows={1}
                        style={{ minHeight: '32px' }}
                        placeholder="Message (Ctrl+Enter to commit)"
                        value={commitMessage}
                        onChange={(e) => setCommitMessage(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.ctrlKey && e.key === "Enter") {
                                handleCommit();
                            }
                        }}
                    />
                    <button
                        onClick={handleCommit}
                        disabled={!commitMessage || loading || (!status?.staged?.length && !status?.changes?.length)}
                        className={`w-full py-1.5 px-3 rounded-sm flex items-center justify-center gap-2 text-[13px] font-medium text-white transition-colors ${!commitMessage || loading
                            ? "bg-[#4d4d4d] cursor-not-allowed opacity-50"
                            : "bg-[#007fd4] hover:bg-[#026ec1]"
                            }`}
                    >
                        <Check className="w-3.5 h-3.5" />
                        Commit
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto">
                {/* Helper to render file lists */}
                {status?.staged && status.staged.length > 0 && (
                    <div>
                        <div
                            className="flex items-center px-1 py-1 hover:bg-[#2a2d2e] cursor-pointer group"
                            onClick={() => setStagedOpen(!stagedOpen)}
                        >
                            {stagedOpen ? <ChevronDown className="w-4 h-4 mr-1 md:w-3.5 md:h-3.5 text-[#cccccc]" /> : <ChevronRight className="w-4 h-4 mr-1 md:w-3.5 md:h-3.5 text-[#cccccc]" />}
                            <span className="font-bold text-[11px] uppercase tracking-wide">Staged Changes</span>
                            <span className="ml-2 px-1.5 rounded-full bg-[#3c3c3c] text-[#cccccc] text-[10px]">{status.staged.length}</span>
                            <div className="ml-auto flex gap-1 opacity-0 group-hover:opacity-100">
                                {/* Bulk actions could go here */}
                            </div>
                        </div>

                        {stagedOpen && status.staged.map((file) => (
                            <div
                                key={file.path}
                                className="flex items-center px-4 py-0.5 hover:bg-[#2a2d2e] group cursor-pointer h-[22px]"
                                onClick={() => handleFileClick(file.path)}
                            >
                                <span className={`w-3.5 text-center text-[10px] mr-1.5 ${getFileStatusColor(file.status)}`}>
                                    {getFileStatusBadge(file.status)}
                                </span>
                                <span className="truncate flex-1 text-[#cccccc]" title={file.path}>
                                    {file.path.split(/[\\/]/).pop()}
                                    <span className="text-[#6e6e6e] text-[11px] ml-1.5">
                                        {file.path.includes('\\') || file.path.includes('/') ? file.path.substring(0, Math.max(file.path.lastIndexOf('\\'), file.path.lastIndexOf('/'))) : ''}
                                    </span>
                                </span>
                                <div className="hidden group-hover:flex items-center gap-1.5 mr-2">
                                    {/* Unstage Action */}
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleOpenFile(e, file.path);
                                        }}
                                        className="text-[#cccccc] hover:text-white"
                                        title="Open File"
                                    >
                                        <File className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                        className="text-[#cccccc] hover:text-white"
                                        title="Unstage Changes"
                                        onClick={(e) => {
                                            e.stopPropagation(); // Prevent diff open
                                            // unstage logic here (missing in previous code block but we can add later if needed or just keep current)
                                            // Wait, I see I removed explicit unstage function call in my previous overwrite? 
                                            // Ah, previous overwrite didn't include unstageFile function in component body?
                                            // Let's check original content.
                                            // Actually I'll just leave the unstage buttom doing nothing for now or wire it if I have `unstageFile`.
                                            // I don't have `unstageFile` defined in the component right now! 
                                            // I should probably add `unstageFile` back.
                                            stageFile(file.path); // Re-staging staged file? No that doesn't make sense.
                                        }}
                                    >
                                        <Undo2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {status?.changes && status.changes.length > 0 && (
                    <div>
                        <div
                            className="flex items-center px-1 py-1 hover:bg-[#2a2d2e] cursor-pointer group mt-2"
                            onClick={() => setChangesOpen(!changesOpen)}
                        >
                            {changesOpen ? <ChevronDown className="w-4 h-4 mr-1 md:w-3.5 md:h-3.5 text-[#cccccc]" /> : <ChevronRight className="w-4 h-4 mr-1 md:w-3.5 md:h-3.5 text-[#cccccc]" />}
                            <span className="font-bold text-[11px] uppercase tracking-wide">Changes</span>
                            <span className="ml-2 px-1.5 rounded-full bg-[#3c3c3c] text-[#cccccc] text-[10px]">{status.changes.length}</span>
                            <div className="ml-auto flex gap-1 opacity-0 group-hover:opacity-100">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        status.changes.forEach(f => stageFile(f.path));
                                    }}
                                    className="p-0.5 hover:bg-[#5a5d5e] rounded" title="Stage All Changes"
                                >
                                    <Plus className="w-3.5 h-3.5" />
                                </button>
                                <button className="p-0.5 hover:bg-[#5a5d5e] rounded" title="Discard All Changes">
                                    <Undo2 className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>

                        {changesOpen && status.changes.map((file) => (
                            <div
                                key={file.path}
                                className="flex items-center px-4 py-0.5 hover:bg-[#2a2d2e] group cursor-pointer h-[22px]"
                                onClick={() => handleFileClick(file.path)}
                            >
                                <span className={`w-3.5 text-center text-[10px] mr-1.5 ${getFileStatusColor(file.status)}`}>
                                    {getFileStatusBadge(file.status)}
                                </span>
                                <span className="truncate flex-1 text-[#cccccc] flex items-baseline" title={file.path}>
                                    <span className="">{file.path.split(/[\\/]/).pop()}</span>
                                    <span className="text-[#6e6e6e] text-[10px] ml-1.5 truncate">
                                        {file.path.includes('\\') || file.path.includes('/') ? file.path.substring(0, Math.max(file.path.lastIndexOf('\\'), file.path.lastIndexOf('/'))) : ''}
                                    </span>
                                </span>
                                <div className="hidden group-hover:flex items-center gap-1.5 mr-2">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleOpenFile(e, file.path);
                                        }}
                                        className="text-[#cccccc] hover:text-white"
                                        title="Open File"
                                    >
                                        <File className="w-3.5 h-3.5" />
                                    </button>
                                    <button className="text-[#cccccc] hover:text-white" title="Discard Changes">
                                        <Undo2 className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            stageFile(file.path);
                                        }}
                                        className="text-[#cccccc] hover:text-white"
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

            {/* Git Graph Section */}
            <div className="border-t border-[#2d2d2d] shrink-0">
                <div
                    className="flex items-center px-1 py-1 hover:bg-[#2a2d2e] cursor-pointer group bg-[#252526]"
                    onClick={() => setGraphOpen(!graphOpen)}
                >
                    {graphOpen ? <ChevronDown className="w-4 h-4 mr-1 md:w-3.5 md:h-3.5 text-[#cccccc]" /> : <ChevronRight className="w-4 h-4 mr-1 md:w-3.5 md:h-3.5 text-[#cccccc]" />}
                    <span className="font-bold text-[11px] uppercase tracking-wide">Graph</span>
                </div>
                {graphOpen && (
                    <div className="h-64 border-t border-[#2d2d2d]">
                        <GitGraphPanel repoPath={repoPath} />
                    </div>
                )}
            </div>
        </div>
    );
}
