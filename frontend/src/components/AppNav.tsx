import Link from "next/link";

export default function AppNav() {
  return <nav aria-label="Main navigation" className="app-nav">
    <Link href="/" className="brand">DigInSync<span>Infrastructure coordination · Bengaluru</span></Link>
    <div className="flex flex-wrap gap-4 text-sm font-medium">
      <Link href="/">New project</Link><Link href="/dashboard">Dashboard</Link><Link href="/proposals">Saved proposals</Link>
    </div>
  </nav>;
}
