import { useId, type InputHTMLAttributes } from "react";
import "./forms.css";

interface FormFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | undefined;
  hint?: string;
  multiline?: boolean;
}

export function FormField({
  label,
  value,
  onChange,
  error,
  hint,
  multiline = false,
  ...inputProps
}: FormFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ");
  const shared = {
    id,
    value,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy || undefined,
  };
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {hint ? (
        <p id={hintId} className="field-hint">
          {hint}
        </p>
      ) : null}
      {multiline ? (
        <textarea
          {...shared}
          rows={4}
          maxLength={inputProps.maxLength}
          disabled={inputProps.disabled}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input {...inputProps} {...shared} onChange={(event) => onChange(event.target.value)} />
      )}
      {error ? (
        <p id={errorId} className="field-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
