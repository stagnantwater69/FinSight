import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { AuthLayout } from "../components/AuthLayout";
import { getErrorMessage } from "../lib/errors";

export function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    firstName: "",
    middleName: "",
    lastName: "",
    email: "",
    phoneNumber: "",
    password: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await register({
        email: form.email,
        password: form.password,
        firstName: form.firstName,
        middleName: form.middleName || undefined,
        lastName: form.lastName,
        phoneNumber: form.phoneNumber || undefined,
      });
      navigate("/business-profiles");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Track your business finances with FinSight."
      heroTitle="Set up your account in minutes."
      heroBody="Create your FinSight account, then add your first business profile — a store, a branch, or any income source you want to monitor."
      points={[
        "Create your owner account",
        "Add a business profile and set your available funds",
        "Start recording expenses and sales reference",
      ]}
      footnote="Your records stay organised per business profile."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="firstName" className="block text-sm font-medium text-ink-700">
              First name
            </label>
            <input
              id="firstName"
              required
              value={form.firstName}
              onChange={(e) => update("firstName", e.target.value)}
              className="mt-1 min-h-tap w-full rounded-lg border border-ink-200 px-3 text-sm"
            />
          </div>
          <div>
            <label htmlFor="lastName" className="block text-sm font-medium text-ink-700">
              Last name
            </label>
            <input
              id="lastName"
              required
              value={form.lastName}
              onChange={(e) => update("lastName", e.target.value)}
              className="mt-1 min-h-tap w-full rounded-lg border border-ink-200 px-3 text-sm"
            />
          </div>
        </div>
        <div>
          <label htmlFor="middleName" className="block text-sm font-medium text-ink-700">
            Middle name <span className="text-ink-400">(optional)</span>
          </label>
          <input
            id="middleName"
            value={form.middleName}
            onChange={(e) => update("middleName", e.target.value)}
            className="mt-1 min-h-tap w-full rounded-lg border border-ink-200 px-3 text-sm"
          />
        </div>
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-ink-700">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
            className="mt-1 min-h-tap w-full rounded-lg border border-ink-200 px-3 text-sm"
          />
        </div>
        <div>
          <label htmlFor="phoneNumber" className="block text-sm font-medium text-ink-700">
            Phone number <span className="text-ink-400">(optional)</span>
          </label>
          <input
            id="phoneNumber"
            value={form.phoneNumber}
            onChange={(e) => update("phoneNumber", e.target.value)}
            className="mt-1 min-h-tap w-full rounded-lg border border-ink-200 px-3 text-sm"
          />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-ink-700">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            value={form.password}
            onChange={(e) => update("password", e.target.value)}
            className="mt-1 min-h-tap w-full rounded-lg border border-ink-200 px-3 text-sm"
          />
          <p className="mt-1 text-xs text-ink-400">At least 8 characters.</p>
        </div>
        {error ? <p className="text-sm text-tone-danger">{error}</p> : null}
        <button
          type="submit"
          disabled={submitting}
          className="tap w-full rounded-lg bg-accent-400 px-4 text-sm font-semibold text-ink-900 shadow-sm hover:bg-accent-500 disabled:opacity-60"
        >
          {submitting ? "Creating account…" : "Create account"}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-ink-500">
        Already have an account?{" "}
        <Link to="/login" className="tap-inline font-medium text-brand-700 hover:text-brand-800">
          Log in
        </Link>
      </p>
    </AuthLayout>
  );
}
