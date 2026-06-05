"use client";
import { Wrench } from "lucide-react";
import { ModuleStub } from "@/components/stub";

export default function Page() {
  return (
    <ModuleStub icon={Wrench} title="Shared gear"
      blurb="Group items — landing net, satellite messenger, camp stove — assigned to one person." />
  );
}
