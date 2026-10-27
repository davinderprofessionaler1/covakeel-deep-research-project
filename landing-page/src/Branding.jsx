import { createContext, useContext, useEffect, useMemo, useState } from "react";

const BrandingContext = createContext({ brandName: "CoVakeel", logoUrl: "", updatedAt: null });
const DEFAULT_LOGO_URL = "/assets/covakeel-logo-transparent.png";

export function BrandingProvider({ children }) {
  const [branding, setBranding] = useState({ brandName: "CoVakeel", logoUrl: "", updatedAt: null });
  useEffect(() => {
    fetch("/api/branding")
      .then((response) => response.ok ? response.json() : null)
      .then((result) => { if (result) setBranding(result); })
      .catch(() => {});
  }, []);
  const value = useMemo(() => branding, [branding]);
  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export function BrandMark({ compact = false }) {
  const branding = useContext(BrandingContext);
  const logoUrl = branding.logoUrl
    ? `${branding.logoUrl}?v=${encodeURIComponent(branding.updatedAt || "current")}`
    : DEFAULT_LOGO_URL;
  return (
    <span className={`shared-brand ${compact ? "compact" : ""}`}>
      <img src={logoUrl} alt={branding.brandName || "CoVakeel"} />
    </span>
  );
}
