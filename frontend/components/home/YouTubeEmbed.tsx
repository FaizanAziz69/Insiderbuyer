"use client";
import { useState } from "react";
import { Play } from "lucide-react";

interface Props {
  videoId: string;
  title?: string;
}

export function YouTubeEmbed({ videoId, title }: Props) {
  const [active, setActive] = useState(false);
  const thumb = `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
  const embed = `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`;
  return (
    <div
      className="relative w-full rounded-lg overflow-hidden bg-[var(--bg-3)]"
      style={{ aspectRatio: "16 / 9" }}
    >
      {active ? (
        <iframe
          src={embed}
          title={title || "YouTube video"}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          className="absolute inset-0 w-full h-full"
          frameBorder={0}
        />
      ) : (
        <button
          onClick={() => setActive(true)}
          aria-label={`Play ${title || "video"}`}
          className="absolute inset-0 w-full h-full group cursor-pointer"
        >
          <img
            src={thumb}
            alt=""
            loading="lazy"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
            }}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.5) 100%)",
            }}
          />
          <div
            className="absolute inset-0 flex items-center justify-center transition-transform duration-200 group-hover:scale-110"
          >
            <div
              className="h-20 w-20 rounded-full flex items-center justify-center"
              style={{
                background: "rgba(255,0,0,0.9)",
                boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
              }}
            >
              <Play className="h-9 w-9 text-white ml-1" fill="white" strokeWidth={0} />
            </div>
          </div>
          {title && (
            <div
              className="absolute bottom-0 left-0 right-0 p-4 text-left text-white"
              style={{
                background:
                  "linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.7) 100%)",
              }}
            >
              <div className="text-[10px] uppercase tracking-wider font-bold opacity-80 mb-1">
                YouTube · SEC investor education
              </div>
              <div className="text-[14px] sm:text-[16px] font-bold leading-snug line-clamp-2">
                {title}
              </div>
            </div>
          )}
        </button>
      )}
    </div>
  );
}
