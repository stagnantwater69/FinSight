import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { AuthLayout } from "../components/AuthLayout";
import { Button } from "../components/Button";
import { Field, FormError, TextInput } from "../components/Field";
import { getErrorMessage } from "../lib/errors";

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login({ email, password });
      navigate("/business-profiles");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Log in"
      subtitle="Welcome back."
      heroBody={
        <>
          An AI-assisted financial monitoring platform that helps small business owners record expenses, track
          sales reference, and understand where their money goes.
        </>
      }
      points={[
        "Manage multiple business profiles in one account",
        "Scan receipts, import CSV, or add records manually",
        "Ask FinSight to explain your insights in plain language",
      ]}
    >
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
        <Field
          label="Password"
          htmlFor="password"
          required
          labelAction={
            <Link
              to="/recover-password"
              className="tap-inline text-xs font-medium text-brand-700 hover:text-brand-800"
            >
              Forgot password?
            </Link>
          }
        >
          <TextInput
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        {error ? <FormError>{error}</FormError> : null}
        <Button type="submit" variant="primary" fullWidth disabled={submitting}>
          {submitting ? "Logging in…" : "Log in"}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-ink-500">
        Don't have an account?{" "}
        <Link to="/register" className="tap-inline font-medium text-brand-700 hover:text-brand-800">
          Register
        </Link>
      </p>
    </AuthLayout>
  );
}
