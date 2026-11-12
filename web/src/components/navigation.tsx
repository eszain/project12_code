"use client";

import Link from "next/link";
import { useState } from "react";

const links = [
  ["Overview", "/"], ["Vision", "/vision"], ["Events", "/events"], ["Analysis", "/analysis"], ["Alerts", "/alerts"], ["About", "#about"],
];

export function Navigation({ landing = false }: { landing?: boolean }) {
  const [open, setOpen] = useState(false);
  return <header className="site-nav"><Link className="brand" href="/"><span className="brand-mark">◈</span><span>CADS</span><span className="version-tag" aria-label="Version 0.2.5">v0.2.5</span>{landing ? <span className="brand-subtitle">Collision Avoidance<br />Decision Support</span> : null}</Link><button className="menu-button" aria-expanded={open} aria-controls="primary-navigation" onClick={() => setOpen(!open)}>{open ? "Close" : "Menu"}</button><nav id="primary-navigation" className={open ? "nav-links is-open" : "nav-links"} aria-label="Primary navigation">{links.map(([label, href]) => <Link className={landing && label === "Overview" ? "nav-active" : undefined} key={label} href={href} onClick={() => setOpen(false)}>{label}</Link>)}<Link className="nav-console" href="/dashboard" onClick={() => setOpen(false)}><span className="user-icon" aria-hidden="true">●</span>{landing ? "Operator Console" : "Console"} <span aria-hidden="true">↗</span></Link></nav></header>;
}
