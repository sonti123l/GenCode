import { menuItems } from "@/helpers/constants/options";
import { SidebarProvider } from "../ui/sidebar";
import AppSidebar from "./AppSidebar";

export default function Options() {
  return (
    <SidebarProvider className="w-12" defaultOpen>
      <AppSidebar options={menuItems} />
    </SidebarProvider>
  );
}
