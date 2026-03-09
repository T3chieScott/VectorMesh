import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Clock,
  Image,
  Type,
  Code,
  CloudSun,
  Newspaper,
  Layers,
  Sun,
  Cloud,
  CloudRain,
  CloudSnow,
  CloudLightning,
  CloudFog,
  CloudDrizzle,
  Snowflake,
  Droplets,
  Wind,
  Images,
  QrCode,
  Timer,
  Shapes,
  Calendar,
  PlayCircle,
  Trophy,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import type { LayoutZone, MediaAsset } from "@shared/schema";

const PLAYER_VARIABLES: { token: string; preview: string }[] = [
  { token: "{{screen_name}}", preview: "Lobby Screen 1" },
  { token: "{{room_name}}", preview: "Main Hall" },
  { token: "{{event_name}}", preview: "Tech Summit 2025" },
  { token: "{{client_name}}", preview: "Acme Corp" },
  { token: "{{date}}", preview: new Date().toLocaleDateString() },
  { token: "{{time}}", preview: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) },
  { token: "{{day}}", preview: new Date().toLocaleDateString('en', { weekday: 'long' }) },
];

function resolvePlayerVariables(text: string): string {
  if (!text) return text;
  let resolved = text;
  for (const v of PLAYER_VARIABLES) {
    resolved = resolved.replaceAll(v.token, v.preview);
  }
  return resolved;
}

export const zoneTypeIcons: Record<string, typeof Image> = {
  media: Image,
  ticker: Type,
  clock: Clock,
  logo: Image,
  html: Code,
  weather: CloudSun,
  news: Newspaper,
  montage: Images,
  qrcode: QrCode,
  countdown: Timer,
  shape: Shapes,
  schedule: Calendar,
  media_player: PlayCircle,
  football_table: Trophy,
};

function TickerWidget({ content, speed, animation, fontSize }: { content?: string; speed?: number; animation?: string; fontSize?: number }) {
  const animationDuration = speed || 20;
  const animationType = animation || "scroll-left";
  const displayContent = resolvePlayerVariables(content || "Breaking News: Welcome to VectorMesh • Latest updates coming soon • Stay tuned for announcements •");
  const textSize = fontSize || 24;
  
  // Split content for animations that show items one at a time
  const items = displayContent.split(/[•|]/).map(s => s.trim()).filter(Boolean);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(true);
  const [displayedChars, setDisplayedChars] = useState(0);
  
  // For fade and slide-in animations - cycle through items
  useEffect(() => {
    if (animationType === "fade" || animationType === "slide-in") {
      const itemDuration = (animationDuration * 1000) / Math.max(items.length, 1);
      const showDuration = itemDuration * 0.8;
      const hideDuration = itemDuration * 0.2;
      
      const showTimer = setInterval(() => {
        setIsVisible(false);
        setTimeout(() => {
          setCurrentIndex(prev => (prev + 1) % items.length);
          setIsVisible(true);
        }, hideDuration);
      }, itemDuration);
      
      return () => clearInterval(showTimer);
    }
  }, [animationType, animationDuration, items.length]);
  
  // For typewriter animation
  useEffect(() => {
    if (animationType === "typewriter") {
      const currentText = items[currentIndex] || displayContent;
      const charInterval = (animationDuration * 1000) / (currentText.length * items.length + items.length * 10);
      
      const timer = setInterval(() => {
        setDisplayedChars(prev => {
          if (prev >= currentText.length) {
            // Pause at end, then move to next item
            setTimeout(() => {
              setDisplayedChars(0);
              setCurrentIndex(prevIdx => (prevIdx + 1) % items.length);
            }, charInterval * 10);
            return prev;
          }
          return prev + 1;
        });
      }, charInterval);
      
      return () => clearInterval(timer);
    }
  }, [animationType, animationDuration, currentIndex, items, displayContent]);
  
  // Reset displayed chars when index changes for typewriter
  useEffect(() => {
    if (animationType === "typewriter") {
      setDisplayedChars(0);
    }
  }, [currentIndex, animationType]);
  
  if (animationType === "scroll-left") {
    return (
      <div className="h-full w-full flex items-center overflow-hidden">
        <div className="flex whitespace-nowrap pl-[100%]" style={{ animation: `marquee ${animationDuration}s linear infinite` }}>
          <span className="font-medium shrink-0" style={{ fontSize: `${textSize}px` }}>
            {displayContent}
          </span>
        </div>
      </div>
    );
  }
  
  if (animationType === "scroll-up") {
    return (
      <div className="h-full w-full overflow-hidden relative">
        <div 
          className="absolute w-full"
          style={{ animation: `scrollUp ${animationDuration}s linear infinite` }}
        >
          {items.map((item, i) => (
            <div 
              key={i} 
              className="flex items-center justify-center py-2"
              style={{ height: "100cqh", fontSize: `${textSize}px` }}
            >
              {item}
            </div>
          ))}
        </div>
      </div>
    );
  }
  
  if (animationType === "typewriter") {
    const currentText = items[currentIndex] || displayContent;
    return (
      <div className="h-full w-full flex items-center justify-center overflow-hidden">
        <span 
          className="font-medium font-mono"
          style={{ fontSize: `${textSize}px` }}
        >
          {currentText.slice(0, displayedChars)}
          <span className="animate-pulse">|</span>
        </span>
      </div>
    );
  }
  
  if (animationType === "fade") {
    return (
      <div className="h-full w-full flex items-center justify-center overflow-hidden">
        <span 
          className="font-medium text-center transition-opacity duration-500"
          style={{ 
            fontSize: `${textSize}px`,
            opacity: isVisible ? 1 : 0 
          }}
        >
          {items[currentIndex] || displayContent}
        </span>
      </div>
    );
  }
  
  if (animationType === "slide-in") {
    return (
      <div className="h-full w-full flex items-center justify-center overflow-hidden">
        <span 
          className="font-medium text-center transition-all duration-500"
          style={{ 
            fontSize: `${textSize}px`,
            opacity: isVisible ? 1 : 0,
            transform: isVisible ? "translateY(0)" : "translateY(100%)"
          }}
        >
          {items[currentIndex] || displayContent}
        </span>
      </div>
    );
  }
  
  // Default fallback
  return (
    <div className="h-full w-full flex items-center overflow-hidden">
      <span className="font-medium" style={{ fontSize: `${textSize}px` }}>
        {displayContent}
      </span>
    </div>
  );
}

interface ClockWidgetProps {
  timezone?: string;
  label?: string;
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

function ClockWidget({
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
}: ClockWidgetProps) {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    // Sync to the second boundary so all clocks tick together
    const now = new Date();
    const msUntilNextSecond = 1000 - now.getMilliseconds();
    
    let timer: ReturnType<typeof setInterval> | null = null;
    
    // First, wait until the next second boundary
    const initialTimeout = setTimeout(() => {
      setTime(new Date());
      // Then update every second on the boundary
      timer = setInterval(() => setTime(new Date()), 1000);
    }, msUntilNextSecond);

    return () => {
      clearTimeout(initialTimeout);
      if (timer) clearInterval(timer);
    };
  }, []);

  // Get time parts for the specified timezone
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

  // Roman numeral conversion
  const toRoman = (num: number): string => {
    const romanNumerals: { [key: number]: string } = {
      12: "XII", 11: "XI", 10: "X", 9: "IX", 8: "VIII",
      7: "VII", 6: "VI", 5: "V", 4: "IV", 3: "III", 2: "II", 1: "I",
    };
    return romanNumerals[num] || num.toString();
  };

  // Render analog clock
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
          <div className="font-semibold opacity-90 mb-1" style={{ fontSize: analogLabelFontSize, color: markerColor }}>{label}</div>
        )}
        <div className="relative" style={{ width: "min(80%, 80cqh)", aspectRatio: "1" }}>
          <svg viewBox="0 0 200 200" className="w-full h-full">
            {/* Clock face background */}
            <circle cx="100" cy="100" r="95" fill={faceColor} stroke={markerColor} strokeWidth="2" />
            
            {/* Hour markers */}
            {showHourMarkers && Array.from({ length: 12 }, (_, i) => {
              const hour = i === 0 ? 12 : i;
              const angle = (i * 30 - 90) * (Math.PI / 180);
              const x = 100 + 75 * Math.cos(angle);
              const y = 100 + 75 * Math.sin(angle);
              
              if (markerStyle === "numbers") {
                return (
                  <text
                    key={i}
                    x={x}
                    y={y}
                    fill={markerColor}
                    fontSize="14"
                    fontWeight="bold"
                    textAnchor="middle"
                    dominantBaseline="central"
                  >
                    {hour}
                  </text>
                );
              } else if (markerStyle === "roman") {
                return (
                  <text
                    key={i}
                    x={x}
                    y={y}
                    fill={markerColor}
                    fontSize="12"
                    fontWeight="bold"
                    textAnchor="middle"
                    dominantBaseline="central"
                  >
                    {toRoman(hour)}
                  </text>
                );
              } else if (markerStyle === "dots") {
                return (
                  <circle
                    key={i}
                    cx={x}
                    cy={y}
                    r={hour % 3 === 0 ? 5 : 3}
                    fill={markerColor}
                  />
                );
              } else {
                // lines
                const innerRadius = hour % 3 === 0 ? 65 : 70;
                const x1 = 100 + innerRadius * Math.cos(angle);
                const y1 = 100 + innerRadius * Math.sin(angle);
                const x2 = 100 + 82 * Math.cos(angle);
                const y2 = 100 + 82 * Math.sin(angle);
                return (
                  <line
                    key={i}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={markerColor}
                    strokeWidth={hour % 3 === 0 ? 3 : 1.5}
                    strokeLinecap="round"
                  />
                );
              }
            })}

            {/* Hour hand */}
            <line
              x1="100"
              y1="100"
              x2={100 + 45 * Math.cos(hourAngle * Math.PI / 180)}
              y2={100 + 45 * Math.sin(hourAngle * Math.PI / 180)}
              stroke={handColor}
              strokeWidth="6"
              strokeLinecap="round"
            />

            {/* Minute hand */}
            <line
              x1="100"
              y1="100"
              x2={100 + 65 * Math.cos(minuteAngle * Math.PI / 180)}
              y2={100 + 65 * Math.sin(minuteAngle * Math.PI / 180)}
              stroke={handColor}
              strokeWidth="4"
              strokeLinecap="round"
            />

            {/* Second hand - uses hand color with slight opacity for distinction */}
            {showSecondHand && (
              <line
                x1="100"
                y1="100"
                x2={100 + 70 * Math.cos(secondAngle * Math.PI / 180)}
                y2={100 + 70 * Math.sin(secondAngle * Math.PI / 180)}
                stroke={handColor}
                strokeWidth="2"
                strokeLinecap="round"
                opacity="0.8"
              />
            )}

            {/* Center dot */}
            <circle cx="100" cy="100" r="5" fill={handColor} />
          </svg>
        </div>
        {showDate && (
          <div className="mt-1 opacity-80" style={{ fontSize: analogDateFontSize, color: markerColor }}>{formatDate(time)}</div>
        )}
      </div>
    );
  }

  // Render digital clock (default)
  const digitalTimeFontSize = timeFontSize ? `max(${timeFontSize}px, ${Math.round(timeFontSize * 0.33)}cqh)` : "max(16px, 8cqh)";
  const digitalLabelFontSize = labelFontSize ? `max(${labelFontSize}px, ${Math.round(labelFontSize * 0.3)}cqh)` : "max(10px, 3.5cqh)";
  const digitalDateFontSize = dateFontSize ? `max(${dateFontSize}px, ${Math.round(dateFontSize * 0.3)}cqh)` : "max(10px, 3cqh)";

  return (
    <div className="h-full w-full flex flex-col items-center justify-center text-center p-2">
      {label && (
        <div className="font-semibold opacity-90" style={{ fontSize: digitalLabelFontSize }}>{label}</div>
      )}
      <div className="font-mono font-bold" style={{ fontSize: digitalTimeFontSize }}>{formatTime(time)}</div>
      {showDate !== false && (
        <div className="opacity-80" style={{ fontSize: digitalDateFontSize }}>{formatDate(time)}</div>
      )}
    </div>
  );
}

interface CountdownWidgetProps {
  targetDate?: string;
  title?: string;
  completionMessage?: string;
  showDays?: boolean;
  showHours?: boolean;
  showMinutes?: boolean;
  showSeconds?: boolean;
  dayLabel?: string;
  hourLabel?: string;
  minuteLabel?: string;
  secondLabel?: string;
  separator?: "colon" | "dash" | "space" | "none";
  showLeadingZeros?: boolean;
  numberColor?: string;
  labelColor?: string;
  size?: number;
  titleSize?: number;
  labelSize?: number;
  fontFamily?: "sans" | "serif" | "mono" | "display";
  unitGap?: number;
  timezone?: string;
  compact?: boolean;
}

function CountdownWidget({
  targetDate,
  title,
  completionMessage = "Event Started!",
  showDays = true,
  showHours = true,
  showMinutes = true,
  showSeconds = true,
  dayLabel = "Days",
  hourLabel = "Hours",
  minuteLabel = "Minutes",
  secondLabel = "Seconds",
  separator = "colon",
  showLeadingZeros = true,
  numberColor,
  labelColor,
  size = 24,
  titleSize,
  labelSize,
  fontFamily = "mono",
  unitGap,
  timezone,
  compact = false,
}: CountdownWidgetProps) {
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  const [isComplete, setIsComplete] = useState(false);

  const fontFamilyMap = {
    sans: "ui-sans-serif, system-ui, sans-serif",
    serif: "ui-serif, Georgia, serif",
    mono: "ui-monospace, SFMono-Regular, monospace",
    display: "'Oswald', 'Bebas Neue', Impact, sans-serif",
  };

  const numberFontSize = `max(${size}px, ${Math.round(size * 0.33)}cqh)`;
  const effectiveLabelSize = labelSize || Math.max(8, Math.round(size * 0.4));
  const labelFontSize = `max(${effectiveLabelSize}px, ${Math.round(effectiveLabelSize * 0.25)}cqh)`;
  const effectiveTitleSizePx = titleSize || Math.max(12, Math.round(size * 0.67));
  const titleFontSize = `max(${effectiveTitleSizePx}px, ${Math.round(effectiveTitleSizePx * 0.25)}cqh)`;
  const gap = unitGap !== undefined ? `${unitGap}rem` : `${Math.max(0.2, size * 0.02)}rem`;
  const titleGap = `${Math.max(0.1, size * 0.008)}rem`;

  const separatorMap = {
    colon: ":",
    dash: " - ",
    space: " ",
    none: "",
  };

  useEffect(() => {
    if (!targetDate) return;

    const calculateTimeLeft = () => {
      let target: number;
      
      if (timezone) {
        // The targetDate is entered as a local datetime string (e.g., "2026-07-20T10:00")
        // The timezone tells us what timezone that datetime refers to (e.g., "Europe/London")
        // We need to find the UTC timestamp for that datetime in that timezone
        try {
          const dateStr = targetDate.includes("T") ? targetDate : `${targetDate}T00:00:00`;
          const [datePart, timePart] = dateStr.split("T");
          const [year, month, day] = datePart.split("-").map(Number);
          const [hour, minute, secondStr] = timePart.split(":");
          const second = parseInt(secondStr || "0");
          
          // Create a date in the target timezone and get its UTC equivalent
          // We do this by finding the offset between local time and the target timezone
          const testDate = new Date(year, month - 1, day, parseInt(hour), parseInt(minute), second);
          
          // Get the target timezone offset at that moment
          const targetTzFormatter = new Intl.DateTimeFormat('en-US', {
            timeZone: timezone,
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: false,
          });
          const utcFormatter = new Intl.DateTimeFormat('en-US', {
            timeZone: 'UTC',
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: false,
          });
          
          // Parse both formatted strings to calculate offset
          const parseFormattedDate = (formatted: string) => {
            const parts = formatted.split(', ');
            const [m, d, y] = parts[0].split('/').map(Number);
            const [h, min, s] = parts[1].split(':').map(Number);
            return new Date(Date.UTC(y, m - 1, d, h, min, s)).getTime();
          };
          
          const targetFormatted = targetTzFormatter.format(testDate);
          const utcFormatted = utcFormatter.format(testDate);
          const targetMs = parseFormattedDate(targetFormatted);
          const utcMs = parseFormattedDate(utcFormatted);
          const offsetMs = utcMs - targetMs;
          
          // The target time in UTC is the entered time adjusted by the timezone offset
          target = Date.UTC(year, month - 1, day, parseInt(hour), parseInt(minute), second) - offsetMs;
        } catch {
          target = new Date(targetDate).getTime();
        }
      } else {
        target = new Date(targetDate).getTime();
      }
      
      // Guard against invalid date strings
      if (isNaN(target)) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
        return;
      }
      const now = Date.now();
      const diff = target - now;

      if (diff <= 0) {
        setIsComplete(true);
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
        return;
      }

      setIsComplete(false);
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      setTimeLeft({ days, hours, minutes, seconds });
    };

    calculateTimeLeft();
    const interval = setInterval(calculateTimeLeft, 1000);
    return () => clearInterval(interval);
  }, [targetDate, timezone]);

  const formatNumber = (num: number, maxDigits: number = 2) => {
    if (showLeadingZeros) {
      return num.toString().padStart(maxDigits, "0");
    }
    return num.toString();
  };

  if (!targetDate) {
    return (
      <div className="h-full w-full flex items-center justify-center text-center p-2">
        <div>
          <Timer className="h-6 w-6 mx-auto mb-1 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">Set a target date</p>
        </div>
      </div>
    );
  }

  if (isComplete) {
    return (
      <div className="h-full w-full flex items-center justify-center text-center p-2">
        <div 
          className="font-bold"
          style={{ 
            fontSize: numberFontSize,
            color: numberColor || "inherit"
          }}
        >
          {completionMessage}
        </div>
      </div>
    );
  }

  const units: { value: number; label: string; show: boolean; maxDigits: number }[] = [
    { value: timeLeft.days, label: dayLabel, show: showDays, maxDigits: 3 },
    { value: timeLeft.hours, label: hourLabel, show: showHours, maxDigits: 2 },
    { value: timeLeft.minutes, label: minuteLabel, show: showMinutes, maxDigits: 2 },
    { value: timeLeft.seconds, label: secondLabel, show: showSeconds, maxDigits: 2 },
  ];

  const visibleUnits = units.filter(u => u.show);
  const sep = separatorMap[separator];
  const fontStyle = fontFamilyMap[fontFamily];

  return (
    <div className={`h-full w-full flex flex-col items-center justify-center text-center ${compact ? 'p-1' : 'p-2'}`}>
      {title && (
        <div 
          className="font-semibold opacity-90"
          style={{ 
            fontSize: titleFontSize,
            color: labelColor || "inherit",
            marginBottom: titleGap,
          }}
        >
          {title}
        </div>
      )}
      <div className="flex flex-col items-center" style={{ gap: titleGap }}>
        <div 
          className="flex items-center justify-center flex-wrap"
          style={{ gap }}
        >
          {visibleUnits.map((unit, idx) => (
            <div key={unit.label} className="flex items-center">
              <div 
                className="font-bold"
                style={{ 
                  fontSize: numberFontSize,
                  color: numberColor || "inherit",
                  fontFamily: fontStyle,
                }}
              >
                {formatNumber(unit.value, unit.maxDigits)}
              </div>
              {idx < visibleUnits.length - 1 && sep && (
                <span 
                  className={`font-bold ${compact ? 'mx-0.5' : 'mx-1'}`}
                  style={{ 
                    fontSize: numberFontSize,
                    color: numberColor || "inherit",
                    opacity: 0.5,
                    fontFamily: fontStyle,
                  }}
                >
                  {sep}
                </span>
              )}
            </div>
          ))}
        </div>
        <div 
          className="flex justify-center flex-wrap"
          style={{ gap }}
        >
          {visibleUnits.map((unit, idx) => (
            <div key={`label-${unit.label}`} className="flex items-center">
              <div 
                className="opacity-80 text-center"
                style={{ 
                  fontSize: labelFontSize,
                  color: labelColor || "inherit",
                  minWidth: `${unit.maxDigits + 1}ch`,
                }}
              >
                {unit.label}
              </div>
              {idx < visibleUnits.length - 1 && sep && (
                <span 
                  className={`${compact ? 'mx-0.5' : 'mx-1'}`}
                  style={{ 
                    fontSize: numberFontSize,
                    visibility: 'hidden',
                  }}
                >
                  {sep}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function LogoWidget() {
  return (
    <div className="h-full w-full flex items-center justify-center p-2">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
          <span className="text-primary-foreground font-bold text-sm">DS</span>
        </div>
      </div>
    </div>
  );
}

function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? [
    parseInt(result[1], 16) / 255,
    parseInt(result[2], 16) / 255,
    parseInt(result[3], 16) / 255
  ] : [1, 0, 0];
}

function ShaderWidget({ 
  preset = "gradient",
  customCode,
  speed = 1,
  variable = 0.5,
  color1 = "#ff6b6b",
  color2 = "#4ecdc4",
}: { 
  preset?: string;
  customCode?: string;
  speed?: number;
  variable?: number;
  color1?: string;
  color2?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const startTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl");
    if (!gl) return;

    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resizeCanvas();

    const presetShaders: Record<string, string> = {
      gradient: `
        void main() {
          vec2 uv = gl_FragCoord.xy / u_resolution.xy;
          float t = u_time * 0.3;
          vec3 color = mix(u_color1, u_color2, uv.x + sin(t + uv.y * 3.0) * 0.3);
          gl_FragColor = vec4(color, 1.0);
        }
      `,
      plasma: `
        void main() {
          vec2 uv = gl_FragCoord.xy / u_resolution.xy;
          float t = u_time * 0.5;
          float v = sin(uv.x * 10.0 + t) + sin(uv.y * 10.0 + t);
          v += sin((uv.x + uv.y) * 10.0 + t) + sin(sqrt(uv.x * uv.x + uv.y * uv.y) * 10.0);
          vec3 base = mix(u_color1, u_color2, 0.5);
          vec3 color = base * (vec3(sin(v), sin(v + 2.0), sin(v + 4.0)) * 0.5 + 0.5);
          gl_FragColor = vec4(color, 1.0);
        }
      `,
      waves: `
        void main() {
          vec2 uv = gl_FragCoord.xy / u_resolution.xy;
          float t = u_time * 0.4;
          float wave = sin(uv.x * 8.0 + t) * 0.1 + sin(uv.x * 4.0 - t * 0.5) * 0.05;
          float y = uv.y - 0.5 + wave;
          vec3 color = mix(u_color2, u_color1, smoothstep(-0.1, 0.1, y));
          gl_FragColor = vec4(color, 1.0);
        }
      `,
      noise: `
        void main() {
          vec2 uv = gl_FragCoord.xy / u_resolution.xy;
          float t = u_time * 0.3;
          float n = fract(sin(dot(uv + t * 0.1, vec2(12.9898, 78.233))) * 43758.5453);
          n += fract(sin(dot(uv * 2.0 - t * 0.05, vec2(93.9898, 67.345))) * 43758.5453) * 0.5;
          vec3 color = mix(u_color1, u_color2, n * 0.5);
          gl_FragColor = vec4(color, 1.0);
        }
      `,
      aurora: `
        void main() {
          vec2 uv = gl_FragCoord.xy / u_resolution.xy;
          float t = u_time * 0.2;
          float wave1 = sin(uv.x * 4.0 + t) * 0.3;
          float wave2 = sin(uv.x * 6.0 - t * 0.7) * 0.2;
          float intensity = smoothstep(0.3, 0.7, uv.y + wave1 + wave2);
          vec3 color = mix(u_color2, u_color1, intensity);
          color *= 0.8 + 0.2 * sin(uv.x * 10.0 + t * 2.0);
          gl_FragColor = vec4(color, 1.0);
        }
      `,
    };

    const fragmentShaderSource = `
      precision mediump float;
      uniform float u_time;
      uniform vec2 u_resolution;
      uniform float u_variable;
      uniform vec3 u_color1;
      uniform vec3 u_color2;
      ${customCode && preset === "custom" ? customCode : presetShaders[preset] || presetShaders.gradient}
    `;

    const vertexShaderSource = `
      attribute vec2 a_position;
      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `;

    const createShader = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vertexShader = createShader(gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = createShader(gl.FRAGMENT_SHADER, fragmentShaderSource);
    if (!vertexShader || !fragmentShader) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    const positionLocation = gl.getAttribLocation(program, "a_position");
    const timeLocation = gl.getUniformLocation(program, "u_time");
    const resolutionLocation = gl.getUniformLocation(program, "u_resolution");
    const variableLocation = gl.getUniformLocation(program, "u_variable");
    const color1Location = gl.getUniformLocation(program, "u_color1");
    const color2Location = gl.getUniformLocation(program, "u_color2");

    const [r1, g1, b1] = hexToRgb(color1);
    const [r2, g2, b2] = hexToRgb(color2);

    const render = () => {
      resizeCanvas();
      gl.useProgram(program);
      gl.enableVertexAttribArray(positionLocation);
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
      const elapsed = (Date.now() - startTimeRef.current) / 1000 * speed;
      gl.uniform1f(timeLocation, elapsed);
      gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
      gl.uniform1f(variableLocation, variable);
      gl.uniform3f(color1Location, r1, g1, b1);
      gl.uniform3f(color2Location, r2, g2, b2);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      animationRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [preset, customCode, speed, variable, color1, color2]);

  return <canvas ref={canvasRef} className="w-full h-full" />;
}

function TextWidget({ 
  content,
  fontSize = 24,
  align = "center",
  verticalAlign = "middle",
}: { 
  content?: string;
  fontSize?: number | string;
  align?: string;
  verticalAlign?: string;
}) {
  const legacySizeMap: Record<string, number> = {
    small: 14,
    medium: 24,
    large: 36,
    xlarge: 48,
  };

  const resolvedSize = typeof fontSize === 'number' ? fontSize : (legacySizeMap[fontSize] || 24);

  const alignMap: Record<string, string> = {
    left: "flex-start",
    center: "center",
    right: "flex-end",
  };

  const verticalAlignMap: Record<string, string> = {
    top: "flex-start",
    middle: "center",
    bottom: "flex-end",
  };

  return (
    <div 
      className="h-full w-full flex p-4"
      style={{
        justifyContent: alignMap[align] || "center",
        alignItems: verticalAlignMap[verticalAlign] || "center",
        fontSize: `${resolvedSize}px`,
        textAlign: align as "left" | "center" | "right",
      }}
    >
      {resolvePlayerVariables(content || "Sample text content")}
    </div>
  );
}

function HtmlWidget({ content }: { content?: string }) {
  return (
    <div className="h-full w-full flex items-center justify-center p-4 text-center">
      <div className="space-y-2">
        <Code className="h-8 w-8 mx-auto text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          {content ? "HTML Widget" : "Custom HTML Zone"}
        </p>
      </div>
    </div>
  );
}

const weatherIcons: Record<string, typeof Sun> = {
  "clear": Sun,
  "sunny": Sun,
  "partly-cloudy": Cloud,
  "cloudy": Cloud,
  "overcast": Cloud,
  "rain": CloudRain,
  "light-rain": CloudDrizzle,
  "heavy-rain": CloudRain,
  "snow": CloudSnow,
  "light-snow": Snowflake,
  "heavy-snow": CloudSnow,
  "thunderstorm": CloudLightning,
  "fog": CloudFog,
  "mist": CloudFog,
  "drizzle": CloudDrizzle,
  "sleet": Droplets,
  "windy": Wind,
};

function WeatherWidget({ 
  lat,
  lng,
  unit = "celsius",
  location,
  fontSize = 24,
}: { 
  lat?: number;
  lng?: number;
  unit?: string;
  location?: string;
  fontSize?: number;
}) {
  const [weather, setWeather] = useState<{
    temperature: number;
    condition: string;
    humidity: number;
    windSpeed: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchWeather = async () => {
      if (!lat || !lng) {
        setError("No location configured");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        
        const response = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&temperature_unit=${unit === "fahrenheit" ? "fahrenheit" : "celsius"}&wind_speed_unit=mph`
        );
        
        if (!response.ok) throw new Error("Weather API error");
        
        const data = await response.json();
        const current = data.current;
        
        const weatherCodeToCondition = (code: number): string => {
          if (code === 0) return "clear";
          if (code <= 3) return "partly-cloudy";
          if (code <= 49) return "fog";
          if (code <= 59) return "drizzle";
          if (code <= 69) return "rain";
          if (code <= 79) return "snow";
          if (code <= 84) return "rain";
          if (code <= 86) return "snow";
          if (code >= 95) return "thunderstorm";
          return "cloudy";
        };

        setWeather({
          temperature: Math.round(current.temperature_2m),
          condition: weatherCodeToCondition(current.weather_code),
          humidity: current.relative_humidity_2m,
          windSpeed: Math.round(current.wind_speed_10m),
        });
      } catch (err) {
        setError("Failed to load weather");
      } finally {
        setLoading(false);
      }
    };

    fetchWeather();
    const interval = setInterval(fetchWeather, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [lat, lng, unit]);

  if (loading) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <CloudSun className="h-6 w-6 animate-pulse text-muted-foreground" />
      </div>
    );
  }

  if (error || !weather) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center text-center p-2">
        <CloudSun className="h-6 w-6 text-muted-foreground mb-1" />
        <p className="text-xs text-muted-foreground">{error || "No data"}</p>
      </div>
    );
  }

  const WeatherIcon = weatherIcons[weather.condition] || Cloud;

  const iconSize = Math.max(16, fontSize * 1.2);
  const locationSize = Math.max(10, fontSize * 0.5);

  return (
    <div className="h-full w-full flex flex-col items-center justify-center text-center p-1">
      <WeatherIcon className="mb-1" style={{ width: `${iconSize}px`, height: `${iconSize}px` }} />
      <div className="font-bold" style={{ fontSize: `${fontSize}px` }}>
        {weather.temperature}°{unit === "fahrenheit" ? "F" : "C"}
      </div>
      {location && (
        <div className="text-muted-foreground truncate w-full" style={{ fontSize: `${locationSize}px` }}>
          {location.split(",")[0]}
        </div>
      )}
    </div>
  );
}

function NewsWidget({ 
  rssUrl,
  scrollSpeed = 50,
  itemCount = 10,
  textSize = 24,
  showHeader = true,
  deviceToken,
}: { 
  rssUrl?: string;
  scrollSpeed?: number;
  itemCount?: number;
  textSize?: number;
  showHeader?: boolean;
  deviceToken?: string;
}) {
  const [news, setNews] = useState<{ title: string; link: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fontSize = textSize || 24;

  useEffect(() => {
    const fetchNews = async () => {
      if (!rssUrl) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const baseEndpoint = deviceToken ? "/api/player/widgets/news" : "/api/widgets/news";
        const tokenParam = deviceToken ? `&token=${deviceToken}` : "";
        const response = await fetch(`${baseEndpoint}?url=${encodeURIComponent(rssUrl)}&count=${itemCount}${tokenParam}`);
        if (!response.ok) throw new Error("RSS fetch failed");
        
        const data = await response.json();
        if (data.items && data.items.length > 0) {
          setNews(data.items.map((item: { title: string; link: string }) => ({
            title: item.title,
            link: item.link,
          })));
        } else {
          setNews([]);
        }
      } catch (err) {
        setNews([]);
      } finally {
        setLoading(false);
      }
    };

    fetchNews();
    const interval = setInterval(fetchNews, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [rssUrl, itemCount]);

  useEffect(() => {
    if (!scrollRef.current || news.length === 0) return;
    
    // Use half the scroll width since we have 2 identical copies and animate 50%
    // Speed affects pixels-per-second: Speed 1 = 10px/s, Speed 100 = 300px/s
    const clampedSpeed = Math.max(1, Math.min(100, scrollSpeed));
    const pixelsPerSecond = 10 + (clampedSpeed - 1) * 2.9; // Linear scale from 10 to 300 px/s
    const scrollWidth = (scrollRef.current.scrollWidth || 500) / 2; // Half width for one copy
    const rawDuration = scrollWidth / pixelsPerSecond;
    // Clamp between 5s minimum and 180s maximum for readability
    const duration = Math.max(5, Math.min(180, rawDuration));
    scrollRef.current.style.animationDuration = `${duration}s`;
  }, [scrollSpeed, news]);

  if (!rssUrl) {
    return (
      <div className="h-full w-full flex items-center justify-center text-center p-2">
        <div>
          <Newspaper className="h-6 w-6 mx-auto mb-1 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">No RSS feed configured</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <Newspaper className="h-6 w-6 animate-pulse text-muted-foreground" />
      </div>
    );
  }

  const newsText = news.map(n => n.title).join(" • ") || "No news available";

  return (
    <div className="h-full w-full flex items-center overflow-hidden">
      <div 
        ref={scrollRef}
        className="marquee-container whitespace-nowrap" 
        style={{ fontSize: `${fontSize}px` }}
      >
        <span className="pr-8">{newsText} •</span>
        <span className="pr-8">{newsText} •</span>
      </div>
    </div>
  );
}

function MediaWidget({
  media,
  mediaIndex,
  isPlaying,
  mediaBaseUrl,
  deviceToken,
}: {
  media: MediaAsset[];
  mediaIndex: number;
  isPlaying: boolean;
  mediaBaseUrl?: string;
  deviceToken?: string;
}) {
  if (media.length === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <div className="text-center">
          <Image className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No media assigned</p>
        </div>
      </div>
    );
  }

  const currentMedia = media[mediaIndex % media.length];
  if (!currentMedia) return null;

  const baseUrl = mediaBaseUrl || "/api/media";
  const mediaUrl = currentMedia.originalPath.startsWith("http")
    ? currentMedia.originalPath
    : `${baseUrl}/${currentMedia.id}/file${deviceToken ? `?token=${deviceToken}` : ""}`;
  
  if (currentMedia.mediaType === "video") {
    return (
      <video
        key={currentMedia.id}
        src={mediaUrl}
        className="h-full w-full object-contain"
        autoPlay={isPlaying}
        loop
        muted
        playsInline
      />
    );
  }

  return (
    <img
      key={currentMedia.id}
      src={mediaUrl}
      alt={currentMedia.name}
      className="h-full w-full object-contain"
    />
  );
}

function MontageWidget({
  mediaIds,
  duration = 5,
  transition = "fade",
  transitionDuration = 1000,
  fitMode = "cover",
  kenBurns = false,
  kenBurnsIntensity = 10,
  shuffle = false,
  autoPlay = true,
  providedMedia,
  mediaBaseUrl,
  deviceToken,
}: {
  mediaIds: string[];
  duration?: number;
  transition?: "fade" | "slide-left" | "slide-right" | "slide-up" | "slide-down" | "zoom-in" | "zoom-out" | "none";
  transitionDuration?: number;
  fitMode?: "contain" | "cover";
  kenBurns?: boolean;
  kenBurnsIntensity?: number;
  shuffle?: boolean;
  autoPlay?: boolean;
  providedMedia?: MediaAsset[];
  mediaBaseUrl?: string;
  deviceToken?: string;
}) {
  const [displayOrder, setDisplayOrder] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [layerA, setLayerA] = useState<string>("");
  const [layerB, setLayerB] = useState<string>("");
  const [activeLayer, setActiveLayer] = useState<"a" | "b">("a");
  const [crossfading, setCrossfading] = useState(false);
  const [kenBurnsA, setKenBurnsA] = useState({ scale: 1, x: 0, y: 0 });
  const [kenBurnsB, setKenBurnsB] = useState({ scale: 1, x: 0, y: 0 });
  const [hasError, setHasError] = useState(false);
  const currentIndexRef = useRef(0);
  const displayOrderRef = useRef<string[]>([]);
  const activeLayerRef = useRef<"a" | "b">("a");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const kenBurnsStartTimerARef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const kenBurnsStartTimerBRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  const hasProvidedMedia = providedMedia && providedMedia.length > 0;
  const { data: fetchedMedia = [], isLoading: isMediaLoading } = useQuery<MediaAsset[]>({
    queryKey: ["/api/media"],
    enabled: !hasProvidedMedia,
  });
  const allMedia = hasProvidedMedia ? providedMedia : fetchedMedia;

  const baseUrl = mediaBaseUrl || "/api/media";
  const getUrl = useCallback((id: string) => {
    if (!id) return "";
    const url = `${baseUrl}/${id}/file`;
    return deviceToken ? `${url}?token=${deviceToken}` : url;
  }, [baseUrl, deviceToken]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const mediaIdsKey = JSON.stringify(mediaIds);
  useEffect(() => {
    const ids = JSON.parse(mediaIdsKey) as string[];
    const order = shuffle && ids.length > 0
      ? [...ids].sort(() => Math.random() - 0.5)
      : [...ids];
    setDisplayOrder(order);
    displayOrderRef.current = order;
    currentIndexRef.current = 0;
    setCurrentIndex(0);
    if (order.length > 0) {
      setLayerA(order[0]);
      setLayerB(order.length > 1 ? order[1] : order[0]);
      setActiveLayer("a");
      activeLayerRef.current = "a";
      setCrossfading(false);
    }
  }, [mediaIdsKey, shuffle]);

  const generateKenBurnsParams = useCallback(() => {
    if (!kenBurns) return { scale: 1, x: 0, y: 0 };
    const intensity = kenBurnsIntensity / 100;
    const scale = 1 + (0.05 + Math.random() * 0.1) * intensity;
    const maxOffset = (scale - 1) * 50;
    const x = (Math.random() * 2 - 1) * maxOffset;
    const y = (Math.random() * 2 - 1) * maxOffset;
    return { scale, x, y };
  }, [kenBurns, kenBurnsIntensity]);

  const startKenBurnsForLayer = useCallback((layer: "a" | "b") => {
    const setTarget = layer === "a" ? setKenBurnsA : setKenBurnsB;
    const timerRef = layer === "a" ? kenBurnsStartTimerARef : kenBurnsStartTimerBRef;
    if (!kenBurns) {
      setTarget({ scale: 1, x: 0, y: 0 });
      return;
    }
    setTarget({ scale: 1, x: 0, y: 0 });
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (!isMountedRef.current) return;
      setTarget(generateKenBurnsParams());
    }, 50);
  }, [generateKenBurnsParams, kenBurns]);

  useEffect(() => {
    if (!autoPlay || displayOrder.length <= 1) return;

    timerRef.current = setTimeout(() => {
      if (!isMountedRef.current) return;
      const order = displayOrderRef.current;
      const nextIdx = (currentIndexRef.current + 1) % order.length;
      const current = activeLayerRef.current;
      const next = current === "a" ? "b" : "a";

      if (next === "a") {
        setLayerA(order[nextIdx]);
      } else {
        setLayerB(order[nextIdx]);
      }

      startKenBurnsForLayer(next);

      if (transition === "none") {
        currentIndexRef.current = nextIdx;
        setCurrentIndex(nextIdx);
        setActiveLayer(next);
        activeLayerRef.current = next;
        return;
      }

      setCrossfading(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!isMountedRef.current) return;
          setActiveLayer(next);
          activeLayerRef.current = next;

          transitionTimerRef.current = setTimeout(() => {
            if (!isMountedRef.current) return;
            currentIndexRef.current = nextIdx;
            setCurrentIndex(nextIdx);
            setCrossfading(false);
          }, transitionDuration + 50);
        });
      });
    }, duration * 1000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
      if (kenBurnsStartTimerARef.current) clearTimeout(kenBurnsStartTimerARef.current);
      if (kenBurnsStartTimerBRef.current) clearTimeout(kenBurnsStartTimerBRef.current);
    };
  }, [autoPlay, displayOrder, duration, transitionDuration, currentIndex, generateKenBurnsParams, transition, startKenBurnsForLayer]);

  useEffect(() => {
    startKenBurnsForLayer("a");
  }, [startKenBurnsForLayer]);

  if (displayOrder.length === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-muted/30">
        <div className="text-center">
          <Images className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No photos selected</p>
        </div>
      </div>
    );
  }

  if (isMediaLoading) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-muted/30">
        <div className="text-center">
          <Images className="h-8 w-8 mx-auto mb-2 text-muted-foreground animate-pulse" />
          <p className="text-sm text-muted-foreground">Loading photos...</p>
        </div>
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-muted/30">
        <div className="text-center">
          <Images className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Image load failed</p>
        </div>
      </div>
    );
  }

  const urlA = getUrl(layerA);
  const urlB = getUrl(layerB);

  if (!urlA && !urlB) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-muted/30">
        <div className="text-center">
          <Images className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Media not found</p>
        </div>
      </div>
    );
  }

  const aIsActive = activeLayer === "a";

  const getLayerStyle = (isActive: boolean, isLayerA: boolean): React.CSSProperties => {
    const base: React.CSSProperties = {
      position: "absolute",
      inset: 0,
      zIndex: isActive ? 2 : 1,
      transition: crossfading ? `opacity ${transitionDuration}ms ease-in-out, transform ${transitionDuration}ms ease-in-out` : "none",
      opacity: isActive ? 1 : 0,
    };

    if (transition === "none" || transition === "fade") {
      return base;
    }

    if (!isActive && !crossfading) {
      return { ...base, opacity: 0 };
    }

    const slideOffset = "100%";
    const slideTransforms: Record<string, string> = {
      "slide-left": `translateX(${slideOffset})`,
      "slide-right": `translateX(-${slideOffset})`,
      "slide-up": `translateY(${slideOffset})`,
      "slide-down": `translateY(-${slideOffset})`,
    };

    if (slideTransforms[transition]) {
      return {
        ...base,
        transform: isActive ? "translate(0)" : slideTransforms[transition],
        opacity: isActive ? 1 : 0,
      };
    }

    if (transition === "zoom-in") {
      return { ...base, transform: isActive ? "scale(1)" : "scale(0.5)" };
    }
    if (transition === "zoom-out") {
      return { ...base, transform: isActive ? "scale(1)" : "scale(1.5)" };
    }

    return base;
  };

  const getKenBurnsStyle = (state: { scale: number; x: number; y: number }): React.CSSProperties => {
    if (!kenBurns) return {};
    return {
      transform: `scale(${state.scale}) translate(${state.x}%, ${state.y}%)`,
      transition: `transform ${duration}s ease-in-out`,
      willChange: "transform",
    };
  };

  return (
    <div className="h-full w-full relative overflow-hidden" data-testid="montage-widget" data-montage-index={currentIndex} data-montage-active={activeLayer}>
      <div style={getLayerStyle(aIsActive, true)}>
        <div className="h-full w-full" style={getKenBurnsStyle(kenBurnsA)}>
          <img
            src={urlA}
            alt=""
            className="h-full w-full"
            style={{ objectFit: fitMode, border: "none" }}
            onError={() => setHasError(true)}
          />
        </div>
      </div>
      <div style={getLayerStyle(!aIsActive, false)}>
        <div className="h-full w-full" style={getKenBurnsStyle(kenBurnsB)}>
          <img
            src={urlB}
            alt=""
            className="h-full w-full"
            style={{ objectFit: fitMode, border: "none" }}
            onError={() => setHasError(true)}
          />
        </div>
      </div>
    </div>
  );
}

function FootballTableWidget({
  league = "premier-league",
  season = "auto",
  refreshInterval = 300,
  fontSize = 14,
  showBadges = true,
  compactMode = false,
  deviceToken,
}: {
  league?: string;
  season?: string;
  refreshInterval?: number;
  fontSize?: number;
  showBadges?: boolean;
  compactMode?: boolean;
  deviceToken?: string;
}) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTable = async () => {
      try {
        setError(null);
        const baseUrl = deviceToken
          ? `/api/player/widgets/football/${league}/table`
          : `/api/widgets/football/${league}/table`;
        const params = season !== "auto" ? `?season=${season}` : "";
        const url = deviceToken
          ? `${baseUrl}${params}${params ? "&" : "?"}token=${deviceToken}`
          : `${baseUrl}${params}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        setData(json);
      } catch (err) {
        setError("Failed to load standings");
      } finally {
        setLoading(false);
      }
    };

    fetchTable();
    const interval = setInterval(fetchTable, refreshInterval * 1000);
    return () => clearInterval(interval);
  }, [league, season, refreshInterval, deviceToken]);

  if (loading) {
    return (
      <div className="h-full w-full flex items-center justify-center" data-testid="football-table-loading">
        <div className="text-center">
          <div className="animate-pulse text-muted-foreground" style={{ fontSize: `${fontSize}px` }}>Loading standings...</div>
        </div>
      </div>
    );
  }

  if (error || !data?.table) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center text-center p-2" data-testid="football-table-error">
        <p className="text-xs text-muted-foreground">{error || "No data"}</p>
      </div>
    );
  }

  const bandColors: Record<string, string> = {
    "champions-league": "#1a73e8",
    "europa-league": "#f57c00",
    "conference-league": "#43a047",
    "relegation": "#e53935",
  };

  const headerStyle: React.CSSProperties = {
    fontSize: `${Math.max(10, fontSize * 0.75)}px`,
    fontWeight: 700,
    padding: compactMode ? "2px 3px" : "4px 6px",
    textAlign: "center",
    whiteSpace: "nowrap",
    opacity: 0.6,
  };

  const cellStyle: React.CSSProperties = {
    fontSize: `${fontSize}px`,
    padding: compactMode ? "1px 3px" : "3px 6px",
    textAlign: "center",
    whiteSpace: "nowrap",
  };

  const badgeSize = compactMode ? Math.max(12, fontSize) : Math.max(16, fontSize * 1.2);

  return (
    <div className="h-full w-full overflow-auto" data-testid="football-table-widget">
      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "auto" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(128,128,128,0.3)" }}>
            <th style={{ ...headerStyle, textAlign: "center", width: "24px" }}>#</th>
            {showBadges && <th style={{ ...headerStyle, width: `${badgeSize + 4}px` }}></th>}
            <th style={{ ...headerStyle, textAlign: "left" }}>Team</th>
            <th style={headerStyle}>P</th>
            <th style={headerStyle}>W</th>
            <th style={headerStyle}>D</th>
            <th style={headerStyle}>L</th>
            {!compactMode && <th style={headerStyle}>GF</th>}
            {!compactMode && <th style={headerStyle}>GA</th>}
            <th style={headerStyle}>GD</th>
            <th style={{ ...headerStyle, fontWeight: 800 }}>Pts</th>
          </tr>
        </thead>
        <tbody>
          {data.table.map((row: any) => {
            const bandColor = bandColors[row.qualification?.band] || "transparent";
            return (
              <tr
                key={row.position}
                style={{
                  borderBottom: "1px solid rgba(128,128,128,0.15)",
                  borderLeft: `3px solid ${bandColor}`,
                }}
                data-testid={`football-row-${row.position}`}
              >
                <td style={{ ...cellStyle, fontWeight: 600, opacity: 0.7, textAlign: "center" }}>{row.position}</td>
                {showBadges && (
                  <td style={{ ...cellStyle, padding: "2px" }}>
                    {row.team.badge ? (
                      <img
                        src={row.team.badge}
                        alt={row.team.abbr}
                        style={{ width: `${badgeSize}px`, height: `${badgeSize}px`, objectFit: "contain" }}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    ) : (
                      <div style={{ width: `${badgeSize}px`, height: `${badgeSize}px` }} />
                    )}
                  </td>
                )}
                <td style={{ ...cellStyle, textAlign: "left", fontWeight: 500 }}>
                  {compactMode ? row.team.abbr : row.team.shortName}
                </td>
                <td style={cellStyle}>{row.played}</td>
                <td style={cellStyle}>{row.won}</td>
                <td style={cellStyle}>{row.drawn}</td>
                <td style={cellStyle}>{row.lost}</td>
                {!compactMode && <td style={cellStyle}>{row.goalsFor}</td>}
                {!compactMode && <td style={cellStyle}>{row.goalsAgainst}</td>}
                <td style={cellStyle}>{row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}</td>
                <td style={{ ...cellStyle, fontWeight: 700 }}>{row.points}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function QRCodeWidget({
  contentType = "url",
  content = "",
  foregroundColor = "#000000",
  backgroundColor = "#ffffff",
  transparentBackground = false,
  errorCorrection = "M",
  wifiSsid,
  wifiPassword,
  wifiEncryption = "WPA",
  locationLat,
  locationLng,
  vcardName,
  vcardPhone,
  vcardEmail,
  vcardOrg,
  label,
  labelPosition = "below",
  labelFontSize = 16,
  labelColor = "#000000",
}: {
  contentType?: "url" | "email" | "phone" | "location" | "text" | "wifi" | "vcard";
  content?: string;
  foregroundColor?: string;
  backgroundColor?: string;
  transparentBackground?: boolean;
  errorCorrection?: "L" | "M" | "Q" | "H";
  wifiSsid?: string;
  wifiPassword?: string;
  wifiEncryption?: "WPA" | "WEP" | "nopass";
  locationLat?: number;
  locationLng?: number;
  vcardName?: string;
  vcardPhone?: string;
  vcardEmail?: string;
  vcardOrg?: string;
  label?: string;
  labelPosition?: "above" | "below";
  labelFontSize?: number | string;
  labelColor?: string;
}) {
  const generateQRContent = (): string => {
    switch (contentType) {
      case "url":
        return content || "https://example.com";
      case "email":
        return content ? `mailto:${content}` : "mailto:example@example.com";
      case "phone":
        return content ? `tel:${content}` : "tel:+1234567890";
      case "location":
        if (locationLat !== undefined && locationLng !== undefined) {
          return `geo:${locationLat},${locationLng}`;
        }
        return content || "geo:0,0";
      case "wifi":
        const ssid = wifiSsid || content || "NetworkName";
        const password = wifiPassword || "";
        const encryption = wifiEncryption || "WPA";
        return `WIFI:T:${encryption};S:${ssid};P:${password};;`;
      case "vcard":
        const name = vcardName || content || "Contact Name";
        const phone = vcardPhone || "";
        const email = vcardEmail || "";
        const org = vcardOrg || "";
        return `BEGIN:VCARD\nVERSION:3.0\nN:${name}\nFN:${name}${phone ? `\nTEL:${phone}` : ""}${email ? `\nEMAIL:${email}` : ""}${org ? `\nORG:${org}` : ""}\nEND:VCARD`;
      case "text":
      default:
        return content || "Sample text";
    }
  };

  const qrContent = generateQRContent();
  const hasContent = content || wifiSsid || (locationLat !== undefined && locationLng !== undefined) || vcardName;

  if (!hasContent) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center text-center p-2">
        <QrCode 
          className="mb-1 opacity-70" 
          style={{ width: "clamp(24px, 25cqh, 64px)", height: "clamp(24px, 25cqh, 64px)" }}
        />
        <p style={{ fontSize: "clamp(10px, 3cqh, 16px)" }} className="opacity-70">QR Code</p>
        <p style={{ fontSize: "clamp(8px, 2cqh, 12px)" }} className="opacity-50">Configure content</p>
      </div>
    );
  }

  const effectiveBgColor = transparentBackground ? "transparent" : backgroundColor;
  const legacyFontSizeMap: Record<string, number> = { small: 12, medium: 16, large: 24 };
  const resolvedFontSize = typeof labelFontSize === 'number' ? labelFontSize : (legacyFontSizeMap[labelFontSize] || 16);
  const fontSize = `${resolvedFontSize}px`;

  const labelElement = label ? (
    <p 
      className="text-center font-medium" 
      style={{ 
        fontSize, 
        color: labelColor,
        marginTop: labelPosition === "below" ? "clamp(4px, 1cqh, 12px)" : 0,
        marginBottom: labelPosition === "above" ? "clamp(4px, 1cqh, 12px)" : 0,
      }}
    >
      {label}
    </p>
  ) : null;

  return (
    <div 
      className={`h-full w-full flex ${label ? "flex-col" : ""} items-center justify-center p-2`}
      style={{ backgroundColor: transparentBackground ? undefined : backgroundColor }}
    >
      {labelPosition === "above" && labelElement}
      <div className={`${label ? "flex-1 min-h-0" : "h-full"} w-full max-w-full aspect-square flex items-center justify-center`}>
        <QRCodeSVG
          value={qrContent}
          size={1000}
          bgColor={effectiveBgColor}
          fgColor={foregroundColor}
          level={errorCorrection}
          className="w-full h-full max-w-full max-h-full"
          style={{ width: "100%", height: "100%", maxWidth: "100%", maxHeight: "100%" }}
        />
      </div>
      {labelPosition === "below" && labelElement}
    </div>
  );
}

const SIGNAGE_ICONS_RENDER = [
  { id: "arrow-right", svg: '<path d="M5 12h14M12 5l7 7-7 7"/>' },
  { id: "arrow-left", svg: '<path d="M19 12H5M12 19l-7-7 7-7"/>' },
  { id: "arrow-up", svg: '<path d="M12 19V5M5 12l7-7 7 7"/>' },
  { id: "arrow-down", svg: '<path d="M12 5v14M19 12l-7 7-7-7"/>' },
  { id: "arrow-up-right", svg: '<path d="M7 17L17 7M17 7H7M17 7v10"/>' },
  { id: "arrow-up-left", svg: '<path d="M17 17L7 7M7 7h10M7 7v10"/>' },
  { id: "arrow-down-right", svg: '<path d="M7 7L17 17M17 17H7M17 17V7"/>' },
  { id: "arrow-down-left", svg: '<path d="M17 7L7 17M7 17h10M7 17V7"/>' },
  { id: "toilet", svg: '<path d="M8 2v4M16 2v4M6 6h4v3a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V6h2M14 6h4v3c0 1.7-1.3 3-3 3s-3-1.3-3-3V6M7 12v10M17 12v10"/>' },
  { id: "toilet-male", svg: '<circle cx="12" cy="4" r="2"/><path d="M15 22v-5l2-3v-4a1 1 0 0 0-1-1h-8a1 1 0 0 0-1 1v4l2 3v5"/>' },
  { id: "toilet-female", svg: '<circle cx="12" cy="4" r="2"/><path d="M14 9h-4l-1 7h2v6h2v-6h2l-1-7"/>' },
  { id: "accessible", svg: '<circle cx="11" cy="5" r="2"/><path d="M11 7v5h4l2 5M7 17a4 4 0 0 0 8 0"/>' },
  { id: "fire-exit", svg: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>' },
  { id: "fire-extinguisher", svg: '<path d="M10 2h4M12 2v4M8 6h8v3a4 4 0 0 1-4 4 4 4 0 0 1-4-4V6M9 13v7a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-7"/>' },
  { id: "warning", svg: '<path d="M12 2L2 22h20L12 2zM12 9v5M12 17h.01"/>' },
  { id: "no-entry", svg: '<circle cx="12" cy="12" r="10"/><path d="M4 12h16"/>' },
  { id: "restaurant", svg: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2M7 2v20M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>' },
  { id: "coffee", svg: '<path d="M17 8h1a4 4 0 1 1 0 8h-1M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8zM6 2v2M10 2v2M14 2v2"/>' },
  { id: "wifi", svg: '<path d="M5 12.55a11 11 0 0 1 14.08 0M1.42 9a16 16 0 0 1 21.16 0M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01"/>' },
  { id: "parking", svg: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 17V7h4a3 3 0 0 1 0 6H9"/>' },
  { id: "elevator", svg: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 16l4-4 4 4M8 8l4 4 4-4"/>' },
  { id: "stairs", svg: '<path d="M22 5h-5v5h-5v5H7v5H2"/>' },
  { id: "info", svg: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>' },
  { id: "medical", svg: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 8v8M8 12h8"/>' },
  { id: "no-smoking", svg: '<circle cx="12" cy="12" r="10"/><path d="M4.93 4.93l14.14 14.14M8 12h4M16 8v4"/>' },
  { id: "smoking", svg: '<path d="M8 17h8M3 17h2M19 13v4M15 13v4M4 17v-3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v3"/>' },
  { id: "phone", svg: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>' },
  { id: "reception", svg: '<path d="M2 18h20M6 18V8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v10M10 18v-4h4v4"/>' },
  { id: "cloakroom", svg: '<path d="M12 2a4 4 0 0 0-4 4M12 2a4 4 0 0 1 4 4M12 2v3M4 10l8-4 8 4M6 22V10M18 22V10"/>' },
];

interface ShapeWidgetProps {
  shapeType?: "line" | "rectangle" | "square" | "circle" | "oval" | "triangle" | "arch";
  fillColor?: string;
  fillEnabled?: boolean;
  strokeColor?: string;
  strokeWidth?: number;
  strokeStyle?: "solid" | "dashed" | "dotted";
  rotation?: number;
  cornerRadius?: number;
  opacity?: number;
  lineDirection?: "horizontal" | "vertical" | "diagonal-down" | "diagonal-up";
  archSpan?: number;
  alignment?: "left" | "center" | "right";
  icon?: string;
  iconColor?: string;
  iconText?: string;
  iconTextPosition?: "left" | "right" | "top" | "bottom" | "center";
  iconTextSize?: number;
  iconTextColor?: string;
}

function ScheduleWidget({
  viewMode = "hourly",
  entries = [],
  showCurrentTime = true,
  timeFormat = "24h",
  startHour = 8,
  endHour = 18,
  headerText,
}: {
  viewMode?: string;
  entries?: Array<{ id: string; title: string; startTime: string; endTime: string; day?: string; color?: string; room?: string }>;
  showCurrentTime?: boolean;
  timeFormat?: string;
  startHour?: number;
  endHour?: number;
  headerText?: string;
}) {
  const formatTime = (time: string) => {
    if (timeFormat === "12h") {
      const [h, m] = time.split(":").map(Number);
      const period = h >= 12 ? "PM" : "AM";
      const hour12 = h % 12 || 12;
      return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
    }
    return time;
  };

  const totalHours = endHour - startHour;
  const sampleEntries = entries.length > 0 ? entries : [
    { id: "1", title: "Morning Session", startTime: "09:00", endTime: "10:30", color: "#3b82f6" },
    { id: "2", title: "Lunch Break", startTime: "12:00", endTime: "13:00", color: "#22c55e" },
    { id: "3", title: "Afternoon Workshop", startTime: "14:00", endTime: "16:00", color: "#8b5cf6" },
  ];

  if (viewMode === "agenda") {
    return (
      <div className="h-full w-full flex flex-col p-3 overflow-hidden">
        {headerText && <div className="text-sm font-semibold mb-2 shrink-0">{headerText}</div>}
        <div className="flex-1 overflow-auto space-y-1">
          {[...sampleEntries].sort((a, b) => a.startTime.localeCompare(b.startTime)).map((entry) => (
            <div key={entry.id} className="flex items-center gap-2 text-xs p-1.5 rounded" style={{ borderLeft: `3px solid ${entry.color || "#3b82f6"}` }}>
              <span className="font-mono text-muted-foreground shrink-0">{formatTime(entry.startTime)} - {formatTime(entry.endTime)}</span>
              <span className="font-medium truncate">{entry.title}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (viewMode === "daily") {
    const days = [...new Set(sampleEntries.map(e => e.day || "Today").filter(Boolean))];
    if (days.length === 0) days.push("Today");
    return (
      <div className="h-full w-full flex flex-col p-3 overflow-hidden">
        {headerText && <div className="text-sm font-semibold mb-2 shrink-0">{headerText}</div>}
        <div className="flex-1 overflow-auto space-y-3">
          {days.map((day) => (
            <div key={day}>
              <div className="text-xs font-semibold text-muted-foreground mb-1">{day}</div>
              <div className="space-y-1">
                {sampleEntries
                  .filter(e => (e.day || "Today") === day)
                  .sort((a, b) => a.startTime.localeCompare(b.startTime))
                  .map((entry) => (
                    <div key={entry.id} className="flex items-center gap-2 text-xs p-1.5 rounded" style={{ borderLeft: `3px solid ${entry.color || "#3b82f6"}` }}>
                      <span className="font-mono text-muted-foreground shrink-0">{formatTime(entry.startTime)} - {formatTime(entry.endTime)}</span>
                      <span className="font-medium truncate">{entry.title}</span>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col p-2 overflow-hidden">
      {headerText && <div className="text-xs font-semibold mb-1 shrink-0">{headerText}</div>}
      <div className="flex-1 overflow-auto relative">
        {Array.from({ length: totalHours + 1 }, (_, i) => startHour + i).map((hour) => (
          <div key={hour} className="flex items-start border-t border-border/30 relative" style={{ height: `${100 / (totalHours + 1)}%`, minHeight: "24px" }}>
            <span className="text-[10px] text-muted-foreground w-10 shrink-0 -mt-1.5 font-mono">
              {formatTime(`${String(hour).padStart(2, "0")}:00`)}
            </span>
          </div>
        ))}
        {sampleEntries.map((entry) => {
          const [sh, sm] = entry.startTime.split(":").map(Number);
          const [eh, em] = entry.endTime.split(":").map(Number);
          const startOffset = ((sh - startHour) + sm / 60) / (totalHours + 1) * 100;
          const duration = ((eh - sh) + (em - sm) / 60) / (totalHours + 1) * 100;
          return (
            <div
              key={entry.id}
              className="absolute left-10 right-1 rounded text-[10px] px-1.5 py-0.5 overflow-hidden text-white font-medium"
              style={{
                top: `${startOffset}%`,
                height: `${duration}%`,
                backgroundColor: entry.color || "#3b82f6",
                minHeight: "16px",
              }}
            >
              {entry.title}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ShapeWidget({
  shapeType = "rectangle",
  fillColor = "#3b82f6",
  fillEnabled = true,
  strokeColor = "#ffffff",
  strokeWidth = 2,
  strokeStyle = "solid",
  rotation = 0,
  cornerRadius = 0,
  opacity = 100,
  lineDirection = "horizontal",
  archSpan = 180,
  alignment = "center",
  icon,
  iconColor,
  iconText,
  iconTextPosition = "right",
  iconTextSize = 14,
  iconTextColor,
}: ShapeWidgetProps) {
  const fill = fillEnabled ? fillColor : "none";
  const strokeDasharray = strokeStyle === "dashed" ? "8,4" : strokeStyle === "dotted" ? "2,4" : undefined;

  const sw = strokeWidth;
  const half = sw / 2;

  const renderShape = () => {
    switch (shapeType) {
      case "line": {
        const lineCoords = {
          "horizontal": { x1: half, y1: 50, x2: 100 - half, y2: 50 },
          "vertical": { x1: 50, y1: half, x2: 50, y2: 100 - half },
          "diagonal-down": { x1: half, y1: half, x2: 100 - half, y2: 100 - half },
          "diagonal-up": { x1: half, y1: 100 - half, x2: 100 - half, y2: half },
        };
        const coords = lineCoords[lineDirection];
        return (
          <line
            x1={coords.x1} y1={coords.y1}
            x2={coords.x2} y2={coords.y2}
            stroke={strokeColor}
            strokeWidth={sw}
            strokeDasharray={strokeDasharray}
            strokeLinecap="round"
          />
        );
      }
      case "square":
      case "rectangle":
        return (
          <rect
            x={half} y={half}
            width={100 - sw} height={100 - sw}
            rx={cornerRadius} ry={cornerRadius}
            fill={fill} stroke={strokeColor} strokeWidth={sw}
            strokeDasharray={strokeDasharray}
          />
        );
      case "circle":
        return (
          <ellipse
            cx="50" cy="50"
            rx={50 - half} ry={50 - half}
            fill={fill} stroke={strokeColor} strokeWidth={sw}
            strokeDasharray={strokeDasharray}
          />
        );
      case "oval":
        return (
          <ellipse
            cx="50" cy="50"
            rx={50 - half} ry={50 - half}
            fill={fill} stroke={strokeColor} strokeWidth={sw}
            strokeDasharray={strokeDasharray}
          />
        );
      case "triangle":
        return (
          <polygon
            points={`50,${half} ${100 - half},${100 - half} ${half},${100 - half}`}
            fill={fill} stroke={strokeColor} strokeWidth={sw}
            strokeDasharray={strokeDasharray}
            strokeLinejoin="round"
          />
        );
      case "arch": {
        const angleRad = (archSpan / 2) * (Math.PI / 180);
        const r = 50 - half;
        const cx = 50;
        const cy = 50;
        const startX = cx - r * Math.sin(angleRad);
        const startY = cy + r * Math.cos(angleRad);
        const endX = cx + r * Math.sin(angleRad);
        const endY = cy + r * Math.cos(angleRad);
        const largeArc = archSpan > 180 ? 1 : 0;
        const d = `M ${startX} ${startY} A ${r} ${r} 0 ${largeArc} 0 ${endX} ${endY}`;
        return (
          <path
            d={d}
            fill="none"
            stroke={strokeColor}
            strokeWidth={sw}
            strokeDasharray={strokeDasharray}
            strokeLinecap="round"
          />
        );
      }
      default:
        return (
          <rect
            x={half} y={half}
            width={100 - sw} height={100 - sw}
            fill={fill} stroke={strokeColor} strokeWidth={sw}
          />
        );
    }
  };

  const alignJustify = alignment === "left" ? "flex-start" : alignment === "right" ? "flex-end" : "center";

  return (
    <div className="h-full w-full relative">
      <svg
        viewBox="0 0 100 100"
        width="100%"
        height="100%"
        preserveAspectRatio="none"
        style={{
          opacity: opacity / 100,
          transform: rotation ? `rotate(${rotation}deg)` : undefined,
        }}
      >
        {renderShape()}
      </svg>
      {icon && (() => {
        const iconDef = SIGNAGE_ICONS_RENDER.find(i => i.id === icon);
        if (!iconDef) return null;
        const resolvedIconColor = iconColor || strokeColor || '#ffffff';
        const textColor = iconTextColor || strokeColor || '#ffffff';
        const hasText = iconText && iconText.trim().length > 0;
        const isCentered = iconTextPosition === "center";
        const isVertical = iconTextPosition === "top" || iconTextPosition === "bottom";
        const isReversed = iconTextPosition === "left" || iconTextPosition === "top";
        return (
          <div
            className="absolute inset-0 flex items-center"
            style={{
              pointerEvents: 'none',
              justifyContent: alignJustify,
              flexDirection: hasText && !isCentered && isVertical ? 'column' : 'row',
              gap: hasText && !isCentered ? '4px' : undefined,
              paddingLeft: alignment === "left" ? '8px' : undefined,
              paddingRight: alignment === "right" ? '8px' : undefined,
            }}
          >
            {hasText && !isCentered && isReversed && (
              <span
                style={{
                  color: textColor,
                  fontSize: `${iconTextSize}px`,
                  fontWeight: 600,
                  lineHeight: 1.2,
                  whiteSpace: 'nowrap',
                  textAlign: 'center',
                }}
                data-testid="text-shape-icon-label"
              >
                {iconText}
              </span>
            )}
            <div style={{ position: 'relative', width: hasText ? '70%' : '100%', height: hasText ? '70%' : '100%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg
                viewBox="0 0 24 24"
                style={{
                  width: '100%',
                  height: '100%',
                  maxWidth: '100%',
                  maxHeight: '100%',
                  aspectRatio: '1 / 1',
                  objectFit: 'contain',
                }}
                fill="none"
                stroke={resolvedIconColor}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                dangerouslySetInnerHTML={{ __html: iconDef.svg }}
              />
              {hasText && isCentered && (
                <span
                  style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    color: textColor,
                    fontSize: `${iconTextSize}px`,
                    fontWeight: 600,
                    lineHeight: 1.2,
                    whiteSpace: 'nowrap',
                    textAlign: 'center',
                    textShadow: `0 1px 3px rgba(0,0,0,0.5)`,
                  }}
                  data-testid="text-shape-icon-label"
                >
                  {iconText}
                </span>
              )}
            </div>
            {hasText && !isCentered && !isReversed && (
              <span
                style={{
                  color: textColor,
                  fontSize: `${iconTextSize}px`,
                  fontWeight: 600,
                  lineHeight: 1.2,
                  whiteSpace: 'nowrap',
                  textAlign: 'center',
                }}
                data-testid="text-shape-icon-label"
              >
                {iconText}
              </span>
            )}
          </div>
        );
      })()}
    </div>
  );
}

function MediaPlayerWidget({
  items = [],
  transition = "fade",
  transitionDuration = 800,
  loop = true,
  fitMode = "contain",
  autoPlay = true,
  muted = true,
  shuffle = false,
  providedMedia,
  mediaBaseUrl,
  deviceToken,
}: {
  items?: Array<{ id: string; mediaAssetId: string; duration?: number }>;
  transition?: "fade" | "slide-left" | "slide-right" | "none";
  transitionDuration?: number;
  loop?: boolean;
  fitMode?: "contain" | "cover";
  autoPlay?: boolean;
  muted?: boolean;
  shuffle?: boolean;
  providedMedia?: MediaAsset[];
  mediaBaseUrl?: string;
  deviceToken?: string;
}) {
  const hasProvidedMedia = providedMedia && providedMedia.length > 0;
  const { data: fetchedMedia = [], isLoading: isMediaLoading } = useQuery<MediaAsset[]>({
    queryKey: ["/api/media"],
    enabled: !hasProvidedMedia,
  });
  const allMedia = hasProvidedMedia ? providedMedia : fetchedMedia;

  const baseUrl = mediaBaseUrl || "/api/media";
  const getUrl = useCallback((mediaAssetId: string) => {
    if (!mediaAssetId) return "";
    const url = `${baseUrl}/${mediaAssetId}/file`;
    return deviceToken ? `${url}?token=${deviceToken}` : url;
  }, [baseUrl, deviceToken]);

  const getMediaType = useCallback((mediaAssetId: string): "image" | "video" | "gif" => {
    const asset = allMedia.find(m => m.id === mediaAssetId);
    return asset?.mediaType || "image";
  }, [allMedia]);

  const playOrder = useRef<Array<{ id: string; mediaAssetId: string; duration?: number }>>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [layerA, setLayerA] = useState<string>("");
  const [layerB, setLayerB] = useState<string>("");
  const [layerAType, setLayerAType] = useState<"image" | "video" | "gif">("image");
  const [layerBType, setLayerBType] = useState<"image" | "video" | "gif">("image");
  const [activeLayer, setActiveLayer] = useState<"a" | "b">("a");
  const [crossfading, setCrossfading] = useState(false);
  const [stopped, setStopped] = useState(false);
  const currentIndexRef = useRef(0);
  const activeLayerRef = useRef<"a" | "b">("a");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const itemsKey = JSON.stringify(items);
  useEffect(() => {
    const parsed = JSON.parse(itemsKey) as typeof items;
    const order = shuffle && parsed.length > 0
      ? [...parsed].sort(() => Math.random() - 0.5)
      : [...parsed];
    playOrder.current = order;
    currentIndexRef.current = 0;
    setCurrentIndex(0);
    setStopped(false);
    if (order.length > 0) {
      setLayerA(order[0].mediaAssetId);
      setLayerAType(getMediaType(order[0].mediaAssetId));
      if (order.length > 1) {
        setLayerB(order[1].mediaAssetId);
        setLayerBType(getMediaType(order[1].mediaAssetId));
      } else {
        setLayerB(order[0].mediaAssetId);
        setLayerBType(getMediaType(order[0].mediaAssetId));
      }
      setActiveLayer("a");
      activeLayerRef.current = "a";
      setCrossfading(false);
    }
  }, [itemsKey, shuffle, getMediaType]);

  const advanceToNext = useCallback(() => {
    if (!isMountedRef.current) return;
    const order = playOrder.current;
    if (order.length <= 1) return;

    const nextIdx = (currentIndexRef.current + 1) % order.length;

    if (nextIdx === 0 && !loop) {
      setStopped(true);
      return;
    }

    const current = activeLayerRef.current;
    const next = current === "a" ? "b" : "a";

    if (next === "a") {
      setLayerA(order[nextIdx].mediaAssetId);
      setLayerAType(getMediaType(order[nextIdx].mediaAssetId));
    } else {
      setLayerB(order[nextIdx].mediaAssetId);
      setLayerBType(getMediaType(order[nextIdx].mediaAssetId));
    }

    if (transition === "none") {
      currentIndexRef.current = nextIdx;
      setCurrentIndex(nextIdx);
      setActiveLayer(next);
      activeLayerRef.current = next;
      return;
    }

    setCrossfading(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!isMountedRef.current) return;
        setActiveLayer(next);
        activeLayerRef.current = next;

        transitionTimerRef.current = setTimeout(() => {
          if (!isMountedRef.current) return;
          currentIndexRef.current = nextIdx;
          setCurrentIndex(nextIdx);
          setCrossfading(false);
        }, transitionDuration + 50);
      });
    });
  }, [loop, transition, transitionDuration, getMediaType]);

  useEffect(() => {
    if (!autoPlay || stopped) return;
    const order = playOrder.current;
    if (order.length === 0) return;

    const currentItem = order[currentIndexRef.current];
    if (!currentItem) return;

    const mediaType = getMediaType(currentItem.mediaAssetId);
    const isVideo = mediaType === "video";

    if (isVideo) return;

    const displayDuration = (currentItem.duration || 10) * 1000;
    timerRef.current = setTimeout(() => {
      advanceToNext();
    }, displayDuration);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    };
  }, [autoPlay, stopped, currentIndex, advanceToNext, getMediaType]);

  const handleVideoEnded = useCallback(() => {
    if (!autoPlay || stopped) return;
    advanceToNext();
  }, [autoPlay, stopped, advanceToNext]);

  if (items.length === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-muted/30">
        <div className="text-center">
          <PlayCircle className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No media in playlist</p>
        </div>
      </div>
    );
  }

  if (isMediaLoading) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-muted/30">
        <div className="text-center">
          <PlayCircle className="h-8 w-8 mx-auto mb-2 text-muted-foreground animate-pulse" />
          <p className="text-sm text-muted-foreground">Loading media...</p>
        </div>
      </div>
    );
  }

  const urlA = getUrl(layerA);
  const urlB = getUrl(layerB);

  if (!urlA && !urlB) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-muted/30">
        <div className="text-center">
          <PlayCircle className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Media not found</p>
        </div>
      </div>
    );
  }

  const aIsActive = activeLayer === "a";

  const getLayerStyle = (isActive: boolean): React.CSSProperties => {
    const base: React.CSSProperties = {
      position: "absolute",
      inset: 0,
      zIndex: isActive ? 2 : 1,
      transition: crossfading ? `opacity ${transitionDuration}ms ease-in-out, transform ${transitionDuration}ms ease-in-out` : "none",
      opacity: isActive ? 1 : 0,
    };

    if (transition === "none" || transition === "fade") {
      return base;
    }

    if (!isActive && !crossfading) {
      return { ...base, opacity: 0 };
    }

    const slideOffset = "100%";
    const slideTransforms: Record<string, string> = {
      "slide-left": `translateX(${slideOffset})`,
      "slide-right": `translateX(-${slideOffset})`,
    };

    if (slideTransforms[transition]) {
      return {
        ...base,
        transform: isActive ? "translate(0)" : slideTransforms[transition],
        opacity: isActive ? 1 : 0,
      };
    }

    return base;
  };

  const renderLayer = (mediaAssetId: string, mediaType: "image" | "video" | "gif", isActive: boolean) => {
    const url = getUrl(mediaAssetId);
    if (!url) return null;

    if (mediaType === "video") {
      return (
        <video
          key={`${mediaAssetId}-${isActive ? "active" : "inactive"}`}
          src={url}
          className="h-full w-full"
          style={{ objectFit: fitMode, border: "none" }}
          autoPlay={isActive && autoPlay}
          muted={muted}
          playsInline
          onEnded={isActive ? handleVideoEnded : undefined}
        />
      );
    }

    return (
      <img
        key={mediaAssetId}
        src={url}
        alt=""
        className="h-full w-full"
        style={{ objectFit: fitMode, border: "none" }}
      />
    );
  };

  return (
    <div className="h-full w-full relative overflow-hidden" data-testid="media-player-widget" data-player-index={currentIndex} data-player-active={activeLayer}>
      <div style={getLayerStyle(aIsActive)}>
        {renderLayer(layerA, layerAType, aIsActive)}
      </div>
      <div style={getLayerStyle(!aIsActive)}>
        {renderLayer(layerB, layerBType, !aIsActive)}
      </div>
    </div>
  );
}

export interface ZoneRendererProps {
  zone: LayoutZone;
  media?: MediaAsset[];
  mediaIndex?: number;
  isPlaying?: boolean;
  showBorder?: boolean;
  playlistName?: string;
  timezone?: string;
  fillContainer?: boolean;
  mediaBaseUrl?: string;
  deviceToken?: string;
}

export function ZoneRenderer({
  zone,
  media = [],
  mediaIndex = 0,
  isPlaying = true,
  showBorder = false,
  playlistName,
  timezone,
  fillContainer = false,
  mediaBaseUrl,
  deviceToken,
}: ZoneRendererProps) {
  const ZoneIcon = zoneTypeIcons[zone.type] || Layers;

  const renderContent = () => {
    switch (zone.type) {
      case "media": {
        const zoneMedia = zone.mediaId 
          ? media.filter(m => m.id === zone.mediaId)
          : media;
        return <MediaWidget media={zoneMedia} mediaIndex={mediaIndex} isPlaying={isPlaying} mediaBaseUrl={mediaBaseUrl} deviceToken={deviceToken} />;
      }
      case "ticker":
        return <TickerWidget content={zone.textContent} speed={zone.tickerScrollSpeed} animation={zone.tickerAnimation} fontSize={zone.tickerFontSize} />;
      case "clock":
        return (
          <ClockWidget
            timezone={zone.clockTimezone || timezone}
            label={zone.clockLabel}
            style={zone.clockStyle}
            markerStyle={zone.clockMarkerStyle}
            showSecondHand={zone.clockShowSecondHand}
            showHourMarkers={zone.clockShowHourMarkers}
            showDate={zone.clockShowDate}
            handColor={zone.clockHandColor}
            faceColor={zone.clockFaceColor}
            markerColor={zone.clockMarkerColor}
            timeFontSize={zone.clockTimeFontSize}
            labelFontSize={zone.clockLabelFontSize}
            dateFontSize={zone.clockDateFontSize}
          />
        );
      case "logo":
        return <LogoWidget />;
      case "html":
        return <HtmlWidget />;
      case "weather":
        return (
          <WeatherWidget 
            lat={zone.weatherLat} 
            lng={zone.weatherLng} 
            unit={zone.weatherUnit}
            location={zone.weatherLocation}
            fontSize={zone.weatherFontSize}
          />
        );
      case "news":
        return (
          <NewsWidget 
            rssUrl={zone.newsRssUrl} 
            scrollSpeed={zone.newsScrollSpeed}
            itemCount={zone.newsItemCount}
            textSize={zone.newsTextSize}
            showHeader={showBorder}
            deviceToken={deviceToken}
          />
        );
      case "text":
        return (
          <TextWidget 
            content={zone.textContent}
            fontSize={zone.textFontSize}
            align={zone.textAlign}
            verticalAlign={zone.textVerticalAlign}
          />
        );
      case "shader":
        return (
          <ShaderWidget 
            preset={zone.shaderPreset}
            customCode={zone.shaderCode}
            speed={zone.shaderSpeed}
            variable={zone.shaderVariable}
            color1={zone.shaderColor1}
            color2={zone.shaderColor2}
          />
        );
      case "montage":
        return (
          <MontageWidget
            mediaIds={zone.montageMediaIds || []}
            duration={zone.montageDuration}
            transition={zone.montageTransition}
            transitionDuration={zone.montageTransitionDuration}
            fitMode={zone.montageFitMode}
            kenBurns={zone.montageKenBurns}
            kenBurnsIntensity={zone.montageKenBurnsIntensity}
            shuffle={zone.montageShuffle}
            autoPlay={zone.montageAutoPlay}
            providedMedia={media}
            mediaBaseUrl={mediaBaseUrl}
            deviceToken={deviceToken}
          />
        );
      case "qrcode":
        return (
          <QRCodeWidget
            contentType={zone.qrContentType}
            content={zone.qrContent}
            foregroundColor={zone.qrForegroundColor}
            backgroundColor={zone.qrBackgroundColor}
            transparentBackground={zone.qrTransparentBackground}
            errorCorrection={zone.qrErrorCorrection}
            wifiSsid={zone.qrWifiSsid}
            wifiPassword={zone.qrWifiPassword}
            wifiEncryption={zone.qrWifiEncryption}
            locationLat={zone.qrLocationLat}
            locationLng={zone.qrLocationLng}
            vcardName={zone.qrVcardName}
            vcardPhone={zone.qrVcardPhone}
            vcardEmail={zone.qrVcardEmail}
            vcardOrg={zone.qrVcardOrg}
            label={zone.qrLabel}
            labelPosition={zone.qrLabelPosition}
            labelFontSize={zone.qrLabelFontSize}
            labelColor={zone.qrLabelColor}
          />
        );
      case "countdown":
        return (
          <CountdownWidget
            targetDate={zone.countdownTargetDate}
            title={zone.countdownTitle}
            completionMessage={zone.countdownCompletionMessage}
            showDays={zone.countdownShowDays}
            showHours={zone.countdownShowHours}
            showMinutes={zone.countdownShowMinutes}
            showSeconds={zone.countdownShowSeconds}
            dayLabel={zone.countdownDayLabel}
            hourLabel={zone.countdownHourLabel}
            minuteLabel={zone.countdownMinuteLabel}
            secondLabel={zone.countdownSecondLabel}
            separator={zone.countdownSeparator}
            showLeadingZeros={zone.countdownShowLeadingZeros}
            numberColor={zone.countdownNumberColor}
            labelColor={zone.countdownLabelColor}
            size={typeof zone.countdownSize === 'number' ? zone.countdownSize : 24}
            titleSize={typeof zone.countdownTitleSize === 'number' ? zone.countdownTitleSize : undefined}
            labelSize={zone.countdownLabelSize}
            fontFamily={zone.countdownFontFamily}
            unitGap={zone.countdownUnitGap}
            timezone={zone.countdownTimezone}
            compact={zone.countdownCompact}
          />
        );
      case "schedule":
        return (
          <ScheduleWidget
            viewMode={zone.scheduleViewMode}
            entries={zone.scheduleEntries}
            showCurrentTime={zone.scheduleShowCurrentTime}
            timeFormat={zone.scheduleTimeFormat}
            startHour={zone.scheduleStartHour}
            endHour={zone.scheduleEndHour}
            headerText={zone.scheduleHeaderText}
          />
        );
      case "shape":
        return (
          <ShapeWidget
            shapeType={zone.shapeType}
            fillColor={zone.shapeFillColor}
            fillEnabled={zone.shapeFillEnabled}
            strokeColor={zone.shapeStrokeColor}
            strokeWidth={zone.shapeStrokeWidth}
            strokeStyle={zone.shapeStrokeStyle}
            rotation={zone.shapeRotation}
            cornerRadius={zone.shapeCornerRadius}
            opacity={zone.shapeOpacity}
            lineDirection={zone.shapeLineDirection}
            archSpan={zone.shapeArchSpan}
            alignment={zone.shapeAlignment}
            icon={zone.shapeIcon}
            iconColor={zone.shapeIconColor}
            iconText={zone.shapeIconText}
            iconTextPosition={zone.shapeIconTextPosition}
            iconTextSize={zone.shapeIconTextSize}
            iconTextColor={zone.shapeIconTextColor}
          />
        );
      case "media_player":
        return (
          <MediaPlayerWidget
            items={zone.mediaPlayerItems}
            transition={zone.mediaPlayerTransition}
            transitionDuration={zone.mediaPlayerTransitionDuration}
            loop={zone.mediaPlayerLoop}
            fitMode={zone.mediaPlayerFitMode}
            autoPlay={zone.mediaPlayerAutoPlay}
            muted={zone.mediaPlayerMuted}
            shuffle={zone.mediaPlayerShuffle}
            providedMedia={media}
            mediaBaseUrl={mediaBaseUrl}
            deviceToken={deviceToken}
          />
        );
      case "football_table":
        return (
          <FootballTableWidget
            league={zone.footballLeague}
            season={zone.footballSeason}
            refreshInterval={zone.footballRefreshInterval}
            fontSize={zone.footballFontSize}
            showBadges={zone.footballShowBadges}
            compactMode={zone.footballCompactMode}
            deviceToken={deviceToken}
          />
        );
      default:
        return (
          <div className="h-full w-full bg-muted/30 flex items-center justify-center">
            <ZoneIcon className="h-6 w-6 text-muted-foreground" />
          </div>
        );
    }
  };

  const gradientDirectionMap: Record<string, string> = {
    "to-t": "to top",
    "to-b": "to bottom",
    "to-l": "to left",
    "to-r": "to right",
    "to-tl": "to top left",
    "to-tr": "to top right",
    "to-bl": "to bottom left",
    "to-br": "to bottom right",
  };

  const applyOpacity = (color: string, opacity: number): string => {
    if (opacity >= 100) return color;
    const alpha = opacity / 100;
    
    if (color.startsWith("#")) {
      const hex = color.slice(1);
      let r: number, g: number, b: number;
      
      if (hex.length === 3) {
        r = parseInt(hex[0] + hex[0], 16);
        g = parseInt(hex[1] + hex[1], 16);
        b = parseInt(hex[2] + hex[2], 16);
      } else if (hex.length === 6) {
        r = parseInt(hex.slice(0, 2), 16);
        g = parseInt(hex.slice(2, 4), 16);
        b = parseInt(hex.slice(4, 6), 16);
      } else {
        return color;
      }
      
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    
    const rgbMatch = color.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
    if (rgbMatch) {
      return `rgba(${rgbMatch[1]}, ${rgbMatch[2]}, ${rgbMatch[3]}, ${alpha})`;
    }
    
    const rgbaMatch = color.match(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*[\d.]+\)$/);
    if (rgbaMatch) {
      return `rgba(${rgbaMatch[1]}, ${rgbaMatch[2]}, ${rgbaMatch[3]}, ${alpha})`;
    }
    
    return color;
  };

  const getBackgroundStyle = (): React.CSSProperties => {
    const opacity = zone.backgroundOpacity ?? 100;
    
    if (zone.gradientEnabled && zone.backgroundColor && zone.gradientEndColor) {
      const direction = gradientDirectionMap[zone.gradientDirection || "to-b"] || "to bottom";
      const startColor = applyOpacity(zone.backgroundColor, opacity);
      const endColor = applyOpacity(zone.gradientEndColor, opacity);
      return {
        background: `linear-gradient(${direction}, ${startColor}, ${endColor})`,
      };
    }
    if (zone.backgroundColor) {
      return { backgroundColor: applyOpacity(zone.backgroundColor, opacity) };
    }
    return {};
  };

  const getTextShadowStyle = (): React.CSSProperties => {
    if (zone.textShadowEnabled) {
      const blur = zone.textShadowBlur ?? 2;
      const color = zone.textShadowColor || "#000000";
      return { textShadow: `0 2px ${blur}px ${color}` };
    }
    return {};
  };

  const getTextOutlineStyle = (): React.CSSProperties => {
    if (zone.textOutlineWidth && zone.textOutlineWidth > 0) {
      const width = zone.textOutlineWidth;
      const color = zone.textOutlineColor || "#000000";
      return { 
        WebkitTextStroke: `${width}px ${color}`,
      } as React.CSSProperties;
    }
    return {};
  };

  const baseStyle: React.CSSProperties = zone.type === "shape" 
    ? { containerType: "size" as const }
    : {
        containerType: "size" as const,
        ...getBackgroundStyle(),
        ...(zone.textColor && { color: zone.textColor }),
        ...getTextShadowStyle(),
        ...getTextOutlineStyle(),
        ...(zone.borderColor && zone.borderWidth && { borderColor: zone.borderColor }),
        ...(zone.borderWidth && { borderWidth: `${zone.borderWidth}px`, borderStyle: "solid" }),
        ...(zone.borderRadius && { borderRadius: `${zone.borderRadius}px` }),
      };

  const zoneStyle: React.CSSProperties = fillContainer
    ? {
        ...baseStyle,
        inset: 0,
        width: "100%",
        height: "100%",
      }
    : {
        ...baseStyle,
        left: `${zone.x}%`,
        top: `${zone.y}%`,
        width: `${zone.width}%`,
        height: `${zone.height}%`,
        zIndex: zone.zIndex || 1,
      };

  return (
    <div
      className={`absolute ${zone.type === "shape" ? "" : "overflow-hidden"} ${showBorder && zone.type !== "shape" ? "ring-2 ring-primary/50 ring-offset-1" : ""}`}
      style={zoneStyle}
      data-testid={`zone-${zone.id}`}
    >
      {zone.backgroundVideo && (
        <video
          src={zone.backgroundVideo}
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover -z-10"
        />
      )}
      {zone.backgroundImage && !zone.backgroundVideo && (
        <div
          className="absolute inset-0 w-full h-full -z-10"
          style={{
            backgroundImage: `url(${zone.backgroundImage})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
      )}
      {renderContent()}
      {showBorder && (
        <div className="absolute top-1 left-1 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded flex items-center gap-1">
          <ZoneIcon className="h-3 w-3" />
          {zone.name}
          {playlistName && zone.type === "media" && (
            <span className="text-white/60 ml-1">({playlistName})</span>
          )}
        </div>
      )}
    </div>
  );
}

export function getAspectRatioDimensions(aspectRatio: string, customWidth?: number | null, customHeight?: number | null): { width: number; height: number } {
  switch (aspectRatio) {
    case "16:9": return { width: 16, height: 9 };
    case "9:16": return { width: 9, height: 16 };
    case "4:3": return { width: 4, height: 3 };
    case "1:1": return { width: 1, height: 1 };
    case "custom":
      return { width: customWidth || 16, height: customHeight || 9 };
    default: return { width: 16, height: 9 };
  }
}
