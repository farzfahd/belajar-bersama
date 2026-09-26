export default function Input({
  label,
  hint,
  error,
  className = '',
  id,
  ...rest
}) {
  const inputId = id || (label ? `field-${label.toLowerCase().replace(/\W+/g, '-')}` : undefined);
  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && (
        <label htmlFor={inputId} className="eyebrow block">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={`min-h-[44px] w-full rounded-smc border bg-bg2 px-3 py-2.5 text-[14px] text-ink placeholder:text-dimmer transition focus:outline-2 focus:outline-offset-1 focus:outline-accent ${
          error ? 'border-accent' : 'border-linestrong'
        }`}
        {...rest}
      />
      {hint && !error && <p className="text-[12px] text-dimmer">{hint}</p>}
      {error && <p className="text-[12px] text-accent">{error}</p>}
    </div>
  );
}