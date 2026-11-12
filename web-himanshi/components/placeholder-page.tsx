import Link from "next/link";
import { Navigation } from "@/components/navigation";

export function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return <main className="site-shell"><Navigation /><section className="placeholder-page"><p className="eyebrow"><span className="eyebrow-dot" /> PHASE 2 MODULE</p><h1>{title}</h1><p>{description}</p><Link className="button button-primary" href="/">Return to overview <span aria-hidden="true">↗</span></Link></section></main>;
}
