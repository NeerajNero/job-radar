import { Nav } from "@/components/nav";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <Nav />
      <main className="mx-auto w-full max-w-screen-md flex-1 px-4 py-4">{children}</main>
    </>
  );
}
