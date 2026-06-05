"use client";
import { Wallet } from "lucide-react";
import { ModuleStub } from "@/components/stub";

export default function Page() {
  return (
    <ModuleStub icon={Wallet} title="Budget"
      blurb="Total cost, per-person share, deposit status, and balance owed." />
  );
}
