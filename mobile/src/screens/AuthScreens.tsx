import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from "react-native";
import { Button, Card, Checkbox, ErrorNote, Field, Screen, T } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import * as haptics from "../lib/haptics";
import { api, errorMessage, getFieldErrors } from "../lib/api";
import {
  isValid,
  validateLogin,
  validateRecoverPassword,
  validateRegister,
  type FieldErrors,
  type LoginField,
  type RegisterField,
} from "../lib/authValidation";
import { isSavingAccount, savedEmail, setSavedAccount } from "../lib/savedAccountStore";
import { brand, ink, radius, space, TAP } from "../theme/tokens";

/**
 * Auth screens. Every input uses `minHeight: TAP` rather than a fixed height so
 * the field grows when a user scales their system font up.
 */

function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: space.lg, justifyContent: "center", flexGrow: 1 }}>
          <T variant="titleLg" style={{ textAlign: "center", marginBottom: 4 }}>
            FinSight
          </T>
          <Card>
            <T variant="title" style={{ textAlign: "center" }}>
              {title}
            </T>
            {subtitle ? (
              <T style={{ textAlign: "center", color: ink[500], marginTop: 4, marginBottom: space.md, fontSize: 14 }}>
                {subtitle}
              </T>
            ) : (
              <View style={{ height: space.md }} />
            )}
            {children}
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

export function LoginScreen({ navigation }: any) {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [saveAccount, setSaveAccount] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /**
   * Per-field messages, from this screen's checks or from the server's.
   *
   * Set on submit only. Checking as someone types marks an email invalid
   * halfway through typing it, which is a form arguing with a person who is
   * doing nothing wrong — so a field's message clears when it changes, and is
   * only ever set when they ask to continue.
   */
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<LoginField>>({});
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  const clearField = (field: LoginField) =>
    setFieldErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));

  /*
   * Both of these live in the keystore and both reads are async, so the form
   * starts on its defaults and fills in a moment later. That is deliberately
   * not gated behind a loading state: the fields are usable immediately, and
   * someone who starts typing their own address before the stored one arrives
   * would not thank us for overwriting it — which is what the guard below is
   * for.
   */
  useEffect(() => {
    let active = true;
    void (async () => {
      const [saved, choice] = await Promise.all([savedEmail(), isSavingAccount()]);
      if (!active) return;
      setSaveAccount(choice);
      // Only prefill an untouched field.
      if (saved) setEmail((current) => (current === "" ? saved : current));
    })();
    return () => {
      active = false;
    };
  }, []);

  async function submit() {
    setError(null);

    const invalid = validateLogin({ email, password });
    if (!isValid(invalid)) {
      // Not sent. The round trip would bring back the same answer, and on a
      // phone tether it is one the owner pays for.
      setFieldErrors(invalid);
      haptics.failed();
      return;
    }
    setFieldErrors({});

    setBusy(true);
    try {
      await login({ email: email.trim(), password });
      // Saved only once the address is known to work. Prefilling a login that
      // fails would hand the owner a form that looks right and is not, which
      // is harder to recover from than an empty one.
      await setSavedAccount(saveAccount, email);
    } catch (err) {
      // Fields the server rejected go under those fields. Everything else —
      // wrong password, no network — has no field to sit under.
      const fromServer = getFieldErrors(err);
      setFieldErrors(fromServer);
      setError(Object.keys(fromServer).length > 0 ? null : errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Log in" subtitle="Welcome back.">
      {/*
        The return key walks the form: "next" until the last field, then "done",
        which runs the same submit the button does. `submitBehavior="submit"`
        keeps the keyboard up between fields so it does not flicker closed and
        open again on every hop — it replaces `blurOnSubmit`, which React Native
        0.86 marks deprecated in favour of it.
      */}
      <Field
        label="Email"
        value={email}
        onChangeText={(v) => {
          setEmail(v);
          clearField("email");
        }}
        error={fieldErrors.email}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      <Field
        ref={passwordRef}
        label="Password"
        value={password}
        onChangeText={(v) => {
          setPassword(v);
          clearField("password");
        }}
        error={fieldErrors.password}
        secureTextEntry
        autoComplete="password"
        returnKeyType="done"
        // Mirrors the button's own `loading` guard: a second submit while the
        // first is still in flight would fire two login requests.
        onSubmitEditing={() => {
          if (!busy) submit();
        }}
      />
      {/*
        The hint says what the box DOES, not what it is called. "Remember me"
        alone is a promise nobody can check; naming the consequence is what
        lets someone whose phone gets handed around a shop choose correctly.
      */}
      <Checkbox
        label="Save my email on this phone"
        hint="Fills it in next time so you don't retype it. Your password is never saved."
        checked={saveAccount}
        onChange={setSaveAccount}
      />
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      <Button title="Log in" onPress={submit} loading={busy} style={{ marginTop: space.md }} />
      <Button
        title="Forgot password?"
        variant="ghost"
        onPress={() => navigation.navigate("RecoverPassword")}
        style={{ marginTop: space.sm }}
      />
      <Button title="Create an account" variant="ghost" onPress={() => navigation.navigate("Register")} />
    </AuthShell>
  );
}

export function RegisterScreen({ navigation }: any) {
  const { register } = useAuth();
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<RegisterField>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    // Correcting a marked field clears its mark straight away, rather than
    // making the owner submit again to find out whether they fixed it.
    setFieldErrors((prev) => (prev[k as RegisterField] ? { ...prev, [k]: undefined } : prev));
  };
  const lastNameRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  async function submit() {
    setError(null);

    const invalid = validateRegister(form);
    if (!isValid(invalid)) {
      setFieldErrors(invalid);
      haptics.failed();
      return;
    }
    setFieldErrors({});

    setBusy(true);
    try {
      await register({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        password: form.password,
      });
    } catch (err) {
      // An address already registered, or a rule this screen let through,
      // lands under its own field; anything else stays form-level.
      const fromServer = getFieldErrors(err);
      setFieldErrors(fromServer);
      setError(Object.keys(fromServer).length > 0 ? null : errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Create your account" subtitle="Start tracking your business in a few minutes.">
      <Field
        label="First name"
        value={form.firstName}
        onChangeText={set("firstName")}
        error={fieldErrors.firstName}
        autoComplete="given-name"
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => lastNameRef.current?.focus()}
      />
      <Field
        ref={lastNameRef}
        label="Last name"
        value={form.lastName}
        onChangeText={set("lastName")}
        error={fieldErrors.lastName}
        autoComplete="family-name"
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => emailRef.current?.focus()}
      />
      <Field
        ref={emailRef}
        label="Email"
        value={form.email}
        onChangeText={set("email")}
        error={fieldErrors.email}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      {/*
        "new-password" rather than Login's "password": it tells the password
        manager to offer a generated one instead of autofilling an existing
        one, which is the difference between signing up and signing in.
      */}
      <Field
        ref={passwordRef}
        label="Password"
        value={form.password}
        onChangeText={set("password")}
        error={fieldErrors.password}
        secureTextEntry
        placeholder="At least 8 characters"
        autoComplete="new-password"
        returnKeyType="done"
        onSubmitEditing={() => {
          if (!busy) submit();
        }}
      />
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      <Button title="Create account" variant="primary" onPress={submit} loading={busy} style={{ marginTop: space.md }} />
      <Button title="I already have an account" variant="ghost" onPress={() => navigation.navigate("Login")} />
    </AuthShell>
  );
}

export function RecoverPasswordScreen({ navigation }: any) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);

    /*
      Checked here as much for the OWNER as for the server. This endpoint
      answers the same way whether or not the address is registered — that is
      deliberate, so it cannot be used to discover who has an account — which
      means a typo produces the identical "check your inbox" as a real
      address, and the reset that never arrives is unexplainable. Catching a
      malformed address before sending is the only place that typo can still
      be pointed at.
    */
    const invalid = validateRecoverPassword({ email });
    if (!isValid(invalid)) {
      setEmailError(invalid.email ?? null);
      haptics.failed();
      return;
    }
    setEmailError(null);

    setBusy(true);
    try {
      await api.post("/auth/recover-password", { email: email.trim() });
      setSent(true);
    } catch (err) {
      const fromServer = getFieldErrors(err);
      setEmailError(fromServer.email ?? null);
      setError(fromServer.email ? null : errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Reset your password" subtitle="We'll email you a link to set a new one.">
      {sent ? (
        <View style={{ backgroundColor: brand[50], borderRadius: radius.md, padding: space.md }}>
          <T style={{ color: brand[900], fontSize: 14 }}>
            If that email is registered, a reset link is on its way. Check your inbox, then come back and log in.
          </T>
        </View>
      ) : (
        <>
          <Field
            label="Email"
            value={email}
            onChangeText={(v) => {
              setEmail(v);
              setEmailError(null);
            }}
            error={emailError}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            returnKeyType="done"
            onSubmitEditing={() => {
              if (!busy) submit();
            }}
          />
          {error ? <ErrorNote>{error}</ErrorNote> : null}
          <Button title="Send reset link" onPress={submit} loading={busy} style={{ marginTop: space.sm }} />
        </>
      )}
      <Button title="Back to log in" variant="ghost" onPress={() => navigation.navigate("Login")} />
    </AuthShell>
  );
}
