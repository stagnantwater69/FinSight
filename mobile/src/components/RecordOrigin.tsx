import { View } from "react-native";
import { Callout, Money, T } from "./ui";
import { ink, paper, radius, space, statusText } from "../theme/tokens";

/**
 * Where a saved record came from.
 *
 * A record created from a receipt has evidence behind it — the lines that
 * were read, what they came to, and the other records the same scan produced.
 * Mobile showed none of that, so an expense the owner did not recognise was a
 * dead end: nothing on screen explained what made up the number.
 *
 * Mirrors web's RecordOriginPanel, minus the receipt image (mobile has no
 * signed-URL image viewer yet).
 */

export interface OriginItem {
  id: number;
  lineNumber: number;
  name: string;
  quantity: number | null;
  unitPrice: number | null;
  amount: number;
  categoryName: string | null;
  addedByOwner: boolean;
  extractedByVision?: boolean;
}

export type RecordOrigin =
  | {
      kind: "receipt_scan";
      scanId: number;
      scannedAt: string;
      extractedVendor: string | null;
      items: OriginItem[];
      itemsSubtotal: number;
      siblings: { id: number; description: string; amount: number; categoryName: string }[];
    }
  | {
      kind: "csv_import";
      batchId: number;
      title: string;
      uploadDate: string;
      fileReference: string;
      status: string;
      rowCount: number;
    };

export function RecordOriginPanel({ origin, recordAmount }: { origin: RecordOrigin; recordAmount: number }) {
  if (origin.kind === "csv_import") {
    return (
      <View style={{ padding: space.md, backgroundColor: paper[100], borderRadius: radius.md }}>
        <T variant="label" style={{ color: ink[700] }}>Imported from a file</T>
        <T variant="caption" style={{ marginTop: 2 }}>
          {origin.title} · {origin.rowCount} row{origin.rowCount === 1 ? "" : "s"} ·{" "}
          {origin.uploadDate.slice(0, 10)}
        </T>
      </View>
    );
  }

  /*
   * Whether the breakdown still explains the record's own amount.
   *
   * They legitimately differ — receipt-level tax or a discount is allocated
   * across categories, and the owner may have corrected a figure OCR got
   * wrong. Saying so is better than showing two numbers that disagree and
   * leaving the owner to wonder which is broken. Centavos, because floating
   * point would otherwise invent a mismatch.
   */
  const groupTotal = origin.items.reduce((sum, i) => sum + Math.round(i.amount * 100), 0);
  const drifted = origin.items.length > 0 && groupTotal !== Math.round(recordAmount * 100);

  return (
    <View style={{ padding: space.md, backgroundColor: paper[100], borderRadius: radius.md }}>
      <T variant="label" style={{ color: ink[700] }}>Read from a receipt</T>
      <T variant="caption" style={{ marginTop: 2, marginBottom: space.sm }}>
        {origin.extractedVendor ? `${origin.extractedVendor} · ` : ""}
        scanned {origin.scannedAt.slice(0, 10)}
      </T>

      {origin.items.length === 0 ? (
        <T variant="caption">
          FinSight couldn't read individual items off this receipt — only the total.
        </T>
      ) : (
        origin.items.map((item) => (
          <View
            key={item.id}
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              gap: space.sm,
              paddingVertical: 3,
            }}
          >
            <View style={{ flex: 1 }}>
              <T style={{ fontSize: 13, color: ink[800] }} numberOfLines={2}>
                {item.name}
                {item.quantity != null ? <T variant="caption"> × {item.quantity}</T> : null}
              </T>
              {/*
                The heading says these were READ from a receipt. A line the
                owner typed, or one a model inferred from a photograph, was
                not — and must say so rather than shelter under that claim.
              */}
              {item.addedByOwner ? (
                <T variant="caption" style={{ color: ink[500] }}>you added this</T>
              ) : item.extractedByVision ? (
                <T variant="caption" style={{ color: statusText.warning }}>✦ AI read this from the photo</T>
              ) : null}
            </View>
            <Money value={item.amount} size={13} />
          </View>
        ))
      )}

      {origin.items.length > 0 ? (
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            borderTopWidth: 1,
            borderTopColor: ink[200],
            marginTop: space.sm,
            paddingTop: space.sm,
          }}
        >
          <T variant="caption">These items come to</T>
          <Money value={origin.itemsSubtotal} size={13} weight="semibold" />
        </View>
      ) : null}

      {drifted ? (
        <View style={{ marginTop: space.sm }}>
          <Callout tone="info">
            This record's amount doesn't match the items above. That is normal when receipt-level tax or a
            discount was shared out, or if the amount was corrected by hand.
          </Callout>
        </View>
      ) : null}

      {origin.siblings.length > 0 ? (
        <View style={{ marginTop: space.sm }}>
          <T variant="caption" style={{ marginBottom: 2 }}>
            The same receipt also saved:
          </T>
          {origin.siblings.map((s) => (
            <View
              key={s.id}
              style={{ flexDirection: "row", justifyContent: "space-between", gap: space.sm, paddingVertical: 2 }}
            >
              <T style={{ flex: 1, fontSize: 13, color: ink[700] }} numberOfLines={1}>
                {s.categoryName}
              </T>
              <Money value={s.amount} size={13} />
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
