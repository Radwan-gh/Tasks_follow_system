import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

/**
 * §3c-6 "تصدير التقارير": writes the PDF blob returned by
 * `api.reports.exportPdf` to a cache file, then opens the system share sheet
 * — mirrors the design's "حالة توليد بمؤشر، ثم ورقة مشاركة النظام".
 */
export async function saveAndSharePdf(blob: Blob, filename: string): Promise<void> {
  const file = new File(Paths.cache, filename);
  if (file.exists) file.delete();
  const buffer = await blob.arrayBuffer();
  file.write(new Uint8Array(buffer));

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: "application/pdf", dialogTitle: filename });
  }
}
