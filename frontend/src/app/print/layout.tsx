export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-100 print:bg-white">
      <style>{`@page { size: letter; margin: 0.5in; } @media print { .print\\:hidden { display: none !important; } body { background: white; } }`}</style>
      {children}
    </div>
  );
}
