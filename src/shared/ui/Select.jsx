export default function Select({
  label,
  value,
  onChange,
  children,
  className = '',
  id,
  ...rest
}) {
  const selectId = id || (label ? `field-${label.toLowerCase().replace(/\W+/g, '-')}` : undefined);
  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && (
        <label htmlFor={selectId} className="eyebrow block">
          {label}
        </label>
      )}
      <select
        id={selectId}
        value={value}
        onChange={onChange}
        className="min-h-[44px] w-full rounded-smc border border-linestrong bg-bg2 px-3 py-2.5 text-[14px] text-ink transition focus:outline-2 focus:outline-offset-1 focus:outline-accent"
        {...rest}
      >
        {children}
      </select>
    </div>
  );
}