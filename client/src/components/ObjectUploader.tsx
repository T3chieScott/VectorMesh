import { useState, useMemo, useRef, useEffect } from "react";
import type { ReactNode } from "react";
import Uppy from "@uppy/core";
import type { UploadResult } from "@uppy/core";
import DashboardModal from "@uppy/react/dashboard-modal";
import "@uppy/core/css/style.min.css";
import "@uppy/dashboard/css/style.min.css";
import XHRUpload from "@uppy/xhr-upload";
import { Button } from "@/components/ui/button";

interface ObjectUploaderProps {
  maxNumberOfFiles?: number;
  maxFileSize?: number;
  clientId: string;
  onComplete?: (
    result: UploadResult<Record<string, unknown>, Record<string, unknown>>
  ) => void;
  onError?: (error: Error) => void;
  buttonClassName?: string;
  buttonTestId?: string;
  children: ReactNode;
}

export function ObjectUploader({
  maxNumberOfFiles = 1,
  maxFileSize = 10485760,
  clientId,
  onComplete,
  onError,
  buttonClassName,
  buttonTestId,
  children,
}: ObjectUploaderProps) {
  const [showModal, setShowModal] = useState(false);
  const onCompleteRef = useRef(onComplete);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const [uppy] = useState(() =>
    new Uppy({
      restrictions: {
        maxNumberOfFiles,
        maxFileSize,
      },
      autoProceed: false,
      meta: { clientId },
    })
      .use(XHRUpload, {
        endpoint: "/api/uploads",
        fieldName: "file",
        formData: true,
        allowedMetaFields: ["clientId"],
        bundle: false,
        withCredentials: true,
      })
      .on("complete", (result) => {
        onCompleteRef.current?.(result);
      })
      .on("error", (error) => {
        onErrorRef.current?.(error);
      })
      .on("upload-error", (_file, error) => {
        onErrorRef.current?.(error);
      })
  );

  useMemo(() => {
    uppy.setMeta({ clientId });
  }, [clientId, uppy]);

  return (
    <div>
      <Button
        onClick={() => setShowModal(true)}
        className={buttonClassName}
        data-testid={buttonTestId}
      >
        {children}
      </Button>

      <DashboardModal
        uppy={uppy}
        open={showModal}
        onRequestClose={() => setShowModal(false)}
        proudlyDisplayPoweredByUppy={false}
      />
    </div>
  );
}
