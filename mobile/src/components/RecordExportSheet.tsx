import { useEffect, useMemo, useState } from "react";
import { RisingSheet } from "./RisingSheet";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as SecureStore from "expo-secure-store";
import { Button, Checkbox, ErrorNote, SegmentedControl, SelectChip, T } from "./ui";
import { DateField } from "./DateField";
import { TAP_FLOOR } from "./touchTarget";
import { useTheme } from "../context/ThemeContext";
import { api, errorMessage } from "../lib/api";
import { countFor, exportRequest, MAX_EXPORT_ROWS, presetMonths, type ExportMode, type ExportMonth, type ExportType } from "../lib/exportChoice";
import { radius, space } from "../theme/tokens";

/** Remembered on this phone so a monthly hand-off is two taps. SecureStore keys allow only ".", "-" and "_". */
const REMEMBER_KEY = "finsight.exportChoice";

const QUICK: { mode: ExportMode; label: string }[] = [
  { mode: "thisMonth", label: "This month" },
  { mode: "lastMonth", label: "Last month" },
  { mode: "thisQuarter", label: "This quarter" },
  { mode: "thisYear", label: "This year" },
  { mode: "lastYear", label: "Last year" },
  { mode: "months", label: "Pick months" },
  { mode: "range", label: "Date range" },
  { mode: "everything", label: "Everything" },
];

const monthName = (month: string) =>
  new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-PH", { month: "long", timeZone: "UTC" });

/**
 * Choose what goes in the CSV: the kind of record, then a quick pick, months
 * ticked off one by one (grouped by year), a date range, or everything. The
 * button says how many records that is before anything is downloaded, using
 * per-month counts from /records/export/months.
 */
export function RecordExportSheet({ visible, onClose, businessProfileId, businessName, today, filteredQuery, onExport }: {
  visible: boolean;
  onClose: () => void;
  businessProfileId: number;
  businessName: string;
  /** The business's today, "YYYY-MM-DD", which the quick picks count from. */
  today: string;
  /** The list's own filters, when any are on; offered as "As filtered". */
  filteredQuery: Record<string, string | number | boolean | undefined> | null;
  onExport: (query: Record<string, string | number | boolean | undefined>, name?: string) => void;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [type, setType] = useState<ExportType>("all");
  const [mode, setMode] = useState<ExportMode>("thisMonth");
  const [picked, setPicked] = useState<string[]>([]);
  const [year, setYear] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [counts, setCounts] = useState<ExportMonth[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Restore the last choice once; a stored month list keeps only months that still have records.
  useEffect(() => {
    SecureStore.getItemAsync(REMEMBER_KEY).then((raw) => {
      if (!raw) return;
      const saved = JSON.parse(raw) as { type?: ExportType; mode?: ExportMode; months?: string[] };
      if (saved.type) setType(saved.type);
      if (saved.mode && saved.mode !== "filtered") setMode(saved.mode);
      if (Array.isArray(saved.months)) setPicked(saved.months);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!visible) return;
    let live = true;
    setLoadError(null);
    api.get<{ months: ExportMonth[] }>("/records/export/months", { businessProfileId })
      .then((data) => { if (live) setCounts(data.months); })
      .catch((err) => { if (live) setLoadError(`Couldn't load your months. ${errorMessage(err)}`); });
    return () => { live = false; };
  }, [visible, businessProfileId]);

  const years = useMemo(() => [...new Set((counts ?? []).map((row) => row.month.slice(0, 4)))], [counts]);
  const shownYear = year && years.includes(year) ? year : years[0] ?? null;
  const available = new Set((counts ?? []).map((row) => row.month));
  const chosenMonths = mode === "months" ? picked.filter((month) => available.has(month)) : presetMonths(mode, today);
  const rangeReady = mode === "range" && dateFrom !== "" && dateTo !== "" && dateFrom <= dateTo;

  const count = !counts || mode === "filtered" || mode === "range" ? null : countFor(counts, mode === "everything" ? null : chosenMonths ?? [], type);
  const tooMany = count !== null && count > MAX_EXPORT_ROWS;
  const ready = mode === "filtered" ? filteredQuery !== null
    : mode === "range" ? rangeReady
      : count !== null && count > 0 && !tooMany;

  const monthsLabel = chosenMonths && mode !== "everything" ? `${chosenMonths.length} month${chosenMonths.length === 1 ? "" : "s"} · ` : "";
  const buttonLabel = mode === "filtered" ? "Export as filtered"
    : mode === "range" ? (rangeReady ? "Export this range" : "Choose both dates")
      : count === null ? "Counting…"
        : count === 0 ? (mode === "months" && chosenMonths?.length === 0 ? "Pick at least one month" : "No records in this period")
          : tooMany ? "Too many for one file"
            : `Export ${monthsLabel}${count.toLocaleString("en-PH")} record${count === 1 ? "" : "s"}`;

  const toggleMonth = (month: string, on: boolean) =>
    setPicked((current) => on ? [...new Set([...current, month])] : current.filter((m) => m !== month));
  const yearMonths = (counts ?? []).filter((row) => row.month.startsWith(shownYear ?? "~"));
  const wholeYear = yearMonths.length > 0 && yearMonths.every((row) => picked.includes(row.month));

  const submit = () => {
    if (!ready) return;
    SecureStore.setItemAsync(REMEMBER_KEY, JSON.stringify({ type, mode, months: picked })).catch(() => {});
    if (mode === "filtered" && filteredQuery) { onExport(filteredQuery); return; }
    const scope = mode === "everything" ? null : mode === "range" ? { dateFrom, dateTo } : { months: chosenMonths ?? [] };
    const { query, name } = exportRequest(businessProfileId, type, scope);
    onExport(query, name);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: t.scrim, justifyContent: "flex-end" }}>
        <RisingSheet>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close without exporting" style={[StyleSheet.absoluteFill, { minHeight: TAP_FLOOR, minWidth: TAP_FLOOR }]} />
          <View style={{ backgroundColor: t.surfaceRaised, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingTop: space.md, paddingBottom: insets.bottom + space.md, maxHeight: "88%" }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space.lg, paddingBottom: space.sm }}>
              <View style={{ flex: 1 }}>
                <T variant="heading" accessibilityRole="header" style={{ color: t.brandHeading }}>Export records</T>
                <T variant="caption" numberOfLines={1}>{businessName}</T>
              </View>
              <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} style={{ padding: space.xs }}>
                <Ionicons name="close" size={20} color={t.textMuted} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.lg, paddingBottom: space.md }}>
              {loadError ? <ErrorNote>{loadError}</ErrorNote> : null}

              {mode !== "filtered" ? (
                <View style={{ gap: space.sm }}>
                  <T variant="label">Records</T>
                  <SegmentedControl accessibilityLabel="Records to export" options={[{ label: "All", value: "all" }, { label: "Expenses", value: "expense" }, { label: "Sales", value: "sales" }] as const} value={type} onChange={setType} />
                </View>
              ) : null}

              <View style={{ gap: space.sm }}>
                <T variant="label">Period</T>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
                  {filteredQuery ? <SelectChip label="As filtered" selected={mode === "filtered"} onPress={() => setMode("filtered")} accessibilityLabel="As filtered: the list's current filters" /> : null}
                  {QUICK.map((option) => <SelectChip key={option.mode} label={option.label} selected={mode === option.mode} onPress={() => setMode(option.mode)} />)}
                </View>
                {mode === "filtered" ? <T variant="caption">Uses the search, type and filters on the Records list.</T> : null}
              </View>

              {mode === "months" ? (
                counts === null ? <ActivityIndicator color={t.brandText} /> : counts.length === 0 ? <T variant="caption">No records yet.</T> : (
                  <View style={{ gap: space.sm }}>
                    {years.length > 1 ? (
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
                        {years.map((y) => <SelectChip key={y} label={y} selected={y === shownYear} onPress={() => setYear(y)} accessibilityLabel={`Show ${y}`} />)}
                      </View>
                    ) : null}
                    <Checkbox
                      label={`Whole of ${shownYear}`}
                      checked={wholeYear}
                      onChange={(on) => setPicked((current) => on
                        ? [...new Set([...current, ...yearMonths.map((row) => row.month)])]
                        : current.filter((month) => !month.startsWith(shownYear ?? "~")))}
                    />
                    <View style={{ borderTopWidth: 1, borderTopColor: t.border }}>
                      {yearMonths.map((row) => {
                        const n = countFor([row], null, type);
                        return (
                          <View key={row.month} style={{ borderBottomWidth: 1, borderBottomColor: t.border, paddingVertical: space.xs }}>
                            <Checkbox
                              label={`${monthName(row.month)} ${row.month.slice(0, 4)}`}
                              hint={`${n.toLocaleString("en-PH")} record${n === 1 ? "" : "s"}`}
                              checked={picked.includes(row.month)}
                              onChange={(on) => toggleMonth(row.month, on)}
                            />
                          </View>
                        );
                      })}
                    </View>
                    {picked.length > 0 ? (
                      <Pressable accessibilityRole="button" accessibilityLabel="Clear picked months" onPress={() => setPicked([])} style={{ minHeight: TAP_FLOOR, justifyContent: "center", alignSelf: "flex-start" }}>
                        <T variant="label" style={{ color: t.brandText }}>{`Clear ${picked.length} picked`}</T>
                      </Pressable>
                    ) : null}
                  </View>
                )
              ) : null}

              {mode === "range" ? (
                <View style={{ gap: space.sm }}>
                  <DateField label="From" value={dateFrom} onChange={setDateFrom} today={today} />
                  <DateField label="To" value={dateTo} onChange={setDateTo} today={today} />
                  {dateFrom && dateTo && dateFrom > dateTo ? <T variant="caption" style={{ color: t.statusText.critical }}>The start date is after the end date.</T> : null}
                </View>
              ) : null}

              {tooMany ? <T variant="caption" style={{ color: t.statusText.critical }}>{`A spreadsheet holds up to ${MAX_EXPORT_ROWS.toLocaleString("en-PH")} rows. Pick fewer months.`}</T> : null}
            </ScrollView>

            <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm }}>
              <Button title={buttonLabel} variant="primary" disabled={!ready} onPress={submit} />
            </View>
          </View>
        </RisingSheet>
      </View>
    </Modal>
  );
}
