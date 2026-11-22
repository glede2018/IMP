import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PlayCircleOutlined, PictureOutlined } from "@ant-design/icons";
import { Spin } from "antd";
import { request } from "@/services/api";

/** 模板卡片悬停播放，使用模板时直接播放；已导入模板同样按需读取预览。 */
export default function TemplatePreview({
  id,
  title,
  cover,
  mode = "hover",
}: {
  id: string;
  title: string;
  cover?: string | null;
  mode?: "hover" | "player";
}) {
  const video = useRef<HTMLVideoElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const [interacting, setInteracting] = useState(false);
  const [visible, setVisible] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const active = visible && (mode === "player" || interacting);
  const preview = useQuery({
    queryKey: ["template-preview", id],
    queryFn: () =>
      request<{ url: string | null }>(
        `/templates/${encodeURIComponent(id)}/preview`,
      ),
    enabled: active,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const url = preview.data?.url;
  useEffect(() => {
    setUnavailable(false);
  }, [url]);
  useEffect(() => {
    const target = container.current;
    if (!target || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) =>
      setVisible(entry.isIntersecting),
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const player = video.current;
    if (!player) return;
    if (active && url && !unavailable) {
      void player.play().catch(() => setPlaying(false));
    } else {
      player.pause();
      if (mode === "hover" && player.readyState >= 1) player.currentTime = 0;
      setPlaying(false);
    }
    return () => player.pause();
  }, [active, url, mode, unavailable]);
  const revealVideo = !!url && !unavailable && (playing || mode === "player");
  return (
    <div
      ref={container}
      className={`yp-template-preview ${mode === "player" ? "is-player" : "is-hover"}`}
      role={mode === "hover" ? "button" : "group"}
      tabIndex={mode === "hover" ? 0 : undefined}
      aria-label={`${title}视频预览`}
      aria-pressed={mode === "hover" ? interacting : undefined}
      onMouseEnter={() => setInteracting(true)}
      onMouseLeave={() => setInteracting(false)}
      onFocus={() => setInteracting(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setInteracting(false);
      }}
      onClick={
        mode === "hover" ? () => setInteracting(true) : undefined
      }
      onKeyDown={
        mode === "hover"
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setInteracting((value) => !value);
              }
            }
          : undefined
      }
    >
      {cover ? (
        <img
          className="yp-template-poster"
          src={cover}
          alt={`${title}封面`}
          loading="lazy"
        />
      ) : (
        <div className="yp-template-poster-placeholder">
          <PictureOutlined />
        </div>
      )}
      {url && !unavailable && (
        <video
          ref={video}
          key={url}
          className={`yp-template-preview-video ${revealVideo ? "is-visible" : ""}`}
          src={url}
          poster={cover || undefined}
          muted
          loop
          playsInline
          controls={mode === "player"}
          preload={active ? "metadata" : "none"}
          aria-label={`${title}模板预览视频`}
          onPlaying={() => {
            if (active) setPlaying(true);
            else video.current?.pause();
          }}
          onPause={() => setPlaying(false)}
          onError={() => {
            setUnavailable(true);
            setPlaying(false);
          }}
        />
      )}
      {active && preview.isFetching && (
        <span className="yp-template-preview-loading">
          <Spin />
        </span>
      )}
      {mode === "hover" &&
        !revealVideo &&
        preview.data?.url !== null &&
        !preview.isError &&
        !unavailable && (
          <span className="yp-template-preview-play">
            <PlayCircleOutlined />
          </span>
        )}
    </div>
  );
}
