import { Check, Circle, ShieldCheck, Wallet } from "lucide-react";
import { useApp } from "../lib/app-context.tsx";
import { Button } from "./UI.tsx";
import { ChainAccount } from "./ChainAccount.tsx";

export function PracticeSetup({ onAccount }: { onAccount: () => void }) {
  const { state } = useApp();
  if (!state || state.chain?.account) return null;
  const steps = [
    { label: "Parent wallet", complete: Boolean(state.chain?.guardian) },
    { label: "Learner wallet", complete: Boolean(state.chain?.learner) },
    { label: "Portfolio activation", complete: false },
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
          <h2 id="practice-setup-heading">Set up your family portfolio</h2>
          <p>Connect a wallet for each family member to start practicing.</p>
        </div>
        <span className="practice-network">
          <ShieldCheck size={14} /> Sui Testnet
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
          <span>First, invite your learner to join the family.</span>
          <Button secondary onClick={onAccount}>
            Invite learner
          </Button>
        </div>
      )}
      <ChainAccount setup />
    </section>
  );
}
