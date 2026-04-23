import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import GithubSlugger from "github-slugger";
import { useQuery } from "@tanstack/react-query";
import { Loader2, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";

type TocItem = {
  id: string;
  text: string;
  level: number;
};

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
            (a, b) => a.boundingClientRect.top - b.boundingClientRect.top
          )[0];
          if (top.target.id) setActiveId(top.target.id);
        }
      },
      { root: root ?? null, rootMargin: "0px 0px -70% 0px", threshold: 0 }
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

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col lg:h-[calc(100vh-3.5rem-3rem)]" data-testid="page-help">
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

      {isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground" data-testid="status-help-loading">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading manual…
        </div>
      )}

      {isError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive" data-testid="status-help-error">
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
                On this page
              </p>
              <ul className="space-y-1 text-sm">
                {toc.map((item) => (
                  <li key={`${item.id}-${item.text}`}>
                    <button
                      type="button"
                      onClick={() => handleTocClick(item.id)}
                      className={cn(
                        "block w-full truncate rounded px-2 py-1 text-left transition-colors hover:bg-accent hover:text-accent-foreground",
                        item.level === 2 && "pl-3",
                        item.level === 3 && "pl-6 text-muted-foreground",
                        activeId === item.id &&
                          "bg-accent text-accent-foreground font-medium"
                      )}
                      data-testid={`link-toc-${item.id}`}
                    >
                      {item.text}
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>

          <article
            ref={articleRef}
            className={cn(
              "prose prose-slate dark:prose-invert max-w-none",
              "min-h-0 lg:h-full lg:overflow-y-auto lg:pr-4 custom-scrollbar",
              "prose-headings:scroll-mt-4",
              "prose-h1:text-3xl prose-h2:text-2xl prose-h3:text-xl",
              "prose-h2:mt-10 prose-h2:border-b prose-h2:border-border prose-h2:pb-2",
              "prose-a:text-primary prose-code:before:content-none prose-code:after:content-none",
              "prose-code:rounded prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:text-sm",
              "prose-pre:bg-muted prose-pre:text-foreground"
            )}
            data-testid="content-help-manual"
          >
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeSlug]}
            >
              {markdown}
            </ReactMarkdown>
          </article>
        </div>
      )}
    </div>
  );
}
