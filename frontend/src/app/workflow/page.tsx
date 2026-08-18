import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "How It Works — Southern Magnolia Movers",
  robots: { index: false, follow: false },
};

const css = `
.wf-root { --navy:#0e2a4a; --navy-700:#163a63; --gold:#c6a15b; --gold-soft:#efe4c8; --cream:#f7efdc; --ink:#1f2b3a; --muted:#5c6b7d; --line:rgba(14,42,74,0.12);
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; background:var(--cream); color:var(--ink); line-height:1.55; min-height:100vh; -webkit-font-smoothing:antialiased; }
.wf-root * { box-sizing:border-box; margin:0; padding:0; }
.wf-serif { font-family:Georgia,"Times New Roman",serif; }
.wf-header { background:var(--navy); color:#fff; padding:44px 24px 40px; text-align:center; }
.wf-header .eyebrow { color:var(--gold); letter-spacing:0.28em; text-transform:uppercase; font-size:12px; font-weight:600; margin-bottom:14px; }
.wf-header h1 { font-size:clamp(28px,5vw,44px); line-height:1.1; font-weight:400; }
.wf-header p { margin:14px auto 0; max-width:620px; color:rgba(255,255,255,0.72); font-size:15px; }
.wf-main { max-width:1120px; margin:0 auto; padding:48px 24px 24px; }
.wf-pipeline { display:flex; align-items:stretch; gap:0; flex-wrap:wrap; justify-content:center; }
.wf-step { flex:1 1 190px; min-width:180px; background:#fff; border:1px solid var(--line); border-radius:14px; padding:26px 20px 22px; text-align:center; position:relative; box-shadow:0 10px 30px rgba(14,42,74,0.06); transition:transform .25s ease, box-shadow .25s ease; }
.wf-step:hover { transform:translateY(-4px); box-shadow:0 16px 40px rgba(14,42,74,0.12); }
.wf-num { width:46px; height:46px; margin:0 auto 16px; border-radius:50%; background:var(--navy); color:var(--gold); display:flex; align-items:center; justify-content:center; font-family:Georgia,serif; font-size:20px; border:2px solid var(--gold); }
.wf-step h3 { font-size:16px; color:var(--navy); margin-bottom:8px; }
.wf-step .who { display:inline-block; font-size:11px; font-weight:600; letter-spacing:0.06em; text-transform:uppercase; color:var(--gold); background:var(--gold-soft); border-radius:999px; padding:3px 10px; margin-bottom:10px; }
.wf-step p { font-size:13.5px; color:var(--muted); }
.wf-arrow { align-self:center; flex:0 0 34px; display:flex; align-items:center; justify-content:center; color:var(--gold); }
.wf-arrow svg { width:26px; height:26px; }
.wf-side-title { text-align:center; margin:56px 0 22px; }
.wf-side-title span { display:inline-block; font-size:12px; letter-spacing:0.22em; text-transform:uppercase; color:var(--muted); position:relative; padding:0 16px; }
.wf-side-title span::before, .wf-side-title span::after { content:""; position:absolute; top:50%; width:60px; height:1px; background:var(--line); }
.wf-side-title span::before { right:100%; }
.wf-side-title span::after { left:100%; }
.wf-side-grid { display:grid; grid-template-columns:1fr 1fr; gap:20px; }
.wf-side-card { background:var(--navy); color:#fff; border-radius:14px; padding:26px 26px 24px; box-shadow:0 12px 34px rgba(14,42,74,0.16); }
.wf-side-card h3 { color:var(--gold); font-size:17px; margin-bottom:4px; }
.wf-side-card .who { font-size:12px; color:rgba(255,255,255,0.6); margin-bottom:12px; }
.wf-side-card ul { list-style:none; }
.wf-side-card li { font-size:13.5px; color:rgba(255,255,255,0.85); padding:6px 0 6px 22px; position:relative; }
.wf-side-card li::before { content:""; position:absolute; left:0; top:13px; width:8px; height:8px; border-radius:50%; background:var(--gold); }
.wf-footer { max-width:1120px; margin:40px auto 0; padding:24px; text-align:center; color:var(--muted); font-size:12.5px; border-top:1px solid var(--line); }
.wf-footer strong { color:var(--navy); }
@media (max-width:860px){ .wf-arrow{ flex-basis:100%; transform:rotate(90deg); margin:4px 0; } .wf-step{ flex-basis:100%; } .wf-side-grid{ grid-template-columns:1fr; } }
@media print { .wf-root{ background:#fff; } .wf-step,.wf-side-card{ box-shadow:none; } .wf-step:hover{ transform:none; } .wf-header{ padding:28px; } .wf-main{ padding-top:28px; } .wf-side-card{ background:#fff; color:var(--ink); border:1px solid var(--line); } .wf-side-card h3{ color:var(--navy); } .wf-side-card .who,.wf-side-card li{ color:var(--muted); } }
`;

function Arrow() {
  return (
    <div className="wf-arrow" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12h14" />
        <path d="m13 6 6 6-6 6" />
      </svg>
    </div>
  );
}

const STEPS = [
  { n: 1, who: "Customer · Staff", title: "Lead Captured", body: "A request comes in through the website estimate form or is entered by staff — with contact info, move details, and needs." },
  { n: 2, who: "Sales · Customer", title: "Quote Sent & Approved", body: "Staff build an itemized quote and send it. The customer reviews and approves it online." },
  { n: 3, who: "Dispatch", title: "Job Scheduled", body: "The approved quote becomes a job on the calendar with a date, crew, and trucks assigned." },
  { n: 4, who: "Crew", title: "Move Day", body: "The crew sees their assigned job on mobile and carries out the move from start to finish." },
  { n: 5, who: "Billing · Customer", title: "Invoice & Payment", body: "When the job is complete, an invoice is sent and the customer pays — closing out the move." },
];

export default function WorkflowPage() {
  return (
    <div className="wf-root" data-testid="workflow-page">
      <style dangerouslySetInnerHTML={{ __html: css }} />

      <header className="wf-header">
        <div className="eyebrow">Southern Magnolia Movers</div>
        <h1 className="wf-serif">How Every Move Flows</h1>
        <p>From the first estimate request to the final payment — a clear, simple picture of how a job moves through the system, and who handles each step.</p>
      </header>

      <main className="wf-main">
        <section className="wf-pipeline" aria-label="Main workflow">
          {STEPS.map((s, i) => (
            <div key={s.n} style={{ display: "contents" }}>
              <div className="wf-step">
                <div className="wf-num">{s.n}</div>
                <span className="who">{s.who}</span>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </div>
              {i < STEPS.length - 1 && <Arrow />}
            </div>
          ))}
        </section>

        <div className="wf-side-title"><span>Along the way</span></div>
        <section className="wf-side-grid" aria-label="Supporting tools">
          <div className="wf-side-card">
            <h3>Customer Portal</h3>
            <div className="who">What your customers see</div>
            <ul>
              <li>Review and approve their quote</li>
              <li>Track their scheduled move</li>
              <li>View invoices and make payment</li>
            </ul>
          </div>
          <div className="wf-side-card">
            <h3>Crew Mobile</h3>
            <div className="who">What your crew sees on the job</div>
            <ul>
              <li>Their assigned jobs for the day</li>
              <li>Customer and move-day details</li>
              <li>Everything they need, right on their phone</li>
            </ul>
          </div>
        </section>
      </main>

      <footer className="wf-footer">
        <strong>Southern Magnolia Movers</strong> — one simple flow from first contact to final payment.
      </footer>
    </div>
  );
}
