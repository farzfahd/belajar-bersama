// Sama seperti Input: `error` merah (tidak valid), `warning` kuning (belum
// lengkap), tanpa keduanya netral. Aturan `aria-describedby`, id yang dirender
// dengan benar, dan `role="alert"` untuk error punya alasan yang sama seperti di
// Input.jsx — tidak diulang dengan cara berbeda.
import { useId } from 'react';

const slug = (text) => text.toLowerCase().replace(/\W+/g, '-');

export default function Select({
  label,
  value,
  onChange,
  hint,
  error,
  warning,
  children,
  className = '',
  id,
  ...rest
}) {
  const autoId = useId();
  const selectId = id || (label ? `field-${slug(label)}` : undefined);
  const helpId = `${selectId || `field-${autoId}`}-help`;
  const invalid = Boolean(error);
  const incomplete = !invalid && Boolean(warning);
  const help = error || warning || hint;

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
        aria-invalid={invalid || undefined}
        aria-describedby={help ? helpId : undefined}
        className={`min-h-[44px] w-full rounded-smc border bg-sunken px-3 py-2.5 text-[14px] text-ink transition focus:outline-2 focus:outline-offset-1 focus:outline-accent ${
          invalid
            ? 'border-danger'
            : incomplete
              ? 'border-warn'
              : 'border-line hover:border-linestrong'
        }`}
        {...rest}
      >
        {children}
      </select>
      {error ? (
        <p id={helpId} role="alert" className="text-[12px] text-danger">
          {error}
        </p>
      ) : (
        incomplete && (
          <p id={helpId} className="text-[12px] text-warn">
            {warning}
          </p>
        )
      )}
      {!invalid && !incomplete && hint && (
        <p id={helpId} className="text-[12px] text-dimmer">
          {hint}
        </p>
      )}
    </div>
  );
}
