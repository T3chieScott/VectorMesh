import {
  Fragment,
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import GithubSlugger from "github-slugger";
import { useQuery } from "@tanstack/react-query";
import {
  Loader2,
  BookOpen,
  Search,
  X,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type TocItem = {
  id: string;
  text: string;
  level: number;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractToc(markdown: string): TocItem[] {
  const lines = markdown.split("\n");
  const items: TocItem[] = [];
  const slugger = new GithubSlugger();
  let inFence = false;
  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = /^(#{1,3})\s+(.+?)\s*$/.exec(line);
    if (!match) continue;
    const level = match[1].length;
    const text = match[2].replace(/`/g, "").trim();
    items.push({ id: slugger.slug(text), text, level });
  }
  return items;
}

function findMatchingSections(markdown: string, query: string): Set<string> {
  const ids = new Set<string>();
  if (!query) return ids;
  const regex = new RegExp(escapeRegExp(query), "i");
  const slugger = new GithubSlugger();
  const lines = markdown.split("\n");
  let inFence = false;
  let currentId: string | null = null;
  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const headingMatch = /^(#{1,3})\s+(.+?)\s*$/.exec(line);
    if (headingMatch) {
      const text = headingMatch[2].replace(/`/g, "").trim();
      currentId = slugger.slug(text);
      if (regex.test(text) && currentId) ids.add(currentId);
      continue;
    }
    if (currentId && line.trim() && regex.test(line)) ids.add(currentId);
  }
  return ids;
}

function splitWithMarks(text: string, regex: RegExp): ReactNode {
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  regex.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(
      <mark
        key={`mark-${key++}`}
        className="search-match rounded bg-yellow-200 px-0.5 text-foreground dark:bg-yellow-500/40"
      >
        {match[0]}
      </mark>,
    );
    lastIndex = match.index + match[0].length;
    if (match[0].length === 0) regex.lastIndex++;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts.length === 0 ? text : parts;
}

function highlightChildren(children: ReactNode, regex: RegExp | null): ReactNode {
  if (!regex) return children;
  if (children == null || typeof children === "boolean") return children;
  if (typeof children === "string") return splitWithMarks(children, regex);
  if (typeof children === "number") return children;
  if (Array.isArray(children)) {
    return children.map((child, index) => (
      <Fragment key={index}>{highlightChildren(child, regex)}</Fragment>
    ));
  }
  if (isValidElement<{ children?: ReactNode }>(children)) {
    if (children.type === "code" || children.type === "pre") return children;
    return cloneElement(
      children,
      undefined,
      highlightChildren(children.props.children, regex),
    );
  }
  return children;
}

function buildHighlightComponents(regex: RegExp): Components {
  const wrap = (children: ReactNode) => highlightChildren(children, regex);
  return {
    p: ({ node: _node, children, ...rest }) => <p {...rest}>{wrap(children)}</p>,
    li: ({ node: _node, children, ...rest }) => <li {...rest}>{wrap(children)}</li>,
    td: ({ node: _node, children, ...rest }) => <td {...rest}>{wrap(children)}</td>,
    th: ({ node: _node, children, ...rest }) => <th {...rest}>{wrap(children)}</th>,
    h1: ({ node: _node, children, ...rest }) => <h1 {...rest}>{wrap(children)}</h1>,
    h2: ({ node: _node, children, ...rest }) => <h2 {...rest}>{wrap(children)}</h2>,
    h3: ({ node: _node, children, ...rest }) => <h3 {...rest}>{wrap(children)}</h3>,
    h4: ({ node: _node, children, ...rest }) => <h4 {...rest}>{wrap(children)}</h4>,
    h5: ({ node: _node, children, ...rest }) => <h5 {...rest}>{wrap(children)}</h5>,
    h6: ({ node: _node, children, ...rest }) => <h6 {...rest}>{wrap(children)}</h6>,
    blockquote: ({ node: _node, children, ...rest }) => (
      <blockquote {...rest}>{wrap(children)}</blockquote>
    ),
    strong: ({ node: _node, children, ...rest }) => (
      <strong {...rest}>{wrap(children)}</strong>
    ),
    em: ({ node: _node, children, ...rest }) => <em {...rest}>{wrap(children)}</em>,
    a: ({ node: _node, children, ...rest }) => <a {...rest}>{wrap(children)}</a>,
  };
}

export default function HelpPage() {
  const { data: markdown, isLoading, isError } = useQuery<string>({
    queryKey: ["/api/manual"],
    queryFn: async () => {
      const res = await fetch("/api/manual");
      if (!res.ok) throw new Error("Failed to load manual");
      return res.text();
    },
    staleTime: 1000 * 60 * 10,
  });

  const toc = useMemo(() => (markdown ? extractToc(markdown) : []), [markdown]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const articleRef = useRef<HTMLElement | null>(null);

  const [rawQuery, setRawQuery] = useState("");
  const [query, setQuery] = useState("");
  const [matchCount, setMatchCount] = useState(0);
  const [matchIndex, setMatchIndex] = useState(0);
  const hasNavigatedRef = useRef(false);

  // Debounce input updates so typing stays smooth on a long manual.
  useEffect(() => {
    const trimmed = rawQuery.trim();
    const handle = setTimeout(() => setQuery(trimmed), 120);
    return () => clearTimeout(handle);
  }, [rawQuery]);

  const highlightRegex = useMemo(() => {
    if (!query) return null;
    return new RegExp(escapeRegExp(query), "gi");
  }, [query]);

  const matchingSections = useMemo(
    () => (markdown ? findMatchingSections(markdown, query) : new Set<string>()),
    [markdown, query],
  );

  const filteredToc = useMemo(() => {
    if (!query) return toc;
    return toc.filter((item) => matchingSections.has(item.id));
  }, [toc, matchingSections, query]);

  const markdownComponents = useMemo<Components | undefined>(
    () => (highlightRegex ? buildHighlightComponents(highlightRegex) : undefined),
    [highlightRegex],
  );

  const updateActiveMark = useCallback((index: number, scroll: boolean) => {
    const root = articleRef.current;
    if (!root) return;
    const marks = root.querySelectorAll<HTMLElement>("mark.search-match");
    if (marks.length === 0) return;
    const safe = ((index % marks.length) + marks.length) % marks.length;
    marks.forEach((mark, i) => {
      mark.classList.toggle("search-match-current", i === safe);
    });
    if (scroll) {
      marks[safe].scrollIntoView({ behavior: "smooth", block: "center" });
    }
    setMatchIndex(safe);
  }, []);

  // Recount matches whenever the rendered output changes.
  useEffect(() => {
    const root = articleRef.current;
    if (!root) {
      setMatchCount(0);
      setMatchIndex(0);
      return;
    }
    if (!query) {
      setMatchCount(0);
      setMatchIndex(0);
      hasNavigatedRef.current = false;
      return;
    }
    // Wait for ReactMarkdown to commit the new tree.
    const handle = window.setTimeout(() => {
      const marks = root.querySelectorAll<HTMLElement>("mark.search-match");
      setMatchCount(marks.length);
      hasNavigatedRef.current = false;
      setMatchIndex(0);
      if (marks.length > 0) updateActiveMark(0, false);
    }, 0);
    return () => window.clearTimeout(handle);
  }, [query, markdown, updateActiveMark]);

  const goToMatch = useCallback(
    (direction: 1 | -1) => {
      if (matchCount === 0) return;
      if (!hasNavigatedRef.current) {
        hasNavigatedRef.current = true;
        updateActiveMark(0, true);
        return;
      }
      updateActiveMark(matchIndex + direction, true);
    },
    [matchCount, matchIndex, updateActiveMark],
  );

  useEffect(() => {
    if (!markdown) return;
    const hash = window.location.hash.replace(/^#/, "");
    if (!hash) return;
    const tryScroll = (attempt = 0) => {
      const el = document.getElementById(hash);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        setActiveId(hash);
      } else if (attempt < 20) {
        setTimeout(() => tryScroll(attempt + 1), 50);
      }
    };
    tryScroll();
  }, [markdown]);

  useEffect(() => {
    if (!markdown || toc.length === 0) return;
    const root = articleRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) {
          const top = visible.sort(
            (a, b) => a.boundingClientRect.top - b.boundingClientRect.top,
          )[0];
          if (top.target.id) setActiveId(top.target.id);
        }
      },
      { root: root ?? null, rootMargin: "0px 0px -70% 0px", threshold: 0 },
    );
    const observed: HTMLElement[] = [];
    toc.forEach((item) => {
      const el = document.getElementById(item.id);
      if (el) {
        observer.observe(el);
        observed.push(el);
      }
    });
    return () => {
      observed.forEach((el) => observer.unobserve(el));
      observer.disconnect();
    };
  }, [markdown, toc]);

  const handleTocClick = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      window.history.replaceState(null, "", `#${id}`);
      setActiveId(id);
    }
  };

  const findEnclosingHeadingId = (mark: HTMLElement): string | null => {
    if (!articleRef.current) return null;
    // Walk up to the article-level block ancestor, then iterate previous
    // siblings until we find an h1/h2/h3 with an id (assigned by rehype-slug).
    let block: HTMLElement | null = mark;
    while (block && block.parentElement && block.parentElement !== articleRef.current) {
      block = block.parentElement;
    }
    let cursor: Element | null = block;
    while (cursor) {
      if (
        cursor instanceof HTMLElement &&
        cursor.id &&
        (cursor.tagName === "H1" ||
          cursor.tagName === "H2" ||
          cursor.tagName === "H3")
      ) {
        return cursor.id;
      }
      cursor = cursor.previousElementSibling;
    }
    return null;
  };

  const handleArticleClick = (event: MouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement | null;
    const mark = target?.closest<HTMLElement>("mark.search-match");
    if (!mark || !articleRef.current) return;
    const marks = articleRef.current.querySelectorAll<HTMLElement>(
      "mark.search-match",
    );
    const index = Array.prototype.indexOf.call(marks, mark);
    if (index < 0) return;
    hasNavigatedRef.current = true;
    updateActiveMark(index, true);
    const headingId = findEnclosingHeadingId(mark);
    if (headingId) {
      window.history.replaceState(null, "", `#${headingId}`);
      setActiveId(headingId);
    }
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      goToMatch(event.shiftKey ? -1 : 1);
    } else if (event.key === "Escape" && rawQuery) {
      event.preventDefault();
      setRawQuery("");
    }
  };

  const clearSearch = () => {
    setRawQuery("");
  };

  const showSearchStatus = query.length > 0;

  return (
    <div
      className="mx-auto flex w-full max-w-7xl flex-col lg:h-[calc(100vh-3.5rem-3rem)]"
      data-testid="page-help"
    >
      <div className="mb-6 flex shrink-0 items-center gap-3">
        <BookOpen className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-help-title">
            Operating Manual
          </h1>
          <p className="text-sm text-muted-foreground">
            Reference guide for VectorMesh operators and admins.
          </p>
        </div>
      </div>

      {markdown && (
        <div className="mb-4 flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={rawQuery}
              onChange={(event) => setRawQuery(event.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search the manual (e.g. preset, two-factor, snapshot)…"
              className="pl-9 pr-10"
              aria-label="Search the operating manual"
              data-testid="input-help-search"
            />
            {rawQuery && (
              <button
                type="button"
                onClick={clearSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                aria-label="Clear search"
                data-testid="button-help-search-clear"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {showSearchStatus && (
            <div
              className="flex items-center gap-2 text-sm text-muted-foreground"
              data-testid="status-help-search"
            >
              <span data-testid="text-help-search-count">
                {matchCount === 0
                  ? "No matches"
                  : `${hasNavigatedRef.current ? matchIndex + 1 : 1} of ${matchCount} ${matchCount === 1 ? "match" : "matches"}`}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => goToMatch(-1)}
                  disabled={matchCount === 0}
                  aria-label="Previous match"
                  data-testid="button-help-search-prev"
                >
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => goToMatch(1)}
                  disabled={matchCount === 0}
                  aria-label="Next match"
                  data-testid="button-help-search-next"
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {isLoading && (
        <div
          className="flex items-center gap-2 text-muted-foreground"
          data-testid="status-help-loading"
        >
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading manual…
        </div>
      )}

      {isError && (
        <div
          className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
          data-testid="status-help-error"
        >
          Could not load the operating manual. Please try refreshing the page.
        </div>
      )}

      {markdown && (
        <div className="grid min-h-0 flex-1 gap-8 lg:grid-cols-[16rem_minmax(0,1fr)] lg:overflow-hidden">
          <aside className="hidden min-h-0 lg:block lg:overflow-hidden">
            <nav
              className="h-full overflow-y-auto pr-2 custom-scrollbar"
              data-testid="nav-help-toc"
            >
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {query ? "Matching sections" : "On this page"}
              </p>
              {query && filteredToc.length === 0 ? (
                <p
                  className="px-2 py-1 text-sm text-muted-foreground"
                  data-testid="text-help-toc-empty"
                >
                  No sections match.
                </p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {filteredToc.map((item) => (
                    <li key={`${item.id}-${item.text}`}>
                      <button
                        type="button"
                        onClick={() => handleTocClick(item.id)}
                        className={cn(
                          "block w-full truncate rounded px-2 py-1 text-left transition-colors hover:bg-accent hover:text-accent-foreground",
                          item.level === 2 && "pl-3",
                          item.level === 3 && "pl-6 text-muted-foreground",
                          activeId === item.id &&
                            "bg-accent text-accent-foreground font-medium",
                        )}
                        data-testid={`link-toc-${item.id}`}
                      >
                        {item.text}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </nav>
          </aside>

          <article
            ref={articleRef}
            onClick={handleArticleClick}
            className={cn(
              "prose prose-slate dark:prose-invert max-w-none",
              "min-h-0 lg:h-full lg:overflow-y-auto lg:pr-4 custom-scrollbar",
              "prose-headings:scroll-mt-4",
              "prose-h1:text-3xl prose-h2:text-2xl prose-h3:text-xl",
              "prose-h2:mt-10 prose-h2:border-b prose-h2:border-border prose-h2:pb-2",
              "prose-a:text-primary prose-code:before:content-none prose-code:after:content-none",
              "prose-code:rounded prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:text-sm",
              "prose-pre:bg-muted prose-pre:text-foreground",
            )}
            data-testid="content-help-manual"
          >
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeSlug]}
              components={markdownComponents}
            >
              {markdown}
            </ReactMarkdown>
          </article>
        </div>
      )}
    </div>
  );
}
