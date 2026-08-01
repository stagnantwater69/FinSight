import { useCallback, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert as RNAlert,
  Pressable,
  RefreshControl,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { Alert as AlertBanner, AlertBadge, Button, Callout, Card, EmptyState, ErrorNote, Money, Screen, ScreenHeader, T } from "../components/ui";
import { Field } from "./AuthScreens";
import { useBusinessProfiles } from "../context/BusinessProfileContext";
import { api, errorMessage } from "../lib/api";
import {
  buildItemisedConfirmPayload,
  buildReceiptConfirmPayload,
  gapCentavos,
  type ReconciliationPlan,
} from "../lib/receiptConfirm";
import { rowsToApplySuggestionTo, suggestedNewCategory } from "../lib/categorySuggestion";
import { useDebounced } from "../lib/useDebounced";
import { SkeletonList } from "../components/Skeleton";
import { DateField, DateRangeChips } from "../components/DateField";
import { Swipeable } from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
import * as haptics from "../lib/haptics";
import { RecordOriginPanel, type RecordOrigin } from "../components/RecordOrigin";
import {
  buildExpenseUpdatePayload,
  buildSalesUpdatePayload,
  recordUpdatePath,
} from "../lib/recordUpdate";
import { brand, ink, paper, radius, space, statusText, TAP } from "../theme/tokens";
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

/**
 * The action revealed behind a swiped row.
 *
 * Full-height and colour-filled so the gesture reads as uncovering something
 * rather than dragging the card off its own background.
 */
function SwipeAction({
  label,
  icon,
  colour,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  colour: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        width: 84,
        marginBottom: space.sm,
        backgroundColor: colour,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: radius.lg,
      }}
    >
      <Ionicons name={icon} size={20} color="#fff" />
      <T style={{ color: "#fff", fontSize: 11, marginTop: 2 }}>{label}</T>
    </Pressable>
  );
}

function RecordCard({
  r,
  categoryName,
  onPress,
  onDelete,
  onResolve,
}: {
  r: RecordItem;
  categoryName: string;
  onPress?: () => void;
  onDelete?: () => void;
  onResolve?: () => void;
}) {
  /*
   * Swipe reveals; it never acts on its own.
   *
   * A swipe that deleted on release would be a destructive action triggered by
   * a gesture people make accidentally while scrolling a list. Revealing a
   * button that must then be tapped keeps the shortcut without the hazard —
   * and `onDelete` still asks for confirmation on top of that.
   */
  const card = (
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

  // No actions wired means no gesture layer at all — a swipe that reveals
  // nothing is worse than a row that does not swipe.
  if (!onDelete && !onResolve) return card;

  const needsResolving = r.reviewStatus === "Needs Review" || r.duplicateStatus === "Flagged";

  return (
    <Swipeable
      overshootRight={false}
      overshootLeft={false}
      onSwipeableWillOpen={() => haptics.tapped()}
      renderRightActions={
        onDelete
          ? () => <SwipeAction label="Delete" icon="trash-outline" colour={statusText.critical} onPress={onDelete} />
          : undefined
      }
      renderLeftActions={
        onResolve && needsResolving
          ? () => (
              <SwipeAction
                label="Resolve"
                icon="checkmark-circle-outline"
                colour={statusText.good}
                onPress={onResolve}
              />
            )
          : undefined
      }
    >
      {card}
    </Swipeable>
  );
}

/** A filter value that can be turned on and off again. */
function FilterChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={{
        minHeight: TAP - 10,
        justifyContent: "center",
        paddingHorizontal: space.md,
        borderRadius: radius.full,
        borderWidth: 1,
        borderColor: selected ? brand[600] : ink[200],
        backgroundColor: selected ? brand[600] : paper.DEFAULT,
      }}
    >
      <T style={{ fontSize: 12, color: selected ? "#fff" : ink[700] }}>{label}</T>
    </Pressable>
  );
}

// ---------------------------------------------------------------- List

export function RecordsScreen({ navigation }: any) {
  const { selected, categories } = useBusinessProfiles();
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [keyword, setKeyword] = useState("");
  const [type, setType] = useState<"all" | "expense" | "sales">("all");
  // The endpoint has supported these three since before mobile had any UI for
  // them, so a phone could only ever filter by type and keyword.
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [source, setSource] = useState<RecordSource | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  /** Which whole-period shortcut is in effect, if any. */
  const [rangeLabel, setRangeLabel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Typing "groceries" used to fire nine requests, each racing the last.
  const searchTerm = useDebounced(keyword);
  /** Only send a date once it is actually a date, or the server answers 400. */
  const isCompleteDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

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
            keyword: searchTerm || undefined,
            categoryId: categoryId ?? undefined,
            source: source ?? undefined,
            dateFrom: isCompleteDate(dateFrom) ? dateFrom : undefined,
            dateTo: isCompleteDate(dateTo) ? dateTo : undefined,
          })
        );
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [selected?.id, type, searchTerm, categoryId, source, dateFrom, dateTo]
  );

  const activeFilters =
    (categoryId !== null ? 1 : 0) +
    (source !== null ? 1 : 0) +
    (isCompleteDate(dateFrom) ? 1 : 0) +
    (isCompleteDate(dateTo) ? 1 : 0);

  function clearFilters() {
    setCategoryId(null);
    setSource(null);
    setDateFrom("");
    setDateTo("");
    setRangeLabel(null);
  }

  useFocusEffect(useCallback(() => { load(); }, [load]));

  /**
   * Deleting from a swipe still asks first.
   *
   * The gesture only reveals the button; this is the second gate. A record is
   * evidence for figures on every other screen, and a mis-swipe while
   * scrolling must not be able to destroy one.
   */
  function confirmDelete(record: RecordItem) {
    RNAlert.alert(
      "Delete this record?",
      `"${record.description}" will be removed. This cannot be undone.`,
      [
        { text: "Keep it", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            // Optimistic: the row leaves immediately and comes back if the
            // server refuses, rather than the owner watching a spinner over a
            // row they have already decided about.
            const previous = records;
            setRecords((rows) => rows.filter((x) => !(x.type === record.type && x.id === record.id)));
            try {
              await api.delete(recordUpdatePath(record.type, record.id));
              haptics.committed();
            } catch (err) {
              setRecords(previous);
              setError(errorMessage(err));
              haptics.failed();
            }
          },
        },
      ],
    );
  }

  /** Clears a flag from the list, without a trip to the review screen. */
  async function resolve(record: RecordItem) {
    const previous = records;
    setRecords((rows) =>
      rows.map((x) =>
        x.type === record.type && x.id === record.id
          ? { ...x, reviewStatus: "Reviewed" as const, duplicateStatus: "Not a Duplicate" as const }
          : x,
      ),
    );
    try {
      await api.patch(recordUpdatePath(record.type, record.id), {
        duplicateStatus: "Not a Duplicate",
        reviewStatus: "Reviewed",
      });
      haptics.succeeded();
    } catch (err) {
      setRecords(previous);
      setError(errorMessage(err));
      haptics.failed();
    }
  }

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
        <ScreenHeader eyebrow="Your money" title="Records" subtitle="Everything you've recorded" />

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
                onPress={() => {
                  haptics.tapped();
                  setType(t);
                }}
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

          {/*
            Kept behind a toggle. Four more controls open by default would
            bury the list they filter on a phone screen; the count keeps an
            active filter from being invisible while collapsed.
          */}
          <Pressable
            onPress={() => setShowFilters((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: showFilters }}
            style={{ paddingVertical: space.sm }}
          >
            <T variant="caption" style={{ color: brand[700] }}>
              {showFilters ? "Hide filters" : "More filters"}
              {activeFilters > 0 ? ` (${activeFilters} active)` : ""}
            </T>
          </Pressable>

          {showFilters ? (
            <View style={{ gap: space.sm }}>
              <View>
                <T variant="caption" style={{ marginBottom: 4 }}>Category</T>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
                  <FilterChip label="Any" selected={categoryId === null} onPress={() => setCategoryId(null)} />
                  {categories.map((c) => (
                    <FilterChip
                      key={c.id}
                      label={c.name}
                      selected={categoryId === c.id}
                      onPress={() => setCategoryId(categoryId === c.id ? null : c.id)}
                    />
                  ))}
                </View>
              </View>

              <View>
                <T variant="caption" style={{ marginBottom: 4 }}>How it was added</T>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
                  <FilterChip label="Any" selected={source === null} onPress={() => setSource(null)} />
                  {(Object.keys(RECORD_SOURCE_LABELS) as RecordSource[]).map((s) => (
                    <FilterChip
                      key={s}
                      label={RECORD_SOURCE_LABELS[s]}
                      selected={source === s}
                      onPress={() => setSource(source === s ? null : s)}
                    />
                  ))}
                </View>
              </View>

              <View>
                <T variant="caption" style={{ marginBottom: 4 }}>When</T>
                {/*
                  Most filtering is "this week" or "this month" rather than two
                  specific dates, so those cost one tap and the pickers below
                  are only needed for a genuinely custom range.
                */}
                <DateRangeChips
                  activeLabel={rangeLabel}
                  onPick={(from, to, label) => {
                    setDateFrom(from);
                    setDateTo(to);
                    setRangeLabel(label);
                  }}
                />
              </View>

              <View style={{ flexDirection: "row", gap: space.sm }}>
                <View style={{ flex: 1 }}>
                  <DateField
                    label="From"
                    value={dateFrom}
                    optional
                    onChange={(v) => {
                      setDateFrom(v);
                      setRangeLabel(null);
                    }}
                    onClear={() => {
                      setDateFrom("");
                      setRangeLabel(null);
                    }}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <DateField
                    label="To"
                    value={dateTo}
                    optional
                    onChange={(v) => {
                      setDateTo(v);
                      setRangeLabel(null);
                    }}
                    onClear={() => {
                      setDateTo("");
                      setRangeLabel(null);
                    }}
                  />
                </View>
              </View>

              {activeFilters > 0 ? (
                <Button title="Clear filters" variant="ghost" onPress={clearFilters} />
              ) : null}
            </View>
          ) : null}
        </Card>

        {error ? <ErrorNote>{error}</ErrorNote> : null}

        {loading ? (
          <SkeletonList />
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
              onDelete={() => confirmDelete(r)}
              onResolve={() => resolve(r)}
            />
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

// ---------------------------------------------------------------- Category picker

/**
 * Chips only — no create field.
 *
 * The full CategoryPicker below carries a "new category" input, which is
 * right when it appears once on a form and wrong when it appears on every row
 * of an itemised receipt. Same chips, same selected state, none of the
 * repetition.
 */
function CategoryChips({
  categories,
  value,
  onChange,
  label,
}: {
  categories: ExpenseCategory[];
  value: number | null;
  onChange: (id: number) => void;
  label: string;
}) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
      {categories.map((c) => (
        <Pressable
          key={c.id}
          onPress={() => onChange(c.id)}
          accessibilityRole="button"
          accessibilityLabel={`${c.name}, category for ${label}`}
          accessibilityState={{ selected: value === c.id }}
          style={{
            minHeight: TAP - 10,
            justifyContent: "center",
            paddingHorizontal: space.md,
            borderRadius: radius.full,
            borderWidth: 1,
            borderColor: value === c.id ? brand[600] : ink[200],
            backgroundColor: value === c.id ? brand[600] : paper.DEFAULT,
          }}
        >
          <T style={{ fontSize: 12, color: value === c.id ? "#fff" : ink[700] }}>{c.name}</T>
        </Pressable>
      ))}
    </View>
  );
}

/**
 * One answer to "what is this difference".
 *
 * A single decision with mutually exclusive answers, so it behaves as a radio
 * for assistive tech rather than as three unrelated buttons.
 */
function GapOption({
  selected,
  onPress,
  title,
  detail,
  children,
}: {
  selected: boolean;
  onPress: () => void;
  title: string;
  detail: string;
  children?: ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={{
        borderWidth: 1,
        borderColor: selected ? brand[600] : ink[200],
        backgroundColor: selected ? brand[50] : paper.DEFAULT,
        borderRadius: radius.md,
        padding: space.md,
        marginBottom: space.sm,
      }}
    >
      <T style={{ fontSize: 14, color: ink[900], fontFamily: "Inter_500Medium" }}>{title}</T>
      <T variant="caption" style={{ marginTop: 2 }}>{detail}</T>
      {children}
    </Pressable>
  );
}

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
      haptics.succeeded();
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
          <DateField label="Date" value={date} onChange={setDate} />
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
          <DateField label="Date" value={date} onChange={setDate} />
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
/**
 * What POST /records/receipts returns.
 *
 * Typed rather than `any` because `any` is precisely how this screen drifted
 * off the API contract: the confirm call below sent a field the server had
 * stopped accepting, and nothing anywhere could tell. Naming the shape is the
 * cheapest guard against the next round of that.
 */
interface ReceiptScanResult {
  id: number;
  extractedDate: string | null;
  extractedVendor: string | null;
  extractedDescription: string | null;
  extractedAmount: number | null;
  /**
   * True when the server could not read the receipt's TEXT and had a vision
   * model interpret the photograph instead. These values are a machine's
   * reading of a picture, and the screen has to say so.
   */
  visionAssisted?: boolean;
  /**
   * The individual lines the server read, each with the category it assigned.
   * A receipt with more than one is reviewed line by line below; anything
   * less keeps the single-category flow.
   */
  items?: {
    id: number;
    name: string;
    quantity: number | null;
    amount: number;
    /** What FinSight assigned. Null when nothing on the list fitted. */
    categoryId: number | null;
    /** True for a line a vision model produced rather than OCR text. */
    extractedByVision?: boolean;
    /** A category FinSight thinks is missing. Only ever an offer. */
    suggestedCategoryName?: string | null;
  }[];
}

export function ScanReceiptScreen({ navigation, route }: any) {
  const { selected, categories, refreshCategories } = useBusinessProfiles();
  const [scan, setScan] = useState<ReceiptScanResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [date, setDate] = useState(todayISO());
  const [description, setDescription] = useState("");
  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState("");

  /**
   * The owner's category for each extracted line, keyed by item id.
   *
   * Seeded from what the server assigned automatically, then owned by the
   * owner — every row is editable and nothing is written until Confirm.
   */
  const [itemCategories, setItemCategories] = useState<Record<number, number | null>>({});
  /** How they want to account for any difference between items and total. */
  const [plan, setPlan] = useState<ReconciliationPlan>(null);
  /** The category for the "file it on its own" plan. */
  const [gapCategoryId, setGapCategoryId] = useState<number | null>(null);
  /** The proposed category currently being created, so its row can show progress. */
  const [creatingCategoryFor, setCreatingCategoryFor] = useState<string | null>(null);
  /**
   * Lines the owner is adding because OCR missed them.
   *
   * Held here until Confirm, like every other answer on this screen — nothing
   * is written until they accept the whole receipt.
   */
  const [addedItems, setAddedItems] = useState<
    { key: string; name: string; amount: string; categoryId: number | null }[]
  >([]);
  /** The extracted line currently being removed, so its row can show progress. */
  const [removingItemId, setRemovingItemId] = useState<number | null>(null);

  /*
   * The Scan tab button navigates here with autoLaunch: true, and the whole
   * point of putting Scan in the middle of the bar is that the button IS the
   * scan action — landing on a screen that still needs a "Take a photo" tap
   * would make the button a shortcut to the shortcut, not the action itself.
   *
   * Ordinary navigation into this screen (the "Scan receipt" button on the
   * Records list) carries no such param, so the picker still shows first
   * there — unprompted camera access on an unrelated flow would be a surprise
   * only it's asking for.
   *
   * FOCUS-based, not a plain mount effect, and the param is cleared the
   * instant it is read rather than guarded with a ref. React Navigation can
   * reuse this screen's instance rather than remounting it — pressing Scan a
   * second time without backing out first navigates to an ALREADY-MOUNTED
   * "ScanReceipt" and merges params into it rather than creating a fresh
   * instance. A ref guard survives that fine on the visit that set it, but a
   * dependency array keyed on `route.params.autoLaunch` does not: the value
   * is `true` both times, `Object.is(true, true)` is true, and a plain
   * `useEffect` simply never runs again — so the second and every later tap
   * of the button would silently stop opening the camera. Clearing the param
   * immediately after reading it means the NEXT press always arrives as a
   * fresh `undefined -> true` transition, on a reused instance or a new one.
   */
  useFocusEffect(
    useCallback(() => {
      if (route?.params?.autoLaunch) {
        navigation.setParams({ autoLaunch: undefined });
        takePhoto();
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [route?.params?.autoLaunch]),
  );

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

      const result = await api.upload<ReceiptScanResult>("/records/receipts", form);
      setScan(result);
      // Pre-fill from OCR — as a draft the owner checks, never as truth.
      if (result.extractedDate) setDate(String(result.extractedDate).slice(0, 10));
      if (result.extractedVendor) setVendor(result.extractedVendor);
      if (result.extractedDescription) setDescription(result.extractedDescription);
      if (result.extractedAmount != null) setAmount(String(result.extractedAmount));
      // Seed the per-item categories from what FinSight assigned. A starting
      // point, not a decision — every row stays editable below.
      setItemCategories(
        Object.fromEntries((result.items ?? []).map((i) => [i.id, i.categoryId ?? null])),
      );
      setPlan(null);
      setGapCategoryId(null);
      // A vision-assisted read is a guess, not a reading — it deserves a
      // different signal from a clean scan, so the owner is primed to check
      // it before they even look down.
      result.visionAssisted ? haptics.warned() : haptics.succeeded();
    } catch (err) {
      haptics.failed();
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
    haptics.committed();
    const res = await ImagePicker.launchCameraAsync({ quality: 0.7, mediaTypes: ["images"] });
    if (!res.canceled && res.assets[0]) await upload(res.assets[0]);
  }

  async function pickPhoto() {
    const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.7, mediaTypes: ["images"] });
    if (!res.canceled && res.assets[0]) await upload(res.assets[0]);
  }

  /*
   * Two review modes, exactly as web has.
   *
   * A receipt whose lines FinSight could read is reviewed ITEM BY ITEM — that
   * is the point of the feature, and it is what lets "buns" land in
   * Ingredients while "rice cooker" lands in Equipment without the owner
   * deciding anything up front. A receipt with one line or none keeps the
   * single-category flow: a grouping UI for one item would be ceremony around
   * a decision the category picker already makes.
   */
  const items = scan?.items ?? [];
  const isItemised = items.length > 1;
  /** An added line only counts once it is actually usable. */
  const usableAddedItems = addedItems.filter(
    (a) => a.name.trim() !== "" && Number(a.amount) > 0 && a.categoryId != null,
  );
  // Added lines count toward the items' total the moment they are complete, so
  // adding a missed line closes the gap immediately rather than after saving.
  const itemsTotal =
    items.reduce((sum, i) => sum + i.amount, 0) +
    usableAddedItems.reduce((sum, a) => sum + Number(a.amount), 0);
  const totalValue = Number(amount);
  const gap = Number.isFinite(totalValue) ? gapCentavos(totalValue, itemsTotal) : 0;
  const everyItemHasCategory =
    items.every((i) => itemCategories[i.id] != null) &&
    // A half-typed added row must not enable Confirm.
    addedItems.length === usableAddedItems.length;
  // A discount can't become its own expense record — that would be a negative
  // expense, which nothing downstream understands. The server refuses it too.
  const canFileGapOnItsOwn = gap > 0;
  const planResolved =
    gap === 0 ||
    plan === "proportional" ||
    plan === "shrink" ||
    (plan === "category" && canFileGapOnItsOwn && gapCategoryId != null);

  async function confirm() {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return setError("Enter an amount greater than zero.");
    if (isItemised) {
      if (!everyItemHasCategory) return setError("Every item needs a category before this can be saved.");
      if (!planResolved) return setError("Choose how to account for the difference first.");
    } else if (!categoryId) {
      return setError("Choose a category first.");
    }

    setBusy(true);
    setError(null);
    try {
      // Both shapes and their rules live in lib/receiptConfirm, where they can
      // be tested against the server's schema — this call is what silently
      // broke against it before.
      const payload = isItemised
        ? buildItemisedConfirmPayload({
            date,
            description,
            vendor,
            totalAmount: value,
            itemsTotal,
            itemAssignments: items.map((i) => ({ itemId: i.id, categoryId: itemCategories[i.id]! })),
            additionalItems: usableAddedItems.map((a) => ({
              name: a.name.trim(),
              amount: Number(a.amount),
              categoryId: a.categoryId!,
            })),
            plan,
            gapCategoryId,
          })
        : buildReceiptConfirmPayload({ date, description, vendor, amount: value, categoryId: categoryId! });

      await api.post(`/records/receipts/${scan!.id}/confirm`, payload);
      haptics.succeeded();
      navigation.goBack();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  /**
   * The standing "nothing fitted this" category, if this business has one.
   *
   * Created server-side on demand during a scan, so it may not exist at all,
   * and matched case-insensitively because an owner who already had their own
   * keeps it — the same rule the server follows.
   */
  const uncategorisedId = categories.find((c) => c.name.toLowerCase() === "uncategorized")?.id ?? null;

  /** See lib/categorySuggestion — the rule has edge cases worth testing. */
  function suggestedNewCategoryFor(item: { id: number; suggestedCategoryName?: string | null }): string | null {
    return suggestedNewCategory(
      item,
      itemCategories[item.id] ?? null,
      uncategorisedId,
      categories.map((c) => c.name),
    );
  }

  /**
   * Accepts a category FinSight proposed for items nothing existing fitted.
   *
   * Creates it, then files every UNPLACED row it was proposed for — not only
   * the row that was tapped. A grocery run proposes "Packaging" on all four
   * packaging lines, and making the owner create it once then assign it three
   * more times by hand would be busywork on a decision already made. Rows they
   * placed themselves are left alone, and everything stays editable.
   */
  async function acceptSuggestedCategory(name: string) {
    setCreatingCategoryFor(name);
    setError(null);
    try {
      const created = await api.post<ExpenseCategory>("/records/categories", {
        businessProfileId: selected!.id,
        name,
      });
      await refreshCategories();
      setItemCategories((prev) => {
        const next = { ...prev };
        for (const id of rowsToApplySuggestionTo(items, name, prev, uncategorisedId)) {
          next[id] = created.id;
        }
        return next;
      });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setCreatingCategoryFor(null);
    }
  }

  /**
   * Drops a line OCR read that was never a purchase.
   *
   * Deleted on the SERVER rather than hidden here, because confirmation
   * requires every stored item to carry a category — a row this screen merely
   * stopped showing would still be on the scan and would block Confirm with a
   * message about an item the owner can no longer see.
   *
   * Widening the gap against the total is the intended consequence, not a
   * side effect: the reconciliation question below already exists to answer
   * exactly that.
   */
  async function removeScannedItem(itemId: number) {
    if (!scan) return;
    setRemovingItemId(itemId);
    setError(null);
    try {
      const updated = await api.delete<ReceiptScanResult>(`/records/receipts/${scan.id}/items/${itemId}`);
      setScan(updated);
      setItemCategories((prev) => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setRemovingItemId(null);
    }
  }

  /** Items and completed added lines, grouped by category with a subtotal each. */
  const itemGroups = (() => {
    const groups = new Map<number | null, { total: number; count: number }>();
    const add = (key: number | null, amount: number) => {
      const g = groups.get(key) ?? { total: 0, count: 0 };
      g.total += amount;
      g.count += 1;
      groups.set(key, g);
    };
    for (const item of items) add(itemCategories[item.id] ?? null, item.amount);
    for (const a of usableAddedItems) add(a.categoryId, Number(a.amount));
    return [...groups.entries()];
  })();

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
            {/*
              A receipt whose TEXT could not be read at all is a different
              claim from one that was read imperfectly, and it gets different
              words. Normally the server reads characters and parses them by
              rule; here it could not, so it asked a model what the photograph
              appeared to show. That is interpretation, not reading, and the
              owner is entitled to know which produced the numbers they are
              about to accept — the same warning the web confirm screen shows.
            */}
            {scan.visionAssisted ? (
              <View style={{ marginBottom: space.md, marginTop: space.sm }}>
                <Callout tone="warn">
                  FinSight couldn't read this receipt's text. These values were interpreted from the photo
                  by AI, so treat them as a first guess rather than something read off the paper — check
                  every one, including the total, against the photo.
                </Callout>
              </View>
            ) : (
              <T variant="caption" style={{ marginBottom: space.md }}>
                FinSight filled these in from the photo. Correct anything that's wrong — nothing is saved
                until you confirm.
              </T>
            )}
            {!isItemised ? (
              <CategoryPicker
                categories={categories}
                value={categoryId}
                onChange={setCategoryId}
                onCreated={refreshCategories}
                businessProfileId={selected.id}
              />
            ) : null}
            <DateField label="Date" value={date} onChange={setDate} />
            <Field label="Description" value={description} onChangeText={setDescription} />
            <Field label="Vendor" value={vendor} onChangeText={setVendor} />
            <Field label="Amount (PHP)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />

            {isItemised ? (
              <View style={{ marginTop: space.sm }}>
                <T variant="label" style={{ color: ink[700], marginBottom: 4 }}>
                  Items on this receipt
                </T>
                <T variant="caption" style={{ marginBottom: space.sm }}>
                  FinSight {items.some((i) => i.extractedByVision) ? "found" : "read"} {items.length} items.
                  Put each one in a category — check them against the photo and change any that are wrong.
                </T>

                {items.map((item) => (
                  <View
                    key={item.id}
                    style={{
                      borderTopWidth: 1,
                      borderTopColor: paper[100],
                      paddingVertical: space.sm,
                    }}
                  >
                    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.sm }}>
                      <T style={{ flex: 1, fontSize: 14, color: ink[900] }} numberOfLines={2}>
                        {item.name}
                        {item.quantity != null ? (
                          <T variant="caption"> × {item.quantity}</T>
                        ) : null}
                      </T>
                      <Money value={item.amount} size={14} weight="semibold" />
                      {/* Removing a line OCR should never have read. */}
                      <Pressable
                        onPress={() => removeScannedItem(item.id)}
                        disabled={removingItemId === item.id}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${item.name} — this was not a purchase`}
                        style={{
                          minWidth: TAP - 12,
                          minHeight: TAP - 12,
                          alignItems: "center",
                          justifyContent: "center",
                          opacity: removingItemId === item.id ? 0.4 : 1,
                        }}
                      >
                        <T style={{ fontSize: 16, color: ink[400] }}>×</T>
                      </Pressable>
                    </View>

                    {/*
                      A line a model inferred from a photograph must not look
                      like one read off text. Marked per row, because the row
                      is where the owner actually decides.
                    */}
                    {item.extractedByVision ? (
                      <T variant="caption" style={{ marginTop: 2, color: statusText.warning }}>
                        ✦ AI read this from the photo
                      </T>
                    ) : null}

                    <View style={{ marginTop: space.sm }}>
                      <CategoryChips
                        categories={categories}
                        value={itemCategories[item.id] ?? null}
                        onChange={(id) => {
                          haptics.tapped();
                          setItemCategories((prev) => ({ ...prev, [item.id]: id }));
                        }}
                        label={item.name}
                      />
                    </View>

                    {/*
                      A category FinSight thinks is missing.

                      Phrased as an offer rather than an assignment, because
                      nothing is created until the owner says so — inventing
                      categories in someone's books is not FinSight's call.
                    */}
                    {suggestedNewCategoryFor(item) ? (
                      <Pressable
                        onPress={() => acceptSuggestedCategory(item.suggestedCategoryName!)}
                        disabled={creatingCategoryFor !== null}
                        accessibilityRole="button"
                        accessibilityLabel={`Create the category ${item.suggestedCategoryName} and file ${item.name} under it`}
                        style={{ marginTop: space.sm, opacity: creatingCategoryFor !== null ? 0.5 : 1 }}
                      >
                        <T variant="caption" style={{ color: brand[700] }}>
                          {creatingCategoryFor === item.suggestedCategoryName
                            ? "Creating…"
                            : `✦ Nothing fits this. Create "${item.suggestedCategoryName}"?`}
                        </T>
                      </Pressable>
                    ) : null}
                  </View>
                ))}

                {/*
                  Lines the owner is adding because OCR missed them.

                  Kept visually distinct from the extracted rows: the text
                  above claims FinSight READ these items, and that claim must
                  not quietly extend to a row a human typed. The same
                  distinction is stored server-side (addedByOwner) so it
                  survives onto the saved record.
                */}
                {addedItems.map((added, i) => (
                  <View
                    key={added.key}
                    style={{
                      borderTopWidth: 1,
                      borderTopColor: paper[100],
                      backgroundColor: paper[50],
                      paddingVertical: space.sm,
                      paddingHorizontal: space.sm,
                    }}
                  >
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <T variant="caption">You're adding this line</T>
                      <Pressable
                        onPress={() => setAddedItems((prev) => prev.filter((x) => x.key !== added.key))}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove added item ${i + 1}`}
                        style={{ minWidth: TAP - 12, minHeight: TAP - 16, alignItems: "flex-end" }}
                      >
                        <T style={{ fontSize: 16, color: ink[400] }}>×</T>
                      </Pressable>
                    </View>
                    <Field
                      label="Item name"
                      value={added.name}
                      onChangeText={(v: string) =>
                        setAddedItems((prev) => prev.map((x) => (x.key === added.key ? { ...x, name: v } : x)))
                      }
                    />
                    <Field
                      label="Amount (PHP)"
                      value={added.amount}
                      keyboardType="decimal-pad"
                      onChangeText={(v: string) =>
                        setAddedItems((prev) => prev.map((x) => (x.key === added.key ? { ...x, amount: v } : x)))
                      }
                    />
                    <CategoryChips
                      categories={categories}
                      value={added.categoryId}
                      onChange={(id) =>
                        setAddedItems((prev) =>
                          prev.map((x) => (x.key === added.key ? { ...x, categoryId: id } : x)),
                        )
                      }
                      label={added.name || `added item ${i + 1}`}
                    />
                  </View>
                ))}

                <Pressable
                  onPress={() =>
                    setAddedItems((prev) => [
                      ...prev,
                      { key: `added-${Date.now()}-${prev.length}`, name: "", amount: "", categoryId: null },
                    ])
                  }
                  accessibilityRole="button"
                  style={{ paddingVertical: space.sm }}
                >
                  <T variant="caption" style={{ color: brand[700] }}>
                    + An item is missing — add it to the list
                  </T>
                </Pressable>

                {/* What actually gets saved — one record per category group. */}
                <View
                  style={{
                    marginTop: space.md,
                    padding: space.md,
                    borderRadius: radius.md,
                    backgroundColor: paper[100],
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: space.sm,
                      marginBottom: space.xs,
                    }}
                  >
                    <T variant="label" style={{ color: ink[700] }}>
                      What gets saved
                    </T>
                    {/*
                      Whether the receipt balances, stated as a badge rather
                      than left for the owner to work out by comparing two
                      numbers in different places. Colour is never the only
                      signal — the badge carries a glyph and words.
                    */}
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 4,
                        paddingHorizontal: space.sm,
                        paddingVertical: 3,
                        borderRadius: radius.full,
                        backgroundColor: gap === 0 ? "#eafaf1" : "#fffbeb",
                      }}
                    >
                      <T
                        style={{
                          fontSize: 11,
                          color: gap === 0 ? statusText.good : statusText.warning,
                        }}
                      >
                        {gap === 0
                          ? "✓ Balances"
                          : `⚠ ${gap > 0 ? "Short" : "Over"} PHP ${(Math.abs(gap) / 100).toFixed(2)}`}
                      </T>
                    </View>
                  </View>
                  {itemGroups.map(([catId, g]) => (
                    <View
                      key={String(catId)}
                      style={{ flexDirection: "row", justifyContent: "space-between", gap: space.sm, marginTop: 2 }}
                    >
                      <T style={{ flex: 1, fontSize: 13, color: catId == null ? statusText.warning : ink[700] }}>
                        {catId == null
                          ? "Not categorised yet"
                          : (categories.find((c) => c.id === catId)?.name ?? "Category")}
                        <T variant="caption"> ({g.count} item{g.count === 1 ? "" : "s"})</T>
                      </T>
                      <Money value={g.total} size={13} />
                    </View>
                  ))}
                  <T
                    variant="caption"
                    style={{ marginTop: space.sm, color: everyItemHasCategory && planResolved ? statusText.good : statusText.warning }}
                  >
                    {!everyItemHasCategory
                      ? "⚠ Every item needs a category before this can be saved."
                      : gap === 0
                        ? `✓ ${itemGroups.length} record${itemGroups.length === 1 ? "" : "s"} will be saved, adding up to the receipt total.`
                        : plan === "shrink"
                          ? `✓ The receipt will be saved as PHP ${itemsTotal.toFixed(2)} — the items' own total.`
                          : planResolved
                            ? "✓ Ready to save."
                            : gap > 0
                              ? `⚠ The items come to PHP ${itemsTotal.toFixed(2)}, which is PHP ${(gap / 100).toFixed(2)} less than the total above.`
                              : `⚠ The items come to PHP ${itemsTotal.toFixed(2)}, which is PHP ${(-gap / 100).toFixed(2)} more than the total above.`}
                  </T>
                </View>

                {/*
                  Accounting for the difference.

                  A gap is normal rather than a mistake: a VAT-exclusive
                  register adds tax on top of the printed lines, a discount
                  takes money off, and OCR sometimes just misses a line. So the
                  screen asks what the difference IS instead of blocking until
                  the arithmetic works — which, on a VAT-exclusive receipt, it
                  never would. The total never changes on its own; only the
                  last option touches it, and only to figures read off the
                  receipt.
                */}
                {everyItemHasCategory && gap !== 0 ? (
                  <View style={{ marginTop: space.md }}>
                    <T variant="label" style={{ color: ink[700], marginBottom: 4 }}>
                      {gap > 0
                        ? `What is the missing PHP ${(gap / 100).toFixed(2)}?`
                        : `What is the extra PHP ${(-gap / 100).toFixed(2)}?`}
                    </T>
                    <T variant="caption" style={{ marginBottom: space.sm }}>
                      {gap > 0
                        ? "Receipts often add tax or a service charge on top of the item prices, and sometimes a line just doesn't scan."
                        : "A discount or a voided line usually explains this."}
                    </T>

                    <GapOption
                      selected={plan === "proportional"}
                      onPress={() => {
                        haptics.tapped();
                        setPlan("proportional");
                      }}
                      title={gap > 0 ? "Tax or a service charge" : "A discount on the whole receipt"}
                      detail="Split across the categories above, in proportion to what each came to. Keeps every category's spending accurate."
                    />
                    {canFileGapOnItsOwn ? (
                      <GapOption
                        selected={plan === "category"}
                        onPress={() => {
                          haptics.tapped();
                          setPlan("category");
                        }}
                        title="A separate charge to track on its own"
                        detail="Saved as its own expense record under one category."
                      >
                        {plan === "category" ? (
                          <View style={{ marginTop: space.sm }}>
                            <CategoryChips
                              categories={categories}
                              value={gapCategoryId}
                              onChange={setGapCategoryId}
                              label="the remaining amount"
                            />
                          </View>
                        ) : null}
                      </GapOption>
                    ) : null}
                    <GapOption
                      selected={plan === "shrink"}
                      onPress={() => {
                        haptics.tapped();
                        setPlan("shrink");
                      }}
                      title="FinSight misread the receipt total"
                      detail={`Save PHP ${itemsTotal.toFixed(2)} — the items' own total — instead of the amount above.`}
                    />
                  </View>
                ) : null}
              </View>
            ) : null}

            {error ? <ErrorNote>{error}</ErrorNote> : null}
            <Button
              title={
                isItemised && itemGroups.length > 1
                  ? `Save ${itemGroups.length} expenses`
                  : "Save this expense"
              }
              variant="primary"
              onPress={confirm}
              loading={busy}
              style={{ marginTop: space.md }}
            />
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

// ---------------------------------------------------------------- Edit a record

/**
 * Editing and deleting a record the owner already saved.
 *
 * This screen was NAVIGATED TO but never existed: every card on the records
 * list called navigate("EditRecord") while no such screen was registered, so
 * tapping a record silently did nothing and a typo was permanent on mobile.
 * The list's tap affordance has been pointing at this for a while.
 *
 * The record travels in the route params rather than being re-fetched. The
 * list already holds the whole object, so refetching would trade an instant
 * render for a spinner and gain nothing — web fetches only because its URL
 * carries an id and nothing else.
 */
export function EditRecordScreen({ route, navigation }: any) {
  const { selected, categories, refreshCategories } = useBusinessProfiles();
  const record: RecordItem = route.params.record;
  const isExpense = record.type === "expense";

  const [categoryId, setCategoryId] = useState<number | null>(record.categoryId ?? null);
  const [date, setDate] = useState(record.date.slice(0, 10));
  const [description, setDescription] = useState(record.description);
  const [vendor, setVendor] = useState(record.vendor ?? "");
  const [amount, setAmount] = useState(String(record.amount));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /**
   * Where this record came from.
   *
   * Only the single-record endpoint carries it, so it is fetched here rather
   * than travelling in the route params with the rest of the record. A
   * failure is silent: the panel is context, and losing it should degrade the
   * screen rather than block editing.
   */
  const [origin, setOrigin] = useState<RecordOrigin | null>(null);
  const [loadingOrigin, setLoadingOrigin] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          const detail = await api.get<{ origin: RecordOrigin | null }>(
            recordUpdatePath(record.type, record.id),
          );
          if (!cancelled) setOrigin(detail.origin ?? null);
        } catch {
          // Context only — a record with no visible provenance is still fully
          // editable, which is what this screen is for.
        } finally {
          if (!cancelled) setLoadingOrigin(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [record.type, record.id]),
  );

  if (!selected) return null;

  async function save() {
    const value = Number(amount);
    if (!description.trim()) return setError("Give this record a description.");
    if (!Number.isFinite(value) || value <= 0) return setError("Enter an amount greater than zero.");
    if (isExpense && !categoryId) return setError("Choose a category first.");

    setError(null);
    setBusy(true);
    try {
      const input = { date, description, amount: value, categoryId, vendor };
      await api.patch(
        recordUpdatePath(record.type, record.id),
        // Expense and sales take DIFFERENT fields — a sales record has no
        // category and no vendor server-side. Built in lib/recordUpdate so
        // that distinction is tested rather than remembered.
        isExpense ? buildExpenseUpdatePayload(input) : buildSalesUpdatePayload(input),
      );
      haptics.succeeded();
      navigation.goBack();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  /**
   * Deleting asks first, through the platform's own dialog.
   *
   * Web offers an undo toast instead; mobile has no toast system yet, so the
   * confirmation comes BEFORE the deletion rather than the reprieve after it.
   * Either way the owner gets one chance to stop — what must not happen is a
   * tap that destroys a record with neither.
   */
  function confirmDelete() {
    RNAlert.alert(
      "Delete this record?",
      `"${record.description}" will be removed. This cannot be undone.`,
      [
        { text: "Keep it", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            setError(null);
            try {
              await api.delete(recordUpdatePath(record.type, record.id));
              haptics.committed();
              navigation.goBack();
            } catch (err) {
              setError(errorMessage(err));
              setBusy(false);
            }
          },
        },
      ],
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 2 }}>
        <Card>
          <T variant="title" style={{ fontSize: 18, marginBottom: 4 }}>
            {isExpense ? "Edit expense" : "Edit sales"}
          </T>
          <T variant="caption" style={{ marginBottom: space.md }}>
            {RECORD_SOURCE_LABELS[record.source as RecordSource] ?? record.source} ·{" "}
            {record.date.slice(0, 10)}
          </T>

          {badges(record)}

          {/*
            The evidence behind this record — the lines read off the receipt,
            or the file it was imported from. Fetched rather than passed in
            route params, because the list endpoint does not carry it.
          */}
          {origin ? (
            <View style={{ marginTop: space.md }}>
              <RecordOriginPanel origin={origin} recordAmount={record.amount} />
            </View>
          ) : loadingOrigin ? (
            <View style={{ marginTop: space.md }}>
              <T variant="caption">Loading where this came from…</T>
            </View>
          ) : null}

          <View style={{ marginTop: space.md }}>
            {isExpense ? (
              <CategoryPicker
                categories={categories}
                value={categoryId}
                onChange={setCategoryId}
                onCreated={refreshCategories}
                businessProfileId={selected.id}
              />
            ) : null}
            <DateField label="Date" value={date} onChange={setDate} />
            <Field label="Description" value={description} onChangeText={setDescription} />
            {isExpense ? <Field label="Vendor" value={vendor} onChangeText={setVendor} /> : null}
            <Field label="Amount (PHP)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
          </View>

          {error ? <ErrorNote>{error}</ErrorNote> : null}

          <Button title="Save changes" variant="primary" onPress={save} loading={busy} style={{ marginTop: space.md }} />
          <Button title="Delete record" variant="ghost" onPress={confirmDelete} />
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
