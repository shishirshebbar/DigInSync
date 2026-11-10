"use client";

import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";

export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    overview: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    projects: <path d="M3 7h7l2 2h9v11H3V4h7l2 3" />,
    proposals: (
      <>
        <path d="M7 3h10l3 3v15H4V3h3M8 11h8M8 15h6M14 3v5h6" />
      </>
    ),
    data: (
      <>
        <ellipse cx="12" cy="5" rx="9" ry="3" />
        <path d="M3 5v7c0 4 18 4 18 0V5M3 12v7c0 4 18 4 18 0v-7" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    menu: <path d="M4 6h16M4 12h16M4 18h16" />,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    check: <path d="m5 12 4 4L19 6" />,
    warning: <path d="m12 3 10 18H2L12 3zM12 9v5M12 17v.1" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] ?? paths.projects}
    </svg>
  );
}

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  back,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  actions?: ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <header className="page-header">
      <div>
        {back && (
          <Link className="breadcrumb" href={back.href}>
            {back.label} /
          </Link>
        )}
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {actions && <div className="header-actions">{actions}</div>}
    </header>
  );
}

export function Panel({
  title,
  description,
  actions,
  children,
  className = "",
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`} aria-label={title}>
      {title && (
        <header className="panel-header">
          <div>
            <h2>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const tone = /APPROVED|COMPLETED/.test(status)
    ? "success"
    : /REJECTED|HIGH|FAILED/.test(status)
      ? "danger"
      : /MEDIUM|WARNING/.test(status)
        ? "warning"
        : "neutral";
  return (
    <span className={`status-badge badge-${tone}`}>
      {status.replaceAll("_", " ").toLowerCase()}
    </span>
  );
}

export function Notice({
  children,
  tone = "info",
  alert = false,
}: {
  children: ReactNode;
  tone?: "info" | "warning" | "error" | "success";
  alert?: boolean;
}) {
  return (
    <div className={`notice notice-${tone}`} role={alert ? "alert" : undefined}>
      {children}
    </div>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <Icon name="projects" size={28} />
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function SectionNav({
  items,
  label,
}: {
  label: string;
  items: { href: string; label: string; active: boolean }[];
}) {
  return (
    <nav className="section-nav" aria-label={label}>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          scroll={false}
          aria-current={item.active ? "page" : undefined}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

export function Warnings({
  warnings,
  title = "Coverage notes",
}: {
  warnings: string[];
  title?: string;
}) {
  const unique = [...new Set(warnings)];
  return unique.length > 0 ? (
    <details className="limitations">
      <summary>
        <Icon name="warning" size={16} />
        {title}
        <span className="muted">{unique.length}</span>
      </summary>
      <ul>
        {unique.map((warning) => (
          <li key={warning}>{warning}</li>
        ))}
      </ul>
    </details>
  ) : null;
}

export function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
    return () => {
      if (open) trigger?.focus();
    };
  }, [open]);
  return (
    <dialog ref={dialog} className="modal" aria-label={title} onCancel={onClose} onClose={onClose}>
      <div className="panel-header">
        <h2>{title}</h2>
        <button type="button" className="btn-quiet" aria-label={`Close ${title}`} onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      {children}
    </dialog>
  );
}

export function displayDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}
