import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { AuthLayout } from "../components/AuthLayout";
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
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-ink-700">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 min-h-tap w-full rounded-lg border border-ink-200 px-3 text-sm"
          />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="block text-sm font-medium text-ink-700">
              Password
            </label>
            <Link
              to="/recover-password"
              className="tap-inline text-xs font-medium text-brand-700 hover:text-brand-800"
            >
              Forgot password?
            </Link>
          </div>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 min-h-tap w-full rounded-lg border border-ink-200 px-3 text-sm"
          />
        </div>
        {error ? <p className="text-sm text-tone-danger">{error}</p> : null}
        <button
          type="submit"
          disabled={submitting}
          className="tap w-full rounded-lg bg-accent-400 px-4 text-sm font-semibold text-ink-900 shadow-sm hover:bg-accent-500 disabled:opacity-60"
        >
          {submitting ? "Logging in…" : "Log in"}
        </button>
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
