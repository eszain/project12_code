import Link from "next/link";
import { Navigation } from "@/components/navigation";
import { Reveal } from "@/components/reveal";
import { EarthVisual } from "@/components/scene/earth-visual";

const features = [
  { index: "01", title: "Event Monitoring", text: "Keep conjunction activity legible as it evolves from first notice to closest approach.", icon: "radar" },
  { index: "02", title: "CDM Review", text: "Inspect and compare conjunction data updates with source context.", icon: "signal" },
  { index: "03", title: "Risk Analysis", text: "Understand reported risk values without hiding uncertainty or provenance.", icon: "vector" },
  { index: "04", title: "Operator Insight", text: "Support informed decisions while keeping people in control.", icon: "shield" },
];

function FeatureGlyph({ type }: { type: string }) {
  if (type === "radar") return <svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="16" /><circle cx="24" cy="24" r="9" /><path d="M24 24 37 12M24 24h.01" /><path className="glyph-accent" d="M8 24a16 16 0 0 1 16-16" /></svg>;
  if (type === "signal") return <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M7 35h34M11 29l7-8 6 5 13-16" /><circle cx="37" cy="10" r="3" /><path className="glyph-accent" d="M11 39v-4M19 39v-8M27 39v-13M35 39v-20" /></svg>;
  if (type === "shield") return <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 6 38 12v10c0 9-5.7 15.7-14 20-8.3-4.3-14-11-14-20V12L24 6Z" /><path className="glyph-accent" d="m17 24 5 5 10-11" /></svg>;
  return <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M8 33h32M12 33V18h24v15M18 18v-5h12v5M24 13v-6M20 7h8" /><path className="glyph-accent" d="m8 33 8 7 8-7 8 7 8-7" /></svg>;
}

export default function Home() {
  return (
    <main className="site-shell landing-shell">
      <Navigation landing />
      <section className="hero-section" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow"><span className="eyebrow-dot" /> CSA / ENG 4000 CAPSTONE</p>
          <h1 id="hero-title"><span className="hero-line">Satellite</span><span className="hero-line">Collision Risk,</span><span className="hero-line hero-accent">Clearly Understood.</span></h1>
          <p className="hero-description">A decision-support interface for monitoring close approaches, reviewing conjunction data, and supporting informed operational decisions for spacecraft safety.</p>
          <div className="hero-actions">
            <Link className="button button-primary" href="/dashboard"><span className="button-grid-icon" aria-hidden="true">⊞</span>Open Dashboard <span aria-hidden="true">→</span></Link>
            <a className="button button-secondary hero-secondary" href="#capabilities"><span className="play-icon" aria-hidden="true">▷</span>See How It Works</a>
          </div>
        </div>
        <div className="hero-visual" aria-label="Interactive 3D orbital visualization. Decorative Earth, satellite, and debris objects are not live orbital predictions.">
          <div className="visual-label visual-label-top">ORBITAL VISUALIZATION <span className="status-pip" /></div>
          <EarthVisual />
          <div className="visual-label visual-label-bottom"><span>01</span> EARTH / LOW-EARTH ORBIT</div>
        </div>
      </section>

      <section className="capabilities-section" id="capabilities" aria-labelledby="capabilities-title">
        <div className="feature-grid">
          {features.map((feature, index) => <Reveal key={feature.index} delay={index * 90}><article className="feature-card"><div className="feature-topline"><span className="feature-index">{feature.index}</span><span className="feature-icon"><FeatureGlyph type={feature.icon} /></span></div><h3>{feature.title}</h3><p>{feature.text}</p><span className="feature-arrow" aria-hidden="true">↗</span></article></Reveal>)}
        </div>
      </section>

      <footer className="site-footer" id="about"><div><span className="brand-mark">◈</span><span>CADS / PROJECT 12</span></div><p>ENG 4000 Capstone · Modernization of the Collision Avoidance Detection System · Project partner: Canadian Space Agency</p><span className="footer-year">2026—27</span></footer>
    </main>
  );
}
