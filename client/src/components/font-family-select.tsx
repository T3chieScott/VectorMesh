import { useQuery } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BUILTIN_FONTS,
  customFontKey,
  resolveFontStack,
  type BuiltInFont,
} from "@shared/fonts";
import type { CustomFont } from "@shared/schema";

// Select can't use an empty-string value, so the "inherit / default"
// choice uses this sentinel which maps back to "" on change.
const DEFAULT_VALUE = "__default__";

const GROUP_ORDER: BuiltInFont["group"][] = [
  "Sans-serif",
  "Serif",
  "Monospace",
  "Handwriting",
];

interface FontFamilySelectProps {
  value: string | null | undefined;
  onChange: (value: string) => void;
  clientId?: string | null;
  // Label shown for the empty/default option.
  defaultLabel?: string;
  "data-testid"?: string;
}

// Shared font picker used by both the agenda config editor and the
// layout text-zone editor. Lists the built-in library (grouped) plus
// any per-client uploaded fonts. Each option previews itself in its own
// font so operators can see what they're choosing.
export function FontFamilySelect({
  value,
  onChange,
  clientId,
  defaultLabel = "Default",
  "data-testid": testId,
}: FontFamilySelectProps) {
  const { data: customFonts = [] } = useQuery<CustomFont[]>({
    queryKey: ["/api/fonts", clientId],
    queryFn: async () => {
      const res = await fetch(`/api/fonts?clientId=${encodeURIComponent(clientId!)}`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!clientId,
  });

  const selectValue = value ? value : DEFAULT_VALUE;

  const grouped = GROUP_ORDER.map((group) => ({
    group,
    fonts: BUILTIN_FONTS.filter((f) => f.group === group),
  }));

  return (
    <Select
      value={selectValue}
      onValueChange={(v) => onChange(v === DEFAULT_VALUE ? "" : v)}
    >
      <SelectTrigger data-testid={testId}>
        <SelectValue placeholder={defaultLabel} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={DEFAULT_VALUE}>{defaultLabel}</SelectItem>
        {customFonts.length > 0 && (
          <SelectGroup>
            <SelectLabel>Your uploaded fonts</SelectLabel>
            {customFonts.map((f) => (
              <SelectItem
                key={f.id}
                value={customFontKey(f.id)}
                style={{ fontFamily: resolveFontStack(customFontKey(f.id)) }}
              >
                {f.name}
              </SelectItem>
            ))}
          </SelectGroup>
        )}
        {grouped.map(({ group, fonts }) => (
          <SelectGroup key={group}>
            <SelectLabel>{group}</SelectLabel>
            {fonts.map((f) => (
              <SelectItem
                key={f.key}
                value={f.key}
                style={{ fontFamily: f.stack }}
              >
                {f.label}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
