import { useState } from "react";
import { Sidebar, SidebarContent, SidebarGroup } from "../ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

export default function AppSidebar({ options }: { options: any }) {
  const [defaultSelectOption, setDefaultSelectionOption] = useState<
    string | "Folders" | "Reports"
  >("Folders");

  const handleSelection = (value: string) => {
    if (value === "Folders") {
      setDefaultSelectionOption("Folders");
    } else {
      setDefaultSelectionOption("Reports");
    }
  };
  return (
    <Sidebar className="w-12 border-none">
      <SidebarContent className="bg-[#3d3e3e]">
        <SidebarGroup>
          <div className="flex flex-col gap-3 w-full">
            {options?.map(
              (eachItem: { menuItem: string; icon: any }, index: number) => (
                <div
                  key={index}
                  className={`mt-4`}
                  onClick={() => handleSelection(eachItem.menuItem)}
                >
                  <Tooltip>
                    <TooltipTrigger>
                      <eachItem.icon className="w-7 h-7 text-gray-400" />
                    </TooltipTrigger>
                    <TooltipContent side="right" sideOffset={8}>
                      {eachItem.menuItem}
                    </TooltipContent>
                  </Tooltip>
                </div>
              ),
            )}
          </div>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
