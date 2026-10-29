import { Nav } from "@/components/nav";
import { ToastProvider } from "@/components/toast";

// Every tab reads the database on each request.
export const dynamic = "force-dynamic";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <ToastProvider>
      <Nav />
      <main className="mx-auto w-full max-w-screen-md flex-1 px-4 py-4">{children}</main>
    </ToastProvider>
  );
}
