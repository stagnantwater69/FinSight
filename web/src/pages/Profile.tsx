import { useState, type FormEvent } from "react";
import { useAuth } from "../context/AuthContext";
import { useBusinessProfiles } from "../context/BusinessProfileContext";
import { api } from "../lib/api";
import { getErrorMessage } from "../lib/errors";
import { Callout, Card, PageHead } from "../components/ui";
import { Button } from "../components/Button";
import { Field, FormError, TextInput } from "../components/Field";
import { AvatarUpload } from "../components/Avatar";

export function Profile() {
  const { profile, updateProfile, uploadAvatar } = useAuth();
  const { profiles } = useBusinessProfiles();
  const [form, setForm] = useState({
    firstName: profile?.firstName ?? "",
    middleName: profile?.middleName ?? "",
    lastName: profile?.lastName ?? "",
    phoneNumber: profile?.phoneNumber ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!profile) return null;

  const fullName = [profile.firstName, profile.middleName, profile.lastName].filter(Boolean).join(" ");
  const businessCount = profiles.length;

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setSubmitting(true);
    try {
      await updateProfile({
        firstName: form.firstName,
        middleName: form.middleName || null,
        lastName: form.lastName,
        phoneNumber: form.phoneNumber || null,
      });
      setSaved(true);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHead eyebrow="Account" title="My Profile" subtitle="Manage your personal account details." />

      <Card className="mb-6 flex flex-wrap items-center justify-between gap-4 p-6">
        <AvatarUpload photoUrl={profile.avatarUrl} label={fullName} onUpload={uploadAvatar} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-bold text-ink-900">{fullName}</h2>
          <p className="text-sm text-ink-500">
            Small Business Owner · {businessCount} business {businessCount === 1 ? "profile" : "profiles"}
          </p>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6 sm:p-7">
          <h2 className="mb-4 text-base font-semibold text-ink-900">Personal Details</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="First name" htmlFor="firstName" required>
                <TextInput
                  required
                  autoComplete="given-name"
                  value={form.firstName}
                  onChange={(e) => update("firstName", e.target.value)}
                />
              </Field>
              <Field label="Middle name" htmlFor="middleName" optional>
                <TextInput
                  autoComplete="additional-name"
                  value={form.middleName}
                  onChange={(e) => update("middleName", e.target.value)}
                />
              </Field>
            </div>
            <Field label="Last name" htmlFor="lastName" required>
              <TextInput
                required
                autoComplete="family-name"
                value={form.lastName}
                onChange={(e) => update("lastName", e.target.value)}
              />
            </Field>
            <Field label="Email" htmlFor="email" hint="Contact support to change the email on your account.">
              <TextInput id="email" value={profile.email} disabled readOnly />
            </Field>
            <Field label="Phone number" htmlFor="phoneNumber" optional>
              <TextInput
                type="tel"
                autoComplete="tel"
                value={form.phoneNumber}
                onChange={(e) => update("phoneNumber", e.target.value)}
              />
            </Field>
            {error ? <FormError>{error}</FormError> : null}
            {saved ? <Callout tone="brand">Profile updated.</Callout> : null}
            <div className="flex justify-end">
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving…" : "Update Profile"}
              </Button>
            </div>
          </form>
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
    <Card className="p-6 sm:p-7">
      <h2 className="mb-1 text-base font-semibold text-ink-900">Security</h2>
      <p className="mb-6 text-xs text-ink-500">
        Change your password. You'll need your current password to confirm it's you.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Current password" htmlFor="currentPassword" required>
          <TextInput
            type="password"
            required
            autoComplete="current-password"
            value={form.currentPassword}
            onChange={(e) => update("currentPassword", e.target.value)}
          />
        </Field>
        <Field label="New password" htmlFor="newPassword" required hint="At least 8 characters.">
          <TextInput
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={form.newPassword}
            onChange={(e) => update("newPassword", e.target.value)}
          />
        </Field>
        <Field label="Confirm new password" htmlFor="confirmPassword" required>
          <TextInput
            type="password"
            required
            autoComplete="new-password"
            value={form.confirmPassword}
            onChange={(e) => update("confirmPassword", e.target.value)}
          />
        </Field>

        {error ? <FormError>{error}</FormError> : null}
        {success ? (
          <Callout tone="brand">
            Password changed. Use your new password next time you log in.
          </Callout>
        ) : null}

        <div className="flex justify-end">
          <Button type="submit" disabled={submitting}>
            {submitting ? "Changing…" : "Change Password"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
