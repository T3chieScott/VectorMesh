import { createContext, useContext, useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./use-auth";
import type { Client } from "@shared/schema";

interface SiteContextType {
  selectedClientId: string | null;
  setSelectedClientId: (clientId: string | null) => void;
  clients: Client[];
  selectedClient: Client | undefined;
  isLoading: boolean;
  hasSingleSite: boolean;
  buildQueryString: (params?: Record<string, string>) => string;
  getQueryKey: (base: string) => (string | null)[];
}

const SiteContext = createContext<SiteContextType | null>(null);

const STORAGE_KEY = "vectormesh_selected_client_id";

export function SiteProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [selectedClientId, setSelectedClientIdState] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  });

  const { data: clients = [], isLoading } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
    enabled: !!user,
  });

  const hasSingleSite = clients.length === 1;

  useEffect(() => {
    if (!isLoading && clients.length > 0) {
      if (hasSingleSite) {
        setSelectedClientIdState(clients[0].id);
        try {
          localStorage.setItem(STORAGE_KEY, clients[0].id);
        } catch {}
      } else if (selectedClientId && !clients.find(c => c.id === selectedClientId)) {
        setSelectedClientIdState(null);
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch {}
      }
    }
  }, [clients, isLoading, hasSingleSite]);

  const setSelectedClientId = (clientId: string | null) => {
    setSelectedClientIdState(clientId);
    try {
      if (clientId) {
        localStorage.setItem(STORAGE_KEY, clientId);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {}
  };

  const selectedClient = useMemo(
    () => clients.find(c => c.id === selectedClientId),
    [clients, selectedClientId]
  );

  const buildQueryString = (params?: Record<string, string>): string => {
    const searchParams = new URLSearchParams();
    if (selectedClientId) {
      searchParams.set("clientId", selectedClientId);
    }
    if (params) {
      Object.entries(params).forEach(([k, v]) => searchParams.set(k, v));
    }
    const qs = searchParams.toString();
    return qs ? `?${qs}` : "";
  };

  const getQueryKey = (base: string): (string | null)[] => {
    return [base, selectedClientId];
  };

  return (
    <SiteContext.Provider
      value={{
        selectedClientId,
        setSelectedClientId,
        clients,
        selectedClient,
        isLoading,
        hasSingleSite,
        buildQueryString,
        getQueryKey,
      }}
    >
      {children}
    </SiteContext.Provider>
  );
}

export function useSiteContext() {
  const context = useContext(SiteContext);
  if (!context) {
    throw new Error("useSiteContext must be used within a SiteProvider");
  }
  return context;
}

export function useExplicitClientFilteredQuery<T>(
  baseUrl: string,
  clientId: string | null | undefined,
  options?: { enabled?: boolean; extraParams?: Record<string, string> }
) {
  const params = new URLSearchParams();
  if (clientId) params.set("clientId", clientId);
  if (options?.extraParams) Object.entries(options.extraParams).forEach(([k, v]) => params.set(k, v));
  const qs = params.toString();
  const url = qs ? `${baseUrl}?${qs}` : baseUrl;

  return {
    queryKey: [baseUrl, clientId ?? null] as const,
    queryFn: async (): Promise<T> => {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
    enabled: options?.enabled,
  };
}

export function useOptionalSiteFilteredQuery<T>(baseUrl: string, extraParams?: Record<string, string>) {
  const ctx = useContext(SiteContext);
  const selectedClientId = ctx?.selectedClientId ?? null;
  const params = new URLSearchParams();
  if (selectedClientId) params.set("clientId", selectedClientId);
  if (extraParams) Object.entries(extraParams).forEach(([k, v]) => params.set(k, v));
  const qs = params.toString();
  const url = qs ? `${baseUrl}?${qs}` : baseUrl;

  return {
    queryKey: [baseUrl, selectedClientId] as const,
    queryFn: async (): Promise<T> => {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
  };
}

export function useSiteFilteredQuery<T>(baseUrl: string, extraParams?: Record<string, string>) {
  const { selectedClientId } = useSiteContext();
  const params = new URLSearchParams();
  if (selectedClientId) params.set("clientId", selectedClientId);
  if (extraParams) Object.entries(extraParams).forEach(([k, v]) => params.set(k, v));
  const qs = params.toString();
  const url = qs ? `${baseUrl}?${qs}` : baseUrl;

  return {
    queryKey: [baseUrl, selectedClientId] as const,
    queryFn: async (): Promise<T> => {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
  };
}
