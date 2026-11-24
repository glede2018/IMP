import { Button, Image } from "antd";
import { PlayCircleFilled } from "@ant-design/icons";
import type { LiveVideo } from "@/services/douyin-analytics";

const fallback = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="44" height="56"><rect width="44" height="56" fill="#d6c4a3"/><path d="M18 21l11 7-11 7z" fill="white"/></svg>')}`;

export default function VideoCoverButton({ video, className, onClick }: {
  video: LiveVideo;
  className: string;
  onClick: () => void;
}) {
  return (
    <Button
      className={className}
      aria-label={`查看${video.title || "视频"}`}
      onClick={onClick}
      style={{ overflow: "hidden" }}
    >
      {video.coverUrl ? (
        <Image
          src={video.coverUrl}
          alt={video.title || "视频封面"}
          width={44}
          height={56}
          preview={false}
          fallback={fallback}
          referrerPolicy="no-referrer"
          style={{ objectFit: "cover", display: "block" }}
        />
      ) : <PlayCircleFilled />}
    </Button>
  );
}
