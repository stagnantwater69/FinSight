import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type AriaAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

/**
 * Form fields, with the labelling and error obligations built in.
 *
 * Why this exists: before it, every form in the app hand-rolled the same
 * markup — `<label>` + `<input className="mt-1 min-h-tap w-full rounded-lg
 * border border-ink-200 px-3 text-sm">`. That string appeared 63 times across
 * 17 files, and it carried two bugs everywhere it was pasted:
 *
 *   1. It omits `bg-paper text-ink-900`. The Records toolbar included them;
 *      no form did. So in the Dark theme every form field rendered as the
 *      browser default — white box, black text — on a near-black card, while
 *      the identical-looking field on Records rendered correctly. The token
 *      system was doing its job; the call sites just weren't asking it to.
 *
 *   2. Nothing tied an error message to the field it belonged to. Errors were
 *      bare `<p>` tags with no `role="alert"`, no `aria-describedby` and no
 *      `aria-invalid`, so a failed save was completely silent to a screen
 *      reader.
 *
 * Both are the kind of thing that is fixed once here and then cannot be got
 * wrong again — the same reasoning `Button.tsx` applies to the tap floor and
 * `ui.tsx` applies to colour-alone status. A call site nests an input inside a
 * <Field> and the wiring happens whether or not the author thought about it.
 *
 * The wiring travels by context rather than by props, because the alternative
 * is asking every call site to thread `id`, `aria-describedby` and
 * `aria-invalid` through by hand — which is exactly the step that was being
 * skipped. Each input still accepts explicit overrides for the handful of
 * places that lay out their own label (the Records toolbar, CategorySelect).
 */

interface FieldContextValue {
  /** The id the control must carry, so the <label htmlFor> resolves. */
  id: string;
  /** Space-joined ids of the hint and error text, for aria-describedby. */
  describedBy?: string;
  invalid: boolean;
}

const FieldContext = createContext<FieldContextValue | null>(null);

/**
 * The shared input chrome. Every control in this file starts from it, which is
 * what keeps a <select> and an <input> the same height and the same colour.
 *
 * `bg-paper text-ink-900` are the two that were missing everywhere — see the
 * note at the top of the file. `placeholder:text-ink-400` uses the muted step
 * deliberately: placeholder text is duplicated by the label above it, so it is
 * the one place ink-400 is allowed to sit below 4.5:1.
 */
const CONTROL_BASE =
  "min-h-tap w-full rounded-lg border border-ink-200 bg-paper px-3 text-sm text-ink-900 placeholder:text-ink-400 disabled:cursor-not-allowed disabled:opacity-60";

/** A field in an error state states it with a border too, not colour alone. */
const CONTROL_INVALID = "border-edge-danger";

/**
 * Resolves a control's id and ARIA wiring, preferring an explicit prop over the
 * enclosing <Field>. The explicit escape hatch exists for the few call sites
 * that lay out their own label — the Records toolbar, CategorySelect.
 */
function useFieldWiring(props: {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: AriaAttributes["aria-invalid"];
}) {
  const ctx = useContext(FieldContext);
  return {
    id: props.id ?? ctx?.id,
    describedBy: props["aria-describedby"] ?? ctx?.describedBy,
    invalid: props["aria-invalid"] ?? (ctx?.invalid ? true : undefined),
  };
}

// ============================================================
// Field — label, hint, error, and the wiring between them
// ============================================================

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required = false,
  optional = false,
  labelAction,
  className = "",
  children,
}: {
  label: ReactNode;
  /** Overrides the generated id, for controls that already have a fixed one. */
  htmlFor?: string;
  /**
   * Plain-language explanation under the label. This is the mechanism the
   * business-profile setup figures use to say what they actually mean — a
   * number whose effect the owner doesn't understand is a number they can't
   * enter correctly.
   */
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  /** Renders the "(optional)" affordance forms were writing by hand. */
  optional?: boolean;
  /** Trailing control on the label row — e.g. Login's "Forgot password?". */
  labelAction?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const generatedId = useId();
  const id = htmlFor ?? generatedId;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;

  return (
    <FieldContext.Provider value={{ id, describedBy, invalid: Boolean(error) }}>
      <div className={className}>
        <div className="flex items-center justify-between gap-3">
          <label htmlFor={id} className="block text-sm font-medium text-ink-700">
            {label}
            {optional ? <span className="ml-1 font-normal text-ink-400">(optional)</span> : null}
            {required ? (
              <span className="ml-1 text-tone-danger" title="Required">
                <span aria-hidden>*</span>
                <span className="sr-only">(required)</span>
              </span>
            ) : null}
          </label>
          {labelAction ? <div className="shrink-0">{labelAction}</div> : null}
        </div>

        {hint ? (
          <p id={hintId} className="mt-1 text-xs leading-relaxed text-ink-500">
            {hint}
          </p>
        ) : null}

        <div className="mt-1.5">{children}</div>

        {/*
          role="alert" so a validation failure is announced the moment it
          appears. The glyph is here because severity must never be carried by
          colour alone — the same rule Alert.tsx and ui.tsx follow.
        */}
        {error ? (
          <p id={errorId} role="alert" className="mt-1.5 flex items-start gap-1.5 text-xs text-tone-danger">
            <span aria-hidden className="mt-px shrink-0">
              ⚠
            </span>
            <span className="min-w-0">{error}</span>
          </p>
        ) : null}
      </div>
    </FieldContext.Provider>
  );
}

// ============================================================
// The controls
// ============================================================

export function TextInput({ className = "", ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  const { id, describedBy, invalid } = useFieldWiring(rest);
  return (
    <input
      {...rest}
      id={id}
      aria-describedby={describedBy}
      aria-invalid={invalid}
      className={`${CONTROL_BASE} ${invalid ? CONTROL_INVALID : ""} ${className}`.trim()}
    />
  );
}

export function SelectInput({ className = "", children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  const { id, describedBy, invalid } = useFieldWiring(rest);
  return (
    <select
      {...rest}
      id={id}
      aria-describedby={describedBy}
      aria-invalid={invalid}
      className={`${CONTROL_BASE} ${invalid ? CONTROL_INVALID : ""} ${className}`.trim()}
    >
      {children}
    </select>
  );
}

export function Textarea({ className = "", ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { id, describedBy, invalid } = useFieldWiring(rest);
  return (
    <textarea
      {...rest}
      id={id}
      aria-describedby={describedBy}
      aria-invalid={invalid}
      className={`${CONTROL_BASE} py-2.5 ${invalid ? CONTROL_INVALID : ""} ${className}`.trim()}
    />
  );
}

/**
 * A peso amount.
 *
 * `inputMode="decimal"` is the point of it. `type="number"` alone gives
 * Android's numeric keypad, which on several stock keyboards has no decimal
 * separator at all — so an owner entering PHP 1,250.50 on a cheap phone
 * physically could not type the centavos. `type` stays `number` so the
 * existing `min`/`step` validation and the `Number(e.target.value)` call sites
 * keep behaving exactly as they did.
 *
 * The PHP prefix is aria-hidden: it is a visual affordance, and the label
 * already says which currency this is.
 */
export function MoneyInput({ className = "", ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  const { id, describedBy, invalid } = useFieldWiring(rest);
  return (
    <div className="relative">
      <span
        aria-hidden
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-ink-400"
      >
        PHP
      </span>
      <input
        type="number"
        inputMode="decimal"
        step="0.01"
        {...rest}
        id={id}
        aria-describedby={describedBy}
        aria-invalid={invalid}
        className={`${CONTROL_BASE} figure pl-12 ${invalid ? CONTROL_INVALID : ""} ${className}`.trim()}
      />
    </div>
  );
}

/**
 * A file chooser that says what it accepts, what you picked, and why it said
 * no.
 *
 * The native control does none of that: it renders as an unstyled OS button
 * with a "No file chosen" label, ignores the theme entirely, and silently
 * accepts a 40MB photo that the OCR endpoint will then reject after a long
 * upload. Both file inputs in the app (receipt scan, CSV import) were that
 * control.
 *
 * Rejection is handled here rather than handed back to the caller, for the
 * same reason the error wiring is: validation that call sites have to remember
 * is validation that gets skipped. The message is announced (`role="alert"`)
 * and the selection is cleared, so the form can never submit a file that was
 * rejected on screen.
 */
export function FileInput({
  accept,
  maxBytes,
  onSelect,
  file,
  hintText,
  disabled = false,
  id: idProp,
}: {
  accept?: string;
  /** Rejects anything larger, before it is ever uploaded. */
  maxBytes?: number;
  onSelect: (file: File | null) => void;
  /** The currently selected file, so the caller stays the source of truth. */
  file: File | null;
  /** Describes what to drop here — e.g. "JPG or PNG, up to 8MB". */
  hintText?: string;
  disabled?: boolean;
  id?: string;
}) {
  const ctx = useContext(FieldContext);
  const generatedId = useId();
  const id = idProp ?? ctx?.id ?? generatedId;
  const [rejected, setRejected] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  function accepts(f: File): boolean {
    if (!accept) return true;
    const patterns = accept.split(",").map((p) => p.trim().toLowerCase());
    const name = f.name.toLowerCase();
    const type = f.type.toLowerCase();
    return patterns.some((p) => {
      if (p.startsWith(".")) return name.endsWith(p);
      if (p.endsWith("/*")) return type.startsWith(p.slice(0, -1));
      return type === p;
    });
  }

  function take(f: File | null) {
    setRejected(null);
    if (!f) {
      onSelect(null);
      return;
    }
    if (!accepts(f)) {
      setRejected(`${f.name} isn't a file type this accepts. Expected ${accept}.`);
      onSelect(null);
      return;
    }
    if (maxBytes && f.size > maxBytes) {
      const limit = Math.round(maxBytes / (1024 * 1024));
      setRejected(`${f.name} is ${formatBytes(f.size)}. The limit is ${limit}MB — try a smaller file.`);
      onSelect(null);
      return;
    }
    onSelect(f);
  }

  return (
    <div>
      <label
        htmlFor={id}
        onDragOver={(e) => {
          if (disabled) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          if (disabled) return;
          e.preventDefault();
          setDragging(false);
          take(e.dataTransfer.files?.[0] ?? null);
        }}
        className={`flex min-h-tap cursor-pointer flex-wrap items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-5 text-center text-sm transition-colors ${
          disabled
            ? "cursor-not-allowed border-ink-200 bg-paper-100 opacity-60"
            : dragging
              ? "border-edge-brand bg-tint-brand text-tone-brand"
              : "border-ink-200 bg-paper-100 text-ink-600 hover:border-edge-brand hover:bg-tint-brand"
        }`}
      >
        <span aria-hidden className="text-base">
          ⇪
        </span>
        <span className="font-medium">{file ? "Choose a different file" : "Choose a file"}</span>
        <span className="text-ink-400">or drag it here</span>
      </label>

      <input
        id={id}
        type="file"
        accept={accept}
        disabled={disabled}
        className="sr-only"
        onChange={(e) => take(e.target.files?.[0] ?? null)}
      />

      {hintText ? <p className="mt-1.5 text-xs text-ink-500">{hintText}</p> : null}

      {/*
        The filename echo. Without it the only confirmation that a file was
        picked is the native control's own label, which this replaces.
      */}
      {file ? (
        <p className="mt-2 flex items-center gap-2 rounded-lg bg-tint-brand px-3 py-2 text-xs text-tone-brand ring-1 ring-edge-brand">
          <span aria-hidden>✓</span>
          <span className="min-w-0 flex-1 truncate font-medium">{file.name}</span>
          <span className="figure shrink-0 text-ink-500">{formatBytes(file.size)}</span>
        </p>
      ) : null}

      {rejected ? (
        <p role="alert" className="mt-2 flex items-start gap-1.5 text-xs text-tone-danger">
          <span aria-hidden className="mt-px shrink-0">
            ⚠
          </span>
          <span className="min-w-0">{rejected}</span>
        </p>
      ) : null}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ============================================================
// FormError — the whole-form failure
// ============================================================

/**
 * A submit that failed for a reason that isn't about one field: a rejected
 * login, a dropped connection, a server error.
 *
 * It takes focus when it appears. That is the part that was missing: the
 * previous bare `<p>` left a keyboard user sitting on the Save button with no
 * indication anything had happened, and a screen-reader user with no
 * indication at all. Moving focus here both announces the message and puts the
 * user at the top of what they need to fix.
 */
export function FormError({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  // Focus on mount only. A ref callback would re-run on every render and keep
  // yanking focus back here while the error is on screen — including after the
  // user has deliberately tabbed away to fix the field it is complaining about.
  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <div
      ref={ref}
      role="alert"
      tabIndex={-1}
      className="flex items-start gap-2.5 rounded-lg bg-tint-danger p-3 text-sm text-tone-danger outline-none ring-1 ring-edge-danger"
    >
      <span aria-hidden className="mt-px shrink-0">
        ⚠
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
