import type { Map as MapLibreMap } from "maplibre-gl";

const ATLAS_URL = "/art/travel-stickers.png";
const ATLAS_WIDTH = 1254;

export type StickerKind =
  "flight" | "drive" | "stay" | "explore" | "transfer" | "luggage";

type Sprite = { x: number; y: number; width: number; height: number };

// 与 base.css 的 .travel-sticker 保持同一套图集坐标。
const sprites: Record<StickerKind, Sprite> = {
  flight: { x: 5, y: 228, width: 449, height: 255 },
  drive: { x: 435, y: 250, width: 425, height: 284 },
  stay: { x: 843, y: 160, width: 407, height: 392 },
  explore: { x: 8, y: 680, width: 432, height: 411 },
  transfer: { x: 449, y: 628, width: 369, height: 460 },
  luggage: { x: 879, y: 630, width: 301, height: 460 },
};

export const ARROW_IMAGE_ID = "trip-route-arrow";
export const stickerImageId = (kind: string) => `trip-sticker-${kind}`;
export const isStickerKind = (kind: string): kind is StickerKind =>
  kind in sprites;

/** 线段贴纸：航班用飞机，其余行程用车辆。 */
export function segmentSticker(
  kind: string,
): Extract<StickerKind, "flight" | "drive"> {
  return kind === "flight" ? "flight" : "drive";
}

let arrowImage: ImageData | null = null;
function routeArrow() {
  if (arrowImage) return arrowImage;
  const size = 56,
    canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.translate(size / 2, size / 2);
    ctx.beginPath();
    ctx.moveTo(0, -17);
    ctx.lineTo(13, 14);
    ctx.lineTo(0, 6);
    ctx.lineTo(-13, 14);
    ctx.closePath();
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.fillStyle = "#6c4c96";
    ctx.fill();
  }
  arrowImage = ctx
    ? ctx.getImageData(0, 0, size, size)
    : new ImageData(size, size);
  return arrowImage;
}

let atlasImage: HTMLImageElement | null = null;
async function loadAtlas() {
  if (atlasImage) return atlasImage;
  const image = new Image();
  image.src = ATLAS_URL;
  await image.decode();
  atlasImage = image;
  return image;
}

/**
 * 把箭头与行程贴纸注册为地图图片；图片按需从图集裁切，只注册用到的种类。
 */
export async function registerRouteImages(map: MapLibreMap, kinds: string[]) {
  if (!map.hasImage(ARROW_IMAGE_ID)) map.addImage(ARROW_IMAGE_ID, routeArrow());
  const needed = [...new Set(kinds.filter(isStickerKind))];
  if (needed.some((kind) => !map.hasImage(stickerImageId(kind)))) {
    let atlas: HTMLImageElement;
    try {
      atlas = await loadAtlas();
    } catch {
      return;
    }
    if (atlas.width !== ATLAS_WIDTH) return;
    for (const kind of needed) {
      const id = stickerImageId(kind);
      if (map.hasImage(id)) continue;
      const rect = sprites[kind];
      const canvas = document.createElement("canvas");
      canvas.width = rect.width;
      canvas.height = rect.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      ctx.drawImage(
        atlas,
        rect.x,
        rect.y,
        rect.width,
        rect.height,
        0,
        0,
        rect.width,
        rect.height,
      );
      map.addImage(id, ctx.getImageData(0, 0, rect.width, rect.height));
    }
  }
}
