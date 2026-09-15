import { useEffect, useState } from "react";
import { Pressable, ScrollView, TextInput, View, type TextInputProps } from "react-native";
import { useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ApiError } from "@app/api-client";
import { canSendPush, type SendPushTarget } from "@app/types";
import { PrimaryButton } from "@/components/button";
import { Screen } from "@/components/screen";
import { Skeleton } from "@/components/skeleton";
import { EmptyState, ErrorState } from "@/components/state-views";
import { AppText } from "@/components/text";
import { useAuth } from "@/features/auth/auth-context";
import { syncPushDevice, usePushStatus } from "@/features/notifications/use-push-registration";
import { api } from "@/lib/api";
import { MIN_TOUCH_TARGET, colors, fonts, fontSizes, radii, spacing } from "@/theme/tokens";

type TargetKind = "all" | "devices";

/**
 * `/push` — «إرسال إشعار». Composes a manual push to every install or to
 * selected installs, signed in or anonymous. Reachable from «حسابي» for an
 * ADMIN or a user granted `canSendNotifications`; the real gate is the
 * server's `CanSendPushGuard`. Also shows this install's own registration
 * status, which is the quickest way to tell why a phone gets no push.
 */
export default function SendPushScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const allowed = !!user && canSendPush(user);

  // A deep link must not open the composer for someone without the permission.
  useEffect(() => {
    if (user && !allowed) router.replace("/");
  }, [user, allowed, router]);

  const pushStatus = usePushStatus();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [targetKind, setTargetKind] = useState<TargetKind>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const devices = useQuery({
    queryKey: ["push-devices"],
    queryFn: () => api.push.listDevices(),
    enabled: allowed,
  });

  const send = useMutation({
    mutationFn: (target: SendPushTarget) => api.push.send({ title: title.trim(), body: body.trim(), target }),
    onSuccess: (response) => {
      setError(null);
      setResult(`أُرسل إلى ${response.delivered} من ${response.targeted} جهاز`);
    },
    onError: (err) => {
      setResult(null);
      setError(err instanceof ApiError ? err.message : "حدث خطأ غير متوقّع");
    },
  });

  if (!allowed) return null;

  const canSubmit =
    title.trim().length > 0 && body.trim().length > 0 && (targetKind === "all" || selected.size > 0);

  function onSend() {
    setResult(null);
    send.mutate(targetKind === "all" ? { kind: "all" } : { kind: "devices", deviceIds: [...selected] });
  }

  function toggleDevice(deviceId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(deviceId)) next.delete(deviceId);
      else next.add(deviceId);
      return next;
    });
  }

  async function copyDeviceId() {
    if (!pushStatus.deviceId) return;
    await Clipboard.setStringAsync(pushStatus.deviceId);
    setCopied(true);
  }

  return (
    <Screen edges={{ top: true, bottom: true }} style={{ backgroundColor: colors.surface }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: spacing.xl,
          paddingVertical: spacing.md,
          borderBottomWidth: 1,
          borderBottomColor: colors.line,
        }}
      >
        <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={8}>
          <AppText color={colors.muted}>إلغاء</AppText>
        </Pressable>
        <AppText weight="bold">إرسال إشعار</AppText>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.lg }}>
        <View style={{ backgroundColor: colors.canvas, borderRadius: radii.card, padding: spacing.lg, gap: spacing.sm }}>
          <AppText weight="semibold">هذا الجهاز</AppText>
          <AppText size="small" color={colors.muted} selectable>
            {pushStatus.deviceId ?? "—"}
          </AppText>
          <AppText
            size="small"
            color={pushStatus.state === "error" ? colors.alert : pushStatus.state === "registered" ? colors.ink : colors.muted}
          >
            {pushStatus.state === "registered"
              ? pushStatus.linkedToUser
                ? "مسجَّل لاستقبال الإشعارات ومرتبط بحسابك"
                : "مسجَّل لاستقبال الإشعارات (زائر)"
              : pushStatus.state === "error"
                ? `فشل التسجيل: ${pushStatus.error}`
                : "جارٍ التسجيل..."}
          </AppText>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <SmallButton label={copied ? "تم النسخ" : "نسخ المعرّف"} onPress={() => void copyDeviceId()} />
            <SmallButton label="إعادة التسجيل" onPress={() => void syncPushDevice()} />
          </View>
        </View>

        <View style={{ gap: spacing.sm }}>
          <AppText size="small" weight="semibold">
            العنوان
          </AppText>
          <Field value={title} onChangeText={setTitle} placeholder="عنوان الإشعار" maxLength={100} />
          <AppText size="small" weight="semibold">
            النص
          </AppText>
          <Field
            value={body}
            onChangeText={setBody}
            placeholder="نص الإشعار"
            maxLength={1000}
            multiline
            style={{ minHeight: 96, paddingVertical: spacing.md, textAlignVertical: "top" }}
          />
        </View>

        <View style={{ gap: spacing.sm }}>
          <AppText size="small" weight="semibold">
            إلى
          </AppText>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <Chip label="كل الأجهزة" active={targetKind === "all"} onPress={() => setTargetKind("all")} />
            <Chip label="أجهزة محدّدة" active={targetKind === "devices"} onPress={() => setTargetKind("devices")} />
          </View>
        </View>

        {targetKind === "devices" ? (
          devices.isPending ? (
            <View style={{ gap: spacing.sm }}>
              <Skeleton height={56} radius={radii.field} />
              <Skeleton height={56} radius={radii.field} />
            </View>
          ) : devices.isError ? (
            <ErrorState onRetry={() => void devices.refetch()} />
          ) : devices.data.length === 0 ? (
            <EmptyState icon="phone-portrait-outline" title="لا أجهزة" message="لم يُسجَّل أي جهاز بعد." />
          ) : (
            <View style={{ gap: spacing.sm }}>
              {devices.data.map((device) => {
                if (!device.deviceId) return null;
                const deviceId = device.deviceId;
                const isSelected = selected.has(deviceId);
                const isThisDevice = deviceId === pushStatus.deviceId;
                return (
                  <Pressable
                    key={deviceId}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: isSelected }}
                    onPress={() => toggleDevice(deviceId)}
                    style={{
                      minHeight: MIN_TOUCH_TARGET,
                      borderRadius: radii.field,
                      borderWidth: 1,
                      borderColor: isSelected ? colors.accent : colors.line,
                      backgroundColor: isSelected ? colors.accentSoft : colors.surface,
                      padding: spacing.md,
                      gap: 2,
                    }}
                  >
                    <AppText weight="semibold">
                      {device.user ? device.user.displayName : "زائر"}
                      {isThisDevice ? (
                        <AppText size="caption" color={colors.muted}>
                          {" "}
                          (هذا الجهاز)
                        </AppText>
                      ) : null}
                    </AppText>
                    <AppText size="caption" color={colors.muted}>
                      {deviceId.slice(0, 8)} · آخر ظهور {new Date(device.lastSeenAt).toLocaleString("ar")}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          )
        ) : null}

        {error ? (
          <View style={{ backgroundColor: colors.alertSoft, borderRadius: radii.field, padding: spacing.md }}>
            <AppText size="small" color={colors.alert}>
              {error}
            </AppText>
          </View>
        ) : null}
        {result ? (
          <View style={{ backgroundColor: colors.accentSoft, borderRadius: radii.field, padding: spacing.md }}>
            <AppText size="small" color={colors.accent}>
              {result}
            </AppText>
          </View>
        ) : null}

        <PrimaryButton label="إرسال" onPress={onSend} disabled={!canSubmit} loading={send.isPending} />
      </ScrollView>
    </Screen>
  );
}

function Field({ style, ...props }: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor={colors.muted}
      {...props}
      style={[
        {
          minHeight: MIN_TOUCH_TARGET,
          backgroundColor: colors.canvas,
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: radii.field,
          paddingHorizontal: spacing.lg,
          fontFamily: fonts.regular,
          fontSize: fontSizes.body,
          color: colors.ink,
          textAlign: "right",
          writingDirection: "rtl",
        },
        style,
      ]}
    />
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={{
        minHeight: MIN_TOUCH_TARGET - 8,
        justifyContent: "center",
        paddingHorizontal: spacing.lg,
        borderRadius: radii.chip,
        borderWidth: 1,
        borderColor: active ? colors.accent : colors.line,
        backgroundColor: active ? colors.accentSoft : colors.surface,
      }}
    >
      <AppText size="small" weight="semibold" color={active ? colors.accent : colors.ink}>
        {label}
      </AppText>
    </Pressable>
  );
}

function SmallButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        minHeight: MIN_TOUCH_TARGET - 8,
        justifyContent: "center",
        paddingHorizontal: spacing.md,
        borderRadius: radii.field,
        borderWidth: 1,
        borderColor: colors.line,
        backgroundColor: colors.surface,
      }}
    >
      <AppText size="caption" weight="semibold">
        {label}
      </AppText>
    </Pressable>
  );
}
