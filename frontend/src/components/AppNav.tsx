"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ActivityButton } from "@/components/ActivityProvider";
import { Icon, Modal } from "@/components/ui";

const links = [
  { href: "/", label: "Overview", icon: "overview" },
  { href: "/projects", label: "Projects", icon: "projects" },
  { href: "/proposals", label: "Proposals", icon: "proposals" },
  { href: "/data-context", label: "Data context", icon: "data" },
];

export default function AppNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  function navigation() {
    return (
      <nav aria-label="Main navigation" className="primary-nav">
        {links.map((link) => (
          <Link
            href={link.href}
            key={link.href}
            onClick={() => setOpen(false)}
            aria-current={
              (link.href === "/" ? pathname === "/" : pathname.startsWith(link.href))
                ? "page"
                : undefined
            }
          >
            <Icon name={link.icon} />
            {link.label}
          </Link>
        ))}
      </nav>
    );
  }
  return (
    <>
      <aside className="app-sidebar">
        <Link href="/" className="brand">
          <span className="brand-mark">D</span>
          <span>
            DigInSync<small>INFRASTRUCTURE COORDINATION</small>
          </span>
        </Link>
        {navigation()}
        <div className="sidebar-footer">
          <span className="location-dot" />
          Bengaluru<span className="block text-xs mt-2 muted">Local coordination workspace</span>
        </div>
      </aside>
      <header className="app-topbar">
        <div className="flex items-center gap-3">
          <button
            className="btn-quiet mobile-menu"
            aria-label="Open navigation"
            onClick={() => setOpen(true)}
          >
            <Icon name="menu" />
          </button>
          <span className="topbar-label">
            Infrastructure coordination <span className="muted">/ Bengaluru</span>
          </span>
        </div>
        <div className="flex gap-2 items-center">
          <ActivityButton />
          <Link href="/projects/new" className="btn-primary">
            <Icon name="plus" size={16} />
            <span>New project</span>
          </Link>
        </div>
      </header>
      <Modal open={open} title="Navigation" onClose={() => setOpen(false)}>
        {navigation()}
        <p className="muted text-sm mt-6">DigInSync · Bengaluru</p>
      </Modal>
    </>
  );
}
