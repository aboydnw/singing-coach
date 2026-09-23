import type { Metadata } from "next";
import { PrivacyPolicy } from "@/components/PrivacyPolicy";

export const metadata: Metadata = { title: "Privacy policy · Singing Coach" };

export default function PrivacyPage() {
  return <PrivacyPolicy />;
}
