import React, { useRef, useState } from "react";

export function HtmlWidgetSubframe({
  srcDoc,
  width,
  height,
  preparing,
}: {
  srcDoc: string;
  width: number;
  height: number;
  preparing: boolean;
}) {
  const desiredSrcDocRef = useRef(srcDoc);
  desiredSrcDocRef.current = srcDoc;
  const [activeSrcDoc, setActiveSrcDoc] = useState<string | null>(null);
  const documents = activeSrcDoc && activeSrcDoc !== srcDoc
    ? [activeSrcDoc, srcDoc]
    : [srcDoc];

  return (
    <>
      {documents.map((documentSrcDoc) => {
        const desired = documentSrcDoc === srcDoc;
        const loaded = documentSrcDoc === activeSrcDoc;
        const visible = !preparing && loaded;
        return (
          <iframe
            key={documentSrcDoc}
            title="HTML widget"
            sandbox="allow-same-origin"
            srcDoc={documentSrcDoc}
            onLoad={() => {
              if (desiredSrcDocRef.current === documentSrcDoc) {
                setActiveSrcDoc(documentSrcDoc);
              }
            }}
            className="absolute inset-0 block border-0"
            style={{
              width: `${width}px`,
              height: `${height}px`,
              opacity: visible ? 1 : 0,
              visibility: visible ? "visible" : "hidden",
              pointerEvents: visible ? "auto" : "none",
            }}
            aria-hidden={!visible}
            data-subframe-ready={desired && loaded ? "true" : "false"}
            data-subframe-state={visible ? "visible" : "suppressed"}
            data-testid="iframe-html-widget"
          />
        );
      })}
    </>
  );
}