import Spinner from './Spinner';

export default function SplashScreen({ label = 'Memuat…' }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-bg text-dim">
      <div className="px-4 text-center">
        <div className="font-mono text-[10px] font-medium uppercase tracking-[.18em] text-dimmer">
          Buku belajar · dua orang
        </div>
        <div className="mt-2 font-head text-[22px] font-medium text-ink">Belajar Bersama</div>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <Spinner size={14} />
        {label}
      </div>
    </div>
  );
}