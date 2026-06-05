"use client";
import { PlaneTakeoff } from "lucide-react";
import { ModuleStub } from "@/components/stub";

export default function Page() {
  return (
    <ModuleStub icon={PlaneTakeoff} title="Flight tracker"
      blurb="Per-participant flight legs — arrivals and departures with confirmation codes and pickup notes." />
  );
}
