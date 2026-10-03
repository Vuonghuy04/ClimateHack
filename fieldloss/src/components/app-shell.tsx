"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { BarChart3, ClipboardPen, Timer, ArrowUpRight, Sprout, HardDrive } from "lucide-react";
import { useWorkspace, WorkspaceProvider } from "./workspace";

const navigation = [
  { href: "/", label: "New observation", icon: ClipboardPen },
  { href: "/records", label: "Records", icon: BarChart3 },
  { href: "/benchmark", label: "Benchmark", icon: Timer },
];

function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { state, storageError } = useWorkspace();
  const [configured, setConfigured] = useState<boolean | null>(null);
  useEffect(() => {
    let mounted = true;
    const check = () => fetch("/api/status", { cache: "no-store" }).then((response) => response.json()).then((data) => { if (mounted) setConfigured(Boolean(data.configured)); }).catch(() => { if (mounted) setConfigured(false); });
    void check(); const interval = setInterval(check, 30_000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  return <div className="app-shell">
    <a className="skip-link" href="#main-content">Skip to main content</a>
    <aside className="sidebar">
      <Link className="brand" href="/" aria-label="FieldLoss home"><span className="brand-mark"><Sprout size={23} aria-hidden="true" /></span><span>FieldLoss<span className="brand-caption">A field notebook</span></span></Link>
      <nav aria-label="Main navigation" className="main-nav">{navigation.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={`nav-item ${pathname === href ? "active" : ""}`} aria-current={pathname === href ? "page" : undefined}><Icon size={20} aria-hidden="true" /><span>{label}</span>{pathname === href && <span className="nav-active-mark" aria-hidden="true" />}</Link>)}</nav>
      <div className="sidebar-bottom">
        <div className="region-note"><span className="region-symbol" aria-hidden="true"><svg viewBox="0 0 48 32"><path d="m2 16 12-9 8 2 3-4 9 8-1 10-10 3-6-4-9 2z" /><path d="m39 7 3 2-1 4-3-1zM42 19l4 2-2 5-3-2z" /></svg></span><strong>Australia &amp; the Pacific</strong><p>Better evidence, from field to market.</p></div>
        <div className="storage-note"><HardDrive size={16} aria-hidden="true" /><span>{state.records.filter((record) => !record.isSample).length} entered observations<br /><small>Records saved in this browser</small></span></div>
      </div>
    </aside>
    <div className="main-area">
      <header className="topbar"><span className="topbar-location">Field notebook <span>/</span> {navigation.find((item) => item.href === pathname)?.label ?? "Observation"}</span><span className={`connection-status ${configured ? "configured" : ""}`}><span className="status-dot" aria-hidden="true" />{configured === null ? "Checking live AI" : configured ? "Live AI configured" : "Manual entry available"}</span></header>
      <main id="main-content" className="page-content">{storageError && <div className="notice error" role="alert">{storageError}</div>}{children}</main>
      <footer className="page-footer"><span>A local demo for Australia and the Pacific.</span><a href="https://www.fao.org/platform-food-loss-waste/food-loss/fao-flapp/en" target="_blank" rel="noreferrer">Inspired by FAO FLAPP <ArrowUpRight size={14} aria-hidden="true" /></a></footer>
    </div>
  </div>;
}

export function AppShell({ children }: { children: ReactNode }) { return <WorkspaceProvider><Shell>{children}</Shell></WorkspaceProvider>; }
