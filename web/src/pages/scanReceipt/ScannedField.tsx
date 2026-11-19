import type { ReactNode } from "react";
import { Field } from "../../components/Field";
import { OriginChip } from "./OriginChip";
import type { Origin } from "./types";

export function ScannedField({
  label,
  htmlFor,
  origin,
  required,
  optional,
  attention,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  origin: Origin;
  required?: boolean;
  optional?: boolean;
  /** True when the band said this is one of the values to look at. */
  attention?: boolean;
  /** Shown under the control and wired to it, like any Field error. */
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <Field
      label={label}
      htmlFor={htmlFor}
      required={required}
      optional={optional}
      error={error}
      labelAction={<OriginChip origin={origin} />}
      wrapLabelAction
      hint={
        attention ? (
          <span className="font-medium text-tone-accent">Check this one against the receipt.</span>
        ) : undefined
      }
    >
      {children}
    </Field>
  );
}
