import { Building2 } from "lucide-react";
import { useState } from "react";

const assets: Record<string, string> = {
  AAPL: "aapl.ico",
  MSFT: "msft.ico",
  NVDA: "nvda.ico",
  AMD: "amd.svg",
  ADBE: "adbe.ico",
  KO: "ko.png",
  JNJ: "jnj.png",
  XOM: "xom.png",
  WMT: "wmt.svg",
  DIS: "dis.png",
  SPY: "spy.svg",
  VTI: "vti.ico",
};

export function CompanyLogo({
  symbol,
  className = "",
}: {
  symbol: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <span
      className={`company-logo ${className} brand-${symbol.toLowerCase()}`}
      aria-hidden="true"
    >
      {assets[symbol] && !failed ? (
        <img
          src={`/brands/${assets[symbol]}`}
          alt=""
          width="40"
          height="40"
          onError={() => setFailed(true)}
        />
      ) : (
        <Building2 size={24} />
      )}
    </span>
  );
}
