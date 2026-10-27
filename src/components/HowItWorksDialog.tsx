import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ChartNoAxesCombined,
  ShieldCheck,
  Sprout,
} from "lucide-react";
import { Button, Modal } from "./UI.tsx";

const steps = [
  {
    title: "Practice investing as a family.",
    description:
      "Trove helps families learn how to invest. Create a family account and invite a learner to start practicing together.",
    icon: Sprout,
  },
  {
    title: "Make your first move.",
    description:
      "Explore companies and funds, follow market prices, and invest practice money. See how your choices change your portfolio over time.",
    icon: ChartNoAxesCombined,
  },
  {
    title: "Set the boundaries together.",
    description:
      "Parents set spending limits, review requests, and pause practice. Learners make their own choices within those limits and ask for approval when they need more room.",
    icon: ShieldCheck,
  },
  {
    title: "Learn from every choice.",
    description:
      "Save why you invested, revisit your decisions, and ask Trove questions. With remembering enabled, Trove uses your earlier thoughts to help you understand your next choice.",
    icon: BookOpen,
  },
];

export function HowItWorksDialog({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const { title, description, icon: Icon } = steps[step];
  const last = step === steps.length - 1;
  return (
    <Modal
      title="WHAT THIS DOES"
      className="how-it-works-modal"
      onClose={onClose}
    >
      <div
        className="how-it-works-content"
        aria-live="polite"
        aria-atomic="true"
      >
        <Icon
          className="how-it-works-icon"
          size={36}
          strokeWidth={1.5}
          aria-hidden="true"
        />
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <div
        className="how-it-works-progress"
        aria-label={`Step ${step + 1} of ${steps.length}`}
      >
        {steps.map((item, index) => (
          <span
            key={item.title}
            className={step === index ? "active" : ""}
            aria-hidden="true"
          />
        ))}
        <span className="how-it-works-count" aria-hidden="true">
          {step + 1} / {steps.length}
        </span>
      </div>
      <div className="how-it-works-actions">
        <Button
          secondary
          disabled={step === 0}
          onClick={() => setStep(step - 1)}
        >
          <ArrowLeft size={16} aria-hidden="true" /> Back
        </Button>
        <Button onClick={last ? onClose : () => setStep(step + 1)}>
          {last ? "Got it" : "Next"} <ArrowRight size={16} aria-hidden="true" />
        </Button>
      </div>
    </Modal>
  );
}
