import { redirect } from "next/navigation";

export default function BusinessWorkflowsPage() {
  redirect("/business?tab=workflows");
}
