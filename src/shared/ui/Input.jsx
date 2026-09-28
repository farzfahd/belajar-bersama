// `warning` = "belum lengkap" (kuning), `error` = "tidak valid" (merah).
// Tanpa keduanya field tampil netral (putih/border normal) supaya warna
// selalu punya arti, bukan dekorasi.
//
// Tiga aturan yang dijaga di sini:
//  1. Id field & id teks bantuan dihitung SEKALI, dan `aria-describedby` hanya
//     dipasang kalau teks bantuannya benar-benar dirender. Dulu `hint` dirender
//     tanpa `id` sementara `aria-describedby` tetap menunjuk ke sana, jadi
//     screen reader mendapat referensi menggantung.
//  2. Tanpa `label` dan tanpa `id`, id bantuan tidak boleh jadi string
//     "undefined-help".
//  3. Pesan error memakai `role="alert"` supaya diumumkan saat muncul — error
//     tidak boleh hanya dari warna border yang berubah merah.
import { useId } from 'react';

const slug = (text) => text.toLowerCase().replace(/\W+/g, '-');

export default function Input({
  label,
  hint,
  error,
  warning,
  className = '',
  id,
  ...rest
}) {
  const autoId = useId();
  const inputId = id || (label ? `field-${slug(label)}` : undefined);
  // `aria-describedby` harus menunjuk elemen yang benar-benar ada di DOM.
  const helpId = `${inputId || `field-${autoId}`}-help`;
  const invalid = Boolean(error);
  const incomplete = !invalid && Boolean(warning);
  const help = error || warning || hint;

  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && (
        <label htmlFor={inputId} className="eyebrow block">
          {label}
        </label>
      )}
      <input
        id={inputId}
        aria-invalid={invalid || undefined}
        aria-describedby={help ? helpId : undefined}
        className={`min-h-[44px] w-full rounded-smc border bg-sunken px-3 py-2.5 text-[14px] text-ink placeholder:text-dimmer transition focus:outline-2 focus:outline-offset-1 focus:outline-accent ${
          invalid
            ? 'border-danger'
            : incomplete
              ? 'border-warn'
              : 'border-line hover:border-linestrong'
        }`}
        {...rest}
      />
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
