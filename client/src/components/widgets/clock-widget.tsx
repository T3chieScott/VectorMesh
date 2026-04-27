// Standalone so it can be rendered without zone-renderer's leaflet
// imports (which won't load in node:test).
import * as React from "react";
import { useSyncedSecondTick } from "@/lib/playerClock";
import {
  resolvePlayerVariables as resolveVars,
  type PlayerVariableContext,
} from "@/lib/player-variables";

function resolvePlayerVariables(
  text: string,
  ctx?: PlayerVariableContext,
): string {
  return resolveVars(text, ctx);
}

export interface ClockWidgetProps {
  timezone?: string;
  label?: string;
  ctx?: PlayerVariableContext;
  style?: "digital" | "analog";
  markerStyle?: "numbers" | "roman" | "dots" | "lines";
  showSecondHand?: boolean;
  showHourMarkers?: boolean;
  showDate?: boolean;
  handColor?: string;
  faceColor?: string;
  markerColor?: string;
  timeFontSize?: number;
  labelFontSize?: number;
  dateFontSize?: number;
}

export function ClockWidget({
  timezone,
  label,
  style = "digital",
  markerStyle = "numbers",
  showSecondHand = true,
  showHourMarkers = true,
  showDate = false,
  handColor = "#ffffff",
  faceColor = "transparent",
  markerColor = "#ffffff",
  timeFontSize,
  labelFontSize,
  dateFontSize,
  ctx,
}: ClockWidgetProps) {
  const resolvedLabel = label ? resolvePlayerVariables(label, ctx) : label;
  const time = useSyncedSecondTick();

  const getTimeParts = () => {
    const options: Intl.DateTimeFormatOptions = {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      ...(timezone && { timeZone: timezone }),
    };
    const parts = time.toLocaleTimeString("en-GB", options).split(":");
    return {
      hours: parseInt(parts[0], 10),
      minutes: parseInt(parts[1], 10),
      seconds: parseInt(parts[2], 10),
    };
  };

  const formatTime = (date: Date) => {
    const options: Intl.DateTimeFormatOptions = {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      ...(timezone && { timeZone: timezone }),
    };
    return date.toLocaleTimeString("en-GB", options);
  };

  const formatDate = (date: Date) => {
    const options: Intl.DateTimeFormatOptions = {
      weekday: "short",
      day: "numeric",
      month: "short",
      ...(timezone && { timeZone: timezone }),
    };
    return date.toLocaleDateString("en-GB", options);
  };

  const toRoman = (num: number): string => {
    const romanNumerals: { [key: number]: string } = {
      12: "XII", 11: "XI", 10: "X", 9: "IX", 8: "VIII",
      7: "VII", 6: "VI", 5: "V", 4: "IV", 3: "III", 2: "II", 1: "I",
    };
    return romanNumerals[num] || num.toString();
  };

  if (style === "analog") {
    const { hours, minutes, seconds } = getTimeParts();
    const hourAngle = ((hours % 12) + minutes / 60) * 30 - 90;
    const minuteAngle = (minutes + seconds / 60) * 6 - 90;
    const secondAngle = seconds * 6 - 90;

    const analogLabelFontSize = labelFontSize ? `max(${labelFontSize}px, ${Math.round(labelFontSize * 0.3)}cqh)` : "max(10px, 3cqh)";
    const analogDateFontSize = dateFontSize ? `max(${dateFontSize}px, ${Math.round(dateFontSize * 0.3)}cqh)` : "max(10px, 3cqh)";

    return (
      <div className="h-full w-full flex flex-col items-center justify-center p-2">
        {label && (
          <div className="font-semibold opacity-90 mb-1" style={{ fontSize: analogLabelFontSize, color: markerColor }}>{resolvedLabel}</div>
        )}
        <div className="relative" style={{ width: "min(80%, 80cqh)", aspectRatio: "1" }}>
          <svg viewBox="0 0 200 200" className="w-full h-full">
            <circle cx="100" cy="100" r="95" fill={faceColor} stroke={markerColor} strokeWidth="2" />
            {showHourMarkers && Array.from({ length: 12 }, (_, i) => {
              const hour = i === 0 ? 12 : i;
              const angle = (i * 30 - 90) * (Math.PI / 180);
              const x = 100 + 75 * Math.cos(angle);
              const y = 100 + 75 * Math.sin(angle);
              if (markerStyle === "numbers") {
                return (
                  <text key={i} x={x} y={y} fill={markerColor} fontSize="14" fontWeight="bold" textAnchor="middle" dominantBaseline="central">
                    {hour}
                  </text>
                );
              } else if (markerStyle === "roman") {
                return (
                  <text key={i} x={x} y={y} fill={markerColor} fontSize="12" fontWeight="bold" textAnchor="middle" dominantBaseline="central">
                    {toRoman(hour)}
                  </text>
                );
              } else if (markerStyle === "dots") {
                return (
                  <circle key={i} cx={x} cy={y} r={hour % 3 === 0 ? 5 : 3} fill={markerColor} />
                );
              } else {
                const innerRadius = hour % 3 === 0 ? 65 : 70;
                const x1 = 100 + innerRadius * Math.cos(angle);
                const y1 = 100 + innerRadius * Math.sin(angle);
                const x2 = 100 + 82 * Math.cos(angle);
                const y2 = 100 + 82 * Math.sin(angle);
                return (
                  <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={markerColor} strokeWidth={hour % 3 === 0 ? 3 : 1.5} strokeLinecap="round" />
                );
              }
            })}
            <line x1="100" y1="100" x2={100 + 45 * Math.cos(hourAngle * Math.PI / 180)} y2={100 + 45 * Math.sin(hourAngle * Math.PI / 180)} stroke={handColor} strokeWidth="6" strokeLinecap="round" />
            <line x1="100" y1="100" x2={100 + 65 * Math.cos(minuteAngle * Math.PI / 180)} y2={100 + 65 * Math.sin(minuteAngle * Math.PI / 180)} stroke={handColor} strokeWidth="4" strokeLinecap="round" />
            {showSecondHand && (
              <line x1="100" y1="100" x2={100 + 70 * Math.cos(secondAngle * Math.PI / 180)} y2={100 + 70 * Math.sin(secondAngle * Math.PI / 180)} stroke={handColor} strokeWidth="2" strokeLinecap="round" opacity="0.8" />
            )}
            <circle cx="100" cy="100" r="5" fill={handColor} />
          </svg>
        </div>
        {showDate && (
          <div className="mt-1 opacity-80" style={{ fontSize: analogDateFontSize, color: markerColor }}>{formatDate(time)}</div>
        )}
      </div>
    );
  }

  const digitalTimeFontSize = timeFontSize ? `max(${timeFontSize}px, ${Math.round(timeFontSize * 0.33)}cqh)` : "max(16px, 8cqh)";
  const digitalLabelFontSize = labelFontSize ? `max(${labelFontSize}px, ${Math.round(labelFontSize * 0.3)}cqh)` : "max(10px, 3.5cqh)";
  const digitalDateFontSize = dateFontSize ? `max(${dateFontSize}px, ${Math.round(dateFontSize * 0.3)}cqh)` : "max(10px, 3cqh)";

  return (
    <div data-testid="clock-widget" className="h-full w-full flex flex-col items-center justify-center text-center p-2">
      {label && (
        <div className="font-semibold opacity-90" style={{ fontSize: digitalLabelFontSize }}>{resolvedLabel}</div>
      )}
      <div data-testid="clock-widget-time" className="font-mono font-bold" style={{ fontSize: digitalTimeFontSize }}>{formatTime(time)}</div>
      {showDate !== false && (
        <div data-testid="clock-widget-date" className="opacity-80" style={{ fontSize: digitalDateFontSize }}>{formatDate(time)}</div>
      )}
    </div>
  );
}
