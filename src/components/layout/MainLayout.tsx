import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { TopHeader } from "./TopHeader";
import { cn } from "@/lib/utils";

interface MainLayoutProps {
  children: React.ReactNode;
  fluid?: boolean;
}

export function MainLayout({ children, fluid = false }: MainLayoutProps) {
  return (
    <SidebarProvider>
      <div className="flex h-svh w-full overflow-hidden">
        <AppSidebar />
        <SidebarInset className="min-h-0 overflow-hidden">
          <TopHeader />
          <main className="flex-1 min-h-0 bg-background overflow-hidden">
            <div
              className={cn(
                "h-full min-h-0 overflow-hidden px-6 py-4",
                fluid ? "w-full" : "container mx-auto"
              )}
            >
              {children}
            </div>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
