import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "hsl(33 100% 97%)",
      }}
    >
      <div
        style={{
          width: 104,
          height: 104,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "18px solid hsl(12 67% 50%)",
          borderRadius: "50%",
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            background: "hsl(9 19% 20%)",
            borderRadius: "50%",
          }}
        />
      </div>
    </div>,
    size,
  );
}
