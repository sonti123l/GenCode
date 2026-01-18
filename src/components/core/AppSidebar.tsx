import { useState } from "react";
import { Sidebar, SidebarContent, SidebarGroup } from "../ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

export default function AppSidebar({ options }: { options: any }) {
  const [selected, setSelected] = useState("Folders");

  return (
    <Sidebar className="w-12 border-none bg-[#333333]">
      <SidebarContent className="bg-[#333333]">
        <SidebarGroup>
          <div className="flex flex-col items-center gap-4 mt-4">
            {options.map(
              (item: { menuItem: string; icon: any }, index: number) => (
                <Tooltip key={index}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setSelected(item.menuItem)}
                      className={`p-2 rounded-md ${
                        selected === item.menuItem
                          ? "bg-white/20"
                          : "hover:bg-white/10"
                      }`}
                    >
                      <item.icon className="w-6 h-6 text-gray-300" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    {item.menuItem}
                  </TooltipContent>
                </Tooltip>
              ),
            )}
          </div>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
