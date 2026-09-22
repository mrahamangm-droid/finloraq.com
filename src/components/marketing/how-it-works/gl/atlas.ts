// Draws every card face used by the scene into one texture atlas (a single
// 1024² canvas → one texture bind). Faces are vector-drawn at runtime, so
// there are no image assets to download and they stay sharp on any DPR.

import type { InputKind } from "../content";

export const CELL_W = 256;
export const CELL_H = 320;
export const ATLAS = 1024;
export const CARD_ASPECT = CELL_W / CELL_H;

export type FaceId = InputKind | "record" | "action" | "reply";
const ORDER: FaceId[] = ["photo", "screenshot", "pdf", "sheet", "receipt", "invoice", "email", "whatsapp", "record", "action", "reply"];

/** UV rect (x, y, w, h) of a face in the atlas, inset to avoid mip bleeding. */
export function faceUV(id: FaceId): [number, number, number, number] {
  const i = Math.max(0, ORDER.indexOf(id));
  const col = i % 4, row = Math.floor(i / 4);
  const pad = 3;
  return [(col * CELL_W + pad) / ATLAS, (row * CELL_H + pad) / ATLAS, (CELL_W - pad * 2) / ATLAS, (CELL_H - pad * 2) / ATLAS];
}

export const ACCENT: Record<FaceId, string> = {
  photo: "#F0B35A",
  screenshot: "#8B82FF",
  pdf: "#FF7A6B",
  sheet: "#3FBE81",
  receipt: "#F0B35A",
  invoice: "#A79CFF",
  email: "#5AA9E6",
  whatsapp: "#3FBE81",
  record: "#2FBCA9",
  action: "#E0A340",
  reply: "#2FBCA9",
};

const TAG: Record<FaceId, string> = {
  photo: "PHOTO",
  screenshot: "SCREENSHOT",
  pdf: "PDF",
  sheet: "XLSX · CSV",
  receipt: "RECEIPT",
  invoice: "INVOICE",
  email: "EMAIL",
  whatsapp: "CHAT",
  record: "RECORD",
  action: "ACTION",
  reply: "REPLY",
};

const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

function rr(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function bars(c: CanvasRenderingContext2D, x: number, y: number, widths: number[], gap = 20, alpha = 0.16) {
  widths.forEach((w, i) => {
    c.fillStyle = `rgba(226,232,255,${alpha})`;
    rr(c, x, y + i * gap, w, 8, 4);
    c.fill();
  });
}

function icon(c: CanvasRenderingContext2D, id: FaceId, cx: number, cy: number, accent: string) {
  c.save();
  c.translate(cx, cy);
  c.lineWidth = 5;
  c.lineJoin = "round";
  c.lineCap = "round";
  c.strokeStyle = "rgba(238,241,248,0.92)";
  c.fillStyle = accent;
  switch (id) {
    case "photo":
      rr(c, -44, -28, 88, 62, 12); c.stroke();
      c.beginPath(); c.moveTo(-16, -28); c.lineTo(-10, -40); c.lineTo(10, -40); c.lineTo(16, -28); c.stroke();
      c.beginPath(); c.arc(0, 4, 17, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.arc(0, 4, 7, 0, Math.PI * 2); c.fill();
      break;
    case "screenshot":
      rr(c, -30, -48, 60, 96, 12); c.stroke();
      c.globalAlpha = 0.9;
      c.beginPath(); c.moveTo(-18, -24); c.lineTo(-18, -34); c.lineTo(-8, -34);
      c.moveTo(18, 24); c.lineTo(18, 34); c.lineTo(8, 34); c.strokeStyle = accent; c.stroke();
      break;
    case "pdf":
    case "invoice": {
      c.beginPath(); c.moveTo(-34, -46); c.lineTo(16, -46); c.lineTo(34, -28); c.lineTo(34, 46); c.lineTo(-34, 46); c.closePath(); c.stroke();
      c.beginPath(); c.moveTo(16, -46); c.lineTo(16, -28); c.lineTo(34, -28); c.stroke();
      if (id === "pdf") {
        c.font = `800 20px ${FONT}`; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("PDF", 0, 12);
      } else {
        c.fillRect(-22, -30, 26, 7);
        c.globalAlpha = 0.7; c.lineWidth = 3;
        for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(-22, -8 + i * 14); c.lineTo(22, -8 + i * 14); c.stroke(); }
        c.globalAlpha = 1; c.fillRect(2, 30, 20, 7);
      }
      break;
    }
    case "sheet":
      rr(c, -42, -40, 84, 80, 10); c.stroke();
      c.lineWidth = 3;
      for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(-42, -40 + i * 20); c.lineTo(42, -40 + i * 20); c.stroke(); }
      c.beginPath(); c.moveTo(-14, -40); c.lineTo(-14, 40); c.moveTo(14, -40); c.lineTo(14, 40); c.stroke();
      c.globalAlpha = 0.85; c.fillRect(-40, -38, 24, 16);
      break;
    case "receipt":
      c.beginPath(); c.moveTo(-30, -48); c.lineTo(30, -48); c.lineTo(30, 40);
      for (let i = 0; i < 6; i++) c.lineTo(30 - (i + 0.5) * 10, i % 2 ? 40 : 48);
      c.lineTo(-30, 40); c.closePath(); c.stroke();
      c.lineWidth = 3; c.globalAlpha = 0.75;
      for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(-18, -30 + i * 14); c.lineTo(18, -30 + i * 14); c.stroke(); }
      c.globalAlpha = 1; c.fillRect(-18, 18, 36, 7);
      break;
    case "email":
      rr(c, -46, -32, 92, 64, 10); c.stroke();
      c.beginPath(); c.moveTo(-42, -26); c.lineTo(0, 6); c.lineTo(42, -26); c.strokeStyle = accent; c.stroke();
      break;
    case "whatsapp":
    case "reply":
      c.beginPath(); c.ellipse(0, -4, 44, 36, 0, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.moveTo(-24, 24); c.lineTo(-36, 44); c.lineTo(-8, 30); c.stroke();
      for (let i = -1; i <= 1; i++) { c.beginPath(); c.arc(i * 16, -4, 5, 0, Math.PI * 2); c.fill(); }
      break;
    case "record":
      c.lineWidth = 4;
      rr(c, -42, -40, 84, 80, 10); c.stroke();
      c.beginPath(); c.moveTo(0, -40); c.lineTo(0, 40); c.stroke();
      c.font = `800 18px ${FONT}`; c.textAlign = "center"; c.textBaseline = "middle";
      c.fillText("Dr", -21, -20); c.fillText("Cr", 21, -20);
      c.fillRect(-34, 0, 26, 6); c.fillRect(-34, 16, 18, 6); c.fillRect(8, 0, 26, 6); c.fillRect(16, 16, 18, 6);
      break;
    case "action":
      c.beginPath(); c.arc(0, 0, 40, 0, Math.PI * 2); c.stroke();
      c.strokeStyle = accent; c.lineWidth = 7;
      c.beginPath(); c.moveTo(-17, 1); c.lineTo(-4, 14); c.lineTo(19, -12); c.stroke();
      break;
  }
  c.restore();
}

function face(c: CanvasRenderingContext2D, id: FaceId, x: number, y: number) {
  const accent = ACCENT[id];
  c.save();
  c.translate(x, y);
  c.clearRect(0, 0, CELL_W, CELL_H);
  const g = c.createLinearGradient(0, 0, 0, CELL_H);
  const special = id === "record" || id === "action" || id === "reply";
  g.addColorStop(0, special ? "#162B3A" : "#1B2546");
  g.addColorStop(1, special ? "#0C1824" : "#0E1529");
  rr(c, 6, 6, CELL_W - 12, CELL_H - 12, 18);
  c.fillStyle = g;
  c.fill();
  c.lineWidth = 2;
  c.strokeStyle = special ? "rgba(47,188,169,0.55)" : "rgba(167,156,255,0.38)";
  c.stroke();

  // header tag
  c.font = `800 15px ${FONT}`;
  const tag = TAG[id];
  const tw = c.measureText(tag).width + 22;
  rr(c, 22, 24, tw, 26, 13);
  c.fillStyle = accent + "33";
  c.fill();
  c.fillStyle = accent;
  c.textBaseline = "middle";
  c.fillText(tag, 33, 38);
  c.fillStyle = "rgba(226,232,255,0.25)";
  for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(CELL_W - 36 + i * 9, 37, 3, 0, Math.PI * 2); c.fill(); }

  icon(c, id, CELL_W / 2, 130, accent);

  if (id === "record") {
    bars(c, 30, 210, [70, 90, 60], 22, 0.22);
    bars(c, 140, 210, [86, 64, 86], 22, 0.32);
    c.fillStyle = accent;
    c.font = `800 15px ${FONT}`;
    c.fillText("BALANCED ✓", 30, 288);
  } else if (id === "action") {
    bars(c, 44, 206, [168, 120], 22, 0.2);
    rr(c, 44, 254, 168, 36, 18); c.fillStyle = accent; c.fill();
    c.fillStyle = "#1A1204"; c.font = `800 16px ${FONT}`; c.textAlign = "center"; c.fillText("YOU APPROVE", CELL_W / 2, 273);
  } else if (id === "reply") {
    bars(c, 40, 212, [150, 110], 22, 0.22);
    c.fillStyle = accent; c.font = `800 15px ${FONT}`; c.fillText("SENT ✓", 40, 284);
  } else {
    bars(c, 36, 206, [184, 140, 164]);
    rr(c, 36, 270, 100, 10, 5); c.fillStyle = accent + "AA"; c.fill();
    rr(c, 160, 270, 60, 10, 5); c.fillStyle = "rgba(226,232,255,0.3)"; c.fill();
  }
  c.restore();
}

export function drawAtlas(): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = ATLAS;
  cv.height = ATLAS;
  const c = cv.getContext("2d");
  if (!c) return cv;
  ORDER.forEach((id, i) => face(c, id, (i % 4) * CELL_W, Math.floor(i / 4) * CELL_H));
  return cv;
}
