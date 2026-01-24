import { menuItems } from "@/helpers/constants/options";
import { SidebarProvider } from "../ui/sidebar";
import AppSidebar from "./AppSidebar";

export default function Options() {
  return (
    <SidebarProvider defaultOpen>
      <AppSidebar options={menuItems} />
    </SidebarProvider>
  );
}