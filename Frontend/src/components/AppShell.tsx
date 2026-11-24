"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Icon } from "./Icon";
import { NAV_GROUPS, pageMeta } from "@/lib/nav";
import { USE_MOCK } from "@/lib/api/services";
import { ROLE_LABELS, useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { initials } from "@/lib/format";
import type { Role } from "@/lib/types";

export function AppShell({ children }: { children: ReactNode }) {
  const { session, ready, signOut, switchRole, can } = useAuth();
  const { notify } = useToast();
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [notifOpen, setNotifOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [unread, setUnread] = useState(2);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (ready && !session) router.replace("/login");
  }, [ready, session, router]);

  useEffect(() => {
    const storedTheme = window.localStorage.getItem("cloudguard.theme");
    const initialTheme: "dark" | "light" = storedTheme === "light" ? "light" : "dark";
    setTheme(initialTheme);
    document.documentElement.dataset.theme = initialTheme;
    setCollapsed(window.localStorage.getItem("cloudguard.nav") === "collapsed");
  }, []);

  if (!ready || !session) {
    return (
      <div className="boot">
        <div className="brand-mark" aria-hidden="true" />
        <span className="mono">Restoring demo session…</span>
      </div>
    );
  }

  const meta = pageMeta(pathname);
  const role = session.user.role;

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem("cloudguard.theme", next);
  }

  function toggleNav() {
    const next = !collapsed;
    setCollapsed(next);
    window.localStorage.setItem("cloudguard.nav", next ? "collapsed" : "expanded");
  }

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    const query = search.trim();
    if (!query) return;
    router.push(`/events?q=${encodeURIComponent(query)}`);
  }

  return (
    <div className={`app-shell ${collapsed ? "nav-collapsed" : ""}`}>
      <a className="skip-link" href="#main">Skip to content</a>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <div>
            <div className="brand-name">CLOUDGUARD</div>
            <div className="brand-sub">IoT Security Console</div>
          </div>
        </div>
        <nav className="nav-scroll" aria-label="Primary navigation">
          {NAV_GROUPS.map((group) => {
            const visible = group.items.filter((item) => !item.adminOnly || can("manageUsers"));
            if (visible.length === 0) return null;
            return (
              <div className="nav-group" key={group.label}>
                <div className="nav-group-label">{group.label}</div>
                {visible.map((item) => {
                  const active = item.href === pathname || (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));
                  return (
                    <Link key={item.href} href={item.href} className={`nav-link ${active ? "active" : ""}`} aria-current={active ? "page" : undefined} title={item.label}>
                      <Icon name={item.icon} />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>
        <div className="sidebar-foot">
          BUILD · FRONTEND HANDOVER<br />
          API · /api/v1 (PROPOSED)<br />
          DATA · {USE_MOCK ? "DEMO FIXTURES" : "LIVE API"}
        </div>
      </aside>

      <div className="main-col">
        <header className="topbar">
          <button className="icon-button" onClick={toggleNav} aria-label={collapsed ? "Expand navigation" : "Collapse navigation"} title={collapsed ? "Expand navigation" : "Collapse navigation"}>
            <Icon name="menu" />
          </button>
          <div className="page-context">
            <h1>{meta.title}</h1>
            <p>{meta.subtitle}</p>
          </div>
          <div className="topbar-spacer" />
          <form className="global-search" onSubmit={submitSearch} role="search">
            <Icon name="search" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search events, devices…" aria-label="Global search" />
            <kbd>↵</kbd>
          </form>
          <button className="icon-button" onClick={toggleTheme} aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} title={theme === "dark" ? "Light mode" : "Dark mode"}>
            <Icon name={theme === "dark" ? "sun" : "moon"} />
          </button>
          <button className="icon-button" onClick={() => { setNotifOpen((v) => !v); setUserOpen(false); }} aria-label="Notifications" aria-expanded={notifOpen}>
            <Icon name="bell" />
            {unread > 0 && <span className="notif-dot" aria-hidden="true" />}
          </button>
          <button className="avatar" onClick={() => { setUserOpen((v) => !v); setNotifOpen(false); }} aria-label="User menu" aria-expanded={userOpen}>
            {initials(session.user.name)}
          </button>
        </header>

        {USE_MOCK && (
          <div className="demo-strip" role="note">
            <Icon name="warning" />
            <span><strong>DEMO DATA</strong> — Synthetic records only. Risk scores come from a prototype rule-based engine and are not validated probabilities of compromise. No live AWS resources are connected.</span>
          </div>
        )}

        {(notifOpen || userOpen) && <div className="popover-scrim" onClick={() => { setNotifOpen(false); setUserOpen(false); }} aria-hidden="true" />}

        {notifOpen && (
          <div className="popover" role="dialog" aria-label="Notifications">
            <div className="popover-head">
              <span>Notifications {unread > 0 && <span className="dim">· {unread} new</span>}</span>
              <button className="btn btn-sm btn-quiet" onClick={() => { setUnread(0); notify("Notifications marked as read (demo)."); }}>Mark read</button>
            </div>
            <Link href="/incidents/INC-1042" className="popover-item" onClick={() => setNotifOpen(false)}>
              <strong>Isolation completed · SIM-07</strong>
              <small>Incident INC-1042 · simulated deny-all policy</small>
            </Link>
            <Link href="/incidents/INC-1041" className="popover-item" onClick={() => setNotifOpen(false)}>
              <strong>Approval requested · SIM-06</strong>
              <small>Incident INC-1041 · isolation awaiting approval</small>
            </Link>
            <div className="popover-foot">Delivery via SNS is a target component; not connected.</div>
          </div>
        )}

        {userOpen && (
          <div className="popover" role="dialog" aria-label="User menu">
            <div className="popover-head">
              <span>{session.user.name}</span>
              <span className="chip plain">{ROLE_LABELS[role]}</span>
            </div>
            <div className="popover-foot" style={{ borderBottom: "1px solid var(--line-soft)" }}>
              <div className="mono" style={{ fontSize: 11 }}>{session.user.email}</div>
              <div className="dim" style={{ fontSize: 10, marginTop: 3 }}>Demo session · client-side only</div>
            </div>
            <div className="popover-label">Switch demo role</div>
            {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
              <button key={r} className="popover-item role-item" onClick={() => { switchRole(r); setUserOpen(false); notify(`Demo role switched to ${ROLE_LABELS[r]}.`); }}>
                <span>{ROLE_LABELS[r]}</span>
                {r === role && <Icon name="check" />}
              </button>
            ))}
            {can("changeSettings") && (
              <Link href="/settings" className="popover-item" onClick={() => setUserOpen(false)}>
                <strong>Settings</strong><small>Console configuration</small>
              </Link>
            )}
            <button className="popover-item" onClick={() => { signOut(); setUserOpen(false); router.push("/login"); }}>
              <strong>Sign out</strong><small>End demo session</small>
            </button>
          </div>
        )}

        <main id="main">{children}</main>
      </div>
    </div>
  );
}
