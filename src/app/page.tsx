import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BrainCircuit,
  GitBranch,
  Layers3,
  ShieldCheck,
  Sparkles,
  Terminal,
  Timer,
} from "lucide-react";

const steps = [
  { number: "01", title: "Drop in your logs", detail: "Paste an incident log or upload a file. We parse timestamps, services, and severity automatically.", icon: Terminal },
  { number: "02", title: "Follow the failure", detail: "Correlated errors become clusters. An interactive causal graph connects symptoms to the first bad signal.", icon: GitBranch },
  { number: "03", title: "Know what to do", detail: "Get an evidence-backed root cause, practical fixes, and a postmortem you can share.", icon: BrainCircuit },
];

export default function Home() {
  return (
    <main className="landing">
      <nav className="landing-nav shell">
        <Link href="/" className="wordmark"><span className="brand-icon"><Layers3 size={17} /></span>trace<span>lens</span></Link>
        <div className="nav-links"><a href="#how-it-works">How it works</a><Link href="/dashboard">Demo workspace</Link><Link href="/dashboard" className="nav-cta">Open TraceLens <ArrowUpRight size={15} /></Link></div>
      </nav>
      <section className="hero shell">
        <div className="hero-copy">
          <div className="eyebrow"><span className="status-dot" /> INCIDENT RESPONSE, WITH CONTEXT</div>
          <h1>The signal is<br />in the <span>noise.</span></h1>
          <p>Turn messy application logs into a clear incident timeline, a defensible root cause, and a fix worth shipping.</p>
          <div className="hero-actions"><Link href="/dashboard" className="button-primary">Try the live demo <ArrowRight size={16} /></Link><a href="#how-it-works" className="text-link">See how it works</a></div>
          <div className="trust-note"><ShieldCheck size={15} /> Works without an API key. Your logs stay on your machine in demo mode.</div>
        </div>
        <div className="preview-window">
          <div className="preview-top"><span className="window-dots"><i /><i /><i /></span><span>incident / INC-2481</span><span className="preview-live"><i /> RESOLVED</span></div>
          <div className="preview-content">
            <div className="preview-label">ROOT CAUSE · 12:04:03 UTC</div>
            <div className="preview-title">Database connection pool exhausted</div>
            <div className="preview-subtitle">High confidence <span>·</span> 4 supporting signals</div>
            <div className="preview-chain">
              <div className="chain-item"><span className="chain-node red" /><span>DB pool at capacity <small>50 / 50 connections</small></span><b>12:04:03</b></div>
              <div className="chain-link" />
              <div className="chain-item"><span className="chain-node amber" /><span>Upstream timeouts <small>Requests exceed 3s deadline</small></span><b>12:04:05</b></div>
              <div className="chain-link" />
              <div className="chain-item"><span className="chain-node violet" /><span>Retry storm <small>5 attempts per request</small></span><b>12:04:06</b></div>
              <div className="chain-link" />
              <div className="chain-item"><span className="chain-node blue" /><span>5xx rate elevated <small>34% · worker queue 2,914</small></span><b>12:04:19</b></div>
            </div>
            <div className="preview-evidence"><span>✓</span> Observed: active=50, max=50 <span>·</span> Hypothesis: retries amplified load</div>
          </div>
          <div className="preview-footer"><span><Sparkles size={13} /> Deterministic demo analysis</span><span>16 events</span></div>
        </div>
      </section>
      <section className="metrics shell"><div><strong>16</strong><span>parsed events</span></div><div><strong>6</strong><span>correlated clusters</span></div><div><strong>18<span className="metric-unit">s</span></strong><span>from first signal to impact</span></div><div><strong>94<span className="metric-unit">%</span></strong><span>root-cause confidence</span></div></section>
      <section id="how-it-works" className="steps-section shell">
        <div className="section-heading"><div className="eyebrow">FROM RAW LOGS TO RESOLUTION</div><h2>Less searching. More <span>understanding.</span></h2><p>One focused workflow from first signal to actionable follow-up.</p></div>
        <div className="step-grid">{steps.map(({ number, title, detail, icon: Icon }) => <article className="step-card" key={number}><div className="step-top"><span>{number}</span><Icon size={18} /></div><h3>{title}</h3><p>{detail}</p></article>)}</div>
      </section>
      <section className="closing shell"><div className="closing-icon"><Timer size={18} /></div><div><h2>Make the next incident shorter.</h2><p>Start with a realistic failure chain. No account, setup, or API key needed.</p></div><Link href="/dashboard" className="button-primary">Open the workspace <ArrowRight size={16} /></Link></section>
      <footer className="landing-footer shell"><Link href="/" className="wordmark"><span className="brand-icon"><Layers3 size={15} /></span>trace<span>lens</span></Link><span>Built for the moments your logs get loud.</span><span>Evidence first. Inference second.</span></footer>
    </main>
  );
}
