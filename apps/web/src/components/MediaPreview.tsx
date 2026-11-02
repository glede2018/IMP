import { Modal } from "antd";
import type { Asset } from "@/types";
export default function MediaPreview({
  asset,
  onClose,
}: {
  asset: Asset | null;
  onClose: () => void;
}) {
  return (
    <Modal
      title={asset?.name}
      open={!!asset}
      onCancel={onClose}
      footer={null}
      width={800}
      destroyOnClose
    >
      {asset &&
        (asset.mimeType.startsWith("image/") ? (
          <img
            src={asset.preview}
            alt={asset.name}
            style={{ maxWidth: "100%", maxHeight: "65vh", margin: "auto" }}
          />
        ) : asset.mimeType.startsWith("video/") ? (
          <video
            src={asset.preview}
            controls
            style={{ width: "100%", maxHeight: "65vh" }}
          />
        ) : asset.mimeType.startsWith("audio/") ? (
          <audio src={asset.preview} controls />
        ) : (
          <a href={asset.downloadUrl}>下载文案文件</a>
        ))}
    </Modal>
  );
}
