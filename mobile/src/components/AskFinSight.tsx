import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, ErrorNote, T } from "./ui";
import { api, errorMessage } from "../lib/api";
import { brand, font, ink, paper, radius, space, TAP } from "../theme/tokens";
import type { AIInteraction, AskResponse, InteractionModule } from "../lib/types";

/**
 * Ask FinSight — a full-screen modal per module.
 *
 * The web app uses a side drawer, which is a desktop pattern that makes no
 * sense on a phone: a 420px panel over a 375px screen is just a worse
 * full-screen view. This presents as a modal sheet instead, which is the native
 * idiom and gets the keyboard handling right.
 *
 * Everything else is identical to web: same endpoint, same per-module threading,
 * and no client-side context — the server rebuilds it from fresh data on every
 * message, which is what lets a follow-up see a record added seconds ago.
 */

const MODULE_COPY: Record<InteractionModule, { title: string; scope: string; greeting: string; starters: string[] }> = {
  Dashboard: {
    title: "Ask about your dashboard",
    scope: "Scoped to your Dashboard — totals, what needs review, and your recovery pace.",
    greeting: "I can explain what's on your dashboard right now. What would you like to know?",
    starters: ["Summarise this month for me", "What needs my attention?", "How can I reduce my expenses?"],
  },
  "Expense Insights": {
    title: "Ask about your expenses",
    scope: "Scoped to Expense Insights — category shares, increases, and unusual records.",
    greeting: "I can help you understand your expense behaviour. What would you like to know?",
    starters: ["Why did my expenses increase?", "Which category is highest?", "How can I reduce my expenses?"],
  },
  "Spending Impact": {
    title: "Ask about spending",
    scope: "Describe a planned expense in your own words. The numbers are computed, not estimated by AI.",
    greeting: 'Try: "What if I spend ₱11,000 on a fridge?"',
    starters: ["What if I spend ₱11,000 on a fridge?", "Is this a large expense for me?"],
  },
  "Recovery Target": {
    title: "Ask about recovery",
    scope: "Scoped to Recovery Target — today's gap and your remaining operating days.",
    greeting: "I can compare your recorded sales against your needed target. What would you like to check?",
    starters: ["How much more sales do I need?", "Did I reach today's target?", "What is my adjusted daily target?"],
  },
};

export function AskFinSight({
  visible,
  onClose,
  businessProfileId,
  module,
}: {
  visible: boolean;
  onClose: () => void;
  businessProfileId: number;
  module: InteractionModule;
}) {
  const copy = MODULE_COPY[module];
  const [messages, setMessages] = useState<AIInteraction[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const listRef = useRef<FlatList<AIInteraction>>(null);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoadingHistory(true);
    setError(null);
    api
      .get<AIInteraction[]>("/ai/history", { businessProfileId, module, limit: 20 })
      .then((data) => !cancelled && setMessages(data))
      .catch((err) => !cancelled && setError(errorMessage(err)))
      .finally(() => !cancelled && setLoadingHistory(false));
    return () => {
      cancelled = true;
    };
  }, [visible, businessProfileId, module]);

  async function send(text: string) {
    const question = text.trim();
    if (!question || sending) return;
    setInput("");
    setSending(true);
    setError(null);
    setUnavailable(false);
    try {
      const data = await api.post<AskResponse>("/ai/ask", { businessProfileId, module, question });
      setMessages((prev) => [...prev, data]);
      // Both providers failed. The backend still returns 201 with a placeholder,
      // so it is surfaced as an outage rather than allowed to read as a real
      // considered answer.
      if (data.provider === "unavailable") setUnavailable(true);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <SafeAreaView style={{ flex: 1, backgroundColor: paper[50] }} edges={["top", "bottom"]}>
        <View style={{ backgroundColor: brand[800], padding: space.lg }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
            <T style={{ color: "#fff", fontFamily: font.display, fontSize: 16, flex: 1 }}>✦ {copy.title}</T>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close Ask FinSight"
              hitSlop={12}
              style={{ minWidth: TAP, minHeight: TAP, alignItems: "flex-end", justifyContent: "center" }}
            >
              <T style={{ color: "#fff", fontSize: 22 }}>×</T>
            </Pressable>
          </View>
          <T style={{ color: brand[50], fontSize: 12, marginTop: space.sm, lineHeight: 18 }}>{copy.scope}</T>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1 }}
          keyboardVerticalOffset={0}
        >
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => String(m.id)}
            contentContainerStyle={{ padding: space.lg, gap: space.md }}
            ListHeaderComponent={
              <View style={{ gap: space.md }}>
                <Bubble from="ai">{copy.greeting}</Bubble>
                {loadingHistory ? <T variant="caption" style={{ textAlign: "center" }}>Loading earlier messages…</T> : null}
              </View>
            }
            renderItem={({ item }) => (
              <View style={{ gap: space.md }}>
                <Bubble from="user">{item.question}</Bubble>
                <Bubble from="ai">{item.answer}</Bubble>
              </View>
            )}
            ListFooterComponent={
              <View style={{ gap: space.md, marginTop: space.md }}>
                {sending ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                    <ActivityIndicator color={brand[600]} />
                    <T variant="caption">Working from your records…</T>
                  </View>
                ) : null}
                {unavailable ? (
                  <ErrorNote>
                    FinSight's AI assistant is unreachable right now, so the message above is a placeholder rather than
                    a real answer. The figures on your other screens are unaffected — those are calculated by FinSight,
                    not by AI.
                  </ErrorNote>
                ) : null}
                {error ? <ErrorNote>{error}</ErrorNote> : null}
                {messages.length === 0 && !loadingHistory ? (
                  <View style={{ gap: space.sm }}>
                    {copy.starters.map((s) => (
                      <Pressable
                        key={s}
                        onPress={() => setInput(s)}
                        style={{
                          minHeight: TAP,
                          justifyContent: "center",
                          borderWidth: 1,
                          borderColor: brand[200],
                          borderRadius: radius.full,
                          paddingHorizontal: space.md,
                        }}
                      >
                        <T style={{ color: brand[700], fontSize: 13 }}>{s}</T>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>
            }
          />

          <View
            style={{
              flexDirection: "row",
              gap: space.sm,
              padding: space.md,
              borderTopWidth: 1,
              borderTopColor: ink[200],
              backgroundColor: paper.DEFAULT,
            }}
          >
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="Ask about your numbers…"
              placeholderTextColor={ink[400]}
              maxLength={500}
              onSubmitEditing={() => send(input)}
              style={{
                flex: 1,
                minHeight: TAP,
                borderWidth: 1,
                borderColor: ink[200],
                borderRadius: radius.full,
                paddingHorizontal: space.md,
                fontSize: 15,
                color: ink[900],
              }}
            />
            <Button title="Send" onPress={() => send(input)} disabled={!input.trim() || sending} />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

function Bubble({ from, children }: { from: "ai" | "user"; children: React.ReactNode }) {
  const isUser = from === "user";
  return (
    <View style={{ alignItems: isUser ? "flex-end" : "flex-start" }}>
      <View
        style={{
          maxWidth: "88%",
          backgroundColor: isUser ? brand[600] : paper.DEFAULT,
          borderWidth: isUser ? 0 : 1,
          borderColor: brand[100],
          borderRadius: radius.lg,
          paddingHorizontal: space.md,
          paddingVertical: space.sm,
        }}
      >
        <T style={{ color: isUser ? "#fff" : ink[700], fontSize: 14, lineHeight: 20 }}>{children}</T>
      </View>
    </View>
  );
}

/** The trigger, so all four call sites are one line. */
export function AskFinSightButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={{
        minHeight: TAP,
        paddingHorizontal: space.md,
        borderRadius: radius.md,
        backgroundColor: brand[600],
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <T style={{ color: "#fff", fontFamily: font.sansSemibold, fontSize: 14 }}>✦ Ask FinSight</T>
    </Pressable>
  );
}
