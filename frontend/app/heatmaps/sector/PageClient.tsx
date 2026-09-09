"use client";
import { redirect } from "next/navigation";
import { useEffect } from "react";

export default function HeatmapSectorPage() {
  useEffect(() => {
    redirect("/sectors");
  }, []);
  return null;
}
