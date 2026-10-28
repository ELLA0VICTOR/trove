import { Check, Circle, ShieldCheck, Wallet } from "lucide-react";
import { useApp } from "../lib/app-context.tsx";
import { Button } from "./UI.tsx";
import { ChainAccount } from "./ChainAccount.tsx";
import { networkLabel } from "../../shared/network.ts";

export function PracticeSetup({ onAccount }: { onAccount: () => void }) {
  const { state } = useApp();
  if (!state || (state.chain?.account && state.chain.learnerBound !== false))
    return null;
  const steps = [
    { label: "Parent wallet", complete: Boolean(state.chain?.guardian) },
    { label: "Portfolio activation", complete: Boolean(state.chain?.account) },
    {
      label: "Learner wallet",
      complete: Boolean(
        state.chain?.account ? state.chain.learnerBound : state.chain?.learner,
      ),
    },
  ];
  return (
    <section
      className="practice-setup"
      id="practice-setup"
      aria-labelledby="practice-setup-heading"
    >
      <header>
        <span className="practice-setup-icon">
          <Wallet size={23} />
        </span>
        <div>
          <h2 id="practice-setup-heading">
            {state.chain?.account
              ? "Your portfolio is active"
              : "Set up your family portfolio"}
          </h2>
          <p>
            {state.chain?.account
              ? "The learner can connect their own wallet when ready to trade."
              : "The parent activates the portfolio. The learner connects when ready to trade."}
          </p>
        </div>
        <span className="practice-network">
          <ShieldCheck size={14} /> {networkLabel(state.chain?.network)}
        </span>
      </header>
      <ol className="practice-setup-steps" aria-label="Setup progress">
        {steps.map((step) => (
          <li key={step.label} className={step.complete ? "complete" : ""}>
            {step.complete ? <Check size={17} /> : <Circle size={15} />}
            {step.label}
          </li>
        ))}
      </ol>
      {state.role === "parent" && state.learner === "Your learner" && (
        <div className="practice-setup-invite">
          <span>Invite your learner whenever you’re ready.</span>
          <Button secondary onClick={onAccount}>
            Invite learner
          </Button>
        </div>
      )}
      <ChainAccount setup />
    </section>
  );
}
