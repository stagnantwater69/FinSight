import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { AuthLayout } from "../components/AuthLayout";
import { Button } from "../components/Button";
import { Field, FormError, TextInput } from "../components/Field";
import { api } from "../lib/api";
import { getErrorMessage } from "../lib/errors";

export function RecoverPassword() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post("/auth/recover-password", { email });
      setSent(true);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Recover password"
      subtitle="We'll email you a link to reset it."
      heroTitle="Reset your password."
      heroBody="Enter the email linked to your FinSight account and we'll send a recovery link so you can get back to your records."
    >
      {sent ? (
        <p className="text-center text-sm text-ink-600">
          If that email is registered, a reset link is on its way. Check your inbox.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Email" htmlFor="email" required>
            <TextInput
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          {error ? <FormError>{error}</FormError> : null}
          <Button type="submit" variant="primary" fullWidth disabled={submitting}>
            {submitting ? "Sending…" : "Send reset link"}
          </Button>
        </form>
      )}
      <p className="mt-6 text-center text-sm text-ink-500">
        <Link to="/login" className="tap-inline font-medium text-brand-700 hover:text-brand-800">
          Back to log in
        </Link>
      </p>
    </AuthLayout>
  );
}
