import type { IconName } from "@/components/Icon";

export interface NavItem {
  label: string;
  href: string;
  icon: IconName;
  adminOnly?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Monitor",
    items: [
      { label: "Overview", href: "/dashboard", icon: "grid" },
      { label: "Security Events", href: "/events", icon: "shield" },
      { label: "Cloud Resources", href: "/cloud-resources", icon: "cloud" },
    ],
  },
  {
    label: "Assets",
    items: [{ label: "Devices", href: "/devices", icon: "device" }],
  },
  {
    label: "Respond",
    items: [
      { label: "Incidents", href: "/incidents", icon: "incident" },
      { label: "Response Actions", href: "/response-actions", icon: "response" },
      { label: "Audit Log", href: "/audit-logs", icon: "database", adminOnly: true },
    ],
  },
  {
    label: "System",
    items: [{ label: "Settings", href: "/settings", icon: "settings", adminOnly: true }],
  },
];

const PAGE_META: Record<string, { title: string; subtitle: string }> = {
  "/dashboard": { title: "Security Overview", subtitle: "Monitoring capability summary" },
  "/devices": { title: "Devices", subtitle: "IoT device inventory" },
  "/events": { title: "Security Events", subtitle: "Searchable, filterable event stream" },
  "/cloud-resources": { title: "Cloud Resources", subtitle: "Simulated AWS inventory" },
  "/incidents": { title: "Incidents", subtitle: "Correlated investigations" },
  "/response-actions": { title: "Response History", subtitle: "Requested actions and audit trail" },
  "/audit-logs": { title: "Audit Log", subtitle: "Append-only security activity record" },
  "/settings": { title: "Settings", subtitle: "Console and platform configuration" },
};

export function pageMeta(pathname: string): { title: string; subtitle: string } {
  if (PAGE_META[pathname]) return PAGE_META[pathname];
  if (pathname.startsWith("/devices/")) return { title: "Device Detail", subtitle: "Security profile and related evidence" };
  if (pathname.startsWith("/events/")) return { title: "Event Detail", subtitle: "Detection evidence and score explanation" };
  if (pathname.startsWith("/incidents/")) return { title: "Incident Detail", subtitle: "Investigation and response" };
  if (pathname === "/access-denied") return { title: "Access Denied", subtitle: "Permission check" };
  return { title: "CloudGuard IoT", subtitle: "Security console" };
}
