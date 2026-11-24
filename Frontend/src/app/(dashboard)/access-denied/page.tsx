import Link from "next/link";
import { Panel, StateBlock } from "@/components/ui";

export default function AccessDeniedPage() {
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">PERMISSION CHECK</div>
          <h2>Access denied</h2>
          <p>Your current demo role does not include permission for this area.</p>
        </div>
      </div>
      <Panel>
        <StateBlock
          kind="denied"
          description="Switch to a role with the required access from the user menu, or return to the overview. Server-side RBAC will produce the authoritative 403 response in the integrated system."
          action={<Link href="/dashboard" className="btn btn-primary">Back to overview</Link>}
        />
      </Panel>
    </div>
  );
}
