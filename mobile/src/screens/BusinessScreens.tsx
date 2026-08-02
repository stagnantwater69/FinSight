import { useCallback, useRef, useState } from "react";
import { Alert as RNAlert, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Button, Card, EmptyState, ErrorNote, Field, Money, Screen, T } from "../components/ui";
import { PhotoUpload } from "../components/PhotoUpload";
import { useAuth } from "../context/AuthContext";
import { useBusinessProfiles } from "../context/BusinessProfileContext";
import { errorMessage } from "../lib/api";
import { brand, ink, radius, space, TAP } from "../theme/tokens";
import type { BusinessProfile, Profile } from "../lib/types";

// ---------------------------------------------------------------- List / switcher

export function BusinessProfilesScreen({ navigation }: any) {
  const { profiles, selected, selectProfile, loading, archiveProfile, restoreProfile, listArchived } =
    useBusinessProfiles();
  const [archived, setArchived] = useState<BusinessProfile[] | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadArchived = useCallback(async () => {
    setError(null);
    try {
      setArchived(await listArchived());
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [listArchived]);

  useFocusEffect(useCallback(() => { if (archived !== null) loadArchived(); }, []));

  function confirmArchive(p: BusinessProfile) {
    // Archive is reversible but still pulls a business out of the switcher, so
    // it gets a confirmation that says plainly that nothing is deleted.
    RNAlert.alert(
      `Archive "${p.name}"?`,
      "It will be hidden from your list of businesses. Nothing is deleted — all its records, insights and " +
        "conversations are kept, and you can restore it at any time.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Archive",
          style: "destructive",
          onPress: async () => {
            setBusyId(p.id);
            try {
              await archiveProfile(p.id);
              if (archived) await loadArchived();
            } catch (err) {
              setError(errorMessage(err));
            } finally {
              setBusyId(null);
            }
          },
        },
      ]
    );
  }

  /**
   * The archived panel renders in BOTH the empty and populated states — an
   * owner who archives their only business must still be able to find it.
   * Same fix the web app needed.
   */
  const archivedPanel = (
    <View style={{ marginTop: space.xl }}>
      {archived === null ? (
        <Button title="Show archived businesses" variant="ghost" onPress={loadArchived} />
      ) : (
        <Card>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: space.md }}>
            <T variant="heading" accessibilityRole="header">Archived businesses</T>
            <Pressable
              onPress={() => setArchived(null)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Hide archived businesses"
              style={{ minHeight: TAP - 12, justifyContent: "center" }}
            >
              <T variant="caption">Hide</T>
            </Pressable>
          </View>
          {archived.length === 0 ? (
            <T variant="caption">You have no archived businesses.</T>
          ) : (
            archived.map((p) => (
              <View
                key={p.id}
                style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: space.sm, gap: space.sm }}
              >
                <View style={{ flex: 1 }}>
                  <T style={{ fontSize: 14 }}>{p.name}</T>
                  <T variant="caption">{p.type}{p.archivedAt ? ` · archived ${p.archivedAt.slice(0, 10)}` : ""}</T>
                </View>
                <Button
                  title="Restore"
                  variant="secondary"
                  loading={busyId === p.id}
                  onPress={async () => {
                    setBusyId(p.id);
                    try {
                      await restoreProfile(p.id);
                      await loadArchived();
                    } finally {
                      setBusyId(null);
                    }
                  }}
                />
              </View>
            ))
          )}
          <T variant="caption" style={{ marginTop: space.md }}>
            Archived businesses keep all their records. Restoring one brings it back exactly as it was.
          </T>
        </Card>
      )}
    </View>
  );

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 2 }}>
        <T variant="title" style={{ fontSize: 18, marginBottom: space.md }}>Your businesses</T>
        {error ? <ErrorNote>{error}</ErrorNote> : null}

        {loading ? null : profiles.length === 0 ? (
          <EmptyState
            title="Let's set up your first business"
            body="Add a business profile to start tracking its funds, expenses and sales."
            action={<Button title="Create a business profile" variant="primary" onPress={() => navigation.navigate("BusinessProfileForm", {})} />}
          />
        ) : (
          <>
            {profiles.map((p) => {
              const isActive = p.id === selected?.id;
              return (
                <Card key={p.id} style={{ marginBottom: space.md, borderColor: isActive ? brand[500] : brand[100], borderWidth: isActive ? 2 : 1 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.sm }}>
                    <View style={{ flex: 1 }}>
                      <T style={{ fontFamily: "Inter_500Medium", fontSize: 15 }}>{p.name}</T>
                      <T variant="caption">{p.type}</T>
                    </View>
                    {isActive ? (
                      <View style={{ backgroundColor: brand[100], borderRadius: radius.full, paddingHorizontal: space.sm, height: 22, justifyContent: "center" }}>
                        <T style={{ fontSize: 11, color: brand[700] }}>Active</T>
                      </View>
                    ) : null}
                  </View>

                  <View style={{ marginTop: space.md, gap: 4 }}>
                    <RowLine label="Available funds" value={p.availableFunds} />
                    <RowLine label="Expected monthly expenses" value={p.expectedMonthlyExpenses} />
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <T variant="caption">Operating days / month</T>
                      <T style={{ fontSize: 13 }}>{p.operatingDays}</T>
                    </View>
                  </View>

                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.md }}>
                    {!isActive ? <Button title="Switch to this" variant="secondary" onPress={() => selectProfile(p.id)} /> : null}
                    <Button title="Edit" variant="ghost" onPress={() => navigation.navigate("BusinessProfileForm", { profile: p })} />
                    <Button title="Archive" variant="ghost" onPress={() => confirmArchive(p)} loading={busyId === p.id} />
                  </View>
                </Card>
              );
            })}
            <Button title="+ Add another business" variant="secondary" onPress={() => navigation.navigate("BusinessProfileForm", {})} />
          </>
        )}

        {archivedPanel}
      </ScrollView>
    </Screen>
  );
}

function RowLine({ label, value }: { label: string; value: number }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <T variant="caption">{label}</T>
      <Money value={value} size={13} />
    </View>
  );
}

// ---------------------------------------------------------------- Create / edit

export function BusinessProfileFormScreen({ navigation, route }: any) {
  const existing: BusinessProfile | undefined = route.params?.profile;
  const { createProfile, updateProfile } = useBusinessProfiles();
  const [form, setForm] = useState({
    name: existing?.name ?? "",
    type: existing?.type ?? "Sari-Sari Store",
    availableFunds: String(existing?.availableFunds ?? ""),
    expectedMonthlyExpenses: String(existing?.expectedMonthlyExpenses ?? ""),
    operatingDays: String(existing?.operatingDays ?? "26"),
    largeExpenseThresholdPercent: String(existing?.largeExpenseThresholdPercent ?? "20"),
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The logo is uploaded on its own, immediately, rather than travelling with
  // the form — so it is held apart from the fields Save writes.
  const [logoUrl, setLogoUrl] = useState<string | null>(existing?.logoUrl ?? null);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  // One ref per field the return key hands off TO — the first field is never a
  // destination, so it needs none.
  const typeRef = useRef<TextInput>(null);
  const fundsRef = useRef<TextInput>(null);
  const monthlyRef = useRef<TextInput>(null);
  const operatingDaysRef = useRef<TextInput>(null);
  const thresholdRef = useRef<TextInput>(null);

  async function submit() {
    const payload = {
      name: form.name.trim(),
      type: form.type.trim(),
      availableFunds: Number(form.availableFunds),
      expectedMonthlyExpenses: Number(form.expectedMonthlyExpenses),
      operatingDays: Number(form.operatingDays),
      largeExpenseThresholdPercent: Number(form.largeExpenseThresholdPercent),
    };
    if (!payload.name) return setError("Give your business a name.");
    if (!Number.isFinite(payload.availableFunds) || payload.availableFunds < 0)
      return setError("Enter the money you have on hand for the business.");
    if (!Number.isFinite(payload.expectedMonthlyExpenses) || payload.expectedMonthlyExpenses < 0)
      return setError("Enter roughly what a month costs you.");
    if (!Number.isInteger(payload.operatingDays) || payload.operatingDays < 1 || payload.operatingDays > 31)
      return setError("Operating days must be between 1 and 31.");

    setError(null);
    setBusy(true);
    try {
      existing ? await updateProfile(existing.id, payload) : await createProfile(payload);
      navigation.goBack();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      {/*
        Six chained fields on one screen: without this, the return key can hand
        focus to a field the keyboard is already covering, which is worse than
        no chaining. `padding` is iOS-only — Android resizes the window itself
        via windowSoftInputMode, and adding padding on top of that double-counts
        the keyboard.
      */}
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 2 }}>
          <Card>
            <T variant="title" style={{ fontSize: 18, marginBottom: space.md }}>
              {existing ? "Edit business" : "Add a business"}
            </T>
            {/*
              Only on an existing business: the upload endpoint is scoped to a
              profile id, which does not exist until the business is created.
              Offering it on the create form would be a control that cannot work
              yet.
            */}
            {existing ? (
              <PhotoUpload
                url={logoUrl}
                endpoint={`/business-profiles/${existing.id}/logo`}
                label="Business logo"
                shape="square"
                onUploaded={(updated) => setLogoUrl((updated as BusinessProfile).logoUrl)}
              />
            ) : null}
            {/*
              The return key walks the six fields in order and submits from the
              last, the same chain the auth forms use. The four numeric fields
              below are wired identically, but a phone keypad has no return key
              on iOS — there the chain simply ends at the last text keyboard and
              the owner taps the next field. Android's number pads do carry one.
            */}
            <Field
              label="Business name"
              value={form.name}
              onChangeText={set("name")}
              placeholder="e.g. Aling Nena's Store"
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => typeRef.current?.focus()}
            />
            <Field
              ref={typeRef}
              label="Type"
              value={form.type}
              onChangeText={set("type")}
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => fundsRef.current?.focus()}
            />
            <Field
              ref={fundsRef}
              label="Available business funds (PHP)"
              value={form.availableFunds}
              onChangeText={set("availableFunds")}
              keyboardType="decimal-pad"
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => monthlyRef.current?.focus()}
            />
            <T variant="caption" style={{ marginTop: -space.sm, marginBottom: space.md }}>
              The money you have on hand for the business right now.
            </T>
            <Field
              ref={monthlyRef}
              label="Expected monthly expenses (PHP)"
              value={form.expectedMonthlyExpenses}
              onChangeText={set("expectedMonthlyExpenses")}
              keyboardType="decimal-pad"
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => operatingDaysRef.current?.focus()}
            />
            <T variant="caption" style={{ marginTop: -space.sm, marginBottom: space.md }}>
              Roughly what a normal month costs you. This drives your daily sales target.
            </T>
            <Field
              ref={operatingDaysRef}
              label="Operating days per month"
              value={form.operatingDays}
              onChangeText={set("operatingDays")}
              keyboardType="number-pad"
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => thresholdRef.current?.focus()}
            />
            <Field
              ref={thresholdRef}
              label="Large-expense threshold (%)"
              value={form.largeExpenseThresholdPercent}
              onChangeText={set("largeExpenseThresholdPercent")}
              keyboardType="decimal-pad"
              returnKeyType="done"
              // Mirrors the button's own `loading` guard: a second submit while
              // the first is in flight would create two businesses.
              onSubmitEditing={() => {
                if (!busy) submit();
              }}
            />
            {/*
              Stated as a share of expected monthly expenses because that is
              literally the comparison the server makes — largeExpenseThresholdFor
              multiplies the two. "Bigger than usual" would be a different rule
              that nothing in the code implements.
            */}
            <T variant="caption" style={{ marginTop: -space.sm, marginBottom: space.md }}>
              An expense at or above this share of your expected monthly expenses gets flagged for review.
            </T>
            {error ? <ErrorNote>{error}</ErrorNote> : null}
            <Button title={existing ? "Save changes" : "Create business"} variant="primary" onPress={submit} loading={busy} style={{ marginTop: space.md }} />
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

// ---------------------------------------------------------------- Profile / account

export function ProfileScreen() {
  const { profile, updateProfile, logout, changePassword, setProfileFromServer } = useAuth();
  const [form, setForm] = useState({
    firstName: profile?.firstName ?? "",
    lastName: profile?.lastName ?? "",
    phoneNumber: profile?.phoneNumber ?? "",
  });
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /*
   * Two separate chains, because this screen holds two independent forms with
   * two submit handlers. The profile card's last field must NOT hand focus to
   * the security card — jumping from a phone number into "Current password"
   * would suggest the two are saved together, and they are not.
   */
  const lastNameRef = useRef<TextInput>(null);
  const phoneRef = useRef<TextInput>(null);
  const nextPwRef = useRef<TextInput>(null);
  const confirmPwRef = useRef<TextInput>(null);

  if (!profile) return null;

  async function saveProfile() {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      await updateProfile({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phoneNumber: form.phoneNumber.trim() || null,
      });
      setMsg("Changes saved.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitPassword() {
    setError(null);
    setMsg(null);
    if (pw.next !== pw.confirm) return setError("New password and confirmation don't match.");
    if (pw.next.length < 8) return setError("New password must be at least 8 characters.");
    setBusy(true);
    try {
      await changePassword(pw.current, pw.next);
      // changePassword signs out by design — the server invalidates sessions.
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      {/*
        Both cards on this screen are forms, so the keyboard is avoided for
        the whole scroll view rather than per card. `padding` is iOS-only;
        Android already resizes the window for the keyboard on its own.
      */}
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 2, gap: space.lg }}>
          <Card>
            <T variant="title" style={{ fontSize: 18, marginBottom: space.md }}>My profile</T>
            {/*
              The upload endpoint existed long before mobile had any way to
              reach it, so a phone could display a photo set on the web app but
              never set one — the wrong way round, since the phone is where the
              camera and the photo library are.
            */}
            <PhotoUpload
              url={profile.avatarUrl}
              endpoint="/auth/me/avatar"
              label="Profile photo"
              onUploaded={(updated) => setProfileFromServer(updated as Profile)}
            />
            <Field
              label="First name"
              value={form.firstName}
              onChangeText={(v) => setForm((f) => ({ ...f, firstName: v }))}
              autoComplete="given-name"
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => lastNameRef.current?.focus()}
            />
            <Field
              ref={lastNameRef}
              label="Last name"
              value={form.lastName}
              onChangeText={(v) => setForm((f) => ({ ...f, lastName: v }))}
              autoComplete="family-name"
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => phoneRef.current?.focus()}
            />
            {/*
              The chain ends here rather than continuing into the security card
              below. A phone pad also has no return key on iOS, so this one is
              reached by tap there and the button is the only way out.
            */}
            <Field
              ref={phoneRef}
              label="Phone number"
              value={form.phoneNumber}
              onChangeText={(v) => setForm((f) => ({ ...f, phoneNumber: v }))}
              keyboardType="phone-pad"
              autoComplete="tel"
              returnKeyType="done"
              onSubmitEditing={() => {
                if (!busy) saveProfile();
              }}
            />
            <View style={{ marginBottom: space.md }}>
              <T variant="label" style={{ marginBottom: 4 }}>Email</T>
              <T style={{ fontSize: 14, color: ink[500] }}>{profile.email}</T>
            </View>
            {msg ? <T style={{ color: brand[700], fontSize: 14, marginBottom: space.sm }}>{msg}</T> : null}
            <Button title="Save changes" variant="primary" onPress={saveProfile} loading={busy} />
          </Card>

          <Card>
            <T variant="title" style={{ fontSize: 18, marginBottom: 4 }}>Security</T>
            <T variant="caption" style={{ marginBottom: space.md }}>
              Changing your password signs you out on every device, including this one.
            </T>
            <Field
              label="Current password"
              value={pw.current}
              onChangeText={(v) => setPw((p) => ({ ...p, current: v }))}
              secureTextEntry
              autoComplete="password"
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => nextPwRef.current?.focus()}
            />
            <Field
              ref={nextPwRef}
              label="New password"
              value={pw.next}
              onChangeText={(v) => setPw((p) => ({ ...p, next: v }))}
              secureTextEntry
              autoComplete="new-password"
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => confirmPwRef.current?.focus()}
            />
            <Field
              ref={confirmPwRef}
              label="Confirm new password"
              value={pw.confirm}
              onChangeText={(v) => setPw((p) => ({ ...p, confirm: v }))}
              secureTextEntry
              autoComplete="new-password"
              returnKeyType="done"
              onSubmitEditing={() => {
                if (!busy) submitPassword();
              }}
            />
            {error ? <ErrorNote>{error}</ErrorNote> : null}
            <Button title="Change password" onPress={submitPassword} loading={busy} style={{ marginTop: space.sm }} />
          </Card>

          <Button title="Log out" variant="danger" onPress={logout} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
