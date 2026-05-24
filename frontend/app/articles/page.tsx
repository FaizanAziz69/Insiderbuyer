import { ComingSoon } from "@/components/ComingSoon";

export default function ArticlesPage() {
  return (
    <ComingSoon
      title="Articles"
      description="Long-form analysis of insider trading patterns."
      features={[
        "Weekly deep dives on top insiders",
        "Sector rotation analysis",
        "CEO/CFO playbook decoded",
        "Free summaries · full articles on premium",
      ]}
    />
  );
}
