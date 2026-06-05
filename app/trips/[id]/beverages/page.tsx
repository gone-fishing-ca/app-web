"use client";
import { Beer } from "lucide-react";
import { ModuleStub } from "@/components/stub";

export default function Page() {
  return (
    <ModuleStub icon={Beer} title="Beverages"
      blurb="Beer by 6-pack, liquor by handle, wine by bottle. Tracks total quantity vs. on hand." />
  );
}
