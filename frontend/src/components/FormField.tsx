"use client";

import { cloneElement, useId } from "react";

type ControlProps = {
  id?: string;
  name?: string;
  required?: boolean;
  onBlur?: () => void;
  "aria-required"?: boolean;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
  "aria-labelledby"?: string;
};
export function Field({
  label,
  name,
  required = false,
  error,
  onBlur,
  children,
}: {
  label: string;
  name: string;
  required?: boolean;
  error?: string;
  onBlur?: () => void;
  children: React.ReactElement<ControlProps>;
}) {
  const id = useId();
  const labelId = `${id}-label`;
  const errorId = `${id}-error`;
  return (
    <div>
      <label htmlFor={id} className={`field-label${error ? " field-label-error" : ""}`}>
        <span id={labelId}>{label}</span>
        {required && (
          <span className="required-marker" aria-hidden="true">
            {" "}
            *
          </span>
        )}
      </label>
      {cloneElement(children, {
        id,
        name,
        required,
        onBlur,
        "aria-required": required || undefined,
        "aria-invalid": Boolean(error),
        "aria-describedby": error ? errorId : undefined,
        "aria-labelledby": labelId,
      })}
      <p id={errorId} className="field-feedback">
        {error ?? ""}
      </p>
    </div>
  );
}
