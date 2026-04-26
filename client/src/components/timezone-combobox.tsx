import { forwardRef, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { describeTzOffset, isValidTimezone } from "@shared/timezone-utils";
import { cn } from "@/lib/utils";

// Get the list of IANA zones once at module load. Older browsers (and a
// handful of older Node runtimes used during dev SSR) don't expose
// `Intl.supportedValuesOf`; in that case we fall back to a small popular
// list so the combobox still works.
function listTimezones(): string[] {
  const intlAny = Intl as unknown as {
    supportedValuesOf?: (key: string) => string[];
  };
  if (typeof intlAny.supportedValuesOf === "function") {
    return intlAny.supportedValuesOf("timeZone");
  }
  return [
    "UTC",
    "Europe/London",
    "Europe/Paris",
    "America/New_York",
    "America/Los_Angeles",
    "Asia/Tokyo",
    "Asia/Singapore",
    "Australia/Sydney",
  ];
}
const TIMEZONE_OPTIONS = listTimezones();

// Sentinel cmdk value for the optional "no timezone" entry. cmdk requires a
// non-empty `value` on every CommandItem so it can be filtered/searched, but
// we still want the form field to receive an empty string when picked.
const EMPTY_SENTINEL = "__empty__";

export interface TimezoneComboboxProps
  extends Omit<
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    "value" | "onChange"
  > {
  value: string;
  onChange: (next: string) => void;
  testId?: string;
  /** Override the trigger placeholder shown when `value` is empty. */
  placeholder?: string;
  /**
   * Render an extra item at the top of the list that resolves to an empty
   * string, e.g. "Local time (device timezone)". When provided, an empty
   * `value` is treated as that option being selected.
   */
  emptyOption?: { label: string };
}

// We accept `forwardRef` + spread `...rest` props so shadcn's `<FormControl>`
// (which uses Radix `Slot` under the hood) can inject `id`,
// `aria-describedby`, `aria-invalid` and the focus ref onto the trigger
// button. Without this, label/description/error association is silently
// dropped.
export const TimezoneCombobox = forwardRef<
  HTMLButtonElement,
  TimezoneComboboxProps
>(function TimezoneCombobox(
  { value, onChange, testId, placeholder, emptyOption, className, ...rest },
  ref,
) {
  const [open, setOpen] = useState(false);
  const offset = isValidTimezone(value)
    ? describeTzOffset(new Date(), value)
    : "";
  const triggerLabel = value
    ? `${value}${offset ? ` — ${offset}` : ""}`
    : emptyOption?.label ?? placeholder ?? "Select timezone";
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          {...rest}
          ref={ref}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between font-normal",
            className,
          )}
          data-testid={testId ?? "button-timezone"}
        >
          <span className="truncate">{triggerLabel}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command>
          <CommandInput
            placeholder="Search timezone…"
            data-testid="input-timezone-search"
          />
          <CommandList>
            <CommandEmpty>No timezone found.</CommandEmpty>
            <CommandGroup>
              {emptyOption ? (
                <CommandItem
                  key={EMPTY_SENTINEL}
                  value={EMPTY_SENTINEL}
                  // cmdk filters by `value`, not by visible children, so we
                  // attach searchable keywords (the label, plus common
                  // synonyms) so typing "local" / "browser" / "device"
                  // surfaces this option.
                  keywords={[emptyOption.label, "local", "browser", "device"]}
                  onSelect={() => {
                    onChange("");
                    setOpen(false);
                  }}
                  data-testid="option-timezone-empty"
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === "" ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {emptyOption.label}
                </CommandItem>
              ) : null}
              {TIMEZONE_OPTIONS.map((tz) => (
                <CommandItem
                  key={tz}
                  value={tz}
                  onSelect={(selected) => {
                    onChange(selected);
                    setOpen(false);
                  }}
                  data-testid={`option-timezone-${tz}`}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === tz ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {tz}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
});
