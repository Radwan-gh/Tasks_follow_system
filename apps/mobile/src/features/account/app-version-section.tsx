import { useEffect, useState } from "react";
import { Platform, Pressable, View } from "react-native";
import Constants from "expo-constants";
import * as Clipboard from "expo-clipboard";
import * as Updates from "expo-updates";
import { AppText } from "@/components/text";
import { MIN_TOUCH_TARGET, colors, spacing } from "@/theme/tokens";

const publishedDate = new Intl.DateTimeFormat("ar", { dateStyle: "medium" });

type RunningInfo = Updates.CurrentlyRunningInfo;

/**
 * §10 "App version / update status line". OTA updates apply silently
 * (`useAutoUpdate` in `lib/updates.ts`), and every way they can fail is silent
 * too — so this is the one place a device shows which bundle it is actually
 * running: the runtime version an update must match, and the running update's
 * id to hold against the OTA server's dashboard. «نسخ التفاصيل» copies the
 * full, untruncated details for a support message.
 */
export function AppVersionSection() {
  const { currentlyRunning, isDownloading, checkError, downloadError } = Updates.useUpdates();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const version = Constants.expoConfig?.version ?? currentlyRunning.runtimeVersion ?? "—";
  const status = describeRunning(currentlyRunning, isDownloading);
  const errorText = !Updates.isEnabled
    ? null
    : checkError
      ? "تعذّر التحقّق من التحديثات، ستُعاد المحاولة عند العودة إلى التطبيق"
      : downloadError
        ? "تعذّر تنزيل التحديث، ستُعاد المحاولة عند العودة إلى التطبيق"
        : null;

  async function copyDetails() {
    await Clipboard.setStringAsync(
      supportDetails(version, currentlyRunning, checkError, downloadError),
    );
    setCopied(true);
  }

  return (
    <View style={{ alignItems: "center", paddingTop: spacing.sm, paddingBottom: spacing.xxl }}>
      <AppText size="small" weight="medium" color={colors.muted}>
        الإصدار {version}
      </AppText>
      <AppText
        size="caption"
        color={status.alert ? colors.alert : colors.muted}
        style={{ textAlign: "center" }}
      >
        {status.text}
      </AppText>
      {errorText ? (
        <AppText size="caption" color={colors.alert} style={{ textAlign: "center" }}>
          {errorText}
        </AppText>
      ) : null}
      {currentlyRunning.runtimeVersion || currentlyRunning.updateId ? (
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          {currentlyRunning.runtimeVersion ? (
            <AppText size="caption" color={colors.muted} selectable>
              runtime {currentlyRunning.runtimeVersion}
            </AppText>
          ) : null}
          {currentlyRunning.updateId ? (
            <AppText size="caption" color={colors.muted} selectable>
              update {currentlyRunning.updateId.slice(0, 8)}
            </AppText>
          ) : null}
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="نسخ تفاصيل الإصدار"
        onPress={() => void copyDetails()}
        style={{ minHeight: MIN_TOUCH_TARGET, paddingHorizontal: spacing.lg, justifyContent: "center" }}
      >
        <AppText size="caption" weight="semibold" color={colors.accent}>
          {copied ? "تم النسخ" : "نسخ التفاصيل"}
        </AppText>
      </Pressable>
    </View>
  );
}

function describeRunning(running: RunningInfo, isDownloading: boolean): { text: string; alert: boolean } {
  if (!Updates.isEnabled) {
    // A release build with updates disabled is misconfigured (bad `updates`
    // block or missing runtime version) and will never update — flag it.
    return __DEV__
      ? { text: "وضع التطوير، التحديثات التلقائية متوقّفة", alert: false }
      : { text: "التحديثات التلقائية غير مفعّلة في هذه النسخة", alert: true };
  }
  if (isDownloading) return { text: "جارٍ تنزيل تحديث جديد...", alert: false };
  // Checked before `isEmbeddedLaunch`: an emergency launch *is* an embedded
  // launch, but one where a downloaded update failed to start.
  if (running.isEmergencyLaunch) {
    return { text: "تعذّر تشغيل آخر تحديث، فعاد التطبيق إلى النسخة المثبَّتة", alert: true };
  }
  if (running.isEmbeddedLaunch || !running.createdAt) {
    return { text: "يعمل التطبيق بالنسخة المثبَّتة دون تحديثات", alert: false };
  }
  return { text: `آخر تحديث ${publishedDate.format(running.createdAt)}`, alert: false };
}

/** Plain-text, untranslated on purpose: it is pasted to whoever debugs the release. */
function supportDetails(
  version: string,
  running: RunningInfo,
  checkError: Error | undefined,
  downloadError: Error | undefined,
): string {
  return [
    `version: ${version}`,
    `runtime: ${running.runtimeVersion ?? "none"}`,
    `channel: ${running.channel ?? "none"}`,
    `updates: ${Updates.isEnabled ? "enabled" : "disabled"}`,
    `update: ${running.updateId ?? "none"}${running.isEmbeddedLaunch ? " (embedded)" : ""}`,
    running.createdAt ? `published: ${running.createdAt.toISOString()}` : null,
    running.isEmergencyLaunch ? `emergency launch: ${running.emergencyLaunchReason ?? "unknown"}` : null,
    checkError ? `check error: ${checkError.message}` : null,
    downloadError ? `download error: ${downloadError.message}` : null,
    `os: ${Platform.OS} ${Platform.Version}`,
  ]
    .filter((line) => line !== null)
    .join("\n");
}
