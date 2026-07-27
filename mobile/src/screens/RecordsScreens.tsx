import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, TextInput, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { Alert as AlertBanner, AlertBadge, Button, Card, EmptyState, ErrorNote, Money, Screen, T } from "../components/ui";
import { Field } from "./AuthScreens";
import { useBusinessProfiles } from "../context/BusinessProfileContext";
import { api, errorMessage } from "../lib/api";
import { brand, ink, paper, radius, space, TAP } from "../theme/tokens";
import { RECORD_SOURCE_LABELS, type ExpenseCategory, type RecordItem, type RecordSource } from "../lib/types";

const todayISO = () => new Date().toISOString().slice(0, 10);

/** Status badges, shared by the list and the review queue. */
function badges(r: RecordItem) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: space.sm }}>
      {r.duplicateStatus === "Flagged" ? <AlertBadge kind="duplicate" /> : null}
      {r.reviewStatus === "Needs Review" ? <AlertBadge kind="needs-review" /> : null}
      {r.largeExpenseFlag ? <AlertBadge kind="large-expense" /> : null}
    </View>
  );
}

function RecordCard({ r, categoryName, onPress }: { r: RecordItem; categoryName: string; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress}>
      <Card style={{ marginBottom: space.sm }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.md }}>
          <View style={{ flex: 1 }}>
            <T style={{ fontFamily: "Inter_500Medium", color: ink[900] }} numberOfLines={2}>
              {r.description}
            </T>
            <T variant="caption" style={{ marginTop: 2 }}>
              {r.date.slice(0, 10)} · {r.type === "expense" ? `Expense · ${categoryName}` : "Sales"}
            </T>
          </View>
          <Money value={r.amount} size={15} weight="semibold" color={r.type === "expense" ? ink[900] : brand[700]} />
        </View>
        {badges(r)}
        <T variant="caption" style={{ marginTop: space.sm }}>
          {RECORD_SOURCE_LABELS[r.source as RecordSource] ?? r.source}
        </T>
      </Card>
    </Pressable>
  );
}

// ---------------------------------------------------------------- List

export function RecordsScreen({ navigation }: any) {
  const { selected, categories } = useBusinessProfiles();
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [keyword, setKeyword] = useState("");
  const [type, setType] = useState<"all" | "expense" | "sales">("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (isRefresh = false) => {
      if (!selected) return;
      isRefresh ? setRefreshing(true) : setLoading(true);
      setError(null);
      try {
        setRecords(
          await api.get<RecordItem[]>("/records/search", {
            businessProfileId: selected.id,
            type,
            keyword: keyword || undefined,
          })
        );
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [selected?.id, type, keyword]
  );

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!selected) {
    return (
      <Screen>
        <View style={{ padding: space.lg }}>
          <EmptyState title="Set up a business first" body="Records belong to a business profile." />
        </View>
      </Screen>
    );
  }

  const categoryName = (id?: number) => categories.find((c) => c.id === id)?.name ?? "—";

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 2 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={brand[600]} />}
      >
        <T variant="title" numberOfLines={2} style={{ marginBottom: space.md }}>
          Records
        </T>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginBottom: space.md }}>
          <Button title="+ Expense" onPress={() => navigation.navigate("AddExpense")} />
          <Button title="+ Sales" variant="secondary" onPress={() => navigation.navigate("AddSales")} />
          <Button title="Scan receipt" variant="secondary" onPress={() => navigation.navigate("ScanReceipt")} />
          <Button title="Import CSV" variant="secondary" onPress={() => navigation.navigate("ImportCsv")} />
        </View>

        <Card style={{ marginBottom: space.md }}>
          <TextInput
            value={keyword}
            onChangeText={setKeyword}
            placeholder="Search descriptions…"
            placeholderTextColor={ink[400]}
            style={{
              minHeight: TAP,
              borderWidth: 1,
              borderColor: ink[200],
              borderRadius: radius.md,
              paddingHorizontal: space.md,
              fontSize: 15,
              color: ink[900],
            }}
          />
          <View style={{ flexDirection: "row", gap: space.sm, marginTop: space.sm }}>
            {(["all", "expense", "sales"] as const).map((t) => (
              <Pressable
                key={t}
                onPress={() => setType(t)}
                accessibilityRole="button"
                accessibilityState={{ selected: type === t }}
                style={{
                  minHeight: TAP - 8,
                  paddingHorizontal: space.md,
                  justifyContent: "center",
                  borderRadius: radius.sm,
                  backgroundColor: type === t ? brand[600] : paper[100],
                }}
              >
                <T style={{ fontSize: 13, color: type === t ? "#fff" : ink[600], textTransform: "capitalize" }}>{t}</T>
              </Pressable>
            ))}
          </View>
        </Card>

        {error ? <ErrorNote>{error}</ErrorNote> : null}

        {loading ? (
          <ActivityIndicator color={brand[600]} style={{ marginTop: space.xxl }} />
        ) : records.length === 0 ? (
          <EmptyState
            title={keyword ? "No records match that search" : "You haven't added any records yet"}
            body={
              keyword
                ? "Try a different word, or clear the search box."
                : "Start with what you spent today — even one entry is enough for FinSight to begin showing you something."
            }
            action={!keyword ? <Button title="Add your first expense" variant="primary" onPress={() => navigation.navigate("AddExpense")} /> : undefined}
          />
        ) : (
          records.map((r) => (
            <RecordCard
              key={`${r.type}-${r.id}`}
              r={r}
              categoryName={categoryName(r.categoryId)}
              onPress={() => navigation.navigate("EditRecord", { record: r })}
            />
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

// ---------------------------------------------------------------- Category picker

function CategoryPicker({
  categories,
  value,
  onChange,
  onCreated,
  businessProfileId,
}: {
  categories: ExpenseCategory[];
  value: number | null;
  onChange: (id: number) => void;
  onCreated: () => void;
  businessProfileId: number;
}) {
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      const c = await api.post<ExpenseCategory>("/records/categories", {
        businessProfileId,
        name: newName.trim(),
      });
      setNewName("");
      onCreated();
      onChange(c.id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ marginBottom: space.md }}>
      <T variant="label" style={{ marginBottom: 4, color: ink[700] }}>Category</T>
      {categories.length > 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginBottom: space.sm }}>
          {categories.map((c) => (
            <Pressable
              key={c.id}
              onPress={() => onChange(c.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: value === c.id }}
              style={{
                minHeight: TAP - 8,
                justifyContent: "center",
                paddingHorizontal: space.md,
                borderRadius: radius.full,
                borderWidth: 1,
                borderColor: value === c.id ? brand[600] : ink[200],
                backgroundColor: value === c.id ? brand[600] : paper.DEFAULT,
              }}
            >
              <T style={{ fontSize: 13, color: value === c.id ? "#fff" : ink[700] }}>{c.name}</T>
            </Pressable>
          ))}
        </View>
      ) : (
        // Create-on-the-fly when the list is empty, same as web — a brand-new
        // business would otherwise hit a dead end on its very first expense.
        <T variant="caption" style={{ marginBottom: space.sm }}>
          No categories yet. Add your first one below (e.g. Inventory, Utilities, Rent).
        </T>
      )}
      <View style={{ flexDirection: "row", gap: space.sm }}>
        <TextInput
          value={newName}
          onChangeText={setNewName}
          placeholder="New category name"
          placeholderTextColor={ink[400]}
          style={{
            flex: 1,
            minHeight: TAP,
            borderWidth: 1,
            borderColor: ink[200],
            borderRadius: radius.md,
            paddingHorizontal: space.md,
            fontSize: 15,
            color: ink[900],
          }}
        />
        <Button title="Add" variant="secondary" onPress={create} loading={busy} disabled={!newName.trim()} />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------- Add expense

export function AddExpenseScreen({ navigation }: any) {
  const { selected, categories, refreshCategories } = useBusinessProfiles();
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [date, setDate] = useState(todayISO());
  const [description, setDescription] = useState("");
  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!selected) return null;

  async function submit() {
    if (!categoryId) return setError("Choose a category first.");
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return setError("Enter an amount greater than zero.");
    setError(null);
    setBusy(true);
    try {
      await api.post("/records/expenses", {
        businessProfileId: selected!.id,
        categoryId,
        date,
        description: description.trim(),
        vendor: vendor.trim() || undefined,
        amount: value,
      });
      navigation.goBack();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 2 }}>
        <Card>
          <T variant="title" style={{ fontSize: 18, marginBottom: space.md }}>Add expense</T>
          <CategoryPicker
            categories={categories}
            value={categoryId}
            onChange={setCategoryId}
            onCreated={refreshCategories}
            businessProfileId={selected.id}
          />
          <Field label="Date" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" />
          <Field label="Description" value={description} onChangeText={setDescription} placeholder="e.g. Rice sacks" />
          <Field label="Vendor (optional)" value={vendor} onChangeText={setVendor} />
          <Field label="Amount (PHP)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
          {error ? <ErrorNote>{error}</ErrorNote> : null}
          <Button title="Save expense" variant="primary" onPress={submit} loading={busy} style={{ marginTop: space.md }} />
        </Card>
      </ScrollView>
    </Screen>
  );
}

// ---------------------------------------------------------------- Add sales

export function AddSalesScreen({ navigation }: any) {
  const { selected } = useBusinessProfiles();
  const [date, setDate] = useState(todayISO());
  const [description, setDescription] = useState("Daily sales");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!selected) return null;

  async function submit() {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return setError("Enter an amount greater than zero.");
    setError(null);
    setBusy(true);
    try {
      await api.post("/records/sales", {
        businessProfileId: selected!.id,
        date,
        description: description.trim(),
        amount: value,
      });
      navigation.goBack();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: space.lg }}>
        <Card>
          <T variant="title" style={{ fontSize: 18, marginBottom: 4 }}>Add sales reference</T>
          <T variant="caption" style={{ marginBottom: space.md }}>
            A sales figure you record for monitoring — not a receipt for a customer.
          </T>
          <Field label="Date" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" />
          <Field label="Description" value={description} onChangeText={setDescription} />
          <Field label="Amount (PHP)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
          {error ? <ErrorNote>{error}</ErrorNote> : null}
          <Button title="Save sales record" variant="primary" onPress={submit} loading={busy} style={{ marginTop: space.md }} />
        </Card>
      </ScrollView>
    </Screen>
  );
}

// ---------------------------------------------------------------- Receipt scan

/**
 * Camera capture → upload to the existing backend receipt endpoint → editable
 * review → confirm.
 *
 * SECTION 0 DECISION: OCR runs SERVER-SIDE (Tesseract, already built and
 * accuracy-measured at 100% date / 95% vendor / 100% amount on a 20-image
 * corpus). Google ML Kit's on-device OCR needs native modules that don't run in
 * Expo Go, so adopting it would mean a dev-client or bare-workflow migration —
 * a large change for a capability the backend already provides and that has
 * measured accuracy behind it. On-device OCR is documented as a future
 * improvement instead.
 *
 * The one real difference from a browser upload: a phone camera returns a large,
 * possibly rotated JPEG. That is exactly why the review step below is editable
 * and nothing is saved until the owner confirms.
 */
export function ScanReceiptScreen({ navigation }: any) {
  const { selected, categories, refreshCategories } = useBusinessProfiles();
  const [scan, setScan] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [date, setDate] = useState(todayISO());
  const [description, setDescription] = useState("");
  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState("");

  if (!selected) return null;

  async function upload(asset: ImagePicker.ImagePickerAsset) {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("businessProfileId", String(selected!.id));
      // React Native's FormData takes this {uri,name,type} shape rather than a
      // Blob — the browser's File API isn't available here.
      form.append("file", {
        uri: asset.uri,
        name: asset.fileName ?? `receipt-${Date.now()}.jpg`,
        type: asset.mimeType ?? "image/jpeg",
      } as any);

      const result = await api.upload<any>("/records/receipts", form);
      setScan(result);
      // Pre-fill from OCR — as a draft the owner checks, never as truth.
      if (result.extractedDate) setDate(String(result.extractedDate).slice(0, 10));
      if (result.extractedVendor) setVendor(result.extractedVendor);
      if (result.extractedDescription) setDescription(result.extractedDescription);
      if (result.extractedAmount != null) setAmount(String(result.extractedAmount));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function takePhoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setError("FinSight needs camera access to photograph a receipt. You can enable it in Settings.");
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.7, mediaTypes: ["images"] });
    if (!res.canceled && res.assets[0]) await upload(res.assets[0]);
  }

  async function pickPhoto() {
    const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.7, mediaTypes: ["images"] });
    if (!res.canceled && res.assets[0]) await upload(res.assets[0]);
  }

  async function confirm() {
    if (!categoryId) return setError("Choose a category first.");
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return setError("Enter an amount greater than zero.");
    setBusy(true);
    setError(null);
    try {
      await api.post(`/records/receipts/${scan.id}/confirm`, {
        categoryId,
        date,
        description: description.trim() || "Receipt purchase",
        vendor: vendor.trim() || undefined,
        amount: value,
      });
      navigation.goBack();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 2 }}>
        {!scan ? (
          <Card>
            <T variant="title" style={{ fontSize: 18, marginBottom: 4 }}>Scan a receipt</T>
            <T variant="caption" style={{ marginBottom: space.lg }}>
              Take a photo and FinSight will read the date, store and amount. You check them before anything is saved.
            </T>
            {busy ? (
              <View style={{ alignItems: "center", paddingVertical: space.xl }}>
                <ActivityIndicator color={brand[600]} />
                <T variant="caption" style={{ marginTop: space.sm }}>Reading the receipt…</T>
              </View>
            ) : (
              <View style={{ gap: space.sm }}>
                <Button title="Take a photo" variant="primary" onPress={takePhoto} />
                <Button title="Choose from gallery" variant="secondary" onPress={pickPhoto} />
              </View>
            )}
            {error ? <View style={{ marginTop: space.md }}><ErrorNote>{error}</ErrorNote></View> : null}
          </Card>
        ) : (
          <Card>
            <T variant="title" style={{ fontSize: 18, marginBottom: 4 }}>Check the details</T>
            <T variant="caption" style={{ marginBottom: space.md }}>
              FinSight filled these in from the photo. Correct anything that's wrong — nothing is saved until you
              confirm.
            </T>
            <CategoryPicker
              categories={categories}
              value={categoryId}
              onChange={setCategoryId}
              onCreated={refreshCategories}
              businessProfileId={selected.id}
            />
            <Field label="Date" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" />
            <Field label="Description" value={description} onChangeText={setDescription} />
            <Field label="Vendor" value={vendor} onChangeText={setVendor} />
            <Field label="Amount (PHP)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
            {error ? <ErrorNote>{error}</ErrorNote> : null}
            <Button title="Save this expense" variant="primary" onPress={confirm} loading={busy} style={{ marginTop: space.md }} />
            <Button title="Retake photo" variant="ghost" onPress={() => setScan(null)} />
          </Card>
        )}
      </ScrollView>
    </Screen>
  );
}

// ---------------------------------------------------------------- CSV import

export function ImportCsvScreen({ navigation }: any) {
  const { selected } = useBusinessProfiles();
  const [file, setFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState({ date: "", description: "", amount: "", category: "" });
  const [result, setResult] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!selected) return null;

  function formFor(f: DocumentPicker.DocumentPickerAsset) {
    const form = new FormData();
    form.append("file", { uri: f.uri, name: f.name, type: "text/csv" } as any);
    return form;
  }

  async function pick() {
    const res = await DocumentPicker.getDocumentAsync({ type: ["text/csv", "text/comma-separated-values", "*/*"] });
    if (res.canceled || !res.assets?.[0]) return;
    const f = res.assets[0];
    setFile(f);
    setBusy(true);
    setError(null);
    try {
      const preview = await api.upload<{ headers: string[] }>("/records/csv-imports/preview", formFor(f));
      setHeaders(preview.headers);
      // Best-effort auto-match, so the common case needs no tapping at all.
      const guess = (want: RegExp) => preview.headers.find((h) => want.test(h)) ?? "";
      setMapping({
        date: guess(/date/i),
        description: guess(/desc|particular|item/i),
        amount: guess(/amount|cash|total/i),
        category: guess(/categ|class|type/i),
      });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const form = formFor(file);
      form.append("businessProfileId", String(selected!.id));
      form.append("recordType", "expense");
      form.append("title", file.name);
      form.append("columnMapping", JSON.stringify(mapping));
      setResult(await api.upload<any>("/records/csv-imports/confirm", form));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 2 }}>
        <Card>
          <T variant="title" style={{ fontSize: 18, marginBottom: 4 }}>Import a spreadsheet</T>
          <T variant="caption" style={{ marginBottom: space.lg }}>
            Bring in expenses from a CSV you already keep.
          </T>

          {result ? (
            <View style={{ gap: space.sm }}>
              <T style={{ fontSize: 15 }}>
                Imported {result.imported} of {result.totalRows} rows.
              </T>
              {result.skipped?.length ? (
                <AlertBanner kind="needs-review" label="Some rows were skipped">
                  {result.skipped.map((s: any) => `Row ${s.row}: ${s.reason}`).join("\n")}
                </AlertBanner>
              ) : null}
              {result.flagged > 0 ? (
                <AlertBanner kind="duplicate">{result.flagged} row(s) look like possible duplicates.</AlertBanner>
              ) : null}
              {result.largeExpenseFlagged > 0 ? (
                <AlertBanner kind="large-expense">
                  {result.largeExpenseFlagged} row(s) were flagged as large expenses.
                </AlertBanner>
              ) : null}
              <Button title="Done" variant="primary" onPress={() => navigation.goBack()} />
            </View>
          ) : !file ? (
            <Button title="Choose a CSV file" variant="primary" onPress={pick} />
          ) : (
            <View>
              <T variant="label" style={{ marginBottom: space.sm }}>{file.name}</T>
              <T variant="caption" style={{ marginBottom: space.md }}>
                Match your columns to FinSight's fields.
              </T>
              {(["date", "description", "amount", "category"] as const).map((field) => (
                <View key={field} style={{ marginBottom: space.md }}>
                  <T variant="label" style={{ marginBottom: 4, textTransform: "capitalize" }}>{field}</T>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
                    {headers.map((h) => (
                      <Pressable
                        key={h}
                        onPress={() => setMapping((m) => ({ ...m, [field]: h }))}
                        style={{
                          minHeight: TAP - 10,
                          justifyContent: "center",
                          paddingHorizontal: space.md,
                          borderRadius: radius.full,
                          borderWidth: 1,
                          borderColor: mapping[field] === h ? brand[600] : ink[200],
                          backgroundColor: mapping[field] === h ? brand[600] : paper.DEFAULT,
                        }}
                      >
                        <T style={{ fontSize: 12, color: mapping[field] === h ? "#fff" : ink[700] }}>{h}</T>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ))}
              {error ? <ErrorNote>{error}</ErrorNote> : null}
              <Button
                title="Import these rows"
                variant="primary"
                onPress={confirm}
                loading={busy}
                disabled={!mapping.date || !mapping.description || !mapping.amount || !mapping.category}
                style={{ marginTop: space.sm }}
              />
              <Button title="Choose a different file" variant="ghost" onPress={() => { setFile(null); setHeaders([]); }} />
            </View>
          )}
          {error && !file ? <View style={{ marginTop: space.md }}><ErrorNote>{error}</ErrorNote></View> : null}
        </Card>
      </ScrollView>
    </Screen>
  );
}

// ---------------------------------------------------------------- Flagged review

export function FlaggedRecordsScreen() {
  const { selected, categories } = useBusinessProfiles();
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!selected) return;
    setLoading(true);
    try {
      setRecords(await api.get<RecordItem[]>("/records/flagged", { businessProfileId: selected.id }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [selected?.id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function resolve(r: RecordItem) {
    const path = r.type === "expense" ? `/records/expenses/${r.id}` : `/records/sales/${r.id}`;
    await api.patch(path, { duplicateStatus: "Not a Duplicate", reviewStatus: "Reviewed" });
    await load();
  }

  if (!selected) return null;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 2 }}>
        <T variant="title" style={{ fontSize: 18, marginBottom: space.md }}>Records to review</T>
        {error ? <ErrorNote>{error}</ErrorNote> : null}
        {loading ? (
          <ActivityIndicator color={brand[600]} />
        ) : records.length === 0 ? (
          <EmptyState
            title="Nothing needs your attention"
            icon="✓"
            body="FinSight flags possible duplicates and unusually large expenses here as you record them."
          />
        ) : (
          records.map((r) => (
            <Card key={`${r.type}-${r.id}`} style={{ marginBottom: space.sm }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.md }}>
                <View style={{ flex: 1 }}>
                  <T style={{ fontFamily: "Inter_500Medium" }}>{r.description}</T>
                  <T variant="caption">{r.date.slice(0, 10)} · {categories.find((c) => c.id === r.categoryId)?.name ?? r.type}</T>
                </View>
                <Money value={r.amount} size={15} weight="semibold" />
              </View>
              {badges(r)}
              <Button title="Looks right — mark reviewed" variant="secondary" onPress={() => resolve(r)} style={{ marginTop: space.md }} />
            </Card>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}
