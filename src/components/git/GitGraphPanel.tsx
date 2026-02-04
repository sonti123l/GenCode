import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { User, Calendar } from "lucide-react";

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
      const commits = await invoke<CommitInfo[]>("get_commit_history", {
        repoPath,
        limit: 50,
      });
      setHistory(commits);
    } catch (err) {
      console.error("Failed to load history:", err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (timestamp: string) => {
    const date = new Date(parseInt(timestamp) * 1000);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days} days ago`;
    if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
    if (days < 365) return `${Math.floor(days / 30)} months ago`;
    return date.toLocaleDateString();
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(parseInt(timestamp) * 1000);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  if (loading && history.length === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-[#1e1e1e] text-[#858585]">
        <div className="text-xs">Loading commit history...</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#1e1e1e] text-[#cccccc] font-sans">
      <div className="flex-1 overflow-auto">
        {history.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[#858585] text-xs">
            No commits yet
          </div>
        ) : (
          <div className="divide-y divide-[#2d2d2d]">
            {history.map((commit, index) => (
              <div
                key={commit.id}
                className="px-3 py-2 hover:bg-[#2a2d2e] cursor-pointer group transition-colors"
              >
                <div className="flex items-start gap-3">
                  {/* Graph visualization */}
                  <div className="flex flex-col items-center pt-0.5">
                    <div className="w-2 h-2 rounded-full bg-[#007acc] ring-2 ring-[#1e1e1e] group-hover:ring-[#2a2d2e] transition-all"></div>
                    {index < history.length - 1 && (
                      <div className="w-0.5 h-10 bg-[#3c3c3c] mt-1"></div>
                    )}
                  </div>

                  {/* Commit details */}
                  <div className="flex-1 min-w-0 pb-1">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="text-[13px] text-[#cccccc] font-normal truncate flex-1">
                        {commit.message}
                      </p>
                      <span className="text-[11px] text-[#858585] font-mono shrink-0">
                        {commit.id.substring(0, 7)}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-[11px] text-[#858585]">
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {commit.author.split("<")[0].trim()}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatDate(commit.date)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
