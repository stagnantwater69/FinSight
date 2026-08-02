import { useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from "react-native";
import { Button, Card, ErrorNote, Field, Screen, T } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { api, errorMessage } from "../lib/api";
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
          <T variant="title" style={{ textAlign: "center", fontSize: 26, marginBottom: 4 }}>
            FinSight
          </T>
          <Card>
            <T variant="title" style={{ fontSize: 18, textAlign: "center" }}>
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
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      await login({ email: email.trim(), password });
    } catch (err) {
      setError(errorMessage(err));
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
        onChangeText={setEmail}
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
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="password"
        returnKeyType="done"
        // Mirrors the button's own `loading` guard: a second submit while the
        // first is still in flight would fire two login requests.
        onSubmitEditing={() => {
          if (!busy) submit();
        }}
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
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const lastNameRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      await register({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        password: form.password,
      });
    } catch (err) {
      setError(errorMessage(err));
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
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      await api.post("/auth/recover-password", { email: email.trim() });
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
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
            onChangeText={setEmail}
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
