"use client";

import type { LucideIcon } from "lucide-react";
import { Badge, EmptyState } from "./ui";

export function ModuleStub({
  icon, title, blurb,
}: { icon: LucideIcon; title: string; blurb: string }) {
  return (
    <div className="p-6 sm:p-10">
      <EmptyState
        icon={icon}
        title={title}
        subtitle={blurb}
        action={<Badge tone="accent">Coming next</Badge>}
      />
    </div>
  );
}
