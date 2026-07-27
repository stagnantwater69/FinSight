import { useState, type FormEvent } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { getErrorMessage } from "../lib/errors";
import { Card, PageHead } from "../components/ui";

export function Profile() {
  const { profile, updateProfile } = useAuth();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    firstName: profile?.firstName ?? "",
    middleName: profile?.middleName ?? "",
    lastName: profile?.lastName ?? "",
    phoneNumber: profile?.phoneNumber ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!profile) return null;

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await updateProfile({
        firstName: form.firstName,
        middleName: form.middleName || null,
        lastName: form.lastName,
        phoneNumber: form.phoneNumber || null,
      });
      setEditing(false);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHead eyebrow="Account" title="My profile" subtitle="Your name, contact details, and password." />
      {/* The form measure is capped while the heading above it stays on the
          shared left edge — see FormPage in components/ui for why. */}
      <div className="max-w-xl space-y-6">
        <Card className="p-6 sm:p-7">
          {editing ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
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
                Middle name
              </label>
              <input
                id="middleName"
                value={form.middleName}
                onChange={(e) => update("middleName", e.target.value)}
                className="mt-1 min-h-tap w-full rounded-lg border border-ink-200 px-3 text-sm"
              />
            </div>
            <div>
              <label htmlFor="phoneNumber" className="block text-sm font-medium text-ink-700">
                Phone number
              </label>
              <input
                id="phoneNumber"
                value={form.phoneNumber}
                onChange={(e) => update("phoneNumber", e.target.value)}
                className="mt-1 min-h-tap w-full rounded-lg border border-ink-200 px-3 text-sm"
              />
            </div>
            {error ? <p className="text-sm text-tone-danger">{error}</p> : null}
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={submitting}
                className="tap flex-1 rounded-lg bg-accent-400 px-4 text-sm font-semibold text-ink-900 shadow-sm hover:bg-accent-500 disabled:opacity-60"
              >
                {submitting ? "Saving…" : "Save changes"}
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="tap flex-1 rounded-lg border border-ink-200 px-4 text-sm font-medium text-ink-700 hover:bg-paper-100"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-ink-500">Name</dt>
                <dd className="break-words font-medium text-ink-900">
                  {[profile.firstName, profile.middleName, profile.lastName].filter(Boolean).join(" ")}
                </dd>
              </div>
              <div>
                <dt className="text-ink-500">Email</dt>
                <dd className="break-all font-medium text-ink-900">{profile.email}</dd>
              </div>
              <div>
                <dt className="text-ink-500">Phone number</dt>
                <dd className="break-words font-medium text-ink-900">{profile.phoneNumber ?? "—"}</dd>
              </div>
            </dl>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="tap w-full rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700"
            >
              Edit profile
            </button>
          </div>
        )}
        </Card>

        <SecurityPanel />
      </div>
    </div>
  );
}

const emptyPasswordForm = { currentPassword: "", newPassword: "", confirmPassword: "" };

function SecurityPanel() {
  const [form, setForm] = useState(emptyPasswordForm);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    setSuccess(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    // Checked here as well as server-side so a typo'd confirmation doesn't
    // cost a round trip that re-verifies the current password.
    if (form.newPassword !== form.confirmPassword) {
      setError("New password and confirmation don't match.");
      return;
    }
    if (form.newPassword === form.currentPassword) {
      setError("New password must be different from your current password.");
      return;
    }

    setSubmitting(true);
    try {
      await api.post("/auth/change-password", {
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      });
      setForm(emptyPasswordForm);
      setSuccess(true);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-2xl border border-paper-200 bg-paper p-6 shadow-sm sm:p-7">
      <h2 className="mb-1 text-lg font-semibold text-ink-900">Security</h2>
      <p className="mb-6 text-xs text-ink-500">
        Change your password. You'll need your current password to confirm it's you.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="currentPassword" className="block text-sm font-medium text-ink-700">
            Current password
          </label>
          <input
            id="currentPassword"
            type="password"
            required
            autoComplete="current-password"
            value={form.currentPassword}
            onChange={(e) => update("currentPassword", e.target.value)}
            className="mt-1 min-h-tap w-full rounded-lg border border-ink-200 px-3 text-sm"
          />
        </div>
        <div>
          <label htmlFor="newPassword" className="block text-sm font-medium text-ink-700">
            New password
          </label>
          <input
            id="newPassword"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={form.newPassword}
            onChange={(e) => update("newPassword", e.target.value)}
            className="mt-1 min-h-tap w-full rounded-lg border border-ink-200 px-3 text-sm"
          />
          <p className="mt-1 text-xs text-ink-400">At least 8 characters.</p>
        </div>
        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-ink-700">
            Confirm new password
          </label>
          <input
            id="confirmPassword"
            type="password"
            required
            autoComplete="new-password"
            value={form.confirmPassword}
            onChange={(e) => update("confirmPassword", e.target.value)}
            className="mt-1 min-h-tap w-full rounded-lg border border-ink-200 px-3 text-sm"
          />
        </div>

        {error ? <p className="text-sm text-tone-danger">{error}</p> : null}
        {success ? (
          <p className="rounded-lg bg-tint-brand p-3 text-sm text-tone-brand">
            <span aria-hidden>✓ </span>Password changed. Use your new password next time you log in.
          </p>
        ) : null}

        <button
          type="submit"
          disabled={submitting}
          className="tap w-full rounded-lg bg-accent-400 px-4 text-sm font-semibold text-ink-900 shadow-sm hover:bg-accent-500 disabled:opacity-60"
        >
          {submitting ? "Changing…" : "Change password"}
        </button>
      </form>
    </div>
  );
}
