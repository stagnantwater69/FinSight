import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { AuthLayout } from "../components/AuthLayout";
import { Button } from "../components/Button";
import { Field, FormError, TextInput } from "../components/Field";
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
        {/* Stacks below `sm`: at 320px two side-by-side name fields leave
            about 130px each, which is not enough for a long surname to be
            readable while typing. */}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="First name" htmlFor="firstName" required>
            <TextInput
              required
              autoComplete="given-name"
              value={form.firstName}
              onChange={(e) => update("firstName", e.target.value)}
            />
          </Field>
          <Field label="Last name" htmlFor="lastName" required>
            <TextInput
              required
              autoComplete="family-name"
              value={form.lastName}
              onChange={(e) => update("lastName", e.target.value)}
            />
          </Field>
        </div>
        <Field label="Middle name" htmlFor="middleName" optional>
          <TextInput
            autoComplete="additional-name"
            value={form.middleName}
            onChange={(e) => update("middleName", e.target.value)}
          />
        </Field>
        <Field label="Email" htmlFor="email" required>
          <TextInput
            type="email"
            required
            autoComplete="email"
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
          />
        </Field>
        <Field label="Phone number" htmlFor="phoneNumber" optional>
          <TextInput
            type="tel"
            autoComplete="tel"
            value={form.phoneNumber}
            onChange={(e) => update("phoneNumber", e.target.value)}
          />
        </Field>
        <Field label="Password" htmlFor="password" required hint="At least 8 characters.">
          <TextInput
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => update("password", e.target.value)}
          />
        </Field>
        {error ? <FormError>{error}</FormError> : null}
        <Button type="submit" variant="primary" fullWidth disabled={submitting}>
          {submitting ? "Creating account…" : "Create account"}
        </Button>
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
