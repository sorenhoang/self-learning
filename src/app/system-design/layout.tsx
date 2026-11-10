import { getSystemDesign } from "@/lib/system-design";
import Sidebar from "@/components/system-design/Sidebar";

export default function SystemDesignLayout({ children }: { children: React.ReactNode }) {
  const { title, groups } = getSystemDesign();
  return (
    <div className="grid bg-zinc-50 dark:bg-zinc-950 lg:grid-cols-[310px_1fr]">
      <Sidebar title={title} groups={groups} />
      <div className="min-w-0 px-5 pb-20 pt-7 lg:px-14 lg:pt-12">
        <div className="max-w-[920px]">{children}</div>
      </div>
    </div>
  );
}
