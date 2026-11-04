import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";

/** Mirrors `MAX_ATTACHMENT_BYTES` in `apps/api/src/cards/attachments.service.ts`. */
export const MAX_ATTACHMENT_BYTES = 30 * 1024 * 1024;
export const OVERSIZE_MESSAGE = "حجم الملف يتجاوز 30MB";

export interface PickedFile {
  uri: string;
  name: string;
  type: string;
  size?: number;
}

/**
 * One file from the camera, the photo library or the system file picker —
 * the three choices behind every «مرفق» on the task screens. `null` when the
 * user cancels or refuses the permission; `"oversize"` for a file the server
 * would reject anyway.
 */
export async function pickAttachment(source: "camera" | "library" | "file"): Promise<PickedFile | "oversize" | null> {
  if (source === "file") {
    // Copied into the cache dir so it can be read back (a raw `content://`
    // URI from the system picker is not reliably uploadable).
    const result = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true, multiple: false });
    if (result.canceled) return null;
    const asset = result.assets[0]!;
    if (asset.size != null && asset.size > MAX_ATTACHMENT_BYTES) return "oversize";
    return { uri: asset.uri, name: asset.name, type: asset.mimeType ?? "application/octet-stream", size: asset.size ?? undefined };
  }

  const permission =
    source === "camera" ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return null;
  const result =
    source === "camera"
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
  if (result.canceled) return null;
  const asset = result.assets[0]!;
  return { uri: asset.uri, name: asset.fileName ?? "photo.jpg", type: asset.mimeType ?? "image/jpeg", size: asset.fileSize ?? undefined };
}
