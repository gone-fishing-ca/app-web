"use client";
import { Utensils } from "lucide-react";
import { ModuleStub } from "@/components/stub";

export default function Page() {
  return (
    <ModuleStub icon={Utensils} title="Food"
      blurb="Lunch, dinner, breakfast, snacks, staples — quantities calculated from headcount × days, with week splits." />
  );
}
