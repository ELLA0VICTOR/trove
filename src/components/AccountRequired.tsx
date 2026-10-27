import { ArrowRight } from "lucide-react";
import { Sapling } from "./Brand.tsx";
import { Button } from "./UI.tsx";

export function AccountRequired({
  title,
  description,
  onSignIn,
  onCreate,
  onLearnMore,
  compact = false,
}: {
  title: string;
  description: string;
  onSignIn: () => void;
  onCreate?: () => void;
  onLearnMore?: () => void;
  compact?: boolean;
}) {
  const Heading = compact ? "h2" : "h1";
  return (
    <section
      className={`portfolio-welcome ${compact ? "account-required-compact" : ""}`}
      aria-label={title}
    >
      <div className="portfolio-welcome-content">
        <Sapling className="portfolio-welcome-mark" />
        <Heading>{title}</Heading>
        <p>{description}</p>
        <div className="portfolio-welcome-actions">
          {onCreate && (
            <Button onClick={onCreate}>
              Create a family account{" "}
              <ArrowRight size={17} aria-hidden="true" />
            </Button>
          )}
          <Button secondary={!!onCreate} onClick={onSignIn}>
            {onCreate ? "Sign in" : "Open account"}
          </Button>
        </div>
        {onLearnMore && (
          <button
            className="text-link portfolio-welcome-help"
            type="button"
            aria-haspopup="dialog"
            onClick={onLearnMore}
          >
            What this does <ArrowRight size={14} aria-hidden="true" />
          </button>
        )}
      </div>
    </section>
  );
}
