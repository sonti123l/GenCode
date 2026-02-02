import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { GitCommitHorizontal, User, Calendar, Hash } from "lucide-react";

interface CommitInfo {
    id: string;
    message: string;
    author: string;
    date: string;
    parent_ids: string[];
}

export default function GitGraphPanel({ repoPath }: { repoPath: string }) {
    const [history, setHistory] = useState<CommitInfo[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (repoPath) {
            loadHistory();
        }
    }, [repoPath]);

    const loadHistory = async () => {
        setLoading(true);
        try {
            const commits = await invoke<CommitInfo[]>("get_commit_history", { repoPath, limit: 50 });
            setHistory(commits);
        } catch (err) {
            console.error("Failed to load history:", err);
        } finally {
            setLoading(false);
        }
    };

    // Simple formatted date
    const formatDate = (timestamp: string) => {
        const date = new Date(parseInt(timestamp) * 1000);
        return date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    return (
        <div className="h-full flex flex-col bg-[#1e1e1e] text-[#cccccc] font-sans">
            <div className="h-9 flex items-center px-4 border-b border-[#2d2d2d] bg-[#252526] shrink-0 justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#bbbbbb]">Git Graph</span>
                <button onClick={loadHistory} className="text-xs hover:text-white">Refresh</button>
            </div>

            <div className="flex-1 overflow-auto">
                <table className="w-full text-left border-collapse table-fixed">
                    <thead className="bg-[#2d2d2d] sticky top-0 z-10 text-[11px] text-[#aaaaaa] font-semibold">
                        <tr>
                            <th className="p-2 w-16 border-r border-[#3c3c3c] text-center">Graph</th>
                            <th className="p-2 w-1/2 border-r border-[#3c3c3c]">Description</th>
                            <th className="p-2 w-32 border-r border-[#3c3c3c]">Author</th>
                            <th className="p-2 w-32 border-r border-[#3c3c3c]">Date</th>
                            <th className="p-2 w-20">Commit</th>
                        </tr>
                    </thead>
                    <tbody className="text-[12px]">
                        {history.map((commit, index) => (
                            <tr key={commit.id} className="hover:bg-[#2a2d2e] border-b border-[#2d2d2d]">
                                <td className="p-2 border-r border-[#3c3c3c] flex justify-center">
                                    {/* Simple dot for now, can be expanded to SVG graph */}
                                    <div className="w-2 h-2 rounded-full bg-[#007acc] mt-1.5 relative">
                                        {/* Line to next commit */}
                                        {index < history.length - 1 && (
                                            <div className="absolute top-2 left-1/2 -translate-x-1/2 w-0.5 h-10 bg-[#4d4d4d]"></div>
                                        )}
                                    </div>
                                </td>
                                <td className="p-2 border-r border-[#3c3c3c] truncate" title={commit.message}>
                                    {commit.message}
                                </td>
                                <td className="p-2 border-r border-[#3c3c3c] truncate" title={commit.author}>
                                    {commit.author}
                                </td>
                                <td className="p-2 border-r border-[#3c3c3c] truncate text-[#888888]">
                                    {formatDate(commit.date)}
                                </td>
                                <td className="p-2 font-mono text-[10px] text-[#888888]">
                                    {commit.id.substring(0, 7)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
