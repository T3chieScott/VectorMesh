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
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import type { LayoutZone, MediaAsset } from "@shared/schema";

// Convert GCS URLs to local /objects/ path for serving through the sidecar
function getMediaUrl(originalPath: string | undefined): string {
  if (!originalPath) return "";
  
  // If already a relative path, return as is
  if (originalPath.startsWith("/objects/")) return originalPath;
  
  // Extract upload ID from GCS URL format:
  // https://storage.googleapis.com/bucket-name/.private/uploads/uuid
  // We need just the "uploads/uuid" part since PRIVATE_OBJECT_DIR already includes ".private"
  const uploadsMatch = originalPath.match(/\/uploads\/([a-f0-9-]+)$/i);
  if (uploadsMatch) {
    return `/objects/uploads/${uploadsMatch[1]}`;
  }
  
  // Fallback: try to extract anything after .private/
  const privateMatch = originalPath.match(/\.private\/(.+)/);
  if (privateMatch) {
    return `/objects/${privateMatch[1]}`;
  }
  
  // Return original if not a recognizable GCS URL
  return originalPath;
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
};

function TickerWidget({ content, speed, animation }: { content?: string; speed?: number; animation?: string }) {
  const animationDuration = speed || 20;
  const animationType = animation || "scroll-left";
  const displayContent = content || "Breaking News: Welcome to Digital Signage • Latest updates coming soon • Stay tuned for announcements •";
  
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
          <span className="text-lg font-medium shrink-0" style={{ fontSize: "max(14px, 3cqh)" }}>
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
              style={{ height: "100cqh", fontSize: "max(14px, 3cqh)" }}
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
          className="text-lg font-medium font-mono"
          style={{ fontSize: "max(14px, 3cqh)" }}
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
          className="text-lg font-medium text-center transition-opacity duration-500"
          style={{ 
            fontSize: "max(14px, 3cqh)",
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
          className="text-lg font-medium text-center transition-all duration-500"
          style={{ 
            fontSize: "max(14px, 3cqh)",
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
      <span className="text-lg font-medium" style={{ fontSize: "max(14px, 3cqh)" }}>
        {displayContent}
      </span>
    </div>
  );
}

function ClockWidget({ timezone, label }: { timezone?: string; label?: string }) {
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

  return (
    <div className="h-full w-full flex flex-col items-center justify-center text-center p-2">
      {label && (
        <div className="font-semibold opacity-90" style={{ fontSize: "max(10px, 3.5cqh)" }}>{label}</div>
      )}
      <div className="font-mono font-bold" style={{ fontSize: "max(16px, 8cqh)" }}>{formatTime(time)}</div>
      <div className="opacity-80" style={{ fontSize: "max(10px, 3cqh)" }}>{formatDate(time)}</div>
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

function ShaderWidget({ 
  preset = "gradient",
  customCode,
  speed = 1,
}: { 
  preset?: string;
  customCode?: string;
  speed?: number;
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
          vec3 col1 = vec3(0.2, 0.3, 0.8);
          vec3 col2 = vec3(0.8, 0.2, 0.5);
          vec3 color = mix(col1, col2, uv.x + sin(t + uv.y * 3.0) * 0.3);
          gl_FragColor = vec4(color, 1.0);
        }
      `,
      plasma: `
        void main() {
          vec2 uv = gl_FragCoord.xy / u_resolution.xy;
          float t = u_time * 0.5;
          float v = sin(uv.x * 10.0 + t) + sin(uv.y * 10.0 + t);
          v += sin((uv.x + uv.y) * 10.0 + t) + sin(sqrt(uv.x * uv.x + uv.y * uv.y) * 10.0);
          vec3 color = vec3(sin(v), sin(v + 2.0), sin(v + 4.0)) * 0.5 + 0.5;
          gl_FragColor = vec4(color, 1.0);
        }
      `,
      waves: `
        void main() {
          vec2 uv = gl_FragCoord.xy / u_resolution.xy;
          float t = u_time * 0.4;
          float wave = sin(uv.x * 8.0 + t) * 0.1 + sin(uv.x * 4.0 - t * 0.5) * 0.05;
          float y = uv.y - 0.5 + wave;
          vec3 sky = vec3(0.4, 0.6, 0.9);
          vec3 water = vec3(0.1, 0.3, 0.6);
          vec3 color = mix(water, sky, smoothstep(-0.1, 0.1, y));
          gl_FragColor = vec4(color, 1.0);
        }
      `,
      fire: `
        void main() {
          vec2 uv = gl_FragCoord.xy / u_resolution.xy;
          float t = u_time;
          float noise = fract(sin(dot(uv + t * 0.1, vec2(12.9898, 78.233))) * 43758.5453);
          float flame = (1.0 - uv.y) * (0.5 + noise * 0.5);
          flame *= sin(uv.x * 10.0 + t * 3.0) * 0.1 + 0.9;
          vec3 color = vec3(flame, flame * 0.4, flame * 0.1);
          gl_FragColor = vec4(color, 1.0);
        }
      `,
      rainbow: `
        void main() {
          vec2 uv = gl_FragCoord.xy / u_resolution.xy;
          float t = u_time * 0.2;
          vec3 color = 0.5 + 0.5 * cos(6.28318 * (uv.x + t + vec3(0.0, 0.33, 0.67)));
          gl_FragColor = vec4(color, 1.0);
        }
      `,
    };

    const fragmentShaderSource = `
      precision mediump float;
      uniform float u_time;
      uniform vec2 u_resolution;
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

    const render = () => {
      resizeCanvas();
      gl.useProgram(program);
      gl.enableVertexAttribArray(positionLocation);
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
      const elapsed = (Date.now() - startTimeRef.current) / 1000 * speed;
      gl.uniform1f(timeLocation, elapsed);
      gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      animationRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [preset, customCode, speed]);

  return <canvas ref={canvasRef} className="w-full h-full" />;
}

function TextWidget({ 
  content,
  fontSize = "medium",
  align = "center",
  verticalAlign = "middle",
}: { 
  content?: string;
  fontSize?: string;
  align?: string;
  verticalAlign?: string;
}) {
  const fontSizeMap: Record<string, string> = {
    small: "max(12px, 3cqh)",
    medium: "max(16px, 5cqh)",
    large: "max(24px, 8cqh)",
    xlarge: "max(32px, 12cqh)",
  };

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
        fontSize: fontSizeMap[fontSize] || fontSizeMap.medium,
        textAlign: align as "left" | "center" | "right",
      }}
    >
      {content || "Sample text content"}
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
}: { 
  lat?: number;
  lng?: number;
  unit?: string;
  location?: string;
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

  return (
    <div className="h-full w-full flex flex-col items-center justify-center text-center p-1">
      <WeatherIcon className="mb-1" style={{ width: "max(16px, 6cqh)", height: "max(16px, 6cqh)" }} />
      <div className="font-bold" style={{ fontSize: "max(14px, 6cqh)" }}>
        {weather.temperature}°{unit === "fahrenheit" ? "F" : "C"}
      </div>
      {location && (
        <div className="text-muted-foreground truncate w-full" style={{ fontSize: "max(8px, 2cqh)" }}>
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
  textSize = "medium",
  showHeader = true,
}: { 
  rssUrl?: string;
  scrollSpeed?: number;
  itemCount?: number;
  textSize?: string;
  showHeader?: boolean;
}) {
  const [news, setNews] = useState<{ title: string; link: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const textSizeMap: Record<string, string> = {
    small: "max(10px, 3cqh)",
    medium: "max(14px, 4cqh)",
    large: "max(18px, 5cqh)",
  };

  useEffect(() => {
    const fetchNews = async () => {
      if (!rssUrl) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const response = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}&count=${itemCount}`);
        if (!response.ok) throw new Error("RSS fetch failed");
        
        const data = await response.json();
        if (data.items) {
          setNews(data.items.slice(0, itemCount).map((item: { title: string; link: string }) => ({
            title: item.title,
            link: item.link,
          })));
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
    
    // Use actual rendered scroll width for accurate timing
    // Speed affects pixels-per-second: Speed 1 = 10px/s, Speed 100 = 300px/s
    const clampedSpeed = Math.max(1, Math.min(100, scrollSpeed));
    const pixelsPerSecond = 10 + (clampedSpeed - 1) * 2.9; // Linear scale from 10 to 300 px/s
    const scrollWidth = scrollRef.current.scrollWidth || 500; // Fallback if not rendered yet
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
        className="animate-marquee whitespace-nowrap" 
        style={{ fontSize: textSizeMap[textSize] || textSizeMap.medium }}
      >
        {newsText} •
      </div>
    </div>
  );
}

function MediaWidget({
  media,
  mediaIndex,
  isPlaying,
}: {
  media: MediaAsset[];
  mediaIndex: number;
  isPlaying: boolean;
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

  const mediaUrl = getMediaUrl(currentMedia.originalPath);
  
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
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [displayOrder, setDisplayOrder] = useState<string[]>(mediaIds);
  const [kenBurnsState, setKenBurnsState] = useState({ scale: 1, x: 0, y: 0 });
  const [hasError, setHasError] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  const { data: allMedia = [], isLoading: isMediaLoading } = useQuery<MediaAsset[]>({
    queryKey: ["/api/media"],
  });

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (shuffle && mediaIds.length > 0) {
      const shuffled = [...mediaIds].sort(() => Math.random() - 0.5);
      setDisplayOrder(shuffled);
    } else {
      setDisplayOrder(mediaIds);
    }
    setCurrentIndex(0);
  }, [mediaIds, shuffle]);

  const generateKenBurnsParams = useCallback(() => {
    if (!kenBurns) return { scale: 1, x: 0, y: 0 };
    
    const intensity = kenBurnsIntensity / 100;
    const scale = 1 + (0.05 + Math.random() * 0.1) * intensity;
    const maxOffset = (scale - 1) * 50;
    const x = (Math.random() * 2 - 1) * maxOffset;
    const y = (Math.random() * 2 - 1) * maxOffset;
    
    return { scale, x, y };
  }, [kenBurns, kenBurnsIntensity]);

  useEffect(() => {
    if (!autoPlay || displayOrder.length <= 1) return;

    const scheduleNext = () => {
      timerRef.current = setTimeout(() => {
        if (!isMountedRef.current) return;
        
        setIsTransitioning(true);
        
        transitionTimerRef.current = setTimeout(() => {
          if (!isMountedRef.current) return;
          
          setCurrentIndex((prev) => (prev + 1) % displayOrder.length);
          setKenBurnsState(generateKenBurnsParams());
          setIsTransitioning(false);
          
          scheduleNext();
        }, transitionDuration);
      }, duration * 1000);
    };

    scheduleNext();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    };
  }, [autoPlay, displayOrder.length, duration, transitionDuration, generateKenBurnsParams]);

  useEffect(() => {
    setKenBurnsState(generateKenBurnsParams());
  }, [generateKenBurnsParams]);

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

  const currentMediaId = displayOrder[currentIndex];
  const nextIndex = (currentIndex + 1) % displayOrder.length;
  const nextMediaId = displayOrder[nextIndex];

  const getMontageMediaUrl = (id: string) => {
    const asset = allMedia.find(m => m.id === id);
    return getMediaUrl(asset?.originalPath);
  };

  const getTransitionStyle = (isActive: boolean, isNext: boolean): React.CSSProperties => {
    const base: React.CSSProperties = {
      position: "absolute",
      inset: 0,
      transition: `all ${transitionDuration}ms ease-in-out`,
    };

    if (transition === "none") {
      return { ...base, opacity: isActive ? 1 : 0 };
    }

    if (transition === "fade") {
      return {
        ...base,
        opacity: isActive ? (isTransitioning ? 0 : 1) : (isNext && isTransitioning ? 1 : 0),
      };
    }

    const slideOffset = "100%";
    const transforms: Record<string, { active: string; next: string }> = {
      "slide-left": { active: `translateX(-${slideOffset})`, next: `translateX(${slideOffset})` },
      "slide-right": { active: `translateX(${slideOffset})`, next: `translateX(-${slideOffset})` },
      "slide-up": { active: `translateY(-${slideOffset})`, next: `translateY(${slideOffset})` },
      "slide-down": { active: `translateY(${slideOffset})`, next: `translateY(-${slideOffset})` },
    };

    if (transforms[transition]) {
      const t = transforms[transition];
      return {
        ...base,
        transform: isActive 
          ? (isTransitioning ? t.active : "translate(0)")
          : (isNext ? (isTransitioning ? "translate(0)" : t.next) : t.next),
        opacity: isActive || (isNext && isTransitioning) ? 1 : 0,
      };
    }

    if (transition === "zoom-in" || transition === "zoom-out") {
      const zoomScale = transition === "zoom-in" ? 1.5 : 0.5;
      return {
        ...base,
        transform: isActive 
          ? (isTransitioning ? `scale(${zoomScale})` : "scale(1)")
          : (isNext ? (isTransitioning ? "scale(1)" : `scale(${1/zoomScale})`) : "scale(1)"),
        opacity: isActive ? (isTransitioning ? 0 : 1) : (isNext && isTransitioning ? 1 : 0),
      };
    }

    return base;
  };

  const getKenBurnsStyle = (): React.CSSProperties => {
    if (!kenBurns) return {};
    return {
      transform: `scale(${kenBurnsState.scale}) translate(${kenBurnsState.x}%, ${kenBurnsState.y}%)`,
      transition: `transform ${duration}s ease-in-out`,
    };
  };

  const currentUrl = getMontageMediaUrl(currentMediaId);
  const nextUrl = getMontageMediaUrl(nextMediaId);

  if (!currentUrl) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-muted/30">
        <div className="text-center">
          <Images className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Media not found</p>
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

  return (
    <div className="h-full w-full relative overflow-hidden">
      <div style={getTransitionStyle(true, false)}>
        <div className="h-full w-full" style={getKenBurnsStyle()}>
          <img
            src={currentUrl}
            alt=""
            className="h-full w-full"
            style={{ objectFit: fitMode, border: "none" }}
            onError={() => setHasError(true)}
          />
        </div>
      </div>
      {displayOrder.length > 1 && nextUrl && (
        <div style={getTransitionStyle(false, true)}>
          <img
            src={nextUrl}
            alt=""
            className="h-full w-full"
            style={{ objectFit: fitMode, border: "none" }}
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.style.display = "none";
            }}
          />
        </div>
      )}
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
  labelFontSize = "medium",
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
  labelFontSize?: "small" | "medium" | "large";
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
  const fontSizeMap = { small: "clamp(10px, 2cqh, 14px)", medium: "clamp(12px, 3cqh, 18px)", large: "clamp(14px, 4cqh, 24px)" };
  const fontSize = fontSizeMap[labelFontSize] || fontSizeMap.medium;

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

export interface ZoneRendererProps {
  zone: LayoutZone;
  media?: MediaAsset[];
  mediaIndex?: number;
  isPlaying?: boolean;
  showBorder?: boolean;
  playlistName?: string;
  timezone?: string;
  fillContainer?: boolean;
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
}: ZoneRendererProps) {
  const ZoneIcon = zoneTypeIcons[zone.type] || Layers;

  const renderContent = () => {
    switch (zone.type) {
      case "media": {
        // If zone has a specific mediaId, filter to show only that media
        const zoneMedia = zone.mediaId 
          ? media.filter(m => m.id === zone.mediaId)
          : media;
        return <MediaWidget media={zoneMedia} mediaIndex={mediaIndex} isPlaying={isPlaying} />;
      }
      case "ticker":
        return <TickerWidget content={zone.textContent} speed={zone.tickerScrollSpeed} animation={zone.tickerAnimation} />;
      case "clock":
        return <ClockWidget timezone={zone.clockTimezone || timezone} label={zone.clockLabel} />;
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

  const baseStyle: React.CSSProperties = {
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
      className={`absolute overflow-hidden ${showBorder ? "ring-2 ring-primary/50 ring-offset-1" : ""}`}
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
