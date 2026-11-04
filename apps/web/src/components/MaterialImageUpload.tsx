import { useRef, useState } from "react";
import { App, Button, Image, Space, Tooltip, Upload } from "antd";
import type { UploadFile, UploadProps } from "antd";
import {
  InboxOutlined,
  ArrowLeftOutlined,
  ArrowRightOutlined,
} from "@ant-design/icons";
import type { MaterialFile } from "@/services/materials";
import { uploadHeaders, uploadErrorMessage } from "@/services/upload";
interface Props {
  materialType: "product" | "person";
  initialFiles: MaterialFile[];
  maxCount: number;
  disabled: boolean;
  onChange: (files: MaterialFile[]) => void;
  onBusyChange: (busy: boolean) => void;
  onErrorChange: (hasError: boolean) => void;
  onUploaded: (file: MaterialFile) => void;
}
export default function MaterialImageUpload({
  materialType,
  initialFiles,
  maxCount,
  disabled,
  onChange,
  onBusyChange,
  onErrorChange,
  onUploaded,
}: Props) {
  const { message } = App.useApp();
  const [fileList, setFileList] = useState<UploadFile<MaterialFile>[]>(() =>
    initialFiles.map((file, index) => ({
      uid: file.id,
      name: file.label || `图片${index + 1}`,
      url: file.url,
      type: file.mimeType,
      size: file.size,
      status: "done",
      response: file,
    })),
  );
  const [preview, setPreview] = useState("");
  const dragUid = useRef<string>();
  const update = (list: UploadFile<MaterialFile>[]) => {
    setFileList(list);
    onBusyChange(list.some((file) => file.status === "uploading"));
    onErrorChange(list.some((file) => file.status === "error"));
    onChange(
      list
        .filter((file) => file.status === "done" && file.response)
        .map((file) => file.response!),
    );
  };
  const beforeUpload: UploadProps<MaterialFile>["beforeUpload"] = (
    file,
    selected,
  ) => {
    if (fileList.length + selected.length > maxCount) {
      if (file.uid === selected[0].uid)
        message.error(`最多上传 ${maxCount} 张图片，请先移除多余图片`);
      return Upload.LIST_IGNORE;
    }
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      !file.size ||
      file.size > 3 * 1024 * 1024
    ) {
      message.error("仅支持 JPG/PNG/WebP，单张图片须大于 0 且不超过 3 MB");
      return Upload.LIST_IGNORE;
    }
    return true;
  };
  const move = (from: number, to: number) => {
    if (disabled || to < 0 || to >= fileList.length) return;
    const next = [...fileList];
    const [file] = next.splice(from, 1);
    next.splice(to, 0, file);
    update(next);
  };
  const onUploadChange: UploadProps<MaterialFile>["onChange"] = (info) => {
    const failure =
      info.file.status === "error" ? uploadErrorMessage(info.file) : undefined;
    const next = info.fileList.map((file) =>
      file.status === "done" && file.response
        ? { ...file, url: file.response.url }
        : failure && file.uid === info.file.uid
          ? { ...file, error: new Error(failure) }
          : file,
    );
    update(next);
    if (info.file.status === "done" && info.file.response)
      onUploaded(info.file.response);
    if (failure) message.error(failure);
  };
  return (
    <>
      <Upload.Dragger
        action={`/api/v1/materials/files?type=${materialType}`}
        name="file"
        headers={uploadHeaders}
        withCredentials
        accept="image/jpeg,image/png,image/webp"
        multiple={maxCount > 1}
        maxCount={maxCount}
        listType="picture-card"
        fileList={fileList}
        disabled={disabled}
        beforeUpload={beforeUpload}
        onChange={onUploadChange}
        onPreview={(file) => {
          if (file.url) setPreview(file.url);
        }}
        showUploadList={{
          showPreviewIcon: (file) => file.status === "done",
          showRemoveIcon: !disabled,
        }}
        progress={{ strokeWidth: 3, showInfo: true }}
        itemRender={(originNode, file, list) => {
          const index = list.findIndex((item) => item.uid === file.uid);
          return (
            <div
              style={{ position: "relative", height: "100%" }}
              draggable={!disabled && file.status === "done"}
              onDragStart={(event) => {
                dragUid.current = file.uid;
                event.dataTransfer.setData(
                  "application/x-imp-upload",
                  file.uid,
                );
              }}
              onDragOver={(event) => {
                if (dragUid.current) event.preventDefault();
              }}
              onDragEnd={() => {
                dragUid.current = undefined;
              }}
              onDrop={(event) => {
                if (!dragUid.current) return;
                event.preventDefault();
                event.stopPropagation();
                const from = list.findIndex(
                  (item) => item.uid === dragUid.current,
                );
                if (from >= 0) move(from, index);
                dragUid.current = undefined;
              }}
            >
              {originNode}
              {maxCount > 1 && file.status === "done" && (
                <Space.Compact
                  size="small"
                  style={{
                    position: "absolute",
                    bottom: 4,
                    left: 4,
                    zIndex: 1,
                  }}
                >
                  <Tooltip title="向前移动">
                    <Button
                      size="small"
                      aria-label={`图片${index + 1}左移`}
                      icon={<ArrowLeftOutlined />}
                      disabled={disabled || index === 0}
                      onClick={(event) => {
                        event.stopPropagation();
                        move(index, index - 1);
                      }}
                    />
                  </Tooltip>
                  <Tooltip title="向后移动">
                    <Button
                      size="small"
                      aria-label={`图片${index + 1}右移`}
                      icon={<ArrowRightOutlined />}
                      disabled={disabled || index === list.length - 1}
                      onClick={(event) => {
                        event.stopPropagation();
                        move(index, index + 1);
                      }}
                    />
                  </Tooltip>
                </Space.Compact>
              )}
            </div>
          );
        }}
      >
        <p className="ant-upload-drag-icon">
          <InboxOutlined />
        </p>
        <p className="ant-upload-text">点击或拖拽图片到此区域上传</p>
        <p className="ant-upload-hint">
          {maxCount === 1 ? "1 张人物参考图" : "最多 10 张，支持拖动或箭头排序"}{" "}
          · 单张 ≤ 3 MB · JPG / PNG / WebP
        </p>
      </Upload.Dragger>
      {preview && (
        <Image
          src={preview}
          style={{ display: "none" }}
          preview={{
            visible: true,
            onVisibleChange: (visible) => {
              if (!visible) setPreview("");
            },
          }}
        />
      )}
    </>
  );
}
