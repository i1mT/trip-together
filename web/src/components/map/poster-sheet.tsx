"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Download } from "lucide-react";
import type { TripData } from "@/lib/models";
import { buildRoute } from "@/lib/route-geometry";
import { mapStyleUrl } from "../../../../shared/map-source";
import { ensureRouteLayers, fitRouteBounds } from "./route-layer";
import { PosterTemplate } from "./poster-template";
import { Sheet, SheetFooter } from "../ui";
import { EmptyState } from "../empty-state";
import { useToast } from "../toast";

const POSTER_WIDTH = 360;
const POSTER_HEIGHT = 480;

/** 不经过 fetch 把 data URL 还原成 Blob，避免被 connect-src 限制拦截。 */
function dataUrlToBlob(dataUrl: string) {
  const [header, base64] = dataUrl.split(",");
  const mime = header.match(/data:([^;]+)/)?.[1] ?? "image/png";
  const binary = atob(base64 ?? "");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1)
    bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mime });
}

export function TripPosterSheet({
  open,
  data,
  onClose,
}: {
  open: boolean;
  data: TripData;
  onClose: () => void;
}) {
  const toast = useToast();
  const route = useMemo(() => buildRoute(data.events), [data.events]);
  const hasStops = route.stops.length > 0;
  const poster = useRef<HTMLDivElement>(null);
  const [previewNode, setPreviewNode] = useState<HTMLDivElement | null>(null);
  const [hidden, setHidden] = useState<HTMLDivElement | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [mapState, setMapState] = useState<"loading" | "ready">("loading");
  const [scale, setScale] = useState(1);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !hasStops || !hidden) return;
    const node = hidden;
    if (!node) return;
    let disposed = false,
      captured = false,
      instance: import("maplibre-gl").Map | null = null,
      timer = 0;
    setImage(null);
    setMapState("loading");
    (async () => {
      try {
        const maplibre = await (await import("./maplibre")).loadMapLibre();
        if (disposed) return;
        instance = new maplibre.Map({
          container: node,
          style: mapStyleUrl,
          center: [route.stops[0].longitude, route.stops[0].latitude],
          zoom: 3,
          pixelRatio: 3,
          interactive: false,
          attributionControl: false,
          canvasContextAttributes: { preserveDrawingBuffer: true },
        });
        const map = instance;
        const capture = () => {
          if (captured) return;
          captured = true;
          try {
            const url = map.getCanvas().toDataURL("image/png");
            if (!disposed) setImage((current) => current ?? url);
          } catch {
            // 截图失败时保留无地图版式。
          }
          if (!disposed) setMapState("ready");
          map.remove();
          instance = null;
        };
        map.once("load", () => {
          if (disposed) return;
          ensureRouteLayers(map, route);
          fitRouteBounds(map, route);
          map.once("idle", capture);
        });
        timer = window.setTimeout(capture, 12000);
      } catch {
        if (!disposed) setMapState("ready");
      }
    })();
    return () => {
      disposed = true;
      window.clearTimeout(timer);
      instance?.remove();
      instance = null;
    };
  }, [open, hasStops, hidden, route.stops]);

  useEffect(() => {
    if (!open || !previewNode) return;
    const node = previewNode;
    // 用窗口尺寸而不是 ResizeObserver，避免改变缩放后触发自身尺寸变化导致的通知循环。
    const update = () =>
      setScale(
        Math.min(1, Math.max(0.5, (node.clientWidth - 4) / POSTER_WIDTH)),
      );
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [open, previewNode]);

  async function deliver(url: string) {
    const blob = dataUrlToBlob(url);
    const file = new File([blob], `${data.trip.title || "行程"}-海报.png`, {
      type: "image/png",
    });
    const navigatorWithShare = navigator as Navigator & {
      canShare?: (data: { files: File[] }) => boolean;
    };
    if (navigator.share && navigatorWithShare.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: data.trip.title });
        toast("海报已分享");
        return;
      } catch (shareError) {
        if ((shareError as Error).name === "AbortError") return;
      }
    }
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = file.name;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
    toast("海报已保存为图片");
  }

  async function generate() {
    if (!poster.current || busy) return;
    setBusy(true);
    setError("");
    setStep("正在生成海报…");
    try {
      const { toPng } = await import("html-to-image");
      const url = await toPng(poster.current, {
        pixelRatio: 3,
        skipFonts: true,
        cacheBust: true,
        backgroundColor: "#f6f5f3",
      });
      setStep("正在保存…");
      await deliver(url);
    } catch {
      setError("生成海报失败，请重试");
    } finally {
      setBusy(false);
      setStep("");
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="行程海报"
      className="poster-sheet"
    >
      <div className="poster-sheet-body">
        {!hasStops ? (
          <EmptyState
            kind="explore"
            title="还没有可以生成海报的路线"
            text="给安排添加地点后，就能生成带路线图的行程海报。"
          />
        ) : (
          <>
            <div className="poster-preview" ref={setPreviewNode}>
              <div
                style={{
                  width: POSTER_WIDTH * scale,
                  height: POSTER_HEIGHT * scale,
                }}
              >
                <div
                  style={{
                    transform: `scale(${scale})`,
                    transformOrigin: "top left",
                  }}
                >
                  <PosterTemplate ref={poster} data={data} image={image} />
                </div>
              </div>
            </div>
            <div
              className="poster-hidden-map"
              ref={setHidden}
              aria-hidden="true"
            />
            <p className="poster-hint">
              {mapState === "loading"
                ? "正在准备地图…"
                : "海报保存在本机，不会上传行程内容。微信不支持网页直接发朋友圈，保存或系统分享后自行发布。"}
            </p>
          </>
        )}
      </div>
      {hasStops && (
        <SheetFooter>
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
          <button
            type="button"
            className="primary-button"
            disabled={busy || mapState === "loading"}
            onClick={() => void generate()}
          >
            <Download size={17} />
            {busy ? step || "正在生成…" : "保存 / 分享海报"}
          </button>
        </SheetFooter>
      )}
    </Sheet>
  );
}
