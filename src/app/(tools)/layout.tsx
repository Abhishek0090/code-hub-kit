import DashboardShell from "@/components/DashboardShell";

export default function ToolsLayout({ children }: LayoutProps<"/">) {
  return <DashboardShell>{children}</DashboardShell>;
}
