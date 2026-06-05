"use client";
import { Calendar } from "lucide-react";
import { ModuleStub } from "@/components/stub";

export default function Page() {
  return (
    <ModuleStub icon={Calendar} title="Itinerary"
      blurb="Day-by-day schedule with milestones (departure, fly-in, fly-out, return). API endpoints are ready." />
  );
}
