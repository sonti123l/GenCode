import { getCurrentWindow } from "@tauri-apps/api/window";
import { useMemo } from "react";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const win = useMemo(() => getCurrentWindow(), []);

  return (
    <div className="h-screen flex flex-col bg-[#1e1e1e]">
      <div className="flex h-8 bg-[#1f1f1f] text-gray-300 select-none">
        <div
          data-tauri-drag-region
          className="flex items-center px-3 text-sm flex-1"
        >
          GEN CODE
        </div>

        <div className="flex">
          <button
            className="w-10 h-8 hover:bg-[#3a3a3a]"
            onClick={async () => await win.minimize()}
          >
            —
          </button>
          <button
            className="w-10 h-8 hover:bg-[#3a3a3a]"
            onClick={async () => await win.toggleMaximize()}
          >
            ▢
          </button>
          <button
            className="w-10 h-8 hover:bg-red-600"
            onClick={async () => await win.close()}
          >
            ✕
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
