interface DecorativeBlobProps {
  color1: string;
  color2: string;
  size: number;
  top?: string;
  left?: string;
  right?: string;
  bottom?: string;
  opacity?: number;
  blur?: number;
}

export function DecorativeBlob({ color1, color2, size, top, left, right, bottom, opacity = 0.3, blur = 80 }: DecorativeBlobProps) {
  return (
    <div
      style={{
        position: 'absolute',
        width: size,
        height: size,
        top,
        left,
        right,
        bottom,
        background: `radial-gradient(circle, ${color1}, ${color2})`,
        filter: `blur(${blur}px)`,
        opacity,
        borderRadius: '50%',
        pointerEvents: 'none',
        zIndex: 0,
      }}
      aria-hidden="true"
    />
  );
}
