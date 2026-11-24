import Link from "next/link";
import { Panel, StateBlock } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="page">
      <Panel>
        <StateBlock
          kind="empty"
          title="Page not found (404)"
          description="The route does not exist in this console. Use the navigation or return to the overview."
          action={<Link href="/dashboard" className="btn btn-primary">Go to overview</Link>}
        />
      </Panel>
    </div>
  );
}
