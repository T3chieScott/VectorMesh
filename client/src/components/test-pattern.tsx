interface TestPatternProps {
  screenName: string;
  width: number;
  height: number;
}

export function TestPattern({ screenName, width, height }: TestPatternProps) {
  const cx = width / 2;
  const cy = height / 2;
  const gridSize = 100;
  const colorBarHeight = Math.round(height * 0.18);
  const grayscaleHeight = Math.round(height * 0.06);

  const colorBars = [
    { color: "#ffffff", label: "100%" },
    { color: "#ffff00", label: "Yellow" },
    { color: "#00ffff", label: "Cyan" },
    { color: "#00ff00", label: "Green" },
    { color: "#ff00ff", label: "Magenta" },
    { color: "#ff0000", label: "Red" },
    { color: "#0000ff", label: "Blue" },
    { color: "#000000", label: "0%" },
  ];

  const grayscaleSteps = 11;
  const grayscaleBars = Array.from({ length: grayscaleSteps }, (_, i) => {
    const v = Math.round((i / (grayscaleSteps - 1)) * 255);
    return `rgb(${v}, ${v}, ${v})`;
  });

  const gridLines: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (let x = 0; x <= width; x += gridSize) {
    gridLines.push({ x1: x, y1: 0, x2: x, y2: height });
  }
  for (let y = 0; y <= height; y += gridSize) {
    gridLines.push({ x1: 0, y1: y, x2: width, y2: y });
  }

  const cornerSize = 80;
  const corners = [
    { x: 0, y: 0 },
    { x: width - cornerSize, y: 0 },
    { x: 0, y: height - cornerSize },
    { x: width - cornerSize, y: height - cornerSize },
  ];

  const circleRadii = [Math.min(width, height) * 0.15, Math.min(width, height) * 0.3, Math.min(width, height) * 0.45];

  const nameFontSize = Math.round(Math.min(width, height) * 0.06);
  const infoFontSize = Math.round(Math.min(width, height) * 0.022);
  const dimensionLabelSize = Math.round(Math.min(width, height) * 0.018);

  return (
    <div
      className="relative bg-black overflow-hidden"
      style={{ width: `${width}px`, height: `${height}px` }}
      data-testid="test-pattern"
    >
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: "block" }}
        preserveAspectRatio="none"
      >
        <rect x="0" y="0" width={width} height={height} fill="#202020" />

        {gridLines.map((l, i) => (
          <line
            key={`grid-${i}`}
            x1={l.x1}
            y1={l.y1}
            x2={l.x2}
            y2={l.y2}
            stroke="#3a3a3a"
            strokeWidth="1"
          />
        ))}

        <line x1="0" y1={cy} x2={width} y2={cy} stroke="#666" strokeWidth="2" />
        <line x1={cx} y1="0" x2={cx} y2={height} stroke="#666" strokeWidth="2" />
        <line x1="0" y1="0" x2={width} y2={height} stroke="#444" strokeWidth="1" />
        <line x1={width} y1="0" x2="0" y2={height} stroke="#444" strokeWidth="1" />

        {circleRadii.map((r, i) => (
          <circle
            key={`circle-${i}`}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="#888"
            strokeWidth="2"
          />
        ))}

        {colorBars.map((bar, i) => {
          const barWidth = width / colorBars.length;
          return (
            <g key={`bar-${i}`}>
              <rect
                x={i * barWidth}
                y={0}
                width={barWidth}
                height={colorBarHeight}
                fill={bar.color}
              />
              <text
                x={i * barWidth + barWidth / 2}
                y={colorBarHeight - 8}
                textAnchor="middle"
                fontSize={dimensionLabelSize}
                fill={i < 1 || i === colorBars.length - 1 ? "#888" : "#000"}
                fontFamily="monospace"
                fontWeight="bold"
              >
                {bar.label}
              </text>
            </g>
          );
        })}

        {grayscaleBars.map((color, i) => {
          const barWidth = width / grayscaleBars.length;
          return (
            <rect
              key={`gray-${i}`}
              x={i * barWidth}
              y={height - grayscaleHeight}
              width={barWidth}
              height={grayscaleHeight}
              fill={color}
            />
          );
        })}

        {corners.map((c, i) => (
          <g key={`corner-${i}`}>
            <rect
              x={c.x}
              y={c.y}
              width={cornerSize}
              height={cornerSize}
              fill="none"
              stroke="#ff4444"
              strokeWidth="3"
            />
            <line
              x1={c.x}
              y1={c.y}
              x2={c.x + cornerSize}
              y2={c.y + cornerSize}
              stroke="#ff4444"
              strokeWidth="2"
            />
            <line
              x1={c.x + cornerSize}
              y1={c.y}
              x2={c.x}
              y2={c.y + cornerSize}
              stroke="#ff4444"
              strokeWidth="2"
            />
          </g>
        ))}

        <circle cx={cx} cy={cy} r="6" fill="#ffffff" />
        <circle cx={cx} cy={cy} r="14" fill="none" stroke="#ffffff" strokeWidth="2" />
      </svg>

      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 px-12 py-8 rounded-2xl border-4 border-white bg-black/85 shadow-2xl text-center"
        style={{ minWidth: `${Math.round(width * 0.4)}px` }}
      >
        <div
          className="font-bold text-white uppercase tracking-tight leading-tight"
          style={{ fontSize: `${nameFontSize}px`, letterSpacing: "0.02em" }}
          data-testid="text-test-pattern-screen-name"
        >
          {screenName}
        </div>
        <div
          className="text-white/70 mt-3 font-mono"
          style={{ fontSize: `${infoFontSize}px` }}
        >
          {width} × {height} • TEST PATTERN
        </div>
      </div>
    </div>
  );
}
